# Auditoría de seguridad previa al primer despliegue

Fecha: 31/10/2026 · Versión revisada: rama `docs/implementacion-legal` sobre `main` (`b68c5e7` + endurecimiento de producción) · Base: API Node/Express + Prisma/SQLite y frontend React/Vite.

## Alcance y método

- **Qué se revisó:** todo el código de la API y del frontend, con foco en los **informes de horas** (jornada, planilla, clases y económico), la **generación de PDF** (registro de jornada y clases), las **subidas y descargas de archivos**, la **autorización** de cada ruta, las **exportaciones CSV**, los **correos** y la configuración de **cabeceras, CORS y límites**.
- **Cómo:** lectura del código fuente y pruebas **solo en local** con datos ficticios (servidor en `localhost`, base de ejemplo). Se siguió la guía de la skill `security-audit`: un hallazgo exige un límite de confianza cruzado y un efecto observable; no se probó ningún sistema desplegado; lo que depende de configuración externa queda como *pendiente de validar*.
- **Límites de esta revisión:** es una auditoría **dirigida y en línea** (una sola pasada), no el flujo completo de seis fases con agentes independientes y verificación cruzada. No sustituye a una prueba de penetración externa. La configuración propia de Cloudflare, Railway y Resend (reglas de WAF, planes, políticas) no está en el repositorio y se lista en *Pendiente de validar*.
- **Resultado en una línea:** 1 hallazgo **alto**, 3 **medios**, 4 **bajos**; **todos corregidos** y cubiertos con pruebas de regresión (smoke test: 114 comprobaciones). Quedan recomendaciones de endurecimiento y puntos por validar en la infraestructura.

## Hallazgos

### H1 · Alto · Contenido HTML subido como «PDF» se ejecutaba en la sesión del administrador — **corregido**
- **Dónde:** subida de documentos y firmas (`multer`) y visor de archivos (`abrirArchivo`).
- **Qué pasaba:** el servidor aceptaba cualquier archivo cuyo *tipo declarado por el cliente* fuera `application/pdf` y guardaba la **extensión que el cliente decidía** (`falso.html`). El archivo se servía con el tipo de su extensión (`text/html`) y el frontend lo abría como *blob* con ese tipo, dentro del **mismo origen que la aplicación** (donde está el token de sesión).
- **Quién y qué:** un **profesor** (cuenta de baja confianza) podía subir su «documento firmado» o «registro firmado»; cuando un **administrador** lo abría, el script del profesor se ejecutaba con la sesión del administrador → **escalada de privilegios** (toma de la cuenta de administración).
- **Evidencia local (datos ficticios):** subida de `falso.html` declarada como `application/pdf` → `200`; descarga por el administrador → `Content-Type: text/html`.
- **Corrección:** (1) el tipo se decide por el **contenido** (firma del archivo: `%PDF-`, PNG, JPEG) y la extensión la fija el servidor; (2) los archivos se sirven con **tipo fijo**, `nosniff`, `Content-Security-Policy: sandbox` y `Content-Disposition: inline`, y se rechaza cualquier extensión no permitida; (3) el visor del frontend fija el tipo del *blob* por la extensión y no por la cabecera del servidor.
- **Pruebas:** HTML declarado como PDF → 400; contenido no PDF con extensión `.pdf` → 400; PNG válido aceptado con extensión impuesta por el servidor y servido como `image/png` con `nosniff` y `sandbox`.

### H2 · Medio · Horas y días de los informes de jornada en hora del servidor (UTC) — **corregido**
- **Dónde:** `/api/informe/:mes/:anio`, planilla, registro de jornada en PDF.
- **Qué pasaba:** en Railway el servidor funciona en UTC. Las horas mostradas de entrada y salida salían con 1–2 h de diferencia respecto a España y los fichajes cercanos a medianoche o al cambio de mes se asignaban al día/mes equivocado. El **registro de jornada es un documento legal** (RD 8/2019).
- **Evidencia:** `2026-02-10T08:30Z` → `08:30` en UTC y `09:30` en Madrid.
- **Corrección:** la API fija `TZ=Europe/Madrid` por defecto (configurable con la variable `TZ`) y `/api/salud` expone la zona horaria activa.

