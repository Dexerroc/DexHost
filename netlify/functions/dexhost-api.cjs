const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const pathModule = require("node:path");

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
    confirmed_at: row.confirmed_at || row.created_at,
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
  const row = {
    id: crypto.randomUUID(),
    email,
    password_hash: passwordHash(password),
    user_metadata: { display_name: displayName, full_name: displayName, email },
    app_metadata: { plan: "free", roles: [] },
    account_status: "active",
    created_at: timestamp,
    updated_at: timestamp,
    confirmed_at: timestamp,
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
  const next = { ...row, last_login_at: now(), updated_at: now() };
  await blobSetJson(`auth/users/${row.id}.json`, next);
  return authUserOut(next);
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
    created_at: profile.created_at,
    updated_at: profile.updated_at || profile.created_at,
    last_login_at: profile.last_login_at || user.last_login_at || user.last_sign_in_at || ""
  };
}

function localPath(storeName, key, extension) {
  const safeKey = Buffer.from(key).toString("base64url");
  return pathModule.join(process.cwd(), ".netlify-state", storeName, `${safeKey}.${extension}`);
}

async function withStore(storeName, action, fallback) {
  try {
    const { getStore } = await import("@netlify/blobs");
    const siteID = clean(process.env.NETLIFY_SITE_ID || process.env.SITE_ID);
    const token = clean(process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN);
    try {
      return await action(getStore(storeName));
    } catch (environmentError) {
      if (!siteID || !token) throw environmentError;
      return await action(getStore({ name: storeName, siteID, token }));
    }
  } catch (error) {
    if (process.env.NETLIFY === "true") {
      const message = String(error?.message || error);
      if (/not been configured to use Netlify Blobs|MissingBlobsEnvironmentError|siteID|token|unauthorized|forbidden|401|403|404/i.test(message)) {
        const nextError = new Error("Netlify Blobs ist nicht erreichbar. Prüfe NETLIFY_SITE_ID und NETLIFY_API_TOKEN oder entferne beide Variablen, wenn Netlify Blobs automatisch bereitstellt.");
        nextError.statusCode = 503;
        throw nextError;
      }
      throw error;
    }
    return fallback();
  }
}

async function connectBlobs(event) {
  try {
    const { connectLambda } = await import("@netlify/blobs");
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
    plan: editablePlans.has(existing?.plan) ? existing.plan : identityDerivedPlan,
    roles: Array.isArray(existing?.roles) && existing.roles.length ? existing.roles : identityDerivedRoles,
    stripe_customer_id: existing?.stripe_customer_id || null,
    account_status: existing?.account_status || identityAccountStatus(auth.user),
    created_at: existing?.created_at || auth.user.created_at || now(),
    updated_at: now(),
    last_login_at: options.touchLastLogin ? now() : (existing?.last_login_at || auth.user.last_login_at || auth.user.last_sign_in_at || "")
  };
  if (identityDerivedPlan === "admin") profile.plan = "admin";
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
    roles: profile.roles,
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
  if (!paidPlans.has(profile.plan)) {
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
      return json(200, { ok: true, message: "Passwort-Reset per E-Mail ist vorbereitet, aber noch nicht mit einem Mail-Anbieter verbunden." });
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
      if (!paidPlans.has(profile.plan)) return json(402, { error: "Custom domains require an active paid plan." }, auth.cookies);
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
