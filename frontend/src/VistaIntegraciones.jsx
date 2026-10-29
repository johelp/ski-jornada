import { useState, useEffect, useCallback } from 'react';
import Icono from './Iconos';

const SCOPES = [
  { id: 'lectura', nombre: 'Lectura', desc: 'Profesores e informes de clases' },
  { id: 'economico', nombre: 'Económico', desc: 'Añade tarifas e importes' },
  { id: 'planning', nombre: 'Planning', desc: 'Enviar clases planificadas' },
];
const fechaHora = f => (f ? new Date(f).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca');
const mesActual = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };

// Gestión de integraciones: API keys, webhooks e importación del planning (CSV)
export default function VistaIntegraciones({ api, h, toast$ }) {
  const [tab, setTab] = useState('keys');
  const [keys, setKeys] = useState([]);
  const [hooks, setHooks] = useState({ eventos: [], webhooks: [] });
  const [nuevaKey, setNuevaKey] = useState({ nombre: '', scopes: ['lectura'] });
  const [nuevoHook, setNuevoHook] = useState({ url: '', eventos: [] });
  const [secreto, setSecreto] = useState(null); // { titulo, valor } se muestra una sola vez
  const [csv, setCsv] = useState('');
  const [reemplazar, setReemplazar] = useState(mesActual());
  const [resultado, setResultado] = useState(null);

  const err = e => toast$(e.response?.data?.error || 'Error', 'error');
  const cargar = useCallback(async () => {
    try {
      const [k, w] = await Promise.all([
        api.get('/api/admin/integraciones/keys', { headers: h() }),
        api.get('/api/admin/integraciones/webhooks', { headers: h() }),
      ]);
      setKeys(k.data); setHooks(w.data);
    } catch (e) { err(e); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const toggle = (lista, v) => (lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);
  const copiar = async txt => { try { await navigator.clipboard.writeText(txt); toast$('Copiado ✓', 'success'); } catch { toast$('No se pudo copiar', 'warning'); } };

  const crearKey = async () => {
    try {
      const r = await api.post('/api/admin/integraciones/keys', nuevaKey, { headers: h() });
      setSecreto({ titulo: `API key «${r.data.nombre}»`, valor: r.data.key });
      setNuevaKey({ nombre: '', scopes: ['lectura'] }); cargar();
    } catch (e) { err(e); }
  };
  const crearHook = async () => {
    try {
      const r = await api.post('/api/admin/integraciones/webhooks', nuevoHook, { headers: h() });
      setSecreto({ titulo: 'Secreto de firma del webhook', valor: r.data.secret });
      setNuevoHook({ url: '', eventos: [] }); cargar();
    } catch (e) { err(e); }
  };
  const act = async (fn, ok) => { try { await fn(); if (ok) toast$(ok, 'success'); cargar(); } catch (e) { err(e); } };

  const plantilla = 'email,fecha,horas,disciplina,referencia\nprofesor@escuela.com,2026-12-20,3,Esquí,R-1001\n';
  const importar = async () => {
    const filas = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (filas.length && /email/i.test(filas[0])) filas.shift();
    const items = filas.map(l => { const [email, fecha, horas, disciplina, referencia] = l.split(/[,;\t]/).map(x => x.trim()); return { email, fecha, horas, disciplina, referencia }; });
    if (!items.length) { toast$('Pega o carga un CSV con filas', 'warning'); return; }
    try {
      const r = await api.post('/api/admin/planning/importar', { items, reemplazarMes: reemplazar || undefined }, { headers: h() });
      setResultado(r.data); toast$(`${r.data.importadas} filas importadas`, 'success');
    } catch (e) { err(e); }
  };
  const leerArchivo = async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); };

  return (
    <div>
      <div className="informe-tabs">
        <button className={`btn-tab${tab === 'keys' ? ' active' : ''}`} onClick={() => setTab('keys')}>Claves de API</button>
        <button className={`btn-tab${tab === 'hooks' ? ' active' : ''}`} onClick={() => setTab('hooks')}>Webhooks</button>
        <button className={`btn-tab${tab === 'planning' ? ' active' : ''}`} onClick={() => setTab('planning')}>Planning</button>
      </div>

      {secreto && (
        <div className="card aviso-secreto" role="alert">
          <h2>{secreto.titulo}</h2>
          <p className="form-hint">Cópiala ahora: <strong>no se vuelve a mostrar</strong>.</p>
          <code className="secreto">{secreto.valor}</code>
          <div className="action-buttons">
            <button className="btn-primary" onClick={() => copiar(secreto.valor)}>Copiar</button>
            <button className="btn-sm" onClick={() => setSecreto(null)}>Ya la guardé</button>
          </div>
        </div>
      )}

      {tab === 'keys' && (
        <>
          <div className="card">
            <h2>Nueva clave</h2>
            <p className="form-hint">Para que otro sistema (reservas, nóminas, BI) consulte datos o envíe el planning. Una clave por sistema.</p>
            <div className="form-group"><label htmlFor="k-nombre">Nombre</label>
              <input id="k-nombre" value={nuevaKey.nombre} maxLength="80" placeholder="Ej. Sistema de reservas" onChange={e => setNuevaKey({ ...nuevaKey, nombre: e.target.value })} /></div>
            <div className="form-group"><label>Permisos</label>
              <div className="opciones">
                {SCOPES.map(s => (
                  <label key={s.id} className="opcion">
                    <input type="checkbox" checked={nuevaKey.scopes.includes(s.id)} onChange={() => setNuevaKey({ ...nuevaKey, scopes: toggle(nuevaKey.scopes, s.id) })} />
                    <span><strong>{s.nombre}</strong><small>{s.desc}</small></span>
                  </label>
                ))}
              </div>
            </div>
            <button className="btn-primary" onClick={crearKey}>Crear clave</button>
          </div>
          <div className="card">
            <h2>Claves ({keys.length})</h2>
            {!keys.length ? <div className="empty-state"><p>Sin claves todavía</p></div> : (
              <div className="catalogo-lista">
                {keys.map(k => (
                  <div key={k.id} className={`item-integracion${k.activa ? '' : ' inactivo'}`}>
                    <div><strong>{k.nombre}</strong><small>{k.prefijo}… · último uso: {fechaHora(k.ultimoUso)}</small>
                      <div className="chips">{k.scopes.map(s => <span key={s} className="chip chip-sm">{s}</span>)}</div></div>
                    <div className="action-buttons">
                      <button className="btn-sm" onClick={() => act(() => api.put(`/api/admin/integraciones/keys/${k.id}`, { activa: !k.activa }, { headers: h() }))}>{k.activa ? 'Desactivar' : 'Activar'}</button>
                      <button className="btn-sm" aria-label={`Eliminar ${k.nombre}`} onClick={() => window.confirm('¿Eliminar la clave? El sistema que la use dejará de funcionar.') && act(() => api.delete(`/api/admin/integraciones/keys/${k.id}`, { headers: h() }), 'Clave eliminada')}><Icono n="borrar" size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'hooks' && (
        <>
          <div className="card">
            <h2>Nuevo webhook</h2>
            <p className="form-hint">Avisa a otro sistema cuando pasa algo. La petición va firmada (HMAC-SHA256). La URL debe ser https.</p>
            <div className="form-group"><label htmlFor="w-url">URL</label>
              <input id="w-url" type="url" value={nuevoHook.url} placeholder="https://ejemplo.com/webhook" onChange={e => setNuevoHook({ ...nuevoHook, url: e.target.value })} /></div>
            <div className="form-group"><label>Eventos <span className="form-hint">(ninguno = todos)</span></label>
              <div className="opciones">
                {hooks.eventos.map(ev => (
                  <label key={ev} className="opcion"><input type="checkbox" checked={nuevoHook.eventos.includes(ev)} onChange={() => setNuevoHook({ ...nuevoHook, eventos: toggle(nuevoHook.eventos, ev) })} /><span><code>{ev}</code></span></label>
                ))}
              </div>
            </div>
            <button className="btn-primary" onClick={crearHook}>Crear webhook</button>
          </div>
          <div className="card">
            <h2>Webhooks ({hooks.webhooks.length})</h2>
            {!hooks.webhooks.length ? <div className="empty-state"><p>Sin webhooks todavía</p></div> : (
              <div className="catalogo-lista">
                {hooks.webhooks.map(w => (
                  <div key={w.id} className={`item-integracion${w.activo ? '' : ' inactivo'}`}>
                    <div><strong className="url">{w.url}</strong>
                      <small>Último envío: {fechaHora(w.ultimoEnvio)} {w.ultimoEstado != null && <span className={`estado-badge ${w.ultimoEstado >= 200 && w.ultimoEstado < 300 ? 'aprobado' : 'rechazado'}`}>{w.ultimoEstado || 'sin respuesta'}</span>}</small>
                      <div className="chips">{w.eventos.map(ev => <span key={ev} className="chip chip-sm">{ev === '*' ? 'todos' : ev}</span>)}</div></div>
                    <div className="action-buttons">
                      <button className="btn-sm" onClick={async () => { try { const r = await api.post(`/api/admin/integraciones/webhooks/${w.id}/probar`, null, { headers: h() }); toast$(r.data.ok ? 'Prueba enviada ✓' : `Respuesta ${r.data.estado || 'sin conexión'}`, r.data.ok ? 'success' : 'warning'); cargar(); } catch (e) { err(e); } }}>Probar</button>
                      <button className="btn-sm" onClick={() => act(() => api.put(`/api/admin/integraciones/webhooks/${w.id}`, { activo: !w.activo }, { headers: h() }))}>{w.activo ? 'Pausar' : 'Activar'}</button>
                      <button className="btn-sm" aria-label="Eliminar webhook" onClick={() => window.confirm('¿Eliminar el webhook?') && act(() => api.delete(`/api/admin/integraciones/webhooks/${w.id}`, { headers: h() }), 'Webhook eliminado')}><Icono n="borrar" size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'planning' && (
        <div className="card">
          <h2>Importar planning</h2>
          <p className="form-hint">Clases planificadas por el sistema de reservas. En el detalle de cada profesor verás el cotejo contra lo que cargó. Columnas: <code>email, fecha (AAAA-MM-DD), horas, disciplina, referencia</code>.</p>
          <div className="action-buttons" style={{ margin: '8px 0 12px' }}>
            <label className="btn-sm" style={{ cursor: 'pointer' }}><Icono n="mas1" size={18} /> Cargar archivo CSV
              <input type="file" accept=".csv,text/csv,text/plain" onChange={leerArchivo} style={{ display: 'none' }} /></label>
            <button className="btn-sm" onClick={() => setCsv(plantilla)}>Ver ejemplo</button>
          </div>
          <div className="form-group"><label htmlFor="p-csv">Contenido</label>
            <textarea id="p-csv" rows="7" value={csv} onChange={e => setCsv(e.target.value)} placeholder={plantilla} spellCheck={false} /></div>
          <div className="form-group"><label htmlFor="p-mes">Reemplazar el planning del mes (opcional)</label>
            <input id="p-mes" type="month" value={reemplazar} onChange={e => setReemplazar(e.target.value)} />
            <span className="form-hint">Borra antes el planning de ese mes de los profesores incluidos; útil para sincronizaciones completas.</span></div>
          <button className="btn-primary" onClick={importar}>Importar</button>
          {resultado && (
            <div className="revision revision-aprobado" role="status" style={{ marginTop: 14 }}>
              <strong>{resultado.importadas} filas importadas</strong>
              {resultado.invalidas > 0 && <p>{resultado.invalidas} filas inválidas (fecha u horas incorrectas).</p>}
              {resultado.sinProfesor.length > 0 && <p>Emails sin profesor: {resultado.sinProfesor.join(', ')}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
