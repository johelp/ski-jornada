# Manual de despliegue en producción para un cliente nuevo

Guía **paso a paso** para montar una instalación propia cuando un cliente confirma. Pensada para quien implanta (tú), con todo en orden y sin saltos. Reúne y actualiza lo que estaba repartido en `MULTI-DESPLIEGUE.md`, `DEPLOY.md`, `PUESTA-EN-MARCHA.md` y `CHECKLIST-PRODUCCION.md`. El plan de proyecto con el cliente (fases, formación, piloto, liquidación) sigue en `MANUAL-IMPLEMENTACION.md`.

**Resultado:** una instalación aislada del cliente (API + base de datos + web + correo) con su dominio, su marca y su equipo cargado.
**Tiempo:** ≈ 2–3 horas de trabajo técnico, más la espera del DNS y de la verificación del correo (de minutos a 24 h).

> La instalación de demostración (la web de venta) **no** se reutiliza para un cliente: cada cliente tiene la suya. La demo se queda con sus datos de ejemplo.

---

## 0. Antes de empezar

### 0.1 Cuentas que necesitas (una vez; sirven para todos los clientes)
| Servicio | Para qué |
|----------|----------|
| GitHub (`johelp/ski-jornada`) | Código; los despliegues salen de aquí |
| Railway | API y base de datos (un proyecto por cliente) |
| Cloudflare (Pages + DNS) | Web del cliente |
| Resend | Correo (enlaces de acceso e invitaciones) |
| Gestor de contraseñas | Guardar los secretos de cada cliente |

### 0.2 Datos que debe darte el cliente
Rellena la **hoja del cliente** (anexo A) antes de tocar nada. Imprescindibles: nombre legal y CIF, correo de la cuenta de administración, subdominio, lista del equipo (CSV) y quién gestiona su DNS.

### 0.3 Decisiones por cliente (apúntalas en la hoja)
| Decisión | Opciones | Efecto |
|----------|----------|--------|
| Documentos (nóminas, contratos) | Activar / `DOCUMENTOS_HABILITADOS=false` | Si las nóminas se firman fuera, apagarlo |
| Firma en pantalla | Por defecto activa / `FIRMA_PANTALLA_HABILITADA=false` | Constancia de recepción; texto a validar con su asesor (`legal/TEXTO-FIRMA-EN-PANTALLA.md`) |
| Notificaciones push | Generar claves VAPID | Avisos en el móvil (`NOTIFICACIONES-PUSH.md`) |
| WhatsApp | Disponible y apagado / `WHATSAPP_ENABLED=false` | Canal opcional; se activa desde Integraciones |
| Fichaje por GPS | QR/NFC preferido | Si usa GPS, informarlo por escrito (`RGPD.md`) |
| Módulos que usará | Clases, días libres, documentos, comparativa, integraciones, avisos, colaboradores | El cliente los enciende/apaga en *Config → Módulos* |

### 0.4 Nombres (convención)
Elige un identificador corto del cliente, `<cliente>` (ej. `snowmotion`), y úsalo siempre:
- Proyecto Railway: `<cliente>-jornada` · Proyecto Pages: `<cliente>-jornada-web`
- Web: `https://<cliente>.<tu-dominio>` · API: `https://api.<cliente>.<tu-dominio>`
- Si el cliente quiere su propio dominio, usa `app.<su-dominio>` y `api.<su-dominio>`.

---

## 1. Preparar los secretos

Genera y guarda **en el gestor de contraseñas**, en una ficha del cliente:

```bash
openssl rand -hex 32                      # → JWT_SECRET (distinto por cliente, mínimo 32 caracteres)
cd backend && npm install && npm run vapid # → VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (una vez; no cambiarlas después)
```
La clave privada VAPID y `JWT_SECRET` **nunca** van al repositorio ni a la web. Si cambias las claves VAPID, todos los móviles tendrían que volver a activar las notificaciones.

---

## 2. Backend en Railway

1. **Proyecto nuevo** `<cliente>-jornada` → *New → GitHub Repo* `johelp/ski-jornada`, rama `main`.
2. Servicio `api` → *Settings*: **Root Directory** `/backend`. El build y el arranque ya los define `backend/railway.json` (migraciones y administrador se crean solos al arrancar; healthcheck `/api/salud`).
3. **Región: la UE** (p. ej. Europe West / Países Bajos). Los nombres de la consola pueden variar; si es una región fuera de la UE, el cliente debe saberlo (afecta a RGPD).
4. **Volumen:** añadir un volumen montado en `/data` (base de datos, subidas y copias). Sin volumen, **se pierden los datos en cada despliegue**.
5. **Variables** (*Variables → Raw editor*; plantilla en `deploy/cliente.backend.env.template`):

