# RGPD y protección de datos

> **Aviso:** este documento es una base técnica y organizativa preparada para el piloto. **No es asesoramiento jurídico.** Debe ser revisado y validado por el asesor legal o el delegado de protección de datos del cliente antes de la puesta en producción. Los textos entre `[corchetes]` se completan por cliente.

## 0. Alcance del piloto (decisión vigente)

- Por ahora **las nóminas se firman y se cargan en una plataforma externa**, no en Ski Jornada. El módulo de documentos se puede **apagar por despliegue** con `DOCUMENTOS_HABILITADOS=false`: se ocultan la sección y los endpoints (404) y la plataforma **no trata nóminas**.
- Datos que sí trata: identidad y contacto del profesor, registro de jornada (entradas/salidas con zona y, según configuración, ubicación GPS en el momento del fichaje), solicitudes de días libres, clases impartidas, horas, primas y tarifa por hora, notas de revisión y notificaciones.
- Si más adelante se activa el módulo de documentos, se amplía el registro de tratamientos (apartado 2) con nóminas y contratos.

## 1. Roles

| Rol | Quién |
|-----|-------|
| **Responsable del tratamiento** | La escuela cliente (p. ej. Snowmotion): decide fines y medios |
| **Encargado del tratamiento** | Proveedor de la plataforma (`[razón social del proveedor]`): trata los datos por cuenta del responsable (ver modelo de contrato, apartado 5) |
| **Subencargados** | Railway (alojamiento y base de datos), Cloudflare (frontend y DNS), Resend (correo transaccional); Google si se integra Drive |
| **Interesados** | Profesores/empleados |

Cada cliente tiene su **propio despliegue y base de datos** (ver `MULTI-DESPLIEGUE.md`): los datos de un cliente no se mezclan con los de otro.

## 2. Registro de actividades de tratamiento (modelo, art. 30)

**Tratamiento 1 — Control horario**
- Finalidad: cumplir la obligación legal de registro de jornada (art. 34.9 ET; RD-ley 8/2019).
- Base jurídica: obligación legal (art. 6.1.c RGPD).
- Datos: nombre, email, fecha/hora de entrada y salida, zona, distancia a la zona y coordenadas GPS **solo en el momento del fichaje** (si la zona usa GPS).
- Destinatarios: administración del responsable; Inspección de Trabajo si la requiere.
- Conservación: **4 años** (art. 34.9 ET). Después, supresión (`backend/scripts/purgar.js`).

**Tratamiento 2 — Gestión de clases y liquidación de horas**
- Finalidad: registrar las clases impartidas, calcular y verificar horas y primas, preparar la liquidación.
- Base jurídica: ejecución del contrato de trabajo (art. 6.1.b).
- Datos: fechas, horas, disciplina, primas, notas, tarifa por hora, importes, revisiones y comentarios de administración.
- Destinatarios: administración, gestoría laboral `[si aplica]`.
- Conservación: durante la relación laboral y `[plazo fiscal/laboral: normalmente 4–6 años]`.

**Tratamiento 3 — Gestión de cuentas y comunicaciones**
- Finalidad: acceso a la plataforma (enlace por correo), avisos y notificaciones.
- Base jurídica: ejecución del contrato (6.1.b) e interés legítimo en la seguridad del servicio (6.1.f).
- Datos: email, teléfono (opcional), registros de acceso.
- Conservación: mientras la cuenta esté activa; enlaces de acceso caducan a los 15 min.

**Tratamiento 4 — Solicitudes de días libres**
- Finalidad: gestionar vacaciones, asuntos propios y ausencias.
- Base jurídica: contrato (6.1.b). Si el motivo es *enfermedad*, puede revelar datos de salud: **no pedir diagnóstico**, solo el motivo genérico, y aplicar el art. 9.2.b RGPD (obligaciones laborales).
- Conservación: durante la relación y `[plazo]`.

**Tratamiento 5 (opcional) — Documentos laborales** *(solo si se activa el módulo)*: nóminas, contratos y certificados. Base: contrato/obligación legal. Conservación: `[plazo]`.

## 3. Información al interesado (art. 13) — texto para profesores

