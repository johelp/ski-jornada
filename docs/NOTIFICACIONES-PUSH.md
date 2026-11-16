# Notificaciones push

Avisos en el móvil aunque la app esté cerrada: respuestas a solicitudes, revisión de horas, avisos de administración, recordatorio de fichar la salida y fin de mes. **Opt-in por dispositivo**: solo las recibe quien las activa en *Mi perfil → Notificaciones* (con guía visual para iPhone y Android).

## Activarlas en un despliegue
1. Generar las claves **una vez por cliente** (no cambiarlas después): `cd backend && npm run vapid`.
2. En el servidor (Railway) definir `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secreto) y `VAPID_SUBJECT=mailto:administracion@tuescuela.com` (o se usa `ADMIN_EMAIL`).
3. Redesplegar. El log muestra `🔔 Push: activo`. `GET /api/config` pasa a incluir `pushDisponible: true`.
Sin claves, la app funciona igual y el cuadro de notificaciones indica que la escuela no las activó.

## Requisitos del móvil
- **iPhone:** iOS 16.4 o superior, app **instalada** desde Safari (*Compartir → Añadir a pantalla de inicio*) y abierta desde su icono. En la pestaña normal de Safari no existen.
- **Android:** Chrome, Edge, Firefox o Samsung Internet; mejor con la app instalada.

## Seguridad y privacidad
- El contenido va cifrado de extremo a extremo; Google/Apple/Mozilla solo ven que hay un mensaje.
- El servidor solo acepta direcciones de servicios de push conocidos (evita usarlo para llamar a direcciones internas).
- Se guarda: dirección y claves del dispositivo, etiqueta («iPhone/iPad · Safari») y fecha. Se borra al desactivar, al cerrar sesión, cuando el servicio la da por caducada, al dar de baja a la persona y en la purga. Sale (sin claves) en la exportación de datos.
- Todo activar/desactivar queda en el registro de actividad.

## Pruebas
El smoke (sección 6q) usa `PUSH_SIMULADO=true`: construye y cifra la petición sin enviarla. **Pendiente probar la entrega real en iPhone y Android** (`PLAN-DE-PRUEBAS-MVP.md`).
