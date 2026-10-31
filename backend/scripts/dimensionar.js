#!/usr/bin/env node
// Estimador de consumo de datos y almacenamiento de una instancia. Constantes medidas con la base de ejemplo (ver docs/DIMENSIONAMIENTO.md).
// Uso:  node scripts/dimensionar.js [--profesores 70] [--meses 6] [--clases-mes 20] [--fichajes-dia 2] [--dias-mes 20]
//                                   [--documentos] [--docs-mes 1] [--pdf-mb 0.7] [--firmadas] [--otros-docs-anio 2] [--retencion 4] [--backups 14]
const arg = (n, def) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? def : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : Number(process.argv[i + 1])); };
const flag = n => process.argv.includes(`--${n}`);

const P = arg('profesores', 70), MESES = arg('meses', 6), CLASES = arg('clases-mes', 20), FICH = arg('fichajes-dia', 2), DIAS = arg('dias-mes', 20);
const DOCS = flag('documentos'), DOCS_MES = arg('docs-mes', 1), PDF_MB = arg('pdf-mb', 0.7), FIRMADAS = flag('firmadas'), OTROS = arg('otros-docs-anio', 2);
const RET = arg('retencion', 4), BK = arg('backups', 14);

// Bytes por fila en SQLite incluyendo índices y sobrecoste de páginas (medidos y redondeados al alza)
const B = { clase: 400, primaClase: 80, fichaje: 260, notificacion: 330, auditoria: 260, revision: 250, confirmacion: 450, planning: 200, otros: 400 };
const MB = 1024 * 1024;

const clases = P * CLASES * MESES, primas = clases * 0.7, fichajes = P * FICH * DIAS * MESES;
const notifs = P * 6 * MESES, auditoria = 30 * MESES + P * 2, revis = P * MESES * 1.5, planning = clases * 1.1;
const dbTemporada = clases * B.clase + primas * B.primaClase + fichajes * B.fichaje + notifs * B.notificacion + auditoria * B.auditoria + revis * (B.revision + B.confirmacion) + planning * B.planning + P * B.otros * 3;
const dbBase = 0.3 * MB; // esquema, catálogo, índices vacíos

const docsAnio = DOCS ? P * (DOCS_MES * MESES + OTROS) : 0;
const docsBytes = docsAnio * PDF_MB * MB * (FIRMADAS ? 2 : 1);

const dbRet = dbBase + dbTemporada * RET, docsRet = docsBytes * RET;
const COMPRESION = 0.2; // las copias programadas van comprimidas (gzip de SQLite medido: 0,18)
const backups = (dbBase + dbTemporada * RET) * COMPRESION * BK; // peor caso: la base al final del periodo × copias conservadas
const total = dbRet + docsRet + backups;

// Tráfico mensual (profesores: 20 visitas/mes; ~10 peticiones de ~3 KB; primera carga ~340 KB comprimidos, luego en caché)
const trafApi = P * 20 * 10 * 3 * 1024, primeraCarga = P * 340 * 1024;
const trafDocs = DOCS ? P * (DOCS_MES + (FIRMADAS ? DOCS_MES : 0)) * PDF_MB * MB * 1.5 : 0; // descargas y subidas, con reintentos
const correos = Math.round(P * 1.5 + P * 2 + P * (DOCS ? DOCS_MES : 0) + 40);

const fmt = b => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(2)} GB` : `${(b / MB).toFixed(1)} MB`);
console.log(`\nEstimación para ${P} profesores · temporada de ${MESES} meses · ${CLASES} clases/mes por profesor · retención ${RET} años`);
console.log(`Módulo de documentos: ${DOCS ? `SÍ (${DOCS_MES}/mes por profesor, ${PDF_MB} MB cada uno${FIRMADAS ? ', con copia firmada' : ''}, +${OTROS} otros/año)` : 'NO (nóminas fuera de la plataforma)'}\n`);
const filas = [
  ['Base de datos por temporada', fmt(dbTemporada)], [`Base de datos tras ${RET} años`, fmt(dbRet)],
  ['Documentos por año', fmt(docsBytes)], [`Documentos tras ${RET} años`, fmt(docsRet)],
  [`Copias de seguridad (${BK} copias comprimidas, peor caso)`, fmt(backups)], ['ALMACENAMIENTO TOTAL (volumen)', fmt(total)],
  ['Recomendado (×2 de margen)', fmt(total * 2)],
  ['Tráfico mensual de la API', fmt(trafApi)], ['Primera carga de la app (todo el equipo)', fmt(primeraCarga)], ['Tráfico mensual de documentos', fmt(trafDocs)],
  ['Correos al mes (estimación)', `${correos}`],
];
const ancho = Math.max(...filas.map(f => f[0].length));
filas.forEach(([k, v]) => console.log(`  ${k.padEnd(ancho)}  ${v}`));
console.log(`\n  Filas por temporada: ${Math.round(clases)} clases · ${Math.round(fichajes)} fichajes · ${docsAnio} documentos/año\n`);