> **Política de privacidad para el personal**
>
> **Responsable:** `[escuela, CIF, dirección, email de contacto/DPO]`.
> **Qué datos tratamos:** tus datos de identificación y contacto, tu registro de jornada (hora y zona de entrada y salida y, si la zona lo requiere, tu ubicación en el momento de fichar), las clases que cargas, tus horas y primas, tu tarifa por hora, tus solicitudes de días libres y los comentarios de administración sobre tus horas.
> **Para qué:** cumplir la obligación legal de registro horario, gestionar tu trabajo y la liquidación de horas, y comunicarnos contigo.
> **Base legal:** obligación legal y ejecución de tu contrato de trabajo.
> **Ubicación:** solo se registra en el instante de fichar; **no hacemos seguimiento continuo**.
> **Destinatarios:** administración de la escuela, gestoría laboral y las administraciones públicas cuando la ley lo exija. Proveedores tecnológicos que actúan como encargados (alojamiento, correo).
> **Conservación:** el registro de jornada 4 años; el resto durante la relación laboral y los plazos legales.
> **Tus derechos:** acceso, rectificación, supresión, oposición, limitación y portabilidad, escribiendo a `[email]`. Puedes descargar tus datos desde la app (**Perfil → Exportar mis datos**). Si crees que no tratamos bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).

*(La pantalla pública de privacidad en la app está pendiente; ver `ALCANCE-MVP.md`. Mientras tanto, entregar este texto al personal y publicarlo en el enlace de la landing.)*

## 4. Medidas de seguridad (art. 32) y dónde están en el producto

| Medida | Estado |
|--------|--------|
| Cifrado en tránsito (HTTPS) | ✅ Railway y Cloudflare |
| Acceso sin contraseñas, enlace de un solo uso (hash en base, 15 min) | ✅ |
| Sesiones con caducidad (90 días, renovables), tokens firmados | ✅ |
| Limitación de intentos (login y enlaces) | ✅ |
| Principio de mínimo privilegio: el profesor solo ve lo suyo; administración ve su escuela | ✅ |
| Archivos laborales solo con sesión y comprobando propiedad | ✅ |
| API externa con keys por alcance, hash en base, sin JWT | ✅ |
| Webhooks firmados (HMAC), sin importes | ✅ |
| Aislamiento por cliente (despliegue y base propios) | ✅ |
| Exportación de datos del titular (acceso/portabilidad) | ✅ `GET /api/auth/me/exportar` y admin `GET /api/admin/profesores/:id/exportar` |
| Baja lógica de cuentas y purga por plazo de conservación | ✅ `backend/scripts/purgar.js` (simulación por defecto; `--aplicar` borra) |
| Interruptor del módulo de documentos | ✅ `DOCUMENTOS_HABILITADOS=false` |
| Región de alojamiento en la UE | ⚠ **Pendiente de configurar**: el servicio actual de pruebas está en `us-west2`. Para clientes con datos reales crear el servicio y el volumen en `europe-west4` |
| Copias de seguridad | 🟡 Automáticas (diarias, 14 días) y descarga manual por la cuenta principal (`OPERACION.md`). Falta guardar copias cifradas fuera del servidor y probar la restauración |
| Registro de actividad de administración (altas, bajas, roles, importaciones, invitaciones, revisiones) | ✅ `GET /api/admin/auditoria` (quién, qué, cuándo). No registra accesos de lectura |
| Baja con revocación inmediata de la sesión | ✅ |
| Solo entra quien está en la lista de la escuela; sin registro público | ✅ (`ACCESO-Y-ALTAS.md`) |
| Cifrado en reposo del volumen | ⚠ Depende del proveedor; verificar |
| Doble factor para administración | ⚠ No implementado; el acceso depende del correo del administrador (proteger su cuenta con 2FA) |

Medidas organizativas recomendadas: pocos administradores, cuentas nominales, formación breve del personal de administración, política de puestos de trabajo seguros, revisión anual de accesos.

## 5. Contrato de encargo del tratamiento (modelo, art. 28)

Entre **`[Escuela]`** (responsable) y **`[Proveedor]`** (encargado). Cláusulas mínimas:
1. **Objeto y duración:** prestación de la plataforma Ski Jornada durante la vigencia del servicio.
2. **Naturaleza y finalidad:** tratamiento de los datos descritos en el apartado 2 para control horario y gestión de horas.
3. **Instrucciones:** el encargado solo trata los datos según instrucciones documentadas del responsable.
4. **Confidencialidad:** el personal del encargado con acceso está obligado a guardar secreto.
5. **Seguridad:** medidas del apartado 4 como mínimo.
6. **Subencargados:** autorizados Railway, Cloudflare y Resend (y Google si se activa Drive). El encargado comunicará cambios con `[30]` días de antelación y mantendrá contratos equivalentes con ellos.
7. **Transferencias internacionales:** solo dentro del EEE o con garantías adecuadas (cláusulas contractuales tipo). Alojar en la UE.
8. **Asistencia al responsable:** en el ejercicio de derechos, evaluaciones de impacto y brechas.
9. **Brechas:** el encargado avisa al responsable **sin dilación y en máximo 48 h** desde que la detecte.
10. **Fin del servicio:** devolución o supresión de los datos (exportación) y certificación de borrado a los `[30]` días.
11. **Auditoría:** el encargado facilita la información necesaria y permite auditorías razonables.

