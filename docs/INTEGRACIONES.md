# Integraciones

La plataforma expone una **API para sistemas externos** (reservas, nóminas, BI, Drive…) separada de la API de la app. Se usa con **API keys** y permisos por alcance, y avisa de eventos con **webhooks firmados**.

## 1. API keys

Se crean desde la API de administración (`POST /api/admin/integraciones/keys`; pestaña en la interfaz: pendiente, ver `ALCANCE-MVP.md`). La key en claro se muestra **una sola vez**; en base solo se guarda su hash.

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
| `planning.importado` | Se importa planning | `filas, fuente` |

Petición: `POST` JSON `{ "evento", "ocurridoAt", "datos" }` con cabeceras `X-SkiJornada-Event` y `X-SkiJornada-Signature: sha256=<hex>`.

Verificar la firma (Node):
```js
const esperado = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(req.headers['x-skijornada-signature']));
```
Entrega: un intento con timeout de 5 s; el último estado HTTP queda guardado en el webhook. **No hay reintentos** (pendiente). Los webhooks no incluyen importes.

## 4. Recetas

- **Reservas → planning:** el gestor de reservas (o un script programado) hace `POST /api/v1/planning` cada noche con `reemplazarMes`. Administración ve las diferencias al revisar.
- **Nóminas:** script mensual con una key `lectura + economico` que descarga el informe de los meses aprobados.
- **Aviso en Slack/Teams/Drive:** un webhook a un flujo (Zapier/Make/n8n) para `clases.mes_confirmado` y `documento.firmado`.
- **Drive:** ver `PILOTO-SNOWMOTION.md` (cuenta de servicio, archivado de firmadas).

## 5. Seguridad

- Una key por sistema; revocar al dejar de usarla; rotar periódicamente.
- Las keys y secretos de webhook no se pueden volver a leer: si se pierden, se crean de nuevo.
- Las keys con `economico` acceden a datos salariales: tratarlas como secretos de nómina.
- Registrar el sistema receptor como **encargado/subencargado** si recibe datos personales (ver `RGPD.md`).
