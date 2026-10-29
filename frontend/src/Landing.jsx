import { useState, useEffect, useRef } from 'react';
import './Landing.css';

// Marca por despliegue (variables de build de Cloudflare Pages; ver docs/MULTI-DESPLIEGUE.md)
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Ski Jornada';
const LUGAR = import.meta.env.VITE_ESCUELA_LUGAR || '';
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
};

const FUNCIONES = [
  { icono: 'reloj', titulo: 'Fichaje fiable', texto: 'Entrada y salida con QR rotativo, GPS o NFC. La hora la marca el servidor, no el móvil.' },
  { icono: 'clases', titulo: 'Clases y primas', texto: 'Cada profesor carga sus horas por disciplina y marca las primas: idioma, disca, repetida…' },
  { icono: 'informe', titulo: 'Informe mensual', texto: 'PDF listo para imprimir, con la parte económica cuando hay tarifas cargadas.' },
  { icono: 'panel', titulo: 'Control para administración', texto: 'Horas por profesor para cotejar con el planning de reservas y liquidar sin errores.' },
];

const PASOS = [
  { n: 1, titulo: 'Entra con tu email', texto: 'Te llega un enlace. Sin contraseñas y la sesión queda abierta en tu móvil.' },
  { n: 2, titulo: 'Carga tus clases', texto: 'Horas, disciplina y primas en menos de 10 segundos.' },
  { n: 3, titulo: 'Confirma el mes', texto: 'Tu informe se genera y administración recibe el aviso al instante.' },
];

const ACCESOS = {
  profesor: {
    titulo: 'Acceso profesores',
    texto: 'Ingresa con el email con el que te dio de alta tu escuela.',
  },
  admin: {
    titulo: 'Acceso administración',
    texto: 'Ingresa con el email de administrador de tu escuela.',
  },
};

export default function Landing({
  emailLogin, setEmailLogin, enlaceEnviado, setEnlaceEnviado, pedirEnlace,
  cargando, pwaInstallEvent, instalarPWA, devForm, toast,
}) {
  const [acceso, setAcceso] = useState(null);
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
            <a href="#funciones">Funciones</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#instalar">Instalar</a>
          </nav>
          <button className="lp-btn lp-btn-ghost" onClick={e => abrir('profesor', e)}>Entrar</button>
        </div>
      </header>

      <main id="contenido">
        <section className="lp-hero" id="top">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">Para escuelas de esquí</p>
              <h1>La jornada de tu equipo, clara y lista para liquidar</h1>
              <p className="lp-lead">
                Ficha, carga las clases con sus primas y genera el informe mensual.
                Todo desde el móvil y sin contraseñas.
              </p>
              <div className="lp-cta">
                <button className="lp-btn lp-btn-primary" onClick={e => abrir('profesor', e)}>Acceso profesores</button>
                <button className="lp-btn lp-btn-outline" onClick={e => abrir('admin', e)}>Acceso administración</button>
              </div>
              <ul className="lp-trust">
                <li>{ICONOS.correo}<span>Entras con un enlace al correo</span></li>
                <li>{ICONOS.movil}<span>Funciona como app instalable</span></li>
                <li>{ICONOS.escudo}<span>Cada quien ve solo lo suyo</span></li>
              </ul>
            </div>

            <div className="lp-hero-visual" aria-hidden="true">
              <div className="lp-phone">
                <div className="lp-phone-bar" />
                <p className="lp-phone-title">Cargar clase</p>
                <div className="lp-field"><span>Disciplina</span><strong>Esquí</strong></div>
                <div className="lp-field"><span>Horas</span><strong>2</strong></div>
                <div className="lp-chips"><i className="on">✓ Idioma</i><i className="on">✓ Repetida</i><i>Disca</i></div>
                <div className="lp-phone-btn">Cargar clase</div>
                <div className="lp-phone-total"><span>Importe del día</span><strong>56,00 €</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-sec" id="funciones" aria-labelledby="t-funciones">
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
            <h2 id="t-roles">Una app, dos accesos</h2>
            <div className="lp-roles">
              <article className="lp-role">
                <h3>Profesores</h3>
                <ul>
                  <li>{ICONOS.check}Fichar y desfichar</li>
                  <li>{ICONOS.check}Cargar clases con disciplina y primas</li>
                  <li>{ICONOS.check}Consultar sus horas y su importe</li>
                  <li>{ICONOS.check}Informe mensual en PDF</li>
                </ul>
                <button className="lp-btn lp-btn-primary" onClick={e => abrir('profesor', e)}>Entrar como profesor</button>
              </article>
              <article className="lp-role">
                <h3>Administración</h3>
                <ul>
                  <li>{ICONOS.check}Alta y baja de profesores</li>
                  <li>{ICONOS.check}Primas y tarifas configurables</li>
                  <li>{ICONOS.check}Horas por profesor para cotejar con reservas</li>
                  <li>{ICONOS.check}Aprobación de días libres y documentos</li>
                </ul>
                <button className="lp-btn lp-btn-outline" onClick={e => abrir('admin', e)}>Entrar como administración</button>
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
            </ul>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">© {new Date().getFullYear()} {APP_NAME}{LUGAR ? ` · ${LUGAR}` : ''}</div>
      </footer>

      {acceso && (
        <div className="lp-overlay" onClick={cerrar}>
          <div className="lp-dialog" role="dialog" aria-modal="true" aria-labelledby="t-acceso" onClick={e => e.stopPropagation()}>
            <button className="lp-close" onClick={cerrar} aria-label="Cerrar">×</button>
            <h2 id="t-acceso">{ACCESOS[acceso].titulo}</h2>
            {enlaceEnviado ? (
              <div className="lp-sent" role="status">
                <div className="lp-ico lp-ico-big">{ICONOS.correo}</div>
                <p>Si <strong>{emailLogin}</strong> está registrado, te enviamos un enlace para entrar. Vale 15 minutos.</p>
                <p className="lp-hint">Revisa también la carpeta de spam.</p>
                <button className="lp-btn lp-btn-ghost" onClick={() => setEnlaceEnviado(false)}>Usar otro email</button>
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

      {toast && <div className={`toast toast-${toast.tipo}`} role="alert">{toast.msg}</div>}
    </div>
  );
}
