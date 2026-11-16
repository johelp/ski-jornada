// Flota de clientes: validación del registro y comprobación del estado de cada instalación.
// Sin secretos: solo se consulta lo público (/api/salud y /api/config) de cada cliente.
const { destinoPublico } = require('./redSegura');

const TRAMOS = ['PEQUENA', 'MEDIA', 'GRANDE', 'A_MEDIDA', 'DEMO', 'PILOTO'];
const ANILLOS = ['DEMO', 'PILOTO', 'CLIENTE']; // orden de actualización: primero la demo, luego el piloto, al final el resto
const ESTADOS = ['AL_DIA', 'DESACTUALIZADO', 'CAIDO'];

const txt = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));

// Dirección base (sin ruta): https en producción; en desarrollo se admite http://localhost para las pruebas
function urlBase(v, { obligatoria = false } = {}) {
  const s = txt(v, 300);
  if (!s) return obligatoria ? { error: 'Falta la dirección' } : { valor: null };
  let u;
  try { u = new URL(s); } catch { return { error: `Dirección no válida: ${s}` }; }
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return { error: 'La dirección debe empezar por https://' };
  if (u.username || u.password) return { error: 'La dirección no puede llevar usuario ni contraseña' };
  return { valor: u.origin };
}

const fecha = v => { if (v == null || v === '') return { valor: null }; const d = new Date(v); return isNaN(d) ? { error: 'Fecha no válida' } : { valor: d }; };

/** Valida el cuerpo de una alta/edición. Devuelve { data } o { error }. parcial=true para ediciones (solo valida lo enviado). */
function validarCliente(b = {}, { parcial = false } = {}) {
  const data = {};
  const tiene = k => !parcial || b[k] !== undefined;
  if (tiene('nombre')) { const n = txt(b.nombre, 120); if (!n) return { error: 'El nombre es obligatorio' }; data.nombre = n; }
  if (tiene('tramo')) { const t = String(b.tramo || 'MEDIA').toUpperCase(); if (!TRAMOS.includes(t)) return { error: `Tramo no válido (${TRAMOS.join(', ')})` }; data.tramo = t; }
  if (tiene('anillo')) { const a = String(b.anillo || 'CLIENTE').toUpperCase(); if (!ANILLOS.includes(a)) return { error: `Anillo no válido (${ANILLOS.join(', ')})` }; data.anillo = a; }
  if (tiene('urlApi')) { const r = urlBase(b.urlApi, { obligatoria: true }); if (r.error) return { error: `API: ${r.error}` }; data.urlApi = r.valor; }
  if (tiene('urlApp')) { const r = urlBase(b.urlApp); if (r.error) return { error: `App: ${r.error}` }; data.urlApp = r.valor; }
  for (const [k, max] of [['railwayProyecto', 120], ['pagesProyecto', 120], ['versionEsperada', 20], ['notas', 1000]]) if (tiene(k)) data[k] = txt(b[k], max);
  if (data.versionEsperada && !/^\d+\.\d+\.\d+$/.test(data.versionEsperada)) return { error: 'La versión esperada debe ser del tipo 1.2.0' };
  for (const k of ['altaAt', 'renovacionAt']) if (tiene(k)) { const r = fecha(b[k]); if (r.error) return { error: `${k}: ${r.error}` }; data[k] = r.valor; }
  if (b.activo !== undefined) data.activo = b.activo === true;
  return { data };
}

async function pedir(url, ms) {
  const ini = Date.now();
  const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'ski-jornada-flota' } });
  return { r, ms: Date.now() - ini };
}

/**
 * Consulta /api/salud (y /api/config para saber si el push está activo) de un cliente.
 * referencia: versión con la que se compara si el cliente no tiene versionEsperada.
 * Devuelve { estado, version, commit, latenciaMs, push, error }.
 */
async function comprobar(c, { referencia, comprobarDestino = destinoPublico, timeoutMs = 8000 } = {}) {
  const res = { estado: 'CAIDO', version: null, commit: null, latenciaMs: null, push: null, error: null };
  try {
    if (!(await comprobarDestino(c.urlApi))) throw new Error('destino no permitido');
    const { r, ms } = await pedir(`${c.urlApi}/api/salud`, timeoutMs);
    res.latenciaMs = ms;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!j || j.ok !== true) throw new Error('respuesta inesperada');
    res.version = typeof j.version === 'string' ? j.version.slice(0, 20) : null;
    res.commit = typeof j.commit === 'string' ? j.commit.slice(0, 12) : null;
    const objetivo = c.versionEsperada || referencia;
    res.estado = objetivo && res.version !== objetivo ? 'DESACTUALIZADO' : 'AL_DIA';
    try {
      const { r: rc } = await pedir(`${c.urlApi}/api/config`, timeoutMs);
      if (rc.ok) { const cfg = await rc.json(); res.push = cfg.pushDisponible === true; }
    } catch { /* el push es informativo: no cambia el estado */ }
  } catch (e) {
    res.estado = 'CAIDO';
    res.error = String(e.name === 'TimeoutError' ? 'sin respuesta a tiempo' : e.message).slice(0, 200);
  }
  return res;
}

// Varias comprobaciones a la vez, con límite de simultáneas
async function comprobarTodos(clientes, opts = {}, simultaneas = 5) {
  const out = new Array(clientes.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(simultaneas, clientes.length) }, async () => {
    while (i < clientes.length) { const n = i++; out[n] = await comprobar(clientes[n], opts); }
  }));
  return out;
}

// Campos de la última comprobación tal como se guardan en la base
const comoCampos = r => ({ ultimaComprobacionAt: new Date(), ultimoEstado: r.estado, ultimaVersion: r.version, ultimoCommit: r.commit, ultimaLatenciaMs: r.latenciaMs, ultimoPush: r.push, ultimoError: r.error });

module.exports = { TRAMOS, ANILLOS, ESTADOS, validarCliente, comprobar, comprobarTodos, comoCampos };