| Variable | Valor | Obligatoria |
|----------|-------|:-----------:|
| `NODE_ENV` | `production` | ✔ |
| `JWT_SECRET` | el generado en el paso 1 | ✔ |
| `DATABASE_URL` | `file:/data/prod.db` | ✔ |
| `UPLOAD_DIR` | `/data/uploads` | ✔ |
| `FRONTEND_URL` | `https://<cliente>.<tu-dominio>` (https; varias, separadas por coma) | ✔ |
| `ADMIN_EMAIL` | correo de la cuenta de administración (puede ser de empresa) | ✔ |
| `ADMIN_NOMBRE` / `ADMIN_APELLIDOS` | `Administración` y vacío si es cuenta de empresa | ✔ |
| `RESEND_API_KEY` | clave de Resend (paso 4) | ✔ |
| `EMAIL_FROM` | `Nombre escuela <no-reply@<cliente>.<tu-dominio>>` | ✔ |
| `PROVEEDOR_NOMBRE`, `PROVEEDOR_CIF`, `PROVEEDOR_EMAIL` | Tus datos como encargado del tratamiento (salen en los textos legales) | ✔ |
| `DATOS_REGION` | Dónde están los datos, p. ej. `la Unión Europea (Países Bajos)` | ✔ |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Claves del paso 1 | push |
| `VAPID_SUBJECT` | `mailto:administracion@<cliente>…` (si falta usa `ADMIN_EMAIL`) | push |
| `DOCUMENTOS_HABILITADOS` | `false` si las nóminas se firman fuera | según cliente |
| `FIRMA_PANTALLA_HABILITADA` | `false` para ocultar la firma en pantalla | según cliente |
| `WHATSAPP_ENABLED` | `false` si no debe existir el módulo | según cliente |
| `TZ` | por defecto `Europe/Madrid` | no |
| `BACKUP_DIARIO` / `BACKUP_CONSERVAR` | copia diaria en `/data/backups` (por defecto 14) | no |

**No definas jamás en un cliente:** `PASSWORD_LOGIN`, `SEED_DEMO`, `SEED_EMAILS`, `SEED_DEMO_FORZAR`, `SEED_RESPETAR_CONFIG`, `PUSH_SIMULADO` (son de demo y pruebas; la API se niega a arrancar con `PASSWORD_LOGIN=true` en producción).

6. **Dominio de la API:** *Settings → Networking → Custom Domain* → `api.<cliente>.<tu-dominio>`. Railway muestra un `CNAME` y un `TXT` de verificación: se crean en el DNS (paso 3).
7. Espera al despliegue. En *Deploy Logs* debe verse `Migrations applied`, el administrador creado, y la línea `🔔 Push: activo` si pusiste las claves.

## 3. DNS (Cloudflare)

| Registro | Nombre | Valor | Notas |
|----------|--------|-------|-------|
| `CNAME` | `api.<cliente>` | el que indique Railway (`*.up.railway.app`) | **Solo DNS** (nube gris) hasta que Railway emita el certificado |
| `TXT` | `_railway-verify.api.<cliente>` | `railway-verify=…` | Verificación del dominio |
| `CNAME` | `<cliente>` | el que indique Pages (`<proyecto>.pages.dev`) | Se crea al añadir el dominio en Pages |

Si el cliente gestiona su DNS, mándale estos registros ya redactados.

## 4. Correo (Resend)

1. *Domains → Add Domain* → el dominio de envío del cliente (`<cliente>.<tu-dominio>` o el suyo).
2. Crea en el DNS los registros que pide (SPF, DKIM y, si los pide, MX de retorno) y espera **Verified**.
3. *API Keys → Create* (permiso *Sending access*) → pégala como `RESEND_API_KEY` en Railway.
4. Después: añade un registro **DMARC** (`_dmarc`, empezar con `p=none`; subir a `quarantine` tras un mes).

Sin dominio verificado, Resend solo envía al correo de la cuenta propietaria.

## 5. Web en Cloudflare Pages

1. *Workers & Pages → Create → Pages → Connect to Git* → `johelp/ski-jornada`, rama `main`.
2. **Root directory** `frontend` · **Build command** `npm run build` · **Output** `dist`.
3. **Variables de build** (*Production*; plantilla `deploy/cliente.pages.env.template`):

