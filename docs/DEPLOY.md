# Deploy a producción

Dominios: app `https://skijornada.johelpastorino.com` · API `https://api.skijornada.johelpastorino.com`.

## 1. Backend — Railway

Proyecto `ski-jornada`, servicio `api`, Root Directory `/backend`. La configuración de build/arranque vive en `backend/railway.json`:

- Build: `npm install && npx prisma generate`
- Arranque: `npx prisma migrate deploy && node prisma/bootstrap.js && node index.js` (las migraciones corren **al arrancar** porque el pre-deploy no ve el volumen)
- Healthcheck: `/api/server-time`

**Volumen:** `ski-data` montado en `/data` (base `prod.db` y subidas).

**Variables:**

| Variable | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | cadena aleatoria larga (`openssl rand -hex 32`) |
| `DATABASE_URL` | `file:/data/prod.db` |
| `UPLOAD_DIR` | `/data/uploads` |
| `FRONTEND_URL` | `https://skijornada.johelpastorino.com` (varias URLs separadas por coma) |
| `ADMIN_EMAIL` / `ADMIN_NOMBRE` / `ADMIN_APELLIDOS` | primer administrador (lo crea `bootstrap.js` si no existe) |
| `RESEND_API_KEY` | API key de Resend |
| `EMAIL_FROM` | `Ski Jornada <no-reply@skijornada.johelpastorino.com>` |
| `WHATSAPP_ENABLED` | opcional; `false` oculta el módulo (por defecto disponible y apagado hasta «Generar QR») |

`PORT` lo inyecta Railway. **No** definir `PASSWORD_LOGIN` en producción.

**Dominio personalizado:** en Cloudflare DNS crear
- `CNAME  api.skijornada` → el valor que muestre Railway (`*.up.railway.app`)
- `TXT  _railway-verify.api.skijornada` → el valor `railway-verify=…` que muestre Railway

(Railway > servicio `api` > Settings > Networking). Si el DNS está en Cloudflare, dejar el CNAME en “solo DNS” (nube gris) mientras Railway emite el certificado.

## 2. Frontend — Cloudflare Pages

- Repo `johelp/ski-jornada`, rama `main`
- Root directory: `frontend`
- Build command: `npm run build` · Output: `dist`
- Variable de build: `VITE_API_URL=https://api.skijornada.johelpastorino.com`
- Dominio personalizado: `skijornada.johelpastorino.com`
- `frontend/public/_headers` evita cachear `sw.js`.

Importante: `VITE_API_URL` se incrusta en el build; si cambia, hay que re-desplegar.

## 3. Correo — Resend

1. resend.com/domains → añadir `skijornada.johelpastorino.com`.
2. Copiar los registros DNS (SPF, DKIM, y MX de retorno si los pide) a Cloudflare y esperar “Verified”.
3. Crear una API key y cargarla en Railway como `RESEND_API_KEY`.
4. Probar: pedir un enlace de acceso desde el login con un email real.

Sin dominio verificado, Resend solo envía al correo de la cuenta propietaria.

## Endurecimiento incluido (ver `OPERACION.md`)
- La API **no arranca** con `JWT_SECRET` < 32 caracteres, `FRONTEND_URL` sin https o `PASSWORD_LOGIN=true`.
- Healthcheck de Railway: `/api/salud` (comprueba la base de datos).
- Copia diaria automática en `/data/backups` (`BACKUP_DIARIO`, `BACKUP_CONSERVAR`).
- Frontend: `frontend/public/_headers` añade cabeceras de seguridad y una CSP en modo solo-informe; el build exige `VITE_API_URL`.

## 4. Verificación post-deploy

```bash
curl https://api.skijornada.johelpastorino.com/api/server-time   # debe devolver JSON
```
- Pedir enlace desde la app → llega el correo → entra → “Instalar app” disponible (HTTPS + manifest + SW).
- Admin: Usuarios → crear un profesor → recibe invitación.
- Admin: Clases → Disciplinas y primas → cargar importes; en Usuarios → Editar → tarifa por hora.

## 5. Operación

- **Logs:** Railway > `api` > Deployments. Errores de arranque típicos: falta `JWT_SECRET` (el proceso aborta a propósito), volumen sin montar (`unable to open database file`).
- **Backups:** la base es un archivo en el volumen. Hacer copias periódicas (Railway permite backups del volumen o un cron que copie `prod.db`). **Pendiente de automatizar.**
- **Rollback:** Railway > Deployments > Rollback al deploy anterior. Las migraciones nuevas no se revierten solas: diseñarlas siempre como aditivas.
- **Cambiar de rama de deploy:** Railway > `api` > Settings > Source > Branch.

## Variables en desarrollo

`backend/.env.example` documenta todas. Para entrar sin correo: `PASSWORD_LOGIN=true` y usuarios del seed, o copiar el enlace que imprime la consola del backend.