## 6. Derechos de los interesados — procedimiento

| Derecho | Cómo se atiende |
|---------|-----------------|
| Acceso / portabilidad | El profesor usa **Exportar mis datos** (JSON); o administración con `GET /api/admin/profesores/:id/exportar` |
| Rectificación | El profesor corrige perfil y clases; administración edita datos del profesor |
| Supresión | Baja lógica inmediata. La supresión definitiva respeta el plazo de **4 años del registro de jornada**; vencido, `purgar.js --aplicar`. Antes del plazo se bloquea el uso (limitación) |
| Oposición / limitación | Baja lógica (la cuenta no puede entrar) |
| Plazo de respuesta | 1 mes (prorrogable 2 más), art. 12 |

Registrar cada solicitud (fecha, derecho, respuesta) en un cuaderno del responsable.

## 7. Brechas de seguridad — protocolo

1. **Detectar y contener:** desactivar API keys y webhooks afectados, revocar sesiones cambiando `JWT_SECRET` (cierra todas las sesiones), restringir acceso.
2. **Evaluar:** qué datos, cuántas personas, riesgo para sus derechos.
3. **Notificar** a la AEPD en **72 h** si hay riesgo (el encargado avisa al responsable en 48 h), y a los afectados si el riesgo es alto.
4. **Documentar** en el registro de incidentes (hechos, efectos, medidas).
5. **Corregir y revisar** el origen.

## 8. Geolocalización: evaluación previa

El uso de GPS para fichar es el punto más sensible del tratamiento (guías de la AEPD sobre control de la actividad laboral).
- **Necesidad y proporcionalidad:** solo comprobar que el profesor está en el lugar de trabajo **al fichar**; no hay seguimiento continuo ni histórico de rutas.
- **Minimización:** se guarda la distancia a la zona y las coordenadas del instante del fichaje. Valorar guardar solo la distancia y el resultado de validación (mejora pendiente).
- **Alternativas menos intrusivas:** QR rotativo sin GPS (modo `TOTP`) o NFC; configurable **por zona**. Usar GPS únicamente donde el QR no baste.
- **Transparencia:** informar por escrito al personal (apartado 3) antes de activar GPS y consultar a la representación legal de los trabajadores si existe.
- **Conclusión del modelo:** con QR/NFC como opción principal y GPS limitado, el riesgo es bajo/medio. Si el cliente activa GPS de forma generalizada, realizar una **EIPD** formal.

## 9. Subencargados

| Proveedor | Función | Datos | Ubicación | Documentación |
|-----------|---------|-------|-----------|---------------|
| Railway | API y base de datos | Todos | Elegir `europe-west4` | Acuerdo de tratamiento de Railway |
| Cloudflare | Frontend, DNS | Tráfico y metadatos | Global (red de distribución) | DPA de Cloudflare |
| Resend | Correo transaccional | Email, nombre y texto de los avisos | Verificar región | DPA de Resend |
| Meta / WhatsApp (opcional) | Avisos por WhatsApp, solo a quien los activó | Nombre, teléfono y texto del aviso | Global | Condiciones de WhatsApp; el uso con Baileys no es oficial: usar número dedicado |
| Google (opcional) | Drive | Documentos/informes archivados | Workspace del cliente | Contrato Workspace del cliente |

## 10. Lista de verificación antes del primer día real

- [ ] Alojamiento en la UE (servicio y volumen).
- [ ] Contrato de encargo firmado con el cliente y DPA revisados con los subencargados.
- [ ] Política de privacidad entregada al personal; consulta a la representación legal si procede.
- [ ] Decisión sobre GPS (por zona) documentada.
- [ ] `DOCUMENTOS_HABILITADOS=false` si las nóminas siguen fuera.
- [ ] Copias de seguridad configuradas y restauración probada.
- [ ] Administradores con 2FA en su correo.
- [ ] Registro de actividades y registro de incidentes del responsable creados.
- [ ] Plazos de conservación acordados y tarea anual de `purgar.js`.
