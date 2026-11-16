import { useState, useEffect, useCallback } from 'react';

// Flota de clientes (solo la instalación del proveedor, cuenta principal): registro y estado de cada instalación.
// No guarda secretos: solo direcciones públicas y datos de gestión. Ver docs/FLOTA.md.
const TRAMO = { PEQUENA: 'Pequeña', MEDIA: 'Media', GRANDE: 'Grande', A_MEDIDA: 'A medida', DEMO: 'Demo', PILOTO: 'Piloto' };
const ANILLO = { DEMO: 'Demo', PILOTO: 'Piloto', CLIENTE: 'Cliente' };
const ESTADO = {
  AL_DIA: ['aprobado', 'Al día'],
  DESACTUALIZADO: ['pendiente', 'Desactualizado'],
  CAIDO: ['rechazado', 'Caído'],
};
const fecha = f => (f ? new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fechaHora = f => (f ? new Date(f).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'sin comprobar');
const dia = f => (f ? new Date(f).toISOString().slice(0, 10) : '');
const VACIO = { nombre: '', tramo: 'MEDIA', anillo: 'CLIENTE', urlApi: '', urlApp: '', railwayProyecto: '', pagesProyecto: '', versionEsperada: '', altaAt: '', renovacionAt: '', notas: '' };

export default function VistaFlota({ api, h, toast$ }) {
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null); // null = cerrado; objeto = alta o edición
  const [ocupado, setOcupado] = useState(false);
  const [comprobando, setComprobando] = useState(null); // 'todos' | id

  const err = e => toast$(e.response?.data?.error || 'Error', 'error');
  const cargar = useCallback(async () => {
    try { setDatos((await api.get('/api/admin/flota', { headers: h() })).data); } catch (e) { err(e); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const comprobar = async (id) => {
    setComprobando(id || 'todos');
    try {
      const r = await api.post(id ? `/api/admin/flota/${id}/comprobar` : '/api/admin/flota/comprobar', null, { headers: h() });
      setDatos(d => ({ ...d, ...r.data }));
    } catch (e) { err(e); } finally { setComprobando(null); }
  };

  const guardar = async (ev) => {
    ev.preventDefault();
    setOcupado(true);
    const { id, ...campos } = form;
    const body = { ...campos, activo: campos.activo !== false };
    try {
      if (id) await api.put(`/api/admin/flota/${id}`, body, { headers: h() });
      else await api.post('/api/admin/flota', body, { headers: h() });
      setForm(null); await cargar(); toast$(id ? 'Cliente actualizado' : 'Cliente añadido', 'success');
    } catch (e) { err(e); } finally { setOcupado(false); }
  };
  const quitar = async (c) => {
    if (!window.confirm(`¿Quitar a «${c.nombre}» del registro? Solo se borra de esta lista; su instalación no se toca.`)) return;
    try { await api.delete(`/api/admin/flota/${c.id}`, { headers: h() }); await cargar(); toast$('Cliente quitado del registro', 'success'); } catch (e) { err(e); }
  };

  if (!datos) return <div className="card"><div className="empty-state"><p>Cargando…</p></div></div>;
  const activos = datos.clientes.filter(c => c.activo);
  const n = e => activos.filter(c => c.ultimoEstado === e).length;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <div className="card">
        <h2>Flota de clientes</h2>
        <p className="form-hint">Registro de las instalaciones y su estado. Versión de referencia (esta instalación): <strong>{datos.versionReferencia}</strong>. «Desactualizado» significa que el cliente no va en la versión que debería (la esperada, o esta si no se fijó otra).</p>
        <p>
          <strong>{activos.length}</strong> activos · <strong>{n('AL_DIA')}</strong> al día · <strong>{n('DESACTUALIZADO')}</strong> desactualizados · <strong>{n('CAIDO')}</strong> caídos
        </p>
        <div className="action-buttons">
          <button className="btn-primary" disabled={comprobando || !activos.length} onClick={() => comprobar()}>{comprobando === 'todos' ? 'Comprobando…' : 'Comprobar todos'}</button>
          <button className="btn-sm" onClick={() => setForm({ ...VACIO })}>+ Añadir cliente</button>
        </div>
      </div>

      {form && (
        <form className="card" onSubmit={guardar}>
          <h2>{form.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <div className="form-group"><label htmlFor="fl-nombre">Nombre *</label>
            <input id="fl-nombre" required maxLength={120} value={form.nombre} onChange={e => set('nombre', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="fl-api">Dirección de la API * (https://…)</label>
            <input id="fl-api" required type="url" placeholder="https://api.escuela.com" value={form.urlApi} onChange={e => set('urlApi', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="fl-app">Dirección de la app</label>
            <input id="fl-app" type="url" placeholder="https://app.escuela.com" value={form.urlApp || ''} onChange={e => set('urlApp', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="fl-tramo">Tramo</label>
            <select id="fl-tramo" value={form.tramo} onChange={e => set('tramo', e.target.value)}>{datos.tramos.map(t => <option key={t} value={t}>{TRAMO[t] || t}</option>)}</select></div>
          <div className="form-group"><label htmlFor="fl-anillo">Anillo de actualización</label>
            <select id="fl-anillo" value={form.anillo} onChange={e => set('anillo', e.target.value)}>{datos.anillos.map(a => <option key={a} value={a}>{ANILLO[a] || a}</option>)}</select>
            <small className="form-hint">Demo primero, luego piloto y por último el resto de clientes.</small></div>
          <div className="form-group"><label htmlFor="fl-ver">Versión esperada (vacío = la de referencia)</label>
            <input id="fl-ver" placeholder="1.2.0" pattern="\d+\.\d+\.\d+" value={form.versionEsperada || ''} onChange={e => set('versionEsperada', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="fl-rw">Proyecto en Railway</label>
            <input id="fl-rw" maxLength={120} value={form.railwayProyecto || ''} onChange={e => set('railwayProyecto', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="fl-pg">Proyecto en Cloudflare Pages</label>
            <input id="fl-pg" maxLength={120} value={form.pagesProyecto || ''} onChange={e => set('pagesProyecto', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="fl-alta">Fecha de alta</label>
            <input id="fl-alta" type="date" value={dia(form.altaAt)} onChange={e => set('altaAt', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="fl-ren">Fecha de renovación</label>
            <input id="fl-ren" type="date" value={dia(form.renovacionAt)} onChange={e => set('renovacionAt', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="fl-notas">Notas</label>
            <textarea id="fl-notas" rows={2} maxLength={1000} value={form.notas || ''} onChange={e => set('notas', e.target.value)} />
            <small className="form-hint">No guardes aquí contraseñas ni claves: usa el gestor de secretos.</small></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={form.activo !== false} onChange={e => set('activo', e.target.checked)} /> Activo (se incluye al comprobar)</label>
          <div className="action-buttons" style={{ marginTop: 12 }}>
            <button className="btn-primary" disabled={ocupado}>{form.id ? 'Guardar' : 'Añadir'}</button>
            <button type="button" className="btn-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card">
        {!datos.clientes.length && <div className="empty-state"><p>Aún no hay clientes en el registro. Añade el primero con «+ Añadir cliente».</p></div>}
        <div className="catalogo-lista">
          {datos.clientes.map(c => {
            const [clase, etiqueta] = ESTADO[c.ultimoEstado] || ['pendiente', 'Sin comprobar'];
            return (
              <div key={c.id} className="item-integracion" style={c.activo ? undefined : { opacity: 0.6 }}>
                <div>
                  <strong>{c.nombre} <span className={`estado-badge ${clase}`}>{etiqueta}</span></strong>
                  <small>{ANILLO[c.anillo]} · tramo {TRAMO[c.tramo] || c.tramo}{c.activo ? '' : ' · inactivo'} · renueva {fecha(c.renovacionAt)}</small>
                  <small>
                    {c.ultimaVersion ? <>Versión <strong>{c.ultimaVersion}</strong>{c.ultimoCommit ? ` (${c.ultimoCommit})` : ''}{c.versionEsperada ? ` · esperada ${c.versionEsperada}` : ''}</> : 'Versión desconocida'}
                    {c.ultimaLatenciaMs != null && ` · ${c.ultimaLatenciaMs} ms`}
                    {c.ultimoPush != null && ` · push ${c.ultimoPush ? 'activo' : 'sin activar'}`}
                  </small>
                  {c.ultimoError && <small style={{ color: 'var(--danger, #b91c1c)' }}>Motivo: {c.ultimoError}</small>}
                  <small>Última comprobación: {fechaHora(c.ultimaComprobacionAt)}{c.urlApp && <> · <a href={c.urlApp} target="_blank" rel="noopener noreferrer">abrir app</a></>}</small>
                  {c.notas && <small><em>{c.notas}</em></small>}
                </div>
                <div className="action-buttons">
                  <button className="btn-sm" disabled={comprobando} onClick={() => comprobar(c.id)}>{comprobando === c.id ? '…' : 'Comprobar'}</button>
                  <button className="btn-sm" onClick={() => setForm({ ...c })}>Editar</button>
                  <button className="btn-sm" onClick={() => quitar(c)}>Quitar</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
