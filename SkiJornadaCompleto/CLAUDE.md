# Ski Jornada — CLAUDE.md

## Project Overview
Ski Jornada is a time-tracking (fichaje) web app for ski school employees at Sierra Nevada, Granada.
Professors clock in/out using TOTP QR codes, GPS validation, or NFC tags. Admins manage staff,
approve time-off requests, generate official HR reports, and maintain a digital employee dossier (legajo).

## Stack
| Layer     | Tech |
|-----------|------|
| Backend   | Node.js, Express, Prisma ORM, SQLite, JWT, bcryptjs, nodemailer |
| Frontend  | React (Vite), jsPDF + jspdf-autotable, jsQR, qrcode.react |
| Auth      | JWT bearer tokens, bcrypt password hashing |
| Email     | nodemailer (SMTP / Gmail app password) |
| Files     | multer, stored in `backend/uploads/{firmas,documentos}/` |
| PWA       | manifest.json + service worker (sw.js), `beforeinstallprompt` install flow |
| WhatsApp  | @whiskeysockets/baileys (optional, `WHATSAPP_ENABLED=true`) |

## Directory Structure
```
SkiJornadaCompleto/
├── backend/
│   ├── index.js            — complete REST API (all endpoints)
│   ├── whatsapp.js         — optional Baileys WhatsApp module
│   ├── whatsapp-session/   — Baileys session files (gitignore this)
│   ├── prisma/
│   │   ├── schema.prisma   — database schema
│   │   ├── seed.js         — demo data
│   │   └── dev.db          — SQLite database (auto-created)
│   ├── uploads/
│   │   ├── firmas/         — signed PDFs uploaded by professors
│   │   └── documentos/     — nóminas/contracts uploaded by admin
│   └── .env                — environment variables
└── frontend/
    ├── index.html          — PWA meta tags, manifest link
    ├── public/
    │   ├── manifest.json   — PWA manifest (icons, theme color)
    │   ├── sw.js           — service worker (cache + push notifications)
    │   ├── favicon.svg
    │   ├── icon-192.png    — PWA icon (must exist)
    │   └── icon-512.png    — PWA icon (must exist)
    └── src/
        ├── App.jsx         — complete SPA (single file, ~1600 lines)
        ├── App.css         — styles: mobile-first + desktop sidebar at ≥1024px
        ├── main.jsx        — React root + service worker registration
        └── pdfRegistro.js  — PDF generation (jsPDF)
```

## Environment Variables (`backend/.env`)
```
PORT=3000
JWT_SECRET=<strong-random-string-change-in-production>
DATABASE_URL=file:./prisma/dev.db

# Email — use Gmail app password (not account password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tucorreo@gmail.com
SMTP_PASS=tu-contrasena-de-aplicacion
EMAIL_FROM=Ski Jornada <tucorreo@gmail.com>

# Frontend URL (CORS + email links)
FRONTEND_URL=http://localhost:5173

# WhatsApp (optional — leave unset to disable)
WHATSAPP_ENABLED=true
```

## Development Setup
```bash
# Backend
cd backend
npm install
# Optional WhatsApp:
npm install @whiskeysockets/baileys

npx prisma migrate dev --name init
node prisma/seed.js
node index.js         # → http://localhost:3000

# Frontend (new terminal)
cd frontend
npm install
npm run dev           # → http://localhost:5173
```

## Demo Accounts (password: `ski123`)
| Role     | Email                        | Name           |
|----------|------------------------------|----------------|
| Admin    | admin@escuela.com            | Ana Rodríguez  |
| Profesor | profesor@escuela.com         | Carlos Martínez |
| Profesor | laura.garcia@escuela.com     | Laura García   |
| Profesor | miguel.torres@escuela.com    | Miguel Torres  |
| Profesor | sofia.perez@escuela.com      | Sofía Pérez    |

## Production Deployment

