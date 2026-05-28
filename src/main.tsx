import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";

type SectionType = "hero" | "about" | "services" | "pricing" | "gallery" | "testimonials" | "faq" | "contact" | "team" | "process" | "beforeAfter" | "cta" | "footer";
type ImagePosition = "left" | "right" | "top" | "background" | "none";
type Brief = { industry: string; companyName: string; location: string; audience: string; style: string; colorPreference: string; hasOwnImages: "yes" | "no"; pages: string };
type DesignSystem = {
  paletteName: string;
  colors: { page: string; surface: string; text: string; muted: string; accent: string; accentSoft: string };
  fontPair: "Inter + Source Serif" | "Manrope + Fraunces" | "Space Grotesk + Inter" | "IBM Plex Sans + IBM Plex Serif";
  buttonStyle: "solid" | "outline" | "soft" | "sharp";
  backgroundStyle: "clean" | "editorial" | "technical" | "luxury";
  spacingScale: "compact" | "balanced" | "generous";
  radiusScale: "none" | "small" | "medium" | "large";
  shadowStyle: "none" | "soft" | "crisp" | "deep";
};
type WebsiteSection = {
  id: string;
  type: SectionType;
  variant: string;
  orderIndex: number;
  content: Record<string, string>;
  imageUrls: string[];
  styleSettings: { backgroundColor?: string; textColor?: string; accentColor?: string; imagePosition?: ImagePosition; spacing?: DesignSystem["spacingScale"]; align?: "left" | "center" | "split" };
  animationSettings: { preset: "none" | "fade" | "rise" | "slide" | "scale"; intensity: "subtle" | "medium" };
  backgroundSettings: { kind: "solid" | "soft-gradient" | "image" | "editorial" | "pattern"; overlay?: "none" | "soft" | "strong"; graphicElement?: "none" | "grid" | "lines" | "frame" | "accent-block" };
};
type SeoSettings = { title: string; description: string; slug: string; language: string };
type AssetNeed = { id: string; type: string; title: string; priority: "essential" | "recommended" | "optional"; reason: string; sourcePolicy: "user-owned" | "canva-usable" | "ai-generated-usable" | "licensed-stock-required"; canvaPrompt?: string; status: "missing" | "planned" | "ready" };
type PublishingSettings = { mode: "draft" | "subdomain" | "custom-domain"; subdomain: string; customDomain: string; provider: "cloudflare-pages" | "vercel"; ssl: "automatic"; status: "not-started" | "ready-to-publish" | "published" };
type WebsiteDocument = { schemaVersion: 2; title: string; brief: Brief; seo: SeoSettings; designSystem: DesignSystem; sections: WebsiteSection[]; assetNeeds: AssetNeed[]; publishing: PublishingSettings };
type WebsiteProject = { id: string; title: string; website: WebsiteDocument; updatedAt: string; status?: "draft" | "published" | string; slug?: string };
type ImageAsset = { id: string; url: string; file_url?: string; file_name: string; content_type: string; file_type?: string; size: number; created_at: string; public?: boolean };
type UploadConfig = { allowedTypes: string[]; maxBytes: number; provider?: string; configured?: boolean };
type StudioIntegrations = {
  openai: { configured: boolean; model: string };
  netlify: { hosting: boolean; identity: boolean; functions: boolean; blobs: boolean; forms: boolean; deploys: boolean; domains: boolean; dataStore?: string; assetStore?: string };
  canva: { available: boolean; mode: string; use: string };
  publishing: { starter: string; premium: string; providers: string[]; ssl: string };
};
type AccountProfile = {
  id: string;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  company_name: string;
  industry: string;
  address: string;
  country: string;
  phone: string;
  website_domain: string;
  billing_address: string;
  vat_id: string;
  preferred_language: "de" | "en" | "fr" | "es" | "it" | "nl";
  branding_colors: { primary: string; secondary: string; accent: string };
  logo_url: string;
  avatar_url: string;
  plan: "free" | "basic" | "business" | "pro" | "admin";
  account_status: string;
  billing_provider?: string;
  billing_status?: string;
  billing_reference?: string;
  paypal_subscription_id?: string;
  subscription_status?: string;
  subscription_current_period_end?: string;
  subscription_cancelled_at?: string;
  subscription_last_event?: string;
  premium_access_active?: boolean;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
};
type AuthSession = { authenticated: boolean; user: { id: string; email: string }; profile: AccountProfile };
type AuthMode = "login" | "register" | "forgot";
type AuthForm = { email: string; password: string; displayName: string };
type ProfileForm = Omit<AccountProfile, "id" | "email" | "plan" | "account_status" | "billing_provider" | "billing_status" | "billing_reference" | "paypal_subscription_id" | "subscription_status" | "subscription_current_period_end" | "subscription_cancelled_at" | "subscription_last_event" | "premium_access_active" | "created_at" | "updated_at" | "last_login_at">;
type PublicPageKey = "home" | "pricing" | "features" | "examples" | "faq" | "contact" | "launchHelp" | "impressum" | "datenschutz" | "agb" | "widerruf" | "zahlungsbedingungen";
type PublicPageContent = { navLabel: string; title: string; intro: string; proof: string[]; sections: Array<{ title: string; body: string }> };
type PricingPlan = {
  id: AccountProfile["plan"];
  name: string;
  badge: string;
  monthly: string;
  description: string;
  audience: string;
  features: string[];
  limits: string[];
  cta: string;
  featured?: boolean;
};
type ExampleCase = {
  slug: string;
  title: string;
  industry: string;
  location: string;
  visual: "tax" | "dental" | "craft" | "fitness" | "real-estate" | "agency";
  layout: "executive" | "clinical" | "industrial" | "kinetic" | "luxury" | "minimal";
  style: string;
  summary: string;
  heroTitle: string;
  heroText: string;
  primaryCta: string;
  secondaryCta: string;
  colors: [string, string, string];
  typography: string;
  nav: string[];
  metrics: Array<{ value: string; label: string }>;
  sections: string[];
  highlights: string[];
  pagePlan: Array<{ title: string; body: string }>;
};
type ProtectedRoute = { kind: "dashboard" | "profile" | "websites" | "new-website" | "editor" | "billing" | "billing-success" | "publish"; websiteId?: string };
type LaunchService = { id: "launch-help" | "setup-service" | "premium-setup"; name: string; price: string; value: string; description: string; features: string[]; cta: string; featured?: boolean };

declare global {
  interface Window {
    paypalHosted?: {
      HostedButtons?: (options: { hostedButtonId: string }) => { render: (selector: string) => Promise<void> | void };
    };
    paypalSubscription?: {
      Buttons?: (options: {
        style: { shape: string; color: string; layout: string; label: string };
        createSubscription: (data: unknown, actions: { subscription: { create: (options: { plan_id: string; custom_id?: string }) => Promise<string> | string } }) => Promise<string> | string;
        onApprove: (data: { subscriptionID: string }) => void;
        onError?: (error: unknown) => void;
      }) => { render: (selector: string) => Promise<void> | void };
    };
  }
}

const uploadConfigDefault: UploadConfig = { allowedTypes: ["jpg", "jpeg", "png", "webp"], maxBytes: Number(import.meta.env.VITE_IMAGE_UPLOAD_MAX_BYTES || 5 * 1024 * 1024), configured: false };
const pageOptions = ["Startseite", "Leistungen", "Über uns", "Referenzen", "Preise", "FAQ", "Kontakt", "Team", "Ablauf", "Galerie", "Impressum", "Datenschutz"];
const requiredPages = new Set(["Startseite", "Kontakt"]);
const subscriptionPayPalClientId = import.meta.env.VITE_PAYPAL_SUBSCRIPTION_CLIENT_ID || "AYpTUnN15JcpJNpAl_EoTNHh87Ad2tJXqeikN2oWVRLgozIw9NFewlNCnqtj--eC24WFQAnMU7eXm-VM";
const subscriptionPayPalPlanIds: Partial<Record<AccountProfile["plan"], string>> = {
  basic: import.meta.env.VITE_PAYPAL_BASIC_SUBSCRIPTION_PLAN_ID || "P-75N62518ED122145SNILXN2Y",
  business: import.meta.env.VITE_PAYPAL_BUSINESS_SUBSCRIPTION_PLAN_ID || "P-78459601WB512822ENILXPCQ",
  pro: import.meta.env.VITE_PAYPAL_PRO_SUBSCRIPTION_PLAN_ID || "P-37230392XM0019717NILXOXA"
};
const hostedPayPalClientId = import.meta.env.VITE_PAYPAL_HOSTED_CLIENT_ID || "BAAAh0BwexhEqCc-x-aB7nAugoGa-LHMtpTifBYJ9xVvUftpbeU2w2St-LTa1AfgwOuoRX7pQCtgzunnMo";
const launchHostedPayPalButtonIds: Partial<Record<LaunchService["id"], string>> = {
  "launch-help": import.meta.env.VITE_PAYPAL_LAUNCH_HELP_HOSTED_BUTTON_ID || "METBAPJM5CLFS",
  "setup-service": import.meta.env.VITE_PAYPAL_SETUP_SERVICE_HOSTED_BUTTON_ID || "ZB74AHP2ESKE4",
  "premium-setup": import.meta.env.VITE_PAYPAL_PREMIUM_SETUP_HOSTED_BUTTON_ID || "2D665UL45H6Z2"
};
const subscriptionPayPalButtonStyles: Partial<Record<AccountProfile["plan"], { shape: string; color: string; layout: string; label: string }>> = {
  basic: { shape: "rect", color: "black", layout: "horizontal", label: "subscribe" },
  business: { shape: "rect", color: "black", layout: "horizontal", label: "subscribe" },
  pro: { shape: "rect", color: "black", layout: "horizontal", label: "subscribe" }
};
const launchServices: LaunchService[] = [
  {
    id: "launch-help",
    name: "Launch-Hilfe",
    price: "49 EUR",
    value: "49.00",
    description: "Ein kurzer professioneller Check vor dem Veröffentlichen.",
    features: ["Struktur- und Farbcheck", "SEO-Grunddaten prüfen", "Subdomain-Veröffentlichung begleiten", "Konkrete To-do-Liste"],
    cta: "Launch-Hilfe buchen"
  },
  {
    id: "setup-service",
    name: "Setup-Service",
    price: "149 EUR",
    value: "149.00",
    description: "Gemeinsame Einrichtung für Kunden, die schneller zu einem sauberen Ergebnis wollen.",
    features: ["Startseitenstruktur einrichten", "Branding-Farben abstimmen", "Kontaktformular vorbereiten", "Domain-Vorbereitung"],
    cta: "Setup buchen",
    featured: true
  },
  {
    id: "premium-setup",
    name: "Premium-Setup",
    price: "349 EUR",
    value: "349.00",
    description: "Mehr Feinschliff für stärkere Bildsprache, Seitenstruktur und Launch-Qualität.",
    features: ["Mehrseitige Struktur schärfen", "Asset-Briefing und Bildsprache", "SEO-Feinschliff", "Launch-Abnahme"],
    cta: "Premium-Setup buchen"
  }
];
const emptyProfileForm: ProfileForm = {
  display_name: "",
  first_name: "",
  last_name: "",
  company_name: "",
  industry: "",
  address: "",
  country: "",
  phone: "",
  website_domain: "",
  billing_address: "",
  vat_id: "",
  preferred_language: "de",
  branding_colors: { primary: "#24796f", secondary: "#151c1b", accent: "#8fd3cc" },
  logo_url: "",
  avatar_url: ""
};

