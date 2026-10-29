// Iconos SVG de la interfaz (trazo 1.8, 24×24). Sustituyen a los emojis: se ven igual en todos los móviles
// y heredan el color del texto. Uso: <Icono n="reloj" />
const RUTAS = {
  inicio: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  clases: <><path d="M3 20l6-10 4 6 3-4 5 8z" /><circle cx="17" cy="6" r="2" /></>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  informe: <><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 13h6M10 17h6" /></>,
  docs: <><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></>,
  perfil: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  campana: <><path d="M6 17V11a6 6 0 0112 0v6l2 2H4z" /><path d="M10 21h4" /></>,
  mas: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  usuarios: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c3 0 5 1.5 5 4.5" /></>,
  zonas: <><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  config: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  presencia: <><circle cx="12" cy="12" r="3" /><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /></>,
  solicitudes: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  avisos: <><path d="M3 11v2a1 1 0 001 1h3l5 4V6L7 10H4a1 1 0 00-1 1z" /><path d="M16 9a4 4 0 010 6M19 6.5a8 8 0 010 11" /></>,
  salir: <><path d="M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5" /><path d="M16 8l4 4-4 4M20 12H9" /></>,
  escudo: <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />,
  instalar: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  editar: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  borrar: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  alerta: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  descargar: <><path d="M12 4v11M7 11l5 5 5-5" /><path d="M5 20h14" /></>,
  mas1: <path d="M12 5v14M5 12h14" />,
  nfc: <><path d="M8 6c3 3 3 9 0 12M12 4c4.5 4 4.5 12 0 16M16 2c6 5.5 6 14.5 0 20" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.5M14 21h3M21 17v4" /></>,
};

export default function Icono({ n, size = 24, className = '', ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={`ico ${className}`} {...rest}>
      {RUTAS[n] || RUTAS.mas}
    </svg>
  );
}

export const LogoMarca = ({ size = 32 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <path d="M6 23l7-11 4 6 3-4 6 9z" fill="#fff" /><circle cx="22.5" cy="9" r="2.2" fill="#f97316" />
  </svg>
);
