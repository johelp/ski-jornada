# Contrato de encargo del tratamiento de datos personales

> **Plantilla.** Prepara el art. 28 del RGPD para el piloto. **No es asesoramiento jurídico:** debe revisarla el asesor del responsable y del encargado antes de firmarla. Los textos entre `[corchetes]` se completan por cliente. Complementa `docs/RGPD.md` (apartados 2, 4 y 9).

En `[lugar]`, a `[fecha]`.

## Partes

**Responsable del tratamiento:** `[Razón social de la escuela]`, CIF `[CIF]`, domicilio en `[dirección]`, representada por `[nombre y cargo]` (en adelante, **el Responsable**).

**Encargado del tratamiento:** `[Razón social del proveedor]`, CIF `[CIF]`, domicilio en `[dirección]`, representada por `[nombre y cargo]` (en adelante, **el Encargado**).

## Antecedentes

1. El Responsable utiliza la plataforma **Ski Jornada** (registro de jornada, carga y revisión de clases, informes) para gestionar a su personal docente.
2. Para prestar ese servicio el Encargado accede a datos personales del personal del Responsable. Ambas partes formalizan este contrato conforme al art. 28 del Reglamento (UE) 2016/679 (RGPD) y a la LOPDGDD.

## 1. Objeto y duración

El Encargado tratará los datos personales necesarios para prestar la plataforma Ski Jornada al Responsable, durante la vigencia del servicio contratado (`[contrato o presupuesto de referencia]`).

## 2. Naturaleza, finalidad y datos

| Concepto | Detalle |
|----------|---------|
| **Naturaleza** | Alojamiento, almacenamiento, consulta, cálculo de horas e importes, generación de informes, envío de avisos |
| **Finalidad** | Cumplir la obligación de registro de jornada, gestionar y liquidar las horas y clases del personal, comunicarse con él |
| **Categorías de datos** | Identificación y contacto (nombre, apellidos, correo, teléfono); datos laborales (jornada, horas contratadas, tarifa); registro de jornada (hora, tipo y zona del fichaje y, si la zona usa GPS, coordenadas y distancia **solo en el instante de fichar**); clases impartidas, primas, horas e importes; solicitudes de días libres; notas de revisión; avisos; registro de correcciones de fichajes; aceptaciones legales |
| **Interesados** | Personal docente y de administración del Responsable |
| **Datos excluidos** | Categorías especiales (art. 9 RGPD). Las nóminas no se tratan salvo que se active el módulo de documentos y se amplíe este anexo |

## 3. Obligaciones del Encargado

1. **Instrucciones.** Tratar los datos solo siguiendo instrucciones documentadas del Responsable, incluso respecto de transferencias internacionales. Si considera que una instrucción infringe la normativa, se lo comunicará.
2. **Confidencialidad.** El personal del Encargado con acceso está obligado a guardar secreto, también tras terminar el servicio.
3. **Seguridad (art. 32).** Aplicar como mínimo las medidas del anexo I.
4. **Subencargados.** El Responsable autoriza con carácter general los del anexo II. El Encargado comunicará cualquier alta o sustitución con `[30]` días de antelación; el Responsable podrá oponerse por causa justificada. Impondrá a cada subencargado obligaciones equivalentes y responderá ante el Responsable.
5. **Transferencias internacionales.** No se transferirán datos fuera del EEE salvo con garantías adecuadas (decisión de adecuación o cláusulas contractuales tipo). El alojamiento de la base de datos será en la UE.
6. **Derechos de los interesados.** Asistir al Responsable, con medidas técnicas y organizativas, para atender acceso, rectificación, supresión, oposición, limitación y portabilidad. La plataforma incluye *Exportar mis datos*. Si un interesado se dirige al Encargado, este lo trasladará al Responsable en `[3]` días hábiles.
7. **Brechas de seguridad.** Notificar al Responsable **sin dilación y como máximo en 48 horas** desde que la detecte, con la información disponible (naturaleza, datos y personas afectadas, consecuencias probables y medidas adoptadas). La notificación a la AEPD y a los afectados corresponde al Responsable.
8. **Evaluaciones de impacto y consultas previas.** Asistir al Responsable en lo que le corresponda.
9. **Registro.** Llevar el registro de actividades de tratamiento como encargado (art. 30.2).
10. **Auditoría.** Facilitar la información necesaria para demostrar el cumplimiento y permitir auditorías razonables, con preaviso de `[15]` días y sin afectar al servicio.

