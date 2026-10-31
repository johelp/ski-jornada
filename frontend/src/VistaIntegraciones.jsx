import { useState, useEffect, useCallback, useRef } from 'react';
import Icono from './Iconos';

const SCOPES = [
  { id: 'lectura', nombre: 'Lectura', desc: 'Profesores e informes de clases' },
  { id: 'economico', nombre: 'Económico', desc: 'Añade tarifas e importes' },
  { id: 'planning', nombre: 'Planning', desc: 'Enviar clases planificadas' },
];
const fechaHora = f => (f ? new Date(f).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca');
const mesActual = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };

// Gestión de integraciones: API keys, webhooks e importación del planning (CSV)
const IDEAS = [
  { icono: '📅', titulo: 'Sistema de reservas → planning', desc: 'El sistema de reservas envía cada día las clases planificadas. En el detalle de cada profesor ves planificado frente a cargado y las diferencias.', como: 'Clave con permiso «Planning» + POST /api/v1/planning, o CSV a mano.', tab: 'planning' },
  { icono: '🧾', titulo: 'Gestoría y nóminas', desc: 'La gestoría (o tu hoja de cálculo) descarga cada mes horas, primas e importes ya aprobados, sin pedirlos por correo.', como: 'Clave «Lectura» + «Económico» + GET /api/v1/informe/AAAA-MM.', tab: 'keys' },
  { icono: '🔔', titulo: 'Avisos en Slack, Teams o email', desc: 'Cuando un profesor confirma el mes o pide días libres, llega un aviso al canal de administración. Se monta sin programar con Make, Zapier o n8n.', como: 'Webhook con los eventos «clases.mes_confirmado» y «solicitud.creada».', tab: 'hooks' },
  { icono: '📊', titulo: 'Hoja de cálculo o panel propio', desc: 'Cada mes aprobado se añade solo a una hoja de Google o a un panel de BI para seguir el coste de personal por temporada.', como: 'Webhook «clases.revision» → Make/Zapier → Google Sheets.', tab: 'hooks' },
  { icono: '💬', titulo: 'WhatsApp al equipo', desc: 'Respuesta a las solicitudes, revisión de horas, recordatorio de salida y de confirmar el mes, solo a quien lo activó en su perfil.', como: 'Desde esta pantalla: «Generar QR» con un número dedicado.', tab: 'whatsapp' },
];

