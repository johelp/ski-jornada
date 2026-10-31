/**
 * WhatsApp opcional (Baileys, cliente no oficial de WhatsApp Web).
 *
 * - Desactivado por defecto: no se carga nada hasta que administración pulsa «Generar QR».
 * - Estados: no_instalado · detenido · iniciando · esperando_qr · conectado · error
 * - La sesión (credenciales) se guarda en WHATSAPP_DIR (por defecto junto a la base, en el volumen)
 *   y el marcador `activo` hace que reconecte solo tras un reinicio.
 * - Los envíos van en cola, con pausa aleatoria entre mensajes y tope diario, para no parecer un robot.
 *
 * Aviso: no es la API oficial. WhatsApp puede bloquear el número; usar uno dedicado y pocos mensajes.
 */
const path = require('path');
const fs = require('fs');

let dir = null;
let sock = null;
let estado = 'detenido';
let detalle = null;
let qrTexto = null;
let qrImagen = null;
let numero = null;
let intentos = 0;
let temporizador = null;
let iniciando = false;
let baileys; // undefined = sin comprobar · null = no instalado

const MAX_DIA = parseInt(process.env.WHATSAPP_MAX_DIA || '300', 10);
const PREFIJO = String(process.env.WHATSAPP_PREFIJO || '34').replace(/\D/g, '');
let enviadosHoy = { dia: '', n: 0 };
let cola = Promise.resolve();

const log = (...a) => console.log('📱 WhatsApp:', ...a);
const marcador = () => path.join(dir, 'activo');
const hoy = () => new Date().toISOString().slice(0, 10);

function configurar(carpeta) { dir = carpeta; fs.mkdirSync(dir, { recursive: true }); }

async function cargarBaileys() {
  if (baileys !== undefined) return baileys;
  try { baileys = await import('@whiskeysockets/baileys'); } catch { baileys = null; }
  return baileys;
}

async function logger() {
  try { return (await import('pino')).default({ level: 'silent' }); }
  catch { const n = () => {}; const l = { level: 'silent', trace: n, debug: n, info: n, warn: n, error: n, fatal: n, child: () => l }; return l; }
}

function poner(e, d = null) { estado = e; detalle = d; if (e !== 'esperando_qr') { qrTexto = null; qrImagen = null; } }

async function conectar() {
  if (iniciando || sock) return;
  iniciando = true;
  try {
    const B = await cargarBaileys();
    if (!B) { poner('no_instalado'); return; }
    poner('iniciando');
    const { state, saveCreds } = await B.useMultiFileAuthState(path.join(dir, 'sesion'));
    const { version } = await B.fetchLatestBaileysVersion().catch(() => ({}));
    const s = B.default({
      auth: state, version, logger: await logger(), browser: B.Browsers.appropriate('Ski Jornada'),
      markOnlineOnConnect: false, syncFullHistory: false,
    });
    sock = s;
    s.ev.on('creds.update', saveCreds);
    s.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (s !== sock) return;
      if (qr) { qrTexto = qr; qrImagen = null; estado = 'esperando_qr'; detalle = null; }
      if (connection === 'open') {
        intentos = 0; numero = String(s.user?.id || '').split(/[:@]/)[0] || null;
        poner('conectado'); log('conectado', numero ? `(+${numero})` : '');
      }
      if (connection === 'close') {
        sock = null;
        const codigo = lastDisconnect?.error?.output?.statusCode;
        if (codigo === B.DisconnectReason.loggedOut) {
          log('sesión cerrada desde el móvil'); borrarSesion(); poner('detenido', 'Se cerró la sesión desde el móvil. Genera un QR nuevo.'); return;
        }
        if (!fs.existsSync(marcador())) { poner('detenido'); return; }
        // 515 = reinicio normal tras vincular; el resto, reintento con espera creciente
        const espera = codigo === B.DisconnectReason.restartRequired ? 500 : Math.min(60000, 3000 * 2 ** intentos++);
        poner('iniciando', 'Reconectando…');
        temporizador = setTimeout(() => { temporizador = null; conectar(); }, espera);
      }
    });
  } catch (e) {
    sock = null; poner('error', e.message); log('error:', e.message);
  } finally { iniciando = false; }
}

