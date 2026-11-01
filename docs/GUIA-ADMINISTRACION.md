# Guía de administración

Para la persona o el equipo que administra la plataforma en la escuela. Una guía de consulta: el proceso completo de implantación está en `MANUAL-IMPLEMENTACION.md`.

## 1. La cuenta de administración

- Es la cuenta de la escuela y **puede ser de empresa** (`administracion@tuescuela.com`, sin apellidos). La **cuenta principal** es la única que crea otros administradores y cambia roles.
- Protege el buzón con **doble verificación** y limita quién lo usa: quien controla ese correo controla la cuenta.
- Si varias personas administran, crea **una cuenta por persona** (así el registro de actividad dice quién hizo cada cosa).
- Al entrar por primera vez aceptas, en nombre de la escuela, el **contrato de encargo** y confirmas la **información de privacidad**.

## 2. Configuración inicial (una vez)

| Dónde | Qué |
|-------|-----|
| **Config** | Nombre legal, CIF, dirección, teléfono y email de contacto → *salen impresos en los registros de jornada* |
| **Clases → Disciplinas y primas** | Disciplinas y primas con importe y modo (€/hora o €/clase) |
| **Usuarios → Editar** | Tarifa por hora de cada profesor |
| **Zonas** | Zonas de fichaje, modo (QR, GPS, ambos o ninguno), QR imprimible |

## 3. El equipo: invitar y gestionar

1. **Usuarios → Importar lista:** pega o sube un CSV (`nombre, apellidos, email`; opcional teléfono, jornada, horas, tarifa). Marca *Enviar la invitación ahora* o hazlo más tarde.
2. Estados: **Invitado · sin entrar** → **Activo** (entró) → **Inactivo** (baja).
3. **Reenviar invitación** a quien no entró; **Invitar a los pendientes** de una vez.
4. **Baja:** *Editar → Usuario activo* (desmarcar). Pierde el acceso al instante y conserva su historial.
5. Solo entran las personas **que están en la lista**. Nadie puede registrarse por su cuenta.
6. **Registro de actividad** (*Usuarios → Actividad de administración*): altas, bajas, roles, importaciones, revisiones.

## 4. Cada mes: revisar y liquidar

1. **Clases → Horas por profesor:** elige el mes. Verás horas, importe, **estado** (confirmado o no) y **revisión**.
2. Entra en cada profesor (**Ver**): detalle día a día.
3. **Revisa:** *Aprobar* · *Marcar discrepancia* · *Pedir corrección* (reabre el mes) · *Solo comentar*, con una **nota** que verá el profesor. También puedes marcar **cada clase** como *OK* o *Revisar* y anotarla.
4. **Compara con las reservas:**
   - *Clases → Comparar con reservas:* sube el **resumen mensual por instructor** (CSV del sistema de reservas). El mes se detecta por el nombre del archivo.
   - Revisa quién **coincide**, quién difiere en **horas** o **importe**, los **sin vincular** (elige su profesor una vez y se recuerda) y las **horas «NO ASIGNADO»** (reservas sin instructor).
   - Si importaste el **planning**, el detalle de cada profesor muestra *planificado vs cargado* por día.
5. **Cierra:** exporta el resumen (**CSV**) y los **PDF** por profesor para nómina; usa solo meses **aprobados**.
6. Si hace falta corregir un mes ya confirmado: **Reabrir mes**.

## 5. Informes de jornada (registro horario)

*Informes*: **registro de jornada** por profesor (PDF oficial RD 8/2019), **planilla** mensual (exportable), **ausencias**. Conservar 4 años. Requiere los datos de la escuela completos en *Config*.

**Corregir un fichaje** (olvido o error): *Informes → Registro individual →* elige la persona y el mes → **Corregir fichajes de este mes**. Puedes **añadir**, **editar** o **anular** un fichaje, siempre con el **motivo**. Nada se borra: queda el valor original, quién lo cambió y cuándo, y la persona recibe un aviso. Úsalo como excepción, no como norma. Marco legal y decisiones pendientes: `CUMPLIMIENTO-REGISTRO-JORNADA.md`.

