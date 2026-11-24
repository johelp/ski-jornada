import { useState, useEffect, useCallback } from 'react';
import { conReintentos } from './red';
import { generarPDFPracticas } from './pdfPracticas';

// Prácticas de formación. Dos usos de la misma pantalla:
//  · modo "propio": la persona en prácticas registra sus horas (fecha, inicio, fin, tipo de clase, profesor/coordinador).
//  · modo "admin": administración ve a cada persona, registra o corrige, añade la observación y descarga la planilla (PDF) para firmarla y sellarla.
const nh = n => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
const fechaTxt = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const minutos = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const horasPrevistas = (i, f) => (i && f && minutos(f) > minutos(i) ? Math.round((minutos(f) - minutos(i)) / 60 * 100) / 100 : null);
const vacio = () => ({ fecha: hoyISO(), inicio: '', fin: '', tipo: '', supervisor: (() => { try { return localStorage.getItem('sj-practicas-sup') || ''; } catch { return ''; } })(), notas: '' });

// Registro de horas + lista (compartido por los dos modos)
function Registro({ api, h, toast$, datos, base, onCambio, porAdmin }) {
  const [form, setForm] = useState(vacio());
  const [editId, setEditId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const cerrada = datos.planilla.cerrada && !porAdmin;
  const err = e => toast$(e.response?.data?.error || 'Error', 'error');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const previstas = horasPrevistas(form.inicio, form.fin);
  const sugerencias = [...new Set(datos.registros.map(r => r.supervisor))];

  const guardar = async ev => {
    ev.preventDefault();
    setGuardando(true);
    try {
      if (editId) await api.put(`${base.registro}/${editId}`, form, { headers: h() });
      else await api.post(base.crear, form, { headers: h() });
      try { localStorage.setItem('sj-practicas-sup', form.supervisor); } catch { /* sin almacenamiento */ }
      toast$(editId ? 'Práctica actualizada ✓' : 'Práctica registrada ✓', 'success');
      setEditId(null); setForm({ ...vacio(), fecha: form.fecha, supervisor: form.supervisor, tipo: form.tipo });
      await onCambio();
    } catch (e) { err(e); } finally { setGuardando(false); }
  };
  const borrar = async r => {
    if (!window.confirm(`¿Borrar la práctica del ${fechaTxt(r.fecha)} (${nh(r.horas)} h)?`)) return;
    try { await api.delete(`${base.registro}/${r.id}`, { headers: h() }); toast$('Práctica borrada', 'success'); await onCambio(); } catch (e) { err(e); }
  };
  const editar = r => { setEditId(r.id); setForm({ fecha: r.fecha, inicio: r.inicio, fin: r.fin, tipo: r.tipo, supervisor: r.supervisor, notas: r.notas || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <>
      {cerrada ? (
        <div className="card"><p className="form-hint" role="status">🔒 La planilla está cerrada: ya no se pueden añadir ni cambiar registros. Si hay algo que corregir, pídeselo a administración.</p></div>
      ) : (
        <form className="card" onSubmit={guardar}>
          <h2>{editId ? 'Editar práctica' : 'Registrar práctica'}</h2>
          <div className="form-row">
            <div className="form-group"><label htmlFor="pr-fecha">Fecha</label><input id="pr-fecha" type="date" required max={hoyISO()} value={form.fecha} onChange={e => set('fecha', e.target.value)} /></div>
            <div className="form-group"><label htmlFor="pr-tipo">Tipo de clase</label>
              <select id="pr-tipo" required value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="">Elige…</option>{datos.tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="pr-ini">Inicio</label><input id="pr-ini" type="time" required value={form.inicio} onChange={e => set('inicio', e.target.value)} /></div>
            <div className="form-group"><label htmlFor="pr-fin">Fin</label><input id="pr-fin" type="time" required value={form.fin} onChange={e => set('fin', e.target.value)} /></div>
          </div>
          <p className="practicas-horas" aria-live="polite">{previstas != null ? <>Horas: <strong>{nh(previstas)} h</strong></> : form.inicio && form.fin ? <span className="texto-aviso">La hora de fin debe ser posterior a la de inicio</span> : <span className="form-hint">Las horas se calculan con el inicio y el fin.</span>}</p>
          <div className="form-group"><label htmlFor="pr-sup">Profesor / coordinador</label>
            <input id="pr-sup" required maxLength={120} list="pr-sugeridos" placeholder="Con quién hiciste la práctica" value={form.supervisor} onChange={e => set('supervisor', e.target.value)} />
            <datalist id="pr-sugeridos">{sugerencias.map(s => <option key={s} value={s} />)}</datalist></div>
          <div className="form-group"><label htmlFor="pr-notas">Notas (opcional)</label><input id="pr-notas" maxLength={300} value={form.notas} onChange={e => set('notas', e.target.value)} /></div>
          <div className="action-buttons">
            <button className="btn-primary" disabled={guardando || previstas == null || !form.tipo}>{editId ? 'Guardar cambios' : 'Registrar'}</button>
            {editId && <button type="button" className="btn-ghost" onClick={() => { setEditId(null); setForm(vacio()); }}>Cancelar</button>}
          </div>
        </form>
      )}

      <div className="card">
        <h2>Registros</h2>
        {!datos.registros.length ? <div className="empty-state"><p>Aún no hay prácticas registradas.</p></div> : (
          <ul className="lista-horas">
            <li className="lista-horas-cab practicas-cab" aria-hidden="true"><span>Fecha</span><span>Horario</span><span>Horas</span><span className="col-ext">Tipo</span><span className="col-ext">Profesor / coordinador</span><span /></li>
            {[...datos.registros].reverse().map(r => (
              <li key={r.id} className="fila-horas practicas-fila">
                <div className="fila-horas-cab practicas-cab" style={{ cursor: 'default' }}>
                  <span className="fh-nombre">{fechaTxt(r.fecha)}</span>
                  <span>{r.inicio}–{r.fin}</span>
                  <span className="fh-horas">{nh(r.horas)} h</span>
                  <span className="col-ext">{datos.tipos.find(t => t.id === r.tipo)?.nombre || r.tipo}</span>
                  <span className="col-ext">{r.supervisor}</span>
                  <span className="practicas-acc">{!cerrada && <>
                    <button type="button" className="btn-sm" onClick={() => editar(r)} aria-label={`Editar la práctica del ${fechaTxt(r.fecha)}`}>Editar</button>
                    <button type="button" className="btn-sm" onClick={() => borrar(r)} aria-label={`Borrar la práctica del ${fechaTxt(r.fecha)}`}>Borrar</button></>}</span>
                </div>
                <p className="practicas-extra form-hint">{datos.tipos.find(t => t.id === r.tipo)?.nombre} · {r.supervisor}{r.notas ? ` · ${r.notas}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Totales({ resumen, tipos }) {
  const pct = resumen.requeridas ? Math.min(100, Math.round(resumen.totalHoras / resumen.requeridas * 100)) : null;
  return (
    <div className="card">
      <div className="dash-estados" role="group" aria-label="Horas de prácticas">
        <div className="dash-estado dash-estado-ok"><b>{nh(resumen.totalHoras)}</b><span>Horas hechas</span></div>
        <div className="dash-estado"><b>{resumen.requeridas != null ? nh(resumen.requeridas) : '—'}</b><span>Requeridas</span></div>
        <div className="dash-estado dash-estado-pend"><b>{resumen.restantes != null ? nh(resumen.restantes) : '—'}</b><span>Faltan</span></div>
        <div className="dash-estado"><b>{resumen.registros}</b><span>Registros</span></div>
      </div>
      {pct != null && <div className="practicas-barra" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Avance de las horas requeridas"><span style={{ width: `${pct}%` }} /></div>}
      {resumen.completa && <p className="form-hint">✅ Ya están completas las horas requeridas.</p>}
      <p className="form-hint">{tipos.filter(t => resumen.porTipo[t.id] > 0).map(t => `${t.nombre}: ${nh(resumen.porTipo[t.id])} h`).join(' · ') || 'Aún sin horas por tipo.'}</p>
    </div>
  );
}

// --- Modo propio ---
function Propio({ api, h, toast$ }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(false);
  const cargar = useCallback(async () => {
    setError(false);
    try { setDatos((await conReintentos(() => api.get('/api/practicas/mis', { headers: h() }))).data); } catch { setError(true); }
  }, [api, h]);
  useEffect(() => { cargar(); }, [cargar]);
  if (error && !datos) return <div className="card"><div className="revision revision-rechazado" role="alert"><strong>No se pudieron cargar tus prácticas</strong><p>Revisa tu conexión e inténtalo de nuevo.</p><button className="btn-sm" onClick={cargar}>Reintentar</button></div></div>;
  if (!datos) return <div className="card"><div className="empty-state"><p>Cargando…</p></div></div>;
  return (
    <>
      <div className="card">
        <h2>Mis prácticas</h2>
        <p className="form-hint">{datos.planilla.titulacion ? `Titulación: ${datos.planilla.titulacion}. ` : ''}Registra cada práctica con su horario: las horas se calculan solas. Al terminar, la escuela te entrega la planilla firmada y sellada.</p>
      </div>
      <Totales resumen={datos.resumen} tipos={datos.tipos} />
      <Registro api={api} h={h} toast$={toast$} datos={datos} onCambio={cargar} porAdmin={false} base={{ crear: '/api/practicas', registro: '/api/practicas' }} />
    </>
  );
}

// --- Modo administración ---
function Persona({ api, h, toast$, config, id, onVolver, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [pl, setPl] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const cargar = useCallback(async () => {
    try { const d = (await conReintentos(() => api.get(`/api/admin/practicas/${id}`, { headers: h() }))).data; setDatos(d); setPl(p => p || { titulacion: d.planilla.titulacion || '', entidad: d.planilla.entidad || '', horasRequeridas: d.planilla.horasRequeridas ?? '', observacion: d.planilla.observacion || '' }); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo cargar', 'error'); }
  }, [id]);
  useEffect(() => { setPl(null); cargar(); }, [cargar]);
  const tras = async () => { await cargar(); onCambio(); };
  if (!datos || !pl) return <div className="card"><div className="empty-state"><p>Cargando…</p></div></div>;
  const guardarPl = async (extra = {}, aviso = 'Planilla guardada ✓') => {
    setGuardando(true);
    try {
      await api.put(`/api/admin/practicas/${id}/planilla`, { titulacion: pl.titulacion, entidad: pl.entidad, horasRequeridas: pl.horasRequeridas === '' ? null : pl.horasRequeridas, observacion: pl.observacion, ...extra }, { headers: h() });
      toast$(aviso, 'success'); await tras();
    } catch (e) { toast$(e.response?.data?.error || 'Error', 'error'); } finally { setGuardando(false); }
  };
  const setp = (k, v) => setPl(p => ({ ...p, [k]: v }));
  const nombre = `${datos.profesor.nombre} ${datos.profesor.apellidos}`;
  return (
    <>
      <div className="card">
        <div className="action-buttons"><button className="btn-ghost" onClick={onVolver}>← Todas las personas</button></div>
        <h2>{nombre}</h2>
        <p className="form-hint">{datos.profesor.email}{datos.planilla.cerrada ? ' · 🔒 planilla cerrada' : ''}</p>
      </div>
      <Totales resumen={datos.resumen} tipos={datos.tipos} />

      <div className="card">
        <h2>Planilla de control</h2>
        <div className="form-group"><label htmlFor="pl-tit">Titulación que se acredita</label><input id="pl-tit" maxLength={200} value={pl.titulacion} onChange={e => setp('titulacion', e.target.value)} /></div>
        <div className="form-group"><label htmlFor="pl-ent">Entidad que emite la titulación</label><input id="pl-ent" maxLength={200} value={pl.entidad} onChange={e => setp('entidad', e.target.value)} /></div>
        <div className="form-group"><label htmlFor="pl-req">Horas requeridas</label><input id="pl-req" type="number" min="1" max="5000" step="0.5" value={pl.horasRequeridas} onChange={e => setp('horasRequeridas', e.target.value)} /></div>
        <div className="form-group"><label htmlFor="pl-obs">Observación (sale en el PDF)</label>
          <textarea id="pl-obs" rows={3} maxLength={1500} value={pl.observacion} onChange={e => setp('observacion', e.target.value)} placeholder="Ej. Realizó las prácticas con aprovechamiento y puntualidad." /></div>
        <div className="action-buttons">
          <button className="btn-primary" disabled={guardando} onClick={() => guardarPl()}>Guardar</button>
          <button className="btn-sm" disabled={!datos.registros.length} onClick={() => generarPDFPracticas({ ...datos, planilla: { ...datos.planilla, ...pl, horasRequeridas: pl.horasRequeridas === '' ? null : Number(pl.horasRequeridas) } }, config || {})}>⬇ Descargar planilla (PDF)</button>
          {datos.planilla.cerrada
            ? <button className="btn-sm" disabled={guardando} onClick={() => guardarPl({ cerrada: false }, 'Planilla reabierta')}>Reabrir</button>
            : <button className="btn-sm" disabled={guardando} onClick={() => window.confirm('Con la planilla cerrada la persona ya no podrá añadir, cambiar ni borrar registros. Podrás reabrirla. ¿Cerrar?') && guardarPl({ cerrada: true }, 'Planilla cerrada')}>Cerrar planilla</button>}
        </div>
        <p className="form-hint">Descarga el PDF, fírmalo y séllalo para entregarlo a la entidad que emite la titulación.</p>
      </div>

      <Registro api={api} h={h} toast$={toast$} datos={datos} onCambio={tras} porAdmin base={{ crear: `/api/admin/practicas/${id}`, registro: `/api/admin/practicas/${id}/registro` }} />
    </>
  );
}

function Admin({ api, h, toast$, config }) {
  const [lista, setLista] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const cargar = useCallback(async () => {
    try { setLista((await conReintentos(() => api.get('/api/admin/practicas', { headers: h() }))).data); } catch (e) { toast$(e.response?.data?.error || 'No se pudo cargar', 'error'); }
  }, [api, h]);
  useEffect(() => { cargar(); }, [cargar]);
  if (abierto) return <Persona api={api} h={h} toast$={toast$} config={config} id={abierto} onVolver={() => setAbierto(null)} onCambio={cargar} />;
  if (!lista) return <div className="card"><div className="empty-state"><p>Cargando…</p></div></div>;
  return (
    <div className="card">
      <h2>Prácticas de formación</h2>
      <p className="form-hint">Personas que suman horas para acreditar su titulación. Para añadir a alguien, márcalo como «en prácticas» en <strong>Usuarios</strong>. Aquí registras o corriges horas, escribes la observación y descargas la planilla para firmarla y sellarla.</p>
      {!lista.personas.length ? <div className="empty-state"><p>Aún no hay nadie en prácticas.</p></div> : (
        <ul className="lista-horas">
          <li className="lista-horas-cab" aria-hidden="true"><span>Persona</span><span>Horas</span><span className="col-ext">Registros</span><span className="col-ext">Requeridas</span><span>Estado</span><span /></li>
          {lista.personas.map(p => (
            <li key={p.id} className="fila-horas">
              <button type="button" className="fila-horas-cab" onClick={() => setAbierto(p.id)}>
                <span className="fh-nombre">{p.apellidos}, {p.nombre}</span>
                <span className="fh-horas">{nh(p.totalHoras)} h</span>
                <span className="col-ext">{p.registros}</span>
                <span className="col-ext">{p.requeridas != null ? `${nh(p.requeridas)} h` : '—'}</span>
                <span className="fh-estado"><span className={`estado-badge ${p.cerrada ? 'aprobado' : p.completa ? 'aprobado' : 'pendiente'}`}>{p.cerrada ? 'Cerrada' : p.completa ? 'Completa' : p.requeridas != null ? `Faltan ${nh(p.restantes)} h` : 'En curso'}</span></span>
                <span className="fh-flecha" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function VistaPracticas({ modo, api, h, toast$, config }) {
  return modo === 'admin' ? <Admin api={api} h={h} toast$={toast$} config={config} /> : <Propio api={api} h={h} toast$={toast$} />;
}
