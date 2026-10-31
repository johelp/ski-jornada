# Acceso, altas e invitaciones

Cómo entra la gente a la plataforma y quién controla quién puede entrar.

## Principio

> **Nadie puede crear una cuenta por su cuenta.** La escuela tiene una cuenta de administración; administración carga la lista de profesores y los **invita**. Solo entra quien está en la lista y está activo.

No hay registro público ni restricción por dominio de correo (los profesores usan correos personales). La lista de profesores *es* la lista de acceso.

## Roles

| Rol | Qué es | Quién lo crea |
|-----|--------|---------------|
| **Cuenta principal** | La cuenta de administración de la escuela. Es la única que puede crear otros administradores y cambiar roles. No se puede dar de baja ni cambiar de rol | Se crea al desplegar la instancia con `ADMIN_EMAIL` (ver `MULTI-DESPLIEGUE.md`) |
| **Administración** | Gestiona equipo, clases, revisión, integraciones | La cuenta principal |
| **Profesor** | Ficha, carga clases, ve su informe | Cualquier administrador (alta o importación de lista) |

### La cuenta de administración puede ser de empresa

No tiene por qué ser una persona: puede ser `administracion@tuescuela.com` con nombre «Administración» y **sin apellidos** (los apellidos son opcionales para las cuentas de administración). Recomendaciones:
- Que el buzón tenga **doble verificación** y lo usen solo las personas autorizadas: quien controla ese correo controla la cuenta.
- Si hace falta saber *quién* hizo cada cosa, dar a cada persona de administración su propia cuenta (la principal las crea). El **registro de actividad** muestra la cuenta que actuó.
- Si se pierde el acceso al buzón, se recupera cambiando `ADMIN_EMAIL` en el despliegue (lo hace quien administre la instancia).

## Flujo de altas

1. **Cuenta principal.** Se crea al montar la instancia (`ADMIN_EMAIL`, `ADMIN_NOMBRE`, `ADMIN_APELLIDOS` opcional).
2. **Cargar la lista.** *Usuarios → Importar lista*: pegar o subir un CSV con `nombre, apellidos, email` (opcionales: teléfono, jornada, horas, tarifa). Es idempotente (reimportar actualiza). También se puede dar de alta de uno en uno (*+ Nuevo*) o por script (`import-profesores.js`).
3. **Invitar.** Al importar se puede marcar *Enviar la invitación ahora*; o más tarde con *Invitar a los pendientes* o *Reenviar invitación* en cada persona. Las invitaciones salen de una en una (los proveedores de correo limitan la velocidad).
4. **Adhesión.** La persona abre el enlace del correo (o pide uno en la pantalla de acceso con su email) y entra. En su **primer acceso** pasa de *Invitado · sin entrar* a *Activo*.
5. **Seguimiento.** *Usuarios* muestra quién está *Invitado · sin entrar*, *Activo* o *Inactivo*.

Estados: **Invitado** (en la lista, nunca entró) → **Activo** (entró al menos una vez) → **Inactivo** (de baja).

## Qué pasa si…

| Situación | Resultado |
|-----------|-----------|
| Alguien que no está en la lista pide un enlace | Recibe la misma respuesta, **no se crea ninguna cuenta y no se envía ningún correo**. No se revela quién está en la lista |
| Un profesor no recibe el enlace | Comprobar el email de la lista y el spam; administración puede *Reenviar invitación* |
| Se da de baja a un profesor | **Pierde el acceso al instante**, incluso con la sesión abierta; conserva su historial (ver `RGPD.md` para la supresión definitiva) |
| Se reactiva | Vuelve a entrar con un enlace nuevo |
| Cambia el email de un profesor | No se edita: se da de baja la cuenta antigua y se da de alta la nueva (pendiente de mejora) |
| Un administrador intenta darse de baja a sí mismo, dar de baja la cuenta principal o dejar la escuela sin administración | Se bloquea |
| Un administrador que no es la cuenta principal intenta crear otro administrador | Se rechaza (403) |
| Se piden muchos enlaces para un mismo email | Máximo 1 por minuto y 5 por hora; el resto se ignora sin avisar. Además hay un límite por IP |

## Seguridad del acceso

- Enlace de **un solo uso**, vale **15 minutos**; en la base solo se guarda su huella (hash).
- Sesión de **90 días**, renovable; cada petición se **contrasta con la base**: baja y cambios de rol se aplican de inmediato (caché de 10 s por usuario).
- Los administradores no pueden cambiar su propio rol ni el de la cuenta principal.
- **Registro de actividad** (*Usuarios → Actividad de administración*, `GET /api/admin/auditoria`): altas, bajas, reactivaciones, cambios de rol, importaciones, invitaciones, creación de claves y webhooks, revisiones de horas. Guarda quién, cuándo y sobre quién; no guarda contenidos sensibles.

## Pendiente

- Doble verificación para administración (código por correo además del enlace).
- Cambio de email desde la interfaz.
- Caducidad automática de invitaciones sin usar y recordatorios.
- ~~Código de 6 dígitos para iPhone~~ ✅ disponible (ver `APP-MOVIL.md`).
