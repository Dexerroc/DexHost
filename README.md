# DexHost AI Website Studio

Professioneller KI-Block-Builder fuer Firmenwebsites. Netlify ist die Hauptplattform: Hosting, Login, serverseitige API-Checks, JSON-Daten, Assets, Forms und Publishing laufen ueber Netlify-Funktionen und Netlify-Produkte.

## Stack

- React + Vite + Tailwind CSS
- Netlify Hosting
- Netlify Identity fuer Login, Register, Passwort-Reset und E-Mail-Verifizierung
- Netlify Functions als alleiniger Gatekeeper fuer Projekte, Uploads, KI-Aufrufe, Plan-Checks und Publishing
- Netlify Blobs fuer Profile, Website-JSON und Bilddateien
- Netlify Forms fuer Kontaktformulare
- Netlify Deploys per Build Hook vorbereitet
- OpenAI API fuer Struktur, Texte, SEO und Designvorschlaege

## Security-Modell

Der Editor darf im Browser laufen, aber keine sicherheitsrelevante Entscheidung wird im Frontend getroffen.

- Identity-JWTs werden in HttpOnly-Cookies ueber Functions gehalten.
- Schreibende Function-Routen pruefen einen CSRF-Token (`dexhost_csrf` + `X-DexHost-CSRF`).
- Jede geschuetzte Route ruft Netlify Identity serverseitig ab.
- Projekte werden mit `user_id` in Netlify Blobs gespeichert.
- Lesen, Speichern, Loeschen, Asset-Upload und Asset-Liste pruefen den Website-Besitz in der Function.
- Plaene und Rollen kommen aus serverseitigen Profilen oder verifizierten Identity-App-Metadaten.
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

## Environment

Kopiere `.env.example` nach `.env` fuer lokale Werte. In Netlify sollten mindestens OpenAI optional und fuer Publishing ein Build Hook gesetzt werden:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
NETLIFY_BUILD_HOOK_URL=
DEXHOST_SUBDOMAIN_SUFFIX=dexhost.de
IMAGE_UPLOAD_MAX_BYTES=5242880
```

Netlify Identity muss im Netlify-Projekt aktiviert sein. Netlify Blobs werden in Functions ueber `@netlify/blobs` verwendet; lokal nutzt die Function einen `.netlify-state` Dev-Fallback.

## Entwicklung

```bash
npm run dev
npm run build
```

Netlify leitet `/api/*` auf `netlify/functions/dexhost-api.cjs`. Fuer lokale Identity-Flows ist `netlify dev` sinnvoll, weil es Identity/Functions naeher an der Produktionsumgebung emuliert.
