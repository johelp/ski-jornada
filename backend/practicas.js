// Prácticas de formación: lógica pura (validación, cálculo de horas, solapes, resumen). Sin acceso a la base.
const TIPOS = { PARTICULAR: 'Particular', GRUPAL: 'Grupal', CLUB: 'Club', CAMPAMENTO: 'Campamento', CHIKIMOTION: 'Chikimotion', COLEGIO: 'Colegio' };
const r2 = n => Math.round(n * 100) / 100;
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutos = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const txt = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const hoyISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Horas entre dos horas del mismo día (HH:MM). Sin turnos que crucen la medianoche; máximo 12 h seguidas.
function calcularHoras(inicio, fin) {
  if (!HORA.test(String(inicio)) || !HORA.test(String(fin))) return { error: 'Indica la hora de inicio y de fin (HH:MM)' };
  const m = minutos(fin) - minutos(inicio);
  if (m <= 0) return { error: 'La hora de fin debe ser posterior a la de inicio' };
  if (m > 12 * 60) return { error: 'Una práctica no puede durar más de 12 horas seguidas' };
  return { horas: r2(m / 60) };
}

/** Valida un registro. Devuelve { data } (sin profesorId) o { error }. parcial: para ediciones se parte de `base`. */
function validarRegistro(b = {}, { base = {}, hoy = hoyISO() } = {}) {
  const fecha = String(b.fecha ?? base.fecha ?? '');
  const f = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T12:00:00`) : null;
  if (!f || isNaN(f) || hoyISO(f) !== fecha) return { error: 'Indica una fecha válida' };
  if (fecha > hoy) return { error: 'No se pueden registrar prácticas con fecha futura' };
  if (fecha < `${Number(hoy.slice(0, 4)) - 6}-01-01`) return { error: 'La fecha es demasiado antigua' };
  const inicio = String(b.inicio ?? base.inicio ?? ''), fin = String(b.fin ?? base.fin ?? '');
  const h = calcularHoras(inicio, fin);
  if (h.error) return { error: h.error };
  const tipo = String(b.tipo ?? base.tipo ?? '').toUpperCase();
  if (!TIPOS[tipo]) return { error: `Tipo de clase no válido (${Object.values(TIPOS).join(', ')})` };
  const supervisor = txt(b.supervisor ?? base.supervisor, 120);
  if (!supervisor) return { error: 'Indica el profesor o coordinador' };
  const notas = b.notas !== undefined ? txt(b.notas, 300) : (base.notas ?? null);
  return { data: { fecha, inicio, fin, horas: h.horas, tipo, supervisor, notas } };
}

// ¿Se pisa con otra práctica de la misma persona el mismo día?
function solapa(existentes, nuevo, ignorarId) {
  const a = minutos(nuevo.inicio), z = minutos(nuevo.fin);
  return existentes.find(e => e.id !== ignorarId && e.fecha === nuevo.fecha && minutos(e.inicio) < z && a < minutos(e.fin)) || null;
}

function resumen(registros, requeridas) {
  const porTipo = Object.fromEntries(Object.keys(TIPOS).map(k => [k, 0]));
  let total = 0;
  for (const r of registros) { porTipo[r.tipo] = r2((porTipo[r.tipo] || 0) + r.horas); total += r.horas; }
  total = r2(total);
  return {
    totalHoras: total, registros: registros.length, porTipo,
    requeridas: requeridas ?? null,
    restantes: requeridas != null ? r2(Math.max(0, requeridas - total)) : null,
    completa: requeridas != null && total >= requeridas,
  };
}

function validarPlanilla(b = {}) {
  const d = {};
  if (b.titulacion !== undefined) d.titulacion = txt(b.titulacion, 200);
  if (b.entidad !== undefined) d.entidad = txt(b.entidad, 200);
  if (b.observacion !== undefined) d.observacion = txt(b.observacion, 1500);
  if (b.horasRequeridas !== undefined) {
    if (b.horasRequeridas === null || b.horasRequeridas === '') d.horasRequeridas = null;
    else { const n = Number(b.horasRequeridas); if (!isFinite(n) || n <= 0 || n > 5000) return { error: 'Las horas requeridas deben estar entre 1 y 5000' }; d.horasRequeridas = r2(n); }
  }
  if (b.cerrada !== undefined) d.cerrada = b.cerrada === true;
  return { data: d };
}

module.exports = { TIPOS, calcularHoras, validarRegistro, solapa, resumen, validarPlanilla, hoyISO, r2 };
