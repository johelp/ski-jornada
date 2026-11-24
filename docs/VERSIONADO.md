# Versionado y versión visible

## Dónde se ve la versión
- **En la app** (menú lateral en escritorio y «Más» en el móvil): `Versión 1.2.0 · abc1234 · servidor 1.2.0`.
  - Si la versión de la app **no coincide** con la del servidor, aparece el botón **Actualizar**: borra la caché de la PWA y recarga. Sirve cuando un móvil se quedó con una versión vieja o cuando el servidor aún no terminó de desplegarse.
  - Al pasar el cursor (o mantener pulsado) sobre la versión se ve la fecha de compilación y el commit.
- **En la landing**: pie de página, «Versión 1.2.0».
- **En la API**: `GET /api/salud` → `{ ok, version, commit, … }` (`version` es la de `backend/package.json`; `commit` los 7 primeros caracteres del commit que despliega Railway, o `local`).

## De dónde sale
| Parte | Origen |
|-------|--------|
| Versión de la app | `frontend/package.json` (`version`), incrustada al compilar |
| Commit de la app | `CF_PAGES_COMMIT_SHA` (Cloudflare Pages) o `GITHUB_SHA`; `local` si no hay |
| Fecha de compilación | La del momento de compilar |
| Versión del servidor | `backend/package.json` (`version`) |

**Mantén las dos versiones iguales** (`backend/package.json` y `frontend/package.json`): así el aviso de «Actualizar» solo salta cuando de verdad hay un desajuste.

## Cómo se numera
[Versionado semántico](https://semver.org/lang/es/): `MAJOR.MINOR.PATCH`.
- **PATCH** (1.1.1): correcciones sin funciones nuevas.
- **MINOR** (1.2.0): funciones nuevas compatibles (un módulo, una pantalla, un endpoint).
- **MAJOR** (2.0.0): cambios que obligan a algo al desplegar (migración destructiva, variables nuevas obligatorias, API incompatible).

## Cómo publicar una versión
1. En `CHANGELOG.md`, pasar lo de **[Sin publicar]** a una sección nueva `## [X.Y.Z] — AAAA-MM-DD` y dejar **[Sin publicar]** vacío.
2. Subir `version` en `backend/package.json` y `frontend/package.json` (y su `package-lock.json`: `npm version X.Y.Z --no-git-tag-version` en cada carpeta).
3. Mergear a `main`; Railway y Cloudflare Pages despliegan solos.
4. (Opcional) Etiquetar el commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. Comprobar `GET /api/salud` y que la app muestra la misma versión.

## Historial
- **1.0.0** (30/10/2026): MVP listo para el piloto.
- **1.6.0** (24/11/2026): prácticas de formación (planilla de control en PDF), control de horas en lista con filtro de vacíos y corrección de cargas intermitentes.
- **1.5.0** (18/11/2026): bonos y giftcards (módulo apagable), landing y documentación actualizadas.
- **1.4.0** (18/11/2026): módulo de fichaje apagable y marca «pasado a planning» en las solicitudes aprobadas.
- **1.3.0** (16/11/2026): flota de clientes (registro y estado de cada instalación; solo proveedor).
- **1.2.0** (16/11/2026): notificaciones push con guía visual para iPhone y Android, landing de venta (pedir demo, para qué sirve, casos de uso, preguntas), modo cliente de la landing y manual de despliegue para clientes nuevos.
- **1.1.0** (15/11/2026): registro de jornada con correcciones trazables, colaboradores y subcontratas, módulos apagables, carga de clases rediseñada, comprobación de firmas y firma en pantalla, edición de solicitudes, datos de demostración en instancia desplegada, indicador de versión y landing actualizada. Detalle en `CHANGELOG.md`.