## 6. Días libres, avisos y documentos

- **Solicitudes:** aprueba o rechaza con observación. Con **Editar** corriges las fechas, el motivo o el comentario de cualquier solicitud, **aunque ya esté respondida** (p. ej. un cambio de fechas ya aprobado) y, si hace falta, **Guardar y volver a pendiente**. El empleado recibe un aviso y queda en el registro de actividad. Si el empleado cambia o retira una solicitud pendiente, recibes un aviso.
- **Avisos:** a una persona o a todo el equipo (campana + correo).
- **Documentos** (si el módulo está activo): sube nóminas, contratos y certificados por profesor; ve quién firmó. Solo tú y la persona dueña los veis.

## 6b. Colaboradores y subcontratas (opcional)

Cuenta de horas con escuelas y autónomos que cubren horas o a los que prestamos profesores. Guía completa: `COLABORADORES.md`.

1. **Colaboradores → + Nuevo:** nombre, tipo, **valor hora** del trato (correo opcional).
2. **Cada día:** *Colaboradores → ⚡ Cargar el día*: colaborador, *dimos* o *nos dieron*, horas con un toque y una referencia; Enter y a la siguiente. Se repasa el planning al final del día y se carga todo de seguido.
3. **Cargar horas** *dadas* (nos deben) o *recibidas* (les debemos), por día. El saldo (horas y euros) se calcula solo: 5 h dadas − 2 recibidas = **3 h a favor = 90 €** a 30 €/h.
4. **Saldar** con un **pago** o una **compensación**, total o parcial.
5. **Imprimir extracto** (PDF por día, con liquidaciones y saldo) para enviárselo o liquidar.
6. **Acceso al portal** (opcional, con correo): el colaborador ve su cuenta y **acepta o pide revisión**; lo que está en revisión no cuenta en el saldo hasta aclararlo.

## 6c. Apagar módulos que no usas

*Config → Módulos:* desactiva clases, días libres, documentos, comparativa, integraciones, avisos o colaboradores. Desaparecen del menú y del panel; los datos se conservan y puedes reactivarlos.

## 7. Integraciones (opcional)

*Integraciones*: **claves de API** (lectura, económico, planning), **webhooks** firmados y **importación del planning** por CSV. Una clave por sistema; se muestra **una sola vez**.

## 8. Seguridad y datos

- Copia de la base: la plataforma hace una **diaria**; descarga una **semanal** fuera del servidor (cuenta principal: `GET /api/admin/backup/descargar`) y guárdala cifrada.
- **Derechos de los empleados:** cada profesor puede *Exportar mis datos*; tú puedes exportar los de cualquiera. La supresión definitiva respeta el plazo de 4 años del registro de jornada (ver `RGPD.md`).
- Quién recibió la **información de privacidad**: *Usuarios → aceptaciones*.
- Ante una brecha o una cuenta comprometida: avisa a quien opera la instancia (`OPERACION.md`) y cambia las claves afectadas.

## 9. Preguntas frecuentes

| Pregunta | Respuesta |
|----------|-----------|
| Un profesor cambió de email | Se da de baja la cuenta antigua y se da de alta la nueva |
| ¿Puedo ver las horas aprobadas de todo el mes? | *Clases → Horas por profesor* (columna *Revisión*) y exportar a CSV |
| El profesor no puede editar una clase | El mes está confirmado: *Reabrir mes* o *Pedir corrección* |
| ¿Cómo sé quién no ha entrado todavía? | *Usuarios*: estado «Invitado · sin entrar» |
| La comparativa no reconoce un nombre | Elige el profesor en «Sin vincular»; se recuerda |
| ¿Se pueden usar nóminas en la plataforma? | Sí si el módulo está activo; en el piloto de Snowmotion se firman fuera |
