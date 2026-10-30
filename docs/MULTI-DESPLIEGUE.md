# Multi-despliegue: una instancia por cliente

> Cada instancia tiene una **cuenta principal** de administración (`ADMIN_EMAIL`). Puede ser una cuenta de empresa: `ADMIN_NOMBRE=Administración` y `ADMIN_APELLIDOS` vacío. Esa cuenta carga la lista de profesores e invita. Ver `ACCESO-Y-ALTAS.md`.

Cada cliente (escuela) tiene **su propio despliegue**: backend, base de datos y frontend independientes. El código es el mismo; lo que cambia son las variables. Así los datos quedan aislados y cada cliente puede tener su dominio, marca y correo.

```
cliente A ─ Pages (frontend) ─▶ Railway "api" + volumen ─▶ Resend (dominio A)
cliente B ─ Pages (frontend) ─▶ Railway "api" + volumen ─▶ Resend (dominio B)
```

## Plantillas

| Archivo | Para qué |
|---------|----------|
| `deploy/cliente.backend.env.template` | Variables del backend (Railway) |
| `deploy/cliente.pages.env.template` | Variables de build del frontend (Cloudflare Pages) |
| `deploy/profesores.csv.example` | Formato de la lista de profesores |

Guardar las variables reales de cada cliente en un gestor de secretos (no en el repo).

## Checklist de alta de un cliente (≈ 30 min)

**0. Datos del cliente:** nombre, ciudad, color, email del administrador, lista de profesores (CSV), dominio o subdominio (`<cliente>.<tu-dominio>` y `api.<cliente>.<tu-dominio>`).

**1. Backend en Railway**
1. Crear un proyecto `<cliente>-jornada` y un servicio `api` desde `johelp/ski-jornada`, rama `main`, Root Directory `/backend`. (`backend/railway.json` ya define build, arranque y healthcheck).
2. Montar un volumen en `/data`.
3. Cargar las variables de `deploy/cliente.backend.env.template`. `JWT_SECRET` **distinto por cliente**.
4. Añadir el dominio personalizado `api.<cliente>…` y crear en el DNS los registros CNAME y TXT que indique Railway.
5. Esperar el deploy: las migraciones y el administrador se crean solos en el arranque. Comprobar `GET /api/server-time`.

**2. Correo en Resend**
1. Verificar el dominio de envío (SPF/DKIM en el DNS) y crear una API key.
2. Cargarla como `RESEND_API_KEY` y fijar `EMAIL_FROM`.

**3. Frontend en Cloudflare Pages**
1. Proyecto conectado al repo: root `frontend`, build `npm run build`, salida `dist`, rama `main`.
2. Variables de `deploy/cliente.pages.env.template` (`VITE_API_URL` apunta al API del cliente).
3. Dominio personalizado `<cliente>.<tu-dominio>` y su registro DNS.

**4. Cargar el equipo**
```bash
# desde backend/, con las variables del cliente (DATABASE_URL apuntando a su base)
node prisma/import-profesores.js ../deploy/profesores.csv --dry   # simulación
node prisma/import-profesores.js ../deploy/profesores.csv
```
En Railway se puede ejecutar con `railway run` o desde la consola del servicio. Es idempotente (actualiza por email). No envía correos: cada profesor entra con su email desde la landing. Alternativa: dar de alta uno a uno en **Usuarios**.

**5. Configuración inicial (la hace el administrador del cliente)**
1. **Config:** nombre, CIF, dirección, color y email de avisos.
2. **Clases → Disciplinas y primas:** definir disciplinas y primas con importes.
3. **Usuarios → Editar:** tarifa por hora de cada profesor (opcional).
4. **Zonas:** crear zonas de fichaje, imprimir los QR.

**6. Verificación**
- Entrar como administrador y como profesor (enlace al correo).
- Cargar una clase, confirmar el mes y revisarlo desde administración.
- Subir un documento y abrirlo desde la cuenta del profesor.
- Instalar la PWA en un móvil.
- Opcional, en un entorno de **prueba**: `node backend/scripts/smoke.js` (ver `PRUEBAS.md`).

## Actualizar todos los clientes

Cada servicio despliega desde `main`. Un merge actualiza **todos** los despliegues a la vez. Reglas:
- Las migraciones deben ser **aditivas** (no borrar ni renombrar columnas en uso).
- Probar en un despliegue de pruebas antes del merge si el cambio toca el esquema.
- Para congelar a un cliente en una versión, fijar `commitSha` en su servicio de Railway y en su proyecto de Pages.

## Qué es por cliente y qué se comparte

| Por cliente | Compartido |
|-------------|------------|
| Base de datos y archivos (volumen) | Código y repositorio |
| `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` | Plantillas y documentación |
| Dominio, marca (`VITE_*`, Config) | Cuenta de Railway / Cloudflare / Resend (o una por cliente si se prefiere) |
| Administrador, profesores, disciplinas, primas | |

## Costes y límites

- Un servicio y un volumen en Railway por cliente. Una réplica (SQLite).
- Si se superan ~5 clientes o se necesita autoservicio, evaluar la versión **multi-escuela** (un solo despliegue con aislamiento por escuela). Ver `ROADMAP.md`.

## Retirar un cliente

1. Exportar sus datos (informes, documentos) y entregarlos.
2. Borrar el servicio y el volumen en Railway, el proyecto de Pages y el dominio de Resend.
3. Revocar su `RESEND_API_KEY`.
