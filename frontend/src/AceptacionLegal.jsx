import { useState, useEffect } from 'react';
import Icono from './Iconos';

function TextoLegal({ doc }) {
  return (
    <div className="legal-texto">
      <p className="legal-intro">{doc.intro}</p>
      {doc.secciones.map(s => (
        <section key={s.titulo}>
          <h3>{s.titulo}</h3>
          {s.parrafos?.map((p, i) => <p key={i}>{p}</p>)}
          {s.items && <ul>{s.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
        </section>
      ))}
      <p className="form-hint">{doc.pie}</p>
    </div>
  );
}

// Política de privacidad de la escuela, de solo lectura (pública: se abre también desde la landing y el perfil)
export function PoliticaPrivacidad({ api, onCerrar }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', onKey);
    api.get('/api/legal/privacidad').then(r => setDoc(r.data)).catch(() => setError(true));
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-labelledby="legal-titulo">
      <div className="legal-box">
        <div className="legal-cab"><h2 id="legal-titulo">{doc?.titulo || 'Política de privacidad'}</h2>
          <button className="icon-btn" onClick={onCerrar} aria-label="Cerrar"><Icono n="cerrar" size={22} /></button></div>
        <div className="legal-cuerpo">{error ? <p>No se pudo cargar. Inténtalo de nuevo.</p> : doc ? <TextoLegal doc={doc} /> : <p>Cargando…</p>}</div>
      </div>
    </div>
  );
}

// Pantalla que bloquea la app hasta que la persona confirma que recibió la información (y, en la cuenta principal,
// que acepta el contrato de encargo en nombre de la escuela). No es un consentimiento: ver docs/RGPD.md.
export default function AceptacionLegal({ api, h, toast$, onListo, onSalir }) {
  const [pendientes, setPendientes] = useState(null);
  const [doc, setDoc] = useState(null);
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = async () => {
    const est = (await api.get('/api/legal/estado', { headers: h() })).data.filter(d => !d.aceptado);
    setPendientes(est);
    if (!est.length) { onListo(); return; }
    setDoc((await api.get(`/api/legal/documento/${est[0].documento}`, { headers: h() })).data); setMarcado(false);
  };
  useEffect(() => { cargar().catch(() => toast$('No se pudo cargar la información legal', 'error')); }, []);

  const aceptar = async () => {
    setEnviando(true);
    try { await api.post('/api/legal/aceptar', { documento: doc.documento, version: doc.version }, { headers: h() }); await cargar(); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo guardar', 'error'); }
    finally { setEnviando(false); }
  };

  if (!doc) return <div className="legal-overlay"><div className="legal-box"><p style={{ padding: 24 }}>Cargando…</p></div></div>;
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-labelledby="legal-titulo">
      <div className="legal-box">
        <div className="legal-cab">
          <div><p className="legal-paso">{pendientes.length > 1 ? `Documento 1 de ${pendientes.length}` : 'Antes de continuar'}</p><h2 id="legal-titulo">{doc.titulo}</h2></div>
        </div>
        <div className="legal-cuerpo"><TextoLegal doc={doc} /></div>
        <div className="legal-pie">
          <label className="opcion"><input type="checkbox" checked={marcado} onChange={e => setMarcado(e.target.checked)} /><span>{doc.casilla}</span></label>
          <div className="action-buttons">
            <button className="btn-primary" disabled={!marcado || enviando} onClick={aceptar}>{enviando ? 'Guardando…' : 'Continuar'}</button>
            <button className="btn-ghost" onClick={onSalir}>Cerrar sesión</button>
          </div>
        </div>
      </div>
    </div>
  );
}
