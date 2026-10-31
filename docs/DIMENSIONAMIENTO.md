# Dimensionamiento: consumo de datos y almacenamiento

Cuánto ocupa y cuánto tráfico genera una instancia, para elegir plan y volumen **antes** de cargar documentos. Las constantes salen de **mediciones reales** hechas con la base de ejemplo y el archivo de reservas de una escuela de ~70 instructores; el resto son supuestos explícitos que se pueden cambiar en el estimador.

```bash
node backend/scripts/dimensionar.js --profesores 70 [--meses 6] [--documentos --docs-mes 1 --pdf-mb 0.7 --firmadas] [--retencion 4] [--backups 14]
```

## Resumen

- **Sin el módulo de documentos** (nóminas firmadas fuera, como en el piloto de Snowmotion), la instancia es **diminuta**: ~11 MB de base por temporada y **≈ 170 MB en total tras 4 años** incluyendo copias. Cabe en el volumen mínimo de cualquier plan.
- **Los documentos lo cambian todo:** una nómina en PDF pesa unas **100 veces más** que todo lo que un profesor genera en el sistema en un año. Si se activa el módulo, el volumen se decide por los PDF, no por los datos.
- **El tráfico es irrelevante** (decenas de MB al mes) salvo las descargas de documentos (cientos de MB al mes en escuelas grandes).
- **El correo** (≈ 300 al mes para 70 profesores) cabe en el plan gratuito de Resend, salvo el día de las invitaciones (límite diario).

## Mediciones (base de ejemplo y archivo real)

| Elemento | Medido |
|----------|--------|
| Fila de clase (con índices y primas) | ~350–400 B |
| Fila de fichaje | ~220–260 B |
| Fila de notificación / registro de actividad | ~200–330 B |
| PDF de nómina de ejemplo (el de los datos de prueba del proyecto) | **680 KB** (rango habitual 100 KB – 1 MB) |
| Respuesta típica de la API (historial, informe, resumen) | 0,5 – 6 KB |
| Primera carga de la app | ≈ 340 KB comprimidos (JS 320 KB + CSS 17 KB); después, en caché |
| Compresión de una copia SQLite (gzip) | 18 % del tamaño (46 KB frente a 397 KB) |
| Escuela de referencia (resumen real de febrero) | 69 instructores con actividad · 3.511 h/mes · pico ≈ 1.400 clases/mes |

## Supuestos del estimador

70 profesores en el pico · temporada de 6 meses · 20 clases por profesor y mes · 2 fichajes por día y 20 días por mes · 1 nómina por profesor y mes (0,7 MB) · opcional: copia firmada de cada nómina (×2) y 2 documentos más al año (contrato, certificados) · retención de 4 años (registro de jornada) · 14 copias diarias comprimidas · cada profesor abre la app ~20 veces al mes.

## Escenarios

| Escenario | Base por temporada | Documentos / año | **Volumen total a 4 años** | Con margen ×2 |
|-----------|--------------------|-------------------|---------------------------|---------------|
| **A · 70 profesores, sin documentos** (piloto Snowmotion) | 11 MB | — | **≈ 170 MB** | ≈ 335 MB |
| **B · 70 profesores, con nóminas y copia firmada** | 11 MB | 784 MB | **≈ 3,2 GB** | ≈ 6,5 GB |
| **C · 20 profesores, con nóminas** | 3 MB | 112 MB | **≈ 0,5 GB** | ≈ 1 GB |
| **D · 200 profesores, con nóminas y copia firmada** | 36 MB | 2,5 GB | **≈ 10,4 GB** | ≈ 21 GB |

*(cifras del estimador; los totales incluyen base, documentos y copias comprimidas; se actualizan ejecutando el script con tus datos).*

### Tráfico y correo al mes

| Escenario | API | Documentos | Primera carga (todo el equipo, una vez) | Correos |
|-----------|-----|------------|------------------------------------------|---------|
| A | 41 MB | — | 23 MB | ≈ 285 |
| B | 41 MB | 147 MB | 23 MB | ≈ 355 |
| C | 12 MB | 21 MB | 7 MB | ≈ 130 |
| D | 117 MB | 420 MB | 66 MB | ≈ 940 |

## Qué plan y qué volumen elegir

| Caso | Recomendación |
|------|---------------|
| **A (sin documentos)** | Cualquier volumen (≥ 1 GB) sobra. Plan básico de Railway; correo en plan gratuito de Resend |
| **B / C** (documentos en el volumen) | Volumen de **10 GB** para B y **2–5 GB** para C. Controlar el crecimiento anual (≈ 0,8 GB/año en B) |
| **D o varias escuelas** | Sacar los documentos del volumen a **almacenamiento de objetos** (Cloudflare R2, S3) o a **Drive** (ver `PILOTO-SNOWMOTION.md`); mantener en el volumen solo la base |
| **Más de 1 réplica** | SQLite funciona con una sola réplica: pasar a Postgres antes de escalar |

> Los precios y límites exactos de volumen, red y correo cambian: **comprobar los planes vigentes** de Railway, Cloudflare y Resend antes de contratar. Como orden de magnitud, el almacenamiento en volumen se cobra por GB al mes (céntimos por GB) y la red de salida por GB: para los escenarios A–C el coste de datos es marginal frente al coste base del servicio.

## Crecimiento y control

- **Límite de subida:** 20 MB por archivo (configurable en `backend/index.js`). Pedir PDF optimizados (una nómina típica no debería pasar de 1 MB).
- **Retención:** el registro de jornada se conserva 4 años; la purga de bajas (`scripts/purgar.js`) libera la base y los archivos. Los documentos de bajas se borran con ella.
- **Copias:** se guardan 14 diarias comprimidas (`BACKUP_CONSERVAR`); descargar una semanal fuera del servidor. Las copias de la base **no incluyen los PDF** (`/data/uploads`): planificar su copia aparte si el módulo está activo.
- **Alertas:** monitorizar el uso del volumen (panel de Railway) y avisar al 70 %.
- **Estimar de nuevo** al cambiar las reglas: `dimensionar.js` con el número real de profesores, tamaño de PDF y política de documentos.

## Datos que conviene pedir al cliente

Número de profesores en temporada alta y baja · meses de temporada · si se usará el módulo de documentos y qué documentos (nóminas, contratos, certificados) · tamaño típico de sus PDF · si quieren copia firmada de cada documento · plazo de conservación acordado.
