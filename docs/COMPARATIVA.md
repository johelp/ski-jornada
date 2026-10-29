# Comparativa con el sistema de reservas

Pantalla de administración: **Clases → Comparar con reservas**. Cruza el *resumen mensual por instructor* que exporta el sistema de reservas con las horas y los importes que cargan los profesores en la plataforma, para detectar diferencias antes de liquidar.

## Cómo se usa

1. En el sistema de reservas, exportar el **resumen de instructores** del mes (`instructors_summary_<desde>_<hasta>.csv`).
2. En la plataforma: *Clases → Comparar con reservas → Elegir CSV*. El mes se detecta por el nombre del archivo (se puede cambiar).
3. El archivo se **lee en el navegador**; al servidor solo se envían los totales por instructor.
4. Revisar el resultado:
   - **Coincide**: las horas (tolerancia 0,25 h) y el importe (tolerancia 1 €) cuadran.
   - **Difieren las horas / Difiere el importe**: se muestra reservas vs. plataforma y la diferencia.
   - **Sin horas cargadas**: el instructor tiene actividad en reservas pero el profesor no cargó nada.
   - **Sin vincular**: el nombre no se pudo asociar a un profesor; se elige y se **vincula** (se recuerda para próximos meses).
   - **Solo en la plataforma**: profesores con horas cargadas que no aparecen en reservas.
   - **Sin instructor asignado**: horas de la fila `NO ASIGNADO` (reservas sin profesor).
5. Exportar la comparativa a CSV.

## Formato del archivo

CSV con `;` como separador, decimales con coma y miles con punto (`2.013,50`), con BOM. Columnas usadas:

| Columna | Uso |
|---------|-----|
| `PROFESOR` | Nombre del instructor (se empareja con el nombre del profesor) |
| `SALARIO` | Tarifa por hora → se compara con la tarifa del profesor |
| `HORAS PRIVADAS`, `HORAS GRUPALES`, `HORAS CURSILLOS`, `HORAS REQUERIDAS` | Desglose informativo |
| `TOTAL HORAS` | Se compara con las horas cargadas en la plataforma |
| `TOTAL € SIN PRIMAS` | `TOTAL HORAS × SALARIO` |
| columnas entre `TOTAL € SIN PRIMAS` y `TOTAL € PRIMAS` (p. ej. `Disca`, `Idioma`, `Requerida Propia`, `Repetida`) | **Importes de primas**; se comparan por nombre con las primas configuradas |
| `TOTAL € HORAS REQUERIDAS` | Importe de horas requeridas (solo informativo) |
| `TOTAL €` | `sin primas + primas + requeridas`; se compara con el importe estimado de la plataforma |
| Columnas `HORAS PRIVADAS <producto>`, `HORAS GRUPALES <producto>` | Desglose por producto; se ignora |

Las columnas se localizan por su **nombre**, no por posición. Si el sistema añade primas nuevas entre `TOTAL € SIN PRIMAS` y `TOTAL € PRIMAS`, se leen solas.

## Emparejar nombres

Orden: (1) vínculo guardado (`AliasProfesor`) → (2) nombre normalizado (sin tildes ni signos, mayúsculas): coincide si todas las palabras del nombre más corto están en el otro (mínimo 2 palabras) o hay ≥ 60 % de solapamiento → (3) si hay empate entre dos profesores, queda **sin vincular** para no equivocarse.

Conviene que el nombre y apellidos de cada profesor en la plataforma sea el mismo que en reservas. Para diferencias persistentes (apodos, segundo apellido) se vincula una vez.

## Qué se compara hoy y qué no

- ✅ Horas totales, importe total, tarifa por hora, importe de cada prima por nombre.
- ⚠ Para que el **importe** cuadre, la tarifa del profesor y los importes de las primas de la plataforma deben coincidir con los del sistema de reservas. Si no están configurados, la comparación de importe queda en blanco y solo se comparan horas.
- ⚠ **Horas requeridas** (y su importe) existen solo en reservas: no hay un equivalente en la plataforma. Se muestran como informativas.
- ⬜ Comparación **por día**: el resumen mensual no trae fechas. Para el cotejo diario se usa la importación del planning (`INTEGRACIONES.md`).

## API

- `POST /api/admin/comparativa` — `{ mes: "AAAA-MM", filas: [{ profesor, salario, totalHoras, total, totalSinPrimas, totalPrimas, totalRequeridas, horasPrivadas, horasGrupales, horasCursillos, horasRequeridas, primas: { <nombre>: <€> } }] }`. Máx. 500 filas. Devuelve `resultado[]`, `soloPlataforma[]`, `sinAsignar`, `resumen` y la lista de `profesores` para vincular.
- `POST /api/admin/comparativa/alias` — `{ nombreExterno, profesorId }`.

Los archivos del sistema de reservas contienen nombres, salarios e importes de personas: **no versionarlos en el repositorio**.