### Railway (Backend)
1. Push code to GitHub
2. Railway → New project → Deploy from repo → select `backend/` as root
3. Add all environment variables (use strong JWT_SECRET, real SMTP creds)
4. `DATABASE_URL`: `file:./prisma/prod.db` + attach persistent volume at `/app/prisma`
5. Build command: `npm install && npx prisma migrate deploy && node prisma/seed.js`
6. Start command: `node index.js`

### Vercel (Frontend)
1. Vercel → New project → import from GitHub → select `frontend/` as root
2. Framework preset: **Vite**
3. Add env var: `VITE_API_URL=https://your-app.railway.app`
4. Frontend reads `import.meta.env.VITE_API_URL || 'http://localhost:3000'`

## API Endpoints

### Auth
- `POST /api/auth/login`          — `{ email, password }` → `{ token, user }` (includes telefono, horaRecordatorio)
- `GET  /api/auth/me`             — own profile (no password)
- `PUT  /api/auth/me`             — update nombre, apellidos, telefono, horaRecordatorio
- `PUT  /api/auth/cambiar-password` — `{ passwordActual, passwordNueva }`

### Server Time
- `GET  /api/server-time`         — `{ timestamp, iso }` — used by frontend to compute clock offset

### Zones
- `GET  /api/zonas`               — active zones (no secret — for employees)
- `GET  /api/admin/zonas`         — all zones with secrets (admin only — for NFC writing)
- `POST /api/admin/zonas`         — create zone
- `PUT  /api/admin/zonas/:id`     — update zone
- `POST /api/admin/zonas/:id/regenerar-secreto` — new TOTP secret
- `DELETE /api/admin/zonas/:id`   — delete zone

### Fichaje
- `POST /api/fichaje/fichar`      — `{ qrCodeId, totpToken?, lat?, lng? }`
- `GET  /api/fichaje/historial`   — own records grouped by day (each record includes `timestamp` ISO string)

### Time-off
- `POST /api/libres/solicitar`    — `{ fechaInicio, fechaFin, motivo, comentario? }`
- `GET  /api/libres/mis-solicitudes`
- `GET  /api/admin/solicitudes`
- `POST /api/admin/solicitudes/:id/responder` — `{ aprobado, observacion? }`
- `GET  /api/admin/informe-libres`

### Staff
- `GET  /api/admin/profesores`    — list (includes telefono, horaRecordatorio)
- `POST /api/admin/profesores`    — create + send welcome email
- `PUT  /api/admin/profesores/:id`  — edit (accepts telefono, horaRecordatorio, activo)
- `DELETE /api/admin/profesores/:id` — soft delete (sets activo=false)

### Reports
- `GET  /api/informe/:mes/:anio`  — monthly report (admin: add `?profesorId=`)

### Legajo Digital
- `POST /api/admin/documentos`    — upload doc for professor (multipart: `pdf` + `{ profesorId, tipo, nombre, mes? }`)
- `GET  /api/documentos/mis-documentos`
- `POST /api/documentos/:id/firmar` — professor uploads signed version (multipart: `pdf`)
- `GET  /api/admin/documentos`

### WhatsApp (Baileys — only if WHATSAPP_ENABLED=true)
- `GET  /api/whatsapp/status`     — `{ enabled, connected, hasQR }`
- `GET  /api/whatsapp/qr`         — shows QR code page to scan with phone
- `POST /api/whatsapp/test`       — `{ telefono, mensaje }` — send test message

## Database Schema (key fields)

### Profesor model additions (migration required)
```prisma
model Profesor {
  id               String   @id @default(uuid())
  email            String   @unique
  nombre           String
  apellidos        String
  password         String   @default("")
  tipoJornada      String   @default("COMPLETA")
  horasContrato    Int      @default(35)
  role             String   @default("PROFESOR")
  activo           Boolean  @default(true)
  telefono         String?                        // WhatsApp number
  horaRecordatorio String   @default("17:00")    // Daily reminder time
  createdAt        DateTime @default(now())
  ...relations
}
```