function borrarSesion() { try { fs.rmSync(path.join(dir, 'sesion'), { recursive: true, force: true }); } catch {} numero = null; }

/** «Generar QR»: activa el servidor y empieza a pedir el QR. */
async function iniciar() {
  if (!(await cargarBaileys())) { poner('no_instalado'); return estadoActual(); }
  fs.writeFileSync(marcador(), new Date().toISOString());
  if (!sock) await conectar();
  return estadoActual();
}

/** Apaga el servidor pero conserva la vinculación (se puede volver a activar sin QR). */
async function detener() {
  try { fs.rmSync(marcador(), { force: true }); } catch {}
  if (temporizador) { clearTimeout(temporizador); temporizador = null; }
  const s = sock; sock = null;
  try { s?.end?.(undefined); } catch {}
  poner('detenido');
  return estadoActual();
}

/** Cierra la sesión en WhatsApp y borra las credenciales. */
async function desvincular() {
  const s = sock;
  try { await s?.logout?.(); } catch {}
  await detener(); borrarSesion();
  return estadoActual();
}

/** Al arrancar el servidor: si estaba activado, reconecta con la sesión guardada. */
async function arrancarSiActivo() {
  if (dir && fs.existsSync(marcador())) await conectar();
}

async function estadoActual() {
  const instalado = (await cargarBaileys()) !== null;
  if (estado === 'esperando_qr' && qrTexto && !qrImagen) {
    try { qrImagen = await (await import('qrcode')).default.toDataURL(qrTexto, { margin: 1, width: 280 }); } catch { qrImagen = null; }
  }
  return {
    instalado, estado: instalado ? estado : 'no_instalado', detalle, qr: estado === 'esperando_qr' ? qrImagen : null,
    numero: estado === 'conectado' ? numero : null, vinculado: fs.existsSync(path.join(dir, 'sesion', 'creds.json')),
    activo: fs.existsSync(marcador()), enviadosHoy: enviadosHoy.dia === hoy() ? enviadosHoy.n : 0, maxDia: MAX_DIA,
  };
}

const conectado = () => estado === 'conectado' && !!sock;

function normalizar(tel) {
  let n = String(tel || '').replace(/[^\d]/g, '').replace(/^00/, '');
  if (n.length === 9 && PREFIJO) n = PREFIJO + n; // número nacional sin prefijo
  return n.length >= 10 && n.length <= 15 ? n : null;
}

/** Envío en cola con pausa aleatoria y tope diario. Rechaza si no hay conexión. */
function enviar(telefono, texto) {
  const n = normalizar(telefono);
  if (!n) return Promise.reject(new Error('Teléfono no válido (usa formato internacional, ej. +34612345678)'));
  if (!conectado()) return Promise.reject(new Error('WhatsApp no está conectado'));
  const tarea = cola.then(async () => {
    if (enviadosHoy.dia !== hoy()) enviadosHoy = { dia: hoy(), n: 0 };
    if (enviadosHoy.n >= MAX_DIA) throw new Error('Tope diario de mensajes alcanzado');
    if (!conectado()) throw new Error('WhatsApp no está conectado');
    const r = await sock.onWhatsApp(`${n}@s.whatsapp.net`).catch(() => null);
    if (r && r[0] && r[0].exists === false) throw new Error('Ese número no tiene WhatsApp');
    await sock.sendMessage(`${n}@s.whatsapp.net`, { text: String(texto).slice(0, 1500) });
    enviadosHoy.n++;
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500));
  });
  cola = tarea.catch(() => {});
  return tarea;
}

module.exports = { configurar, iniciar, detener, desvincular, arrancarSiActivo, estadoActual, conectado, enviar, normalizar };