## 4. Obligaciones del Responsable

1. Tener base de legitimación para los datos que introduce y haber informado a su personal (art. 13), en especial del registro de jornada y, si se usa, del GPS (ver `INFORMACION-PRIVACIDAD-PERSONAL.md`).
2. Cumplir la normativa laboral aplicable al registro de jornada, incluida la consulta a la representación de los trabajadores (ver `docs/CUMPLIMIENTO-REGISTRO-JORNADA.md`).
3. Designar a las personas con rol de administración y proteger sus cuentas de correo.
4. Supervisar el tratamiento y atender a los interesados.

## 5. Conservación y fin del servicio

- El **registro de jornada se conserva 4 años** (art. 34.9 ET). El resto de datos, mientras dure la relación laboral y los plazos legales.
- Al terminar el servicio, y a elección del Responsable, el Encargado **devolverá** los datos (exportación completa) y/o los **suprimirá** en `[30]` días, y certificará el borrado por escrito. Podrá conservarlos bloqueados solo mientras la ley se lo exija.
- Las copias de seguridad se eliminan por rotación en un plazo máximo de `[35]` días.

## 6. Responsabilidad

Cada parte responde conforme al art. 82 RGPD. `[Limitaciones o cláusula de indemnidad, a definir con asesor.]`

## 7. Legislación y jurisdicción

Legislación española. Tribunales de `[ciudad]`.

Firmado en dos ejemplares.

| El Responsable | El Encargado |
|----------------|--------------|
| `[nombre, cargo]` | `[nombre, cargo]` |

---

## Anexo I. Medidas de seguridad

Detalladas y verificables en `docs/RGPD.md` (apartado 4) y `docs/AUDITORIA-SEGURIDAD.md`. Resumen:

- Acceso solo por enlace de un solo uso + código de 6 dígitos al correo de una persona **dada de alta por administración**; sesiones con caducidad y baja inmediata.
- Roles (profesor/administración) con permisos separados; cuenta principal para cambios de rol; **registro de actividad** de administración.
- Cifrado en tránsito (HTTPS) y copia diaria de la base, con descarga semanal externa.
- Límite de intentos, cabeceras de seguridad, protección frente a peticiones a redes internas en los webhooks, claves de API con ámbitos y revocables.
- Aislamiento: **un despliegue y una base de datos por cliente**.
- Trazabilidad del registro de jornada: toda corrección conserva el valor original, quién, cuándo y por qué.
- Mensajería WhatsApp (si se activa): solo para quien lo acepta, con número dedicado.

## Anexo II. Subencargados autorizados

| Subencargado | Servicio | Datos | Ubicación |
|--------------|----------|-------|-----------|
| Railway | API y base de datos | Todos | UE (`europe-west4`) |
| Cloudflare | Frontend y DNS | Tráfico y metadatos | Red global de distribución |
| Resend | Correo transaccional | Correo, nombre y texto de los avisos | `[verificar región]` |
| Google (solo si se activa Drive) | Almacenamiento de documentos | Documentos | `[verificar]` |
| WhatsApp / Meta (solo si se activa) | Avisos por mensaje | Teléfono y texto del aviso | Fuera de control del Encargado; solo con consentimiento del interesado |

Cada subencargado tiene su acuerdo de tratamiento (DPA) revisado antes de la puesta en producción.
