// Bonos y giftcards: lógica pura (código, vencimiento, estado, validación). Sin acceso a la base: se prueba aparte.
const crypto = require('crypto');

const TIPOS = ['BONO', 'GIFTCARD'];
const UNIDADES = ['EUROS', 'HORAS'];
const ESTADOS = ['ACTIVO', 'AGOTADO', 'VENCIDO', 'ANULADO'];
const r2 = n => Math.round(n * 100) / 100;
const MAX_VALOR = 100000;

// Sin 0/O, 1/I/L ni U (se confunden al dictar un código por teléfono)
const ALFABETO = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
function generarCodigo(tipo) {
  const b = crypto.randomBytes(8);
  const c = [...b].map(x => ALFABETO[x % ALFABETO.length]).join('');
  return `${tipo === 'GIFTCARD' ? 'GIFT' : 'BONO'}-${c.slice(0, 4)}-${c.slice(4)}`;
}
// Normaliza lo que teclea una persona: mayúsculas, sin espacios, con guiones en su sitio
function normalizarCodigo(s) {
  const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^(BONO|GIFT)([A-Z0-9]{4})([A-Z0-9]{4})$/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s || '').trim().toUpperCase();
}

const finDeDia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
function sumarMeses(d, n) { // 31 ene + 1 mes = 28 feb (no 3 mar)
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
}

/**
 * Vencimiento a partir de una fecha fija ({ venceAt: 'AAAA-MM-DD' }) o de una duración desde la emisión
 * ({ vencimiento: { cantidad: 6, unidad: 'MESES' | 'DIAS' } }). Sin ninguno: no vence.
 * Devuelve { valor: Date|null } o { error }.
 */
function calcularVencimiento(b = {}, desde = new Date()) {
  if (b.venceAt != null && b.venceAt !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.venceAt))) return { error: 'La fecha de vencimiento debe ser AAAA-MM-DD' };
    const [y, m, d] = String(b.venceAt).split('-').map(Number);
    const f = new Date(y, m - 1, d);
    if (isNaN(f) || f.getMonth() !== m - 1) return { error: 'Fecha de vencimiento no válida' };
    if (finDeDia(f) < desde) return { error: 'El vencimiento no puede ser anterior a hoy' };
    return { valor: finDeDia(f) };
  }
  const v = b.vencimiento;
  if (v && v.cantidad != null && v.cantidad !== '') {
    const n = Number(v.cantidad), u = String(v.unidad || '').toUpperCase();
    if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: 'La duración debe ser un número entero de 1 a 3650' };
    if (!['DIAS', 'MESES'].includes(u)) return { error: 'La unidad de la duración es DIAS o MESES' };
    if (u === 'MESES' && n > 120) return { error: 'Como máximo 120 meses' };
    return { valor: finDeDia(u === 'MESES' ? sumarMeses(desde, n) : new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + n)) };
  }
  return { valor: null };
}

// Estado derivado: anulado > agotado > vencido > activo. Un bono agotado no «vence».
function estadoDe(b, ahora = new Date()) {
  if (b.anulado) return 'ANULADO';
  if (b.saldo <= 0) return 'AGOTADO';
  if (b.venceAt && new Date(b.venceAt) < ahora) return 'VENCIDO';
  return 'ACTIVO';
}
// Días de calendario hasta el vencimiento (0 = vence hoy; negativo = ya venció)
const inicioDia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const diasParaVencer = (b, ahora = new Date()) => (b.venceAt ? Math.round((inicioDia(new Date(b.venceAt)) - inicioDia(ahora)) / 864e5) : null);

const txt = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cantidad > 0, con hasta 2 decimales, y tope razonable
function cantidadValida(n) {
  const x = Number(n);
  if (!isFinite(x) || x <= 0) return { error: 'La cantidad debe ser mayor que 0' };
  if (x > MAX_VALOR) return { error: `La cantidad no puede superar ${MAX_VALOR}` };
  if (Math.abs(x * 100 - Math.round(x * 100)) > 1e-6) return { error: 'Usa como máximo 2 decimales' };
  return { valor: r2(x) };
}

/** Valida una emisión. Devuelve { data } (campos del bono) o { error }. */
function validarEmision(b = {}, ahora = new Date()) {
  const tipo = String(b.tipo || 'BONO').toUpperCase(), unidad = String(b.unidad || '').toUpperCase();
  if (!TIPOS.includes(tipo)) return { error: `Tipo no válido (${TIPOS.join(' o ')})` };
  if (!UNIDADES.includes(unidad)) return { error: `Indica la unidad: ${UNIDADES.join(' u ')}` };
  const v = cantidadValida(b.valor);
  if (v.error) return { error: `Valor: ${v.error}` };
  const venc = calcularVencimiento(b, ahora);
  if (venc.error) return { error: venc.error };
  const email = txt(b.titularEmail, 200);
  if (email && !EMAIL.test(email)) return { error: 'El email del titular no es válido' };
  return { data: { tipo, unidad, valorInicial: v.valor, saldo: v.valor, venceAt: venc.valor, titularNombre: txt(b.titularNombre, 120), titularEmail: email, titularTelefono: txt(b.titularTelefono, 30), concepto: txt(b.concepto, 200), notas: txt(b.notas, 1000) } };
}

module.exports = { TIPOS, UNIDADES, ESTADOS, r2, generarCodigo, normalizarCodigo, calcularVencimiento, estadoDe, diasParaVencer, cantidadValida, validarEmision, finDeDia, txt };
