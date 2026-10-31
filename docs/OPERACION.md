# Operación en producción

Manual para quien mantiene una instancia. Complementa `DEPLOY.md` (montaje) y `RGPD.md` (datos personales).

## Componentes

| Pieza | Dónde | Notas |
|-------|-------|-------|
| API + base SQLite + archivos | Railway (`ski-jornada` / `api`), volumen `/data` | Una sola réplica (SQLite). Despliega desde `main` |
| Frontend (PWA) | Cloudflare Pages (`ski-jornada`) | Despliega desde `main`. `VITE_API_URL` se incrusta al compilar |
| Correo | Resend (dominio `updates.johelpastorino.com`) | Enlaces de acceso e invitaciones |
| DNS | Cloudflare (zona `johelpastorino.com`) | `api.skijornada` (solo DNS) y `skijornada` (proxy) |

## Salud y monitorización

- `GET /api/salud` → `{ ok, version, uptimeSeg }` y comprueba la base de datos (503 si falla). Railway lo usa como *healthcheck* (`backend/railway.json`).
- **Monitor externo (recomendado, gratis):** UptimeRobot / Better Stack / Cloudflare Health Checks apuntando a `https://api.skijornada.johelpastorino.com/api/salud` cada 5 min, con aviso por correo. Un segundo monitor a la web (`https://skijornada.johelpastorino.com`).
- **Logs:** Railway → servicio `api` → *Logs*. Mensajes útiles: `✅ Administrador listo` (arranque), `💾 Copia de seguridad creada`, `unhandledRejection`, `Resend 4xx` (fallos de correo).
- **Correo:** panel de Resend → *Logs* (entregas, rebotes, quejas).

## Despliegues

- Cada *merge* a `main` despliega API y frontend. La API ejecuta al arrancar `prisma migrate deploy` y `bootstrap.js`.
- **CI** (`.github/workflows/ci.yml`): en cada PR compila el frontend, levanta la API con una base temporal, corre la **prueba de humo** (89 comprobaciones) y audita dependencias. Un PR en rojo no se mergea.
- **Migraciones:** siempre aditivas (añadir columnas/tablas); nunca borrar ni renombrar algo en uso en el mismo despliegue.
- **Rollback:** Railway → *Deployments* → versión anterior → *Rollback*. Las migraciones aplicadas no se deshacen: por eso son aditivas. Pages → *Deployments* → *Rollback to this deployment*.
- **Arranque seguro:** en producción la API **se niega a arrancar** si `JWT_SECRET` tiene menos de 32 caracteres, si `FRONTEND_URL` no es https o si está activo `PASSWORD_LOGIN`. El seed demo tampoco corre en producción.

## Copias de seguridad

- **Automáticas:** una copia consistente de la base al día (a partir de las 03:00, hora del servidor) en `/data/backups/ski-jornada-AAAA-MM-DD.db`; se conservan las últimas 14 (`BACKUP_CONSERVAR`). Se apagan con `BACKUP_DIARIO=false`.
- **Descargar una copia ahora (cuenta principal):** `GET /api/admin/backup/descargar` (con la sesión de la cuenta principal) devuelve un archivo SQLite. **Guardar una copia fuera del servidor** (Drive, disco propio) al menos semanalmente: las copias del volumen no protegen frente a perder el volumen.
- **Listar copias:** `GET /api/admin/backup`.
- **Archivos subidos** (`/data/uploads`, solo si el módulo de documentos está activo): no entran en la copia de la base; copiar la carpeta aparte.
- **Probar la restauración** al menos una vez antes del primer día real (ver siguiente apartado).

### Restaurar

1. Railway → `api` → pausar/desactivar el servicio (o *Stop deployment*).
2. Abrir una consola en el servicio y reemplazar la base: `cp /data/backups/ski-jornada-AAAA-MM-DD.db /data/prod.db` (o subir la copia descargada).
3. Reiniciar el servicio. Comprobar `GET /api/salud` y entrar como administrador.
4. Se pierde lo ocurrido entre la copia y el incidente: avisar al equipo.

## Secretos y rotación

| Secreto | Dónde | Cuándo rotar | Efecto |
|---------|-------|--------------|--------|
| `JWT_SECRET` | Railway | Si se sospecha una filtración, o cada año | Cierra **todas** las sesiones; todos piden un enlace nuevo |
| `RESEND_API_KEY` | Railway (y panel Resend) | Si se filtra, o al cambiar de equipo | Crear una nueva, cargarla y revocar la anterior |
| API keys de integración / secretos de webhooks | App → Integraciones | Al cambiar de proveedor o ante sospecha | Crear nueva y borrar la anterior |
| Acceso a Railway / Cloudflare / Resend / GitHub | Cuentas del equipo | Al salir alguien | Activar 2FA en todas |

Nunca pegar claves en canales compartidos; si se hace, rotarlas.

## Región UE (pendiente para datos reales)

El servicio actual de pruebas está en `us-west2`. Para Snowmotion:
1. Railway → crear un **servicio nuevo** en región `europe-west4` (en Amsterdam) desde el mismo repositorio (`/backend`) y un **volumen nuevo** montado en `/data` (un servicio con volumen vive en una sola región; no se mueve, se recrea).
2. Cargar las mismas variables (`MULTI-DESPLIEGUE.md`); la base nueva arranca vacía y `bootstrap.js` crea la cuenta principal.
3. Mover el dominio `api.skijornada…` al servicio nuevo (Railway → *Networking*).
4. Si hay datos que conservar: descargar una copia de la base antigua y restaurarla en el volumen nuevo (apartado anterior).
5. Eliminar el servicio antiguo.

## Incidentes

| Síntoma | Qué mirar |
|---------|-----------|
| «No llega el enlace» | Resend → *Logs*; spam; `RESEND_API_KEY` y `EMAIL_FROM` en Railway; dominio *Verified*; límite de 1 enlace/min por email |
| La web carga pero no inicia sesión / error de red | `https://…/api/salud`; CORS: `FRONTEND_URL` debe incluir el origen exacto de la web; `VITE_API_URL` correcto y re-desplegar Pages |
| 503 en `/api/salud` | Volumen no montado o disco lleno (`unable to open database file`); restaurar copia |
| Despliegue en rojo | Railway → *Deployments* → *Build/Deploy logs*; el servicio anterior sigue sirviendo |
| Posible brecha de datos | Protocolo en `RGPD.md`: contener (rotar `JWT_SECRET`, desactivar claves), evaluar, notificar en 72 h |
| Un profesor perdió acceso | Usuarios → estado *Inactivo*/*Invitado*; *Reenviar invitación* |

## Tareas periódicas

| Frecuencia | Tarea |
|------------|-------|
| Semanal | Descargar y guardar fuera una copia de la base |
| Mensual | Revisar el registro de actividad (Usuarios), bajas pendientes, correos rebotados en Resend |
| Trimestral | `npm audit` / actualizar dependencias; probar restauración |
| Anual | `node backend/scripts/purgar.js` (retención de datos de bajas, ver `RGPD.md`); rotar `JWT_SECRET`; revisar accesos |
