import { useState, useEffect } from 'react';
import Icono from './Iconos';
import { esIOS, estaInstalada, soportaPush, suscripcionActual } from './push';

const OCULTAR_DIAS = 14;

// Invita a activar las notificaciones (una vez; se puede ocultar 14 días). En iPhone solo aparece con la app ya instalada.
export default function BannerPush({ config, onIr }) {
  const [oculto, setOculto] = useState(() => { try { return Date.now() - Number(localStorage.getItem('push_oculto') || 0) < OCULTAR_DIAS * 864e5; } catch { return false; } });
  const [sinActivar, setSinActivar] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!config?.pushDisponible || !soportaPush() || (esIOS() && !estaInstalada()) || Notification.permission !== 'default') return;
      if (!(await navigator.serviceWorker.getRegistration())) return;
      if (vivo) setSinActivar(!(await suscripcionActual()));
    })();
    return () => { vivo = false; };
  }, [config]);
  if (oculto || !sinActivar) return null;
  const cerrar = () => { try { localStorage.setItem('push_oculto', String(Date.now())); } catch {} setOculto(true); };
  return (
    <div className="instalar-banner" role="region" aria-label="Activar notificaciones">
      <div className="instalar-ico" aria-hidden="true">🔔</div>
      <div className="instalar-txt"><strong>Activa las notificaciones</strong><span>Recibe los avisos de tu escuela en el móvil.</span></div>
      <button className="btn-primary" onClick={() => { cerrar(); onIr(); }}>Activar</button>
      <button className="icon-btn" onClick={cerrar} aria-label="Ocultar"><Icono n="cerrar" size={20} /></button>
    </div>
  );
}
