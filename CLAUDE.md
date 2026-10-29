# Ski Jornada — guía para continuar el desarrollo

App web instalable (PWA) para una escuela de esquí (Sierra Nevada, Granada): fichaje de jornada, carga de clases con primas, informes económicos y gestión de profesores. Idioma de la UI y los mensajes: **español**.

Documentación: `README.md` (visión), `docs/ARQUITECTURA.md`, `docs/API.md`, `docs/DEPLOY.md`, `docs/ROADMAP.md`. Léelas antes de cambios grandes.

## Stack y estructura

- `backend/` — Node 20, Express, Prisma 5, SQLite, JWT. **Todo en `backend/index.js`** (CommonJS, `require`). Esquema en `backend/prisma/schema.prisma`.
- `frontend/` — React 19 + Vite. **`src/App.jsx` es un monolito**; las vistas nuevas son componentes aparte (`VistaMisClases.jsx`, `VistaAdminClases.jsx`). PDFs con jsPDF (`pdfClases.js`, `pdfRegistro.js`).
- Hosting: Railway (API + volumen `/data`), Cloudflare Pages (frontend), Resend (correo). Ver `docs/DEPLOY.md`.

## Comandos

```bash
# Backend (desde backend/)
npm install
npx prisma migrate dev --name <cambio>   # tras editar schema.prisma
npx prisma migrate deploy                # aplicar migraciones existentes
node prisma/seed.js                      # demo (usuarios ski123, zonas, catálogo)
node prisma/bootstrap.js                 # producción: catálogo base + admin desde ADMIN_EMAIL
node index.js                            # http://localhost:3000

# Frontend (desde frontend/)
npm install && npm run dev               # http://localhost:5173
npm run build                            # verificación de compilación
```

Sin SMTP/Resend, el enlace mágico se imprime en la consola del backend (solo si `NODE_ENV !== 'production'`). `PASSWORD_LOGIN=true` habilita el login con contraseña de desarrollo.

## Convenciones

- Responder y escribir textos de UI en español neutro/rioplatense coherente con lo existente; código e identificadores como están (mezcla español/inglés ya establecida: `profesor`, `clase`, `auth`).
- Endpoints nuevos: middleware `auth` y `adminOnly` donde corresponda; filtrar siempre por `req.user.userId` para datos del propio profesor. Errores `res.status(n).json({ error })`.
- Fechas de clases: string `YYYY-MM-DD`; meses `AAAA-MM`. No usar `Date` para filtrar meses de clases (`startsWith`).
- Cambios de esquema: siempre migración **aditiva** (producción corre `migrate deploy` al arrancar).
- No versionar `.env`, `*.db`, `uploads/`, `node_modules/` (ver `.gitignore`).
- La vista sin sesión es `Landing.jsx` (estilos con prefijo `.lp-` y resets de los estilos globales de `App.css`/`index.css`, que filtran sobre `header`/`nav`/`main`/`h1`). Diseño: acento naranja `#f97316` sobre texto oscuro, azul `#0f4c81`, SVG en vez de emojis, objetivos táctiles ≥48 px.
- Vistas nuevas del frontend: componentes en `src/` que reciben `api`, `h`, `toast$`, `config`; no seguir engordando `App.jsx`.
- Sin tests todavía: al tocar cálculos de importes o auth, verificar con `curl` o añadir tests.

## Dominio (lo no obvio)

- **Disciplina** = `TipoClase`; **prima** = `PrimaClase` (`importe` + `modo` `POR_HORA`|`POR_CLASE`). Una clase tiene 1 disciplina y 0..N primas.
- Importe por clase = `horas × profesor.tarifaHora` (si existe) + Σ primas. Si no hay tarifa ni importes, `importe*` es `null` y la UI no muestra la parte económica.
- **Confirmar mes** (`ConfirmacionClases`) bloquea edición y **congela** `tarifaHora` y `primasJson`. Un mes confirmado se calcula con lo congelado; el admin puede **reabrir** (borra la confirmación).
- Magic link: se guarda solo `sha256(token)`; vence a los 15 min; se consume con `deleteMany` atómico. JWT de 90 días, renovado en cada apertura (`/api/auth/renovar`).
- Los profesores se dan de baja de forma lógica (`activo=false`); `/api/auth/*` rechaza inactivos.
- Rol `ADMIN` puede usar “modo empleado” en la UI (ve las vistas de profesor). IDs de vista: `misclases` (profesor) vs `clases` (admin).
- TOTP de fichaje propio (SHA-256, 30 s, ±1 ventana) con hora sincronizada del servidor (`useRef`, no estado).

- **Revisión de administración:** `RevisionMes` (estado + nota por profesor y mes) y `ClaseDada.marca/notaAdmin`. `CORRECCION` reabre el mes; al reconfirmar la revisión vuelve a `PENDIENTE`. Ver `docs/ARQUITECTURA.md`.
- **Archivos:** `/uploads/...` exige sesión (no hay `express.static`); el frontend usa `abrirArchivo()` con blob. Registrar rutas que usen `auth` **después** de su definición (si no, falla al arrancar).
- **Multi-despliegue:** una instancia por cliente (`docs/MULTI-DESPLIEGUE.md`, plantillas en `deploy/`). Marca por `VITE_APP_NAME`, `VITE_ESCUELA_LUGAR`, `VITE_COLOR_PRIMARIO`.
- **Integraciones:** `/api/v1/*` con API keys (`apiAuth`), webhooks (`emitirEvento`), planning. Ver `docs/INTEGRACIONES.md`. **RGPD:** `docs/RGPD.md`; `DOCUMENTOS_HABILITADOS=false` apaga el módulo de documentos.
- **Comparativa con reservas:** `docs/COMPARATIVA.md` (`/api/admin/comparativa`, alias de nombres, lector del CSV en `frontend/src/comparativa.js`). No versionar CSV con datos de personas.
- **Pruebas:** `node backend/scripts/smoke.js` (49 comprobaciones) antes de tocar auth, importes, revisión o documentos.

## Trampas conocidas

- **Railway pre-deploy no ve el volumen** → migraciones y `bootstrap.js` van en `startCommand` (`backend/railway.json`). `railway.json` manda sobre la configuración del panel.
- **`VITE_API_URL` se incrusta en el build** de Pages; cambiarla exige re-desplegar.
- **iOS:** la PWA instalada no comparte almacenamiento con Safari; el enlace mágico abre Safari. Pendiente: código de 6 dígitos (ver roadmap). Web NFC solo en Chrome Android.
- **Resend** solo envía a terceros con el dominio verificado.
- **No** definir `PASSWORD_LOGIN` en producción. El seed demo (`seed.js`) **no** debe correr en producción.
- SQLite en un volumen ⇒ una sola réplica.
- Prisma en Windows: `EPERM` al regenerar si el servidor está corriendo; parar el servidor primero.
- En desarrollo el service worker cachea y puede dar errores de “fetching the script”; borrar el SW desde DevTools.
- `whatsapp.js` (Baileys) es opcional y **no** está en `package.json`; instalar `@whiskeysockets/baileys` solo si se activa.

## Estado y siguientes pasos

Ver `docs/ROADMAP.md`. Prioridades: revisión UX/UI, código de 6 dígitos para iOS, verificar correos en producción, backups, partir `App.jsx`/`index.js`, tests de importes y auth, e importación del planning para cotejo automático.
