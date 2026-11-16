# Flota de clientes: registro y estado de cada instalación

Desde la versión 1.3.0. Es una herramienta **del proveedor** (quien despliega y mantiene las instalaciones): no se activa en las instalaciones de los clientes. Contexto comercial y de gestión en `MODELO-DE-VENTA.md`.

## Qué hace

1. **Registro de clientes**: nombre, tramo, anillo de actualización, direcciones públicas (API y app), proyecto en Railway y en Pages, versión esperada, fechas de alta y renovación, notas. **No guarda secretos.**
2. **Comprobación de estado**: consulta `/api/salud` de cada cliente (versión, commit, si responde y cuánto tarda) y `/api/config` (si el push está activo) y lo compara con la versión de referencia.
3. **Dos formas de usarlo**: la pantalla **Flota** de la app (instalación demo) y el script `backend/scripts/flota.js`.

## Estados

| Estado | Significa |
|--------|-----------|
| `AL_DIA` | Responde y va en la versión que debe |
| `DESACTUALIZADO` | Responde, pero su versión no es la esperada |
| `CAIDO` | No responde, devuelve error o la dirección no está permitida (se muestra el motivo) |

La versión que «debe» llevar es la **versión esperada** del cliente; si no se fijó, la **versión de referencia** (la de la instalación que consulta, es decir, la demo).

## Anillos de actualización

`DEMO` → `PILOTO` → `CLIENTE`. La lista se ordena así. Regla propuesta: `main` actualiza solo la demo; el piloto se actualiza cuando la demo lleva unos días sin problemas, y el resto de clientes después. Hoy el anillo es **informativo**: el despliegue sigue siendo manual (ver «Lo que falta»).

## Activarlo en la instalación demo

En Railway, servicio `api` de la demo:

```
FLOTA_ON=true
```

Con la variable activa, la cuenta **principal** ve «Flota» en el menú (en el móvil, dentro de «Más»). No definirla en ningún cliente: sin ella los endpoints responden 404 y el menú no aparece. Aplica una migración (`flota_clientes`) que se ejecuta sola al arrancar.

## Pantalla Flota

Resumen (activos, al día, desactualizados, caídos), **Comprobar todos**, **+ Añadir cliente** y, por cliente: estado, versión y commit, latencia, push activo o no, motivo si cae, última comprobación, **Comprobar**, **Editar** y **Quitar** (solo borra la entrada del registro; no toca la instalación del cliente).

## Script

```bash
node scripts/flota.js                  # comprueba todos los activos y guarda el resultado
node scripts/flota.js lista            # solo lista el registro
node scripts/flota.js --solo-anillo PILOTO
node scripts/flota.js --json           # para máquinas
node scripts/flota.js estado --archivo ../deploy/clientes.example.json   # registro en un archivo; no guarda nada
```

Termina con código **0** si todo está al día, **1** si hay algún caído o desactualizado y **2** si falla el propio script, de modo que sirve para una alerta programada.

El registro vive en la base de la instalación demo (volumen de Railway), así que el script se ejecuta **allí**, por ejemplo con el CLI de Railway (`railway ssh` en el servicio `api`) o desde cualquier máquina con `--archivo`. `deploy/clientes.example.json` es el formato del archivo.

## Seguridad

- Solo la cuenta **principal** y solo con `FLOTA_ON=true`.
- Las direcciones deben ser `https://` sin usuario ni contraseña; se guarda solo el origen (se descarta la ruta).
- Antes de cada consulta se resuelve el host y se **rechazan direcciones privadas o internas** (el mismo control que los webhooks, en `backend/redSegura.js`), para que el registro no sirva para sondear la red interna. No se siguen redirecciones.
- Solo se leen endpoints públicos del cliente (`/api/salud`, `/api/config`); no se envían credenciales.
- Límite de 12 comprobaciones por minuto; las altas, ediciones y bajas quedan en el registro de actividad (`flota.alta`, `flota.editar`, `flota.baja`).
- El registro de clientes contiene nombres de empresa y fechas de renovación (datos comerciales, no de monitores). Incluirlo en la copia de seguridad de la demo.

## Lo que falta (por construir)

- **Actualizar desde el panel o el script** (desplegar una versión concreta a un cliente o a un anillo) usando las API de Railway y Cloudflare Pages: requiere guardar tokens por cliente en un gestor de secretos, no en esta base.
- **Alertas automáticas** (aviso por correo o push si un cliente cae o se queda atrás): se puede conseguir hoy programando `scripts/flota.js` y mirando el código de salida.
- Última copia de seguridad y variables que faltan por cliente (hoy solo se ve versión, estado y push).
