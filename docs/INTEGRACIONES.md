# Integraciones

La plataforma expone una **API para sistemas externos** (reservas, nóminas, BI, Drive…) separada de la API de la app. Se usa con **API keys** y permisos por alcance, y avisa de eventos con **webhooks firmados**.

## 1. API keys

Se crean en **Integraciones → Claves de API** (o con `POST /api/admin/integraciones/keys`). La key en claro se muestra **una sola vez**; en base solo se guarda su hash.

| Alcance | Permite |
|---------|---------|
| `lectura` | Listar profesores y consultar informes de clases (horas, primas, estado de revisión) |
| `economico` | Añade tarifas e importes a las respuestas de lectura |
| `planning` | Enviar el planning de clases planificadas |

Uso: cabecera `X-API-Key: sj_...` (o `Authorization: Bearer sj_...`). Un JWT de usuario **no** sirve en `/api/v1`. Límite: 120 peticiones por minuto. Una key se puede desactivar (`PUT .../keys/:id {activa:false}`) o borrar.

## 2. Endpoints `/api/v1`

### `GET /api/v1/profesores` — `lectura`
```json
[{ "id": "…", "nombre": "Carlos", "apellidos": "Martínez", "email": "carlos@…", "rol": "PROFESOR",
   "activo": true, "tipoJornada": "COMPLETA", "horasContrato": 35, "tarifaHora": 18 }]
```
`tarifaHora` solo con `economico`.

### `GET /api/v1/informe/:mes` — `lectura` (`?email=` para uno)
`mes` = `AAAA-MM`. Devuelve por profesor con actividad: `totalHoras`, `diasConClases`, `detalle[]` (fecha, horas, disciplina, primas, marca y nota de admin), `desglosePrimas`, `confirmado`, `revision` (`APROBADO`, `DISCREPANCIA`, `CORRECCION`, `COMENTARIO`, `PENDIENTE`). Con `economico` incluye `tarifaHora`, `importeBase`, `importePrimas`, `importeTotal` e importes por clase.

Uso típico para nóminas: pedir el mes, filtrar `confirmado && revision.estado === 'APROBADO'` y exportar `importeTotal`.

### `POST /api/v1/planning` — `planning`
Carga el planning de clases desde el sistema de reservas:
```json
{ "reemplazarMes": "2026-10",
  "items": [{ "email": "carlos@…", "fecha": "2026-10-27", "horas": 3, "disciplina": "Esquí", "referencia": "R-1001" }] }
```
- Hasta 5.000 filas por envío. `referencia` identifica la reserva: reenviar la misma actualiza (idempotente).
- `reemplazarMes` borra antes el planning de ese mes para los profesores incluidos (útil para sincronizaciones completas).
- Respuesta: `{ importadas, invalidas, sinProfesor: ["email desconocido"] }`.
- También disponible para administración por CSV: `POST /api/admin/planning/importar`.

**Cotejo:** el detalle de administración de un profesor (`GET /api/clases/informe/:mes?profesorId=`) incluye `planning` con, por día, horas planificadas, cargadas y diferencia, más totales y días con diferencia.

## 3. Webhooks

Alta: `POST /api/admin/integraciones/webhooks {url, eventos[]}` (URL **https**; sin `eventos` = todos). El `secret` se muestra una sola vez. Prueba: `POST …/webhooks/:id/probar`.

| Evento | Cuándo | `datos` |
|--------|--------|---------|
| `clases.mes_confirmado` | El profesor confirma el mes | `email, mes, totalHoras, diasConClases` |
| `clases.revision` | Administración revisa | `email, mes, estado, nota` |
| `clases.mes_reabierto` | Se reabre un mes | `profesorId, mes` |
| `documento.firmado` | El profesor sube un documento firmado | `documentoId, tipo, mes, profesorId` |
| `solicitud.creada` | Un profesor pide días libres | `id, profesorId, fechaInicio, fechaFin, motivo` |
| `solicitud.modificada` | El empleado o administración cambian una solicitud | `id, profesorId, fechaInicio, fechaFin, motivo` |
| `solicitud.cancelada` | El empleado retira una solicitud pendiente | `id, profesorId` |
| `solicitud.respondida` | Administración aprueba o rechaza | `id, profesorId, estado, observacion` |
| `planning.importado` | Se importa planning | `filas, fuente` |

Petición: `POST` JSON `{ "evento", "ocurridoAt", "datos" }` con cabeceras `X-SkiJornada-Event` y `X-SkiJornada-Signature: sha256=<hex>`.