function Ideas({ ir }) {
  return (
    <div className="card">
      <h2>Qué puedes conectar</h2>
      <p className="form-hint">Todo es opcional: la plataforma funciona sola. Estas son las conexiones más útiles para una escuela.</p>
      <div className="catalogo-lista">
        {IDEAS.map(i => (
          <div key={i.titulo} className="item-integracion">
            <div><strong>{i.icono} {i.titulo}</strong><small>{i.desc}</small><small><em>{i.como}</em></small></div>
            <button className="btn-sm" onClick={() => ir(i.tab)}>Configurar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const ESTADO_WA = {
  no_instalado: ['Módulo no instalado', 'El servidor no incluye el módulo de WhatsApp. Contacta con quien administra la instalación.'],
  detenido: ['Desactivado', 'No se envía ningún mensaje. Pulsa «Generar QR» para activarlo.'],
  iniciando: ['Iniciando…', 'Conectando con WhatsApp.'],
  esperando_qr: ['Esperando el escaneo', 'En el móvil del número que enviará los mensajes: WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo.'],
  conectado: ['Conectado', 'Listo para enviar avisos.'],
  error: ['Error', 'No se pudo conectar. Inténtalo de nuevo.'],
};

function WhatsApp({ api, h, toast$ }) {
  const [wa, setWa] = useState(null);
  const [tel, setTel] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    try { const r = await api.get('/api/admin/whatsapp', { headers: h() }); setWa(r.data); return r.data; } catch { return null; }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  // Mientras se conecta o espera el QR, se consulta cada 3 s (el QR de WhatsApp se renueva solo)
  useEffect(() => {
    clearInterval(timer.current);
    if (wa && ['iniciando', 'esperando_qr'].includes(wa.estado)) timer.current = setInterval(cargar, 3000);
    return () => clearInterval(timer.current);
  }, [wa?.estado]);

  const accion = async (ruta, ok) => {
    setOcupado(true);
    try { const r = await api.post(`/api/admin/whatsapp/${ruta}`, null, { headers: h() }); setWa(w => ({ ...w, ...r.data })); if (ok) toast$(ok, 'success'); }
    catch (e) { toast$(e.response?.data?.error || 'Error', 'error'); }
    finally { setOcupado(false); }
  };
  const probar = async () => {
    setOcupado(true);
    try { await api.post('/api/admin/whatsapp/probar', { telefono: tel || undefined }, { headers: h() }); toast$('Mensaje de prueba enviado ✓', 'success'); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo enviar', 'error'); }
    finally { setOcupado(false); }
  };

  if (!wa) return <div className="card"><div className="empty-state"><p>Cargando…</p></div></div>;
  if (wa.permitido === false) return <div className="card"><h2>WhatsApp</h2><p className="form-hint">Este despliegue no tiene WhatsApp habilitado.</p></div>;
  const [titulo, ayuda] = ESTADO_WA[wa.estado] || ESTADO_WA.detenido;
  const activo = ['iniciando', 'esperando_qr', 'conectado'].includes(wa.estado);

  return (
    <>
      <div className="card">
        <h2>WhatsApp <span className={`estado-badge ${wa.estado === 'conectado' ? 'aprobado' : wa.estado === 'error' ? 'rechazado' : 'pendiente'}`}>{titulo}</span></h2>
        <p className="form-hint">{wa.detalle || ayuda}</p>
        {wa.estado === 'conectado' && <p>Número vinculado: <strong>{wa.numero ? `+${wa.numero}` : '—'}</strong> · Hoy: {wa.enviadosHoy}/{wa.maxDia} mensajes · Reciben avisos: <strong>{wa.destinatarios}</strong> profesor{wa.destinatarios === 1 ? '' : 'es'}</p>}
        {wa.estado === 'esperando_qr' && (
          <div className="qr-whatsapp">
            {wa.qr ? <img src={wa.qr} alt="Código QR para vincular WhatsApp" width="260" height="260" /> : <p className="form-hint">Generando el código…</p>}
            <small>El código se renueva solo cada pocos segundos.</small>
          </div>
        )}
        <div className="action-buttons" style={{ marginTop: 12 }}>
          {!activo && <button className="btn-primary" disabled={ocupado || !wa.instalado} onClick={() => accion('iniciar')}>{wa.vinculado ? 'Activar' : 'Generar QR'}</button>}
          {activo && <button className="btn-sm" disabled={ocupado} onClick={() => accion('detener', 'WhatsApp desactivado')}>Desactivar</button>}
          {wa.vinculado && <button className="btn-sm" disabled={ocupado} onClick={() => window.confirm('Se cerrará la sesión en el móvil y habrá que escanear un QR nuevo. ¿Continuar?') && accion('desvincular', 'Número desvinculado')}>Desvincular número</button>}
        </div>
      </div>

      {wa.estado === 'conectado' && (
        <div className="card">
          <h2>Mensaje de prueba</h2>
          <div className="form-group"><label htmlFor="wa-tel">Teléfono (vacío = el tuyo de «Mi perfil»)</label>
            <input id="wa-tel" type="tel" placeholder="+34612345678" value={tel} onChange={e => setTel(e.target.value)} /></div>
          <button className="btn-primary" disabled={ocupado} onClick={probar}>Enviar prueba</button>
        </div>
      )}

      <div className="card">
        <h2>Qué se envía</h2>
        <ul className="lista-simple">
          <li>Respuesta a una solicitud de días libres (aprobada o rechazada).</li>
          <li>Revisión de horas (aprobadas, discrepancia, corrección) y mes reabierto.</li>
          <li>Avisos de administración (se envían también por WhatsApp).</li>
          <li>Recordatorio de fichar la salida y, los 2 últimos días del mes, de confirmar las horas.</li>
        </ul>
        <p className="form-hint"><strong>Solo a quien lo active en su perfil</strong> y tenga teléfono. Los mensajes salen en cola, con pausas y un tope diario.</p>
        <div className="revision revision-pendiente" role="note">
          <strong>Importante</strong>
          <p>Usa un <strong>número dedicado</strong>, no el personal ni el de atención al cliente. Este sistema no es la API oficial de WhatsApp: no cumple sus condiciones de uso y WhatsApp puede bloquear el número. Mantén pocos mensajes y solo a personas que los esperan.</p>
        </div>
      </div>
    </>
  );
}

export default function VistaIntegraciones({ api, h, toast$ }) {
  const [tab, setTab] = useState('ideas');
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
        <button className={`btn-tab${tab === 'ideas' ? ' active' : ''}`} onClick={() => setTab('ideas')}>Ideas</button>
        <button className={`btn-tab${tab === 'whatsapp' ? ' active' : ''}`} onClick={() => setTab('whatsapp')}>WhatsApp</button>
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

      {tab === 'ideas' && <Ideas ir={setTab} />}
      {tab === 'whatsapp' && <WhatsApp api={api} h={h} toast$={toast$} />}

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
            <h2>Cómo usar una clave</h2>
            <p className="form-hint">Se envía en la cabecera <code>X-API-Key</code>. Ejemplo (horas del mes de todo el equipo):</p>
            <code className="secreto" style={{ whiteSpace: 'pre-wrap' }}>{`curl -H "X-API-Key: sj_…" \\\n  ${api.defaults.baseURL}/api/v1/informe/${mesActual()}`}</code>
            <p className="form-hint">Endpoints: <code>GET /api/v1/profesores</code> · <code>GET /api/v1/informe/AAAA-MM</code> (?email=) · <code>POST /api/v1/planning</code>. Documentación completa en <code>docs/INTEGRACIONES.md</code>.</p>
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
