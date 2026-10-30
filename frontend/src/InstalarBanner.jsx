import { useState } from 'react';
import Icono from './Iconos';

const OCULTAR_DIAS = 14;

// Invita a instalar la app para usarla a pantalla completa (sin barra de direcciones).
// Android/Chrome: botón de instalación. iPhone/Safari: instrucciones («Añadir a pantalla de inicio»).
export default function InstalarBanner({ evento, onInstalar }) {
  const [oculto, setOculto] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem('instalar_oculto') || 0) < OCULTAR_DIAS * 864e5; } catch { return false; }
  });
  const instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const movil = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (instalada || oculto || !movil || (!evento && !ios)) return null;

  const cerrar = () => { try { localStorage.setItem('instalar_oculto', String(Date.now())); } catch {} setOculto(true); };
  return (
    <div className="instalar-banner" role="region" aria-label="Instalar la app">
      <div className="instalar-ico"><Icono n="instalar" size={22} /></div>
      <div className="instalar-txt">
        <strong>Usa la app a pantalla completa</strong>
        {evento
          ? <span>Instálala y se abre sin la barra del navegador.</span>
          : <span>Toca <b>Compartir</b> y luego <b>«Añadir a pantalla de inicio»</b>.</span>}
      </div>
      {evento && <button className="btn-primary" onClick={async () => { await onInstalar(); cerrar(); }}>Instalar</button>}
      <button className="icon-btn" onClick={cerrar} aria-label="Ocultar"><Icono n="cerrar" size={20} /></button>
    </div>
  );
}
