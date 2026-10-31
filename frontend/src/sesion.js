// Sesión persistente del profesor. El token vive en localStorage y se copia a IndexedDB:
// si el sistema limpia uno de los dos (iOS/Android lo hacen con poco espacio), se restaura del otro.
const BD = 'sj-sesion', ALMACEN = 'kv', CLAVE = 'sesion';

const abrirBD = () => new Promise((ok, ko) => {
  try {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  } catch (e) { ko(e); }
});
const op = async (modo, fn) => {
  const bd = await abrirBD();
  return new Promise((ok, ko) => {
    const tx = bd.transaction(ALMACEN, modo);
    const res = fn(tx.objectStore(ALMACEN));
    tx.oncomplete = () => { bd.close(); ok(res?.result); };
    tx.onerror = tx.onabort = () => { bd.close(); ko(tx.error); };
  });
};

export function leerSesion() {
  try {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return token && user ? { token, user } : { token: null, user: null };
  } catch { return { token: null, user: null }; }
}

export function guardarSesion(token, user) {
  try { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); } catch {}
  op('readwrite', s => s.put({ token, user }, CLAVE)).catch(() => {});
  // Pide al navegador que no borre estos datos por falta de espacio
  try { navigator.storage?.persist?.(); } catch {}
}

export function borrarSesion() {
  try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch {}
  op('readwrite', s => s.delete(CLAVE)).catch(() => {});
}

// Si localStorage quedó vacío pero hay copia en IndexedDB, la recupera.
export async function restaurarSesion() {
  const actual = leerSesion();
  if (actual.token) return actual;
  try {
    const copia = await op('readonly', s => s.get(CLAVE));
    if (copia?.token && copia?.user) { guardarSesion(copia.token, copia.user); return copia; }
  } catch {}
  return actual;
}
