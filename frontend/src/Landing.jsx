import { useState, useEffect, useRef } from 'react';
import './Landing.css';
import { Pantalla, PANTALLAS } from './Mockups';
import { PoliticaPrivacidad } from './AceptacionLegal';
import { APP_VERSION, APP_COMMIT, APP_FECHA } from './Version';

// Marca por despliegue (variables de build de Cloudflare Pages; ver docs/MULTI-DESPLIEGUE.md)
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Ski Jornada';
const LUGAR = import.meta.env.VITE_ESCUELA_LUGAR || '';
const CONTACTO = /^\S+@\S+\.\S+$/.test(import.meta.env.VITE_CONTACTO_EMAIL || '') ? import.meta.env.VITE_CONTACTO_EMAIL : null;
// «Pedir demo» por WhatsApp. Esta instalación es la demo de venta: por defecto usa el número comercial.
// VITE_CONTACTO_WHATSAPP lo cambia (solo dígitos con prefijo, sin +) y el valor «no» oculta el botón (despliegues de cliente).
const WA_RAW = (import.meta.env.VITE_CONTACTO_WHATSAPP ?? '543412824082').replace(/\D/g, '');
// VITE_MODO_CLIENTE=1: despliegue de un cliente (landing solo de acceso, sin discurso de venta ni demo)
const MODO_CLIENTE = import.meta.env.VITE_MODO_CLIENTE === '1';
const WHATSAPP = MODO_CLIENTE || import.meta.env.VITE_CONTACTO_WHATSAPP === 'no' || WA_RAW.length < 8 ? null : WA_RAW;
const WA_URL = WHATSAPP ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola, quiero pedir una demo de ${import.meta.env.VITE_APP_NAME || 'Ski Jornada'} para mi escuela de esquí.`)}` : null;
const COLOR = /^#[0-9a-fA-F]{6}$/.test(import.meta.env.VITE_COLOR_PRIMARIO || '') ? import.meta.env.VITE_COLOR_PRIMARIO : null;

const Icon = ({ d, children }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d ? <path d={d} /> : children}</svg>
);

const ICONOS = {
  reloj: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
  clases: <Icon><path d="M4 19l5-9 4 6 3-4 4 7z" /><circle cx="17" cy="6" r="2" /></Icon>,
  informe: <Icon><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 13h6M10 17h6" /></Icon>,
  panel: <Icon><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="11" width="8" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></Icon>,
  correo: <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icon>,
  check: <Icon d="M5 12l5 5 9-10" />,
  movil: <Icon><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></Icon>,
  escudo: <Icon d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />,
  calendario: <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>,
  revision: <Icon><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></Icon>,
  comparar: <Icon><path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4" /></Icon>,
  colaboradores: <Icon><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.2c.6-.2 1.3-.3 2-.3 2.2 0 4 1.8 4 4" /></Icon>,
  documento: <Icon><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 17c1-2 2-2 3 0s2 0 3-1" /></Icon>,
  modulos: <Icon><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></Icon>,
  whatsapp: <Icon><path d="M3 21l1.6-4.6A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4-1z" /><path d="M9 8.5c.3 2.7 2.8 5.2 5.6 5.7l1.2-1.4-2-1-.8.6a4.5 4.5 0 01-2-2l.6-.8-1-2z" /></Icon>,
  bono: <Icon><path d="M3 9a2 2 0 002-2h14a2 2 0 002 2 2 2 0 000 4 2 2 0 00-2 2H5a2 2 0 00-2-2 2 2 0 000-4z" /><path d="M14 7v10" /></Icon>,
  enlace: <Icon><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Icon>,
};