const sectionTypes: SectionType[] = ["hero", "about", "services", "pricing", "gallery", "testimonials", "faq", "contact", "team", "process", "beforeAfter", "cta", "footer"];
const sectionLabels: Record<SectionType, string> = { hero: "Hero", about: "Über uns", services: "Leistungen", pricing: "Preise", gallery: "Galerie", testimonials: "Stimmen", faq: "FAQ", contact: "Kontakt", team: "Team", process: "Ablauf", beforeAfter: "Vorher/Nachher", cta: "Handlungsaufruf", footer: "Fußzeile" };
const sectionVariants: Record<SectionType, string[]> = {
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
const multiImageSections = new Set<SectionType>(["gallery", "services", "testimonials", "pricing", "team", "beforeAfter"]);
const imagePositions: ImagePosition[] = ["left", "right", "top", "background", "none"];
const spacings: DesignSystem["spacingScale"][] = ["compact", "balanced", "generous"];
const radii: DesignSystem["radiusScale"][] = ["none", "small", "medium", "large"];
const shadows: DesignSystem["shadowStyle"][] = ["none", "soft", "crisp", "deep"];
const buttonStyles: DesignSystem["buttonStyle"][] = ["solid", "outline", "soft", "sharp"];
const fontPairs: DesignSystem["fontPair"][] = ["Inter + Source Serif", "Manrope + Fraunces", "Space Grotesk + Inter", "IBM Plex Sans + IBM Plex Serif"];
const backgroundKinds: WebsiteSection["backgroundSettings"]["kind"][] = ["solid", "soft-gradient", "image", "editorial", "pattern"];
const graphicElements: NonNullable<WebsiteSection["backgroundSettings"]["graphicElement"]>[] = ["none", "grid", "lines", "frame", "accent-block"];
const publicPages: Record<PublicPageKey, PublicPageContent> = {
  home: {
    navLabel: "Start",
    title: "AI Website Studio für Firmenwebsites mit eigener Handschrift.",
    intro: "DexHost verbindet KI-Entwurf, professionellen Block-Editor und sichere Veröffentlichung. Besucher können Angebot und Beispiele ansehen, ein Konto wird erst beim Öffnen des Baukastens gebraucht.",
    proof: ["Öffentliche Seiten ohne Anmeldung", "Editor nur nach sicherer Prüfung", "Speicher und Funktionen vorbereitet"],
    sections: [
      { title: "Design mit Kontrolle", body: "Die KI erstellt Struktur, Varianten, Farben und Texte. Der Nutzer entscheidet anschließend über Abschnitte, Layouts, Bilder, SEO und Veröffentlichung." },
      { title: "Keine Gleichförmigkeit", body: "Section-Reihenfolge, Bildpositionen, Typografie und Designsystem werden kombiniert, damit Websites nicht wie dieselbe Vorlage wirken." },
      { title: "Schlanker MVP-Stack", body: "Hosting, Anmeldung, Funktionen, Speicher, Formulare und Veröffentlichungen sind vorbereitet." }
    ]
  },
  pricing: {
    navLabel: "Preise",
    title: "Tarife, die klein starten und professionell wachsen.",
    intro: "Der kostenlose Einstieg eignet sich für Entwurf und Bearbeitung. Veröffentlichung und eigene Domains werden serverseitig freigeschaltet.",
    proof: ["Free zum Starten", "Basic zum Launch", "Business und Pro für Teams"],
    sections: [
      { title: "Free", body: "Website planen, AI-Struktur erzeugen und den Editor testen." },
      { title: "Basic", body: "Subdomain-Veröffentlichung, sichere Verbindung und laufende Bearbeitung." },
      { title: "Business / Pro", body: "Eigene Domains, mehr Assets, erweitertes Branding und priorisierte Workflows." }
    ]
  },
  features: {
    navLabel: "Funktionen",
    title: "Ein kontrollierbarer KI-Block-Builder statt starrem Template.",
    intro: "DexHost ist für Nutzer gebaut, die selbst bestimmen wollen: Texte, Bilder, Farben, Abstände, Varianten, SEO und Launch bleiben editierbar.",
    proof: ["Block-Editor", "Bild-Uploads", "SEO und mobile Vorschau"],
    sections: [
      { title: "Abschnitt-System", body: "Hero, Über uns, Leistungen, Preise, Galerie, Stimmen, FAQ, Kontakt, Team, Ablauf, Vorher/Nachher, CTA und Fußzeile mit Varianten." },
      { title: "Assets", body: "Eigene Bilder haben Vorrang. Canva- und KI-Assets werden als verwendbar gekennzeichnet." },
      { title: "Sicherheit", body: "Speichern, Upload, KI-Aufrufe, Tarifprüfung und Veröffentlichung laufen serverseitig." }
    ]
  },
  examples: {
    navLabel: "Beispiele",
    title: "Echte Website-Beispiele auf Agentur-Niveau.",
    intro: "Sechs Branchen, sechs eigene Designs: große Browser-Vorschauen, echte Bildsprache und Detailseiten zum Öffnen.",
    proof: ["6 Branchen", "große Live-Vorschauen", "eigene Unterseiten"],
    sections: [
      { title: "Technisch", body: "Dunkles Designsystem, klare Panels, reduzierte Akzente und produktnahe Bildflächen." },
      { title: "Elegant", body: "Ruhige Typografie, großzügige Abstände, redaktionelle Bildkomposition und starke Kontaktführung." },
      { title: "Lokal", body: "Vertrauen, Standort, Leistungen und direkte Anfrage stehen im Vordergrund." }
    ]
  },
  faq: {
    navLabel: "FAQ",
    title: "Antworten für den Start mit DexHost.",
    intro: "Der Baukasten bleibt bewusst fokussiert: starke Firmenwebsite, kontrollierbare Abschnitte, sichere Konten und günstiger Launch.",
    proof: ["Kein freies Drag-and-drop", "Serverseitige Rechte", "Netlify als Hauptplattform"],
    sections: [
      { title: "Brauche ich sofort ein Konto?", body: "Nein. Homepage, Funktionen, Preise und Beispiele sind öffentlich. Das Konto wird erst für den Baukasten gebraucht." },
      { title: "Kann ich eigene Bilder nutzen?", body: "Ja. JPG, JPEG, PNG und WEBP sind erlaubt, die maximale Größe ist konfigurierbar." },
      { title: "Wer entscheidet über Veröffentlichung?", body: "Nicht der Browser. DexHost prüft Nutzer, Website-Besitz und Tarif serverseitig." }
    ]
  },
  contact: {
    navLabel: "Kontakt",
    title: "Sprechen wir über den ersten hochwertigen Website-Launch.",
    intro: "Das Kontaktformular ist vorbereitet. Für Produktzugriff führt der Weg bewusst über Anmeldung oder Registrierung.",
    proof: ["Kontaktformular", "Schnelle Rückmeldung", "Schlanker Start"],
    sections: [
      { title: "Projektanfrage", body: "Beschreibe Branche, Zielgruppe, Stil und vorhandene Bilder." },
      { title: "Technik", body: "Hosting, Funktionen, Speicher und Veröffentlichung halten die Plattform schlank." },
      { title: "Launch", body: "Kostenlose Subdomain zuerst, eigene Domain später als Premium-Funktion." }
    ]
  },
  launchHelp: {
    navLabel: "Launch-Hilfe",
    title: "Einmalige Launch-Hilfe, wenn es schneller professionell wirken soll.",
    intro: "Die monatlichen Tarife bleiben selbst bedienbar. Wer weniger Zeit investieren möchte, bucht einmalig Hilfe für Check, Setup oder Premium-Feinschliff.",
    proof: ["Einmalzahlung", "PayPal sicher geprüft", "Keine Pflicht-Einrichtung"],
    sections: [
      { title: "Launch-Hilfe", body: "Kurzer Check von Struktur, Farben, SEO-Grunddaten und Veröffentlichung." },
      { title: "Setup-Service", body: "Geführte Einrichtung mit Branding, Startseite, Kontaktformular und Domain-Vorbereitung." },
      { title: "Premium-Setup", body: "Mehr Tiefe bei Seitenstruktur, Bildsprache, Assets und Launch-Abnahme." }
    ]
  },
  impressum: {
    navLabel: "Impressum",
    title: "Impressum",
    intro: "Angaben gemäß § 5 DDG. Die folgenden Daten müssen vor Veröffentlichung mit den aktuellen DexSolutions-Unternehmensdaten abgeglichen werden.",
    proof: ["Anbieterkennzeichnung", "Kontakt", "Verantwortlichkeit"],
    sections: [
      { title: "Diensteanbieter", body: "DexSolutions / Betreiber von DexHost\n[Rechtsform ergänzen]\n[Vor- und Nachname bzw. Gesellschaft]\n[Anschrift laut dexsolutions.de]\n[PLZ und Ort]\nDeutschland" },
      { title: "Kontakt", body: "E-Mail: [E-Mail-Adresse laut dexsolutions.de]\nTelefon: [Telefonnummer ergänzen]\nWebsite: https://dexhost.netlify.app" },
      { title: "Vertretung und Register", body: "Vertreten durch: [Geschäftsführung/Inhaber ergänzen]\nRegistergericht: [falls vorhanden]\nRegisternummer: [falls vorhanden]\nUmsatzsteuer-ID gemäß § 27a UStG: [falls vorhanden]" },
      { title: "Verantwortlich für Inhalte", body: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: [Name und Anschrift ergänzen]." },
      { title: "Streitbeilegung", body: "Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen." },
      { title: "Haftung und Urheberrecht", body: "Die Inhalte dieser Website werden mit größter Sorgfalt erstellt. Für Richtigkeit, Vollständigkeit und Aktualität übernehmen wir keine Gewähr. Eigene Inhalte, Designs, Texte und Grafiken unterliegen dem Urheberrecht. Eine Verwendung außerhalb der gesetzlichen Grenzen bedarf der vorherigen Zustimmung." }
    ]
  },
  datenschutz: {
    navLabel: "Datenschutz",
    title: "Datenschutzerklärung",
    intro: "Diese Datenschutzerklärung beschreibt, wie DexHost personenbezogene Daten verarbeitet. Bitte vor Livegang mit den tatsächlich eingesetzten Diensten und Anbieterangaben abgleichen.",
    proof: ["DSGVO-Entwurf", "Netlify", "Resend und PayPal"],
    sections: [
      { title: "Verantwortlicher", body: "Verantwortlich für die Datenverarbeitung ist DexSolutions / Betreiber von DexHost, [Anschrift], E-Mail: [E-Mail-Adresse]." },
      { title: "Hosting und Server-Logs", body: "DexHost wird über Netlify betrieben. Beim Besuch der Website können technisch notwendige Zugriffsdaten verarbeitet werden, etwa IP-Adresse, Datum und Uhrzeit, Browser, Betriebssystem, Referrer und aufgerufene Seiten. Die Verarbeitung erfolgt zur Bereitstellung, Sicherheit und Stabilität der Website auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO." },
      { title: "Registrierung und Login", body: "Bei der Registrierung verarbeiten wir E-Mail-Adresse, Passwort in gehashter Form, Anzeigename, Session-Daten und Zeitpunkte der Anmeldung. Diese Daten sind erforderlich, um ein Nutzerkonto bereitzustellen und geschützte Funktionen anzubieten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO." },
      { title: "E-Mail-Versand mit Resend", body: "Für E-Mail-Bestätigung und Passwort-Reset nutzen wir Resend. Dabei werden E-Mail-Adresse, Versanddaten und technische Zustellinformationen verarbeitet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO." },
      { title: "Website-Projekte und Bilder", body: "Nutzer können Website-Daten, Texte, Profilangaben, Firmenangaben, Bilder, Logos und andere Assets speichern. Diese Daten werden projektbezogen verarbeitet, um den Website-Baukasten bereitzustellen." },
      { title: "KI-Funktionen", body: "Wenn KI-Funktionen genutzt werden, können vom Nutzer eingegebene Projektinformationen an OpenAI übermittelt werden, um Texte, Struktur- oder Designvorschläge zu erzeugen. Es sollten keine unnötigen sensiblen Daten eingegeben werden." },
      { title: "Zahlungen über PayPal", body: "Für Abonnements und Einmalzahlungen wird PayPal eingesetzt. Zahlungsdaten werden durch PayPal verarbeitet; DexHost speichert nur zahlungsbezogene Referenzen, Tarifstatus und Buchungsinformationen." },
      { title: "Kontaktformulare", body: "Bei Kontaktanfragen verarbeiten wir die angegebenen Daten zur Bearbeitung der Anfrage. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO bzw. Art. 6 Abs. 1 lit. f DSGVO." },
      { title: "Speicherdauer und Rechte", body: "Daten werden nur so lange gespeichert, wie sie für Konto, Vertrag, Sicherheit und gesetzliche Aufbewahrungspflichten erforderlich sind. Betroffene haben Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Beschwerde bei einer Aufsichtsbehörde." }
    ]
  },
  agb: {
    navLabel: "AGB",
    title: "Allgemeine Geschäftsbedingungen",
    intro: "Entwurf für die Nutzung von DexHost als AI Website Studio. Bitte vor produktivem Vertrieb rechtlich prüfen lassen.",
    proof: ["Nutzung", "Tarife", "Pflichten"],
    sections: [
      { title: "Geltungsbereich", body: "Diese AGB gelten für die Nutzung von DexHost, einem webbasierten Website-Studio zur Erstellung, Bearbeitung und Veröffentlichung von Firmenwebsites." },
      { title: "Leistungsumfang", body: "DexHost stellt einen kontrollierbaren Block-Editor, KI-gestützte Vorschläge, Bildverwaltung, Profilfunktionen, Vorschauen und je nach Tarif Veröffentlichungsfunktionen bereit. Die konkrete Verfügbarkeit einzelner Funktionen richtet sich nach dem gewählten Tarif." },
      { title: "Nutzerkonto", body: "Für die Nutzung des Editors ist ein Konto erforderlich. Nutzer müssen zutreffende Angaben machen und Zugangsdaten vertraulich behandeln. Der Anbieter darf Zugänge sperren, wenn Missbrauch, Sicherheitsrisiken oder Zahlungsverzug vorliegen." },
      { title: "Inhalte der Nutzer", body: "Nutzer sind für Texte, Bilder, Logos, Marken, Domains und sonstige Inhalte selbst verantwortlich. Es dürfen nur Inhalte verwendet werden, für die ausreichende Rechte bestehen." },
      { title: "KI-Vorschläge", body: "KI-generierte Inhalte sind Vorschläge. Nutzer müssen Texte, Rechtmäßigkeit, Richtigkeit, Bildrechte, Markenrechte und branchenspezifische Aussagen vor Veröffentlichung prüfen." },
      { title: "Verfügbarkeit", body: "Der Anbieter bemüht sich um eine stabile Bereitstellung. Wartung, Updates, Störungen bei Drittanbietern oder höhere Gewalt können die Verfügbarkeit zeitweise einschränken." },
      { title: "Preise und Zahlung", body: "Es gelten die auf der Preiseseite angegebenen Tarife. Abonnements werden monatlich abgerechnet. Optionale Launch-Hilfen und Setup-Leistungen sind Einmalzahlungen." },
      { title: "Kündigung", body: "Monatliche Tarife können grundsätzlich zum Ende des laufenden Abrechnungszeitraums gekündigt werden, sofern im Zahlungsanbieter nichts Abweichendes geregelt ist." },
      { title: "Haftung", body: "Der Anbieter haftet unbeschränkt bei Vorsatz, grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Im Übrigen haftet der Anbieter nur nach den gesetzlichen Vorschriften." },
      { title: "Schlussbestimmungen", body: "Es gilt deutsches Recht. Vertragssprache ist Deutsch. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt." }
    ]
  },
  widerruf: {
    navLabel: "Widerruf",
    title: "Widerrufsbelehrung",
    intro: "Entwurf für Verbraucher. Bei reinem B2B-Angebot kann eine andere Regelung sinnvoll sein. Bitte vor Livegang prüfen lassen.",
    proof: ["14 Tage", "Digitale Leistung", "Setup-Service"],
    sections: [
      { title: "Widerrufsrecht", body: "Verbraucher haben grundsätzlich das Recht, binnen vierzehn Tagen ohne Angabe von Gründen einen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab Vertragsschluss." },
      { title: "Ausübung des Widerrufs", body: "Um das Widerrufsrecht auszuüben, muss der Nutzer den Anbieter mittels eindeutiger Erklärung per E-Mail oder Brief über den Entschluss informieren, den Vertrag zu widerrufen. Kontakt: [E-Mail-Adresse und Anschrift ergänzen]." },
      { title: "Folgen des Widerrufs", body: "Wenn der Vertrag widerrufen wird, erstatten wir alle erhaltenen Zahlungen unverzüglich und spätestens binnen vierzehn Tagen ab Eingang der Widerrufserklärung. Für die Rückzahlung verwenden wir dasselbe Zahlungsmittel, sofern nichts anderes vereinbart wurde." },
      { title: "Digitale Inhalte und Dienstleistungen", body: "Bei digitalen Leistungen kann das Widerrufsrecht vorzeitig erlöschen, wenn der Nutzer ausdrücklich zustimmt, dass mit der Ausführung vor Ablauf der Widerrufsfrist begonnen wird, und bestätigt, dass er dadurch sein Widerrufsrecht verliert." },
      { title: "Setup- und Launch-Hilfen", body: "Bei individuell erbrachten Setup- oder Launch-Leistungen kann Wertersatz verlangt werden, wenn der Nutzer ausdrücklich verlangt hat, dass die Leistung vor Ablauf der Widerrufsfrist beginnt." },
      { title: "Muster-Widerruf", body: "Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Nutzung von DexHost bzw. die gebuchte Leistung. Name, E-Mail-Adresse, Bestelldatum, Datum und Unterschrift bei postalischer Zusendung." }
    ]
  },
  zahlungsbedingungen: {
    navLabel: "Zahlungsbedingungen",
    title: "Zahlungs- und Abo-Hinweise",
    intro: "Diese Hinweise erklären Tarife, Abos, Einmalzahlungen und Freischaltungen bei DexHost.",
    proof: ["PayPal", "Monatliche Tarife", "Einmalige Setup-Leistungen"],
    sections: [
      { title: "Monatliche Tarife", body: "DexHost bietet Free, Basic, Business und Pro. Kostenpflichtige Tarife werden monatlich berechnet und schalten je nach Tarif Speicher, Veröffentlichung, Branding und weitere Funktionen frei." },
      { title: "Free-Tarif", body: "Der Free-Tarif dient zum Testen und Entwerfen. Öffentliche Veröffentlichung, eigene Domains oder bestimmte Premiumfunktionen können eingeschränkt sein." },
      { title: "PayPal-Abos", body: "Monatliche Zahlungen werden über PayPal abgewickelt. Die Freischaltung erfolgt erst, nachdem DexHost die Zahlung bzw. das Abo serverseitig bestätigt hat." },
      { title: "Einmalzahlungen", body: "Launch-Hilfe, Setup-Service und Premium-Setup sind optionale Einmalzahlungen. Sie ersetzen kein Monatsabo und ändern nicht automatisch den Tarif." },
      { title: "Freischaltung", body: "Tarif- und Veröffentlichungsrechte werden nicht im Browser gespeichert, sondern serverseitig geprüft. Dadurch kann ein Nutzer keine kostenpflichtige Funktion durch lokale Änderungen freischalten." },
      { title: "Kündigung und fehlgeschlagene Zahlungen", body: "Abos können über PayPal bzw. die jeweils bereitgestellte Kontoverwaltung gekündigt werden. Bei fehlgeschlagenen Zahlungen können kostenpflichtige Funktionen eingeschränkt oder pausiert werden." },
      { title: "Preise und Steuern", body: "Alle Preise verstehen sich, soweit nicht anders angegeben, zuzüglich gesetzlicher Umsatzsteuer. Maßgeblich sind die Angaben auf der Preiseseite zum Zeitpunkt der Buchung." }
    ]
  }
};

const pricingPlans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    badge: "Zum Ausprobieren",
    monthly: "0 EUR",
    description: "Für erste Entwürfe, Briefings und interne Tests im DexHost Studio.",
    audience: "Du kannst die Website selbst einrichten, Texte ändern, Farben wählen und Layouts testen.",
    features: ["KI-Briefing und Website-Struktur", "Block-Editor mit Layout-Varianten", "Farben, Texte und SEO bearbeiten", "Eigene Bilder im Entwurf testen"],
    limits: ["Keine öffentliche Veröffentlichung", "Keine eigene Domain", "DexHost Wasserzeichen in Vorschauen"],
    cta: "Kostenlos starten"
  },
  {
    id: "basic",
    name: "Basic",
    badge: "Günstiger Start",
    monthly: "9 EUR",
    description: "Für Nutzer, die ihre Website selbst bauen und regelmäßig speichern möchten.",
    audience: "Verhältnismäßiger Einstieg für Selbstständige, kleine Projekte und erste Firmenwebsites.",
    features: ["Alles aus Free", "Projekte dauerhaft speichern", "Website-Vorschau teilen", "Kontaktformular vorbereiten", "Bis zu 2 Websites", "Bis zu 250 MB Bildspeicher"],
    limits: ["Eigene Domain nicht enthalten", "Basis-Support per E-Mail"],
    cta: "Basic starten"
  },
  {
    id: "business",
    name: "Business",
    badge: "Beliebt",
    monthly: "19 EUR",
    description: "Für echte Firmenwebsites mit Veröffentlichung, Subdomain, sicherer Verbindung und stärkerem Branding.",
    audience: "Der beste Standardtarif, wenn die Website öffentlich und professionell nutzbar sein soll.",
    features: ["Alles aus Basic", "Veröffentlichung auf DexHost Subdomain", "Sichere Verbindung automatisch", "Mehrseitige Website-Struktur", "Erweiterte Branding-Farben", "Bis zu 5 Websites", "Bis zu 1 GB Bildspeicher"],
    limits: ["Domainkosten extern", "Individuelle Texte nach Aufwand"],
    cta: "Business wählen",
    featured: true
  },
  {
    id: "pro",
    name: "Pro",
    badge: "Mehr Kontrolle",
    monthly: "49 EUR",
    description: "Für Teams, mehrere Websites, eigene Domain-Vorbereitung und umfangreichere Assets.",
    audience: "Für Kunden, die selbst arbeiten möchten, aber mehr Spielraum und professionellere Workflows brauchen.",
    features: ["Alles aus Business", "Eigene Domain vorbereiten", "Mehrere Landingpages", "Erweiterte Asset-Liste", "Trust-Elemente und Vergleichssections", "Bis zu 15 Websites", "Bis zu 5 GB Bildspeicher"],
    limits: ["Externe Lizenzen separat", "Custom-Integrationen nach Angebot"],
    cta: "Pro wählen"
  }
];
const paidPricingPlans = pricingPlans.filter((plan) => ["basic", "business", "pro"].includes(plan.id));

