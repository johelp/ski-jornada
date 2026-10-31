# Cambios

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Fechas AAAA-MM-DD.

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