const FUNCIONES = [
  { icono: 'reloj', titulo: 'Fichaje fiable', texto: 'Entrada y salida con QR rotativo, GPS o NFC. La hora la marca el servidor, no el móvil.' },
  { icono: 'informe', titulo: 'Registro de jornada con trazabilidad', texto: 'Informe mensual del registro de jornada. Los fichajes no se borran: las correcciones quedan anotadas con quién, cuándo y por qué.' },
  { icono: 'clases', titulo: 'Clases y primas, en segundos', texto: 'Cada profesor carga horas por disciplina con las primas (idioma, disca, repetida…) desde el móvil y puede deshacer.' },
  { icono: 'calendario', titulo: 'Mes y temporada', texto: 'El inicio muestra las horas del mes en curso y, con un toque, los totales de la temporada.' },
  { icono: 'revision', titulo: 'Revisión de administración', texto: 'Aprobar, marcar discrepancias o pedir correcciones, con notas que ve el profesor.' },
  { icono: 'comparar', titulo: 'Compara con tus reservas', texto: 'Cruza el resumen de instructores de tu sistema de reservas con lo cargado y detecta diferencias.' },
  { icono: 'colaboradores', titulo: 'Colaboradores y subcontratas', texto: 'Lleva la cuenta de horas dadas y recibidas con otras escuelas y autónomos: saldo, extracto en PDF y saldar por pago o compensación.' },
  { icono: 'documento', titulo: 'Documentos y firma', texto: 'Contratos y documentos por empleado. Firma con certificado (se comprueba que no se modificó) o en pantalla, como constancia de recepción.' },
  { icono: 'revision', titulo: 'Prácticas de formación', texto: 'Las personas en prácticas registran fecha, horario y tipo de clase; las horas se calculan solas y la escuela descarga la planilla de control en PDF, lista para firmar y sellar y entregar a la entidad que emite el título.' },
  { icono: 'bono', titulo: 'Bonos y giftcards', texto: 'Emite un bono con código de seguimiento (cierre de temporada, clases contratadas) o una giftcard, en euros o en horas, con vencimiento opcional. Se consume cuando la reserva ya está en tu sistema.' },
  { icono: 'modulos', titulo: 'A tu medida', texto: 'Cada escuela enciende solo lo que usa: fichaje, clases, días libres, prácticas, bonos, documentos, colaboradores, integraciones… ¿Solo clases y primas, sin fichar? También se puede.' },
  { icono: 'enlace', titulo: 'Se conecta con tus sistemas', texto: 'API con claves, webhooks firmados e importación del planning para reservas y nóminas.' },
  { icono: 'informe', titulo: 'Informe económico', texto: 'PDF mensual con horas, primas e importe estimado cuando hay tarifas cargadas.' },
  { icono: 'escudo', titulo: 'Datos protegidos', texto: 'Cada escuela con su propia instancia; cada profesor ve solo lo suyo, puede exportar sus datos y todo cambio queda en el registro de actividad.' },
];

const CAMBIO = [
  { antes: 'Las horas viven en papeles, hojas de cálculo y mensajes de WhatsApp.', ahora: 'Cada profesor ficha y carga sus clases desde el móvil; todo queda en un solo sitio.' },
  { antes: 'A fin de mes, perseguir a cada profesor y discutir las primas.', ahora: 'Cada profesor confirma su mes; administración revisa, aprueba o comenta, y el importe sale calculado.' },
  { antes: 'No hay forma clara de demostrar la jornada si hay una inspección o una reclamación.', ahora: 'Registro de jornada con hora del servidor y correcciones trazables: nada se borra, todo queda anotado.' },
  { antes: 'Las horas que se cubren con otras escuelas o autónomos se apuntan «de memoria».', ahora: 'Cuenta de horas dadas y recibidas con cada colaborador, con saldo y extracto en PDF.' },
  { antes: 'Los bonos y las tarjetas regalo viven en un papel o en un correo, y nadie sabe cuánto queda ni cuándo vencen.', ahora: 'Cada bono tiene su código, su saldo y su vencimiento; se consume contra la reserva y queda el historial.' },
  { antes: 'Cruzar lo cargado con las reservas es una tarea manual y lenta.', ahora: 'Se compara con el resumen de tu sistema de reservas y se marcan las diferencias.' },
];

