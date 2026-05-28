const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const pathModule = require("node:path");
const { connectLambda, getStore } = require("@netlify/blobs");

const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const imageUploadMaxBytes = Number(process.env.IMAGE_UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const dataStoreName = process.env.NETLIFY_BLOBS_DATA_STORE || "dexhost-data";
const assetStoreName = process.env.NETLIFY_BLOBS_ASSET_STORE || "dexhost-assets";
const appDomain = process.env.DEXHOST_PRIMARY_DOMAIN || "dexhost.de";
const subdomainSuffix = process.env.DEXHOST_SUBDOMAIN_SUFFIX || appDomain;
const sessionCookieName = "dexhost_identity";
const refreshCookieName = "dexhost_identity_refresh";
const csrfCookieName = "dexhost_csrf";
const csrfHeaderName = "x-dexhost-csrf";
const paidPlans = new Set(["basic", "business", "pro", "admin"]);
const editablePlans = new Set(["free", "basic", "business", "pro", "admin"]);
const billingPlans = {
  basic: { name: "Basic", value: "9.00", currency: "EUR" },
  business: { name: "Business", value: "19.00", currency: "EUR" },
  pro: { name: "Pro", value: "49.00", currency: "EUR" }
};
const launchServices = {
  "launch-help": { id: "launch-help", name: "Launch-Hilfe", value: "49.00", currency: "EUR" },
  "setup-service": { id: "setup-service", name: "Setup-Service", value: "149.00", currency: "EUR" },
  "premium-setup": { id: "premium-setup", name: "Premium-Setup", value: "349.00", currency: "EUR" }
};
const subscriptionPlanIds = {
  basic: process.env.PAYPAL_BASIC_SUBSCRIPTION_PLAN_ID || "P-75N62518ED122145SNILXN2Y",
  business: process.env.PAYPAL_BUSINESS_SUBSCRIPTION_PLAN_ID || "P-78459601WB512822ENILXPCQ",
  pro: process.env.PAYPAL_PRO_SUBSCRIPTION_PLAN_ID || "P-37230392XM0019717NILXOXA"
};
const paypalWebhookId = process.env.PAYPAL_WEBHOOK_ID || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "DexHost <onboarding@resend.dev>";
const resendReplyTo = process.env.RESEND_REPLY_TO || "";

function json(statusCode, body, cookies = []) {
  const response = {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store"
    },
    body: JSON.stringify(body)
  };
  if (cookies.length) response.multiValueHeaders = { "Set-Cookie": cookies };
  return response;
}

function binary(statusCode, buffer, contentType, cache = "private, no-store") {
  return {
    statusCode,
    headers: { "Content-Type": contentType, "Cache-Control": cache },
    isBase64Encoded: true,
    body: Buffer.from(buffer).toString("base64")
  };
}

function routePath(event) {
  const raw = event.rawUrl || `https://dexhost.local${event.path}`;
  const pathname = new URL(raw).pathname;
  if (pathname.startsWith("/.netlify/functions/dexhost-api")) {
    const suffix = pathname.replace("/.netlify/functions/dexhost-api", "") || "/";
    return suffix.startsWith("/api/") ? suffix : `/api${suffix}`;
  }
  return pathname;
}

function originFor(event) {
  const proto = event.headers["x-forwarded-proto"] || event.headers["X-Forwarded-Proto"] || "https";
  const host = event.headers.host || event.headers.Host || process.env.URL || "localhost:8888";
  return host.startsWith("http") ? host.replace(/\/$/, "") : `${proto}://${host}`;
}

function appOriginFor(event) {
  return clean(process.env.DEXHOST_APP_URL || process.env.URL || originFor(event)).replace(/\/$/, "");
}

function bodyJson(event) {
  if (!event.body) return {};
  return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
}

function clean(value = "") {
  return String(value || "").trim();
}

function slugify(value = "kunde") {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "kunde";
}

function now() {
  return new Date().toISOString();
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function secureCookie(event) {
  const proto = event.headers["x-forwarded-proto"] || event.headers["X-Forwarded-Proto"] || "";
  return proto === "https" || process.env.NODE_ENV === "production" || process.env.NETLIFY === "true";
}

function serializeCookie(name, value, event, maxAgeSeconds) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (secureCookie(event)) parts.push("Secure");
  return parts.join("; ");
}

function serializeReadableCookie(name, value, event, maxAgeSeconds) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (secureCookie(event)) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name, event) {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secureCookie(event)) parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(event) {
  const header = event.headers.cookie || event.headers.Cookie || "";
  return Object.fromEntries(header.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
  }));
}

function sessionCookies(event, session) {
  const expiresIn = Number(session.expires_in || 3600);
  const cookies = [serializeCookie(sessionCookieName, session.access_token || session.token, event, expiresIn)];
  if (session.refresh_token) cookies.push(serializeCookie(refreshCookieName, session.refresh_token, event, 60 * 60 * 24 * 30));
  return cookies;
}

function csrfToken(event) {
  return parseCookies(event)[csrfCookieName] || crypto.randomBytes(24).toString("base64url");
}

function csrfCookie(event, value = csrfToken(event)) {
  return serializeReadableCookie(csrfCookieName, value, event, 60 * 60 * 24);
}

function assertCsrf(event) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(event.httpMethod)) return;
  const authHeader = clean(event.headers.authorization || event.headers.Authorization);
  const cookies = parseCookies(event);
  if (authHeader.startsWith("Bearer ") && !cookies[sessionCookieName]) return;
  const headerValue = clean(event.headers[csrfHeaderName] || event.headers["X-DexHost-CSRF"]);
  if (!cookies[csrfCookieName] || !headerValue || headerValue !== cookies[csrfCookieName]) {
    const error = new Error("CSRF validation failed.");
    error.statusCode = 403;
    throw error;
  }
}

function userIdFrom(user) {
  return user.id || user.sub || user.user_id;
}

function userEmailFrom(user) {
  return user.email || user.user_metadata?.email || "";
}

function identityRoles(user) {
  const roles = user.app_metadata?.roles || user.app_metadata?.authorization?.roles || user.roles || [];
  return Array.isArray(roles) ? roles.map(String) : [];
}

function identityPlan(user) {
  const plan = clean(user.app_metadata?.plan || user.user_metadata?.plan).toLowerCase();
  if (editablePlans.has(plan)) return plan;
  return identityRoles(user).includes("admin") ? "admin" : "free";
}

function identityAccountStatus(user) {
  if (user.banned_until) return "suspended";
  if (user.confirmed_at || user.email_confirmed_at || user.confirmation_sent_at === null) return "active";
  return "pending_verification";
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function authUserOut(row) {
  return {
    id: row.id,
    email: row.email,
    user_metadata: row.user_metadata || {},
    app_metadata: row.app_metadata || { plan: "free", roles: [] },
    created_at: row.created_at,
    last_login_at: row.last_login_at || "",
    confirmed_at: row.confirmed_at || "",
    email_confirmed_at: row.email_confirmed_at || row.confirmed_at || "",
    account_status: row.account_status || "active"
  };
}

function passwordHash(password) {
  const salt = crypto.randomBytes(18).toString("base64url");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash = "") {
  const [scheme, salt, expected] = String(storedHash).split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, "base64url");
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function mailConfigured() {
  return Boolean(resendApiKey);
}

function authToken() {
  return crypto.randomBytes(36).toString("base64url");
}

async function createAuthToken(userId, type, ttlMinutes = 60) {
  const token = authToken();
  const timestamp = now();
  await blobSetJson(`auth/tokens/${type}/${stableHash(token)}.json`, {
    user_id: userId,
    type,
    created_at: timestamp,
    expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
    used_at: ""
  });
  return token;
}

async function consumeAuthToken(type, token) {
  const key = `auth/tokens/${type}/${stableHash(token)}.json`;
  const row = await blobGetJson(key);
  if (!row?.user_id || row.type !== type || row.used_at || !row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
    const error = new Error("Dieser Link ist ungültig oder abgelaufen.");
    error.statusCode = 400;
    throw error;
  }
  await blobSetJson(key, { ...row, used_at: now() });
  return row;
}

async function sendResendEmail({ to, subject, html, text }) {
  if (!mailConfigured()) return { skipped: true };
  const payload = { from: resendFromEmail, to: [to], subject, html, text };
  if (resendReplyTo) payload.reply_to = resendReplyTo;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Resend konnte die E-Mail nicht senden.");
    error.statusCode = 502;
    throw error;
  }
  return data;
}