### H3 · Medio · Datos de ejemplo de la escuela (CIF, dirección, teléfono) en documentos legales de instancias nuevas — **corregido**
- **Qué pasaba:** los valores por defecto del esquema (`B12345678`, «Sierra Nevada, Granada», `958 000 000`) y los textos de reserva del PDF se imprimían en el registro de jornada de cualquier escuela que no hubiera completado su configuración.
- **Corrección:** datos en blanco por defecto (el arranque también limpia los valores de ejemplo heredados), el PDF solo muestra lo configurado, y los textos legales usan marcadores visibles. Añadido a la lista de verificación: completar los datos de la escuela antes de generar informes.

### H4 · Medio · Un límite de intentos compartido bloqueaba la incorporación del equipo desde la misma red — **corregido**
- **Qué pasaba:** pedir y canjear enlaces compartían un límite de **10 por IP cada 15 minutos**. Un equipo en la misma wifi (misma IP pública) se bloqueaba tras 5 personas el día de las invitaciones. Era un fallo de disponibilidad, no de confidencialidad.
- **Corrección:** límites separados y altos por IP (60 y 120 por 15 min) y el control fino pasa al **límite por email** (1 por minuto, 5 por hora). Además, red de seguridad general de 3.000 peticiones por IP y 15 min.

### H5 · Bajo · Inyección de fórmulas en las exportaciones CSV — **corregido**
- **Qué pasaba:** tres exportaciones (planilla, resumen de clases, comparativa) escribían nombres y textos tal cual; una celda que empieza por `=`, `+`, `-` o `@` se ejecuta como fórmula al abrirla en Excel o Sheets.
- **Corrección:** las celdas de texto se prefijan con comilla simple; los números se mantienen (`frontend/src/csv.js`). Además se corrigió un fallo que alteraba textos con punto en la comparativa.

### H6 · Bajo · HTML sin escapar en correos y nombre de adjunto — **corregido**
- Nombres y títulos de documentos (introducidos por administración) iban sin escapar en el HTML de algunos correos; el adjunto del registro usaba el apellido tal cual en el nombre de archivo. **Corrección:** escape de HTML y nombre de adjunto saneado.

### H7 · Bajo · Mes o año inválidos en los informes devolvían error 500 — **corregido**
- Ahora se valida el mes (1–12) y el año (2000–2100) y se responde 400.

### H8 · Bajo (calidad) · Glifo de emoji en la cabecera del PDF — **corregido**
- La cabecera del registro usaba un emoji que la fuente estándar del PDF no puede dibujar y salía como caracteres corruptos. Sustituido por texto.

### R1 · Regresión evitada · Límite de JSON de 2 MB y envío del registro por correo
- Al endurecer la API (JSON máximo 2 MB) el envío del registro firmado por correo (PDF en base64) habría fallado con PDFs grandes. Esa ruta tiene ahora su propio límite (15 MB) y el resto sigue en 2 MB; hay pruebas para ambos casos.

## Revisión de los informes de horas y PDFs (resumen)

| Aspecto | Resultado |
|---------|-----------|
| Autorización | Correcta: el parámetro `profesorId` solo lo respeta un administrador; el profesor siempre ve lo suyo; planilla y comparativa son solo administración. Pruebas añadidas |
| Cálculo | Horas = suma de pares ENTRADA→SALIDA del día; la entrada sin salida no suma. El «exceso» compara con `horasContrato / 5` por día |
| Importes de clases | Reproducibles: se congelan tarifas y primas al confirmar el mes; hay pruebas del cálculo |
| Generación de PDF | En el navegador (jsPDF): texto plano, sin contenido activo; probado con nombres hostiles (`=cmd…`, HTML): se imprimen literales |
| Descarga de PDF | Con sesión, comprobando propiedad y con tipo fijo |
| **Observaciones de producto (no son fallos de seguridad)** | (a) «Exceso» supone semana de 5 días: en jornada de esquí con días sueltos conviene decidir la regla con el cliente. (b) Un día con solo ENTRADA cuenta como día trabajado con 0 h y baja el promedio. (c) Turnos que cruzan la medianoche se parten en dos días. Documentar estas reglas en el acuerdo con el cliente |

