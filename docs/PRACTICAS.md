# Prácticas de formación

Desde la versión 1.6.0. Módulo **apagable** (*Config → Módulos → Prácticas de formación*).

## Para qué sirve

La escuela recibe a **profesores en prácticas**: personas que ya terminaron su titulación y deben sumar horas de práctica para acreditarla y obtener el título. Cada práctica se registra con su horario y, al final, administración descarga una **planilla de control** en PDF que la escuela **firma y sella** para entregarla a la entidad que emite la titulación.

## Cómo se identifica a una persona en prácticas

No es un rol nuevo: es una **marca** sobre una cuenta de profesor.

- *Usuarios → + Nuevo* (casilla **Persona en prácticas**) o *Editar* una cuenta ya creada.
- La persona entra como siempre (enlace o código por correo). En lugar del inicio de empleado ve solo **Prácticas**, **Documentos** y **Mi perfil**: no ficha ni carga clases.
- Una cuenta de administración no puede marcarse en prácticas.
- Quitar la marca no borra los registros.

## Lo que registra la persona (o administración por ella)

| Campo | Notas |
|-------|-------|
| Fecha | No puede ser futura |
| Inicio y fin | Mismo día; el fin debe ser posterior al inicio; máximo 12 h seguidas |
| Horas | **Se calculan solas** (fin − inicio): 09:30–12:00 = 2,5 h |
| Tipo de clase | Particular, Grupal, Club, Campamento, Chikimotion, Colegio |
| Profesor / coordinador | Texto libre, con sugerencias de los ya usados; se recuerda el último |
| Notas | Opcional |

Dos prácticas de la misma persona **no pueden solaparse** el mismo día (sí pueden ser seguidas: 09:00–10:00 y 10:00–11:00). La persona puede editar y borrar sus registros mientras la planilla **no esté cerrada**.

## Lo que hace administración

*Prácticas → persona:*

- **Registrar o corregir** horas por la persona (incluso con la planilla cerrada).
- **Planilla de control:** titulación que se acredita, entidad que la emite, **horas requeridas** (con barra de avance y las que faltan) y una **observación** que sale en el PDF. La persona ve titulación y horas requeridas, **no** la observación.
- **Descargar planilla (PDF):** datos de la escuela y de la persona, tabla de registros (fecha, inicio, fin, horas, tipo, profesor/coordinador), total y horas por tipo, observaciones y un bloque de **firma y sello** de la escuela.
- **Cerrar planilla:** la persona ya no puede añadir, cambiar ni borrar. Se puede **reabrir**.

El PDF **se descarga y se firma y sella a mano o con tu certificado**: la app no firma ni sella por sí misma. Revisa con la entidad certificadora si exige un formato propio; si es así, se adapta.

## Privacidad

Datos tratados: nombre, correo, horas y con quién se hicieron las prácticas (ver el tratamiento 8 de `RGPD.md`). Cada persona solo ve lo suyo.

## API

`GET|POST /api/practicas` (`/mis`) · `PUT|DELETE /api/practicas/:id` · `GET /api/admin/practicas` · `GET|POST /api/admin/practicas/:profesorId` · `PUT|DELETE /api/admin/practicas/:profesorId/registro/:id` · `PUT /api/admin/practicas/:profesorId/planilla`. Detalle en `API.md`.

## Fuera de alcance por ahora

Varios periodos o titulaciones por persona, validación de cada práctica por el coordinador, firma digital del PDF desde la app, y alta de personas en prácticas desde la importación de lista (se marcan en *Usuarios*).
