// Notificaciones push (Web Push + VAPID). Opt-in por dispositivo: solo recibe quien las activó en su perfil.
// Disponibles si el despliegue define VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (se generan con `npm run vapid`).
// El contenido viaja cifrado de extremo a extremo (aes128gcm): Google/Apple/Mozilla solo ven que hay un mensaje.
const webpush = require('web-push');

const PUBLICA = (process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVADA = (process.env.VAPID_PRIVATE_KEY || '').trim();
const SUJETO = (process.env.VAPID_SUBJECT || (process.env.ADMIN_EMAIL ? `mailto:${process.env.ADMIN_EMAIL}` : '')).trim();
// PUSH_SIMULADO=true: construye y cifra la petición pero no la envía (pruebas y CI, sin salir a internet)
const SIMULADO = process.env.PUSH_SIMULADO === 'true';

let disponible = false;
if (PUBLICA && PRIVADA) {
  try {
    if (!SUJETO) throw new Error('falta VAPID_SUBJECT (o ADMIN_EMAIL)');
    webpush.setVapidDetails(SUJETO, PUBLICA, PRIVADA);
    disponible = true;
  } catch (e) { console.error(`⚠️  Push desactivado: claves VAPID no válidas (${e.message})`); }
}

// El servidor hace una petición a la dirección que entrega el navegador: solo se aceptan los servicios de push conocidos
// (si no, un usuario podría usarlo para llamar a direcciones internas).
const HOSTS_PUSH = [/(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
function endpointValido(e) {
  try {
    const u = new URL(String(e));
    return String(e).length <= 1000 && u.protocol === 'https:' && !u.port && !u.username && !u.password && HOSTS_PUSH.some(r => r.test(u.hostname));
  } catch { return false; }
}

const b64url = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
// p256dh: punto P-256 sin comprimir (65 bytes, empieza por 0x04); auth: 16 bytes
function clavesValidas(k) {
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return false;
  const p = b64url(k.p256dh), a = b64url(k.auth);
  return p.length === 65 && p[0] === 0x04 && a.length === 16;
}

// Etiqueta corta del dispositivo (se muestra en el perfil para poder quitarlo); no se guarda el user-agent completo
function etiquetaDispositivo(ua = '') {
  const s = String(ua);
  const so = /iPhone|iPad|iPod/i.test(s) ? 'iPhone/iPad' : /Android/i.test(s) ? 'Android' : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'Mac' : /Linux/i.test(s) ? 'Linux' : 'Dispositivo';
  const nav = /Edg\//.test(s) ? 'Edge' : /SamsungBrowser/i.test(s) ? 'Samsung Internet' : /Firefox|FxiOS/i.test(s) ? 'Firefox' : /Chrome|CriOS/i.test(s) ? 'Chrome' : /Safari/i.test(s) ? 'Safari' : '';
  return `${so}${nav ? ` · ${nav}` : ''}`.slice(0, 40);
}

/**
 * Envía un mensaje a unas suscripciones. Devuelve { enviadas, fallidas, caducadas: [ids] }.
 * Las que el servicio de push da por desaparecidas (404/410) se devuelven para borrarlas.
 */
async function enviar(subs, { title, body, tag, url } = {}) {
  const res = { enviadas: 0, fallidas: 0, caducadas: [] };
  if (!disponible || !subs.length) return res;
  const payload = JSON.stringify({ title: String(title || '').slice(0, 80), body: String(body || '').slice(0, 180), tag: tag || 'ski-jornada', url: url || '/' });
  for (let i = 0; i < subs.length; i += 10) {
    await Promise.all(subs.slice(i, i + 10).map(async s => {
      const dest = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        if (SIMULADO) { webpush.generateRequestDetails(dest, payload, { TTL: 3600 }); console.log(`🔔 [SIMULADO] push → ${s.dispositivo || 'dispositivo'}: ${title}`); }
        else await webpush.sendNotification(dest, payload, { TTL: 3600, urgency: 'normal', timeout: 10000 });
        res.enviadas++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) res.caducadas.push(s.id);
        else { res.fallidas++; if (!SIMULADO) console.error('push:', e.statusCode || e.message); }
      }
    }));
  }
  return res;
}

module.exports = { enviar, endpointValido, clavesValidas, etiquetaDispositivo, publica: () => PUBLICA, disponible: () => disponible, simulado: () => SIMULADO };