function emailLayout({ title, intro, buttonLabel, buttonUrl, note }) {
  const escapedUrl = buttonUrl.replace(/"/g, "&quot;");
  return {
    text: `${title}\n\n${intro}\n\n${buttonLabel}: ${buttonUrl}\n\n${note || "Falls du diese E-Mail nicht angefordert hast, kannst du sie ignorieren."}`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;background:#f7f9f7;padding:28px;color:#151c1b">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe6e3;border-radius:14px;padding:28px">
          <strong style="display:block;margin-bottom:18px;color:#24796f">DexHost</strong>
          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1">${title}</h1>
          <p style="margin:0 0 22px;line-height:1.6;color:#52605e">${intro}</p>
          <a href="${escapedUrl}" style="display:inline-block;background:#151c1b;color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:700">${buttonLabel}</a>
          <p style="margin:24px 0 0;line-height:1.55;color:#697574;font-size:13px">${note || "Falls du diese E-Mail nicht angefordert hast, kannst du sie ignorieren."}</p>
        </div>
      </div>`
  };
}

async function sendVerificationEmail(event, user) {
  const token = await createAuthToken(user.id, "verify-email", 60 * 24);
  const buttonUrl = `${appOriginFor(event)}/verify-email?token=${encodeURIComponent(token)}`;
  const mail = emailLayout({
    title: "Bitte bestätige deine E-Mail-Adresse",
    intro: "Damit dein DexHost-Konto geschützt ist, bestätige bitte diese E-Mail-Adresse.",
    buttonLabel: "E-Mail bestätigen",
    buttonUrl,
    note: "Der Link ist 24 Stunden gültig."
  });
  return sendResendEmail({ to: user.email, subject: "DexHost E-Mail bestätigen", ...mail });
}

async function sendPasswordResetEmail(event, user) {
  const token = await createAuthToken(user.id, "password-reset", 60);
  const buttonUrl = `${appOriginFor(event)}/reset-password?token=${encodeURIComponent(token)}`;
  const mail = emailLayout({
    title: "Passwort zurücksetzen",
    intro: "Über diesen sicheren Link kannst du ein neues DexHost-Passwort setzen.",
    buttonLabel: "Passwort neu setzen",
    buttonUrl,
    note: "Der Link ist 60 Minuten gültig."
  });
  return sendResendEmail({ to: user.email, subject: "DexHost Passwort zurücksetzen", ...mail });
}

async function userByEmail(email) {
  const lookup = await blobGetJson(`auth/email/${stableHash(email)}.json`);
  if (!lookup?.user_id) return null;
  return blobGetJson(`auth/users/${lookup.user_id}.json`);
}

async function createPasswordUser(email, password, displayName) {
  const existing = await userByEmail(email);
  if (existing) {
    const error = new Error("Ein Account mit dieser E-Mail existiert bereits.");
    error.statusCode = 409;
    throw error;
  }
  const timestamp = now();
  const requiresVerification = mailConfigured();
  const row = {
    id: crypto.randomUUID(),
    email,
    password_hash: passwordHash(password),
    user_metadata: { display_name: displayName, full_name: displayName, email },
    app_metadata: { plan: "free", roles: [] },
    account_status: requiresVerification ? "pending_verification" : "active",
    created_at: timestamp,
    updated_at: timestamp,
    confirmed_at: requiresVerification ? "" : timestamp,
    email_confirmed_at: requiresVerification ? "" : timestamp,
    last_login_at: timestamp
  };
  await blobSetJson(`auth/users/${row.id}.json`, row);
  await blobSetJson(`auth/email/${stableHash(email)}.json`, { user_id: row.id, email, created_at: timestamp });
  return authUserOut(row);
}

async function authenticatePasswordUser(email, password) {
  const row = await userByEmail(email);
  if (!row || row.account_status === "suspended" || !verifyPassword(password, row.password_hash)) {
    const error = new Error("E-Mail oder Passwort ist ungültig.");
    error.statusCode = 401;
    throw error;
  }
  if (row.account_status === "pending_verification") {
    const error = new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
    error.statusCode = 403;
    throw error;
  }
  const next = { ...row, last_login_at: now(), updated_at: now() };
  await blobSetJson(`auth/users/${row.id}.json`, next);
  return authUserOut(next);
}

async function verifyEmailToken(token) {
  const tokenRow = await consumeAuthToken("verify-email", token);
  const row = await blobGetJson(`auth/users/${tokenRow.user_id}.json`);
  if (!row) {
    const error = new Error("Account nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }
  const timestamp = now();
  const next = { ...row, account_status: "active", confirmed_at: row.confirmed_at || timestamp, email_confirmed_at: row.email_confirmed_at || timestamp, updated_at: timestamp };
  await blobSetJson(`auth/users/${row.id}.json`, next);
  const profile = await blobGetJson(`profiles/${row.id}.json`);
  if (profile) await blobSetJson(`profiles/${row.id}.json`, { ...profile, account_status: "active", updated_at: timestamp });
  return authUserOut(next);
}

async function resetPasswordWithToken(token, password) {
  if (String(password || "").length < 8) {
    const error = new Error("Das neue Passwort muss mindestens 8 Zeichen lang sein.");
    error.statusCode = 400;
    throw error;
  }
  const tokenRow = await consumeAuthToken("password-reset", token);
  const row = await blobGetJson(`auth/users/${tokenRow.user_id}.json`);
  if (!row) {
    const error = new Error("Account nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }
  const timestamp = now();
  await blobSetJson(`auth/users/${row.id}.json`, { ...row, password_hash: passwordHash(password), updated_at: timestamp });
  return true;
}

async function createSession(userId) {
  const token = crypto.randomBytes(36).toString("base64url");
  const expiresIn = 60 * 60 * 24 * 14;
  const timestamp = now();
  await blobSetJson(`auth/sessions/${stableHash(token)}.json`, {
    user_id: userId,
    created_at: timestamp,
    last_seen_at: timestamp,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
  });
  return { access_token: token, expires_in: expiresIn };
}

async function userFromSessionToken(token) {
  const session = await blobGetJson(`auth/sessions/${stableHash(token)}.json`);
  if (!session?.user_id || !session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }
  const row = await blobGetJson(`auth/users/${session.user_id}.json`);
  if (!row) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }
  await blobSetJson(`auth/sessions/${stableHash(token)}.json`, { ...session, last_seen_at: now() });
  return authUserOut(row);
}

async function requireUser(event, context) {
  const cookies = parseCookies(event);
  const bearer = clean(event.headers.authorization || event.headers.Authorization).replace(/^Bearer\s+/i, "");
  const accessToken = bearer || cookies[sessionCookieName];

  if (context?.clientContext?.user && bearer) {
    return { user: context.clientContext.user, userId: userIdFrom(context.clientContext.user), token: bearer, cookies: [] };
  }

  if (!accessToken) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const user = await userFromSessionToken(accessToken);
  return { user, userId: userIdFrom(user), token: accessToken, cookies: [] };
}

function normalizedWebsite(value) {
  const input = clean(value).toLowerCase();
  if (!input) return "";
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname.includes(".") || parsed.hostname.length > 253) throw new Error("invalid");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    const error = new Error("Bitte gib eine gueltige Website oder Domain an.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizedPhone(value) {
  const phone = clean(value);
  if (!phone) return "";
  if (!/^\+?[0-9 ()/.-]{6,32}$/.test(phone)) {
    const error = new Error("Bitte gib eine gueltige Telefonnummer an.");
    error.statusCode = 400;
    throw error;
  }
  return phone;
}

function normalizedVatId(value) {
  const vatId = clean(value).toUpperCase();
  if (!vatId) return "";
  if (!/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vatId)) {
    const error = new Error("Bitte gib eine gueltige Umsatzsteuer-ID an, zum Beispiel DE123456789.");
    error.statusCode = 400;
    throw error;
  }
  return vatId;
}

function normalizedCountry(value) {
  const country = clean(value);
  if (!country) return "";
  if (!/^[A-Za-z][A-Za-z .'-]{1,55}$/.test(country)) {
    const error = new Error("Bitte gib ein gueltiges Land an.");
    error.statusCode = 400;
    throw error;
  }
  return country;
}

function normalizedLanguage(value) {
  const language = clean(value || "de").toLowerCase();
  if (!["de", "en", "fr", "es", "it", "nl"].includes(language)) {
    const error = new Error("Bitte waehle eine gueltige Sprache.");
    error.statusCode = 400;
    throw error;
  }
  return language;
}

function normalizedBrandingColors(value = {}) {
  const colors = value && typeof value === "object" ? value : {};
  const fallback = { primary: "#24796f", secondary: "#151c1b", accent: "#8fd3cc" };
  const next = {
    primary: clean(colors.primary || fallback.primary),
    secondary: clean(colors.secondary || fallback.secondary),
    accent: clean(colors.accent || fallback.accent)
  };
  for (const [key, color] of Object.entries(next)) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      const error = new Error(`Bitte gib eine gueltige Branding-Farbe fuer ${key} an.`);
      error.statusCode = 400;
      throw error;
    }
  }
  return next;
}

function profileOut(profile, user) {
  return {
    id: profile.id,
    email: profile.email || userEmailFrom(user),
    display_name: profile.display_name || user.user_metadata?.display_name || userEmailFrom(user),
    first_name: profile.first_name || "",
    last_name: profile.last_name || "",
    company_name: profile.company_name || "",
    industry: profile.industry || "",
    address: profile.address || "",
    country: profile.country || "",
    phone: profile.phone || "",
    website_domain: profile.website_domain || "",
    billing_address: profile.billing_address || "",
    vat_id: profile.vat_id || "",
    preferred_language: profile.preferred_language || "de",
    branding_colors: normalizedBrandingColors(profile.branding_colors),
    logo_url: profile.logo_url || "",
    avatar_url: profile.avatar_url || "",
    plan: profile.plan || "free",
    account_status: profile.account_status || identityAccountStatus(user),
    billing_provider: profile.billing_provider || "",
    billing_status: profile.billing_status || "",
    billing_reference: profile.billing_reference || "",
    paypal_subscription_id: profile.paypal_subscription_id || "",
    subscription_status: profile.subscription_status || profile.billing_status || "",
    subscription_current_period_end: profile.subscription_current_period_end || "",
    subscription_cancelled_at: profile.subscription_cancelled_at || "",
    subscription_last_event: profile.subscription_last_event || "",
    premium_access_active: hasActivePaidEntitlement(profile),
    created_at: profile.created_at,
    updated_at: profile.updated_at || profile.created_at,
    last_login_at: profile.last_login_at || user.last_login_at || user.last_sign_in_at || ""
  };
}

function hasActivePaidEntitlement(profile = {}) {
  const plan = profile.plan || "free";
  if (plan === "admin") return true;
  if (!paidPlans.has(plan)) return false;
  const status = clean(profile.billing_status || profile.subscription_status || (plan === "free" ? "" : "active")).toLowerCase();
  if (["active", "approved"].includes(status)) return true;
  if (status === "cancelled" && profile.subscription_current_period_end) {
    return new Date(profile.subscription_current_period_end).getTime() > Date.now();
  }
  return false;
}

function shouldDowngradeExpiredBilling(profile = {}) {
  const status = clean(profile.billing_status || profile.subscription_status).toLowerCase();
  return status === "cancelled" && profile.subscription_current_period_end && new Date(profile.subscription_current_period_end).getTime() <= Date.now();
}

function localPath(storeName, key, extension) {
  const safeKey = Buffer.from(key).toString("base64url");
  return pathModule.join(process.cwd(), ".netlify-state", storeName, `${safeKey}.${extension}`);
}

async function withStore(storeName, action, fallback) {
  try {
    const siteID = clean(process.env.NETLIFY_SITE_ID || process.env.SITE_ID);
    const token = clean(process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN);
    try {
      return await action(getStore(storeName));
    } catch (environmentError) {
      if (!siteID || !token) throw environmentError;
      return await action(getStore({ name: storeName, siteID, token }));
    }
  } catch (error) {
    const isHostedFunction = process.env.NETLIFY === "true" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT || process.env.DEPLOY_ID || process.env.CONTEXT);
    if (isHostedFunction) {
      const message = String(error?.message || error);
      const nextError = new Error(`Netlify Blobs ist nicht erreichbar. Prüfe in der DexHost-Site die Environment Variables NETLIFY_SITE_ID und NETLIFY_API_TOKEN und deploye erneut. Details: ${message}`);
      nextError.statusCode = 503;
      throw nextError;
    }
    return fallback();
  }
}

async function connectBlobs(event) {
  try {
    if (typeof connectLambda === "function") connectLambda(event);
  } catch {
    // Explicit NETLIFY_SITE_ID + NETLIFY_API_TOKEN still works without lambda context.
  }
}

async function blobGetJson(key) {
  return withStore(dataStoreName, (store) => store.get(key, { type: "json" }), async () => {
    try {
      return JSON.parse(await fs.readFile(localPath(dataStoreName, key, "json"), "utf8"));
    } catch {
      return null;
    }
  });
}

async function blobSetJson(key, value) {
  return withStore(dataStoreName, (store) => store.setJSON(key, value), async () => {
    const file = localPath(dataStoreName, key, "json");
    await fs.mkdir(pathModule.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, null, 2));
    return value;
  });
}

async function blobDeleteJson(key) {
  return withStore(dataStoreName, (store) => store.delete(key), async () => {
    await fs.rm(localPath(dataStoreName, key, "json"), { force: true });
  });
}

async function blobSetBinary(key, buffer, metadata) {
  return withStore(assetStoreName, (store) => store.set(key, buffer, { metadata, contentType: metadata.content_type }), async () => {
    const file = localPath(assetStoreName, key, "bin");
    await fs.mkdir(pathModule.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
  });
}

async function blobGetBinary(key) {
  return withStore(assetStoreName, async (store) => {
    const value = await store.get(key, { type: "arrayBuffer" });
    return value ? Buffer.from(value) : null;
  }, async () => {
    try {
      return await fs.readFile(localPath(assetStoreName, key, "bin"));
    } catch {
      return null;
    }
  });
}

async function ensureProfile(auth, options = {}) {
  const key = `profiles/${auth.userId}.json`;
  const existing = await blobGetJson(key);
  const identityDerivedPlan = identityPlan(auth.user);
  const identityDerivedRoles = identityRoles(auth.user);
  const existingPlan = editablePlans.has(existing?.plan) ? existing.plan : identityDerivedPlan;
  const billingStatus = clean(existing?.billing_status || existing?.subscription_status || "").toLowerCase();
  const profile = {
    id: auth.userId,
    email: userEmailFrom(auth.user),
    display_name: clean(existing?.display_name || auth.user.user_metadata?.display_name || auth.user.user_metadata?.full_name || userEmailFrom(auth.user)),
    first_name: clean(existing?.first_name || auth.user.user_metadata?.first_name || ""),
    last_name: clean(existing?.last_name || auth.user.user_metadata?.last_name || ""),
    company_name: clean(existing?.company_name || auth.user.user_metadata?.company_name || ""),
    industry: clean(existing?.industry || ""),
    address: clean(existing?.address || ""),
    country: clean(existing?.country || ""),
    phone: clean(existing?.phone || ""),
    website_domain: clean(existing?.website_domain || ""),
    billing_address: clean(existing?.billing_address || ""),
    vat_id: clean(existing?.vat_id || ""),
    preferred_language: normalizedLanguage(existing?.preferred_language || "de"),
    branding_colors: normalizedBrandingColors(existing?.branding_colors),
    logo_url: clean(existing?.logo_url || ""),
    avatar_url: clean(existing?.avatar_url || ""),
    plan: existingPlan,
    roles: Array.isArray(existing?.roles) && existing.roles.length ? existing.roles : identityDerivedRoles,
    stripe_customer_id: existing?.stripe_customer_id || null,
    billing_provider: existing?.billing_provider || "",
    billing_status: billingStatus,
    billing_reference: existing?.billing_reference || "",
    paypal_subscription_id: existing?.paypal_subscription_id || "",
    subscription_status: existing?.subscription_status || billingStatus,
    subscription_current_period_end: existing?.subscription_current_period_end || "",
    subscription_cancelled_at: existing?.subscription_cancelled_at || "",
    subscription_last_event: existing?.subscription_last_event || "",
    account_status: existing?.account_status || identityAccountStatus(auth.user),
    created_at: existing?.created_at || auth.user.created_at || now(),
    updated_at: now(),
    last_login_at: options.touchLastLogin ? now() : (existing?.last_login_at || auth.user.last_login_at || auth.user.last_sign_in_at || "")
  };
  if (identityDerivedPlan === "admin") profile.plan = "admin";
  if (shouldDowngradeExpiredBilling(profile)) {
    profile.plan = "free";
    profile.billing_status = "expired";
    profile.subscription_status = "expired";
  }
  await blobSetJson(key, profile);
  return profile;
}

async function updateProfile(auth, values) {
  const profile = await ensureProfile(auth);
  const displayName = clean(values.display_name);
  if (!displayName || displayName.length < 2) {
    const error = new Error("Anzeigename ist ein Pflichtfeld.");
    error.statusCode = 400;
    throw error;
  }
  const firstName = clean(values.first_name);
  const lastName = clean(values.last_name);
  if (firstName.length > 80 || lastName.length > 80 || displayName.length > 120) {
    const error = new Error("Name oder Anzeigename ist zu lang.");
    error.statusCode = 400;
    throw error;
  }
  const next = {
    ...profile,
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    company_name: clean(values.company_name).slice(0, 160),
    industry: clean(values.industry).slice(0, 120),
    phone: normalizedPhone(values.phone),
    address: clean(values.address).slice(0, 500),
    country: normalizedCountry(values.country),
    website_domain: normalizedWebsite(values.website_domain),
    billing_address: clean(values.billing_address).slice(0, 700),
    vat_id: normalizedVatId(values.vat_id),
    preferred_language: normalizedLanguage(values.preferred_language),
    branding_colors: normalizedBrandingColors(values.branding_colors),
    email: profile.email,
    plan: profile.plan,
    stripe_customer_id: profile.stripe_customer_id,
    billing_provider: profile.billing_provider,
    billing_status: profile.billing_status,
    billing_reference: profile.billing_reference,
    paypal_subscription_id: profile.paypal_subscription_id,
    subscription_status: profile.subscription_status,
    subscription_current_period_end: profile.subscription_current_period_end,
    subscription_cancelled_at: profile.subscription_cancelled_at,
    subscription_last_event: profile.subscription_last_event,
    roles: profile.roles,
    updated_at: now()
  };
  await blobSetJson(`profiles/${auth.userId}.json`, next);
  return next;
}

async function setProfilePlan(auth, plan, billing = {}) {
  if (!editablePlans.has(plan) || plan === "admin") {
    const error = new Error("Ungültiger Tarif.");
    error.statusCode = 400;
    throw error;
  }
  const profile = await ensureProfile(auth);
  const next = {
    ...profile,
    plan,
    billing_provider: billing.provider || "paypal",
    billing_status: billing.status || "active",
    billing_reference: billing.reference || "",
    paypal_subscription_id: billing.subscriptionId || (billing.provider === "paypal-subscription" ? billing.reference : profile.paypal_subscription_id || ""),
    subscription_status: billing.subscriptionStatus || billing.status || profile.subscription_status || "",
    subscription_current_period_end: billing.currentPeriodEnd || profile.subscription_current_period_end || "",
    subscription_cancelled_at: billing.cancelledAt || profile.subscription_cancelled_at || "",
    subscription_last_event: billing.lastEvent || profile.subscription_last_event || "",
    updated_at: now()
  };
  await blobSetJson(`profiles/${auth.userId}.json`, next);
  return next;
}

const sectionTypes = ["hero", "about", "services", "pricing", "gallery", "testimonials", "faq", "contact", "team", "process", "beforeAfter", "cta", "footer"];
const variants = {
  hero: ["editorial-split", "cinematic", "center-stage", "product-panel"],
  about: ["founder-story", "mission-grid", "timeline", "profile"],
  services: ["premium-cards", "service-rows", "feature-band", "capability-matrix"],
  pricing: ["tiers", "highlight", "comparison", "simple"],
  gallery: ["editorial-grid", "spotlight", "strip", "masonry"],
  testimonials: ["quote-cards", "featured-story", "quote-wall", "proof-band"],
  faq: ["accordion", "columns", "boxed", "support-led"],
  contact: ["split-form", "compact", "office", "consultation"],
  team: ["portraits", "expertise", "leadership"],
  process: ["steps", "timeline", "lab"],
  beforeAfter: ["split-proof", "comparison-cards", "storyline"],
  cta: ["banner", "editorial", "minimal"],
  footer: ["simple", "columns", "brand-heavy"]
};

function defaultBrief(brief = {}) {
  return {
    industry: clean(brief.industry) || "professionelle Dienstleistung",
    companyName: clean(brief.companyName) || "DexHost Kunde",
    location: clean(brief.location) || "Berlin",
    audience: clean(brief.audience) || "anspruchsvolle Kunden",
    style: clean(brief.style) || "modern, hochwertig, vertrauenswuerdig",
    colorPreference: clean(brief.colorPreference) || "ruhige Premium-Farben",
    hasOwnImages: brief.hasOwnImages === "yes" ? "yes" : "no",
    pages: clean(brief.pages) || "Startseite, Leistungen, Kontakt"
  };
}

function contentFor(type, brief) {
  const b = defaultBrief(brief);
  const map = {
    hero: { headline: `${b.companyName} zeigt ${b.industry} klar, hochwertig und direkt anfragbar.`, body: `Ein professioneller Auftritt fuer ${b.audience} in ${b.location}. DexHost erzeugt die Struktur, Sie behalten die Kontrolle.`, primaryCta: "Beratung anfragen", secondaryCta: "Leistungen ansehen" },
    about: { heading: `Warum ${b.companyName}`, body: "Zeigen Sie Haltung, Erfahrung und Arbeitsweise in einer Geschichte, die Vertrauen schafft.", stats: "Klare Positionierung\nSchnelle Abstimmung\nPremium Eindruck" },
    services: { heading: "Leistungen mit Struktur", intro: "Besucher verstehen sofort, was Sie anbieten und welcher naechste Schritt sinnvoll ist.", items: "Beratung und Strategie\nUmsetzung und Betreuung\nContent und SEO\nLaunch und Optimierung" },
    pricing: { heading: "Pakete fuer klare Entscheidungen", intro: "Transparente Optionen helfen beim Vergleich.", plans: "Start | 499 EUR | Struktur, Basisseiten, Launch\nGrowth | 1290 EUR | Designsystem, SEO, Bilder\nPremium | 2490 EUR | Individuelle Website, Assets, Feinschliff" },
    gallery: { heading: "Bildsprache, die zur Firma passt", intro: "Eigene Bilder zuerst. Fehlende Motive werden geplant und als verwendbar markiert.", captions: "Arbeitsprozess\nDetailaufnahme\nKundenerlebnis\nErgebnis" },
    testimonials: { heading: "Vertrauen durch echte Stimmen", quotes: "Kunde A: Sehr professionell und klar.\nKunde B: Der Auftritt wirkt deutlich hochwertiger.\nKunde C: Schnell, strukturiert und angenehm." },
    faq: { heading: "Haeufige Fragen", questions: "Wie schnell geht der Start? Meist innerhalb weniger Tage.\nKann ich eigene Bilder nutzen? Ja, eigene Bilder haben Vorrang.\nKann ich spaeter eine Domain verbinden? Ja, mit automatischem SSL." },
    contact: { heading: "Starten wir mit einem Gespraech", intro: "Eine kurze Anfrage reicht fuer den ersten sinnvollen naechsten Schritt.", email: "hello@example.com", phone: "+49 000 000000", address: b.location },
    team: { heading: "Menschen und Kompetenz", intro: "Zeigen Sie Rollen dort, wo sie Vertrauen staerken.", members: "Mara Keller | Strategie | Klaert Ziele und Positionierung.\nLeon Hart | Design | Entwickelt digitale Auftritte.\nNina Vogt | Projektleitung | Haelt Qualitaet und Timing zusammen." },
    process: { heading: "Vom Briefing zum Launch", intro: "Ein klarer Ablauf macht die Entscheidung leichter.", steps: "Briefing | Ziele, Zielgruppe und Stil klaeren.\nDesignsystem | Farben, Typografie und Bildsprache festlegen.\nEditor | Sections bearbeiten und mobil pruefen.\nLaunch | Subdomain starten, Domain spaeter verbinden." },
    beforeAfter: { heading: "Vorher und nachher spuerbar anders", before: "Vorher: austauschbare Texte, generische Bilder und schwache Kontaktfuehrung.", after: "Nachher: klare Botschaft, individuelle Struktur und professioneller erster Eindruck." },
    cta: { heading: "Bereit fuer eine Website, die nicht nach Baukasten aussieht?", intro: "DexHost liefert die erste starke Version, Sie verfeinern jedes Detail.", primaryCta: "Website starten", secondaryCta: "Design pruefen" },
    footer: { brand: b.companyName, tagline: `${b.industry} aus ${b.location}. Klar positioniert und professionell praesentiert.`, links: "Start\nLeistungen\nProzess\nKontakt\nImpressum", legal: `(c) ${new Date().getFullYear()} ${b.companyName}.` }
  };
  return map[type] || map.services;
}

function designFor(brief) {
  const text = `${brief.industry} ${brief.style} ${brief.colorPreference}`.toLowerCase();
  if (/medizin|arzt|health|clinic|pflege/.test(text)) return { paletteName: "Clinical Signal", colors: { page: "#f5f9fb", surface: "#ffffff", text: "#102033", muted: "#66768a", accent: "#176b87", accentSoft: "#d9edf3" }, fontPair: "Inter + Source Serif", buttonStyle: "soft", backgroundStyle: "clean", spacingScale: "generous", radiusScale: "medium", shadowStyle: "soft" };
  if (/tech|software|ki|ai|saas/.test(text)) return { paletteName: "Technical Graphite", colors: { page: "#0f141a", surface: "#161d26", text: "#f5f7fb", muted: "#9ba8b8", accent: "#8fd3cc", accentSoft: "#17363b" }, fontPair: "Space Grotesk + Inter", buttonStyle: "outline", backgroundStyle: "technical", spacingScale: "balanced", radiusScale: "small", shadowStyle: "deep" };
  if (/lux|elegant|kanzlei|premium/.test(text)) return { paletteName: "Executive Stone", colors: { page: "#f4f1eb", surface: "#fffaf2", text: "#181713", muted: "#716c62", accent: "#846039", accentSoft: "#eadfce" }, fontPair: "IBM Plex Sans + IBM Plex Serif", buttonStyle: "sharp", backgroundStyle: "luxury", spacingScale: "generous", radiusScale: "small", shadowStyle: "crisp" };
  return { paletteName: "DexHost Studio", colors: { page: "#f7f9f7", surface: "#ffffff", text: "#151c1b", muted: "#697574", accent: "#24796f", accentSoft: "#dcecea" }, fontPair: "Manrope + Fraunces", buttonStyle: "solid", backgroundStyle: "editorial", spacingScale: "generous", radiusScale: "medium", shadowStyle: "soft" };
}

function assetNeeds(brief) {
  const b = defaultBrief(brief);
  return [
    { id: `asset-logo-${Date.now()}`, type: "Logo", title: `Logo-System fuer ${b.companyName}`, priority: "essential", reason: "Ein hochwertiger Firmenauftritt braucht ein klares Markenzeichen.", sourcePolicy: "canva-usable", canvaPrompt: `Professionelles Logo fuer ${b.companyName}, Branche ${b.industry}, Stil ${b.style}.`, status: "missing" },
    { id: `asset-hero-${Date.now()}`, type: "Hero-Grafik", title: "Hero-Keyvisual", priority: b.hasOwnImages === "yes" ? "recommended" : "essential", reason: "Der erste Screen braucht ein starkes, verwendbares Bildsignal.", sourcePolicy: b.hasOwnImages === "yes" ? "user-owned" : "ai-generated-usable", canvaPrompt: `Hochwertige Hero-Grafik fuer ${b.companyName}, ${b.industry}, ${b.style}, keine fremden Marken.`, status: "missing" },
    { id: `asset-icons-${Date.now()}`, type: "Icons", title: "Individuelle Service-Icons", priority: "recommended", reason: "Konsistente Icons wirken besser als generische Standardsets.", sourcePolicy: "canva-usable", canvaPrompt: `6 minimalistische Icons fuer ${b.industry}, passend zu ${b.companyName}.`, status: "planned" },
    { id: `asset-bg-${Date.now()}`, type: "Background", title: "Abstrakte Hintergrundelemente", priority: "optional", reason: "Subtile grafische Elemente geben Eigenstaendigkeit.", sourcePolicy: "ai-generated-usable", canvaPrompt: `Abstrakte Backgrounds fuer ${b.companyName}, premium ${b.style}.`, status: "planned" },
    { id: `asset-trust-${Date.now()}`, type: "Trust-Badges", title: "Trust-Badges", priority: "recommended", reason: "Proof-Elemente sollten selbst erstellt oder sauber lizenziert sein.", sourcePolicy: "canva-usable", canvaPrompt: `Trust Badge Set fuer ${b.companyName}: Qualitaet, Beratung, schnelle Antwort, lokal.`, status: "planned" }
  ];
}

function defaultWebsite(briefInput) {
  const brief = defaultBrief(briefInput);
  const designSystem = designFor(brief);
  const slug = slugify(brief.companyName);
  const middle = shuffle(sectionTypes.filter((type) => !["hero", "footer"].includes(type)));
  const selected = ["hero", ...middle.slice(0, 9), "cta", "footer"];
  return {
    schemaVersion: 2,
    title: brief.companyName,
    brief,
    seo: { title: `${brief.companyName} | ${brief.industry} in ${brief.location}`, description: `${brief.companyName} bietet ${brief.industry} fuer ${brief.audience}. Hochwertig, klar und direkt anfragbar.`, slug, language: "de" },
    designSystem,
    sections: selected.map((type, orderIndex) => ({
      id: `${type}-${Date.now()}-${orderIndex}`,
      type,
      variant: pick(variants[type]),
      orderIndex,
      content: contentFor(type, brief),
      imageUrls: [],
      styleSettings: { backgroundColor: orderIndex % 2 ? designSystem.colors.surface : designSystem.colors.page, textColor: designSystem.colors.text, accentColor: designSystem.colors.accent, imagePosition: pick(["left", "right", "top", "background"]), spacing: designSystem.spacingScale, align: type === "hero" ? "split" : "left" },
      animationSettings: { preset: pick(["none", "fade", "rise", "slide"]), intensity: "subtle" },
      backgroundSettings: { kind: orderIndex % 3 === 0 ? "soft-gradient" : "solid", overlay: "soft", graphicElement: pick(["none", "grid", "lines", "frame", "accent-block"]) }
    })),
    assetNeeds: assetNeeds(brief),
    publishing: { mode: "draft", subdomain: `${slug}.${subdomainSuffix}`, customDomain: "", provider: "netlify-deploys", ssl: "automatic", status: "not-started" }
  };
}

function extractOpenAIText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) if (content.text) chunks.push(content.text);
  }
  return chunks.join("\n");
}

async function openAIJson(prompt, fallback) {
  if (!openaiApiKey) return fallback;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: openaiModel,
        input: [
          { role: "system", content: "Du bist Senior-Webdesigner fuer DexHost. Antworte ausschliesslich als valides JSON ohne Markdown." },
          { role: "user", content: prompt }
        ],
        text: { format: { type: "json_object" } }
      })
    });
    if (!response.ok) return fallback;
    return JSON.parse(extractOpenAIText(await response.json())) || fallback;
  } catch {
    return fallback;
  }
}

function uploadConfig() {
  return { allowedTypes: Array.from(allowedExtensions), maxBytes: imageUploadMaxBytes, provider: "netlify-blobs", configured: true };
}

function integrations() {
  return {
    openai: { configured: Boolean(openaiApiKey), model: openaiModel },
    netlify: {
      hosting: true,
      identity: false,
      functions: true,
      blobs: true,
      forms: true,
      deploys: Boolean(process.env.NETLIFY_BUILD_HOOK_URL || process.env.NETLIFY_API_TOKEN),
      domains: Boolean(process.env.NETLIFY_SITE_ID || process.env.DEXHOST_PRIMARY_DOMAIN),
      dataStore: dataStoreName,
      assetStore: assetStoreName
    },
    canva: { available: true, mode: "connector-briefs", use: "logos, banners, hero graphics, social assets, trust badges" },
    paypal: { configured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET), environment: clean(process.env.PAYPAL_ENV) || "sandbox" },
    resend: { configured: mailConfigured(), from: resendFromEmail },
    publishing: { starter: `kunde.${subdomainSuffix}`, premium: "custom domain", providers: ["netlify-hosting", "netlify-deploys"], ssl: "automatic" }
  };
}

function decodeImage(body = {}) {
  const fileName = clean(body.fileName || "image").split(/[\\/]/).pop().toLowerCase().replace(/[^a-z0-9._-]+/g, "-") || "image";
  const extension = fileName.split(".").pop();
  if (!allowedExtensions.has(extension)) {
    const error = new Error("Unsupported image type.");
    error.statusCode = 400;
    throw error;
  }
  const match = String(body.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/i);
  const contentType = String(match?.[1] || body.contentType || "").toLowerCase();
  if (!allowedMimeTypes.has(contentType)) {
    const error = new Error("Unsupported image MIME type.");
    error.statusCode = 400;
    throw error;
  }
  const buffer = Buffer.from(String(match?.[2] || body.base64 || ""), "base64");
  if (!buffer.length || buffer.length > imageUploadMaxBytes) {
    const error = new Error("Image is empty or too large.");
    error.statusCode = buffer.length ? 413 : 400;
    throw error;
  }
  return { fileName, extension, contentType, buffer };
}

function projectRowToWebsiteProject(row) {
  return {
    id: row.id,
    title: row.name,
    updatedAt: row.updated_at,
    status: row.status,
    slug: row.slug,
    website: row.json_data
  };
}

async function userWebsiteIndex(userId) {
  return (await blobGetJson(`users/${userId}/websites/index.json`)) || [];
}

async function setUserWebsiteIndex(userId, ids) {
  await blobSetJson(`users/${userId}/websites/index.json`, Array.from(new Set(ids)));
}

async function listOwnedWebsites(auth) {
  const ids = await userWebsiteIndex(auth.userId);
  const rows = (await Promise.all(ids.map((id) => blobGetJson(`websites/${id}.json`)))).filter((row) => row?.user_id === auth.userId);
  return rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

async function getOwnedWebsite(auth, websiteId) {
  const row = await blobGetJson(`websites/${websiteId}.json`);
  return row?.user_id === auth.userId ? row : null;
}

async function saveWebsiteRow(row) {
  await blobSetJson(`websites/${row.id}.json`, row);
  const ids = await userWebsiteIndex(row.user_id);
  if (!ids.includes(row.id)) await setUserWebsiteIndex(row.user_id, [row.id, ...ids]);
  return row;
}

async function deleteWebsiteRow(row) {
  await blobDeleteJson(`websites/${row.id}.json`);
  await setUserWebsiteIndex(row.user_id, (await userWebsiteIndex(row.user_id)).filter((id) => id !== row.id));
}

async function createWebsite(auth, body) {
  const website = body.json_data || body.website || defaultWebsite(body.brief || {});
  const id = crypto.randomUUID();
  const name = clean(body.name || website.title) || "DexHost Website";
  const slug = slugify(body.slug || website.seo?.slug || name);
  const timestamp = now();
  const row = {
    id,
    user_id: auth.userId,
    name,
    slug,
    status: "draft",
    json_data: { ...website, publishing: { ...website.publishing, provider: "netlify-deploys", subdomain: `${slug}.${subdomainSuffix}` } },
    created_at: timestamp,
    updated_at: timestamp
  };
  return saveWebsiteRow(row);
}

async function updateWebsite(auth, websiteId, body) {
  const current = await getOwnedWebsite(auth, websiteId);
  if (!current) return null;
  if (body.status === "published") {
    const error = new Error("Use the publishing endpoint. Publishing is checked server-side.");
    error.statusCode = 403;
    throw error;
  }
  const nextJson = body.json_data || body.website || current.json_data;
  const nextName = clean(body.name || nextJson.title || current.name);
  const nextSlug = slugify(body.slug || nextJson.seo?.slug || current.slug);
  return saveWebsiteRow({
    ...current,
    name: nextName,
    slug: nextSlug,
    json_data: nextJson,
    status: body.status && body.status !== "published" ? body.status : current.status,
    updated_at: now()
  });
}

async function websiteAssetIndex(websiteId) {
  return (await blobGetJson(`assets/index/${websiteId}.json`)) || [];
}

async function setWebsiteAssetIndex(websiteId, ids) {
  await blobSetJson(`assets/index/${websiteId}.json`, Array.from(new Set(ids)));
}

function assetOut(asset) {
  return {
    id: asset.id,
    user_id: asset.user_id,
    website_id: asset.website_id,
    file_url: asset.file_url,
    url: asset.file_url,
    file_name: asset.file_name,
    content_type: asset.content_type,
    file_type: asset.content_type,
    size: asset.size,
    created_at: asset.created_at,
    public: Boolean(asset.public)
  };
}

async function listAssets(auth, websiteId) {
  const current = await getOwnedWebsite(auth, websiteId);
  if (!current) return null;
  const ids = await websiteAssetIndex(websiteId);
  const assets = (await Promise.all(ids.map((id) => blobGetJson(`assets/${id}.json`)))).filter((asset) => asset?.user_id === auth.userId && asset.website_id === websiteId);
  return assets.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(assetOut);
}

async function createAsset(auth, websiteId, decoded) {
  const current = await getOwnedWebsite(auth, websiteId);
  if (!current) return null;
  const id = crypto.randomUUID();
  const blobKey = `users/${auth.userId}/websites/${websiteId}/${id}.${decoded.extension}`;
  const asset = {
    id,
    user_id: auth.userId,
    website_id: websiteId,
    file_url: `/api/assets/${id}`,
    file_name: decoded.fileName,
    content_type: decoded.contentType,
    size: decoded.buffer.length,
    blob_key: blobKey,
    public: false,
    created_at: now()
  };
  await blobSetBinary(blobKey, decoded.buffer, { content_type: decoded.contentType, file_name: decoded.fileName, website_id: websiteId, user_id: auth.userId });
  await blobSetJson(`assets/${id}.json`, asset);
  await setWebsiteAssetIndex(websiteId, [id, ...(await websiteAssetIndex(websiteId))]);
  return assetOut(asset);
}

async function createProfileAsset(auth, decoded, kind) {
  if (!["logo", "avatar"].includes(kind)) {
    const error = new Error("Unsupported profile asset type.");
    error.statusCode = 400;
    throw error;
  }
  const id = crypto.randomUUID();
  const blobKey = `users/${auth.userId}/profile/${kind}-${id}.${decoded.extension}`;
  const asset = {
    id,
    user_id: auth.userId,
    website_id: null,
    profile_asset: kind,
    file_url: `/api/assets/${id}`,
    file_name: decoded.fileName,
    content_type: decoded.contentType,
    size: decoded.buffer.length,
    blob_key: blobKey,
    public: false,
    created_at: now()
  };
  await blobSetBinary(blobKey, decoded.buffer, { content_type: decoded.contentType, file_name: decoded.fileName, user_id: auth.userId, profile_asset: kind });
  await blobSetJson(`assets/${id}.json`, asset);
  const profile = await ensureProfile(auth);
  const next = { ...profile, [kind === "logo" ? "logo_url" : "avatar_url"]: asset.file_url, updated_at: now() };
  await blobSetJson(`profiles/${auth.userId}.json`, next);
  return { asset: assetOut(asset), profile: profileOut(next, auth.user) };
}

function referencedAssetIds(website) {
  const ids = new Set();
  const text = JSON.stringify(website);
  for (const match of text.matchAll(/\/api\/assets\/([0-9a-f-]{36})/gi)) ids.add(match[1]);
  return Array.from(ids);
}

async function markReferencedAssetsPublic(row) {
  const ids = referencedAssetIds(row.json_data);
  await Promise.all(ids.map(async (id) => {
    const asset = await blobGetJson(`assets/${id}.json`);
    if (asset?.website_id === row.id && asset.user_id === row.user_id) await blobSetJson(`assets/${id}.json`, { ...asset, public: true, published_at: now() });
  }));
}

async function triggerNetlifyDeploy(row) {
  const payload = { websiteId: row.id, slug: row.slug, subdomain: `${row.slug}.${subdomainSuffix}`, publishedAt: now() };
  if (process.env.NETLIFY_BUILD_HOOK_URL) {
    const response = await fetch(process.env.NETLIFY_BUILD_HOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return { provider: "netlify-build-hook", queued: response.ok, status: response.status };
  }
  return { provider: "netlify-functions-blobs", queued: false, status: "prepared", note: "Set NETLIFY_BUILD_HOOK_URL to trigger an atomic Netlify deploy on publish." };
}

async function publishWebsite(auth, websiteId) {
  const profile = await ensureProfile(auth);
  if (!hasActivePaidEntitlement(profile)) {
    const error = new Error("Publishing requires an active basic, business, pro, or admin plan.");
    error.statusCode = 402;
    throw error;
  }
  const current = await getOwnedWebsite(auth, websiteId);
  if (!current) return null;
  const slug = slugify(current.slug || current.json_data?.seo?.slug || current.name);
  const publishedAt = now();
  const nextJson = {
    ...current.json_data,
    publishing: {
      ...current.json_data.publishing,
      mode: "subdomain",
      provider: "netlify-deploys",
      subdomain: `${slug}.${subdomainSuffix}`,
      ssl: "automatic",
      status: "published",
      publishedAt,
      publicPath: `/s/${slug}`
    }
  };
  const row = await saveWebsiteRow({ ...current, slug, status: "published", json_data: nextJson, updated_at: publishedAt, published_at: publishedAt });
  await markReferencedAssetsPublic(row);
  await blobSetJson(`published/${slug}.json`, { ...row, public_url: `/s/${slug}`, subdomain: `${slug}.${subdomainSuffix}` });
  await blobSetJson(`slugs/${slug}.json`, { website_id: row.id, user_id: row.user_id, status: "published", published_at: publishedAt });
  const deploy = await triggerNetlifyDeploy(row);
  return { row, deploy };
}

function paypalBaseUrl() {
  return clean(process.env.PAYPAL_ENV).toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken() {
  const clientId = clean(process.env.PAYPAL_CLIENT_ID);
  const clientSecret = clean(process.env.PAYPAL_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    const error = new Error("PayPal ist noch nicht konfiguriert. Setze PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET und optional PAYPAL_ENV in Netlify.");
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_description || data.error || "PayPal Auth fehlgeschlagen.");
    error.statusCode = 502;
    throw error;
  }
  return data.access_token;
}

async function paypalRequest(path, options = {}) {
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}${path}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error_description || data.name || "PayPal request failed.");
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return data;
}

function headerValue(event, name) {
  const lower = name.toLowerCase();
  return clean(event.headers[name] || event.headers[lower] || event.headers[name.toUpperCase()] || "");
}

function planFromPayPalPlanId(planId) {
  const entry = Object.entries(subscriptionPlanIds).find(([, value]) => value && value === planId);
  return entry ? entry[0] : "";
}

function subscriptionPeriodEnd(subscription = {}) {
  return clean(subscription.billing_info?.next_billing_time || subscription.billing_info?.last_payment?.time || subscription.next_billing_time || "");
}

function billingStatusFromPayPalStatus(status = "") {
  const normalized = clean(status).toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "APPROVAL_PENDING" || normalized === "APPROVED") return "pending";
  if (normalized === "CANCELLED") return "cancelled";
  if (normalized === "SUSPENDED") return "suspended";
  if (normalized === "EXPIRED") return "expired";
  return normalized ? normalized.toLowerCase() : "";
}

function billingStatusFromWebhook(eventType, subscription = {}) {
  if (eventType === "PAYMENT.SALE.COMPLETED") return "active";
  if (eventType === "PAYMENT.SALE.REFUNDED") return "refunded";
  if (eventType === "PAYMENT.SALE.REVERSED") return "reversed";
  if (eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") return "payment_failed";
  if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") return "cancelled";
  if (eventType === "BILLING.SUBSCRIPTION.SUSPENDED") return "suspended";
  if (eventType === "BILLING.SUBSCRIPTION.EXPIRED") return "expired";
  if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") return "active";
  return billingStatusFromPayPalStatus(subscription.status);
}

function accessPlanForBilling(plan, billingStatus, currentPeriodEnd) {
  if (!paidPlans.has(plan) || plan === "admin") return plan === "admin" ? "admin" : "free";
  if (["active", "approved"].includes(billingStatus)) return plan;
  if (billingStatus === "cancelled" && currentPeriodEnd && new Date(currentPeriodEnd).getTime() > Date.now()) return plan;
  return "free";
}

async function verifiedPayPalWebhookEvent(event, webhookEvent) {
  if (!paypalWebhookId) {
    const error = new Error("PayPal Webhook ist noch nicht konfiguriert. Setze PAYPAL_WEBHOOK_ID in Netlify.");
    error.statusCode = 503;
    throw error;
  }
  const verification = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: headerValue(event, "paypal-auth-algo"),
      cert_url: headerValue(event, "paypal-cert-url"),
      transmission_id: headerValue(event, "paypal-transmission-id"),
      transmission_sig: headerValue(event, "paypal-transmission-sig"),
      transmission_time: headerValue(event, "paypal-transmission-time"),
      webhook_id: paypalWebhookId,
      webhook_event: webhookEvent
    }
  });
  if (verification.verification_status !== "SUCCESS") {
    const error = new Error("PayPal Webhook-Signatur konnte nicht verifiziert werden.");
    error.statusCode = 401;
    throw error;
  }
  return webhookEvent;
}

async function paypalSubscriptionDetails(subscriptionId) {
  if (!subscriptionId) return {};
  try {
    return await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
  } catch (error) {
    return {};
  }
}

async function applySubscriptionRowToProfile(row, eventType) {
  if (!row?.user_id || !row.plan) return null;
  const userRow = await blobGetJson(`auth/users/${row.user_id}.json`);
  if (!userRow) return null;
  const user = authUserOut(userRow);
  const auth = { user, userId: row.user_id };
  const profile = await ensureProfile(auth);
  const billingStatus = row.billing_status || row.status || "active";
  const accessPlan = accessPlanForBilling(row.plan, billingStatus, row.current_period_end);
  const next = {
    ...profile,
    plan: profile.plan === "admin" ? "admin" : accessPlan,
    billing_provider: "paypal-subscription",
    billing_status: billingStatus,
    billing_reference: row.id,
    paypal_subscription_id: row.id,
    subscription_status: billingStatus,
    subscription_current_period_end: row.current_period_end || profile.subscription_current_period_end || "",
    subscription_cancelled_at: billingStatus === "cancelled" ? (row.cancelled_at || now()) : profile.subscription_cancelled_at || "",
    subscription_last_event: eventType,
    updated_at: now()
  };
  await blobSetJson(`profiles/${row.user_id}.json`, next);
  return next;
}

async function upsertPayPalSubscriptionFromWebhook(webhookEvent) {
  const eventType = clean(webhookEvent.event_type);
  const resource = webhookEvent.resource || {};
  const subscriptionId = clean(eventType.startsWith("PAYMENT.SALE.") ? (resource.billing_agreement_id || resource.subscription_id) : (resource.id || resource.billing_agreement_id || resource.subscription_id));
  if (!subscriptionId) return { ignored: true, reason: "no_subscription_id" };

  const details = eventType.startsWith("BILLING.SUBSCRIPTION.") ? resource : await paypalSubscriptionDetails(subscriptionId);
  const existing = await blobGetJson(`billing/paypal/subscriptions/${subscriptionId}.json`);
  const paypalPlanId = clean(details.plan_id || resource.plan_id || existing?.paypal_plan_id || "");
  const plan = clean(existing?.plan || planFromPayPalPlanId(paypalPlanId)).toLowerCase();
  const userId = clean(existing?.user_id || details.custom_id || resource.custom_id || "");
  const billingStatus = billingStatusFromWebhook(eventType, details);
  const currentPeriodEnd = subscriptionPeriodEnd(details) || existing?.current_period_end || "";
  const timestamp = now();
  const row = {
    ...(existing || {}),
    id: subscriptionId,
    user_id: userId,
    plan,
    paypal_plan_id: paypalPlanId,
    status: clean(details.status || resource.status || billingStatus).toUpperCase(),
    billing_status: billingStatus,
    current_period_end: currentPeriodEnd,
    cancelled_at: billingStatus === "cancelled" ? (existing?.cancelled_at || timestamp) : existing?.cancelled_at || "",
    last_event_id: webhookEvent.id || "",
    last_event_type: eventType,
    created_at: existing?.created_at || details.create_time || timestamp,
    updated_at: timestamp
  };
  await blobSetJson(`billing/paypal/subscriptions/${subscriptionId}.json`, row);
  if (eventType.startsWith("PAYMENT.SALE.")) {
    await blobSetJson(`billing/paypal/subscription-payments/${subscriptionId}/${webhookEvent.id || stableHash(JSON.stringify(resource))}.json`, {
      subscription_id: subscriptionId,
      event_id: webhookEvent.id || "",
      event_type: eventType,
      amount: resource.amount || null,
      status: resource.state || resource.status || "",
      created_at: timestamp,
      resource_id: resource.id || ""
    });
  }
  const profile = userId && plan ? await applySubscriptionRowToProfile(row, eventType) : null;
  return { subscriptionId, plan, userId, billingStatus, profileUpdated: Boolean(profile) };
}

async function handlePayPalWebhook(event) {
  const webhookEvent = bodyJson(event);
  const eventId = clean(webhookEvent.id || stableHash(event.body || JSON.stringify(webhookEvent)));
  const eventKey = `billing/paypal/webhook-events/${eventId}.json`;
  const existing = await blobGetJson(eventKey);
  if (existing?.processed_at) return { ok: true, duplicate: true, eventId };
  await verifiedPayPalWebhookEvent(event, webhookEvent);
  const result = await upsertPayPalSubscriptionFromWebhook(webhookEvent);
  await blobSetJson(eventKey, {
    id: eventId,
    event_type: webhookEvent.event_type || "",
    resource_type: webhookEvent.resource_type || "",
    summary: webhookEvent.summary || "",
    result,
    received_at: existing?.received_at || now(),
    processed_at: now()
  });
  return { ok: true, eventId, ...result };
}

async function createPayPalOrder(auth, event, plan) {
  const selected = billingPlans[plan];
  if (!selected) {
    const error = new Error("Bitte wähle Basic, Business oder Pro.");
    error.statusCode = 400;
    throw error;
  }
  const origin = originFor(event);
  const order = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    body: {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: `dexhost-${plan}`,
        custom_id: auth.userId,
        description: `DexHost ${selected.name} - erster Monat`,
        amount: { currency_code: selected.currency, value: selected.value }
      }],
      application_context: {
        brand_name: "DexHost",
        landing_page: "LOGIN",
        user_action: "PAY_NOW",
        return_url: `${origin}/billing/success?paypal=success`,
        cancel_url: `${origin}/billing?paypal=cancel`
      }
    }
  });
  const approvalUrl = (order.links || []).find((link) => link.rel === "approve")?.href;
  if (!approvalUrl) {
    const error = new Error("PayPal konnte keinen Freigabe-Link erstellen.");
    error.statusCode = 502;
    throw error;
  }
  await blobSetJson(`billing/paypal/orders/${order.id}.json`, { id: order.id, user_id: auth.userId, plan, amount: selected.value, currency: selected.currency, status: "created", created_at: now() });
  return { orderId: order.id, approvalUrl, plan };
}

async function capturePayPalOrder(auth, orderId) {
  const pending = await blobGetJson(`billing/paypal/orders/${orderId}.json`);
  if (!pending || pending.user_id !== auth.userId) {
    const error = new Error("PayPal-Zahlung wurde nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }
  if (pending.status === "completed") {
    const profile = await setProfilePlan(auth, pending.plan, { provider: "paypal", status: "active", reference: orderId });
    return { profile, plan: pending.plan, status: "completed" };
  }
  const captured = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: {} });
  if (captured.status !== "COMPLETED") {
    const error = new Error("PayPal-Zahlung ist noch nicht abgeschlossen.");
    error.statusCode = 402;
    throw error;
  }
  await blobSetJson(`billing/paypal/orders/${orderId}.json`, { ...pending, status: "completed", paypal_status: captured.status, captured_at: now() });
  const profile = await setProfilePlan(auth, pending.plan, { provider: "paypal", status: "active", reference: orderId });
  return { profile, plan: pending.plan, status: captured.status };
}

async function createPayPalSetupOrder(auth, event, serviceId) {
  const service = launchServices[serviceId];
  if (!service) {
    const error = new Error("Bitte wähle Launch-Hilfe, Setup-Service oder Premium-Setup.");
    error.statusCode = 400;
    throw error;
  }
  const origin = originFor(event);
  const order = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    body: {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: `dexhost-${service.id}`,
        custom_id: auth.userId,
        description: `DexHost ${service.name} - Einmalzahlung`,
        amount: { currency_code: service.currency, value: service.value }
      }],
      application_context: {
        brand_name: "DexHost",
        landing_page: "LOGIN",
        user_action: "PAY_NOW",
        return_url: `${origin}/billing/success?setup=success`,
        cancel_url: `${origin}/launch-hilfe?payment=cancel`
      }
    }
  });
  const approvalUrl = (order.links || []).find((link) => link.rel === "approve")?.href;
  if (!approvalUrl) {
    const error = new Error("PayPal konnte keinen Freigabe-Link erstellen.");
    error.statusCode = 502;
    throw error;
  }
  await blobSetJson(`billing/paypal/setup-orders/${order.id}.json`, { id: order.id, user_id: auth.userId, service_id: service.id, amount: service.value, currency: service.currency, status: "created", created_at: now() });
  return { orderId: order.id, approvalUrl, serviceId: service.id };
}

async function capturePayPalSetupOrder(auth, orderId) {
  const pending = await blobGetJson(`billing/paypal/setup-orders/${orderId}.json`);
  if (!pending || pending.user_id !== auth.userId) {
    const error = new Error("PayPal-Einmalzahlung wurde nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }
  const service = launchServices[pending.service_id];
  if (!service) {
    const error = new Error("Gebuchte Launch-Leistung wurde nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }
  if (pending.status === "completed") return { service, status: "completed", orderId };
  const captured = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: {} });
  if (captured.status !== "COMPLETED") {
    const error = new Error("PayPal-Einmalzahlung ist noch nicht abgeschlossen.");
    error.statusCode = 402;
    throw error;
  }
  const completed = { ...pending, status: "completed", paypal_status: captured.status, captured_at: now() };
  await blobSetJson(`billing/paypal/setup-orders/${orderId}.json`, completed);
  await blobSetJson(`billing/setup-purchases/${auth.userId}/${orderId}.json`, { ...completed, service });
  return { service, status: captured.status, orderId };
}

async function activatePayPalSubscription(auth, plan, subscriptionId) {
  const selected = billingPlans[plan];
  if (!selected) {
    const error = new Error("Bitte wähle Basic, Business oder Pro.");
    error.statusCode = 400;
    throw error;
  }
  if (!subscriptionId) {
    const error = new Error("PayPal Abo-ID fehlt.");
    error.statusCode = 400;
    throw error;
  }
  const subscription = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const expectedPlanId = subscriptionPlanIds[plan];
  if (expectedPlanId && subscription.plan_id !== expectedPlanId) {
    const error = new Error("PayPal Abo gehört nicht zum gewählten Tarif.");
    error.statusCode = 403;
    throw error;
  }
  if (subscription.status !== "ACTIVE") {
    const error = new Error(`PayPal Abo ist noch nicht aktiv. Status: ${subscription.status || "unbekannt"}.`);
    error.statusCode = 402;
    throw error;
  }
  await blobSetJson(`billing/paypal/subscriptions/${subscriptionId}.json`, {
    id: subscriptionId,
    user_id: auth.userId,
    plan,
    paypal_plan_id: subscription.plan_id,
    status: subscription.status,
    billing_status: billingStatusFromPayPalStatus(subscription.status),
    current_period_end: subscriptionPeriodEnd(subscription),
    created_at: subscription.create_time || now(),
    updated_at: now()
  });
  const profile = await setProfilePlan(auth, plan, {
    provider: "paypal-subscription",
    status: "active",
    reference: subscriptionId,
    subscriptionId,
    subscriptionStatus: "active",
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
    lastEvent: "client-activation"
  });
  return { profile, plan, status: subscription.status, subscriptionId };
}

exports.config = { path: "/api/*" };

exports.handler = async (event, context) => {
  await connectBlobs(event);
  if (event.httpMethod === "OPTIONS") return json(204, {});
  try {
    const method = event.httpMethod;
    const path = routePath(event);

    if (method === "GET" && path === "/api/health") {
      return json(200, { ok: true, product: "DexHost", platform: "netlify", auth: "netlify-functions-blobs", storage: "netlify-blobs", functions: true, forms: true, deploys: integrations().netlify.deploys ? "configured" : "prepared" });
    }
    if (method === "GET" && path === "/api/auth/csrf") {
      const token = csrfToken(event);
      return json(200, { csrfToken: token }, [csrfCookie(event, token)]);
    }
    if (method === "GET" && path === "/api/upload/config") return json(200, uploadConfig());
    if (method === "GET" && path === "/api/integrations/studio") return json(200, integrations());

    if (method === "POST" && path === "/api/billing/paypal/webhook") {
      const result = await handlePayPalWebhook(event);
      return json(200, result);
    }

    const publicMatch = path.match(/^\/api\/public\/websites\/([a-z0-9-]+)$/i);
    if (publicMatch && method === "GET") {
      const published = await blobGetJson(`published/${slugify(publicMatch[1])}.json`);
      if (!published || published.status !== "published") return json(404, { error: "Published website not found." });
      return json(200, { website: projectRowToWebsiteProject(published), publicUrl: published.public_url, subdomain: published.subdomain });
    }

    const assetPublicMatch = path.match(/^\/api\/assets\/([0-9a-f-]{36})$/i);
    if (assetPublicMatch && method === "GET") {
      const asset = await blobGetJson(`assets/${assetPublicMatch[1]}.json`);
      if (!asset) return json(404, { error: "Asset not found." });
      if (!asset.public) {
        const auth = await requireUser(event, context);
        if (asset.user_id !== auth.userId) return json(404, { error: "Asset not found." }, auth.cookies);
      }
      const file = await blobGetBinary(asset.blob_key);
      if (!file) return json(404, { error: "Asset file not found." });
      return binary(200, file, asset.content_type, asset.public ? "public, max-age=31536000, immutable" : "private, no-store");
    }

    assertCsrf(event);

    if (method === "POST" && path === "/api/auth/register") {
      const body = bodyJson(event);
      const email = clean(body.email).toLowerCase();
      const password = String(body.password || "");
      const displayName = clean(body.displayName) || email;
      if (!email || password.length < 8) return json(400, { error: "Email and a password with at least 8 characters are required." });
      const user = await createPasswordUser(email, password, displayName);
      if (mailConfigured()) {
        await sendVerificationEmail(event, user);
        return json(201, { authenticated: false, user: { id: user.id, email: userEmailFrom(user) || email }, emailVerificationRequired: true, mailProvider: "resend" });
      }
      const session = await createSession(user.id);
      const auth = { user, userId: user.id, token: session.access_token };
      const profile = await ensureProfile(auth, { touchLastLogin: true });
      return json(201, { authenticated: true, user: { id: auth.userId, email: userEmailFrom(user) || email }, profile: profileOut(profile, user), emailVerificationRequired: false }, sessionCookies(event, session));
    }

    if (method === "POST" && path === "/api/auth/login") {
      const body = bodyJson(event);
      const email = clean(body.email).toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) return json(400, { error: "Email and password are required." });
      const user = await authenticatePasswordUser(email, password);
      const session = await createSession(user.id);
      const auth = { user, userId: user.id, token: session.access_token };
      const profile = await ensureProfile(auth, { touchLastLogin: true });
      return json(200, { authenticated: true, user: { id: auth.userId, email: userEmailFrom(user) || email }, profile: profileOut(profile, user) }, sessionCookies(event, session));
    }

    if (method === "POST" && path === "/api/auth/forgot-password") {
      const email = clean(bodyJson(event).email).toLowerCase();
      if (!email) return json(400, { error: "Email is required." });
      const user = await userByEmail(email);
      if (user && mailConfigured()) await sendPasswordResetEmail(event, authUserOut(user));
      return json(200, { ok: true, message: "Wenn ein Konto existiert, senden wir dir einen Link zum Zurücksetzen." });
    }

    if (method === "POST" && path === "/api/auth/verify-email") {
      const token = clean(bodyJson(event).token);
      if (!token) return json(400, { error: "Verifizierungslink fehlt." });
      await verifyEmailToken(token);
      return json(200, { ok: true, message: "E-Mail bestätigt. Du kannst dich jetzt anmelden." });
    }

    if (method === "POST" && path === "/api/auth/reset-password") {
      const body = bodyJson(event);
      const token = clean(body.token);
      const password = String(body.password || "");
      if (!token) return json(400, { error: "Reset-Link fehlt." });
      await resetPasswordWithToken(token, password);
      return json(200, { ok: true, message: "Passwort wurde geändert. Du kannst dich jetzt anmelden." });
    }

    if (method === "POST" && path === "/api/auth/logout") {
      return json(200, { ok: true }, [clearCookie(sessionCookieName, event), clearCookie(refreshCookieName, event), clearCookie(csrfCookieName, event)]);
    }

    if (method === "GET" && path === "/api/auth/session") {
      const auth = await requireUser(event, context);
      const profile = await ensureProfile(auth);
      return json(200, { authenticated: true, user: { id: auth.userId, email: userEmailFrom(auth.user) }, profile: profileOut(profile, auth.user) }, auth.cookies);
    }

    const auth = await requireUser(event, context);

    if (method === "POST" && path === "/api/billing/paypal/create") {
      const checkout = await createPayPalOrder(auth, event, clean(bodyJson(event).plan).toLowerCase());
      return json(201, checkout, auth.cookies);
    }

    if (method === "POST" && path === "/api/billing/paypal/capture") {
      const result = await capturePayPalOrder(auth, clean(bodyJson(event).orderId));
      return json(200, { ...result, profile: profileOut(result.profile, auth.user) }, auth.cookies);
    }

    if (method === "POST" && path === "/api/billing/paypal/subscription/activate") {
      const body = bodyJson(event);
      const result = await activatePayPalSubscription(auth, clean(body.plan).toLowerCase(), clean(body.subscriptionId));
      return json(200, { ...result, profile: profileOut(result.profile, auth.user) }, auth.cookies);
    }

    if (method === "POST" && path === "/api/billing/paypal/setup/create") {
      const checkout = await createPayPalSetupOrder(auth, event, clean(bodyJson(event).serviceId).toLowerCase());
      return json(201, checkout, auth.cookies);
    }

    if (method === "POST" && path === "/api/billing/paypal/setup/capture") {
      const result = await capturePayPalSetupOrder(auth, clean(bodyJson(event).orderId));
      return json(200, result, auth.cookies);
    }

    if (method === "GET" && (path === "/api/account" || path === "/api/profile")) {
      const profile = await ensureProfile(auth);
      return json(200, { profile: profileOut(profile, auth.user) }, auth.cookies);
    }

    if (method === "PUT" && (path === "/api/account" || path === "/api/profile")) {
      const profile = await updateProfile(auth, bodyJson(event));
      return json(200, { profile: profileOut(profile, auth.user) }, auth.cookies);
    }

    const profileAssetMatch = path.match(/^\/api\/(?:account|profile)\/(logo|avatar)$/i);
    if (profileAssetMatch && method === "POST") {
      const decoded = decodeImage(bodyJson(event));
      const result = await createProfileAsset(auth, decoded, profileAssetMatch[1].toLowerCase());
      return json(201, result, auth.cookies);
    }

    if (method === "POST" && path === "/api/websites/ai-studio-plan") {
      const profile = await ensureProfile(auth);
      const body = bodyJson(event);
      const fallback = defaultWebsite(body.brief || body);
      const website = await openAIJson(`Erzeuge ein DexHost WebsiteDocument JSON. Schema-Version 2. Section types: ${sectionTypes.join(", ")}. Jede Section braucht type, variant, orderIndex, content, imageUrls, styleSettings, animationSettings, backgroundSettings. Variiere Reihenfolge, Varianten, Farben, Bildpositionen und Typografie. Kein Template-Look, keine grellen Zufallsfarben. Brief: ${JSON.stringify(body.brief || body)}.`, fallback);
      return json(200, { website: { ...fallback, ...website }, source: openaiApiKey ? "openai" : "fallback", plan: profile.plan, integrations: integrations() }, auth.cookies);
    }

    if (method === "POST" && path === "/api/websites/asset-plan") {
      const body = bodyJson(event);
      if (body.websiteId && !(await getOwnedWebsite(auth, body.websiteId))) return json(404, { error: "Website not found." }, auth.cookies);
      const fallback = { assetNeeds: assetNeeds(body.brief || {}), canvaAvailable: true, notes: "DexHost hat Canva-ready Briefings vorbereitet. Eigene Nutzerbilder haben Vorrang." };
      const plan = await openAIJson(`Pruefe diese DexHost Website und erstelle einen Asset-Plan fuer Logo, Icons, Hero-Grafik, Social-Banner, Backgrounds, Trust-Badges, Infografiken. Kennzeichne sourcePolicy als user-owned, canva-usable, ai-generated-usable oder licensed-stock-required. Brief: ${JSON.stringify(body.brief || {})} Website: ${JSON.stringify(body.website || {}).slice(0, 12000)}. Antworte JSON {assetNeeds:[], canvaAvailable:boolean, notes:string}.`, fallback);
      return json(200, { ...fallback, ...plan, integrations: integrations() }, auth.cookies);
    }

    if (method === "GET" && path === "/api/websites") {
      const rows = await listOwnedWebsites(auth);
      return json(200, { websites: rows.map(projectRowToWebsiteProject) }, auth.cookies);
    }

    if (method === "POST" && path === "/api/websites") {
      const row = await createWebsite(auth, bodyJson(event));
      return json(201, { website: projectRowToWebsiteProject(row) }, auth.cookies);
    }

    const websiteMatch = path.match(/^\/api\/websites\/([0-9a-f-]{36})$/i);
    if (websiteMatch && method === "GET") {
      const row = await getOwnedWebsite(auth, websiteMatch[1]);
      if (!row) return json(404, { error: "Website not found." }, auth.cookies);
      return json(200, { website: projectRowToWebsiteProject(row) }, auth.cookies);
    }

    if (websiteMatch && method === "PUT") {
      const row = await updateWebsite(auth, websiteMatch[1], bodyJson(event));
      if (!row) return json(404, { error: "Website not found." }, auth.cookies);
      return json(200, { website: projectRowToWebsiteProject(row) }, auth.cookies);
    }

    if (websiteMatch && method === "DELETE") {
      const row = await getOwnedWebsite(auth, websiteMatch[1]);
      if (!row) return json(404, { error: "Website not found." }, auth.cookies);
      await deleteWebsiteRow(row);
      return json(200, { ok: true }, auth.cookies);
    }

    const publishMatch = path.match(/^\/api\/websites\/([0-9a-f-]{36})\/publish$/i);
    if (publishMatch && method === "POST") {
      const result = await publishWebsite(auth, publishMatch[1]);
      if (!result) return json(404, { error: "Website not found." }, auth.cookies);
      return json(200, { website: projectRowToWebsiteProject(result.row), deploy: result.deploy, publicUrl: `/s/${result.row.slug}`, subdomain: `${result.row.slug}.${subdomainSuffix}` }, auth.cookies);
    }

    const domainMatch = path.match(/^\/api\/websites\/([0-9a-f-]{36})\/domain$/i);
    if (domainMatch && method === "POST") {
      const profile = await ensureProfile(auth);
      if (!hasActivePaidEntitlement(profile)) return json(402, { error: "Custom domains require an active paid plan." }, auth.cookies);
      const current = await getOwnedWebsite(auth, domainMatch[1]);
      if (!current) return json(404, { error: "Website not found." }, auth.cookies);
      const customDomain = clean(bodyJson(event).customDomain).toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(customDomain)) return json(400, { error: "A valid custom domain is required." }, auth.cookies);
      const row = await saveWebsiteRow({ ...current, json_data: { ...current.json_data, publishing: { ...current.json_data.publishing, customDomain, ssl: "automatic", provider: "netlify-deploys" } }, updated_at: now() });
      return json(200, { website: projectRowToWebsiteProject(row), domain: { customDomain, ssl: "automatic", status: "prepared", note: "Connect this domain in Netlify Domain Management and point DNS to Netlify." } }, auth.cookies);
    }

    const assetMatch = path.match(/^\/api\/websites\/([0-9a-f-]{36})\/assets$/i);
    if (assetMatch && method === "GET") {
      const assets = await listAssets(auth, assetMatch[1]);
      if (!assets) return json(404, { error: "Website not found." }, auth.cookies);
      return json(200, { assets, config: uploadConfig() }, auth.cookies);
    }

    if (assetMatch && method === "POST") {
      const decoded = decodeImage(bodyJson(event));
      const asset = await createAsset(auth, assetMatch[1], decoded);
      if (!asset) return json(404, { error: "Website not found." }, auth.cookies);
      return json(201, { asset, config: uploadConfig() }, auth.cookies);
    }

    return json(404, { error: "API route not found.", path });
  } catch (error) {
    console.error("DexHost API error", { message: error.message, statusCode: error.statusCode, stack: error.stack });
    const statusCode = error.statusCode || (/Authentication required/i.test(error.message) ? 401 : 500);
    return json(statusCode, { error: statusCode === 500 ? "Server error" : error.message, detail: process.env.NODE_ENV === "development" ? error.message : undefined });
  }
};
