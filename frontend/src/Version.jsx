import { useState, useEffect } from 'react';

/* global __APP_VERSION__, __APP_COMMIT__, __APP_FECHA__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'local';
export const APP_FECHA = typeof __APP_FECHA__ !== 'undefined' ? __APP_FECHA__ : '';

// Borra la caché de la PWA y recarga: sirve cuando el móvil se quedó con una versión vieja
async function actualizarApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map(r => r.unregister()));
    const claves = (await window.caches?.keys?.()) || [];
    await Promise.all(claves.map(k => window.caches.delete(k)));
  } catch { /* si falla, la recarga normal también sirve */ }
  window.location.reload();
}

// Versión de la app (y del servidor si se pasa `api`). Avisa cuando no coinciden: la app está desactualizada o el servidor aún no se desplegó.
export default function VersionApp({ api }) {
  const [srv, setSrv] = useState(null);
  useEffect(() => {
    if (!api) return undefined;
    let vivo = true;
    api.get('/api/salud').then(r => vivo && setSrv(r.data)).catch(() => {});
    return () => { vivo = false; };
  }, [api]);
  const distinta = srv?.version && srv.version !== APP_VERSION;
  return (
    <div className="version-app">
      <span title={`Compilada el ${APP_FECHA || '—'} · commit ${APP_COMMIT}`}>Versión {APP_VERSION}{APP_COMMIT !== 'local' ? ` · ${APP_COMMIT}` : ''}</span>
      {srv?.version && <span> · servidor {srv.version}</span>}
      {distinta && <button type="button" className="version-actualizar" onClick={actualizarApp}>Actualizar</button>}
    </div>
  );
}
