# Arquitectura

## Visión general

```
Navegador / PWA ──HTTPS──▶ Cloudflare Pages (frontend estático)
        │
        └──HTTPS (axios, Bearer JWT)──▶ Railway: Express + Prisma ──▶ SQLite en volumen /data
                                                   │
                                                   └──▶ Resend (correos)
```

- El frontend es una SPA que habla con la API por `VITE_API_URL`.
- El backend es un único proceso Node (`backend/index.js`) con todos los endpoints.
- La base es **SQLite** en un volumen persistente (`/data/prod.db`); los PDFs subidos van a `UPLOAD_DIR` (`/data/uploads`). Un solo servicio con volumen → no se puede escalar a más de una réplica.

## Modelo de datos (Prisma)

| Modelo | Para qué |
|--------|----------|
| `Profesor` | Usuarios (`role`: `PROFESOR` / `ADMIN`). `tarifaHora` (opcional) es el €/h de clase. `activo=false` = baja lógica |
| `ZonaFichaje` | Puntos de fichaje con secreto TOTP, GPS y modo de validación |
| `RegistroJornada` | Entradas/salidas (`tipo` ENTRADA/SALIDA) |
| `SolicitudLibre` | Vacaciones/asuntos propios/enfermedad con aprobación |
| `FirmaRegistro`, `DocumentoLegajo` | Registro mensual firmado y legajo digital |
| `Notificacion` | Avisos in-app (también se usan para “mes confirmado/reabierto”) |
| `ConfigEscuela` | Datos de la escuela (nombre, CIF, color, email de avisos) |
| `TipoClase` | **Disciplinas** configurables por el admin (Esquí, Snowboard…) |
| `PrimaClase` | Primas configurables: `importe` (€) y `modo` `POR_HORA` \| `POR_CLASE` |
| `ClaseDada` | Clase cargada: `fecha` (`YYYY-MM-DD`), `horas`, disciplina, N primas (m-n), notas del profesor y `marca` (`OK`/`REVISAR`) + `notaAdmin` puestas por administración |
| `ConfirmacionClases` | Mes confirmado por el profesor + **tarifas congeladas** (`tarifaHora`, `primasJson`) |
| `RevisionMes` | Revisión de administración sobre el mes de un profesor: `estado` (`APROBADO`, `DISCREPANCIA`, `CORRECCION`, `COMENTARIO`, `PENDIENTE`) y `nota` |
| `AuditoriaLog` | Registro de acciones sensibles de administración (quién, qué, sobre quién, cuándo) |
| `MagicLink` | Tokens de acceso (se guarda solo el hash SHA-256; vencen a los 15 min; un solo uso) |

Las migraciones están en `backend/prisma/migrations/`. Se aplican con `npx prisma migrate deploy` (en producción, al arrancar).

## Flujos clave

### Acceso por enlace mágico
1. `POST /api/auth/magic-link {email}` → responde siempre igual (no revela si el email existe). Si el usuario está activo, crea un token aleatorio (32 bytes), guarda su hash y envía el correo con `FRONTEND_URL/?magic=TOKEN`.
2. El frontend lee `?magic=`, limpia la URL y llama a `POST /api/auth/magic-link/verificar`. El canje borra el token de forma atómica y devuelve un JWT de **90 días**.
3. Al abrir la app, el frontend llama a `POST /api/auth/renovar` (sesión deslizante).
4. El alta de un profesor por el admin envía el mismo enlace como invitación; las contraseñas no se usan (se guarda un hash aleatorio inservible).
5. `POST /api/auth/login` (contraseña) solo existe con `PASSWORD_LOGIN=true` (desarrollo/demo).

> Límite conocido: en iOS la PWA instalada tiene almacenamiento separado de Safari; el enlace se abre en Safari. Ver `ROADMAP.md` (código de 6 dígitos).