Verificar la firma (Node):
```js
const esperado = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(req.headers['x-skijornada-signature']));
```
Entrega: un intento con timeout de 5 s; el último estado HTTP queda guardado en el webhook. **No hay reintentos** (pendiente). Los webhooks no incluyen importes.

## 4. Recetas (también en Integraciones → Ideas)

| Caso de uso | Cómo |
|-------------|------|
| **Gestoría / nóminas** | Clave `lectura + economico` y `GET /api/v1/informe/AAAA-MM`; filtrar `confirmado && revision.estado === 'APROBADO'` |
| **Reservas → planning** | Clave `planning`; el sistema de reservas hace `POST /api/v1/planning` cada noche |
| **Avisos al canal de administración** | Webhook `clases.mes_confirmado` + `solicitud.creada` → Make/Zapier/n8n → Slack, Teams o correo |
| **Hoja de cálculo** | Webhook `clases.revision` → Make/Zapier → Google Sheets (una fila por mes aprobado) |
| **WhatsApp al equipo** | Sección 6 |

Detalle:

- **Reservas → planning:** el gestor de reservas (o un script programado) hace `POST /api/v1/planning` cada noche con `reemplazarMes`. Administración ve las diferencias al revisar.
- **Nóminas:** script mensual con una key `lectura + economico` que descarga el informe de los meses aprobados.
- **Aviso en Slack/Teams/Drive:** un webhook a un flujo (Zapier/Make/n8n) para `clases.mes_confirmado` y `documento.firmado`.
- **Drive:** ver `PILOTO-SNOWMOTION.md` (cuenta de servicio, archivado de firmadas).

## 5. Seguridad

- Una key por sistema; revocar al dejar de usarla; rotar periódicamente.
- Las keys y secretos de webhook no se pueden volver a leer: si se pierden, se crean de nuevo.
- Las keys con `economico` acceden a datos salariales: tratarlas como secretos de nómina.
- **Los webhooks no pueden apuntar a la red interna** (SSRF): se resuelve el host y se rechazan IP privadas, locales y metadatos de la nube; no se siguen redirecciones.
- Registrar el sistema receptor como **encargado/subencargado** si recibe datos personales (ver `RGPD.md`).

## 6. WhatsApp (opcional, Baileys)

Permite enviar avisos desde **un número de WhatsApp** de la escuela. Está **desactivado** hasta que administración lo activa.

**Activar:** *Integraciones → WhatsApp → Generar QR*. En el móvil del número emisor: WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo, y escanear. El estado pasa a *Conectado*. **Desactivar** apaga el envío conservando la vinculación; **Desvincular número** cierra la sesión y borra las credenciales.

**Qué envía (solo a quien lo activó en su perfil y tiene teléfono):** respuesta a solicitudes de días libres, revisión de horas y mes reabierto, avisos de administración, recordatorio de fichar la salida y, los dos últimos días del mes (10:00), de confirmar las horas.

**Protecciones:** envíos en cola con pausa aleatoria (1,5–4 s), tope diario (`WHATSAPP_MAX_DIA`, 300), comprobación de que el número tiene WhatsApp, y teléfono con prefijo (`WHATSAPP_PREFIJO`, 34 para números de 9 cifras).

**Configuración:**

| Variable | Efecto |
|----------|--------|
| `WHATSAPP_ENABLED=false` | Oculta y bloquea todo el módulo en el despliegue |
| `WHATSAPP_DIR` | Dónde se guarda la sesión (por defecto junto a la base de datos, en el volumen: sobrevive a los reinicios) |
| `WHATSAPP_MAX_DIA` | Tope diario de mensajes (300) |
| `WHATSAPP_PREFIJO` | Prefijo por defecto (34) |

**Avisos importantes**
- Baileys **no es la API oficial**: no cumple las condiciones de uso de WhatsApp y el número puede ser **bloqueado**. Usar un **número dedicado**, pocos mensajes y solo a personas que los esperan. Si se necesita fiabilidad contractual, usar la WhatsApp Business Platform oficial (de pago) o el correo.
- La sesión equivale a una sesión abierta del móvil: quien accede al volumen puede enviar mensajes. Incluida en la copia de seguridad del volumen, no en la de la base.
- Solo se escribe a quien activó los avisos en su perfil (se puede retirar cuando quiera). Meta (WhatsApp) pasa a ser **subencargado** de ese tratamiento: ver `RGPD.md`.
- El paquete es una dependencia opcional: si no se instala, la pantalla indica «Módulo no instalado» y el resto funciona.