| Variable | Valor |
|----------|-------|
| `NODE_VERSION` | `20` |
| `VITE_API_URL` | `https://api.<cliente>.<tu-dominio>` |
| `VITE_MODO_CLIENTE` | `1` — **obligatoria**: deja la landing solo de acceso (sin discurso de venta ni tu WhatsApp) |
| `VITE_APP_NAME` | Nombre de la escuela |
| `VITE_ESCUELA_LUGAR` | Ciudad, provincia |
| `VITE_COLOR_PRIMARIO` | Color de marca, p. ej. `#0f4c81` |

4. *Custom domains* → `<cliente>.<tu-dominio>`.
5. Las variables se incrustan al compilar: si cambias alguna, **vuelve a desplegar**.

## 6. Primera comprobación

```bash
curl https://api.<cliente>.<tu-dominio>/api/salud
```
Debe devolver `{"ok":true,…,"version":"X.Y.Z","commit":"…"}`. Después:
- [ ] Abrir la web: carga con la marca del cliente y **sin** «Pedir demo» ni textos de venta.
- [ ] La versión del pie de la landing coincide con la de `/api/salud`.
- [ ] Pedir el enlace como administrador → llega el correo → entra (enlace o código de 6 dígitos) → acepta el contrato de encargo y la información de privacidad.
- [ ] `https://<cliente>.…` se puede **instalar** en el móvil (HTTPS + manifest).

## 7. Cargar el equipo y configurar

1. **Importar la lista** (CSV de `deploy/profesores.csv.example`). Desde `backend/`, con las variables del cliente (en Railway: consola del servicio o `railway run`):
   ```bash
   node prisma/import-profesores.js ../deploy/profesores.csv --dry   # simulación
   node prisma/import-profesores.js ../deploy/profesores.csv
   ```
   Es idempotente y **no envía correos**. Después, en *Usuarios*, **Invitar** a quien corresponda.
2. **Config** (lo hace el administrador del cliente, tú acompañas): nombre, CIF, dirección, teléfono, color, email de avisos.
3. **Clases → Disciplinas y primas:** importes y si la prima es por hora o por clase. *Usuarios → Editar:* tarifa por hora.
4. **Zonas de fichaje:** crearlas e imprimir los QR.
5. **Config → Módulos:** apagar lo que el cliente no usa.
6. **Integraciones** (si procede): clave de API, webhooks, importación del planning; WhatsApp (*Generar QR*).

## 8. Notificaciones push

1. Con las claves VAPID cargadas, `GET /api/config` incluye `pushDisponible: true`.
2. Desde un **iPhone** (app instalada desde Safari) y un **Android**: *Mi perfil → Notificaciones → Activar* → *Enviarme una prueba*. La guía visual está en la propia pantalla.
3. Si algo falla: `NOTIFICACIONES-PUSH.md`.

## 9. Seguridad: comprobación antes de abrir al equipo

- [ ] `JWT_SECRET` propio del cliente, ≥ 32 caracteres, guardado en el gestor.
- [ ] Ninguna variable de demo definida (apartado 2).
- [ ] `FRONTEND_URL` es exactamente el origen de la web (https, sin barra final).
- [ ] Cuenta de administración con **2FA** en el correo y acceso al buzón controlado.
- [ ] Región de Railway en la UE y volumen montado en `/data`.
- [ ] CSP en modo solo-informe (`frontend/public/_headers`): vigilar una semana y pasarla a obligatoria.
- [ ] Contrato de encargo aceptado en la app y firmado; información de privacidad entregada (`RGPD.md`, `legal/`).

## 10. Copias de seguridad y vigilancia

1. La API hace una **copia diaria** (≈ 03:00) en `/data/backups` y conserva las últimas 14. Eso protege de errores, **no** de perder el volumen.
2. **Copia externa:** descargar al menos una copia semanal fuera del servidor (`OPERACION.md`) y guardarla cifrada.
3. **Probar la restauración una vez** antes de dar el proyecto por entregado.
4. **Monitor externo** (UptimeRobot, Better Stack…) sobre `https://api.<cliente>…/api/salud`, con aviso a tu correo.

## 11. Aceptación y entrega

Ejecuta con el cliente el checklist de `PLAN-DE-PRUEBAS-MVP.md` en móviles reales (iPhone y Android): entrar, fichar, cargar clase, confirmar el mes, revisar, firmar un documento, activar notificaciones.

