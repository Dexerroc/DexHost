# DexHost AI Website Studio

Professioneller KI-Block-Builder fuer Firmenwebsites. Netlify ist die Hauptplattform: Hosting, Login, serverseitige API-Checks, JSON-Daten, Assets, Forms und Publishing laufen ueber Netlify-Funktionen und Netlify-Produkte.

## Stack

- React + Vite + Tailwind CSS
- Netlify Hosting
- Netlify Functions + Blobs fuer Login, Register, Sessions und Profildaten
- Netlify Functions als alleiniger Gatekeeper fuer Projekte, Uploads, KI-Aufrufe, Plan-Checks und Publishing
- Netlify Blobs fuer Profile, Website-JSON und Bilddateien
- Netlify Forms fuer Kontaktformulare
- Netlify Deploys per Build Hook vorbereitet
- OpenAI API fuer Struktur, Texte, SEO und Designvorschlaege

## Security-Modell

Der Editor darf im Browser laufen, aber keine sicherheitsrelevante Entscheidung wird im Frontend getroffen.

- Session-Tokens werden in HttpOnly-Cookies gehalten und serverseitig in Blobs validiert.
- Schreibende Function-Routen pruefen einen CSRF-Token (`dexhost_csrf` + `X-DexHost-CSRF`).
- Jede geschuetzte Route prueft die Session serverseitig.
- Projekte werden mit `user_id` in Netlify Blobs gespeichert.
- Lesen, Speichern, Loeschen, Asset-Upload und Asset-Liste pruefen den Website-Besitz in der Function.
- Plaene und Rollen kommen aus serverseitigen Profilen.
- E-Mail, Plan, Account-Status und Stripe-/Billing-Felder werden nicht durch Frontend-Payloads geaendert.
- Publishing und Custom-Domain-Vorbereitung sind nur fuer `basic`, `business`, `pro` und `admin` erlaubt.
- Bilder werden nur ueber `POST /api/websites/:id/assets` hochgeladen und serverseitig auf Typ/Groesse validiert.

## Daten in Netlify Blobs

- `profiles/:user_id.json`
- Profil-Assets wie Logo und Profilbild im Store `dexhost-assets`
- `users/:user_id/websites/index.json`
- `websites/:website_id.json`
- `assets/index/:website_id.json`
- `assets/:asset_id.json`
- Binary assets im Store `dexhost-assets`
- Veroeffentlichte Snapshots unter `published/:slug.json`

## API-Routen

Geschuetzte UI-Routen:

- `/dashboard/profile`
- `/account`
- `/launch-hilfe`

Public:

- `GET /api/health`
- `GET /api/upload/config`
- `GET /api/integrations/studio`
- `GET /api/public/websites/:slug`
- `GET /api/assets/:assetId` nur public, wenn das Asset durch Publishing freigegeben wurde

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/account`
- `PUT /api/account`
- `GET /api/profile`
- `PUT /api/profile`
- `POST /api/profile/logo`
- `POST /api/profile/avatar`

Protected Studio:

- `GET /api/websites`
- `POST /api/websites`
- `GET /api/websites/:id`
- `PUT /api/websites/:id`
- `DELETE /api/websites/:id`
- `POST /api/websites/:id/assets`
- `GET /api/websites/:id/assets`
- `POST /api/websites/:id/publish`
- `POST /api/websites/:id/domain`
- `POST /api/websites/ai-studio-plan`
- `POST /api/websites/asset-plan`
- `POST /api/billing/paypal/subscription/activate`
- `POST /api/billing/paypal/setup/create`
- `POST /api/billing/paypal/setup/capture`

## Environment

Kopiere `.env.example` nach `.env` fuer lokale Werte. In Netlify sollten mindestens OpenAI optional und fuer Publishing ein Build Hook gesetzt werden:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
NETLIFY_SITE_ID=
NETLIFY_API_TOKEN=
NETLIFY_BUILD_HOOK_URL=
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_BASIC_SUBSCRIPTION_PLAN_ID=P-75N62518ED122145SNILXN2Y
PAYPAL_BUSINESS_SUBSCRIPTION_PLAN_ID=P-78459601WB512822ENILXPCQ
PAYPAL_PRO_SUBSCRIPTION_PLAN_ID=P-37230392XM0019717NILXOXA
VITE_PAYPAL_HOSTED_CLIENT_ID=BAAAh0BwexhEqCc-x-aB7nAugoGa-LHMtpTifBYJ9xVvUftpbeU2w2St-LTa1AfgwOuoRX7pQCtgzunnMo
VITE_PAYPAL_LAUNCH_HELP_HOSTED_BUTTON_ID=METBAPJM5CLFS
VITE_PAYPAL_SUBSCRIPTION_CLIENT_ID=AYpTUnN15JcpJNpAl_EoTNHh87Ad2tJXqeikN2oWVRLgozIw9NFewlNCnqtj--eC24WFQAnMU7eXm-VM
VITE_PAYPAL_BASIC_SUBSCRIPTION_PLAN_ID=P-75N62518ED122145SNILXN2Y
VITE_PAYPAL_BUSINESS_SUBSCRIPTION_PLAN_ID=P-78459601WB512822ENILXPCQ
VITE_PAYPAL_PRO_SUBSCRIPTION_PLAN_ID=P-37230392XM0019717NILXOXA
DEXHOST_SUBDOMAIN_SUFFIX=dexhost.de
IMAGE_UPLOAD_MAX_BYTES=5242880
```

Netlify Identity ist nicht erforderlich. Auth, Sessions, Profile und Rollen laufen ueber Netlify Functions und Netlify Blobs. Wenn Blobs in Netlify nicht automatisch konfiguriert sind, setze `NETLIFY_SITE_ID` auf die Project ID und `NETLIFY_API_TOKEN` auf einen Netlify Personal Access Token. Lokal nutzt die Function einen `.netlify-state` Dev-Fallback.

PayPal Abos werden ueber PayPal Subscription Buttons gestartet. Fuer Tests `PAYPAL_ENV=sandbox` nutzen, fuer echte Zahlungen `PAYPAL_ENV=live` setzen und die Live-Credentials in Netlify hinterlegen. Nach erfolgreicher Freigabe prueft DexHost die Abo-ID serverseitig und leitet auf `/billing/success` weiter. Launch-Hilfe, Setup-Service und Premium-Setup laufen als separate Einmalzahlungen ueber `/launch-hilfe`; diese Zahlungen werden erst nach serverseitigem PayPal Capture als gebucht gespeichert. Optional kann ein PayPal Hosted Button fuer die Launch-Hilfe angezeigt werden, die sichere Account-Zuordnung bleibt aber die Netlify-Function-Route. Fuer Kuendigungen, fehlgeschlagene Folgezahlungen und Statuswechsel ist spaeter ein PayPal Webhook massgeblich.

## Entwicklung

```bash
npm run dev
npm run build
```

Netlify leitet `/api/*` auf `netlify/functions/dexhost-api.cjs`. Fuer lokale API-Flows ist `netlify dev` sinnvoll, weil es Functions und Blobs naeher an der Produktionsumgebung emuliert.
