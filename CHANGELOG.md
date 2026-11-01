# Cambios

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Fechas AAAA-MM-DD.

## [Sin publicar]

### Añadido
- **Carga rápida del día** para colaboradores: colaborador, dimos/nos dieron, horas con botones, referencia y Enter; recuerda la última elección y lista lo cargado ese día.
- **Colaboradores y subcontratas:** cuenta de horas con escuelas y autónomos (dadas y recibidas por día, valor hora del trato, saldo en horas y euros, pagos y compensaciones, extracto PDF, estadísticas y aviso en el panel). Portal opcional para el colaborador, que acepta o pide revisar sus horas, sin acceso a nada más. Ver `docs/COLABORADORES.md`.
- **Módulos apagables por administración** (*Config → Módulos*): clases, días libres, documentos, comparativa, integraciones, avisos y colaboradores; se ocultan del menú y del panel, la API responde 404 y los datos se conservan.
- **Registro de jornada con correcciones trazables:** administración añade, modifica o anula fichajes con motivo obligatorio; se conserva el valor original, quién y cuándo (`CorreccionFichaje`); el fichaje anulado no se borra ni cuenta en los informes; el trabajador recibe un aviso; entra en el registro de actividad y en la exportación RGPD.
- **Documentación legal:** `docs/CUMPLIMIENTO-REGISTRO-JORNADA.md` y plantillas en `docs/legal/` (contrato de encargo, información al personal, política interna de fichaje).
- **WhatsApp activable desde la administración:** botón «Generar QR» (Integraciones → WhatsApp) que arranca el servidor Baileys, estado en vivo, desactivar y desvincular; avisos solo a quien los activa en su perfil; cola con pausas y tope diario; la sesión persiste en el volumen.
- **Integraciones:** pestaña *Ideas* con casos de uso, ejemplo de uso de la clave, eventos `solicitud.creada` y `solicitud.respondida`, protección SSRF en webhooks, validación de fechas en solicitudes y textos en español de España.
- **Acceso desde la app instalada:** código de 6 dígitos en el correo y en la pantalla de acceso (HMAC, 5 intentos, límite por email) para entrar sin salir de la app en iPhone.
- **Sesión persistente:** renovación al volver a primer plano, copia en IndexedDB, almacenamiento persistente, y un fallo temporal de la base ya no cierra la sesión (503 en lugar de 401).
- **Panel de administración práctico:** `GET /api/admin/resumen` y nuevo inicio con lo pendiente (solicitudes por estado con aprobación directa, horas por revisar, discrepancias, documentos sin firmar, próximas ausencias, invitados sin entrar).
- **RGPD:** información de privacidad y contrato de encargo aceptables en la app, con constancia versionada.
- **Seed completo** de datos de ejemplo, **auditoría de seguridad**, estimador de **dimensionamiento**, copias diarias comprimidas y manual de implementación y guías de uso.

### Corregido
- El seed de demostración fallaba si existían correcciones de fichajes (restricción de clave foránea).
- Cabecera tapada por el reloj y la batería en la app instalada (área segura superior).
- Seguridad: PDF falso servido como HTML, zona horaria de los informes, datos ficticios en el PDF legal, límite compartido en una misma wifi, inyección de fórmulas en CSV, HTML sin escapar en correos, mes/año inválidos (500).

## [1.0.0] — 2026-10-30 · MVP listo para el piloto

### Producto
- **Profesor:** fichaje (QR rotativo, GPS, NFC); carga de clases con disciplina y primas; totales del mes y de la temporada; informe mensual y económico en PDF; confirmación del mes; días libres; exportar mis datos.
- **Administración:** equipo (importar lista, invitaciones, estados, roles); disciplinas, primas y tarifas; revisión de horas (aprobar, discrepancia, corrección, notas por clase); comparativa con el resumen de instructores del sistema de reservas; importación de planning y cotejo por día; integraciones (claves de API, webhooks); informes de jornada; registro de actividad.
- **Acceso:** por invitación y enlace al correo, sin contraseñas y sin registro público; cuenta de administración de empresa; baja con revocación inmediata.
- **App:** PWA a pantalla completa con pantalla de apertura animada, atajos y aviso de instalación; landing con pantallas de ejemplo.

### Operación y seguridad
- Prueba de humo (89 comprobaciones) y CI en GitHub Actions.
- Arranque que se niega a funcionar con configuración insegura; chequeo de salud con base de datos; cierre ordenado; manejo global de errores.
- Copias de seguridad diarias automáticas y descarga manual; cabeceras de seguridad (CSP en modo informe).
- Dependencias sin vulnerabilidades conocidas (`nodemailer` 10, `express` 4.22).
- Plantillas y guía de multi-despliegue; documentación completa en `docs/`.

### Pendiente conocido
Región UE para datos reales, doble verificación de administración, código de 6 dígitos para iPhone, rediseño de algunas pantallas heredadas de administración. Ver `docs/ROADMAP.md` y `docs/CHECKLIST-PRODUCCION.md`.