Entrega: acta de puesta en marcha (anexo B), guías (`GUIA-ADMINISTRACION.md`, `GUIA-PROFESOR.md`), contrato aceptado, acceso del cliente a su cuenta de administración y plan de soporte. El plan de formación y piloto está en `MANUAL-IMPLEMENTACION.md`.

---

## 12. Después del despliegue

### Actualizar a una versión nueva
Todos los clientes despliegan desde `main`: un merge los actualiza **a la vez**. Para controlarlo:
- Las migraciones deben ser **aditivas**; prueba en la demo antes de mergear si tocan el esquema.
- **Congelar a un cliente** en una versión: fija el commit en su servicio de Railway y en su proyecto de Pages (*Deployments*), y anótalo en la ficha.
- Tras actualizar: `/api/salud` y la versión del pie deben coincidir (si no, el botón **Actualizar** de la app deja el móvil al día). Detalle en `VERSIONADO.md`.

### Volver atrás
Railway → *Deployments* → *Rollback* al despliegue anterior; en Pages, *Rollback* equivalente. **Las migraciones no se revierten solas**: por eso son aditivas.

### Retirar un cliente
1. Exportar sus datos (informes, documentos, copia de la base) y entregárselos.
2. Borrar servicio y volumen en Railway, el proyecto de Pages y el dominio de Resend; revocar su `RESEND_API_KEY`.
3. Borrar la ficha de secretos.

---

## 13. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| La API no arranca: «Falta JWT_SECRET» | Variable ausente o < 32 caracteres | Definirla (`openssl rand -hex 32`) |
| La API no arranca por `FRONTEND_URL` | Sin `https://` | Corregirla |
| `unable to open database file` / 503 en `/api/salud` | Volumen sin montar o lleno | Montar el volumen en `/data`; revisar espacio |
| Los datos desaparecen tras un despliegue | No hay volumen | Crear el volumen y restaurar la última copia |
| La web carga pero no entra / error de red | `VITE_API_URL` mal o CORS | Corregir `VITE_API_URL` y **re-desplegar Pages**; `FRONTEND_URL` = origen exacto |
| No llegan los correos | Dominio sin verificar, clave errónea o spam | Resend → estado «Verified»; revisar logs; spam |
| En iPhone el enlace abre Safari y no la app | Comportamiento de iOS | Usar el **código de 6 dígitos** en la app instalada |
| La landing muestra «Pedir demo» | Falta `VITE_MODO_CLIENTE=1` | Añadirla y re-desplegar Pages |
| No hay opción de notificaciones | Faltan las claves VAPID | Cargarlas y redeplegar (`NOTIFICACIONES-PUSH.md`) |
| En iPhone no aparecen las notificaciones | App no instalada o iOS < 16.4 | Instalarla desde Safari y abrirla desde el icono |
| Un móvil se queda con la versión vieja | Caché de la PWA | Botón **Actualizar** (aparece si no coinciden las versiones) |
| Certificado SSL pendiente en la API | CNAME con proxy activo | Dejarlo en «solo DNS» hasta que Railway lo emita |

---

## Anexo A — Hoja del cliente (rellenar antes de empezar)

| Dato | Valor |
|------|-------|
| Identificador `<cliente>` | |
| Nombre legal y CIF | |
| Dirección y teléfono | |
| Correo de la cuenta de administración / 2FA | |
| Otras cuentas de administración | |
| Dominio / subdominio (web y API) y quién gestiona el DNS | |
| Dominio de envío de correo | |
| Región de datos acordada | UE |
| Lista del equipo (CSV entregado el …) | |
| Disciplinas y primas (importe y por hora/por clase) | |
| Zonas de fichaje y modo (QR/GPS/NFC) | |
| Sistema de reservas y formato del resumen | |
| Documentos: ¿módulo activo? | |
| Push / WhatsApp / firma en pantalla | |
| Asesor legal del cliente (contacto) | |
| Fecha de inicio de temporada y de piloto | |

## Anexo B — Acta de puesta en marcha

| Campo | Valor |
|-------|-------|
| Cliente | |
| Fecha | |
| Versión desplegada (`/api/salud`) y commit | |
| URL web / URL API | |
| Región de Railway | |
| Variables no secretas relevantes (módulos, push, firma) | |
| Copia de seguridad: última y restauración probada (fecha) | |
| Monitor externo (enlace) | |
| Contrato de encargo firmado y aceptado en la app | |
| Personas con información de privacidad recibida | |
| Notificaciones probadas en iPhone / Android | ☐ / ☐ |
| Formación realizada (fecha y asistentes) | |
| Contacto de soporte y horario | |
| Firma del cliente / del implantador | |
