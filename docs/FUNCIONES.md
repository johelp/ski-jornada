# Funciones de la plataforma

Estado: ✅ disponible · 🟡 disponible con límites · 🗺 planificado (ver `ROADMAP.md`).

## 1. Acceso y cuentas

| Función | Estado | Detalle |
|---------|--------|---------|
| Ingreso por enlace mágico | ✅ | El usuario escribe su email y recibe un enlace de un solo uso (vence en 15 min). Sin contraseñas |
| Sesión persistente | ✅ | 90 días, se renueva al abrir la app. Cierre de sesión manual |
| Dos accesos: profesor y administración | ✅ | Desde la landing; el rol lo define la cuenta. El admin puede alternar a “modo empleado” |
| Alta de profesores (uno a uno) | ✅ | Admin → Usuarios. Envía el enlace de invitación por correo |
| Alta masiva por CSV | ✅ | `backend/prisma/import-profesores.js` (ver `MULTI-DESPLIEGUE.md`) |
| Baja lógica y reactivación | ✅ | Un usuario inactivo no puede entrar y conserva su historial |
| Código de 6 dígitos para iPhone | 🗺 | Para la PWA instalada en iOS |

## 2. Profesor

### Fichaje (control horario)
| Función | Estado | Detalle |
|---------|--------|---------|
| Fichar y desfichar por QR rotativo (TOTP 30 s) | ✅ | Escanea el QR de la zona con la cámara |
| Validación por GPS (radio configurable) | ✅ | Por zona: `TOTP`, `GPS`, `TOTP_GPS` o sin validación |
| Fichaje por NFC | 🟡 | Solo Chrome en Android |
| Hora del servidor | ✅ | Evita desfases del reloj del móvil |
| Cronómetro de jornada y recordatorio | ✅ | Notificación del navegador a la hora configurada; WhatsApp opcional |
| Historial y resumen diario | ✅ | |
| Informe mensual de jornada en PDF (RD 8/2019) | ✅ | Con opción de firma del registro |

### Clases y horas (liquidación)
| Función | Estado | Detalle |
|---------|--------|---------|
| Cargar clase | ✅ | Fecha, horas (múltiplos de 0,25), **disciplina**, **primas** (varias) y notas |
| Consultar y editar | ✅ | Vista mensual; edita o borra mientras el mes no esté confirmado |
| Ver su importe | ✅ | Si el admin cargó tarifa/primas: base + primas por clase y total |
| Confirmar el mes | ✅ | Bloquea la edición, congela tarifas y avisa a administración (aviso + correo) |
| Ver la revisión de administración | ✅ | Estado (aprobado, discrepancia, corrección, comentario), nota y marcas por clase |
| Informe mensual y económico en PDF | ✅ | Descargable en cualquier momento (borrador o confirmado) |

### Otros
| Función | Estado | Detalle |
|---------|--------|---------|
| Solicitar días libres | ✅ | Vacaciones, asuntos propios, enfermedad; ve la respuesta y la observación |
| Documentos (nóminas, contratos, certificados) | ✅ | Ve los que le sube administración, los abre y sube la versión firmada |
| Firma | 🟡 | Firma dibujada (no tiene validez legal) o subida del PDF firmado a mano/digital |
| Notificaciones | ✅ | Campana in-app + correo |
| Perfil, teléfono, hora de recordatorio | ✅ | |
| App instalable (PWA) | ✅ | Android (Chrome) e iPhone (Safari → Añadir a inicio) |

## 3. Administración

### Equipo
| Función | Estado | Detalle |
|---------|--------|---------|
| Gestión de profesores | ✅ | Alta, edición, baja, teléfono, jornada, **tarifa por hora** |
| Presencia en tiempo real | ✅ | Quién está fichado ahora |
| Avisos | ✅ | Mensajes individuales o a todo el equipo |
| Zonas de fichaje | ✅ | Alta, GPS, modo de validación, regenerar secreto, QR imprimible, grabar NFC |

### Clases, revisión y liquidación
| Función | Estado | Detalle |
|---------|--------|---------|
| Disciplinas configurables | ✅ | Alta, renombrar, activar/desactivar |
| Primas configurables | ✅ | Nombre, **importe** y modo (€/hora o €/clase), activar/desactivar |
| Resumen mensual por profesor | ✅ | Horas, clases, días, importe, estado de confirmación y de revisión; exporta CSV |
| Detalle día a día | ✅ | Para **cotejar con el planning de reservas** |
| Revisar y comentar | ✅ | **Aprobar**, **marcar discrepancia**, **pedir corrección** (reabre el mes) o **solo comentar**, con nota visible para el profesor |
| Anotar clases concretas | ✅ | Marca “OK” o “A revisar” + nota por clase |
| Frases rápidas | ✅ | “Horas correctas”, “Discrepancia con reservas”… |
| Reabrir un mes confirmado | ✅ | |
| Informe PDF por profesor | ✅ | Incluye la parte económica si hay tarifas |
| Importar el planning de reservas | 🗺 | Comparación automática planificado vs. cargado |

### Informes de jornada y ausencias
| Función | Estado | Detalle |
|---------|--------|---------|
| Registro de jornada por profesor (PDF) | ✅ | Cumple RD 8/2019 y art. 34.9 ET |
| Planilla general del mes | ✅ | Ordenable |
| Informe de ausencias | ✅ | |
| Aprobación de días libres | ✅ | Aprueba o rechaza con observación |

### Gestión documental (legajo)
| Función | Estado | Detalle |
|---------|--------|---------|
| Subir documentos por profesor | ✅ | PDF hasta 20 MB: nómina, contrato, certificado u otro; con mes opcional. Avisa por correo |
| Ver pendientes de firma / firmados | ✅ | Filtros por estado; descarga del original y del firmado |
| Acceso protegido a los archivos | ✅ | Solo el administrador y el profesor dueño, con sesión |
| Carga masiva y archivado en Drive | 🗺 | Ver `PILOTO-SNOWMOTION.md` |
| Firma electrónica con validez legal | 🗺 | Autofirma / ViDeSigner |

### Configuración
| Función | Estado | Detalle |
|---------|--------|---------|
| Datos de la escuela y email de avisos | ✅ | Nombre, CIF, dirección, color |
| Marca de la landing por despliegue | ✅ | Variables `VITE_*` (ver `MULTI-DESPLIEGUE.md`) |
| WhatsApp (recordatorios) | 🟡 | Opcional, requiere instalar Baileys |

## 4. Transversal

- **Seguridad:** enlaces de un solo uso con hash en base, JWT, rate limit, CORS por despliegue, archivos protegidos, cada profesor solo ve sus datos.
- **Cálculo de importes:** `horas × tarifa del profesor + Σ primas` (por hora o por clase), congelado al confirmar.
- **Multi-despliegue:** un backend, una base y un frontend por cliente, con plantillas de variables.
- **Pruebas:** `node backend/scripts/smoke.js` ejecuta 49 verificaciones de extremo a extremo (ver `PRUEBAS.md`).