const CASOS = [
  { icono: 'calendario', titulo: 'Cerrar el mes en una tarde', situacion: 'Hay 30 profesores y cada uno manda sus horas de una forma distinta.', ayuda: 'Cada uno carga y confirma en la app. Tú ves quién falta, revisas y descargas el informe del mes con importes.' },
  { icono: 'clases', titulo: 'Primas sin discusiones', situacion: 'Idioma, disca, clase repetida… y cada profesor las cuenta a su manera.', ayuda: 'Las primas se marcan al cargar la clase y la tarifa queda congelada al confirmar el mes: lo que ves es lo que se paga.' },
  { icono: 'reloj', titulo: 'Cumplir con el registro de jornada', situacion: 'La ley obliga a registrar la jornada y conservarla; el papel se pierde.', ayuda: 'Fichaje con QR, GPS o NFC, informe mensual y conservación. Si hay que corregir un fichaje, queda anotado quién, cuándo y por qué.' },
  { icono: 'colaboradores', titulo: 'Cubrir clases con otras escuelas', situacion: 'Hoy les cubres 5 horas y la semana que viene te cubren 2; nadie lleva la cuenta.', ayuda: 'Cargas las horas del día en segundos. La app calcula el saldo y lo saldas por pago o compensación, con extracto en PDF.' },
  { icono: 'comparar', titulo: 'Cuadrar con el sistema de reservas', situacion: 'Lo que dice el sistema de reservas no siempre coincide con lo que dieron los profesores.', ayuda: 'Importas el resumen de instructores y la app detecta diferencias de horas e importes antes de pagar.' },
  { icono: 'documento', titulo: 'Documentos y firmas del equipo', situacion: 'Contratos y políticas que hay que entregar, firmar y archivar.', ayuda: 'Subes el documento a cada empleado; firma con certificado o en pantalla y queda constancia de la recepción.' },
  { icono: 'revision', titulo: 'Profesores en prácticas', situacion: 'Recibes a personas recién tituladas que deben sumar horas para obtener su título, y cada una trae su papel.', ayuda: 'Cada persona registra su práctica con inicio y fin; tú añades una observación y descargas la planilla de control, con las horas por tipo de clase, para firmarla y sellarla.' },
  { icono: 'bono', titulo: 'Bonos de cierre de temporada y giftcards', situacion: 'Cierras la estación con clases ya cobradas, o te piden una tarjeta regalo para Navidad.', ayuda: 'Emites un bono con código (por horas o por importe) y vencimiento en meses o días; cuando la reserva está cargada en tu sistema lo consumes aquí y el saldo queda al día.' },
  { icono: 'calendario', titulo: 'Días libres sin olvidos en el cuadrante', situacion: 'Apruebas vacaciones y asuntos propios, pero a veces no llegan al planning.', ayuda: 'Cada solicitud aprobada se marca como «pasada a planning» y el panel te muestra las que aún faltan.' },
  { icono: 'correo', titulo: 'Avisos y recordatorios', situacion: 'Se olvidan de fichar la salida o de confirmar el mes.', ayuda: 'Recordatorios y avisos de la escuela llegan al móvil (notificaciones, correo y, si quieres, WhatsApp).' },
  { icono: 'escudo', titulo: 'Altas y bajas de temporada', situacion: 'Cada temporada entra y sale gente, y no quieres dejar accesos abiertos.', ayuda: 'Invitas por correo, cargas la lista de golpe y, al dar de baja, el acceso se corta al instante.' },
];

const FAQ = [
  ['¿Qué necesitan los profesores para usarla?', 'Un móvil y su correo. Se instala desde el navegador, sin tiendas de aplicaciones, y entran con un enlace o un código, sin contraseñas.'],
  ['¿Y si no hay cobertura en la montaña?', 'Hoy la app necesita conexión para guardar los datos. El modo sin cobertura está previsto en la hoja de ruta.'],
  ['¿Se conecta con nuestro sistema de reservas o de nóminas?', 'Se puede comparar con el resumen de instructores de tu sistema de reservas y tiene API, webhooks e importación del planning para conectarla con otros sistemas. Cada caso se estudia contigo.'],
  ['¿Qué pasa con los datos personales?', 'Cada escuela tiene su propia instalación y cada persona ve solo lo suyo. Incluye exportación de datos, registro de actividad y documentación para el RGPD, que conviene revisar con tu asesor.'],
  ['¿Cómo empezamos?', 'Pide una demo: te la enseñamos con tus casos reales. Si te encaja, preparamos tu instalación con tu administración y la lista de tu equipo.'],
  ['¿Y si solo necesito clases y primas, sin fichaje?', 'Cada escuela enciende solo lo que usa: el fichaje horario, las clases, los días libres, los bonos o los documentos se pueden apagar. No se borra nada y se puede volver a encender.'],
  ['¿Sirve para los profesores en prácticas?', 'Sí: marcas a la persona como «en prácticas» y ella registra fecha, inicio, fin, tipo de clase (particular, grupal, club, campamento, colegio…) y con qué profesor o coordinador. Las horas se calculan solas y generas la planilla de control en PDF para firmarla y sellarla. Si la entidad que emite el título pide un formato propio, se adapta.'],
  ['¿Se pueden gestionar bonos y tarjetas regalo?', 'Sí: bonos (por ejemplo, clases ya abonadas al cerrar la estación) y giftcards, en euros o en horas, con código de seguimiento y vencimiento opcional. Se consumen desde la app cuando la reserva ya está en tu sistema de reservas.'],
  ['¿Necesito la firma con certificado?', 'No. Se puede firmar con certificado digital (se comprueba que el documento no se tocó) o en pantalla, que deja constancia de recepción. Qué vale para cada documento lo decide tu asesor.'],
];

