// Utilidades de notificaciones push (Web Push) en el navegador.
export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const esAndroid = () => /android/i.test(navigator.userAgent);
export const estaInstalada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// En iPhone el navegador normal no expone PushManager: solo existe en la app añadida a la pantalla de inicio (iOS 16.4 o superior)
export const soportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const aBytes = b64 => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};

// El service worker solo se registra en producción: en desarrollo `ready` nunca se resuelve, por eso el plazo
const registroListo = (ms = 3000) => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), ms))]);

export async function suscripcionActual() {
  if (!soportaPush()) return null;
  try { const reg = await registroListo(); return reg ? await reg.pushManager.getSubscription() : null; } catch { return null; }
}

/** Pide permiso (hay que llamarla desde un toque del usuario), suscribe el dispositivo y lo da de alta en el servidor. */
export async function activarPush({ api, headers, publicKey }) {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, permiso };
  const reg = await registroListo(5000);
  if (!reg) return { ok: false, permiso, motivo: 'sin-sw' };
  let sub = await reg.pushManager.getSubscription();
  if (sub) { // si la clave del servidor cambió, la suscripción vieja ya no sirve
    const actual = sub.options?.applicationServerKey && new Uint8Array(sub.options.applicationServerKey);
    const nueva = aBytes(publicKey);
    if (actual && (actual.length !== nueva.length || actual.some((b, i) => b !== nueva[i]))) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(publicKey) });
  await api.post('/api/push/suscribir', { subscription: sub.toJSON() }, { headers });
  return { ok: true, permiso };
}

/** Quita este dispositivo del servidor y del navegador. Con `rapido` no espera más de un par de segundos (para el cierre de sesión). */
export async function desactivarPush({ api, headers, rapido = false }) {
  const tarea = (async () => {
    const sub = await suscripcionActual();
    if (!sub) return;
    try { await api.post('/api/push/baja', { endpoint: sub.endpoint }, { headers }); } catch { /* si no hay red, el servidor lo limpia al fallar el envío */ }
    try { await sub.unsubscribe(); } catch { /* ya estaba dada de baja */ }
  })();
  if (!rapido) return tarea;
  return Promise.race([tarea, new Promise(r => setTimeout(r, 2000))]);
}

/** Vuelve a dar de alta la suscripción existente en el servidor (por si se perdió); no pide permiso. */
export async function resincronizarPush({ api, headers }) {
  if (!soportaPush() || Notification.permission !== 'granted') return;
  const sub = await suscripcionActual();
  if (sub) try { await api.post('/api/push/suscribir', { subscription: sub.toJSON() }, { headers }); } catch { /* sin red o servidor sin push */ }
}
