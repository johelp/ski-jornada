/**
 * Módulo WhatsApp para Ski Jornada — usa Baileys (@whiskeysockets/baileys)
 *
 * Para habilitar:
 *   1. npm install @whiskeysockets/baileys
 *   2. Añadir en .env:  WHATSAPP_ENABLED=true
 *   3. Reiniciar el servidor y escanear el QR en /api/whatsapp/qr
 *
 * Formatos de teléfono: internacional sin el '+', ej. '34612345678'
 */

const path = require('path');
const fs   = require('fs');

let sock     = null;
let qrActual = null;
let conectado = false;

const SESSION_DIR = path.join(__dirname, 'whatsapp-session');
fs.mkdirSync(SESSION_DIR, { recursive: true });

async function init() {
  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      Browsers,
    } = require('@whiskeysockets/baileys');

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      browser: Browsers.macOS('Ski Jornada'),
      printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrActual  = qr;
        conectado = false;
        console.log('📱 WhatsApp: escanea el QR en /api/whatsapp/qr');
      }
      if (connection === 'open') {
        conectado = true;
        qrActual  = null;
        console.log('📱 WhatsApp: conectado');
      }
      if (connection === 'close') {
        conectado = false;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) setTimeout(init, 5000);
      }
    });
  } catch (err) {
    console.error('WhatsApp init error:', err.message);
  }
}

function getStatus() {
  return { connected: conectado, hasQR: !!qrActual };
}

function getQR() {
  return qrActual;
}

async function enviarMensaje(telefono, texto) {
  if (!sock || !conectado) throw new Error('WhatsApp no conectado');
  // Normalize: remove +, spaces, dashes
  const numero = telefono.replace(/[^0-9]/g, '');
  const jid = `${numero}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: texto });
}

module.exports = { init, getStatus, getQR, enviarMensaje };
