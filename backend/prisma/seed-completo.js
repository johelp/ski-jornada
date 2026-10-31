// Datos de ejemplo COMPLETOS para probar todas las funciones de la plataforma (se ejecuta desde seed.js).
// Las fechas son relativas a HOY: siempre hay mes en curso, meses cerrados, revisiones, planning y documentos recientes.
// Es idempotente: borra y vuelve a crear solo los datos de las cuentas @escuela.com (demostración).
// NUNCA en producción (seed.js lo impide). Guía de escenarios: docs/DATOS-DE-PRUEBA.md
process.env.TZ = process.env.TZ || 'Europe/Madrid';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const legal = require('../legal');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const r2 = n => Math.round(n * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const aMes = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const aDia = d => `${aMes(d)}-${pad(d.getDate())}`;
const hace = (dias, h = 12, m = 0) => { const d = new Date(); d.setDate(d.getDate() - dias); d.setHours(h, m, 0, 0); return d; };
const mesRel = k => { const h = new Date(); return aMes(new Date(h.getFullYear(), h.getMonth() - k, 1)); };

// Generador pseudoaleatorio determinista (los datos son iguales en cada ejecución del mismo día)
function prng(semilla) { let s = semilla >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// Días laborables de un mes (hasta hoy si es el mes en curso)
function diasHabiles(mes) {
  const [y, m] = mes.split('-').map(Number); const hoy = new Date(); const out = [];
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    const f = new Date(y, m - 1, d);
    if (f > hoy) break;
    if (f.getDay() !== 0 && f.getDay() !== 6) out.push(aDia(f));
  }
  return out;
}

// PDF mínimo pero válido (una página de texto) para probar descargas y firmas
function pdfMinimo(lineas) {
  const limpio = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');
  const texto = lineas.map((l, i) => `BT /F1 ${i ? 12 : 18} Tf 72 ${770 - i * 22} Td (${limpio(l)}) Tj ET`).join('\n');
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${Buffer.byteLength(texto)}>>\nstream\n${texto}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
function guardarPdf(sub, nombre, lineas) {
  fs.mkdirSync(path.join(UPLOAD_DIR, sub), { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, sub, nombre), pdfMinimo(lineas));
  return nombre;
}

module.exports = async function sembrarDemoCompleta(prisma, { admin, carlos, laura, miguel, sofia, zonaEntrada, zonaOficina, zonaPista, hash }) {
  console.log('🌱 Sembrando el escenario de prueba completo…');
  const M0 = mesRel(0), M1 = mesRel(1), M2 = mesRel(2), M3 = mesRel(3);

  // ── Configuración de la escuela de ejemplo ────────────────────────────────
  await prisma.configEscuela.upsert({
    where: { id: 'default' }, create: { id: 'default' },
    update: { nombre: 'Escuela de Esquí Demo', cif: 'B00000000', direccion: 'Calle de Ejemplo 1, Granada', telefono: '958 000 000', email: 'administracion@escuela.com', colorPrimario: '#0f4c81' },
  });

  // ── Cuentas adicionales para cubrir todos los estados ─────────────────────
  const base = { password: hash, tipoJornada: 'COMPLETA', horasContrato: 35 };
  const cuenta = (email, datos) => prisma.profesor.upsert({ where: { email }, update: { password: hash, ...datos }, create: { email, ...base, ...datos } });
  const empresa = await cuenta('administracion@escuela.com', { nombre: 'Administración', apellidos: '', role: 'ADMIN', esPrincipal: false, activo: true, adheridoAt: hace(40) });
  const pablo = await cuenta('pablo.invitado@escuela.com', { nombre: 'Pablo', apellidos: 'Invitado', role: 'PROFESOR', activo: true, adheridoAt: null, tarifaHora: 17 });
  const elena = await cuenta('elena.baja@escuela.com', { nombre: 'Elena', apellidos: 'Baja', role: 'PROFESOR', activo: false, adheridoAt: hace(120), tarifaHora: 18 });
  const raul = await cuenta('raul.sintarifa@escuela.com', { nombre: 'Raúl', apellidos: 'Sin Tarifa', role: 'PROFESOR', activo: true, adheridoAt: hace(30), tarifaHora: null });
  const tarifas = [[carlos, 20, 60], [laura, 18, 55], [miguel, 16.5, 45], [sofia, 22, 20]];
  for (const [u, t, dias] of tarifas) await prisma.profesor.update({ where: { id: u.id }, data: { tarifaHora: t, adheridoAt: hace(dias), esPrincipal: false } });
  await prisma.profesor.update({ where: { id: admin.id }, data: { adheridoAt: hace(90), esPrincipal: true } });
  await prisma.profesor.update({ where: { id: miguel.id }, data: { tipoJornada: 'MEDIA_JORNADA' } });
  const demo = [admin, empresa, carlos, laura, miguel, sofia, pablo, elena, raul];
  const ids = demo.map(u => u.id);

  // ── Limpieza de lo generado por ejecuciones anteriores (y restos de pruebas automáticas) ──
  await prisma.profesor.deleteMany({ where: { email: { endsWith: '@ejemplo.test' } } });
  const docsViejos = await prisma.documentoLegajo.findMany({ where: { profesorId: { in: ids }, archivoPath: { startsWith: 'demo-' } } });
  docsViejos.forEach(d => ['documentos', 'firmas'].forEach(sub => [d.archivoPath, d.firmaPath].filter(Boolean).forEach(f => { try { fs.unlinkSync(path.join(UPLOAD_DIR, sub, f)); } catch {} })));
  await prisma.$transaction([
    prisma.claseDada.deleteMany({ where: { profesorId: { in: ids } } }),
    prisma.planningClase.deleteMany({ where: { profesorId: { in: ids } } }),
    prisma.revisionMes.deleteMany({ where: { profesorId: { in: ids } } }),
    prisma.confirmacionClases.deleteMany({ where: { profesorId: { in: ids } } }),
    prisma.documentoLegajo.deleteMany({ where: { profesorId: { in: ids } } }),
    prisma.firmaRegistro.deleteMany({ where: { profesorId: { in: ids } } }),
    prisma.notificacion.deleteMany({ where: { OR: [{ profesorId: { in: ids } }, { enviadaPorId: { in: ids } }] } }),
    prisma.aceptacionLegal.deleteMany({ where: { profesorId: { in: ids } } }),
    prisma.aliasProfesor.deleteMany({}),
    prisma.auditoriaLog.deleteMany({}),
    prisma.apiKey.deleteMany({ where: { nombre: { startsWith: 'Demo' } } }),
    prisma.webhook.deleteMany({ where: { url: { startsWith: 'https://demo.' } } }),
    prisma.registroJornada.deleteMany({ where: { profesorId: { in: ids }, timestamp: { gte: hace(75, 0) } } }),
  ]);

  // ── Disciplinas y primas con importes ────────────────────────────────────
  const tipos = await prisma.tipoClase.findMany({ where: { activo: true } });
  for (const [nombre, importe, modo] of [['Idioma', 3, 'POR_HORA'], ['Disca', 2, 'POR_HORA'], ['Repetida', 10, 'POR_CLASE']])
    await prisma.primaClase.upsert({ where: { nombre }, update: { importe, modo, activa: true }, create: { nombre, importe, modo } });
  await prisma.primaClase.upsert({ where: { nombre: 'Prima antigua' }, update: { activa: false }, create: { nombre: 'Prima antigua', importe: 1, modo: 'POR_HORA', activa: false } });
  const primas = await prisma.primaClase.findMany({ where: { activa: true } });
  const porNombre = Object.fromEntries(primas.map(p => [p.nombre, p]));
  const snapshotPrimas = JSON.stringify(Object.fromEntries(primas.map(p => [p.id, { importe: p.importe, modo: p.modo }])));

  // ── Clases, confirmaciones y revisiones ──────────────────────────────────
  const clasesPorUsuario = {}; // para planning y CSV de comparación
  async function cargarMes(usuario, mes, { n, semilla, tarifa }) {
    const rnd = prng(semilla); const dias = diasHabiles(mes); const out = [];
    for (let i = 0; i < n && dias.length; i++) {
      const fecha = dias[Math.floor(rnd() * dias.length)];
      const horas = [1, 1.5, 2, 2, 3][Math.floor(rnd() * 5)];
      const conPrimas = ['Idioma', 'Disca', 'Repetida'].filter((_, k) => rnd() < [0.35, 0.15, 0.2][k]).map(nom => porNombre[nom]);
      const c = await prisma.claseDada.create({
        data: { profesorId: usuario.id, fecha, horas, tipoId: tipos[Math.floor(rnd() * tipos.length)].id, primas: { connect: conPrimas.map(p => ({ id: p.id })) }, notas: rnd() < 0.2 ? 'Grupo de niños' : null },
        include: { primas: true },
      });
      out.push({ ...c, tarifa });
    }
    clasesPorUsuario[`${usuario.id}|${mes}`] = out;
    return out;
  }
  const confirmar = (u, mes, t) => prisma.confirmacionClases.create({ data: { profesorId: u.id, mes, tarifaHora: t ?? null, primasJson: snapshotPrimas } });
  const revisar = (u, mes, estado, nota) => prisma.revisionMes.create({ data: { profesorId: u.id, mes, estado, nota: nota || null, revisadoPorId: admin.id } });
  const marcar = (clase, marca, notaAdmin) => prisma.claseDada.update({ where: { id: clase.id }, data: { marca, notaAdmin: notaAdmin || null } });

  // Carlos: M-2 aprobado · M-1 confirmado con DISCREPANCIA y clase a revisar · M0 abierto
  await cargarMes(carlos, M2, { n: 10, semilla: 11, tarifa: 20 }); await confirmar(carlos, M2, 20); await revisar(carlos, M2, 'APROBADO', 'Horas correctas');
  const cM1 = await cargarMes(carlos, M1, { n: 12, semilla: 12, tarifa: 20 }); await confirmar(carlos, M1, 20);
  await revisar(carlos, M1, 'DISCREPANCIA', 'Difiere de la reserva del día 10: revisa las horas'); await marcar(cM1[0], 'REVISAR', 'La reserva dice 1 h menos'); await marcar(cM1[1], 'OK');
  await cargarMes(carlos, M0, { n: 6, semilla: 13, tarifa: 20 });
  // Laura: M-2 y M-1 aprobados · M0 abierto
  await cargarMes(laura, M2, { n: 9, semilla: 21, tarifa: 18 }); await confirmar(laura, M2, 18); await revisar(laura, M2, 'APROBADO', 'Horas correctas');
  await cargarMes(laura, M1, { n: 11, semilla: 22, tarifa: 18 }); await confirmar(laura, M1, 18); await revisar(laura, M1, 'APROBADO', 'Horas correctas');
  await cargarMes(laura, M0, { n: 5, semilla: 23, tarifa: 18 });
  // Miguel: M-1 confirmado SIN revisar (por revisar) · M0 abierto con nota de administración
  await cargarMes(miguel, M1, { n: 8, semilla: 31, tarifa: 16.5 }); await confirmar(miguel, M1, 16.5);
  const cM0m = await cargarMes(miguel, M0, { n: 4, semilla: 32, tarifa: 16.5 }); if (cM0m[0]) await marcar(cM0m[0], 'REVISAR', 'Falta indicar el grupo');
  // Sofía: M-1 con CORRECCIÓN solicitada (mes reabierto, sin confirmar)
  await cargarMes(sofia, M1, { n: 7, semilla: 41, tarifa: 22 }); await revisar(sofia, M1, 'CORRECCION', 'Faltan dos clases del fin de semana: añádelas y confirma otra vez');
  // Raúl: sin tarifa → no hay importes, solo horas
  await cargarMes(raul, M1, { n: 5, semilla: 51, tarifa: null });
  await cargarMes(pablo, M3, { n: 2, semilla: 61, tarifa: 17 });

  // ── Planning (reservas) con diferencias a propósito ──────────────────────
  const planning = [];
  for (const u of [carlos, laura, miguel]) {
    const filas = clasesPorUsuario[`${u.id}|${M1}`] || []; const porDia = {};
    filas.forEach(c => { porDia[c.fecha] = r2((porDia[c.fecha] || 0) + c.horas); });
    Object.entries(porDia).forEach(([fecha, horas], i) => {
      let plan = horas;
      if (u === carlos && i === 0) plan = horas + 1;          // Carlos: se planificó 1 h más de la que cargó
      if (u === miguel && i === 0) return;                    // Miguel: una clase cargada que no estaba en el planning
      planning.push({ profesorId: u.id, fecha, horas: plan, disciplina: 'Esquí', referencia: `R-${u.nombre[0]}${i + 1}`, fuente: 'DEMO' });
    });
    if (u === carlos) planning.push({ profesorId: u.id, fecha: diasHabiles(M1).slice(-1)[0], horas: 2, disciplina: 'Snowboard', referencia: 'R-C99', fuente: 'DEMO' }); // planificada y no cargada
  }
  await prisma.planningClase.createMany({ data: planning });

  // ── Fichajes de jornada de las últimas semanas ───────────────────────────
  const zonas = [zonaEntrada, zonaOficina, zonaPista];
  const fich = [];
  for (const [u, semilla] of [[carlos, 1], [laura, 2], [miguel, 3], [sofia, 4]]) {
    const rnd = prng(semilla * 77);
    for (let k = 27; k >= 1; k--) {
      const d = hace(k, 0); if (d.getDay() === 0 || d.getDay() === 6) continue;
      const z = zonas[Math.floor(rnd() * 3)]; const largo = rnd() < 0.2 ? 9.5 : 7 + rnd() * 1.5; // algunos días con exceso
      const e = new Date(d); e.setHours(8, 40 + Math.floor(rnd() * 30), 0, 0);
      const s = new Date(e.getTime() + largo * 3600000);
      fich.push({ profesorId: u.id, zonaId: z.id, zonaNombre: z.nombre, tipo: 'ENTRADA', timestamp: e, lat: z.lat, lng: z.lng, distancia: Math.floor(rnd() * 40), esIncidencia: u === carlos && k === 9 });
      fich.push({ profesorId: u.id, zonaId: z.id, zonaNombre: z.nombre, tipo: 'SALIDA', timestamp: s, lat: z.lat, lng: z.lng, distancia: Math.floor(rnd() * 40), esIncidencia: false });
    }
  }
  const ahora = new Date(); // Laura está «dentro» ahora (para la vista de presencia y el cronómetro)
  fich.push({ profesorId: laura.id, zonaId: zonaEntrada.id, zonaNombre: zonaEntrada.nombre, tipo: 'ENTRADA', timestamp: new Date(ahora.getTime() - 90 * 60000), lat: zonaEntrada.lat, lng: zonaEntrada.lng, distancia: 12, esIncidencia: false });
  await prisma.registroJornada.createMany({ data: fich });

  // ── Documentos (PDF reales de prueba) y registros firmados ───────────────
  const doc = async (u, tipo, nombre, mes, estado) => {
    const arch = guardarPdf('documentos', `demo-${crypto.randomBytes(4).toString('hex')}.pdf`, [`${nombre}`, `${u.nombre} ${u.apellidos}`.trim(), 'Documento de prueba - datos ficticios']);
    const firmado = estado === 'FIRMADO' ? guardarPdf('firmas', `demo-${crypto.randomBytes(4).toString('hex')}.pdf`, ['FIRMADO', nombre, `${u.nombre} ${u.apellidos}`.trim()]) : null;
    return prisma.documentoLegajo.create({ data: { profesorId: u.id, tipo, nombre, mes, archivoPath: arch, subidoPor: admin.id, estado, firmaPath: firmado, firmadoAt: firmado ? hace(5) : null } });
  };
  await doc(laura, 'NOMINA', `Nómina ${M2}`, M2, 'FIRMADO');
  await doc(laura, 'NOMINA', `Nómina ${M1}`, M1, 'PENDIENTE');
  await doc(carlos, 'CONTRATO', 'Contrato de temporada', null, 'FIRMADO');
  await doc(miguel, 'CERTIFICADO', 'Certificado de titulación', null, 'PENDIENTE');
  await prisma.firmaRegistro.create({ data: { profesorId: carlos.id, mes: M2, estado: 'ENVIADO', emailEnviadoAt: hace(10) } });
  await prisma.firmaRegistro.create({ data: { profesorId: laura.id, mes: M2, estado: 'FIRMADO', emailEnviadoAt: hace(12), firmadoAt: hace(9), pdfFirmadoPath: guardarPdf('firmas', `demo-${crypto.randomBytes(4).toString('hex')}.pdf`, ['Registro de jornada firmado', M2, 'Laura Garcia']) } });

  // ── Días libres (hay de todos los estados) ───────────────────────────────
  await prisma.solicitudLibre.deleteMany({ where: { profesorId: { in: ids } } });
  const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(12, 0, 0, 0); return d; };
  await prisma.solicitudLibre.createMany({ data: [
    { profesorId: sofia.id, fechaInicio: dia(20), fechaFin: dia(27), motivo: 'VACACIONES', comentario: 'Semana en familia', estado: 'PENDIENTE' },
    { profesorId: laura.id, fechaInicio: dia(5), fechaFin: dia(5), motivo: 'ASUNTO_PROPIO', comentario: 'Gestión personal', estado: 'PENDIENTE' },
    { profesorId: carlos.id, fechaInicio: dia(-30), fechaFin: dia(-26), motivo: 'VACACIONES', estado: 'APROBADO', aprobadoPor: admin.id, fechaRespuesta: dia(-40), observacion: 'Disfruta' },
    { profesorId: miguel.id, fechaInicio: dia(-15), fechaFin: dia(-14), motivo: 'ASUNTO_PROPIO', estado: 'RECHAZADO', aprobadoPor: admin.id, fechaRespuesta: dia(-20), observacion: 'Esos días hay curso intensivo' },
    { profesorId: raul.id, fechaInicio: dia(-8), fechaFin: dia(-6), motivo: 'ENFERMEDAD', estado: 'APROBADO', aprobadoPor: admin.id, fechaRespuesta: dia(-8) },
  ] });

  // ── Avisos, aceptaciones legales y alias ─────────────────────────────────
  const aviso = (u, titulo, mensaje, tipo, leida, dias) => ({ profesorId: u.id, enviadaPorId: admin.id, titulo, mensaje, tipo, leida, createdAt: hace(dias) });
  await prisma.notificacion.createMany({ data: [
    aviso(carlos, `Discrepancia en tus horas · ${M1}`, 'Difiere de la reserva del día 10: revisa las horas', 'AVISO', false, 3),
    aviso(carlos, 'Reunión de equipo', 'Mañana a las 9:00 en la oficina central', 'INFO', false, 1),
    aviso(laura, `Horas aprobadas · ${M1}`, 'Horas correctas', 'INFO', true, 6),
    aviso(laura, 'Nuevo documento en tu legajo', `Nómina ${M1} pendiente de firma`, 'INFO', false, 2),
    aviso(sofia, `Corrección solicitada · ${M1}`, 'Faltan dos clases del fin de semana', 'AVISO', false, 2),
    aviso(miguel, 'Aviso importante', 'Revisa el protocolo de seguridad en pistas', 'ALERTA', false, 4),
    aviso(admin, 'Horas de clases confirmadas', `Miguel Torres confirmó sus horas de ${M1}.`, 'INFO', false, 5),
  ] });
  const acepta = async (u, docs) => { for (const d of docs) await prisma.aceptacionLegal.create({ data: { profesorId: u.id, documento: d, version: legal.VERSION[d], aceptadoAt: hace(30) } }); };
  await acepta(admin, ['PRIVACIDAD', 'ENCARGO']); await acepta(empresa, ['PRIVACIDAD']); await acepta(carlos, ['PRIVACIDAD']); await acepta(laura, ['PRIVACIDAD']);
  await prisma.aliasProfesor.create({ data: { nombreExterno: 'CARLOS MARTINEZ GARCIA', profesorId: carlos.id } });

  // ── Integraciones y registro de actividad ────────────────────────────────
  const claveDemo = 'sj_demo_clave_de_ejemplo_solo_pruebas_0001';
  await prisma.apiKey.create({ data: { nombre: 'Demo · Sistema de reservas', prefijo: claveDemo.slice(0, 10), keyHash: crypto.createHash('sha256').update(claveDemo).digest('hex'), scopes: 'lectura,economico,planning', creadaPorId: admin.id } });
  await prisma.webhook.create({ data: { url: 'https://demo.ejemplo.test/webhook', secret: 'whsec_demo_solo_pruebas', eventos: '*', activo: false } });
  // Casos de uso de ejemplo: gestoría (solo lectura económica) y aviso de confirmaciones/solicitudes a un canal
  const claveGestoria = 'sj_demo_gestoria_solo_lectura_pruebas_0002';
  await prisma.apiKey.create({ data: { nombre: 'Demo · Gestoría (solo lectura)', prefijo: claveGestoria.slice(0, 10), keyHash: crypto.createHash('sha256').update(claveGestoria).digest('hex'), scopes: 'lectura,economico', creadaPorId: admin.id } });
  await prisma.webhook.create({ data: { url: 'https://demo.ejemplo.test/avisos-administracion', secret: 'whsec_demo_avisos_pruebas', eventos: 'clases.mes_confirmado,solicitud.creada', activo: false } });
  // WhatsApp: dos profesores con teléfono y avisos activados (solo se envía si administración conecta un número)
  await prisma.profesor.updateMany({ where: { id: { in: [laura.id, carlos.id] } }, data: { telefono: '+34600000001', avisosWhatsapp: true } });
  await prisma.profesor.update({ where: { id: miguel.id }, data: { telefono: '+34600000002', avisosWhatsapp: false } });
  const aud = (accion, obj, detalle, dias) => ({ actorId: admin.id, actorEmail: admin.email, accion, objetivoId: obj?.id, objetivoEmail: obj?.email, detalle: detalle ? JSON.stringify(detalle) : null, createdAt: hace(dias) });
  await prisma.auditoriaLog.createMany({ data: [
    aud('usuario.importacion', null, { creados: 7, actualizados: 0, errores: 0, invitados: 7 }, 60), aud('usuario.crear_admin', empresa, null, 55),
    aud('usuario.baja', elena, null, 20), aud('usuario.rol', empresa, { de: 'PROFESOR', a: 'ADMIN' }, 54), aud('clases.revision', carlos, { mes: M1, estado: 'DISCREPANCIA' }, 3),
    aud('clases.revision', laura, { mes: M1, estado: 'APROBADO' }, 6), aud('integracion.key_crear', null, { nombre: 'Demo · Sistema de reservas' }, 30),
  ] });

  // ── CSV de ejemplo del sistema de reservas (para la pantalla «Comparar con reservas») ──
  const calc = (clases, tarifa) => {
    const horas = r2(clases.reduce((s, c) => s + c.horas, 0)); const pr = {};
    clases.forEach(c => c.primas.forEach(p => { const imp = p.modo === 'POR_CLASE' ? p.importe : p.importe * c.horas; pr[p.nombre] = r2((pr[p.nombre] || 0) + imp); }));
    const sin = r2(horas * (tarifa || 0)); const totPr = r2(Object.values(pr).reduce((s, v) => s + v, 0));
    return { horas, sin, pr, totPr, total: r2(sin + totPr) };
  };
  const fila = (nombre, salario, c, extraHoras = 0) => {
    const horas = r2(c.horas + extraHoras); const sin = r2(horas * salario);
    return [nombre, salario, horas, 0, 0, 0, 0, horas, sin, c.pr.Disca || '', c.pr.Idioma || '', '', c.pr.Repetida || '', c.totPr, r2(sin + c.totPr)];
  };
  const get = (u, t) => calc(clasesPorUsuario[`${u.id}|${M1}`] || [], t);
  const filas = [
    fila('LAURA GARCIA', 18, get(laura, 18)),                  // coincide
    fila('CARLOS MARTINEZ GARCIA', 20, get(carlos, 20), 3.5),  // vinculado por alias; difieren las horas
    fila('MIGUEL TORRES', 18, get(miguel, 16.5)),              // misma carga, distinta tarifa → importe
    fila('SOFIA PEREZ', 22, get(sofia, 22)),                   // coincide (mes con corrección pendiente)
    fila('RAUL SIN TARIFA', 15, get(raul, 0)),                  // en la plataforma no tiene tarifa
    ['INSTRUCTOR DESCONOCIDO', 20, 12, 0, 0, 0, 0, 12, 240, '', '', '', '', 0, 240],
    ['NO ASIGNADO ', 0, 24, 0, 0, 0, 0, 24, 0, '', '', '', '', 0, 0],
  ];
  const cab = ['PROFESOR', 'SALARIO', 'HORAS PRIVADAS', 'HORAS REQUERIDAS', 'TOTAL € HORAS REQUERIDAS', 'HORAS GRUPALES', 'HORAS CURSILLOS', 'TOTAL HORAS', 'TOTAL € SIN PRIMAS', 'Disca', 'Idioma', 'Requerida Propia', 'Repetida', 'TOTAL € PRIMAS', 'TOTAL €'];
  const num = v => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v);
  const carpeta = path.join(__dirname, 'demo'); fs.mkdirSync(carpeta, { recursive: true });
  const [ay, am] = M1.split('-').map(Number);
  const nombreCsv = `instructors_summary_${new Date(Date.UTC(ay, am - 1, 1, -1)).toISOString().replace(/[:]/g, '_')}_${new Date(Date.UTC(ay, am, 1, -1) - 1).toISOString().replace(/[:]/g, '_')}.csv`;
  fs.writeFileSync(path.join(carpeta, nombreCsv), '﻿' + [cab, ...filas.map(f => f.map(num))].map(f => f.join(';')).join('\n') + '\n');

  console.log(`\n✅ Escenario de prueba completo creado (meses ${M3} … ${M0}).`);
  console.log(`   📄 CSV de reservas de ejemplo: backend/prisma/demo/${nombreCsv}`);
  console.log(`   🔑 API key de demostración: ${claveDemo}`);
  console.log('   Guía de escenarios: docs/DATOS-DE-PRUEBA.md');
};