### Carga y liquidación de clases
1. El profesor carga clases (`POST /api/clases`). Horas entre 0,25 y 12, múltiplos de 0,25.
2. Mientras el mes **no está confirmado** puede editar/borrar. Al confirmar (`/api/clases/confirmar-mes`) se bloquea, se **congelan tarifas y primas** y se avisa al admin (notificación + correo).
3. El importe se calcula así por clase:
   `horas × tarifaHora` (si el profesor tiene tarifa) `+ Σ primas` donde cada prima suma `importe × horas` (`POR_HORA`) o `importe` (`POR_CLASE`).
4. Un mes sin confirmar usa tarifas **vigentes**; uno confirmado usa las **congeladas**. Cambiar importes después no altera meses cerrados.
5. El admin puede ver el resumen por profesor, el detalle día a día (para cotejar con el sistema de reservas), exportar CSV/PDF y **reabrir** un mes.

### Acceso y roles
- Cada petición pasa por `auth`, que **contrasta el JWT con la base** (usuario activo y rol vigente; caché de 10 s que se invalida al editar): una baja o un cambio de rol surten efecto al instante.
- `Profesor.esPrincipal` marca la cuenta principal (se fija en `bootstrap.js` con `ADMIN_EMAIL`): única que crea administradores y cambia roles. Siempre debe quedar al menos un administrador activo.
- `Profesor.adheridoAt` se rellena al primer acceso con enlace (invitado → activo).
- Pedir un enlace está limitado por email (1/min, 5/h) además de por IP. Ver `ACCESO-Y-ALTAS.md`.

### Revisión de administración
1. El profesor confirma el mes → queda **por revisar** (si ya había una revisión, pasa a `PENDIENTE`).
2. Administración abre el detalle día a día, cota con el planning y puede anotar clases (`OK`/`REVISAR` + nota) y emitir una revisión: `APROBADO`, `DISCREPANCIA`, `CORRECCION` o `COMENTARIO` (la nota es obligatoria salvo al aprobar).
3. `CORRECCION` **reabre el mes** (borra la confirmación) para que el profesor edite y reconfirme.
4. Cada revisión genera una notificación y un correo al profesor; el profesor ve el estado, la nota y las marcas en *Mis Clases*.

### Archivos protegidos
`/uploads/:sub/:file` exige sesión: el administrador accede a todo y el profesor solo a sus documentos y firmas. El frontend los abre con `fetch` autenticado (blob), no con enlaces directos. Los nombres se validan (`^[\w.-]+$`) contra rutas relativas.

### Fichaje
QR con TOTP (30 s, ventana ±1), validación GPS por radio y/o NFC. El tiempo se sincroniza con el servidor (`/api/server-time`) para evitar desfases del reloj del móvil.

## Frontend

- `App.jsx` es un monolito (~2.300 líneas) con estado compartido; las vistas nuevas (`VistaMisClases`, `VistaAdminClases`) son componentes autocontenidos que reciben `api`, `h` (headers), `toast$` y `config`.
- Navegación por estado (`vista`), sin router. Roles: el admin puede alternar a “modo empleado”.
- Sesión en `localStorage` (`token`, `user`).
- PWA: `public/manifest.json`, `public/sw.js` (network-first, no cachea `/api`), botón de instalación con `beforeinstallprompt`.

## Seguridad

- JWT firmado con `JWT_SECRET` (obligatorio: el servidor no arranca sin él).
- Helmet, CORS restringido a `FRONTEND_URL` (admite varias separadas por coma), rate limit en login (20/15 min) y magic link (10/15 min).
- Subidas: solo PDF/PNG/JPG, 20 MB, nombres aleatorios.
- Los importes/tarifas los ve el propio profesor y el admin; ningún otro profesor accede a datos ajenos (los endpoints filtran por `req.user.userId`).
- Los archivos subidos se sirven solo con sesión y comprobando propiedad (ver *Archivos protegidos*).

## Decisiones

- **SQLite + volumen** por simplicidad del MVP. Si hay más de ~50 usuarios concurrentes o se necesita alta disponibilidad, migrar a Postgres (Prisma lo facilita).
- **Migraciones en el arranque** (`railway.json`): el pre-deploy de Railway no ve el volumen.
- **Tarifas congeladas al confirmar** para que los informes económicos sean reproducibles.
