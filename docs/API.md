# Referencia de la API

Base: `VITE_API_URL` (local: `http://localhost:3000`). Autenticación: `Authorization: Bearer <jwt>`.
Los errores devuelven `{ "error": "mensaje" }` con el código HTTP correspondiente. 🛡 = solo administrador.

## Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/magic-link` | `{email}` → envía el enlace de acceso (respuesta idéntica exista o no) |
| POST | `/api/auth/magic-link/verificar` | `{token}` → `{token, user}` (JWT 90 días). Un solo uso |
| POST | `/api/auth/renovar` | Renueva la sesión → `{token, user}` |
| POST | `/api/auth/login` | Solo con `PASSWORD_LOGIN=true` (desarrollo) |
| GET/PUT | `/api/auth/me` | Perfil propio (nombre, apellidos, teléfono, hora de recordatorio) |
| PUT | `/api/auth/cambiar-password` | Heredado; sin uso con magic link |
| GET | `/api/server-time` | `{timestamp, iso}` para sincronizar el reloj |

## Fichaje y zonas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/zonas` | Zonas activas (sin secreto) |
| GET/POST 🛡 | `/api/admin/zonas` | Listar (con secreto) / crear |
| PUT/DELETE 🛡 | `/api/admin/zonas/:id` | Editar / borrar |
| POST 🛡 | `/api/admin/zonas/:id/regenerar-secreto` | Nuevo secreto TOTP |
| POST | `/api/fichaje/fichar` | `{qrCodeId, totpToken?, lat?, lng?}` |
| POST | `/api/fichaje/salida` | Cierra la jornada |
| GET | `/api/fichaje/historial` | Registros propios agrupados por día |
| GET 🛡 | `/api/admin/fichajes-activos` | Quién está dentro ahora |

## Clases y primas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/clases/catalogo` | Disciplinas y primas **activas** |
| POST | `/api/clases` | `{fecha:"YYYY-MM-DD", horas, tipoId, primaIds[], notas?}` |
| PUT/DELETE | `/api/clases/:id` | Editar/borrar clase propia (400 si el mes está confirmado) |
| GET | `/api/clases/informe/:mes` | `mes=AAAA-MM`. Devuelve `detalle`, `totalHoras`, `porTipo`, `porDia`, `desglosePrimas`, `tarifaHora`, `importeBase`, `importePrimas`, `importeTotal`, `confirmado`. 🛡 puede añadir `?profesorId=` |
| POST | `/api/clases/confirmar-mes` | `{mes}` → bloquea, congela tarifas, avisa al admin |
| GET 🛡 | `/api/admin/clases/resumen/:mes` | Resumen por profesor |
| POST 🛡 | `/api/admin/clases/reabrir` | `{profesorId, mes}` |
| GET/POST 🛡 | `/api/admin/tipos-clase` | Disciplinas |
| PUT 🛡 | `/api/admin/tipos-clase/:id` | `{nombre?, activo?}` |
| GET/POST 🛡 | `/api/admin/primas` | Primas |
| PUT 🛡 | `/api/admin/primas/:id` | `{nombre?, activa?, importe?, modo?: "POR_HORA"\|"POR_CLASE"}` |

`importe*` es `null` si no hay tarifa ni importes de prima cargados.

## Profesores 🛡
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/profesores` | Lista (incluye `tarifaHora`) |
| POST | `/api/admin/profesores` | Alta + envío del enlace de invitación |
| PUT | `/api/admin/profesores/:id` | `nombre, apellidos, tipoJornada, horasContrato, activo, telefono, horaRecordatorio, tarifaHora` |
| DELETE | `/api/admin/profesores/:id` | Baja lógica |

## Informes de jornada y firma
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/informe/:mes/:anio` | Informe mensual de jornada (`?profesorId=` para admin) |
| GET 🛡 | `/api/admin/planilla/:mes/:anio` | Planilla general |
| GET 🛡 | `/api/admin/informe-libres` | Ausencias |
| POST 🛡 | `/api/firma/enviar-email` | Envía el registro al profesor para firmar |
| POST | `/api/firma/subir-firmado` | Sube el PDF firmado |
| GET | `/api/firma/estado/:profesorId/:mes` | Estado de la firma |
| GET 🛡 | `/api/admin/firmas` | Firmas pendientes |

## Días libres
`POST /api/libres/solicitar` · `GET /api/libres/mis-solicitudes` · 🛡 `GET /api/admin/solicitudes` · 🛡 `POST /api/admin/solicitudes/:id/responder`

## Documentos (legajo)
`POST /api/admin/documentos` 🛡 (multipart) · `GET /api/documentos/mis-documentos` · `POST /api/documentos/:id/firmar` · 🛡 `GET /api/admin/documentos` · 🛡 `GET /api/admin/profesores/:id/documentos`

## Avisos y configuración
`GET /api/notificaciones` · `POST /api/notificaciones/leer-todas` · `POST /api/notificaciones/:id/leer` · 🛡 `GET|POST /api/admin/notificaciones` · 🛡 `DELETE /api/admin/notificaciones/:id` · `GET /api/config` · 🛡 `PUT /api/admin/config`

## WhatsApp (opcional, `WHATSAPP_ENABLED=true`)
🛡 `GET /api/whatsapp/status` · 🛡 `GET /api/whatsapp/qr` · 🛡 `POST /api/whatsapp/test`