Run after schema changes:
```bash
npx prisma migrate dev --name add-telefono-hora-recordatorio
# If EPERM error on Windows (DLL locked), stop the server first, then re-run
```

## QR Code Format
```
SKIJORNADA|{zonaId}|{secret}|{validationMode}
```
Example: `SKIJORNADA|zona-entrada|A3F2E1D4...|TOTP_GPS`

The QR content is also written to NFC tags (admin only, via Web NFC API).

## TOTP Implementation
Custom SHA-256 based (no external library):
```js
// Backend (Node)
crypto.createHash('sha256').update(`${secret}:${counter}`).digest('hex').slice(0,6).toUpperCase()

// Frontend (browser, Web Crypto API) — uses server-synced time
const counter = Math.floor((Date.now() + serverOffset) / 1000 / period);
crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}:${counter}`))
```
Window: ±1 period (90s effective validity). Server offset eliminates device clock drift.

## Server Time Synchronization
Frontend syncs with server every 5 minutes:
```js
const t1 = Date.now();
const r  = await api.get('/api/server-time');
const offset = r.data.timestamp - t1 - (Date.now() - t1) / 2;  // round-trip compensation
serverTimeOffsetRef.current = offset;  // useRef to avoid stale closures in intervals
```
`serverTimeOffsetRef` (not state) is used in setInterval callbacks for live timers.

## PWA Setup
- `frontend/public/manifest.json` — standalone, theme `#0f4c81`, icons 192/512px
- `frontend/public/sw.js` — network-first fetch, caches static assets, handles push notifications
- `frontend/src/main.jsx` — registers `/sw.js` on load
- `App.jsx` — captures `beforeinstallprompt`, shows `📱 Añadir a pantalla de inicio` button in header, login, and profile pages
- Icons `icon-192.png` and `icon-512.png` must exist in `frontend/public/`

## NFC Support
- **Reading** (all users): `NDEFReader.scan()` in Fichar view — reads tag and auto-processes like QR scan
- **Writing** (admin only): admin clicks "📡 Grabar NFC" on a zone → `NDEFReader.write()` encodes `SKIJORNADA|...` format
- Requires Chrome for Android; `NDEFReader` not available on iOS or desktop browsers
- `nfcDisponible` flag checks `'NDEFReader' in window` before showing NFC buttons

## Browser Notifications
- Permission requested at login if not yet set
- Configurable per user: `horaRecordatorio` field (default `"17:00"`)
- A `setTimeout` fires at the configured time; if still clocked in, shows a `Notification` with elapsed time
- Static notification (elapsed time at the moment it fires — not a live counter, browser API limitation)
- Profile page shows notification permission status + button to activate

## WhatsApp Baileys Integration
Optional module in `backend/whatsapp.js`. Conditionally loaded:
```js
if (process.env.WHATSAPP_ENABLED === 'true') {
  whatsapp = require('./whatsapp');
  whatsapp.init();
}
```
Auto-reminder scheduler: every 60s, checks all employees' `horaRecordatorio`; if their last record today is ENTRADA and the time matches, sends a WhatsApp reminder.

Session stored in `backend/whatsapp-session/` (persist this directory — it stores auth credentials).
First run: scan QR at `GET /api/whatsapp/qr`.

## Canvas Signature
`FirmaCanvas` component in `App.jsx` — HTML5 canvas with mouse/touch drawing.
- Saves as PNG data URL → uploads as a file to `/api/documentos/:id/firmar`
- **Legally non-binding** — shown as interim step before integrating ViDeSigner or Autofirma
- UI note: "esta firma no tiene validez legal — es un paso intermedio"

## UI Layout
- **Mobile** (< 1024px): top header → horizontal nav tabs → main content
  - Nav icons only on < 768px
