import { useState, useEffect, useCallback } from 'react';
import { generarPDFColaborador, agruparPorDia, conSigno } from './pdfColaborador';

// Colaboradores y subcontratas: escuelas y autónomos con los que intercambiamos horas.
// Saldo: + a favor de la escuela (nos deben) · − en contra (les debemos).
const num = n => (n ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const eur = n => `${(n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fechaLarga = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const mesCorto = m => { const [a, n] = m.split('-'); return new Date(a, n - 1, 1).toLocaleDateString('es-ES', { month: 'short' }); };
const ESTADO = { PENDIENTE: ['Pendiente', 'col-est-pend'], ACEPTADA: ['Aceptada', 'col-est-ok'], EN_REVISION: ['En revisión', 'col-est-rev'] };

export function ChipSaldo({ saldo }) {
  if (Math.abs(saldo.horas) < 0.005) return <span className="col-saldo col-saldo-cero">Saldado</span>;
  const fav = saldo.horas > 0;
  return <span className={`col-saldo ${fav ? 'col-saldo-fav' : 'col-saldo-con'}`}>{fav ? 'Nos deben' : 'Les debemos'} {num(Math.abs(saldo.horas))} h · {eur(Math.abs(saldo.euros))}</span>;
}

export function TablaPorDia({ movs, acciones }) {
  const dias = agruparPorDia(movs).reverse();
  if (!dias.length) return <p className="dash-vacio">Todavía no hay horas cargadas.</p>;
  return (
    <div className="tabla-scroll">
      <table className="planilla-table col-tabla">
        <thead><tr><th>Día</th><th>Concepto</th><th>Horas</th><th>Importe</th><th>Estado</th>{acciones && <th></th>}</tr></thead>
        <tbody>
          {dias.map(d => d.items.map((m, i) => (
            <tr key={m.id}>
              <td>{i === 0 ? <><strong>{fechaLarga(d.fecha)}</strong>{d.items.length > 1 && <small className="col-neto"> neto {conSigno(d.horas)} h</small>}</> : ''}</td>
              <td>{m.sentido === 'DADAS' ? 'Dadas por nosotros' : 'Recibidas de ellos'}{m.nota && <small className="col-nota"> · {m.nota}</small>}</td>
              <td className={m.sentido === 'DADAS' ? 'col-mas' : 'col-menos'}>{m.sentido === 'DADAS' ? '+' : '−'}{num(m.horas)}</td>
              <td>{eur(m.horas * m.tarifaHora)}</td>
              <td><span className={`col-est ${ESTADO[m.estado][1]}`}>{ESTADO[m.estado][0]}</span>{m.notaColaborador && <small className="col-nota"> «{m.notaColaborador}»</small>}</td>
              {acciones && <td className="col-acciones">{acciones(m)}</td>}
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}

function FormColaborador({ inicial, onGuardar, onCancelar }) {
  const [f, setF] = useState(inicial || { nombre: '', tipo: 'ESCUELA', email: '', telefono: '', contacto: '', cif: '', tarifaHora: '', notas: '' });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <form className="card" onSubmit={e => { e.preventDefault(); onGuardar({ ...f, tarifaHora: Number(f.tarifaHora || 0) }); }}>
      <h2>{inicial ? 'Editar colaborador' : 'Nuevo colaborador'}</h2>
      <div className="form-row">
        <div className="form-group"><label>Nombre</label><input required value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Escuela A / nombre del autónomo" /></div>
        <div className="form-group"><label>Tipo</label>
          <select value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="ESCUELA">Escuela</option><option value="AUTONOMO">Autónomo</option></select></div>
        <div className="form-group"><label>Valor hora del trato (€)</label><input type="number" min="0" step="0.5" required value={f.tarifaHora} onChange={e => set('tarifaHora', e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Correo <small>(opcional; sirve para darle acceso)</small></label><input type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} /></div>
        <div className="form-group"><label>Teléfono</label><input value={f.telefono || ''} onChange={e => set('telefono', e.target.value)} /></div>
        <div className="form-group"><label>Persona de contacto</label><input value={f.contacto || ''} onChange={e => set('contacto', e.target.value)} /></div>
        <div className="form-group"><label>CIF / NIF</label><input value={f.cif || ''} onChange={e => set('cif', e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Notas del trato</label><input value={f.notas || ''} onChange={e => set('notas', e.target.value)} placeholder="Condiciones, fechas de liquidación…" /></div>
      <div className="col-botones"><button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} type="submit">Guardar</button><button className="btn-ghost" type="button" onClick={onCancelar}>Cancelar</button></div>
    </form>
  );
}

function Detalle({ id, api, h, toast$, config, volver, recargarLista }) {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(false);
  const [mov, setMov] = useState(null);       // formulario de horas: { id?, fecha, sentido, horas, tarifaHora, nota }
  const [liq, setLiq] = useState(null);       // formulario de saldar
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const cargar = useCallback(async () => {
    try { setD((await api.get(`/api/admin/colaboradores/${id}`, { headers: h() })).data); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo cargar', 'error'); }
  }, [api, h, id, toast$]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!d) return <div className="card"><p>Cargando…</p></div>;
  const c = d.colaborador;

  const llamar = async (fn, ok) => {
    try { await fn(); if (ok) toast$(ok, 'success'); await cargar(); recargarLista(); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo completar', 'error', 5000); return false; }
    return true;
  };
  const guardarMov = async e => {
    e.preventDefault();
    const body = { fecha: mov.fecha, sentido: mov.sentido, horas: Number(mov.horas), tarifaHora: mov.tarifaHora === '' ? undefined : Number(mov.tarifaHora), nota: mov.nota };
    const ok = await llamar(() => mov.id ? api.put(`/api/admin/colaboradores/horas/${mov.id}`, body, { headers: h() }) : api.post(`/api/admin/colaboradores/${id}/horas`, body, { headers: h() }), mov.id ? 'Horas modificadas' : 'Horas cargadas');
    if (ok) setMov(m => (m.id ? null : { ...m, horas: '', nota: '' })); // al cargar varias seguidas se conserva fecha y sentido
  };
  const abrirLiq = () => setLiq({ tipo: 'PAGO', horas: String(Math.abs(d.saldo.horas)), importe: '', fecha: hoyISO(), nota: '' });
  const guardarLiq = async e => {
    e.preventDefault();
    const completo = Math.abs(Number(liq.horas) - Math.abs(d.saldo.horas)) < 0.01;
    const ok = await llamar(() => api.post(`/api/admin/colaboradores/${id}/liquidar`, { tipo: liq.tipo, horas: completo ? undefined : Number(liq.horas), importe: liq.importe === '' ? undefined : Number(liq.importe), fecha: liq.fecha, nota: liq.nota }, { headers: h() }), 'Saldo actualizado');
    if (ok) setLiq(null);
  };
  const imprimir = async () => {
    try {
      const q = new URLSearchParams(); if (desde) q.set('desde', desde); if (hasta) q.set('hasta', hasta);
      const r = await api.get(`/api/admin/colaboradores/${id}?${q}`, { headers: h() });
      generarPDFColaborador(r.data, config || {});
    } catch (e) { toast$(e.response?.data?.error || 'No se pudo generar el PDF', 'error'); }
  };
  const horasLiq = Number(liq?.horas || 0);
  const importeSug = liq ? (Math.abs(horasLiq - Math.abs(d.saldo.horas)) < 0.01 ? Math.abs(d.saldo.euros) : horasLiq * c.tarifaHora) : 0;

  return (
    <div>
      <div className="card">
        <button className="btn-ghost" onClick={volver}>← Colaboradores</button>
        <div className="card-header" style={{ marginTop: '0.5rem' }}>
          <div>
            <h2>{c.nombre} {!c.activo && <small>(inactivo)</small>}</h2>
            <small className="col-nota">{c.tipo === 'AUTONOMO' ? 'Autónomo' : 'Escuela'} · valor hora {eur(c.tarifaHora)}{c.email ? ` · ${c.email}` : ' · sin correo'}{c.telefono ? ` · ${c.telefono}` : ''}</small>
          </div>
          <button className="btn-sm" onClick={() => setEdit(true)}>Editar datos</button>
        </div>
        {edit && <FormColaborador inicial={c} onCancelar={() => setEdit(false)} onGuardar={async b => { if (await llamar(() => api.put(`/api/admin/colaboradores/${id}`, b, { headers: h() }), 'Guardado')) setEdit(false); }} />}
        <div className="col-resumen">
          <div><b>{num(d.saldo.dadas)} h</b><span>dadas por nosotros</span></div>
          <div><b>{num(d.saldo.recibidas)} h</b><span>recibidas de ellos</span></div>
          <div className="col-resumen-saldo"><ChipSaldo saldo={d.saldo} /></div>
        </div>
        {d.saldo.enRevisionHoras > 0 && <p className="col-aviso">⚠ {num(d.saldo.enRevisionHoras)} h en revisión: no cuentan en el saldo hasta aclararlas.</p>}
        <div className="col-botones">
          <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={() => setMov({ fecha: hoyISO(), sentido: 'DADAS', horas: '', tarifaHora: '', nota: '' })}>+ Cargar horas</button>
          {Math.abs(d.saldo.horas) >= 0.005 && <button className="btn-sm" onClick={abrirLiq}>Saldar</button>}
        </div>
      </div>

      {mov && (
        <form className="card" onSubmit={guardarMov}>
          <h2>{mov.id ? 'Modificar horas' : 'Cargar horas'}</h2>
          <div className="form-row">
            <div className="form-group"><label>Día</label><input type="date" required value={mov.fecha} onChange={e => setMov({ ...mov, fecha: e.target.value })} /></div>
            <div className="form-group"><label>Qué pasó</label>
              <select value={mov.sentido} onChange={e => setMov({ ...mov, sentido: e.target.value })}>
                <option value="DADAS">Les dimos horas (nos deben)</option><option value="RECIBIDAS">Nos dieron horas (les debemos)</option>
              </select></div>
            <div className="form-group"><label>Horas</label><input type="number" required min="0.25" step="0.25" value={mov.horas} onChange={e => setMov({ ...mov, horas: e.target.value })} /></div>
            <div className="form-group"><label>Valor hora (€)</label><input type="number" min="0" step="0.5" placeholder={`trato: ${c.tarifaHora}`} value={mov.tarifaHora} onChange={e => setMov({ ...mov, tarifaHora: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Nota</label><input value={mov.nota || ''} onChange={e => setMov({ ...mov, nota: e.target.value })} placeholder="Clase, grupo, profesor que cubrió…" /></div>
          {mov.id && <p className="form-hint">Al modificar unas horas vuelven a «Pendiente» y se avisa al colaborador.</p>}
          <div className="col-botones"><button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} type="submit">{mov.id ? 'Guardar cambios' : 'Cargar'}</button><button className="btn-ghost" type="button" onClick={() => setMov(null)}>Cerrar</button></div>
        </form>
      )}

      {liq && (
        <form className="card" onSubmit={guardarLiq}>
          <h2>Saldar horas</h2>
          <p className="form-hint">{d.saldo.horas > 0 ? 'Nos deben' : 'Les debemos'} {num(Math.abs(d.saldo.horas))} h ({eur(Math.abs(d.saldo.euros))}). Un <b>pago</b> es dinero {d.saldo.horas > 0 ? 'que nos entregan' : 'que entregamos'}; una <b>compensación</b> las da por saldadas sin dinero (horas contra horas).</p>
          <div className="form-row">
            <div className="form-group"><label>Cómo</label><select value={liq.tipo} onChange={e => setLiq({ ...liq, tipo: e.target.value })}><option value="PAGO">Pago en dinero</option><option value="COMPENSACION">Compensación</option></select></div>
            <div className="form-group"><label>Horas a saldar</label><input type="number" min="0.25" step="0.25" max={Math.abs(d.saldo.horas)} required value={liq.horas} onChange={e => setLiq({ ...liq, horas: e.target.value })} /></div>
            <div className="form-group"><label>Importe (€)</label><input type="number" min="0" step="0.01" placeholder={num(importeSug)} value={liq.importe} onChange={e => setLiq({ ...liq, importe: e.target.value })} /></div>
            <div className="form-group"><label>Fecha</label><input type="date" required value={liq.fecha} onChange={e => setLiq({ ...liq, fecha: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Nota</label><input value={liq.nota} onChange={e => setLiq({ ...liq, nota: e.target.value })} placeholder="Transferencia del 15/03…" /></div>
          <div className="col-botones"><button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} type="submit">Saldar</button><button className="btn-ghost" type="button" onClick={() => setLiq(null)}>Cancelar</button></div>
        </form>
      )}

      <div className="card">
        <div className="card-header"><h2>Horas por día</h2></div>
        <TablaPorDia movs={d.movimientos} acciones={m => (
          <>
            {m.estado !== 'ACEPTADA' && <button className="btn-ghost" title="Confirmada por teléfono o en persona" onClick={() => llamar(() => api.post(`/api/admin/colaboradores/horas/${m.id}/estado`, { estado: 'ACEPTADA' }, { headers: h() }), 'Marcada como aceptada')}>✓ Aceptar</button>}
            <button className="btn-ghost" onClick={() => setMov({ id: m.id, fecha: m.fecha, sentido: m.sentido, horas: String(m.horas), tarifaHora: String(m.tarifaHora), nota: m.nota || '' })}>Editar</button>
            <button className="btn-ghost" onClick={() => { if (window.confirm('¿Borrar estas horas?')) llamar(() => api.delete(`/api/admin/colaboradores/horas/${m.id}`, { headers: h() }), 'Horas borradas'); }}>Borrar</button>
          </>
        )} />
      </div>

      {d.liquidaciones.length > 0 && (
        <div className="card">
          <h2>Liquidaciones</h2>
          <div className="tabla-scroll"><table className="planilla-table col-tabla">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Horas</th><th>Importe</th><th>Nota</th><th></th></tr></thead>
            <tbody>{[...d.liquidaciones].reverse().map(l => (
              <tr key={l.id}><td>{l.fecha}</td><td>{l.tipo === 'PAGO' ? 'Pago' : 'Compensación'}</td><td>{conSigno(l.horas)} h</td><td>{eur(Math.abs(l.importe))}</td><td>{l.nota}</td>
                <td><button className="btn-ghost" onClick={() => { if (window.confirm('¿Anular esta liquidación? El saldo volverá a como estaba.')) llamar(() => api.delete(`/api/admin/colaboradores/liquidaciones/${l.id}`, { headers: h() }), 'Liquidación anulada'); }}>Anular</button></td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      <div className="card">
        <h2>Imprimir extracto</h2>
        <p className="form-hint">PDF con las horas por día, las liquidaciones y el saldo, para enviárselo al colaborador o liquidar.</p>
        <div className="form-row">
          <div className="form-group"><label>Desde <small>(opcional)</small></label><input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div className="form-group"><label>Hasta <small>(opcional)</small></label><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
        </div>
        <button className="btn-download" onClick={imprimir}>⬇ Descargar extracto PDF</button>
      </div>

      <div className="card">
        <h2>Acceso al portal <small>(opcional)</small></h2>
        <p className="form-hint">El colaborador no necesita usar la plataforma: tú llevas la cuenta y le envías el extracto. Si prefieres que lo vea y lo acepte él, dale acceso con su correo: solo verá su cuenta, sin tocar nada más.</p>
        {!c.email ? <p className="col-aviso">Añade un correo en «Editar datos» para poder darle acceso.</p> : d.colaborador.acceso && d.colaborador.acceso.activo ? (
          <div className="col-botones">
            <span>✓ Con acceso ({d.colaborador.acceso.entro ? 'ya entró' : 'invitado, aún no ha entrado'})</span>
            <button className="btn-sm" onClick={() => llamar(() => api.post(`/api/admin/colaboradores/${id}/acceso`, {}, { headers: h() }), 'Invitación reenviada')}>Reenviar invitación</button>
            <button className="btn-ghost" onClick={() => { if (window.confirm('¿Quitar el acceso al portal?')) llamar(() => api.delete(`/api/admin/colaboradores/${id}/acceso`, { headers: h() }), 'Acceso quitado'); }}>Quitar acceso</button>
          </div>
        ) : <button className="btn-sm" onClick={() => llamar(() => api.post(`/api/admin/colaboradores/${id}/acceso`, {}, { headers: h() }), 'Invitación enviada')}>Dar acceso y enviar invitación</button>}
      </div>
    </div>
  );
}

function Estadisticas({ est }) {
  if (!est) return <div className="card"><p>Cargando…</p></div>;
  const max = Math.max(1, ...est.meses.flatMap(m => [m.dadas, m.recibidas]));
  return (
    <>
      <div className="card">
        <h2>Horas por mes</h2>
        <div className="col-grafico" role="img" aria-label="Horas dadas y recibidas por mes">
          {est.meses.map(m => (
            <div key={m.mes} className="col-barra-grupo" title={`${m.mes}: dadas ${num(m.dadas)} h · recibidas ${num(m.recibidas)} h`}>
              <div className="col-barras"><i className="col-b-dadas" style={{ height: `${(m.dadas / max) * 100}%` }} /><i className="col-b-recib" style={{ height: `${(m.recibidas / max) * 100}%` }} /></div>
              <span>{mesCorto(m.mes)}</span>
            </div>
          ))}
        </div>
        <p className="col-leyenda"><i className="col-b-dadas" /> Dadas por nosotros <i className="col-b-recib" /> Recibidas de ellos</p>
      </div>
      <div className="card">
        <h2>Saldo por colaborador</h2>
        <div className="tabla-scroll"><table className="planilla-table col-tabla">
          <thead><tr><th>Colaborador</th><th>Dadas</th><th>Recibidas</th><th>Saldo</th><th>Valor</th></tr></thead>
          <tbody>{[...est.colaboradores].sort((a, b) => Math.abs(b.euros) - Math.abs(a.euros)).map(c => (
            <tr key={c.id}><td>{c.nombre}{!c.activo && ' (inactivo)'}</td><td>{num(c.dadas)} h</td><td>{num(c.recibidas)} h</td>
              <td className={c.horas > 0 ? 'col-mas' : c.horas < 0 ? 'col-menos' : ''}>{conSigno(c.horas)} h</td><td>{eur(c.euros)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}


// Carga rápida del día: el operador repasa el planning al terminar la jornada y carga las horas de un tirón.
// Colaborador (un toque) → «Dimos» / «Nos dieron» (un toque) → horas (botón rápido) → referencia → Enter. Se conserva colaborador y sentido.
const RAPIDAS = [0.5, 1, 1.5, 2, 3, 4];
const sumaDia = d => { const t = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const mover = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const guardado = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };

function CargaRapida({ api, h, toast$, lista, onCambio }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [colId, setColId] = useState(() => guardado('sj-col-ultimo', ''));
  const [sentido, setSentido] = useState('');
  const [horas, setHoras] = useState('');
  const [ref, setRef] = useState('');
  const [dia, setDia] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const activos = (lista || []).filter(c => c.activo);
  const cargarDia = useCallback(async () => {
    try { setDia((await api.get('/api/admin/colaboradores/dia', { headers: h(), params: { fecha } })).data.movimientos); }
    catch { setDia([]); }
  }, [api, h, fecha]);
  useEffect(() => { cargarDia(); }, [cargarDia]);
  useEffect(() => { if (colId && !activos.some(c => c.id === colId)) setColId(''); }, [lista]); // eslint-disable-line

  const elegir = id => { setColId(id); try { localStorage.setItem('sj-col-ultimo', id); } catch {} };
  const listo = colId && sentido && Number(horas) > 0;
  const enviar = async e => {
    e?.preventDefault();
    if (!listo || enviando) return;
    setEnviando(true);
    try {
      await api.post(`/api/admin/colaboradores/${colId}/horas`, { fecha, sentido, horas: Number(horas), nota: ref }, { headers: h() });
      const c = activos.find(x => x.id === colId);
      toast$(`✓ ${sentido === 'DADAS' ? 'Dimos' : 'Nos dieron'} ${horas} h · ${c?.nombre}`, 'success', 2200);
      setHoras(''); setRef('');
      await cargarDia(); onCambio();
    } catch (err) { toast$(err.response?.data?.error || 'No se pudo cargar', 'error', 5000); }
    finally { setEnviando(false); }
  };
  const borrar = async m => {
    try { await api.delete(`/api/admin/colaboradores/horas/${m.id}`, { headers: h() }); await cargarDia(); onCambio(); }
    catch (err) { toast$(err.response?.data?.error || 'No se pudo borrar', 'error'); }
  };
  const netoPorCol = [...dia.reduce((mp, m) => mp.set(m.colaboradorId, { nombre: m.colaborador.nombre, h: (mp.get(m.colaboradorId)?.h || 0) + (m.sentido === 'DADAS' ? 1 : -1) * m.horas }), new Map()).values()];

  if (lista && !activos.length) return <div className="card"><p className="dash-vacio">Crea primero un colaborador (pestaña «Colaboradores») para poder cargarle horas.</p></div>;
  return (
    <div>
      <div className="card cr-card">
        <div className="cr-fecha">
          <button className="btn-ghost" onClick={() => setFecha(mover(fecha, -1))} aria-label="Día anterior">◀</button>
          <div><strong>{sumaDia(new Date(`${fecha}T12:00:00`))}</strong>{fecha !== hoyISO() && <button className="btn-ghost" onClick={() => setFecha(hoyISO())}>Hoy</button>}</div>
          <button className="btn-ghost" onClick={() => setFecha(mover(fecha, 1))} aria-label="Día siguiente">▶</button>
        </div>
        <form onSubmit={enviar}>
          <p className="cr-etq">1 · Colaborador</p>
          <div className="cr-chips">
            {activos.map(c => <button type="button" key={c.id} className={`cr-chip${colId === c.id ? ' sel' : ''}`} onClick={() => elegir(c.id)}>{c.nombre}</button>)}
          </div>
          <p className="cr-etq">2 · ¿Qué pasó?</p>
          <div className="cr-sentido">
            <button type="button" className={`cr-dimos${sentido === 'DADAS' ? ' sel' : ''}`} onClick={() => setSentido('DADAS')}>⬆ Les dimos horas<small>nos deben</small></button>
            <button type="button" className={`cr-dieron${sentido === 'RECIBIDAS' ? ' sel' : ''}`} onClick={() => setSentido('RECIBIDAS')}>⬇ Nos dieron horas<small>les debemos</small></button>
          </div>
          <p className="cr-etq">3 · Horas</p>
          <div className="cr-chips">
            {RAPIDAS.map(x => <button type="button" key={x} className={`cr-chip cr-h${Number(horas) === x ? ' sel' : ''}`} onClick={() => setHoras(String(x))}>{x}</button>)}
            <input className="cr-horas" type="number" inputMode="decimal" min="0.25" step="0.25" placeholder="otra" value={horas} onChange={e => setHoras(e.target.value)} aria-label="Horas" />
          </div>
          <p className="cr-etq">4 · Referencia <small>(opcional)</small></p>
          <input className="cr-ref" value={ref} onChange={e => setRef(e.target.value)} placeholder="Clase, grupo, profesor que cubrió…" maxLength={300} />
          <button className="btn-primary cr-enviar" type="submit" disabled={!listo || enviando}>
            {listo ? `Cargar ${horas} h · ${sentido === 'DADAS' ? 'les dimos' : 'nos dieron'}` : 'Elige colaborador, sentido y horas'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header"><h2>Cargado este día</h2></div>
        {!dia.length ? <p className="dash-vacio">Todavía no hay horas este día.</p> : (
          <>
            <ul className="dash-lista">
              {dia.map(m => (
                <li key={m.id}>
                  <div><strong>{m.colaborador.nombre}</strong><small>{m.sentido === 'DADAS' ? '⬆ Les dimos' : '⬇ Nos dieron'} <b>{num(m.horas)} h</b>{m.nota ? ` · ${m.nota}` : ''}</small></div>
                  <button className="btn-ghost" onClick={() => borrar(m)} aria-label="Quitar">✕</button>
                </li>
              ))}
            </ul>
            <p className="cr-neto">{netoPorCol.map(c => `${c.nombre}: ${conSigno(c.h)} h`).join(' · ')}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function VistaColaboradores({ api, h, toast$, config }) {
  const [lista, setLista] = useState(null);
  const [est, setEst] = useState(null);
  const [tab, setTab] = useState('dia');
  const [sel, setSel] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);
  const cargar = useCallback(async () => {
    try {
      const [l, e] = await Promise.all([api.get('/api/admin/colaboradores', { headers: h() }), api.get('/api/admin/colaboradores/estadisticas?meses=12', { headers: h() })]);
      setLista(l.data); setEst(e.data);
    } catch (e) { toast$(e.response?.data?.error || 'No se pudieron cargar los colaboradores', 'error'); }
  }, [api, h, toast$]);
  useEffect(() => { cargar(); }, [cargar]);

  if (sel) return <Detalle id={sel} api={api} h={h} toast$={toast$} config={config} volver={() => setSel(null)} recargarLista={cargar} />;
  const t = est?.totales;
  const visibles = (lista || []).filter(c => c.activo || verInactivos);
  return (
    <div>
      <div className="col-totales">
        <div className="col-total col-total-fav"><b>{eur(t?.aFavorEuros)}</b><span>nos deben ({num(t?.aFavorHoras)} h)</span></div>
        <div className="col-total col-total-con"><b>{eur(t?.enContraEuros)}</b><span>les debemos ({num(t?.enContraHoras)} h)</span></div>
        <div className="col-total"><b>{t?.pendientes ?? 0}</b><span>horas pendientes de aceptar</span></div>
        <div className={`col-total ${t?.enRevision ? 'col-total-rev' : ''}`}><b>{t?.enRevision ?? 0}</b><span>en revisión</span></div>
      </div>
      <div className="informe-tabs">
        <button className={`btn-tab${tab === 'dia' ? ' active' : ''}`} onClick={() => setTab('dia')}>⚡ Cargar el día</button>
        <button className={`btn-tab${tab === 'lista' ? ' active' : ''}`} onClick={() => setTab('lista')}>🤝 Colaboradores</button>
        <button className={`btn-tab${tab === 'est' ? ' active' : ''}`} onClick={() => setTab('est')}>📊 Estadísticas</button>
      </div>
      {tab === 'dia' ? <CargaRapida api={api} h={h} toast$={toast$} lista={lista} onCambio={cargar} /> : tab === 'est' ? <Estadisticas est={est} /> : (
        <>
          {nuevo && <FormColaborador onCancelar={() => setNuevo(false)} onGuardar={async b => {
            try { const r = await api.post('/api/admin/colaboradores', b, { headers: h() }); toast$('Colaborador creado', 'success'); setNuevo(false); await cargar(); setSel(r.data.id); }
            catch (e) { toast$(e.response?.data?.error || 'No se pudo crear', 'error'); }
          }} />}
          <div className="card">
            <div className="card-header">
              <h2>Colaboradores y subcontratas</h2>
              <div className="col-botones">
                <label className="col-check"><input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} /> Ver inactivos</label>
                {!nuevo && <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={() => setNuevo(true)}>+ Nuevo</button>}
              </div>
            </div>
            {!lista ? <p>Cargando…</p> : !visibles.length ? (
              <p className="dash-vacio">Aún no hay colaboradores. Añade las escuelas o autónomos con los que intercambias horas.</p>
            ) : (
              <div className="col-lista">
                {visibles.map(c => (
                  <button key={c.id} className="col-fila" onClick={() => setSel(c.id)}>
                    <div><strong>{c.nombre}</strong><small>{c.tipo === 'AUTONOMO' ? 'Autónomo' : 'Escuela'} · {eur(c.tarifaHora)}/h{c.acceso?.activo ? ' · con acceso' : ''}</small></div>
                    <div className="col-fila-der">
                      {c.saldo.enRevision > 0 && <span className="col-est col-est-rev">{c.saldo.enRevision} en revisión</span>}
                      {c.saldo.pendientes > 0 && <span className="col-est col-est-pend">{c.saldo.pendientes} pend.</span>}
                      <ChipSaldo saldo={c.saldo} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
