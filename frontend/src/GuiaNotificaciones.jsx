import { useState } from 'react';
import { esIOS } from './push';

// Guía visual para activar las notificaciones en iPhone y en Android. Las ilustraciones son esquemas (no capturas) y son decorativas:
// cada paso lleva su explicación en texto.
const Marco = ({ children }) => (
  <svg viewBox="0 0 120 96" className="guia-ilu" aria-hidden="true" focusable="false">
    <rect x="34" y="3" width="52" height="90" rx="9" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
    <rect x="52" y="6" width="16" height="3" rx="1.5" fill="#e2e8f0" />
    {children}
  </svg>
);
const Foco = ({ x, y, w, h, r = 6 }) => <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke="#f97316" strokeWidth="2.2" strokeDasharray="4 2.5" />;
const Linea = ({ x, y, w }) => <rect x={x} y={y} width={w} height="4" rx="2" fill="#e2e8f0" />;
const Boton = ({ x, y, w, t, activo }) => (
  <g><rect x={x} y={y} width={w} height="13" rx="6.5" fill={activo ? '#0f4c81' : '#e2e8f0'} /><text x={x + w / 2} y={y + 9.2} textAnchor="middle" fontSize="6.5" fontWeight="700" fill={activo ? '#fff' : '#475569'}>{t}</text></g>
);
const Campana = ({ x, y, c = '#0f4c81' }) => (
  <g transform={`translate(${x} ${y})`} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M-6 4V-1a6 6 0 0112 0v5l2 2H-8z" /><path d="M-2 9a2 2 0 004 0" /></g>
);
const Compartir = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`} fill="none" stroke="#0f4c81" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M-5 0v7h10V0M0 5V-8M-3.5-4.5L0-8l3.5 3.5" /></g>
);
const Icono = ({ x, y, s = 14 }) => (
  <g transform={`translate(${x} ${y})`}><rect width={s} height={s} rx={s * 0.24} fill="#0f4c81" /><path d={`M${s * .2} ${s * .72}l${s * .24}-${s * .36} ${s * .16} ${s * .22} ${s * .12}-${s * .16} ${s * .12} ${s * .3}z`} fill="#fff" /></g>
);

const ILU = {
  safari: <Marco><circle cx="60" cy="42" r="14" fill="#e0f2fe" stroke="#0ea5e9" strokeWidth="2" /><path d="M60 32l5 12-12 4 4-12z" fill="#0ea5e9" /><Linea x="42" y="70" w="36" /><Foco x="40" y="66" w="40" h="12" /></Marco>,
  compartir: <Marco><Linea x="44" y="16" w="32" /><Linea x="44" y="24" w="22" /><rect x="40" y="74" width="40" height="14" rx="4" fill="#f1f5f9" /><Compartir x="60" y="82" /><Foco x="52" y="72" w="16" h="18" /></Marco>,
  anadir: <Marco><rect x="38" y="40" width="44" height="48" rx="6" fill="#f1f5f9" /><Linea x="44" y="48" w="30" /><rect x="41" y="58" width="38" height="14" rx="4" fill="#fff" stroke="#f97316" strokeWidth="1.6" /><g transform="translate(47 65)" fill="none" stroke="#0f4c81" strokeWidth="1.6"><rect x="-4" y="-4" width="8" height="8" rx="2" /><path d="M0-2v4M-2 0h4" /></g><Linea x="56" y="63" w="20" /><Linea x="44" y="77" w="30" /></Marco>,
  icono: <Marco>{[0, 1, 2, 3].map(i => <rect key={i} x={42 + (i % 3) * 13} y={20 + Math.floor(i / 3) * 16} width="10" height="10" rx="3" fill="#e2e8f0" />)}<Icono x="42" y="36" /><Foco x="39" y="33" w="20" h="20" r="7" /><Linea x="44" y="74" w="32" /></Marco>,
  permitir: <Marco><rect x="40" y="30" width="40" height="38" rx="7" fill="#f8fafc" stroke="#cbd5e1" /><Campana x="60" y="41" /><Linea x="46" y="52" w="28" /><Boton x="42" y="58" w="17" t="No" /><Boton x="61" y="58" w="17" t="Permitir" activo /><Foco x="59" y="56" w="21" h="17" r="8" /></Marco>,
  ajustesIos: <Marco><circle cx="60" cy="28" r="8" fill="none" stroke="#64748b" strokeWidth="2" /><circle cx="60" cy="28" r="2.5" fill="#64748b" /><Linea x="42" y="46" w="36" /><rect x="42" y="56" width="36" height="14" rx="4" fill="#f1f5f9" /><Linea x="46" y="61" w="16" /><rect x="66" y="59" width="10" height="8" rx="4" fill="#22c55e" /><circle cx="72" cy="63" r="3" fill="#fff" /><Foco x="40" y="54" w="40" h="18" /></Marco>,
  chrome: <Marco><circle cx="60" cy="42" r="14" fill="#fff" stroke="#cbd5e1" strokeWidth="2" /><path d="M60 28a14 14 0 0112 7H60z" fill="#ef4444" /><path d="M72 35a14 14 0 01-6 19l-6-12z" fill="#facc15" /><path d="M54 54a14 14 0 01-12-19l12 0z" fill="#22c55e" /><circle cx="60" cy="42" r="5.5" fill="#3b82f6" stroke="#fff" strokeWidth="2" /></Marco>,
  menu: <Marco><rect x="38" y="12" width="44" height="12" rx="6" fill="#f1f5f9" /><g fill="#475569"><circle cx="77" cy="15" r="1.4" /><circle cx="77" cy="18" r="1.4" /><circle cx="77" cy="21" r="1.4" /></g><rect x="48" y="28" width="34" height="38" rx="5" fill="#fff" stroke="#cbd5e1" /><Linea x="52" y="34" w="22" /><Linea x="52" y="42" w="18" /><rect x="50" y="49" width="30" height="9" rx="3" fill="#e0f2fe" /><Linea x="53" y="52" w="22" /><Foco x="49" y="47" w="32" h="13" r="4" /></Marco>,
  activar: <Marco><Linea x="42" y="16" w="36" /><Linea x="42" y="24" w="26" /><Campana x="60" y="46" /><Boton x="43" y="58" w="34" t="Activar" activo /><Foco x="41" y="56" w="38" h="17" r="8" /></Marco>,
  candado: <Marco><rect x="38" y="12" width="44" height="12" rx="6" fill="#f1f5f9" /><g transform="translate(46 18)" fill="none" stroke="#475569" strokeWidth="1.6"><rect x="-3" y="-1" width="6" height="5" rx="1" /><path d="M-1.8-1v-1.4a1.8 1.8 0 013.6 0V-1" /></g><Foco x="40" y="12" w="14" h="12" r="6" /><rect x="40" y="34" width="40" height="14" rx="4" fill="#f1f5f9" /><Campana x="48" y="41" c="#64748b" /><Linea x="56" y="39" w="14" /><rect x="68" y="38" width="10" height="8" rx="4" fill="#22c55e" /><circle cx="74" cy="42" r="3" fill="#fff" /><Foco x="38" y="32" w="44" h="18" /></Marco>,
};

const PASOS = {
  ios: [
    { ilu: 'safari', t: 'Abre la app en Safari', d: 'En iPhone las notificaciones solo funcionan con la app instalada, y para instalarla hay que usar Safari (iOS 16.4 o superior).' },
    { ilu: 'compartir', t: 'Toca «Compartir»', d: 'Es el cuadrado con la flecha hacia arriba, en la barra inferior de Safari.' },
    { ilu: 'anadir', t: '«Añadir a pantalla de inicio»', d: 'Búscalo en la lista (desliza hacia arriba si no lo ves) y toca «Añadir».' },
    { ilu: 'icono', t: 'Abre la app desde su icono', d: 'Ciérrala en Safari y ábrela desde el icono nuevo de tu pantalla de inicio. Entra con tu correo.' },
    { ilu: 'permitir', t: 'Activa y toca «Permitir»', d: 'En «Mi perfil» pulsa «Activar notificaciones». Cuando iOS pregunte, toca «Permitir».' },
  ],
  android: [
    { ilu: 'chrome', t: 'Abre la app en Chrome', d: 'Funciona en Chrome, Edge, Firefox y Samsung Internet.' },
    { ilu: 'menu', t: 'Instálala (recomendado)', d: 'Toca el menú ⋮ y «Instalar aplicación». Así se abre a pantalla completa y los avisos llegan igual aunque no la tengas abierta.' },
    { ilu: 'activar', t: 'Pulsa «Activar notificaciones»', d: 'Está en «Mi perfil», en el cuadro de notificaciones.' },
    { ilu: 'permitir', t: 'Toca «Permitir»', d: 'Android te preguntará si la app puede enviarte notificaciones.' },
  ],
};

const BLOQUEO = {
  ios: { ilu: 'ajustesIos', t: 'Si las bloqueaste', d: 'Ajustes del iPhone → Notificaciones → busca la app → activa «Permitir notificaciones». Vuelve a la app y pulsa «Activar».' },
  android: { ilu: 'candado', t: 'Si las bloqueaste', d: 'Toca el candado (o ⓘ) junto a la dirección → Permisos → Notificaciones → Permitir. En la app instalada: mantén pulsado su icono → Información de la app → Notificaciones. Después pulsa «Activar».' },
};

const CONSEJOS = {
  ios: ['No funcionan en la pestaña normal de Safari: solo en la app instalada.', 'Revisa que el modo «No molestar» o el Modo de concentración no las silencie.'],
  android: ['Si tu móvil ahorra batería de forma agresiva (Xiaomi, Huawei, Samsung…), permite que la app funcione en segundo plano para que los avisos lleguen siempre.', 'Revisa que el modo «No molestar» no las silencie.'],
};

export default function GuiaNotificaciones({ inicial, bloqueado = false }) {
  const [so, setSo] = useState(inicial || (esIOS() ? 'ios' : 'android'));
  const pasos = bloqueado ? [BLOQUEO[so], ...PASOS[so].slice(-1)] : PASOS[so];
  return (
    <div className="guia-push">
      <div className="guia-tabs" role="tablist" aria-label="Tu móvil">
        {[['ios', 'iPhone'], ['android', 'Android']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={so === id} className={so === id ? 'on' : ''} onClick={() => setSo(id)}>{label}</button>
        ))}
      </div>
      <ol className="guia-pasos">
        {pasos.map((p, i) => (
          <li key={p.t} className="guia-paso">
            {ILU[p.ilu]}
            <div><strong><span className="guia-num" aria-hidden="true">{bloqueado ? '!' : i + 1}</span>{p.t}</strong><p>{p.d}</p></div>
          </li>
        ))}
      </ol>
      <ul className="guia-consejos">{CONSEJOS[so].map(c => <li key={c}>{c}</li>)}</ul>
    </div>
  );
}