const PASOS = [
  { n: 1, titulo: 'La escuela crea su cuenta', texto: 'Una cuenta de administración, que puede ser de empresa y no de una persona concreta.' },
  { n: 2, titulo: 'Carga la lista del equipo', texto: 'Importa los profesores y sus correos, o invítalos uno a uno.' },
  { n: 3, titulo: 'Cada profesor se une', texto: 'Recibe su invitación, entra con su email y queda activo. Sin contraseñas.' },
  { n: 4, titulo: 'Se carga, se revisa y se liquida', texto: 'Los profesores cargan sus horas; administración revisa, compara y paga.' },
];

const ACCESOS = {
  profesor: {
    titulo: 'Acceso profesores',
    texto: 'Entra con el email con el que tu escuela te invitó. ¿No te llega el enlace? Pídele a administración que te invite.',
  },
  admin: {
    titulo: 'Acceso administración',
    texto: 'Entra con el correo de la cuenta de administración de tu escuela. Puede ser una cuenta de empresa, como administracion@tuescuela.com.',
  },
};

export default function Landing({
  emailLogin, setEmailLogin, enlaceEnviado, setEnlaceEnviado, pedirEnlace,
  cargando, pwaInstallEvent, instalarPWA, devForm, toast, api, verificarCodigo,
}) {
  const [codigo, setCodigo] = useState('');
  const [verPrivacidad, setVerPrivacidad] = useState(false);
  const [acceso, setAcceso] = useState(null);
  const [rol, setRol] = useState('profesor');
  const [pant, setPant] = useState(0);
  const inputRef = useRef(null);
  const abridorRef = useRef(null);

  const abrir = (tipo, e) => { abridorRef.current = e.currentTarget; setAcceso(tipo); };
  const cerrar = () => {
    setAcceso(null);
    setEnlaceEnviado(false);
    abridorRef.current?.focus();
  };

  useEffect(() => {
    if (!acceso) return;
    const onKey = e => e.key === 'Escape' && cerrar();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [acceso]);

  return (
    <div className="lp" style={COLOR ? { '--lp-primary': COLOR } : undefined}>
      <a className="lp-skip" href="#contenido">Saltar al contenido</a>

      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a className="lp-brand" href="#top" aria-label={`${APP_NAME}, inicio`}>
            <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill={COLOR || '#0f4c81'} />
              <path d="M6 23l7-11 4 6 3-4 6 9z" fill="#fff" /><circle cx="22.5" cy="9" r="2.2" fill="#f97316" />
            </svg>
            <span>{APP_NAME}</span>
          </a>
          <nav className="lp-nav-links" aria-label="Secciones">
            {!MODO_CLIENTE && <a href="#para-que-sirve">Para qué sirve</a>}
            {!MODO_CLIENTE && <a href="#casos">Casos de uso</a>}
            <a href="#pantallas">Pantallas</a>
            <a href="#funciones">Funciones</a>
            <a href="#como-funciona">Cómo funciona</a>
            {!MODO_CLIENTE && <a href="#preguntas">Preguntas</a>}
          </nav>
          <div className="lp-nav-act">
            {WA_URL && <a className="lp-btn lp-btn-wa lp-nav-demo" href={WA_URL} target="_blank" rel="noopener noreferrer">{ICONOS.whatsapp}<span>Pedir demo</span></a>}
            <button className="lp-btn lp-btn-ghost" onClick={e => abrir('profesor', e)}>Entrar</button>
          </div>
        </div>
      </header>

      <main id="contenido">
        <section className="lp-hero" id="top">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">Gestión de horas para escuelas de esquí</p>
              <h1>Horas, clases y primas de tu equipo, listas para liquidar</h1>
              <p className="lp-lead">
                La escuela da de alta su cuenta de administración y carga la lista de su equipo. Cada profesor recibe su
                invitación, ficha y carga sus clases desde el móvil, y administración revisa, compara con reservas, lleva las cuentas con colaboradores y liquida.
              </p>
              <div className="lp-cta">
                {WA_URL
                  ? <a className="lp-btn lp-btn-wa" href={WA_URL} target="_blank" rel="noopener noreferrer">{ICONOS.whatsapp}<span>Pedir una demo por WhatsApp</span></a>
                  : <button className="lp-btn lp-btn-primary" onClick={e => abrir('profesor', e)}>Acceso profesores</button>}
                {WA_URL
                  ? <a className="lp-btn lp-btn-outline" href="#pantallas">Ver la app por dentro</a>
                  : <button className="lp-btn lp-btn-outline" onClick={e => abrir('admin', e)}>Acceso administración</button>}
              </div>
              {!MODO_CLIENTE && <p className="lp-hint lp-demo-nota">Esta web es una <strong>demo con datos de ejemplo</strong>. <button className="lp-link" onClick={e => abrir('profesor', e)}>Entrar como profesor</button> · <button className="lp-link" onClick={e => abrir('admin', e)}>Entrar como administración</button></p>}
              <ul className="lp-trust">
                <li>{ICONOS.escudo}<span>Solo entra quien está en la lista de la escuela</span></li>
                <li>{ICONOS.correo}<span>Acceso por enlace al correo, sin contraseñas</span></li>
                <li>{ICONOS.movil}<span>App a pantalla completa, instalable</span></li>
              </ul>
            </div>

            <div className="lp-hero-visual">
              <Pantalla id="inicio" />
            </div>
          </div>
        </section>

        {!MODO_CLIENTE && <section className="lp-sec" id="para-que-sirve" aria-labelledby="t-sirve">
          <div className="lp-wrap">
            <h2 id="t-sirve">¿Para qué sirve?</h2>
            <p className="lp-lead">Para que la escuela sepa, sin perseguir a nadie, <strong>quién trabajó cuántas horas, qué clases dio, qué se le debe y qué debe a otras escuelas</strong>, y pueda demostrarlo.</p>
            <ul className="lp-cambio">
              {CAMBIO.map(c => (
                <li key={c.antes}>
                  <div className="lp-antes"><span>Antes</span>{c.antes}</div>
                  <div className="lp-ahora"><span>Con la app</span>{c.ahora}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>}

        <section className="lp-sec lp-sec-alt" id="pantallas" aria-labelledby="t-pantallas">
          <div className="lp-wrap">
            <h2 id="t-pantallas">Así se ve por dentro</h2>
            <p className="lp-lead lp-center">Pantallas reales de la app, con datos de ejemplo.</p>
            <div className="lp-seg" role="tablist" aria-label="Elegir vista">
              {[['profesor', 'Profesores'], ['admin', 'Administración']].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={rol === id} className={rol === id ? 'on' : ''} onClick={() => { setRol(id); setPant(0); }}>{label}</button>
              ))}
            </div>
            <div className="lp-show">
              <ul className="lp-show-list" role="tablist" aria-label="Pantallas">
                {PANTALLAS[rol].map((p, i) => (
                  <li key={p.id}>
                    <button role="tab" aria-selected={pant === i} className={pant === i ? 'on' : ''} onClick={() => setPant(i)}>
                      <strong>{p.titulo}</strong><span>{p.texto}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className={`lp-show-vista ${rol}`} role="tabpanel">
                <Pantalla id={PANTALLAS[rol][pant].id} />
              </div>
            </div>
          </div>
        </section>

        {!MODO_CLIENTE && <section className="lp-sec" id="casos" aria-labelledby="t-casos">
          <div className="lp-wrap">
            <h2 id="t-casos">Casos de uso</h2>
            <p className="lp-lead">Situaciones reales de una escuela y cómo se resuelven.</p>
            <div className="lp-casos">
              {CASOS.map(c => (
                <article key={c.titulo} className="lp-card lp-caso">
                  <div className="lp-ico">{ICONOS[c.icono]}</div>
                  <h3>{c.titulo}</h3>
                  <p className="lp-caso-sit"><strong>Situación:</strong> {c.situacion}</p>
                  <p><strong>Con la app:</strong> {c.ayuda}</p>
                </article>
              ))}
            </div>
          </div>
        </section>}

        <section className="lp-sec lp-sec-alt" id="funciones" aria-labelledby="t-funciones">
          <div className="lp-wrap">
            <h2 id="t-funciones">Todo lo que necesita una temporada</h2>
            <div className="lp-grid4">
              {FUNCIONES.map(f => (
                <article key={f.titulo} className="lp-card">
                  <div className="lp-ico">{ICONOS[f.icono]}</div>
                  <h3>{f.titulo}</h3>
                  <p>{f.texto}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-sec lp-sec-alt" aria-labelledby="t-roles">
          <div className="lp-wrap">
            <h2 id="t-roles">Administración invita, el equipo se une</h2>
            <div className="lp-roles">
              <article className="lp-role">
                <h3>Administración</h3>
                <p className="lp-hint">La cuenta de la escuela: puede ser de empresa, no tiene que ser una persona.</p>
                <ul>
                  <li>{ICONOS.check}Carga la lista de profesores o los invita uno a uno</li>
                  <li>{ICONOS.check}Ve quién ya entró y reenvía invitaciones</li>
                  <li>{ICONOS.check}Disciplinas, primas y tarifas configurables</li>
                  <li>{ICONOS.check}Revisa, aprueba y comenta las horas</li>
                  <li>{ICONOS.check}Compara con el sistema de reservas</li>
                  <li>{ICONOS.check}Cuenta de horas con colaboradores y subcontratas</li>
                  <li>{ICONOS.check}Corrige fichajes con trazabilidad y enciende solo los módulos que usa</li>
                </ul>
                <button className="lp-btn lp-btn-primary" onClick={e => abrir('admin', e)}>Entrar como administración</button>
              </article>
              <article className="lp-role">
                <h3>Profesores invitados</h3>
                <p className="lp-hint">Solo pueden entrar los que están en la lista de su escuela.</p>
                <ul>
                  <li>{ICONOS.check}Reciben la invitación por correo</li>
                  <li>{ICONOS.check}Fichan y cargan clases con sus primas</li>
                  <li>{ICONOS.check}Ven horas e importe del mes o de la temporada</li>
                  <li>{ICONOS.check}Notas y visto bueno de administración</li>
                  <li>{ICONOS.check}Informe mensual y económico en PDF</li>
                  <li>{ICONOS.check}Firma sus documentos desde el móvil</li>
                </ul>
                <button className="lp-btn lp-btn-outline" onClick={e => abrir('profesor', e)}>Entrar como profesor</button>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-sec" id="como-funciona" aria-labelledby="t-pasos">
          <div className="lp-wrap">
            <h2 id="t-pasos">Así de simple</h2>
            <ol className="lp-steps">
              {PASOS.map(p => (
                <li key={p.n}><span className="lp-num" aria-hidden="true">{p.n}</span>
                  <div><h3>{p.titulo}</h3><p>{p.texto}</p></div></li>
              ))}
            </ol>
          </div>
        </section>

        {CONTACTO && (
          <section className="lp-sec" aria-labelledby="t-alta">
            <div className="lp-wrap lp-center-block">
              <h2 id="t-alta">¿Tienes una escuela?</h2>
              <p className="lp-lead lp-center">Te damos de alta con tu cuenta de administración y te ayudamos a cargar la lista de tu equipo.</p>
              <a className="lp-btn lp-btn-primary" href={`mailto:${CONTACTO}?subject=${encodeURIComponent('Alta de mi escuela en ' + APP_NAME)}`}>Solicitar el alta de mi escuela</a>
            </div>
          </section>
        )}

        {!MODO_CLIENTE && <section className="lp-sec" id="preguntas" aria-labelledby="t-faq">
          <div className="lp-wrap lp-faq-wrap">
            <h2 id="t-faq">Preguntas frecuentes</h2>
            <div className="lp-faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>}

        {WA_URL && (
          <section className="lp-sec lp-sec-alt lp-demo-final" aria-labelledby="t-demo">
            <div className="lp-wrap lp-center-block">
              <h2 id="t-demo">¿La vemos con tu escuela?</h2>
              <p className="lp-lead lp-center">Te la enseñamos con tus casos reales y te contamos cómo sería ponerla en marcha con tu equipo. Sin compromiso.</p>
              <a className="lp-btn lp-btn-wa" href={WA_URL} target="_blank" rel="noopener noreferrer">{ICONOS.whatsapp}<span>Pedir una demo por WhatsApp</span></a>
            </div>
          </section>
        )}

        <section className="lp-sec lp-sec-alt" id="instalar" aria-labelledby="t-instalar">
          <div className="lp-wrap lp-install">
            <div>
              <h2 id="t-instalar">Instálala en tu móvil</h2>
              <p className="lp-lead">Se abre como una app más, sin pasar por ninguna tienda.</p>
              {pwaInstallEvent && (
                <button className="lp-btn lp-btn-primary" onClick={instalarPWA}>Instalar la app</button>
              )}
            </div>
            <ul className="lp-install-list">
              <li><strong>Android (Chrome)</strong><span>Menú ⋮ → «Instalar aplicación».</span></li>
              <li><strong>iPhone (Safari)</strong><span>Botón Compartir → «Añadir a pantalla de inicio».</span></li>
              <li><strong>Notificaciones</strong><span>Después, en «Mi perfil», actívalas con la guía paso a paso (en iPhone hace falta la app instalada).</span></li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">© {new Date().getFullYear()} {APP_NAME}{LUGAR ? ` · ${LUGAR}` : ''} · <span className="lp-version" title={`Compilada el ${APP_FECHA || '—'}${APP_COMMIT !== 'local' ? ` · commit ${APP_COMMIT}` : ''}`}>Versión {APP_VERSION}</span> · <button className="lp-link" onClick={() => setVerPrivacidad(true)}>Política de privacidad</button></div>
      </footer>

      {acceso && (
        <div className="lp-overlay" onClick={cerrar}>
          <div className="lp-dialog" role="dialog" aria-modal="true" aria-labelledby="t-acceso" onClick={e => e.stopPropagation()}>
            <button className="lp-close" onClick={cerrar} aria-label="Cerrar">×</button>
            <h2 id="t-acceso">{ACCESOS[acceso].titulo}</h2>
            {enlaceEnviado ? (
              <div className="lp-sent" role="status">
                <div className="lp-ico lp-ico-big">{ICONOS.correo}</div>
                <p>Si <strong>{emailLogin}</strong> está registrado, te enviamos un correo con un <strong>enlace</strong> y un <strong>código de 6 dígitos</strong>. Valen 15 minutos.</p>
                <div className="lp-codigo">
                  <label htmlFor="lp-codigo">¿Usas la app instalada? Escribe aquí el código</label>
                  <input id="lp-codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} placeholder="000000"
                    value={codigo} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCodigo(v); if (v.length === 6) verificarCodigo(emailLogin, v); }} />
                  <button className="lp-btn lp-btn-primary lp-block" disabled={cargando || codigo.length !== 6} onClick={() => verificarCodigo(emailLogin, codigo)}>
                    {cargando ? 'Entrando…' : 'Entrar con el código'}
                  </button>
                </div>
                <p className="lp-hint">Si tocas el enlace del correo, se abre en el navegador del móvil y no en la app instalada: en el iPhone usa el código.</p>
                <p className="lp-hint">Revisa también la carpeta de spam.</p>
                <button className="lp-btn lp-btn-ghost" onClick={() => { setEnlaceEnviado(false); setCodigo(''); }}>Usar otro email</button>
              </div>
            ) : (
              <form onSubmit={pedirEnlace}>
                <p className="lp-hint">{ACCESOS[acceso].texto}</p>
                <label htmlFor="lp-email">Correo electrónico</label>
                <input ref={inputRef} id="lp-email" type="email" required autoComplete="email" inputMode="email"
                  placeholder="nombre@tuescuela.com" value={emailLogin} onChange={e => setEmailLogin(e.target.value)} />
                <button type="submit" className="lp-btn lp-btn-primary lp-block" disabled={cargando}>
                  {cargando ? 'Enviando…' : 'Enviarme el enlace de acceso'}
                </button>
                <p className="lp-hint">Sin contraseña: la sesión queda abierta en este dispositivo.</p>
              </form>
            )}
            {devForm}
          </div>
        </div>
      )}

      {verPrivacidad && api && <PoliticaPrivacidad api={api} onCerrar={() => setVerPrivacidad(false)} />}
      {toast && <div className={`toast toast-${toast.tipo}`} role="alert">{toast.msg}</div>}
    </div>
  );
}