const exampleCases: ExampleCase[] = [
  {
    slug: "steuerkanzlei-mueller-partner",
    title: "Müller & Partner",
    industry: "Steuerkanzlei",
    location: "München",
    visual: "tax",
    layout: "executive",
    style: "elegant, seriös, editorial",
    summary: "Ein Kanzlei-Auftritt mit ruhiger Bildsprache, klarer Mandantenführung und seriöser Typografie.",
    heroTitle: "Steuerberatung für Unternehmer, die Klarheit erwarten.",
    heroText: "Digitale Prozesse, verlässliche Abschlüsse und persönliche Beratung für Mandanten, die Entscheidungen fundiert treffen wollen.",
    primaryCta: "Erstgespräch vereinbaren",
    secondaryCta: "Leistungen ansehen",
    colors: ["#18312f", "#f5f1e8", "#b58b52"],
    typography: "Serif Headline + ruhige Sans",
    nav: ["Leistungen", "Kanzlei", "Mandanten", "Kontakt"],
    metrics: [{ value: "25+", label: "Jahre Erfahrung" }, { value: "4,9", label: "Mandantenrating" }, { value: "48h", label: "Antwortzeit" }],
    sections: ["Hero editorial-split", "Leistungen service-rows", "Team leadership", "FAQ support-led", "Kontakt office"],
    highlights: ["Mandantenaufnahme", "Digitale Buchhaltung", "Unternehmensberatung"],
    pagePlan: [
      { title: "Startseite", body: "Hero mit persönlichem Kanzlei-Versprechen, klare Leistungen und direkter Termin-CTA." },
      { title: "Leistungen", body: "Steuern, Lohn, Jahresabschluss und Beratung in ruhigen Service-Zeilen." },
      { title: "Kontakt", body: "Office-Block mit Adresse, Öffnungszeiten und Anfrageformular über Netlify Forms." }
    ]
  },
  {
    slug: "nordlicht-dental",
    title: "Nordlicht Dental",
    industry: "Zahnarztpraxis",
    location: "Hamburg",
    visual: "dental",
    layout: "clinical",
    style: "hell, modern, clean",
    summary: "Eine Praxis-Website mit viel Licht, beruhigender Navigation und hochwertiger medizinischer Bildsprache.",
    heroTitle: "Moderne Zahnmedizin in ruhiger Atmosphäre.",
    heroText: "Prophylaxe, ästhetische Zahnmedizin und Implantologie mit klarer Beratung und sanfter Terminführung.",
    primaryCta: "Termin buchen",
    secondaryCta: "Praxis ansehen",
    colors: ["#0f5f78", "#f7fbfc", "#8fd3cc"],
    typography: "klare Sans + weiche Akzente",
    nav: ["Behandlungen", "Praxis", "Team", "Termin"],
    metrics: [{ value: "12", label: "Behandlungsräume" }, { value: "98%", label: "Weiterempfehlung" }, { value: "Mo-Sa", label: "Sprechzeiten" }],
    sections: ["Hero center-stage", "Leistungen premium-cards", "Vorher/Nachher split-proof", "Stimmen proof-band", "FAQ accordion"],
    highlights: ["Online-Termin", "Angstpatienten", "Ästhetische Zahnmedizin"],
    pagePlan: [
      { title: "Startseite", body: "Freundlicher Hero, drei Kernleistungen und ein sichtbarer Termin-Button." },
      { title: "Behandlungen", body: "Prophylaxe, Implantologie und Ästhetik als eigenständige Blöcke mit Bildtausch." },
      { title: "Team", body: "Portrait-orientierte Team-Section mit Rollen und kurzem Vertrauensaufbau." }
    ]
  },
  {
    slug: "kraftwerk-elektrotechnik",
    title: "Kraftwerk Elektro",
    industry: "Handwerksbetrieb",
    location: "Dortmund",
    visual: "craft",
    layout: "industrial",
    style: "kräftig, industriell, technisch",
    summary: "Eine Handwerksseite mit großem Projektbild, robustem Raster, klaren Einsatzbereichen und schneller Anfrage für Gewerbekunden.",
    heroTitle: "Elektrotechnik für Industrie, Gewerbe und PV-Projekte.",
    heroText: "Von der Planung bis zur Abnahme: saubere Installationen, belastbare Wartung und schnelle Einsatzteams im Ruhrgebiet.",
    primaryCta: "Projekt anfragen",
    secondaryCta: "Referenzen öffnen",
    colors: ["#161d26", "#f4f7f5", "#f4b86a"],
    typography: "technische Sans + kompakte Labels",
    nav: ["Gewerbe", "PV", "Projekte", "Notdienst"],
    metrics: [{ value: "24/7", label: "Service" }, { value: "140+", label: "Projekte" }, { value: "DIN", label: "geprüfte Prozesse" }],
    sections: ["Hero product-panel", "Ablauf timeline", "Galerie strip", "Leistungen capability-matrix", "CTA banner"],
    highlights: ["Gewerbeinstallationen", "PV-Anlagen", "Wartung"],
    pagePlan: [
      { title: "Startseite", body: "Starker Hero mit Einsatzgebiet, Notfall-Hinweis und Leistungsübersicht." },
      { title: "Projekte", body: "Galerie mit Baustellen, Technikräumen und Vorher/Nachher-Blöcken." },
      { title: "Ablauf", body: "Vom Erstkontakt über Planung bis Abnahme als nachvollziehbarer Prozess." }
    ]
  },
  {
    slug: "pulsewerk-fitness",
    title: "Pulsewerk Fitness",
    industry: "Fitnessstudio",
    location: "Berlin",
    visual: "fitness",
    layout: "kinetic",
    style: "dynamisch, urban, hochwertig",
    summary: "Ein energiegeladener Fitness-Auftritt mit starker Hero-Fläche, Kurslogik, Mitgliedschaften und motivierender Bildsprache.",
    heroTitle: "Training, das sich nach Fortschritt anfühlt.",
    heroText: "Personal Training, Strength Classes und Recovery in einem Studio, das Performance und Atmosphäre zusammenbringt.",
    primaryCta: "Probetraining buchen",
    secondaryCta: "Kurse ansehen",
    colors: ["#101114", "#f6f0e8", "#ff5a3d"],
    typography: "fette Sans + bewegte Akzente",
    nav: ["Training", "Kurse", "Coaches", "Preise"],
    metrics: [{ value: "42", label: "Kurse/Woche" }, { value: "8", label: "Coaches" }, { value: "06-23", label: "geöffnet" }],
    sections: ["Hero cinematic", "Ablauf steps", "Preise highlight", "Stimmen featured-story", "CTA banner"],
    highlights: ["Probetraining", "Strength Classes", "Personal Coaching"],
    pagePlan: [
      { title: "Startseite", body: "Großes Studiofoto, starker Kurs-CTA und sofort sichtbare Mitgliedschaften." },
      { title: "Training", body: "Strength, Conditioning und Recovery als unterschiedliche Layout-Bänder statt Icon-Reihe." },
      { title: "Preise", body: "Klare Pakete mit Probemonat, Mitgliedschaft und Personal Training." }
    ]
  },
  {
    slug: "eichenhain-immobilien",
    title: "Eichenhain Immobilien",
    industry: "Immobilien",
    location: "Köln",
    visual: "real-estate",
    layout: "luxury",
    style: "luxuriös, ruhig, architektonisch",
    summary: "Eine hochwertige Immobilien-Website mit großem Objektfokus, diskreter Typografie und klarer Verkäuferführung.",
    heroTitle: "Exklusive Immobilien mit diskreter Vermarktung.",
    heroText: "Architektonische Bildwelten, kuratierte Objekte und persönliche Beratung für Eigentümer und Käufer im Premiumsegment.",
    primaryCta: "Immobilie bewerten",
    secondaryCta: "Objekte ansehen",
    colors: ["#2a211b", "#fffaf2", "#846039"],
    typography: "edle Serif + reduzierte Sans",
    nav: ["Objekte", "Verkauf", "Bewertung", "Kontakt"],
    metrics: [{ value: "1,2 Mrd.", label: "Vermarktungsvolumen" }, { value: "31", label: "Premiumlagen" }, { value: "Diskret", label: "Off-Market" }],
    sections: ["Hero editorial-split", "Galerie masonry", "Über uns founder-story", "Vorher/Nachher storyline", "Kontakt consultation"],
    highlights: ["Objektbewertung", "Off-Market", "Premiumlagen"],
    pagePlan: [
      { title: "Startseite", body: "Editorialer Hero, große Objektbilder und ein ruhiger Einstieg in Verkauf oder Suche." },
      { title: "Objekte", body: "Luxuriöse Objektgalerie mit Lage, Fläche und diskreter Anfrageführung." },
      { title: "Bewertung", body: "Consultation-Block für Eigentümer, Objektart und Vermarktungsziel." }
    ]
  },
  {
    slug: "studio-nova",
    title: "Studio Nova",
    industry: "Agentur",
    location: "Hamburg",
    visual: "agency",
    layout: "minimal",
    style: "modern, minimalistisch, präzise",
    summary: "Eine reduzierte Agentur-Website mit starkem Case-Einstieg, präziser Typografie und viel Raum für Portfolio-Arbeit.",
    heroTitle: "Digitale Markenauftritte mit Strategie und Haltung.",
    heroText: "Branding, Websites und Launch-Systeme für Unternehmen, die Klarheit, Geschwindigkeit und ein hochwertiges digitales Gefühl brauchen.",
    primaryCta: "Projekt starten",
    secondaryCta: "Cases ansehen",
    colors: ["#111315", "#f5f5f0", "#7c5cff"],
    typography: "minimalistische Sans + monospaced Details",
    nav: ["Arbeiten", "Studio", "Prozess", "Kontakt"],
    metrics: [{ value: "18", label: "Launches/Jahr" }, { value: "4", label: "Wochen Sprint" }, { value: "Aww.", label: "Designniveau" }],
    sections: ["Hero minimal", "Leistungen feature-band", "Galerie spotlight", "Ablauf lab", "Kontakt split-form"],
    highlights: ["Brand Strategy", "Webdesign", "Launch-Systeme"],
    pagePlan: [
      { title: "Startseite", body: "Minimaler Hero mit Portfolio-Fokus, klarer Positionierung und direktem Projekt-CTA." },
      { title: "Cases", body: "Große Case-Flächen mit Resultaten, Bildsprache und kurzen Projektgeschichten." },
      { title: "Prozess", body: "Strategie, Designsystem, Umsetzung und Launch in einem präzisen Ablauf." }
    ]
  }
];

const designSystems: DesignSystem[] = [
  { paletteName: "DexHost Studio", colors: { page: "#f7f9f7", surface: "#ffffff", text: "#151c1b", muted: "#697574", accent: "#24796f", accentSoft: "#dcecea" }, fontPair: "Manrope + Fraunces", buttonStyle: "solid", backgroundStyle: "editorial", spacingScale: "generous", radiusScale: "medium", shadowStyle: "soft" },
  { paletteName: "Clinical Signal", colors: { page: "#f5f9fb", surface: "#ffffff", text: "#102033", muted: "#66768a", accent: "#176b87", accentSoft: "#d9edf3" }, fontPair: "Inter + Source Serif", buttonStyle: "soft", backgroundStyle: "clean", spacingScale: "generous", radiusScale: "medium", shadowStyle: "soft" },
  { paletteName: "Technical Graphite", colors: { page: "#0f141a", surface: "#161d26", text: "#f5f7fb", muted: "#9ba8b8", accent: "#8fd3cc", accentSoft: "#17363b" }, fontPair: "Space Grotesk + Inter", buttonStyle: "outline", backgroundStyle: "technical", spacingScale: "balanced", radiusScale: "small", shadowStyle: "deep" },
  { paletteName: "Executive Stone", colors: { page: "#f4f1eb", surface: "#fffaf2", text: "#181713", muted: "#716c62", accent: "#846039", accentSoft: "#eadfce" }, fontPair: "IBM Plex Sans + IBM Plex Serif", buttonStyle: "sharp", backgroundStyle: "luxury", spacingScale: "generous", radiusScale: "small", shadowStyle: "crisp" }
];

const fields: Record<SectionType, Array<{ key: string; label: string; multiline?: boolean }>> = {
  hero: [{ key: "headline", label: "Überschrift", multiline: true }, { key: "body", label: "Einleitung", multiline: true }, { key: "primaryCta", label: "Hauptbutton" }, { key: "secondaryCta", label: "Zweitbutton" }],
  about: [{ key: "heading", label: "Überschrift" }, { key: "body", label: "Text", multiline: true }, { key: "stats", label: "Highlights", multiline: true }],
  services: [{ key: "heading", label: "Überschrift" }, { key: "intro", label: "Einleitung", multiline: true }, { key: "items", label: "Leistungen, eine pro Zeile", multiline: true }],
  pricing: [{ key: "heading", label: "Überschrift" }, { key: "intro", label: "Einleitung", multiline: true }, { key: "plans", label: "Name | Preis | Leistungen", multiline: true }],
  gallery: [{ key: "heading", label: "Überschrift" }, { key: "intro", label: "Einleitung", multiline: true }, { key: "captions", label: "Bildtexte", multiline: true }],
  testimonials: [{ key: "heading", label: "Überschrift" }, { key: "quotes", label: "Name: Zitat", multiline: true }],
  faq: [{ key: "heading", label: "Überschrift" }, { key: "questions", label: "Frage? Antwort", multiline: true }],
  contact: [{ key: "heading", label: "Überschrift" }, { key: "intro", label: "Einleitung", multiline: true }, { key: "email", label: "E-Mail" }, { key: "phone", label: "Telefon" }, { key: "address", label: "Adresse" }],
  team: [{ key: "heading", label: "Überschrift" }, { key: "intro", label: "Einleitung", multiline: true }, { key: "members", label: "Name | Rolle | Kurztext", multiline: true }],
  process: [{ key: "heading", label: "Überschrift" }, { key: "intro", label: "Einleitung", multiline: true }, { key: "steps", label: "Titel | Detail", multiline: true }],
  beforeAfter: [{ key: "heading", label: "Überschrift" }, { key: "before", label: "Vorher", multiline: true }, { key: "after", label: "Nachher", multiline: true }],
  cta: [{ key: "heading", label: "Überschrift", multiline: true }, { key: "intro", label: "Einleitung", multiline: true }, { key: "primaryCta", label: "Hauptbutton" }, { key: "secondaryCta", label: "Zweitbutton" }],
  footer: [{ key: "brand", label: "Marke" }, { key: "tagline", label: "Slogan", multiline: true }, { key: "links", label: "Links", multiline: true }, { key: "legal", label: "Rechtliches" }]
};

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`; }
function pick<T>(items: T[]) { return items[Math.floor(Math.random() * items.length)]; }
function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "kunde"; }
function splitLines(value = "") { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
function formatBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`; }
function formatDate(value?: string) { return value ? new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "Noch nicht erfasst"; }
function planLabel(plan?: AccountProfile["plan"] | string) {
  const labels: Record<string, string> = { free: "Free", basic: "Basic", business: "Business", pro: "Pro", admin: "Admin" };
  return labels[String(plan || "free")] || String(plan || "Free");
}
function accountStatusLabel(status?: string) {
  const labels: Record<string, string> = { active: "Aktiv", pending: "Ausstehend", suspended: "Gesperrt", trial: "Testphase" };
  return labels[String(status || "active").toLowerCase()] || String(status || "Aktiv");
}
function billingStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    active: "Aktiv",
    cancelled: "Gekündigt",
    suspended: "Pausiert",
    expired: "Abgelaufen",
    payment_failed: "Zahlung fehlgeschlagen",
    refunded: "Erstattet",
    reversed: "Rückbuchung",
    pending: "Ausstehend"
  };
  return labels[String(status || "").toLowerCase()] || "Nicht aktiv";
}
function hasPremiumAccess(profile: AccountProfile) {
  if (profile.plan === "admin") return true;
  return Boolean(profile.premium_access_active ?? ["basic", "business", "pro"].includes(profile.plan));
}
function publishingStatusLabel(status?: string) {
  const labels: Record<string, string> = { "not-started": "Entwurf", "ready-to-publish": "Bereit", published: "Veröffentlicht", draft: "Entwurf" };
  return labels[String(status || "draft").toLowerCase()] || String(status || "Entwurf");
}
function optionLabel(value: string) {
  const labels: Record<string, string> = {
    left: "Links",
    right: "Rechts",
    top: "Oben",
    background: "Hintergrund",
    none: "Keine",
    solid: "Einfarbig",
    outline: "Kontur",
    "soft-gradient": "Weicher Verlauf",
    image: "Bildfläche",
    editorial: "Editorial",
    pattern: "Muster",
    "editorial-shape": "Editoriale Fläche",
    "grid-lines": "Feine Linien",
    grid: "Raster",
    lines: "Linien",
    frame: "Rahmen",
    "accent-block": "Akzentfläche",
    orb: "Lichtfläche",
    ribbon: "Band",
    "line-art": "Liniengrafik",
    minimal: "Minimal",
    balanced: "Ausgewogen",
    generous: "Großzügig",
    sharp: "Kantig",
    soft: "Weich",
    round: "Rund",
    small: "Klein",
    medium: "Mittel",
    large: "Groß",
    subtle: "Dezent",
    deep: "Stark",
    crisp: "Klar",
    pill: "Pill",
    square: "Eckig",
    luxury: "Elegant"
  };
  return labels[value] || value;
}
function normalizePathname(value = window.location.pathname) {
  const cleanPath = value.split("?")[0].replace(/\/+$/, "");
  return cleanPath || "/";
}
function publicPageKeyFor(pathname: string): PublicPageKey | null {
  const route = normalizePathname(pathname);
  const map: Record<string, PublicPageKey> = {
    "/": "home",
    "/pricing": "pricing",
    "/features": "features",
    "/examples": "examples",
    "/faq": "faq",
    "/contact": "contact",
    "/launch-hilfe": "launchHelp",
    "/impressum": "impressum",
    "/datenschutz": "datenschutz",
    "/agb": "agb",
    "/widerruf": "widerruf",
    "/zahlungsbedingungen": "zahlungsbedingungen"
  };
  return map[route] || null;
}
function exampleCaseFor(pathname: string) {
  const route = normalizePathname(pathname);
  const match = route.match(/^\/examples\/([a-z0-9-]+)$/i);
  if (!match) return null;
  return exampleCases.find((item) => item.slug === match[1]) || null;
}
function protectedRouteFor(pathname: string): ProtectedRoute | null {
  const route = normalizePathname(pathname);
  if (route === "/dashboard") return { kind: "dashboard" };
  if (route === "/dashboard/profile" || route === "/account") return { kind: "profile" };
  if (route === "/dashboard/websites") return { kind: "websites" };
  if (route === "/dashboard/websites/new") return { kind: "new-website" };
  if (route === "/billing") return { kind: "billing" };
  if (route === "/billing/success") return { kind: "billing-success" };
  const editorMatch = route.match(/^\/editor\/([0-9a-f-]{36})$/i);
  if (editorMatch) return { kind: "editor", websiteId: editorMatch[1] };
  const publishMatch = route.match(/^\/publish\/([0-9a-f-]{36})$/i);
  if (publishMatch) return { kind: "publish", websiteId: publishMatch[1] };
  return null;
}
function toProfileForm(profile?: AccountProfile | null): ProfileForm {
  if (!profile) return { ...emptyProfileForm, branding_colors: { ...emptyProfileForm.branding_colors } };
  return {
    display_name: profile.display_name || "",
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
    branding_colors: { ...emptyProfileForm.branding_colors, ...(profile.branding_colors || {}) },
    logo_url: profile.logo_url || "",
    avatar_url: profile.avatar_url || ""
  };
}

function defaultBrief(seed = "Premium Unternehmen"): Brief {
  return { industry: seed, companyName: "DexHost Demo Kunde", location: "Berlin", audience: "anspruchsvolle lokale und digitale Kunden", style: "modern, hochwertig, vertrauenswürdig", colorPreference: "ruhige professionelle Farben", hasOwnImages: "no", pages: "Startseite, Leistungen, Kontakt" };
}
function briefPages(value = "") {
  const normalized = value.split(/[,;\n]/).map((item) => cleanLabel(item)).filter(Boolean);
  return Array.from(new Set(["Startseite", ...normalized, "Kontakt"]));
}
function cleanLabel(value = "") {
  return value.trim().replace(/\s+/g, " ");
}
function pageSummary(value = "") {
  return briefPages(value).join(", ");
}

