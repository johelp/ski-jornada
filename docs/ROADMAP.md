# Roadmap y deuda técnica

## Hecho (MVP)
- Fichaje por QR TOTP / GPS / NFC con hora sincronizada del servidor
- Carga de clases con disciplinas y primas configurables, importes, confirmación mensual con tarifas congeladas
- Informe PDF del profesor (con parte económica) y vista de admin para cotejar con el planning
- Alta de profesores por el admin con invitación por enlace mágico; sesión de 90 días renovable
- Informes de jornada (RD 8/2019), días libres, legajo de documentos, avisos
- Landing pública (`frontend/src/Landing.jsx` + `Landing.css`) con accesos separados para profesores y administración; el rol lo define la cuenta del email
- PWA instalable; repo ordenado; configuración de Railway y Cloudflare Pages

## Próximo (prioridad alta)
1. **Revisión UX/UI** de toda la app (mobile first): jerarquía visual, contraste de inputs, formulario de carga de clases con 1 mano, estados vacíos, accesibilidad. Probar la PWA en iOS y Android reales.
2. **Código de 6 dígitos** además del enlace mágico, por el problema de iOS (la PWA instalada no comparte almacenamiento con Safari).
3. **Verificar el envío de correos en producción** (Resend + DNS) y plantilla visual de los correos.
4. **Backups automáticos** de `prod.db` y `uploads`.
5. **Proteger `/uploads`**: hoy se sirve estático sin autenticación (nombres aleatorios). Pasar a endpoints autenticados o URLs firmadas.

## Deuda técnica
- `frontend/src/App.jsx` (~2.300 líneas): partir en vistas (`VistaFichar`, `VistaInformes`, `VistaUsuarios`, `VistaZonas`, `VistaDocumentos`, `VistaPerfil`…) y mover estado a hooks. Considerar `react-router` para URLs reales y botón “atrás”.
- `backend/index.js` (~1.500 líneas): separar en routers (`auth`, `fichaje`, `clases`, `admin`, `documentos`) y servicios (`email`, `informes`).
- **Sin tests.** Empezar por el cálculo de importes (`construirInformeClases`), canje del magic link y permisos de admin.
- Eliminar código muerto: contraseña/`cambiar-password`, correo de bienvenida con contraseña.
- Service worker de desarrollo cachea `/src/*` (errores “fetching the script” en dev): no registrarlo fuera de producción.
- CSS monolítico (`App.css`): extraer tokens (colores, espaciados) y componentes.
- Dependencias con vulnerabilidades reportadas por `npm audit` en el backend: revisar.

## Ideas (valor para el negocio)
- **Importar planning/reservas** (CSV/API del gestor de reservas) y comparar automáticamente horas cargadas vs. planificadas, marcando diferencias.
- **Envío automático a fin de mes** del informe al admin y recordatorio a quienes no confirmaron.
- Liquidación: exportar a Excel/A3nom/Sage; informe consolidado por mes con totales por disciplina y prima.
- Tarifas por titulación/nivel y por disciplina (hoy la tarifa es una por profesor).
- Multi-escuela; registro de auditoría inmutable; firma electrónica legalmente válida (Autofirma/ViDeSigner); notificaciones push en iOS (Safari 16.4+ con VAPID).
- Migrar a Postgres si crece el uso o se necesita más de una réplica.