- **Desktop** (≥ 1024px): full-width sticky header → 220px left sidebar nav → main content area
  - Active nav item: left blue border indicator, no bottom underline
  - Main content uses full available width (no max-width cap)

## Feature Roadmap

### ✅ Complete
- TOTP QR check-in (30s rotating token, photo-proof)
- GPS radius validation per zone
- NFC reading for clock-in (Chrome Android)
- NFC writing for admin zone programming (Chrome Android)
- Server-synchronized time (offset compensated, no device clock drift)
- Live shift timer in header + fichaje screen + dashboard
- Configurable validation modes per zone (TOTP | GPS | TOTP_GPS | NONE)
- Admin: zone management + QR printing
- Admin: professor management with inline editing + soft delete
- Admin: time-off request approval workflow
- Admin: absence reports per professor
- Official HR PDF (RD 8/2019 + Art. 34.9 ET compliant)
- Persistent SQLite via Prisma
- bcrypt passwords, helmet, rate limiting
- Employee self-service: view + edit own profile, change password
- Browser push notifications with configurable reminder time
- PWA: installable, offline-capable, manifest + service worker
- Digital document legajo (nóminas, contracts, certificates)
- Canvas signature (non-legal, interim before certified e-signature)
- WhatsApp Baileys reminders (optional, WHATSAPP_ENABLED=true)
- Desktop sidebar layout (CSS Grid, ≥1024px)

### 🚧 In Progress / Known Issues
- `icon-192.png` and `icon-512.png` need to be created in `frontend/public/` for PWA to work

### 🗺 Roadmap
| Feature | Notes |
|---------|-------|
| **Legal e-signature** | Autofirma (FNMT), ViDeSigner, or DocuSign API |
| **Multi-school** | Separate admin accounts per school |
| **Audit log** | Immutable event log for labor inspection |
| **Biometric clock-in** | Face recognition via device camera |
| **Payroll integration** | Export to A3nom, Sage, Nominasol |
| **iOS push notifications** | Requires Safari Web Push (iOS 16.4+) + VAPID keys |

## Security Notes
- Passwords: bcrypt cost 10
- JWT: 7-day expiry, signed with JWT_SECRET
- Login rate limit: 20 attempts / 15 min per IP
- Helmet.js: security headers on all responses
- CORS: restricted to FRONTEND_URL
- File uploads: PDF-only, 20MB max, stored with random filenames
- TOTP: 30s window, ±1 drift — screenshots expire before they can be forwarded
- NFC write: requires admin role; zone secrets only exposed to admin via `/api/admin/zonas`

## Electronic Signature Options (for legal validity)
1. **Canvas (current)**: draw signature on screen → save as PNG — **not legally binding in Spain**
2. **Simple PDF upload (current)**: professor downloads → signs by hand (scan) → uploads back
3. **Autofirma (FNMT)**: Spain's official desktop signing tool. Free, legally binding, requires install.
4. **ViDeSigner**: Spanish SaaS with API. Legally binding, paid (~€0.50/signature).
5. **DocuSign / Adobe Sign**: International standard, API, paid.

For MVP: canvas + upload is sufficient. For formal legal compliance: integrate ViDeSigner or Autofirma.

## Known Gotchas
- **Prisma EPERM on Windows**: After `prisma migrate dev`, if server is running the DLL is locked and client regeneration fails. Stop the server first, then run the migration.
- **NFC on iOS**: Web NFC API not available. NFC buttons are hidden (`'NDEFReader' in window` check).
- **PWA icons**: `icon-192.png` and `icon-512.png` must physically exist — otherwise the PWA won't install. Generate them from the SVG favicon or use a PWA icon generator.
- **WhatsApp phone numbers**: must include country code, e.g., `+34612345678`. Stored in `telefono` field.
- **Server time offset**: stored in `useRef` (not state) so setInterval callbacks always read the latest value without causing re-renders.