let paypalHostedSdkPromise: Promise<void> | null = null;
function ensurePayPalHostedSdk() {
  if (window.paypalHosted?.HostedButtons) return Promise.resolve();
  if (paypalHostedSdkPromise) return paypalHostedSdkPromise;
  paypalHostedSdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("paypal-hosted-buttons-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("PayPal Button konnte nicht geladen werden.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "paypal-hosted-buttons-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(hostedPayPalClientId)}&components=hosted-buttons&disable-funding=venmo&currency=EUR`;
    script.async = true;
    script.dataset.namespace = "paypalHosted";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal Button konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
  return paypalHostedSdkPromise;
}

let paypalSubscriptionSdkPromise: Promise<void> | null = null;
function ensurePayPalSubscriptionSdk() {
  if (window.paypalSubscription?.Buttons) return Promise.resolve();
  if (paypalSubscriptionSdkPromise) return paypalSubscriptionSdkPromise;
  paypalSubscriptionSdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("paypal-subscription-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("PayPal Abo-Button konnte nicht geladen werden.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "paypal-subscription-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(subscriptionPayPalClientId)}&vault=true&intent=subscription`;
    script.async = true;
    script.dataset.namespace = "paypalSubscription";
    script.dataset.sdkIntegrationSource = "button-factory";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal Abo-Button konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
  return paypalSubscriptionSdkPromise;
}

function designFor(brief: Brief) {
  const text = `${brief.industry} ${brief.style} ${brief.colorPreference}`.toLowerCase();
  if (/medizin|arzt|health|clinic|pflege/.test(text)) return designSystems[1];
  if (/tech|software|ki|ai|saas/.test(text)) return designSystems[2];
  if (/lux|elegant|kanzlei|premium/.test(text)) return designSystems[3];
  return designSystems[0];
}
function seoFor(brief: Brief): SeoSettings {
  return { title: `${brief.companyName} | ${brief.industry} in ${brief.location}`, description: `${brief.companyName} bietet ${brief.industry} für ${brief.audience}. Hochwertig, klar und direkt anfragbar.`, slug: slugify(brief.companyName), language: "de" };
}
function assetNeeds(brief: Brief): AssetNeed[] {
  return [
    { id: id("asset-logo"), type: "Logo", title: `Logo-System für ${brief.companyName}`, priority: "essential", reason: "Ein professioneller erster Eindruck braucht eine wiedererkennbare Marke.", sourcePolicy: "canva-usable", status: "missing", canvaPrompt: `Professionelles Logo für ${brief.companyName}, Branche ${brief.industry}, Stil ${brief.style}.` },
    { id: id("asset-hero"), type: "Hero-Grafik", title: "Hero-Keyvisual", priority: brief.hasOwnImages === "yes" ? "recommended" : "essential", reason: "Der erste Screen braucht ein starkes, verwendbares Bildsignal.", sourcePolicy: brief.hasOwnImages === "yes" ? "user-owned" : "ai-generated-usable", status: "missing", canvaPrompt: `Hero-Grafik für ${brief.companyName}, ${brief.industry}, ${brief.style}, keine fremden Marken.` },
    { id: id("asset-icons"), type: "Icons", title: "Individuelle Service-Icons", priority: "recommended", reason: "Konsistente Icons wirken besser als generische Standardsets.", sourcePolicy: "canva-usable", status: "planned" },
    { id: id("asset-social"), type: "Social-Media-Banner", title: "Launch-Banner", priority: "optional", reason: "Hilft beim Veröffentlichen ohne die Website zu überladen.", sourcePolicy: "canva-usable", status: "planned" }
  ];
}
function content(type: SectionType, brief: Brief): Record<string, string> {
  const map: Record<SectionType, Record<string, string>> = {
    hero: { headline: `${brief.companyName} zeigt ${brief.industry} klar, hochwertig und direkt anfragbar.`, body: `Ein professioneller Auftritt für ${brief.audience} in ${brief.location}. DexHost erzeugt die Struktur, Sie behalten die Kontrolle.`, primaryCta: "Beratung anfragen", secondaryCta: "Leistungen ansehen" },
    about: { heading: `Warum ${brief.companyName}`, body: "Zeigen Sie Haltung, Erfahrung und Arbeitsweise in einer Geschichte, die Vertrauen schafft.", stats: "Klare Positionierung\nSchnelle Abstimmung\nPremium Eindruck" },
    services: { heading: "Leistungen mit Struktur", intro: "Besucher verstehen sofort, was Sie anbieten und welcher nächste Schritt sinnvoll ist.", items: "Beratung und Strategie\nUmsetzung und Betreuung\nContent und SEO\nLaunch und Optimierung" },
    pricing: { heading: "Pakete für klare Entscheidungen", intro: "Transparente Optionen helfen beim Vergleich.", plans: "Basic | 9 EUR mtl. | Editor, Speichern, Vorschau\nBusiness | 19 EUR mtl. | Veröffentlichung, sichere Verbindung, Branding\nPro | 49 EUR mtl. | Domain-Vorbereitung, mehr Assets, Premium-Workflows" },
    gallery: { heading: "Bildsprache, die zur Firma passt", intro: "Eigene Bilder zuerst. Fehlende Motive werden geplant und als verwendbar markiert.", captions: "Arbeitsprozess\nDetailaufnahme\nKundenerlebnis\nErgebnis" },
    testimonials: { heading: "Vertrauen durch echte Stimmen", quotes: "Kunde A: Sehr professionell und klar.\nKunde B: Der Auftritt wirkt deutlich hochwertiger.\nKunde C: Schnell, strukturiert und angenehm." },
    faq: { heading: "Häufige Fragen", questions: "Wie schnell geht der Start? Meist innerhalb weniger Tage.\nKann ich eigene Bilder nutzen? Ja, eigene Bilder haben Vorrang.\nKann ich später eine Domain verbinden? Ja, mit automatischem SSL." },
    contact: { heading: "Starten wir mit einem Gespräch", intro: "Eine kurze Anfrage reicht für den ersten sinnvollen nächsten Schritt.", email: "hello@example.com", phone: "+49 000 000000", address: brief.location },
    team: { heading: "Menschen und Kompetenz", intro: "Zeigen Sie Rollen dort, wo sie Vertrauen stärken.", members: "Mara Keller | Strategie | Klärt Ziele und Positionierung.\nLeon Hart | Design | Entwickelt digitale Auftritte.\nNina Vogt | Projektleitung | Hält Qualität und Timing zusammen." },
    process: { heading: "Vom Briefing zum Launch", intro: "Ein klarer Ablauf macht die Entscheidung leichter.", steps: "Briefing | Ziele, Zielgruppe und Stil klären.\nDesignsystem | Farben, Typografie und Bildsprache festlegen.\nEditor | Abschnitte bearbeiten und mobil prüfen.\nLaunch | Subdomain starten, Domain später verbinden." },
    beforeAfter: { heading: "Vorher und nachher spürbar anders", before: "Vorher: austauschbare Texte, generische Bilder und schwache Kontaktführung.", after: "Nachher: klare Botschaft, individuelle Struktur und professioneller erster Eindruck." },
    cta: { heading: "Bereit für eine Website, die nicht nach Baukasten aussieht?", intro: "DexHost liefert die erste starke Version, Sie verfeinern jedes Detail.", primaryCta: "Website starten", secondaryCta: "Design prüfen" },
    footer: { brand: brief.companyName, tagline: `${brief.industry} aus ${brief.location}. Klar positioniert und professionell präsentiert.`, links: "Start\nLeistungen\nProzess\nKontakt\nImpressum", legal: `(c) ${new Date().getFullYear()} ${brief.companyName}.` }
  };
  return map[type];
}
function createSection(type: SectionType, orderIndex: number, brief: Brief, design: DesignSystem): WebsiteSection {
  return { id: id(type), type, orderIndex, variant: pick(sectionVariants[type]), content: content(type, brief), imageUrls: [], styleSettings: { backgroundColor: orderIndex % 2 ? design.colors.surface : design.colors.page, textColor: design.colors.text, accentColor: design.colors.accent, imagePosition: pick(["left", "right", "top", "background"]), spacing: design.spacingScale, align: type === "hero" ? "split" : "left" }, animationSettings: { preset: pick(["none", "fade", "rise", "slide"] as const), intensity: "subtle" }, backgroundSettings: { kind: orderIndex % 3 === 0 ? "soft-gradient" : "solid", overlay: "soft", graphicElement: pick(graphicElements) } };
}
function buildWebsite(briefInput: Brief): WebsiteDocument {
  const brief = { ...defaultBrief(), ...briefInput };
  const design = designFor(brief);
  const seo = seoFor(brief);
  const middle = shuffle(sectionTypes.filter((type) => !["hero", "footer"].includes(type)));
  const selected = ["hero", ...middle.slice(0, 9), "cta", "footer"] as SectionType[];
  return { schemaVersion: 2, title: brief.companyName, brief, seo, designSystem: { ...design, colors: { ...design.colors } }, sections: selected.map((type, index) => createSection(type, index, brief, design)), assetNeeds: assetNeeds(brief), publishing: { mode: "draft", subdomain: `${seo.slug}.dexhost.de`, customDomain: "", provider: "cloudflare-pages", ssl: "automatic", status: "not-started" } };
}
function reindex(sections: WebsiteSection[]) { return sections.map((section, orderIndex) => ({ ...section, orderIndex })); }

function cookieValue(name: string) {
  return document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.split("=").slice(1).join("=") || "";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const method = String(options.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !headers.has("X-DexHost-CSRF")) {
    const token = decodeURIComponent(cookieValue("dexhost_csrf"));
    if (token) headers.set("X-DexHost-CSRF", token);
  }
  const response = await fetch(path, { ...options, credentials: "include", headers });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (path.startsWith("/api/")) throw new Error("Die DexHost API ist nicht erreichbar. Prüfe in Netlify, ob Functions deployed sind.");
    throw new Error("Unexpected response type.");
  }
  const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File could not be read"));
    reader.readAsDataURL(file);
  });
}
function Icon({ name }: { name: "studio" | "site" | "asset" | "publish" | "settings" | "spark" | "plus" | "trash" | "up" | "down" | "image" | "upload" | "wand" | "logout" | "save" }) {
  const paths = {
    studio: "M4 5h16v14H4zM8 5v14M4 9h16",
    site: "M4 6h16v12H4zM4 10h16M8 14h4",
    asset: "M4 7l4-3 4 3 4-3 4 3v10l-4 3-4-3-4 3-4-3V7z",
    publish: "M12 3v12m0-12 4 4m-4-4-4 4M5 17v3h14v-3",
    settings: "M12 8a4 4 0 100 8 4 4 0 000-8zM4 12h2m12 0h2M12 4v2m0 12v2",
    spark: "M12 2l1.7 6.2L20 10l-6.3 1.8L12 18l-1.7-6.2L4 10l6.3-1.8L12 2z",
    plus: "M12 5v14M5 12h14",
    trash: "M5 7h14M9 7V5h6v2m-8 0l1 13h8l1-13",
    up: "M12 5l-6 6m6-6l6 6M12 5v14",
    down: "M12 19l-6-6m6 6l6-6M12 5v14",
    image: "M4 5h16v14H4zM7 15l3-3 3 3 2-2 3 3M8 9h.1",
    upload: "M12 16V5m0 0L8 9m4-4l4 4M5 19h14",
    wand: "M15 4l5 5M4 20l9-9 2 2-9 9H4v-2zM14 4l6 6",
    logout: "M10 17l5-5-5-5M15 12H3M21 4v16",
    save: "M5 5h11l3 3v11H5zM8 5v6h8M8 19v-5h8v5"
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function AppRoutes() {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const starterWebsite = useMemo(() => buildWebsite(defaultBrief("Premium Dienstleistung")), []);
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const [authMode, setAuthMode] = useState<AuthMode>(normalizePathname(window.location.pathname) === "/register" ? "register" : "login");
  const [authForm, setAuthForm] = useState<AuthForm>({ email: "", password: "", displayName: "" });
  const [authStatus, setAuthStatus] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => toProfileForm(null));
  const [profileStatus, setProfileStatus] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [billingStatus, setBillingStatus] = useState("");
  const [billingLoadingPlan, setBillingLoadingPlan] = useState("");
  const [launchPaymentStatus, setLaunchPaymentStatus] = useState("");
  const [launchPaymentLoading, setLaunchPaymentLoading] = useState("");
  const [capturedLaunchOrder, setCapturedLaunchOrder] = useState("");
  const [projects, setProjects] = useState<WebsiteProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [website, setWebsite] = useState<WebsiteDocument>(starterWebsite);
  const [brief, setBrief] = useState<Brief>(starterWebsite.brief);
  const [selectedSectionId, setSelectedSectionId] = useState(starterWebsite.sections[0]?.id || "");
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig>(uploadConfigDefault);
  const [addType, setAddType] = useState<SectionType>("services");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [integrations, setIntegrations] = useState<StudioIntegrations | null>(null);
  const [status, setStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedSection = website.sections.find((section) => section.id === selectedSectionId) || website.sections[0];
  const route = normalizePathname(location.pathname);
  const search = location.search;
  const selectedPages = briefPages(brief.pages);
  const publicPageKey = publicPageKeyFor(route);
  const publicExample = exampleCaseFor(route);
  const protectedRoute = protectedRouteFor(route);
  const isAuthRoute = route === "/login" || route === "/register";
  const isProfileRoute = protectedRoute?.kind === "profile";
  const isBillingRoute = protectedRoute?.kind === "billing";
  const isBillingSuccessRoute = protectedRoute?.kind === "billing-success";
  const isPublishRoute = protectedRoute?.kind === "publish";

  useEffect(() => {
    request<{ csrfToken: string }>("/api/auth/csrf").catch(() => undefined);
    request<UploadConfig>("/api/upload/config").then((config) => setUploadConfig(Array.isArray(config.allowedTypes) ? config : uploadConfigDefault)).catch(() => setUploadConfig(uploadConfigDefault));
    request<StudioIntegrations>("/api/integrations/studio").then(setIntegrations).catch(() => undefined);
    request<AuthSession>("/api/auth/session")
      .then(async (nextSession) => {
        setSession(nextSession);
        setAccountName(nextSession.profile.display_name);
        setProfileForm(toProfileForm(nextSession.profile));
        await loadProjectsFromServer().catch((error) => setStatus(error instanceof Error ? error.message : "Websites konnten nicht geladen werden."));
      })
      .catch(() => setSession(null));
  }, []);

  function navigate(path: string) {
    routerNavigate(path);
  }

  useEffect(() => {
    if (route === "/login") setAuthMode("login");
    if (route === "/register") setAuthMode("register");
    if (session === null && protectedRouteFor(route)) {
      routerNavigate("/login", { replace: true });
      setAuthMode("login");
      return;
    }
    if (session && (route === "/login" || route === "/register")) {
      routerNavigate("/dashboard", { replace: true });
    }
  }, [session, route, routerNavigate]);

  useEffect(() => {
    if (session && protectedRoute?.websiteId && (protectedRoute.kind === "editor" || protectedRoute.kind === "publish")) {
      void openProjectFromRoute(protectedRoute.websiteId);
    }
  }, [session, protectedRoute?.kind, protectedRoute?.websiteId]);

  function syncWebsite(next: WebsiteDocument, label = "Unsaved changes") {
    const normalized = { ...next, sections: reindex(next.sections) };
    setWebsite(normalized);
    setBrief(normalized.brief);
    setProjects((items) => {
      if (!projectId) return items;
      return items.map((item) => item.id === projectId ? { ...item, title: normalized.title, website: normalized, updatedAt: now() } : item);
    });
    setStatus(label);
  }

  async function loadAssetsFor(idValue: string) {
    if (!idValue) return setAssets([]);
    try {
      const response = await request<{ assets: ImageAsset[] }>(`/api/websites/${idValue}/assets`);
      setAssets(response.assets || []);
    } catch (error) {
      setAssets([]);
      setStatus(error instanceof Error ? error.message : "Assets konnten nicht geladen werden.");
    }
  }

  async function loadProjectsFromServer(preferredId?: string) {
    const response = await request<{ websites: WebsiteProject[] }>("/api/websites");
    const list = response.websites || [];
    setProjects(list);
    const nextProject = list.find((item) => item.id === preferredId) || list[0];
    if (!nextProject) {
      setProjectId("");
      setWebsite(starterWebsite);
      setBrief(starterWebsite.brief);
      setSelectedSectionId(starterWebsite.sections[0]?.id || "");
      setAssets([]);
      setStatus("Noch kein Netlify-Projekt gespeichert.");
      return;
    }
    setProjectId(nextProject.id);
    setWebsite(nextProject.website);
    setBrief(nextProject.website.brief);
    setSelectedSectionId(nextProject.website.sections[0]?.id || "");
    await loadAssetsFor(nextProject.id);
  }

  async function switchProject(idValue: string) {
    const nextProject = projects.find((item) => item.id === idValue);
    if (!nextProject) return;
    setProjectId(nextProject.id);
    setWebsite(nextProject.website);
    setBrief(nextProject.website.brief);
    setSelectedSectionId(nextProject.website.sections[0]?.id || "");
    await loadAssetsFor(nextProject.id);
  }

  async function openProjectFromRoute(idValue: string) {
    if (projectId === idValue) return;
    const loadedProject = projects.find((item) => item.id === idValue);
    if (loadedProject) {
      await switchProject(idValue);
      return;
    }
    try {
      const response = await request<{ website: WebsiteProject }>(`/api/websites/${idValue}`);
      const nextProject = response.website;
      setProjects((items) => items.some((item) => item.id === nextProject.id) ? items.map((item) => item.id === nextProject.id ? nextProject : item) : [nextProject, ...items]);
      setProjectId(nextProject.id);
      setWebsite(nextProject.website);
      setBrief(nextProject.website.brief);
      setSelectedSectionId(nextProject.website.sections[0]?.id || "");
      await loadAssetsFor(nextProject.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Website konnte nicht geladen werden.");
    }
  }

  function updateBrief<K extends keyof Brief>(key: K, value: Brief[K]) {
    const nextBrief = { ...brief, [key]: value };
    setBrief(nextBrief);
    const seo = key === "companyName" || key === "industry" || key === "location" ? seoFor(nextBrief) : website.seo;
    syncWebsite({ ...website, title: key === "companyName" ? String(value) : website.title, brief: nextBrief, seo, publishing: { ...website.publishing, subdomain: `${seo.slug}.dexhost.de` } });
  }
  function togglePage(page: string) {
    if (requiredPages.has(page)) return;
    const pages = selectedPages.includes(page) ? selectedPages.filter((item) => item !== page) : [...selectedPages, page];
    updateBrief("pages", pageSummary(pages.join(", ")));
  }
  function addCustomPage(value: string) {
    const page = cleanLabel(value);
    if (!page) return;
    updateBrief("pages", pageSummary([...selectedPages, page].join(", ")));
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthStatus("");
    try {
      if (!cookieValue("dexhost_csrf")) await request<{ csrfToken: string }>("/api/auth/csrf");
      if (authMode === "forgot") {
        await request<{ ok: boolean }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: authForm.email }) });
        setAuthStatus("Wenn das Konto existiert, senden wir dir einen Link zum Zurücksetzen.");
        return;
      }
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await request<Partial<AuthSession> & { emailVerificationRequired?: boolean }>(endpoint, { method: "POST", body: JSON.stringify({ email: authForm.email, password: authForm.password, displayName: authForm.displayName }) });
      if (response.profile && response.user && !response.emailVerificationRequired) {
        const nextSession = { authenticated: true, user: response.user, profile: response.profile } as AuthSession;
        setSession(nextSession);
        setAccountName(nextSession.profile.display_name);
        setProfileForm(toProfileForm(nextSession.profile));
        await loadProjectsFromServer();
        navigate("/dashboard");
      } else {
        setAuthStatus("Registrierung angelegt. Bitte prüfe deine E-Mail und bestätige den Link, bevor du dich anmeldest.");
        setAuthMode("login");
        navigate("/login");
      }
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setSession(null);
    setProjects([]);
    setProjectId("");
    setWebsite(starterWebsite);
    setBrief(starterWebsite.brief);
    setAssets([]);
    setProfileForm(toProfileForm(null));
    setProfileStatus("");
    setStatus("");
    navigate("/login");
  }

  async function saveAccount() {
    if (!session) return;
    try {
      const nextForm = { ...profileForm, display_name: accountName || profileForm.display_name };
      const response = await request<{ profile: AccountProfile }>("/api/account", { method: "PUT", body: JSON.stringify(nextForm) });
      setSession({ ...session, profile: response.profile });
      setProfileForm(toProfileForm(response.profile));
      setStatus("Profil gespeichert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profil konnte nicht gespeichert werden.");
    }
  }

  async function loadProfile() {
    const response = await request<{ profile: AccountProfile }>("/api/account");
    if (session) setSession({ ...session, profile: response.profile });
    setAccountName(response.profile.display_name);
    setProfileForm(toProfileForm(response.profile));
    return response.profile;
  }

  async function saveProfile(event?: React.FormEvent) {
    event?.preventDefault();
    if (!session) return;
    setProfileSaving(true);
    setProfileStatus("");
    try {
      const response = await request<{ profile: AccountProfile }>("/api/account", { method: "PUT", body: JSON.stringify(profileForm) });
      setSession({ ...session, profile: response.profile });
      setAccountName(response.profile.display_name);
      setProfileForm(toProfileForm(response.profile));
      setProfileStatus("Profil erfolgreich gespeichert.");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Profil konnte nicht gespeichert werden.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadProfileAsset(kind: "logo" | "avatar", file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!uploadConfig.allowedTypes.includes(extension)) return setProfileStatus(`Nur ${uploadConfig.allowedTypes.join(", ")} sind erlaubt.`);
    if (file.size > uploadConfig.maxBytes) return setProfileStatus(`Datei ist zu gross. Max ${formatBytes(uploadConfig.maxBytes)}.`);
    setProfileSaving(true);
    setProfileStatus("");
    try {
      const dataUrl = await readFile(file);
      const response = await request<{ profile: AccountProfile }>(`/api/profile/${kind}`, { method: "POST", body: JSON.stringify({ fileName: file.name, contentType: file.type, dataUrl }) });
      if (session) setSession({ ...session, profile: response.profile });
      setProfileForm(toProfileForm(response.profile));
      setProfileStatus(kind === "logo" ? "Logo hochgeladen." : "Profilbild hochgeladen.");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function persistWebsite(next: WebsiteDocument = website, label = "Website in Netlify Blobs gespeichert", targetProjectId = projectId) {
    setIsSaving(true);
    try {
      const normalized = { ...next, sections: reindex(next.sections) };
      const payload = { name: normalized.title, slug: normalized.seo.slug, json_data: normalized };
      const response = targetProjectId
        ? await request<{ website: WebsiteProject }>(`/api/websites/${targetProjectId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await request<{ website: WebsiteProject }>("/api/websites", { method: "POST", body: JSON.stringify(payload) });
      const saved = response.website;
      setProjectId(saved.id);
      setWebsite(saved.website);
      setBrief(saved.website.brief);
      setSelectedSectionId(saved.website.sections[0]?.id || "");
      setProjects((items) => {
        const exists = items.some((item) => item.id === saved.id);
        return exists ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items];
      });
      setStatus(label);
      return saved;
    } finally {
      setIsSaving(false);
    }
  }

  async function generateWebsite() {
    setIsGenerating(true);
    setStatus("DexHost AI is designing...");
    try {
      const response = await request<{ website: WebsiteDocument; source: string; integrations?: StudioIntegrations }>("/api/websites/ai-studio-plan", { method: "POST", body: JSON.stringify({ brief }) });
      const nextWebsite = { ...buildWebsite(brief), ...response.website };
      const responseProject = await request<{ website: WebsiteProject }>("/api/websites", { method: "POST", body: JSON.stringify({ name: nextWebsite.title, slug: nextWebsite.seo.slug, json_data: nextWebsite }) });
      const nextProject = responseProject.website;
      setProjects((items) => [nextProject, ...items]);
      setProjectId(nextProject.id);
      setWebsite(nextProject.website);
      setBrief(nextProject.website.brief);
      setSelectedSectionId(nextProject.website.sections[0]?.id || "");
      setAssets([]);
      if (response.integrations) setIntegrations(response.integrations);
      setStatus(response.source === "openai" ? "KI-Website wurde erstellt und gespeichert." : "Website-Entwurf wurde erstellt und gespeichert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "KI-Generierung fehlgeschlagen.");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateSection(sectionId: string, updater: (section: WebsiteSection) => WebsiteSection) {
    syncWebsite({ ...website, sections: website.sections.map((section) => section.id === sectionId ? updater(section) : section) });
  }
  function addSection() {
    const section = createSection(addType, website.sections.length, website.brief, website.designSystem);
    syncWebsite({ ...website, sections: [...website.sections, section] });
    setSelectedSectionId(section.id);
  }
  function deleteSection(sectionId: string) {
    const nextSections = website.sections.filter((section) => section.id !== sectionId);
    syncWebsite({ ...website, sections: nextSections.length ? nextSections : [createSection("hero", 0, website.brief, website.designSystem)] });
    setSelectedSectionId(nextSections[0]?.id || "");
  }
  function moveSection(sectionId: string, direction: -1 | 1) {
    const index = website.sections.findIndex((section) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= website.sections.length) return;
    const sections = [...website.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    syncWebsite({ ...website, sections });
  }
  function applyPreset(name: string) {
    const design = designSystems.find((system) => system.paletteName === name);
    if (!design) return;
    syncWebsite({ ...website, designSystem: { ...design, colors: { ...design.colors } }, sections: website.sections.map((section, index) => ({ ...section, styleSettings: { ...section.styleSettings, backgroundColor: index % 2 ? design.colors.surface : design.colors.page, textColor: design.colors.text, accentColor: design.colors.accent, spacing: design.spacingScale } })) });
  }
  function updateDesign(updater: (design: DesignSystem) => DesignSystem) { syncWebsite({ ...website, designSystem: updater(website.designSystem) }); }

  async function uploadImage(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!uploadConfig.allowedTypes.includes(extension)) return setStatus(`Erlaubt sind nur Bilder als ${uploadConfig.allowedTypes.join(", ")}.`);
    if (file.size > uploadConfig.maxBytes) return setStatus(`Das Bild ist zu groß. Maximal ${formatBytes(uploadConfig.maxBytes)}.`);
    const dataUrl = await readFile(file);
    try {
      const targetProject = projectId ? projects.find((item) => item.id === projectId) : await persistWebsite(website, "Projekt vor Upload gespeichert");
      const targetProjectId = projectId || targetProject?.id;
      if (!targetProjectId) throw new Error("Bitte speichere zuerst eine Website.");
      const response = await request<{ asset: ImageAsset; config: UploadConfig }>(`/api/websites/${targetProjectId}/assets`, { method: "POST", body: JSON.stringify({ fileName: file.name, contentType: file.type, dataUrl }) });
      const next = [response.asset, ...assets];
      setAssets(next);
      setUploadConfig(response.config);
      const nextWebsite = selectedSection ? {
        ...website,
        sections: website.sections.map((section) => {
          if (section.id !== selectedSection.id) return section;
          if (multiImageSections.has(section.type)) {
            const imageUrls = section.imageUrls.includes(response.asset.url) ? section.imageUrls : [...section.imageUrls, response.asset.url];
            return { ...section, imageUrls };
          }
          return { ...section, imageUrls: [response.asset.url] };
        })
      } : website;
      syncWebsite(nextWebsite, "Bild hochgeladen und eingefügt");
      await persistWebsite(nextWebsite, "Bild in den Website-Daten gespeichert", targetProjectId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    }
  }
  function applyImage(url: string) {
    if (!selectedSection) return;
    updateSection(selectedSection.id, (section) => {
      if (multiImageSections.has(section.type)) {
        const imageUrls = section.imageUrls.includes(url) ? section.imageUrls.filter((item) => item !== url) : [...section.imageUrls, url];
        return { ...section, imageUrls };
      }
      return { ...section, imageUrls: [url] };
    });
  }
  async function runAssetAgent() {
    try {
      const response = await request<{ assetNeeds: AssetNeed[]; notes?: string; integrations?: StudioIntegrations }>("/api/websites/asset-plan", { method: "POST", body: JSON.stringify({ brief: website.brief, website }) });
      syncWebsite({ ...website, assetNeeds: response.assetNeeds || website.assetNeeds }, response.notes || "Asset-Plan ist bereit.");
      if (response.integrations) setIntegrations(response.integrations);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Asset-Agent fehlgeschlagen.");
    }
  }

  async function publishWebsite() {
    try {
      const saved = await persistWebsite(website, "Website vor Veröffentlichung gespeichert");
      const response = await request<{ website: WebsiteProject; publicUrl: string; subdomain: string; deploy: { provider: string; status?: string; queued?: boolean } }>(`/api/websites/${saved.id}/publish`, { method: "POST" });
      setProjects((items) => items.map((item) => item.id === response.website.id ? response.website : item));
      setWebsite(response.website.website);
      setStatus(`Veröffentlichung freigegeben: ${response.subdomain}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Veröffentlichung fehlgeschlagen.");
    }
  }
  async function activatePayPalSubscription(plan: AccountProfile["plan"], subscriptionId: string) {
    setBillingLoadingPlan(plan);
    setBillingStatus("PayPal-Abo wird serverseitig geprüft...");
    try {
      const response = await request<{ profile: AccountProfile; plan: AccountProfile["plan"]; status: string; subscriptionId: string }>("/api/billing/paypal/subscription/activate", { method: "POST", body: JSON.stringify({ plan, subscriptionId }) });
      setSession((current) => current ? { ...current, profile: response.profile } : current);
      setProfileForm(toProfileForm(response.profile));
      setBillingStatus(`PayPal-Abo bestätigt. Tarif ${planLabel(response.plan)} ist aktiv.`);
      routerNavigate(`/billing/success?subscription=${encodeURIComponent(response.subscriptionId)}`, { replace: true });
    } catch (error) {
      setBillingStatus(error instanceof Error ? error.message : "PayPal-Abo konnte nicht bestätigt werden.");
    } finally {
      setBillingLoadingPlan("");
    }
  }
  async function startLaunchServiceCheckout(serviceId: LaunchService["id"]) {
    if (!session) {
      setLaunchPaymentStatus("Bitte erst registrieren oder einloggen, damit DexHost die Zahlung deinem Konto zuordnen kann.");
      navigate("/register");
      return;
    }
    setLaunchPaymentLoading(serviceId);
    setLaunchPaymentStatus("");
    try {
      const response = await request<{ approvalUrl: string; orderId: string; serviceId: string }>("/api/billing/paypal/setup/create", { method: "POST", body: JSON.stringify({ serviceId }) });
      window.location.href = response.approvalUrl;
    } catch (error) {
      setLaunchPaymentStatus(error instanceof Error ? error.message : "PayPal-Zahlung konnte nicht gestartet werden.");
    } finally {
      setLaunchPaymentLoading("");
    }
  }
  async function captureLaunchServiceOrder(orderId: string) {
    if (!orderId || capturedLaunchOrder === orderId) return;
    setCapturedLaunchOrder(orderId);
    setBillingStatus("Einmalzahlung wird serverseitig geprüft...");
    try {
      const response = await request<{ service: LaunchService; status: string; orderId: string }>("/api/billing/paypal/setup/capture", { method: "POST", body: JSON.stringify({ orderId }) });
      setBillingStatus(`Einmalzahlung bestätigt. ${response.service.name} ist gebucht.`);
      routerNavigate(`/billing/success?setup=${encodeURIComponent(response.service.id)}`, { replace: true });
    } catch (error) {
      setBillingStatus(error instanceof Error ? error.message : "Einmalzahlung konnte nicht bestätigt werden.");
    }
  }

  useEffect(() => {
    if (!session || route !== "/billing/success") return;
    const params = new URLSearchParams(search);
    const orderId = params.get("token");
    if (params.get("setup") === "success" && orderId) void captureLaunchServiceOrder(orderId);
  }, [session, route, search, capturedLaunchOrder]);

  useEffect(() => {
    if (route !== "/launch-hilfe") return;
    const params = new URLSearchParams(search);
    if (params.get("payment") === "cancel") setLaunchPaymentStatus("PayPal-Zahlung wurde abgebrochen.");
  }, [route, search]);

  if (publicExample) {
    return <ExampleDetailPage key={route} example={publicExample} session={session || null} currentPath={route} onNavigate={navigate} />;
  }

  if (route === "/verify-email" || route === "/reset-password") {
    return <EmailActionPage key={route} kind={route === "/verify-email" ? "verify" : "reset"} currentPath={route} search={search} session={session || null} onNavigate={navigate} />;
  }

  if (publicPageKey === "launchHelp") {
    return <LaunchHelpPage session={session || null} currentPath={route} status={launchPaymentStatus} loadingService={launchPaymentLoading} onNavigate={navigate} onCheckout={(serviceId) => void startLaunchServiceCheckout(serviceId)} />;
  }

  if (publicPageKey) {
    return <PublicPage key={route} pageKey={publicPageKey} session={session || null} currentPath={route} launchStatus={launchPaymentStatus} launchLoadingService={launchPaymentLoading} onLaunchCheckout={(serviceId) => void startLaunchServiceCheckout(serviceId)} onNavigate={navigate} />;
  }

  if (isAuthRoute) {
    return <AuthScreen key={route} mode={authMode} form={authForm} status={authStatus} loading={authLoading} session={session || null} currentPath={route} onMode={setAuthMode} onForm={setAuthForm} onSubmit={submitAuth} onNavigate={navigate} />;
  }

  if (session === undefined) return <ProtectedLoading message="DexHost Session wird serverseitig geprüft..." />;
  if (!session) return <ProtectedLoading message="Weiterleitung zur Anmeldung..." />;

  const sidebar = (
    <aside className="sidebar">
      <div className="brand"><div>DH</div><strong>DexHost</strong></div>
      <nav>
        {[
          ["studio", "Übersicht", "/dashboard"],
          ["site", "Webseiten", "/dashboard/websites"],
          ["plus", "Neue Website", "/dashboard/websites/new"],
          ["publish", "Veröffentlichen", projectId ? `/publish/${projectId}` : "/dashboard/websites"],
          ["asset", "Abo & Zahlungen", "/billing"],
          ["settings", "Profil", "/dashboard/profile"]
        ].map(([icon, label, target]) => {
          const targetPath = String(target);
          const active =
            (targetPath === "/dashboard" && route === "/dashboard") ||
            (targetPath === "/dashboard/websites" && (route === "/dashboard/websites" || route.startsWith("/editor/"))) ||
            (targetPath === "/dashboard/websites/new" && route === "/dashboard/websites/new") ||
            (targetPath === "/billing" && (route === "/billing" || route === "/billing/success")) ||
            (targetPath === "/dashboard/profile" && isProfileRoute) ||
            (targetPath.startsWith("/publish/") && route.startsWith("/publish/"));
          return <button className={active ? "active" : ""} key={label} onClick={() => { if (targetPath === "/dashboard/profile") void loadProfile(); navigate(targetPath); }}><Icon name={icon as "studio"} />{label}</button>;
        })}
      </nav>
      <div className="side-note account-card">
        <strong>{session.profile.display_name}</strong>
        <span>{session.profile.email}</span>
        <span>Tarif: {planLabel(session.profile.plan)}</span>
        <button onClick={() => { void loadProfile(); navigate("/dashboard/profile"); }}><Icon name="settings" />Profil</button>
        <button onClick={logout}><Icon name="logout" />Abmelden</button>
      </div>
    </aside>
  );

  if (isProfileRoute) {
    return (
      <main className="app-shell route-transition">
        {sidebar}
        <AccountPage
          profile={session.profile}
          form={profileForm}
          status={profileStatus}
          saving={profileSaving}
          uploadConfig={uploadConfig}
          onChange={setProfileForm}
          onSave={saveProfile}
          onUpload={uploadProfileAsset}
          onBack={() => navigate("/dashboard")}
        />
      </main>
    );
  }

  if (isBillingRoute) {
    return (
      <main className="app-shell route-transition">
        {sidebar}
        <BillingPage profile={session.profile} status={billingStatus} loadingPlan={billingLoadingPlan} onBack={() => navigate("/dashboard")} onSubscriptionApprove={(plan, subscriptionId) => void activatePayPalSubscription(plan, subscriptionId)} />
      </main>
    );
  }

  if (isBillingSuccessRoute) {
    return (
      <main className="app-shell route-transition">
        {sidebar}
        <PaymentSuccessPage profile={session.profile} status={billingStatus} onBilling={() => navigate("/billing")} onDashboard={() => navigate("/dashboard")} />
      </main>
    );
  }

  if (isPublishRoute) {
    return (
      <main className="app-shell route-transition">
        {sidebar}
        <PublishPage website={website} projectId={projectId} profile={session.profile} status={status} onBack={() => navigate(projectId ? `/editor/${projectId}` : "/dashboard/websites")} onPublish={publishWebsite} />
      </main>
    );
  }

  return (
    <main className="app-shell route-transition">
      {sidebar}
      <section className="workspace">
        <header className="topbar">
          <div><strong>Website-Studio</strong><span>{website.title}</span></div>
          <div className="status-row"><span>Tarif: {planLabel(session.profile.plan)}</span><span>Status: {publishingStatusLabel(website.publishing.status)}</span><span>Sichere Veröffentlichung vorbereitet</span></div>
        </header>
        <section className="brief-panel">
          <div className="page-title"><h1>Erstelle Firmenwebsites, die nicht gleich aussehen.</h1><p>DexHost fragt sauber an, generiert Struktur und Designvorschläge, und lässt jede Section kontrollierbar bearbeiten.</p></div>
          <div className="account-strip">
            <label>Anzeigename<input value={accountName} onChange={(event) => setAccountName(event.target.value)} /></label>
            <button onClick={saveAccount}><Icon name="save" />Profil speichern</button>
            <span>Tarif, Veröffentlichung und Zusatzfunktionen werden sicher serverseitig geprüft.</span>
          </div>
          <div className="brief-grid">
            <label>Branche<input value={brief.industry} onChange={(event) => updateBrief("industry", event.target.value)} /></label>
            <label>Firmenname<input value={brief.companyName} onChange={(event) => updateBrief("companyName", event.target.value)} /></label>
            <label>Standort<input value={brief.location} onChange={(event) => updateBrief("location", event.target.value)} /></label>
            <label>Zielgruppe<input value={brief.audience} onChange={(event) => updateBrief("audience", event.target.value)} /></label>
            <label>Stil<input value={brief.style} onChange={(event) => updateBrief("style", event.target.value)} /></label>
            <label>Farbpräferenz<input value={brief.colorPreference} onChange={(event) => updateBrief("colorPreference", event.target.value)} /></label>
            <label>Eigene Bilder<select value={brief.hasOwnImages} onChange={(event) => updateBrief("hasOwnImages", event.target.value as Brief["hasOwnImages"])}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
            <div className="page-selector">
              <div>
                <strong>Unterseiten</strong>
                <span>{selectedPages.length} Seiten: {selectedPages.join(" / ")}</span>
              </div>
              <div className="page-chip-grid">
                {pageOptions.map((page) => <button className={selectedPages.includes(page) ? "active" : ""} disabled={requiredPages.has(page)} key={page} onClick={() => togglePage(page)} type="button">{page}</button>)}
              </div>
              <label>Eigene Unterseite hinzufügen<input placeholder="z. B. Karriere, Kurse, Standorte" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomPage(event.currentTarget.value); event.currentTarget.value = ""; } }} /></label>
            </div>
          </div>
          <div className="command-row">
            <button className="primary" onClick={generateWebsite} disabled={isGenerating}><Icon name="spark" />{isGenerating ? "Erstellt..." : "KI-Website generieren"}</button>
            <button onClick={() => void persistWebsite()} disabled={isSaving}><Icon name="save" />{isSaving ? "Speichert..." : "Website speichern"}</button>
            <button onClick={runAssetAgent}><Icon name="wand" />Grafische Elemente erstellen</button>
            <button onClick={publishWebsite}><Icon name="publish" />Veröffentlichen</button>
            {status && <span>{status}</span>}
          </div>
        </section>
        <section className="studio-layout">
          <aside className="panel project-panel">
            <h2>Webseiten</h2>
            <div className="project-list">{projects.length ? projects.map((item) => <button className={item.id === projectId ? "active" : ""} key={item.id} onClick={() => { void switchProject(item.id); navigate(`/editor/${item.id}`); }}><strong>{item.title}</strong><span>{publishingStatusLabel(item.status)} / {new Date(item.updatedAt).toLocaleDateString()}</span></button>) : <p className="empty-note">Noch keine Website gespeichert.</p>}</div>
            <h2>Abschnitte</h2>
            <div className="add-row"><select value={addType} onChange={(event) => setAddType(event.target.value as SectionType)}>{sectionTypes.map((type) => <option value={type} key={type}>{sectionLabels[type]}</option>)}</select><button onClick={addSection}><Icon name="plus" />Hinzufügen</button></div>
            <div className="section-list">{website.sections.map((section, index) => <article className={section.id === selectedSection?.id ? "active" : ""} key={section.id}><button onClick={() => setSelectedSectionId(section.id)}><strong>{sectionLabels[section.type]}</strong><span>{section.variant}</span></button><div><button disabled={index === 0} onClick={() => moveSection(section.id, -1)}><Icon name="up" /></button><button disabled={index === website.sections.length - 1} onClick={() => moveSection(section.id, 1)}><Icon name="down" /></button><button onClick={() => deleteSection(section.id)}><Icon name="trash" /></button></div></article>)}</div>
          </aside>
          <WebsitePreview website={website} mode={previewMode} setMode={setPreviewMode} />
          <aside className="panel inspector">
            {selectedSection && <Inspector website={website} section={selectedSection} assets={assets} uploadConfig={uploadConfig} onPreset={applyPreset} onDesign={updateDesign} onWebsite={syncWebsite} onSection={updateSection} onUpload={uploadImage} onPickImage={applyImage} />}
          </aside>
        </section>
      </section>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function ProtectedLoading({ message }: { message: string }) {
  return <main className="auth-shell route-transition"><section className="auth-card"><div className="brand"><div>DH</div><strong>DexHost</strong></div><p>{message}</p></section></main>;
}

function EmailActionPage({ kind, currentPath, search, session, onNavigate }: { kind: "verify" | "reset"; currentPath: string; search: string; session: AuthSession | null; onNavigate: (path: string) => void }) {
  const token = useMemo(() => new URLSearchParams(search).get("token") || "", [search]);
  const [status, setStatus] = useState(kind === "verify" ? "E-Mail wird bestätigt..." : "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(kind === "verify");

  useEffect(() => {
    if (kind !== "verify") return;
    let cancelled = false;
    async function verify() {
      try {
        if (!token) throw new Error("Verifizierungslink fehlt.");
        await request<{ csrfToken: string }>("/api/auth/csrf");
        const response = await request<{ message: string }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
        if (!cancelled) setStatus(response.message || "E-Mail bestätigt. Du kannst dich jetzt anmelden.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "E-Mail konnte nicht bestätigt werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [kind, token]);

  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      if (!token) throw new Error("Reset-Link fehlt.");
      await request<{ csrfToken: string }>("/api/auth/csrf");
      const response = await request<{ message: string }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setStatus(response.message || "Passwort wurde geändert. Du kannst dich jetzt anmelden.");
      setPassword("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Passwort konnte nicht geändert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell auth-page route-transition">
      <PublicNav session={session} currentPath={currentPath} onNavigate={onNavigate} />
      <section className="auth-card">
        <div className="brand"><div>DH</div><strong>DexHost</strong></div>
        <div className="auth-copy">
          <h1>{kind === "verify" ? "E-Mail bestätigen" : "Passwort zurücksetzen"}</h1>
          <p>{kind === "verify" ? "Wir prüfen den Link sicher im Hintergrund." : "Lege ein neues Passwort für dein DexHost-Konto fest."}</p>
        </div>
        {kind === "reset" && (
          <form onSubmit={submitReset}>
            <label>Neues Passwort<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
            <button className="primary" disabled={loading}>{loading ? "Bitte warten..." : "Passwort speichern"}</button>
          </form>
        )}
        {status && <p className="auth-status">{status}</p>}
        <div className="auth-actions">
          <button onClick={() => onNavigate("/login")}>Zur Anmeldung</button>
          <button onClick={() => onNavigate("/register")}>Account erstellen</button>
        </div>
      </section>
    </main>
  );
}

function PublicNav({ session, currentPath, onNavigate }: { session: AuthSession | null; currentPath: string; onNavigate: (path: string) => void }) {
  const links: Array<[string, string]> = [["Funktionen", "/features"], ["Beispiele", "/examples"], ["Preise", "/pricing"], ["FAQ", "/faq"], ["Kontakt", "/contact"]];
  const currentExample = exampleCaseFor(currentPath);
  const websitePreviewPath = currentExample ? `/examples/${currentExample.slug}` : `/examples/${exampleCases[0].slug}`;
  const isActive = (path: string) => currentPath === path || (path === "/examples" && currentPath.startsWith("/examples/"));
  return (
    <header className="public-nav">
      <button className={`public-brand${currentPath === "/" ? " active" : ""}`} aria-current={currentPath === "/" ? "page" : undefined} onClick={() => onNavigate("/")}><span>DH</span><strong>DexHost</strong></button>
      <nav>{links.map(([label, path]) => <button className={isActive(path) ? "active" : ""} aria-current={isActive(path) ? "page" : undefined} key={path} onClick={() => onNavigate(path)}>{label}</button>)}</nav>
      <div className="public-actions">
        <button onClick={() => onNavigate(websitePreviewPath)}>Website ansehen</button>
        <button className={currentPath === "/pricing" ? "active" : ""} onClick={() => onNavigate("/pricing")}>Preise ansehen</button>
        <button className={`ghost${currentPath === "/login" ? " active" : ""}`} onClick={() => onNavigate("/login")}>Einloggen</button>
        <button className="primary" onClick={() => onNavigate("/register")}>Kostenlos starten</button>
        <button className="builder" onClick={() => onNavigate(session ? "/dashboard" : "/login")}>Baukasten öffnen</button>
      </div>
    </header>
  );
}

function PublicStudioVisual() {
  return (
    <div className="public-visual" aria-hidden="true">
      <div className="visual-toolbar"><span /><span /><span /><b>DexHost Studio</b></div>
      <div className="visual-grid">
        <aside>
          {["Hero", "Services", "Gallery", "FAQ"].map((item, index) => <span className={index === 0 ? "active" : ""} key={item}>{item}</span>)}
        </aside>
        <section>
          <div className="visual-hero" />
          <div className="visual-lines"><i /><i /><i /></div>
          <div className="visual-cards"><b /><b /><b /></div>
        </section>
        <aside>
          {["Variante", "Farben", "Bilder", "SEO"].map((item) => <span key={item}>{item}</span>)}
        </aside>
      </div>
    </div>
  );
}

function ExampleBrowserMockup({ example, hero = false }: { example: ExampleCase; hero?: boolean }) {
  const brand = example.title.includes("&") ? example.title : example.title.split(" ").slice(0, 2).join(" ");
  const style = {
    "--example-a": example.colors[0],
    "--example-b": example.colors[1],
    "--example-c": example.colors[2]
  } as React.CSSProperties;
  return (
    <div className={`live-browser-frame example-theme-${example.visual} layout-${example.layout}${hero ? " hero-browser-frame" : ""}`} style={style} aria-label={`Website-Vorschau ${example.title}`}>
      <div className="live-browser-bar">
        <span /><span /><span />
        <b>www.{example.slug.replace(/-/g, "")}.de</b>
      </div>
      <div className="live-site-scroll">
        <header className="live-site-nav">
          <strong>{brand}</strong>
          <nav>{example.nav.map((item) => <span key={item}>{item}</span>)}</nav>
        </header>
        <section className="live-site-hero">
          <div className="live-site-copy">
            <small>{example.industry} · {example.location}</small>
            <h3>{example.heroTitle}</h3>
            <p>{example.heroText}</p>
            <div className="live-site-actions">
              <button>{example.primaryCta}</button>
              <button>{example.secondaryCta}</button>
            </div>
          </div>
          <div className={`live-photo photo-${example.visual}`} />
        </section>
        <section className="live-service-strip">
          {example.highlights.map((item) => <article key={item}><span />{item}</article>)}
        </section>
        <section className="live-proof-band">
          {example.metrics.map((item) => <article key={item.label}><strong>{item.value}</strong><span>{item.label}</span></article>)}
        </section>
        <section className="live-content-band">
          <div>
            <h4>{example.pagePlan[1]?.title || "Leistungen"}</h4>
            <p>{example.pagePlan[1]?.body || example.summary}</p>
          </div>
          <div>
            <h4>{example.pagePlan[2]?.title || "Kontakt"}</h4>
            <p>{example.pagePlan[2]?.body || "Klare Kontaktführung mit hochwertigem Abschluss."}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function ExampleOverview({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section className="example-showcase-list">
      {exampleCases.map((example, index) => (
        <article className={`example-showcase${index % 2 ? " is-reversed" : ""}`} key={example.slug} style={{ "--example-a": example.colors[0], "--example-b": example.colors[1], "--example-c": example.colors[2] } as React.CSSProperties}>
          <div className="example-showcase-copy">
            <span className="example-showcase-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <p className="example-showcase-meta">{example.industry} · {example.location}</p>
              <h3>{example.title}</h3>
              <p>{example.summary}</p>
            </div>
            <dl className="example-showcase-details">
              <div><dt>Stil</dt><dd>{example.style}</dd></div>
              <div><dt>Typografie</dt><dd>{example.typography}</dd></div>
              <div><dt>Layout</dt><dd>{example.sections[0]}</dd></div>
            </dl>
            <div className="example-showcase-actions">
              <button className="primary" onClick={() => onNavigate(`/examples/${example.slug}`)}>Website öffnen</button>
              <button onClick={() => onNavigate("/register")}>Kostenlos starten</button>
            </div>
          </div>
          <ExampleBrowserMockup example={example} />
        </article>
      ))}
    </section>
  );
}

function ExampleDetailPage({ example, session, currentPath, onNavigate }: { example: ExampleCase; session: AuthSession | null; currentPath: string; onNavigate: (path: string) => void }) {
  return (
    <main className="public-shell route-transition">
      <PublicNav session={session} currentPath={currentPath} onNavigate={onNavigate} />
      <section className="example-detail-hero">
        <div className="example-detail-copy">
          <button className="text-link" onClick={() => onNavigate("/examples")}>Zurück zu allen Beispielen</button>
          <span>{example.industry} · {example.location}</span>
          <h1>{example.title}</h1>
          <p>{example.summary}</p>
          <div className="public-cta-row">
            <button className="primary" onClick={() => onNavigate("/register")}>Jetzt erstellen</button>
            <button onClick={() => onNavigate(session ? "/dashboard" : "/login")}>Baukasten öffnen</button>
          </div>
        </div>
        <ExampleBrowserMockup example={example} hero />
      </section>
      <section className="public-band example-story-band">
        <div className="public-section-head">
          <h2>Seitenaufbau</h2>
          <p>Diese Unterseite zeigt eine konkrete DexHost-Kombination aus Struktur, Stil, Farben und Section-Varianten.</p>
        </div>
        <div className="example-story-grid">
          {example.pagePlan.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}
        </div>
      </section>
      <section className="example-detail-band">
        <article>
          <h2>Section-Reihenfolge</h2>
          <div className="example-section-list">{example.sections.map((section, index) => <span key={section}>{String(index + 1).padStart(2, "0")} · {section}</span>)}</div>
        </article>
        <article>
          <h2>Designrichtung</h2>
          <p>{example.style}</p>
          <div className="example-large-palette">{example.colors.map((color) => <span style={{ backgroundColor: color }} key={color}>{color}</span>)}</div>
        </article>
      </section>
    </main>
  );
}

function PublicPage({ pageKey, session, currentPath, launchStatus, launchLoadingService, onLaunchCheckout, onNavigate }: { pageKey: PublicPageKey; session: AuthSession | null; currentPath: string; launchStatus: string; launchLoadingService: string; onLaunchCheckout: (serviceId: LaunchService["id"]) => void; onNavigate: (path: string) => void }) {
  const page = publicPages[pageKey];
  const isContact = pageKey === "contact";
  const isExamples = pageKey === "examples";
  const featuredExamplePath = `/examples/${exampleCases[0].slug}`;
  if (pageKey === "pricing") return <PricingPage session={session} currentPath={currentPath} status={launchStatus} loadingService={launchLoadingService} onCheckout={onLaunchCheckout} onNavigate={onNavigate} />;
  return (
    <main className="public-shell route-transition">
      <PublicNav session={session} currentPath={currentPath} onNavigate={onNavigate} />
      <section className="public-hero">
        <div className="public-copy">
          <h1>{page.title}</h1>
          <p>{page.intro}</p>
          <div className="public-cta-row">
            <button className="primary" onClick={() => onNavigate("/register")}>{pageKey === "home" ? "Jetzt erstellen" : "Kostenlos starten"}</button>
            <button onClick={() => onNavigate(featuredExamplePath)}>Website ansehen</button>
            <button onClick={() => onNavigate(session ? "/dashboard" : "/login")}>Baukasten öffnen</button>
          </div>
          <div className="public-proof">{page.proof.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
        {isExamples ? <ExampleBrowserMockup example={exampleCases[0]} hero /> : <PublicStudioVisual />}
      </section>

      <section className="public-band">
        <div className="public-section-head">
          <h2>{page.navLabel}</h2>
          <p>{isExamples ? "Große Browser-Mockups und echte Branchenästhetik statt kleiner Template-Karten." : "Öffentlich sichtbar. Anmeldung wird erst beim produktiven Arbeiten im Studio verlangt."}</p>
        </div>
        {isExamples ? <ExampleOverview onNavigate={onNavigate} /> : <div className="public-card-grid">{page.sections.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>}
      </section>

      {isContact && (
        <section className="public-form-band">
          <form name="dexhost-contact" method="POST" data-netlify="true">
            <input type="hidden" name="form-name" value="dexhost-contact" />
            <label>Name<input name="name" required /></label>
            <label>E-Mail<input name="email" type="email" required /></label>
            <label>Nachricht<textarea name="message" required /></label>
            <button type="submit">Anfrage senden</button>
          </form>
        </section>
      )}

      <footer className="public-footer">
        <strong>DexHost</strong>
        <nav>
          <button onClick={() => onNavigate("/impressum")}>Impressum</button>
          <button onClick={() => onNavigate("/datenschutz")}>Datenschutz</button>
          <button onClick={() => onNavigate("/agb")}>AGB</button>
          <button onClick={() => onNavigate("/widerruf")}>Widerruf</button>
          <button onClick={() => onNavigate("/zahlungsbedingungen")}>Zahlung</button>
          <button onClick={() => onNavigate("/login")}>Einloggen</button>
        </nav>
      </footer>
    </main>
  );
}

function PayPalHostedOneTimeButton({ serviceName, hostedButtonId }: { serviceName: string; hostedButtonId: string }) {
  const containerId = useMemo(() => `paypal-container-${hostedButtonId}`, [hostedButtonId]);
  const [status, setStatus] = useState("PayPal Button wird geladen...");

  useEffect(() => {
    let cancelled = false;
    setStatus("PayPal Button wird geladen...");
    void ensurePayPalHostedSdk()
      .then(() => {
        if (cancelled) return undefined;
        const container = document.getElementById(containerId);
        const hostedButton = window.paypalHosted?.HostedButtons?.({ hostedButtonId });
        if (!container || !hostedButton) throw new Error("PayPal Hosted Button ist nicht verfügbar.");
        container.innerHTML = "";
        return Promise.resolve(hostedButton.render(`#${containerId}`));
      })
      .then(() => {
        if (!cancelled) setStatus("");
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "PayPal Button konnte nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, [containerId, hostedButtonId]);

  return (
    <div className="paypal-onetime-box">
      <div className="paypal-onetime-head">
        <strong>PayPal Einmalzahlung</strong>
        <span>{serviceName}</span>
      </div>
      <div id={containerId} className="paypal-onetime-container" />
      {status && <small>{status}</small>}
    </div>
  );
}

function LaunchServiceCards({ loadingService, onCheckout }: { loadingService: string; onCheckout: (serviceId: LaunchService["id"]) => void }) {
  return (
    <div className="pricing-grid launch-service-grid">
      {launchServices.map((service) => {
        const hostedButtonId = launchHostedPayPalButtonIds[service.id];
        return (
          <article className={service.featured ? "pricing-card featured" : "pricing-card"} key={service.id}>
            <div className="pricing-card-head">
              <span>{service.id === "launch-help" ? "Schneller Check" : service.id === "setup-service" ? "Geführter Start" : "Mehr Feinschliff"}</span>
              <h3>{service.name}</h3>
              <p>{service.description}</p>
            </div>
            <div className="pricing-money">
              <div><small>Einmalig</small><strong>{service.price}</strong><span>zzgl. USt.</span></div>
            </div>
            <ul className="pricing-feature-list">
              {service.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            {hostedButtonId ? (
              <PayPalHostedOneTimeButton serviceName={service.name} hostedButtonId={hostedButtonId} />
            ) : (
              <button className={service.featured ? "primary" : ""} disabled={Boolean(loadingService)} onClick={() => onCheckout(service.id)}>
                {loadingService === service.id ? "PayPal wird geöffnet..." : service.cta}
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}

function LaunchHelpPage({ session, currentPath, status, loadingService, onNavigate, onCheckout }: { session: AuthSession | null; currentPath: string; status: string; loadingService: string; onNavigate: (path: string) => void; onCheckout: (serviceId: LaunchService["id"]) => void }) {
  return (
    <main className="public-shell pricing-shell route-transition">
      <PublicNav session={session} currentPath={currentPath} onNavigate={onNavigate} />
      <section className="pricing-hero launch-hero">
        <div>
          <span className="pricing-kicker">Einmalige Launch-Hilfe</span>
          <h1>Professionelle Unterstützung ohne laufende Zusatzkosten.</h1>
          <p>Die Tarife bleiben monatlich planbar. Launch-Hilfe, Setup und Premium-Setup sind separate Einmalzahlungen für Kunden, die beim Start schneller zu einem sauberen Ergebnis wollen.</p>
          <div className="public-cta-row">
            <button className="primary" onClick={() => onNavigate(session ? "/dashboard" : "/register")}>{session ? "Übersicht öffnen" : "Kostenlos starten"}</button>
            <button onClick={() => onNavigate("/pricing")}>Tarife ansehen</button>
          </div>
        </div>
        <aside className="pricing-note">
          <strong>Keine Pflicht-Einrichtung</strong>
          <p>Du kannst DexHost vollständig selbst nutzen. Die Setup-Leistungen sind nur für Kunden gedacht, die Zeit sparen oder einen geführten Launch möchten.</p>
          <span>Einmalzahlung über PayPal</span>
        </aside>
      </section>

      {status && <p className={status.includes("konnte") || status.includes("Bitte") ? "form-message error launch-message" : "form-message success launch-message"}>{status}</p>}

      <section className="pricing-band">
        <div className="public-section-head">
          <h2>Setup-Leistungen</h2>
          <p>Klare Pakete für unterschiedliche Situationen: kurzer Check, geführte Einrichtung oder intensiver Premium-Feinschliff.</p>
        </div>
        <LaunchServiceCards loadingService={loadingService} onCheckout={onCheckout} />
      </section>

      <section className="pricing-faq launch-faq">
        <article><h3>Brauche ich dafür ein Konto?</h3><p>Ja. Die Zahlung wird deinem DexHost-Konto zugeordnet, damit Support und gebuchte Leistung sauber nachvollziehbar bleiben.</p></article>
        <article><h3>Ändert das meinen Tarif?</h3><p>Nein. Einmalige Setup-Leistungen ersetzen kein Monatsabo und ändern keine Planrechte im Frontend.</p></article>
        <article><h3>Was passiert nach der Zahlung?</h3><p>DexHost prüft PayPal serverseitig, speichert die Buchung und zeigt dir eine Bestätigung auf der Zahlungsseite.</p></article>
      </section>
    </main>
  );
}

function PricingPage({ session, currentPath, status, loadingService, onCheckout, onNavigate }: { session: AuthSession | null; currentPath: string; status: string; loadingService: string; onCheckout: (serviceId: LaunchService["id"]) => void; onNavigate: (path: string) => void }) {
  const billingTarget = session ? "/billing" : "/register";
  return (
    <main className="public-shell pricing-shell route-transition">
      <PublicNav session={session} currentPath={currentPath} onNavigate={onNavigate} />
      <section className="pricing-hero">
        <div>
          <span className="pricing-kicker">DexHost Preise</span>
          <h1>Professionelles AI Website Studio mit klaren Tarifen.</h1>
          <p>Starte kostenlos und richte deine Website selbst ein. Monatliche Tarife schalten Speicher, Veröffentlichung, Branding und professionelle Workflows serverseitig frei.</p>
          <div className="public-cta-row">
            <button className="primary" onClick={() => onNavigate("/register")}>Kostenlos starten</button>
            <button onClick={() => onNavigate(session ? "/dashboard" : "/login")}>Baukasten öffnen</button>
          </div>
        </div>
        <aside className="pricing-note">
          <strong>Einrichtung ist optional</strong>
          <p>Du kannst deine Website vollständig selbst einrichten. Wer Hilfe möchte, bucht einen separaten Setup-Service für Struktur, Branding, Domain und Launch.</p>
          <span>Faire Monatspläne statt Pflicht-Einrichtungsgebühr</span>
        </aside>
      </section>

      <section className="pricing-band">
        <div className="public-section-head">
          <h2>Tarife</h2>
          <p>Vom kostenlosen Entwurf bis zur veröffentlichbaren Firmenwebsite mit eigener Domain und professionellem Asset-Workflow.</p>
        </div>
        <div className="pricing-grid">
          {pricingPlans.map((plan) => (
            <article className={plan.featured ? "pricing-card featured" : "pricing-card"} key={plan.id}>
              <div className="pricing-card-head">
                <span>{plan.badge}</span>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
              </div>
              <div className="pricing-money">
                <div><small>Monatlich</small><strong>{plan.monthly}</strong><span>zzgl. USt.</span></div>
              </div>
              <p className="pricing-audience">{plan.audience}</p>
              <ul className="pricing-feature-list">
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button className={plan.featured ? "primary" : ""} onClick={() => onNavigate(plan.id === "free" ? "/register" : billingTarget)}>{plan.cta}</button>
            </article>
          ))}
        </div>
      </section>

      {status && <p className={status.includes("konnte") || status.includes("Bitte") ? "form-message error launch-message" : "form-message success launch-message"}>{status}</p>}

      <section className="pricing-band" id="launch-hilfe">
        <div className="public-section-head">
          <h2>Optionale Launch-Hilfe</h2>
          <p>Du kannst DexHost selbst einrichten. Wenn es schneller professionell wirken soll, buchst du hier eine einmalige Hilfe direkt per PayPal.</p>
        </div>
        <LaunchServiceCards loadingService={loadingService} onCheckout={onCheckout} />
      </section>

      <section className="pricing-compare">
        <div>
          <h2>Selbst machen oder Hilfe buchen?</h2>
          <p>Die Monatspläne bleiben fair. Einrichtung ist kein Zwang, sondern eine Zusatzleistung für Kunden, die weniger Zeit investieren möchten.</p>
        </div>
        <div className="pricing-table">
          <article>
            <h3>Selbst einrichten</h3>
            <strong>0 EUR</strong>
            <p>Website selbst erstellen, Bilder hochladen, Texte bearbeiten und veröffentlichen, sofern dein Tarif Veröffentlichung erlaubt.</p>
          </article>
          <article>
            <h3>Hilfe dazubuchen</h3>
            <strong>ab 49 EUR</strong>
            <p>Launch-Hilfe, Setup-Service oder Premium-Setup direkt auf dieser Preiseseite kaufen.</p>
          </article>
        </div>
      </section>

      <section className="pricing-faq">
        {[
          ["Kann ich alles selbst einrichten?", "Ja. DexHost ist so gebaut, dass Nutzer Texte, Bilder, Farben, Abschnitte, SEO und Veröffentlichung selbst steuern können."],
          ["Kann ich später upgraden?", "Ja. Planrechte werden nicht im Frontend gespeichert, sondern serverseitig geprüft und über PayPal bestätigt."],
          ["Warum gibt es trotzdem Setup-Services?", "Manche Kunden wollen Zeit sparen oder einen geführten Launch. Deshalb ist Einrichtung optional und nicht Voraussetzung."]
        ].map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}
      </section>

      <footer className="public-footer">
        <strong>DexHost</strong>
        <nav>
          <button onClick={() => onNavigate("/examples")}>Beispiele</button>
          <button onClick={() => onNavigate("/faq")}>FAQ</button>
          <button onClick={() => onNavigate("/contact")}>Kontakt</button>
          <button onClick={() => onNavigate("/impressum")}>Impressum</button>
          <button onClick={() => onNavigate("/datenschutz")}>Datenschutz</button>
          <button onClick={() => onNavigate("/agb")}>AGB</button>
          <button onClick={() => onNavigate("/widerruf")}>Widerruf</button>
          <button onClick={() => onNavigate("/zahlungsbedingungen")}>Zahlung</button>
        </nav>
      </footer>
    </main>
  );
}

function PayPalSubscriptionButton({ planName, planId, userId, buttonStyle, onApprove }: { planName: string; planId: string; userId: string; buttonStyle: { shape: string; color: string; layout: string; label: string }; onApprove: (subscriptionId: string) => void }) {
  const containerId = useMemo(() => `paypal-button-container-${planId}`, [planId]);
  const [status, setStatus] = useState("PayPal Abo-Button wird geladen...");

  useEffect(() => {
    let cancelled = false;
    setStatus("PayPal Abo-Button wird geladen...");
    void ensurePayPalSubscriptionSdk()
      .then(() => {
        if (cancelled) return undefined;
        const container = document.getElementById(containerId);
        const buttons = window.paypalSubscription?.Buttons?.({
          style: buttonStyle,
          createSubscription: (_data, actions) => actions.subscription.create({ plan_id: planId, custom_id: userId }),
          onApprove: (data) => {
            if (data.subscriptionID) onApprove(data.subscriptionID);
          },
          onError: (error) => {
            setStatus(error instanceof Error ? error.message : "PayPal Abo konnte nicht gestartet werden.");
          }
        });
        if (!container || !buttons) throw new Error("PayPal Abo-Button ist nicht verfügbar.");
        container.innerHTML = "";
        return Promise.resolve(buttons.render(`#${containerId}`));
      })
      .then(() => {
        if (!cancelled) setStatus("");
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "PayPal Abo-Button konnte nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, [buttonStyle, containerId, onApprove, planId, userId]);

  return (
    <div className="paypal-subscription-box">
      <div className="paypal-subscription-head">
        <strong>Monatliches PayPal-Abo</strong>
        <span>{planName}</span>
      </div>
      <div id={containerId} className="paypal-subscription-container" />
      {status && <small>{status}</small>}
      {!status && <small>Nach Freigabe prüft DexHost das Abo serverseitig und aktiviert den Tarif.</small>}
    </div>
  );
}

function PaymentSuccessPage({ profile, status, onBilling, onDashboard }: { profile: AccountProfile; status: string; onBilling: () => void; onDashboard: () => void }) {
  const isSetupPayment = status.includes("Einmalzahlung");
  const isConfirmed = status.includes("bestätigt") || status.includes("aktiv") || ["basic", "business", "pro", "admin"].includes(profile.plan);
  return (
    <section className="workspace account-page payment-success-page">
      <header className="topbar">
        <div><strong>Zahlung abgeschlossen</strong><span>Bestätigung</span></div>
        <div className="status-row"><span>Tarif: {planLabel(profile.plan)}</span><span>Konto: {accountStatusLabel(profile.account_status)}</span><span>Sicher bestätigt</span></div>
      </header>
      <section className="account-hero payment-success-hero">
        <div>
          <span className={isConfirmed ? "success-pill" : "success-pill pending"}>{isConfirmed ? "Bestätigt" : "Wird geprüft"}</span>
          <h1>{isSetupPayment ? "Deine Launch-Hilfe ist gebucht." : isConfirmed ? "Dein Tarif ist aktiv." : "Zahlung wird geprüft."}</h1>
          <p>{isSetupPayment ? "PayPal wurde serverseitig bestätigt. Die Buchung ist deinem DexHost-Konto zugeordnet." : isConfirmed ? "PayPal wurde serverseitig bestätigt. Du kannst jetzt zurück ins Studio und die freigeschalteten DexHost-Funktionen nutzen." : "Falls PayPal dich gerade zurückgeleitet hat, prüft DexHost die Zahlung im Hintergrund. Lade die Seite nicht mehrfach neu."}</p>
        </div>
        <div className="account-actions">
          <button onClick={onBilling}>Tarife ansehen</button>
          <button className="primary" onClick={onDashboard}>Übersicht öffnen</button>
        </div>
      </section>
      {status && <p className={isConfirmed ? "form-message success" : "form-message error"}>{status}</p>}
      <section className="profile-grid">
        <article className="profile-card">
          <h2>Nächster Schritt</h2>
          <p className="empty-note">Öffne deine Übersicht, erstelle eine Website oder veröffentliche ein vorhandenes Projekt, wenn dein Tarif die Veröffentlichung erlaubt.</p>
          <button className="primary" onClick={onDashboard}>Zur Übersicht</button>
        </article>
        <article className="profile-card">
          <h2>Aktuelles Konto</h2>
          <dl className="account-facts">
            <dt>E-Mail</dt><dd>{profile.email}</dd>
            <dt>Tarif</dt><dd>{profile.plan}</dd>
            <dt>Konto-Status</dt><dd>{accountStatusLabel(profile.account_status)}</dd>
          </dl>
        </article>
      </section>
    </section>
  );
}

function BillingPage({ profile, status, loadingPlan, onBack, onSubscriptionApprove }: { profile: AccountProfile; status: string; loadingPlan: string; onBack: () => void; onSubscriptionApprove: (plan: AccountProfile["plan"], subscriptionId: string) => void }) {
  return (
    <section className="workspace account-page">
      <header className="topbar">
        <div><strong>Abo & Zahlungen</strong><span>Tarife verwalten</span></div>
        <div className="status-row"><span>Tarif: {planLabel(profile.plan)}</span><span>Konto: {accountStatusLabel(profile.account_status)}</span><span>PayPal sicher geprüft</span></div>
      </header>
      <section className="account-hero">
        <div>
          <h1>Tarif & Zahlung</h1>
          <p>Pakete werden über PayPal Checkout gestartet und erst nach serverseitiger Bestätigung freigeschaltet. Der Browser kann keinen Tarif selbst setzen.</p>
        </div>
        <div className="account-actions"><button onClick={onBack}>Zurück zur Übersicht</button></div>
      </section>
      {status && <p className={status.includes("bestätigt") || status.includes("aktiv") ? "form-message success" : "form-message error"}>{status}</p>}
      <section className="profile-grid">
        <article className="profile-card">
          <h2>Free</h2>
          <p className="empty-note">Entwerfen, bearbeiten und testen.</p>
          <button disabled>{profile.plan === "free" ? "Aktueller Tarif" : "Kostenloser Tarif"}</button>
        </article>
        {profile.paypal_subscription_id && (
          <article className="profile-card">
            <h2>Aktives PayPal-Abo</h2>
            <dl className="account-facts">
              <dt>Status</dt><dd>{billingStatusLabel(profile.subscription_status || profile.billing_status)}</dd>
              <dt>Abo-ID</dt><dd>{profile.paypal_subscription_id}</dd>
              <dt>Bezahlt bis</dt><dd>{formatDate(profile.subscription_current_period_end)}</dd>
              <dt>Letztes PayPal-Event</dt><dd>{profile.subscription_last_event || "Noch nicht empfangen"}</dd>
            </dl>
            <p className="empty-note">Kündigungen, pausierte Abos und fehlgeschlagene Zahlungen werden per PayPal Webhook serverseitig synchronisiert.</p>
          </article>
        )}
        {paidPricingPlans.map((plan) => {
          const subscriptionPlanId = subscriptionPayPalPlanIds[plan.id];
          const buttonStyle = subscriptionPayPalButtonStyles[plan.id] || { shape: "rect", color: "silver", layout: "vertical", label: "subscribe" };
          return (
            <article className="profile-card billing-plan" key={plan.id}>
              <span>{plan.badge}</span>
              <h2>{plan.name}</h2>
              <strong>{plan.monthly} / Monat</strong>
              <p className="empty-note">{plan.description}</p>
              {subscriptionPlanId ? <PayPalSubscriptionButton planName={plan.name} planId={subscriptionPlanId} userId={profile.id} buttonStyle={buttonStyle} onApprove={(subscriptionId) => onSubscriptionApprove(plan.id, subscriptionId)} /> : <p className="billing-plan-missing">Für diesen Tarif ist noch kein monatlicher PayPal-Abo-Plan hinterlegt.</p>}
            </article>
          );
        })}
      </section>
    </section>
  );
}

function PublishPage({ website, projectId, profile, status, onBack, onPublish }: { website: WebsiteDocument; projectId: string; profile: AccountProfile; status: string; onBack: () => void; onPublish: () => void }) {
  const canPublish = hasPremiumAccess(profile);
  return (
    <section className="workspace account-page">
      <header className="topbar">
        <div><strong>Veröffentlichung</strong><span>{website.title}</span></div>
        <div className="status-row"><span>Status: {publishingStatusLabel(website.publishing.status)}</span><span>Sichere Verbindung</span><span>Tarif: {planLabel(profile.plan)}</span></div>
      </header>
      <section className="account-hero">
        <div>
          <h1>Website veröffentlichen</h1>
          <p>DexHost prüft Konto, Website-Besitz und aktiven Tarif sicher im Hintergrund, bevor deine Website online geht.</p>
        </div>
        <div className="account-actions">
          <button onClick={onBack}>Zurück zum Bearbeiten</button>
          <button className="primary" disabled={!projectId || !canPublish} onClick={onPublish}>Veröffentlichen</button>
        </div>
      </section>
      {status && <p className={status.includes("requires") || status.includes("fehlgeschlagen") ? "form-message error" : "form-message success"}>{status}</p>}
      <section className="profile-grid">
        <article className="profile-card"><h2>Website</h2><dl className="account-facts"><dt>Name</dt><dd>{website.title}</dd><dt>Adresse</dt><dd>{website.publishing.subdomain}</dd><dt>Status</dt><dd>{publishingStatusLabel(website.publishing.status)}</dd></dl></article>
        <article className="profile-card"><h2>Freigabe</h2><p className="empty-note">Die Veröffentlichung wird erst nach sicherer Prüfung von Konto, Website-Besitz und aktivem Tarif freigegeben.</p></article>
      </section>
    </section>
  );
}

function AccountPage({ profile, form, status, saving, uploadConfig, onChange, onSave, onUpload, onBack }: { profile: AccountProfile; form: ProfileForm; status: string; saving: boolean; uploadConfig: UploadConfig; onChange: (form: ProfileForm) => void; onSave: (event?: React.FormEvent) => void; onUpload: (kind: "logo" | "avatar", file: File) => void; onBack: () => void }) {
  const change = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => onChange({ ...form, [key]: value });
  const changeColor = (key: keyof ProfileForm["branding_colors"], value: string) => onChange({ ...form, branding_colors: { ...form.branding_colors, [key]: value } });
  return (
    <section className="workspace account-page">
      <header className="topbar">
        <div><strong>Profil & Konto</strong><span>Persönliche Daten</span></div>
        <div className="status-row"><span>Tarif: {planLabel(profile.plan)}</span><span>Konto: {accountStatusLabel(profile.account_status)}</span><span>Sicher angemeldet</span></div>
      </header>
      <form className="account-layout" onSubmit={onSave}>
        <section className="account-hero">
          <div>
            <h1>Kontodaten</h1>
            <p>E-Mail, Tarif und Zahlungsrechte werden serverseitig geführt. Du bearbeitest hier nur die freigegebenen Profil-, Firmen- und Branding-Daten.</p>
          </div>
          <div className="account-actions">
            <button type="button" onClick={onBack}>Zurück ins Studio</button>
            <button className="primary" disabled={saving} type="submit">{saving ? "Speichert..." : "Speichern"}</button>
          </div>
        </section>

        {status && <p className={status.includes("ungültig") || status.includes("Bitte") || status.includes("fehlgeschlagen") || status.includes("konnte") ? "form-message error" : "form-message success"}>{status}</p>}

        <section className="profile-grid">
          <article className="profile-card">
            <h2>Persönliche Daten</h2>
            <div className="profile-fields two">
              <label>E-Mail-Adresse<input value={profile.email} readOnly /></label>
              <label>Anzeigename<input value={form.display_name} onChange={(event) => change("display_name", event.target.value)} required minLength={2} /></label>
              <label>Vorname<input value={form.first_name} onChange={(event) => change("first_name", event.target.value)} /></label>
              <label>Nachname<input value={form.last_name} onChange={(event) => change("last_name", event.target.value)} /></label>
              <label>Telefonnummer<input value={form.phone} onChange={(event) => change("phone", event.target.value)} placeholder="+49 30 123456" /></label>
              <label>Bevorzugte Sprache<select value={form.preferred_language} onChange={(event) => change("preferred_language", event.target.value as ProfileForm["preferred_language"])}><option value="de">Deutsch</option><option value="en">English</option><option value="fr">Français</option><option value="es">Español</option><option value="it">Italiano</option><option value="nl">Nederlands</option></select></label>
              <label className="wide">Adresse<textarea value={form.address} onChange={(event) => change("address", event.target.value)} /></label>
              <label>Land<input value={form.country} onChange={(event) => change("country", event.target.value)} placeholder="Deutschland" /></label>
            </div>
          </article>

          <article className="profile-card">
            <h2>Firmendaten</h2>
            <div className="profile-fields two">
              <label>Firmenname<input value={form.company_name} onChange={(event) => change("company_name", event.target.value)} /></label>
              <label>Branche<input value={form.industry} onChange={(event) => change("industry", event.target.value)} /></label>
              <label>Website/Domain<input value={form.website_domain} onChange={(event) => change("website_domain", event.target.value)} placeholder="https://dexhost.de" /></label>
              <label>USt-ID optional<input value={form.vat_id} onChange={(event) => change("vat_id", event.target.value)} placeholder="DE123456789" /></label>
              <label className="wide">Rechnungsadresse<textarea value={form.billing_address} onChange={(event) => change("billing_address", event.target.value)} /></label>
            </div>
          </article>

          <article className="profile-card">
            <h2>Branding</h2>
            <div className="brand-upload-row">
              <div className="brand-preview">{form.logo_url ? <img src={form.logo_url} alt="Logo" /> : <span>Logo</span>}</div>
              <label className="upload-zone"><Icon name="upload" />Logo hochladen<input type="file" accept={uploadConfig.allowedTypes.map((item) => `.${item}`).join(",")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload("logo", file); event.currentTarget.value = ""; }} /></label>
              <div className="brand-preview avatar">{form.avatar_url ? <img src={form.avatar_url} alt="Profilbild" /> : <span>Bild</span>}</div>
              <label className="upload-zone"><Icon name="upload" />Profilbild<input type="file" accept={uploadConfig.allowedTypes.map((item) => `.${item}`).join(",")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload("avatar", file); event.currentTarget.value = ""; }} /></label>
            </div>
            <div className="profile-fields three">
              <label>Primärfarbe<input type="color" value={form.branding_colors.primary} onChange={(event) => changeColor("primary", event.target.value)} /></label>
              <label>Sekundärfarbe<input type="color" value={form.branding_colors.secondary} onChange={(event) => changeColor("secondary", event.target.value)} /></label>
              <label>Akzentfarbe<input type="color" value={form.branding_colors.accent} onChange={(event) => changeColor("accent", event.target.value)} /></label>
            </div>
            <small>{uploadConfig.allowedTypes.join(", ")} bis {formatBytes(uploadConfig.maxBytes)}</small>
          </article>

          <article className="profile-card">
            <h2>Abo & Nutzung</h2>
            <dl className="account-facts">
              <dt>Aktueller Tarif</dt><dd>{planLabel(profile.plan)}</dd>
              <dt>Abo-Status</dt><dd>{billingStatusLabel(profile.subscription_status || profile.billing_status)}</dd>
              <dt>PayPal-Abo</dt><dd>{profile.paypal_subscription_id || "Nicht hinterlegt"}</dd>
              <dt>Bezahlt bis</dt><dd>{formatDate(profile.subscription_current_period_end)}</dd>
              <dt>Konto-Status</dt><dd>{accountStatusLabel(profile.account_status)}</dd>
              <dt>Erstellungsdatum</dt><dd>{formatDate(profile.created_at)}</dd>
              <dt>Letzte Anmeldung</dt><dd>{formatDate(profile.last_login_at)}</dd>
              <dt>Zahlungen</dt><dd>Werden sicher serverseitig verwaltet.</dd>
            </dl>
          </article>
        </section>
      </form>
    </section>
  );
}

function AuthScreen({ mode, form, status, loading, session, currentPath, onMode, onForm, onSubmit, onNavigate }: { mode: AuthMode; form: AuthForm; status: string; loading: boolean; session: AuthSession | null; currentPath: string; onMode: (mode: AuthMode) => void; onForm: (form: AuthForm) => void; onSubmit: (event: React.FormEvent) => void; onNavigate: (path: string) => void }) {
  const title = mode === "login" ? "Bei DexHost anmelden" : mode === "register" ? "Account erstellen" : "Passwort zurücksetzen";
  return (
    <main className="auth-shell auth-page route-transition">
      <PublicNav session={session} currentPath={currentPath} onNavigate={onNavigate} />
      <section className="auth-card">
        <div className="brand"><div>DH</div><strong>DexHost</strong></div>
        <div className="auth-copy">
          <h1>{title}</h1>
          <p>Dein Konto ist geschützt. Projekte, Bilder, KI-Aufrufe und Veröffentlichungen werden sicher serverseitig geprüft.</p>
        </div>
        <form onSubmit={onSubmit}>
          {mode === "register" && <label>Name<input value={form.displayName} onChange={(event) => onForm({ ...form, displayName: event.target.value })} autoComplete="name" /></label>}
          <label>E-Mail<input type="email" value={form.email} onChange={(event) => onForm({ ...form, email: event.target.value })} autoComplete="email" required /></label>
          {mode !== "forgot" && <label>Passwort<input type="password" value={form.password} onChange={(event) => onForm({ ...form, password: event.target.value })} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>}
          <button className="primary" disabled={loading}>{loading ? "Bitte warten..." : mode === "login" ? "Einloggen" : mode === "register" ? "Registrieren" : "Link senden"}</button>
        </form>
        <div className="auth-actions">
          <button className={mode === "login" ? "active" : ""} onClick={() => { onMode("login"); onNavigate("/login"); }}>Anmelden</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => { onMode("register"); onNavigate("/register"); }}>Registrieren</button>
          <button className={mode === "forgot" ? "active" : ""} onClick={() => onMode("forgot")}>Passwort vergessen</button>
        </div>
        {status && <p className="auth-status">{status}</p>}
      </section>
    </main>
  );
}

function Inspector({ website, section, assets, uploadConfig, onPreset, onDesign, onWebsite, onSection, onUpload, onPickImage }: { website: WebsiteDocument; section: WebsiteSection; assets: ImageAsset[]; uploadConfig: UploadConfig; onPreset: (name: string) => void; onDesign: (updater: (design: DesignSystem) => DesignSystem) => void; onWebsite: (website: WebsiteDocument, label?: string) => void; onSection: (id: string, updater: (section: WebsiteSection) => WebsiteSection) => void; onUpload: (file: File) => void; onPickImage: (url: string) => void }) {
  const selected = new Set(section.imageUrls);
  return (
    <>
      <h2>Designsystem</h2>
      <div className="control-grid">
        <label>Palette<select value={website.designSystem.paletteName} onChange={(event) => onPreset(event.target.value)}>{designSystems.map((design) => <option value={design.paletteName} key={design.paletteName}>{design.paletteName}</option>)}</select></label>
        <label>Schriften<select value={website.designSystem.fontPair} onChange={(event) => onDesign((design) => ({ ...design, fontPair: event.target.value as DesignSystem["fontPair"] }))}>{fontPairs.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label>Buttons<select value={website.designSystem.buttonStyle} onChange={(event) => onDesign((design) => ({ ...design, buttonStyle: event.target.value as DesignSystem["buttonStyle"] }))}>{buttonStyles.map((item) => <option value={item} key={item}>{optionLabel(item)}</option>)}</select></label>
        <label>Rundung<select value={website.designSystem.radiusScale} onChange={(event) => onDesign((design) => ({ ...design, radiusScale: event.target.value as DesignSystem["radiusScale"] }))}>{radii.map((item) => <option value={item} key={item}>{optionLabel(item)}</option>)}</select></label>
        <label>Schatten<select value={website.designSystem.shadowStyle} onChange={(event) => onDesign((design) => ({ ...design, shadowStyle: event.target.value as DesignSystem["shadowStyle"] }))}>{shadows.map((item) => <option value={item} key={item}>{optionLabel(item)}</option>)}</select></label>
        <label>Akzentfarbe<input type="color" value={website.designSystem.colors.accent} onChange={(event) => onDesign((design) => ({ ...design, colors: { ...design.colors, accent: event.target.value } }))} /></label>
      </div>
      <h2>{sectionLabels[section.type]}</h2>
      <label>Layout-Variante<select value={section.variant} onChange={(event) => onSection(section.id, (item) => ({ ...item, variant: event.target.value }))}>{sectionVariants[section.type].map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <div className="control-grid">
        <label>Hintergrundfarbe<input type="color" value={section.styleSettings.backgroundColor || website.designSystem.colors.surface} onChange={(event) => onSection(section.id, (item) => ({ ...item, styleSettings: { ...item.styleSettings, backgroundColor: event.target.value } }))} /></label>
        <label>Text<input type="color" value={section.styleSettings.textColor || website.designSystem.colors.text} onChange={(event) => onSection(section.id, (item) => ({ ...item, styleSettings: { ...item.styleSettings, textColor: event.target.value } }))} /></label>
        <label>Bildposition<select value={section.styleSettings.imagePosition || "right"} onChange={(event) => onSection(section.id, (item) => ({ ...item, styleSettings: { ...item.styleSettings, imagePosition: event.target.value as ImagePosition } }))}>{imagePositions.map((item) => <option value={item} key={item}>{optionLabel(item)}</option>)}</select></label>
        <label>Abstände<select value={section.styleSettings.spacing || website.designSystem.spacingScale} onChange={(event) => onSection(section.id, (item) => ({ ...item, styleSettings: { ...item.styleSettings, spacing: event.target.value as DesignSystem["spacingScale"] } }))}>{spacings.map((item) => <option value={item} key={item}>{optionLabel(item)}</option>)}</select></label>
        <label>Hintergrundstil<select value={section.backgroundSettings.kind} onChange={(event) => onSection(section.id, (item) => ({ ...item, backgroundSettings: { ...item.backgroundSettings, kind: event.target.value as WebsiteSection["backgroundSettings"]["kind"] } }))}>{backgroundKinds.map((item) => <option value={item} key={item}>{optionLabel(item)}</option>)}</select></label>
        <label>Grafikelement<select value={section.backgroundSettings.graphicElement || "none"} onChange={(event) => onSection(section.id, (item) => ({ ...item, backgroundSettings: { ...item.backgroundSettings, graphicElement: event.target.value as WebsiteSection["backgroundSettings"]["graphicElement"] } }))}>{graphicElements.map((item) => <option value={item} key={item}>{optionLabel(item)}</option>)}</select></label>
      </div>
      <div className="content-editor">{fields[section.type].map((field) => <label key={field.key}>{field.label}{field.multiline ? <textarea value={section.content[field.key] || ""} onChange={(event) => onSection(section.id, (item) => ({ ...item, content: { ...item.content, [field.key]: event.target.value } }))} /> : <input value={section.content[field.key] || ""} onChange={(event) => onSection(section.id, (item) => ({ ...item, content: { ...item.content, [field.key]: event.target.value } }))} />}</label>)}</div>
      <section className="image-library">
        <h2>Projektbilder</h2>
        <label className="upload-zone"><Icon name="upload" />Bild hochladen<input type="file" accept={uploadConfig.allowedTypes.map((item) => `.${item}`).join(",")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.currentTarget.value = ""; }} /></label>
        <small>{uploadConfig.allowedTypes.join(", ")} bis {formatBytes(uploadConfig.maxBytes)}</small>
        <div className="image-grid">{assets.length ? assets.map((asset) => <button className={selected.has(asset.url) ? "active" : ""} key={asset.id} onClick={() => onPickImage(asset.url)}><img src={asset.url} alt={asset.file_name} /><span>{asset.file_name}</span></button>) : <p>Noch keine Projektbilder hochgeladen.</p>}</div>
      </section>
      <h2>SEO & Veröffentlichung</h2>
      <label>SEO-Titel<input value={website.seo.title} onChange={(event) => onWebsite({ ...website, seo: { ...website.seo, title: event.target.value } })} /></label>
      <label>Meta-Beschreibung<textarea value={website.seo.description} onChange={(event) => onWebsite({ ...website, seo: { ...website.seo, description: event.target.value } })} /></label>
      <label>Subdomain<input value={website.publishing.subdomain} onChange={(event) => onWebsite({ ...website, publishing: { ...website.publishing, subdomain: event.target.value } })} /></label>
      <section className="asset-panel"><h2>Asset-Assistent</h2>{website.assetNeeds.map((asset) => <article key={asset.id}><strong>{asset.title}</strong><span>{asset.type} / {asset.priority}</span><p>{asset.reason}</p><small>{asset.sourcePolicy}</small></article>)}</section>
    </>
  );
}

function designStyle(website: WebsiteDocument): React.CSSProperties {
  const fonts: Record<DesignSystem["fontPair"], { heading: string; body: string }> = {
    "Inter + Source Serif": { heading: "Georgia, serif", body: "Inter, ui-sans-serif, system-ui, sans-serif" },
    "Manrope + Fraunces": { heading: "Georgia, serif", body: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif" },
    "Space Grotesk + Inter": { heading: "Inter, ui-sans-serif, system-ui, sans-serif", body: "Inter, ui-sans-serif, system-ui, sans-serif" },
    "IBM Plex Sans + IBM Plex Serif": { heading: "Georgia, serif", body: "Inter, ui-sans-serif, system-ui, sans-serif" }
  };
  const font = fonts[website.designSystem.fontPair];
  return { "--web-page": website.designSystem.colors.page, "--web-surface": website.designSystem.colors.surface, "--web-text": website.designSystem.colors.text, "--web-muted": website.designSystem.colors.muted, "--web-accent": website.designSystem.colors.accent, "--web-accent-soft": website.designSystem.colors.accentSoft, "--web-heading": font.heading, "--web-body": font.body } as React.CSSProperties;
}
function sectionImages(section: WebsiteSection) { return section.imageUrls.filter(Boolean); }
function ImageFrame({ url, label }: { url?: string; label: string }) { return url ? <img className="site-image" src={url} alt={label} /> : <div className="site-image placeholder"><Icon name="image" /><span>{label}</span></div>; }
function WebsitePreview({ website, mode, setMode }: { website: WebsiteDocument; mode: "desktop" | "mobile"; setMode: (mode: "desktop" | "mobile") => void }) {
  return <section className={`preview-shell preview-${mode} button-${website.designSystem.buttonStyle} radius-${website.designSystem.radiusScale} shadow-${website.designSystem.shadowStyle}`} style={designStyle(website)}><div className="preview-top"><strong>{website.title}</strong><div><button className={mode === "desktop" ? "active" : ""} onClick={() => setMode("desktop")}>Desktop</button><button className={mode === "mobile" ? "active" : ""} onClick={() => setMode("mobile")}>Mobil</button></div></div><div className="preview-canvas">{website.sections.map((section) => <PreviewSection section={section} website={website} key={section.id} />)}</div></section>;
}
function PreviewSection({ section, website }: { section: WebsiteSection; website: WebsiteDocument }) {
  const images = sectionImages(section);
  const background = section.styleSettings.backgroundColor || website.designSystem.colors.surface;
  const style = { backgroundColor: background, color: section.styleSettings.textColor || website.designSystem.colors.text, "--web-accent": section.styleSettings.accentColor || website.designSystem.colors.accent } as React.CSSProperties;
  if (section.backgroundSettings.kind === "soft-gradient") style.backgroundImage = `linear-gradient(135deg, ${background}, ${website.designSystem.colors.accentSoft})`;
  if (section.styleSettings.imagePosition === "background" && images[0]) style.backgroundImage = `linear-gradient(90deg, rgba(0,0,0,.54), rgba(0,0,0,.12)), url(${images[0]})`;
  return <section className={`site-section site-${section.type} site-${section.variant} image-${section.styleSettings.imagePosition || "right"} spacing-${section.styleSettings.spacing || website.designSystem.spacingScale} graphic-${section.backgroundSettings.graphicElement || "none"}`} style={style}>{renderSection(section)}</section>;
}
function renderSection(section: WebsiteSection) {
  const c = section.content;
  const images = sectionImages(section);
  if (section.type === "hero") return <div className="site-inner hero-inner"><div className="site-copy"><h1>{c.headline}</h1><p>{c.body}</p><div className="site-actions"><button>{c.primaryCta}</button><button>{c.secondaryCta}</button></div></div><ImageFrame url={images[0]} label="Hero-Bild" /></div>;
  if (section.type === "about") return <div className="site-inner split-inner"><ImageFrame url={images[0]} label="Über-uns-Bild" /><div className="site-copy"><h2>{c.heading}</h2><p>{c.body}</p><div className="pill-row">{splitLines(c.stats).map((item) => <span key={item}>{item}</span>)}</div></div></div>;
  if (section.type === "services") return <div className="site-inner"><SectionHead heading={c.heading} intro={c.intro} /><div className="card-grid">{splitLines(c.items).map((item, index) => <article key={item}><ImageFrame url={images[index]} label={`Leistung ${index + 1}`} /><strong>{item}</strong><p>Klare Leistung, sauberer Ablauf und ein direkter nächster Schritt.</p></article>)}</div></div>;
  if (section.type === "gallery") { const gallery = images.length ? images : ["", "", "", ""]; const captions = splitLines(c.captions); return <div className="site-inner"><SectionHead heading={c.heading} intro={c.intro} /><div className="gallery-grid">{gallery.map((url, index) => <figure key={`${url}-${index}`}><ImageFrame url={url} label={`Galerie ${index + 1}`} /><figcaption>{captions[index] || `Bild ${index + 1}`}</figcaption></figure>)}</div></div>; }
  if (section.type === "testimonials") return <div className="site-inner"><SectionHead heading={c.heading} /><div className="quote-grid">{splitLines(c.quotes).map((line, index) => { const [name, ...quote] = line.split(":"); return <article key={`${line}-${index}`}><p>"{quote.join(":").trim() || line}"</p><strong>{quote.length ? name : "Kunde"}</strong></article>; })}</div></div>;
  if (section.type === "faq") return <div className="site-inner"><SectionHead heading={c.heading} /><div className="faq-list">{splitLines(c.questions).map((line) => { const marker = line.indexOf("?"); return <article key={line}><strong>{marker >= 0 ? line.slice(0, marker + 1) : line}</strong><p>{marker >= 0 ? line.slice(marker + 1).trim() : "Antwort hier ergänzen."}</p></article>; })}</div></div>;
  if (section.type === "contact") return <div className="site-inner contact-inner"><div className="site-copy"><h2>{c.heading}</h2><p>{c.intro}</p><dl><dt>E-Mail</dt><dd>{c.email}</dd><dt>Telefon</dt><dd>{c.phone}</dd><dt>Adresse</dt><dd>{c.address}</dd></dl></div><form name="dexhost-contact" method="POST" data-netlify="true"><input type="hidden" name="form-name" value="dexhost-contact" /><input name="name" placeholder="Name" /><input name="email" type="email" placeholder="E-Mail" /><textarea name="message" placeholder="Nachricht" /><button type="submit">Anfrage senden</button></form></div>;
  if (section.type === "pricing") return <div className="site-inner"><SectionHead heading={c.heading} intro={c.intro} /><div className="price-grid">{splitLines(c.plans).map((line, index) => { const [name, price, features] = line.split("|").map((item) => item.trim()); return <article className={index === 1 ? "featured" : ""} key={name}><strong>{name}</strong><b>{price}</b><ul>{(features || "").split(",").map((item) => <li key={item}>{item.trim()}</li>)}</ul><button>Wählen</button></article>; })}</div></div>;
  if (section.type === "team") return <div className="site-inner"><SectionHead heading={c.heading} intro={c.intro} /><div className="team-grid">{splitLines(c.members).map((line, index) => { const [name, role, bio] = line.split("|").map((item) => item.trim()); return <article key={name}><ImageFrame url={images[index]} label={name} /><span>{role}</span><strong>{name}</strong><p>{bio}</p></article>; })}</div></div>;
  if (section.type === "process") return <div className="site-inner"><SectionHead heading={c.heading} intro={c.intro} /><div className="process-list">{splitLines(c.steps).map((line, index) => { const [title, detail] = line.split("|").map((item) => item.trim()); return <article key={line}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{title}</strong><p>{detail}</p></div></article>; })}</div></div>;
  if (section.type === "beforeAfter") return <div className="site-inner"><SectionHead heading={c.heading} /><div className="before-after"><article><ImageFrame url={images[0]} label="Vorher" /><span>Vorher</span><p>{c.before}</p></article><article><ImageFrame url={images[1]} label="Nachher" /><span>Nachher</span><p>{c.after}</p></article></div></div>;
  if (section.type === "cta") return <div className="site-inner cta-inner"><h2>{c.heading}</h2><p>{c.intro}</p><div className="site-actions"><button>{c.primaryCta}</button><button>{c.secondaryCta}</button></div></div>;
  return <footer className="site-inner footer-inner"><div><strong>{c.brand}</strong><p>{c.tagline}</p></div><nav>{splitLines(c.links).map((link) => <a key={link}>{link}</a>)}</nav><small>{c.legal}</small></footer>;
}
function SectionHead({ heading, intro }: { heading: string; intro?: string }) { return <div className="section-head"><h2>{heading}</h2>{intro && <p>{intro}</p>}</div>; }

function PublishedSite({ slug }: { slug: string }) {
  const [website, setWebsite] = useState<WebsiteDocument | null>(null);
  const [message, setMessage] = useState("Website wird geladen...");

  useEffect(() => {
    request<{ website: WebsiteProject }>(`/api/public/websites/${slug}`)
      .then((response) => {
        setWebsite(response.website.website);
        document.title = response.website.website.seo.title;
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Website nicht gefunden."));
  }, [slug]);

  if (!website) return <main className="published-loading"><div className="brand"><div>DH</div><strong>DexHost</strong></div><p>{message}</p></main>;
  return (
    <main className={`published-site button-${website.designSystem.buttonStyle} radius-${website.designSystem.radiusScale} shadow-${website.designSystem.shadowStyle}`} style={designStyle(website)}>
      {website.sections.map((section) => <PreviewSection section={section} website={website} key={section.id} />)}
    </main>
  );
}

const publicSiteMatch = window.location.pathname.match(/^\/s\/([a-z0-9-]+)/i);
createRoot(document.getElementById("root")!).render(publicSiteMatch ? <PublishedSite slug={publicSiteMatch[1]} /> : <App />);