## Controles verificados (sin hallazgos)

- Sin registro público; invitación + enlace de un solo uso (256 bits, huella en base, 15 min); baja con revocación inmediata; límites por email e IP.
- Autenticación en todas las rutas salvo cuatro públicas e intencionadas: `/api/salud`, `/api/server-time`, `/api/config` (datos públicos de la escuela) y `/api/legal/privacidad`.
- Sin consultas SQL construidas con datos del usuario (Prisma; el único SQL en bruto es `VACUUM INTO` con ruta del servidor).
- Sin `innerHTML`, `dangerouslySetInnerHTML` ni `eval` en el frontend (React escapa por defecto).
- Los secretos de zona (QR) nunca se envían a no administradores; las claves de API y los secretos de webhooks se muestran una sola vez y se guardan como huella.
- CORS restringido a `FRONTEND_URL`; Helmet en la API; HSTS y cabeceras en la web; el arranque aborta con configuración insegura.

## Riesgos residuales y recomendaciones

| # | Riesgo | Recomendación |
|---|--------|---------------|
| 1 | **El token de sesión está en `localStorage`**: cualquier XSS futuro lo robaría | Mantener la CSP y no introducir `innerHTML`. Plan: pasar a cookie `HttpOnly; Secure; SameSite=Lax` (la API y la web comparten sitio: `api.skijornada…` y `skijornada…`) |
| 2 | **CSP en modo solo-informe** | Revisar una semana y activar. Probar antes la apertura de PDF (los *blobs* heredan la política) |
| 3 | **La API no pasa por el proxy de Cloudflare** (registro DNS «solo DNS» necesario para que Railway valide el dominio): no hay WAF ni mitigación de DDoS de Cloudflare delante de la API | Valorar activar el proxy con SSL «Full (strict)» tras la verificación; o reglas de límite en el borde para `/api/auth/*`. Hasta entonces, valen los límites de la propia API |
| 3 | Sin doble verificación para administración | En el roadmap; mientras tanto, 2FA en el buzón de la cuenta principal |
| 4 | Archivos y base sin cifrado propio en reposo | Depende del volumen del proveedor; confirmar. Valorar cifrar las copias que se guarden fuera |
| 5 | Registro de actividad sin accesos de lectura | Aceptable para el piloto; ampliar si el cliente lo exige |

## Pendiente de validar (fuera del repositorio)

1. **Cloudflare:** que la zona tenga SSL «Full (strict)», «Always use HTTPS» y HSTS activos; reglas de límite de peticiones si se activa el proxy en la API; revisión de *Bot Fight Mode* sin romper la PWA.
2. **Railway:** región UE, volumen cifrado y copias del volumen según el plan; variables `TZ`, `JWT_SECRET`, `FRONTEND_URL`.
3. **Resend:** dominio verificado con SPF/DKIM; DMARC en `p=none` → subir a `quarantine` cuando el envío sea estable.
4. **Cuentas:** 2FA en GitHub, Railway, Cloudflare, Resend y buzón de administración; revisar quién tiene acceso.
5. **Prueba en dispositivos reales** de apertura de PDF, fichaje con cámara/NFC e instalación de la PWA bajo la CSP final.

## Cómo repetir la revisión

- `node backend/scripts/smoke.js` ejecuta las comprobaciones de regresión de cada hallazgo (secciones 6d–6i; 127 comprobaciones) y corre en cada PR.
- `npm audit --omit=dev` en `backend/` y `frontend/` (también en la integración continua).
