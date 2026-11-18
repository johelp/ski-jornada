import { useState, useEffect, useCallback } from 'react';

// Bonos y giftcards: emisión con código de seguimiento, consumo (con la reserva del software de reservas), devolución, anulación e historial.
const ESTADO = { ACTIVO: ['aprobado', 'Activo'], AGOTADO: ['pendiente', 'Agotado'], VENCIDO: ['rechazado', 'Vencido'], ANULADO: ['rechazado', 'Anulado'] };
const TIPO = { BONO: 'Bono', GIFTCARD: 'Giftcard' };
const MOV = { EMISION: 'Emisión', CONSUMO: 'Consumo', DEVOLUCION: 'Devolución', ANULACION: 'Anulación', REACTIVACION: 'Reactivación', AJUSTE: 'Ajuste' };
const fecha = f => (f ? new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'sin vencimiento');
const fechaHora = f => new Date(f).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const num = n => String(Math.round(n * 100) / 100).replace('.', ',');
const valor = (n, u) => (u === 'HORAS' ? `${num(n)} h` : `${num(n)} €`);
const VACIO = { tipo: 'BONO', unidad: 'EUROS', valor: '', titularNombre: '', titularEmail: '', titularTelefono: '', concepto: '', venc: 'duracion', durCant: '6', durUnidad: 'MESES', venceAt: '', notas: '' };
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function vencimientoTxt(b) {
  if (!b.venceAt) return 'Sin vencimiento';
  if (b.estado === 'VENCIDO') return `Venció el ${fecha(b.venceAt)}`;
  const d = b.diasParaVencer;
  return `Vence el ${fecha(b.venceAt)}${d != null && d <= 30 && b.estado === 'ACTIVO' ? ` · ${d === 0 ? 'hoy' : `en ${d} día${d === 1 ? '' : 's'}`}` : ''}`;
}

export default function VistaBonos({ api, h, toast$, config }) {
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState('ACTIVO');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [abierto, setAbierto] = useState(null); // bono con movimientos
  const [accion, setAccion] = useState(null);   // { tipo: 'consumir'|'devolver'|'anular'|'editar', ... }
  const [ocupado, setOcupado] = useState(false);

  const err = e => toast$(e.response?.data?.error || 'Error', 'error');
  const cargar = useCallback(async () => {
    try { setLista((await api.get('/api/admin/bonos', { headers: h() })).data); } catch (e) { err(e); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = async (id) => {
    if (abierto?.id === id) { setAbierto(null); setAccion(null); return; }
    try { setAbierto((await api.get(`/api/admin/bonos/${id}`, { headers: h() })).data); setAccion(null); } catch (e) { err(e); }
  };
  const buscarCodigo = async (ev) => {
    ev.preventDefault();
    if (!q.trim()) return;
    try { const r = await api.get(`/api/admin/bonos/codigo/${encodeURIComponent(q.trim())}`, { headers: h() }); setFiltro('TODOS'); setAbierto(r.data); setAccion(null); }
    catch (e) { err(e); }
  };
  const refrescar = async (b) => { setAbierto(b); await cargar(); };

  const emitir = async (ev) => {
    ev.preventDefault();
    const f = form;
    const body = { tipo: f.tipo, unidad: f.unidad, valor: f.valor, titularNombre: f.titularNombre, titularEmail: f.titularEmail, titularTelefono: f.titularTelefono, concepto: f.concepto, notas: f.notas };
    if (f.venc === 'duracion') body.vencimiento = { cantidad: f.durCant, unidad: f.durUnidad };
    if (f.venc === 'fecha') body.venceAt = f.venceAt;
    setOcupado(true);
    try {
      const r = await api.post('/api/admin/bonos', body, { headers: h() });
      toast$(`Emitido ${r.data.codigo}`, 'success'); setForm(null); setFiltro('ACTIVO'); setAbierto(r.data); await cargar();
    } catch (e) { err(e); } finally { setOcupado(false); }
  };

  const ejecutar = async (ev) => {
    ev.preventDefault();
    const a = accion, b = abierto;
    setOcupado(true);
    try {
      let r;
      if (a.tipo === 'consumir') r = await api.post(`/api/admin/bonos/${b.id}/consumir`, { cantidad: a.cantidad, referencia: a.referencia, nota: a.nota }, { headers: h() });
      else if (a.tipo === 'devolver') r = await api.post(`/api/admin/bonos/${b.id}/devolver`, { cantidad: a.cantidad, referencia: a.referencia, nota: a.nota }, { headers: h() });
      else if (a.tipo === 'anular') r = await api.post(`/api/admin/bonos/${b.id}/anular`, { motivo: a.motivo }, { headers: h() });
      else if (a.tipo === 'editar') {
        const body = { titularNombre: a.titularNombre, titularEmail: a.titularEmail, titularTelefono: a.titularTelefono, concepto: a.concepto, notas: a.notas };
        if (a.venc === 'sin') body.sinVencimiento = true;
        if (a.venc === 'fecha' && a.venceAt) body.venceAt = a.venceAt;
        if (a.venc === 'duracion') body.vencimiento = { cantidad: a.durCant, unidad: a.durUnidad };
        r = await api.put(`/api/admin/bonos/${b.id}`, body, { headers: h() });
        r = { data: { ...b, ...r.data, movimientos: b.movimientos } };
      }
      toast$({ consumir: 'Consumo registrado ✓', devolver: 'Saldo devuelto ✓', anular: 'Bono anulado', editar: 'Cambios guardados' }[a.tipo], 'success');
      setAccion(null); await refrescar(r.data);
    } catch (e) { err(e); } finally { setOcupado(false); }
  };
  const reactivar = async (b) => {
    try { const r = await api.post(`/api/admin/bonos/${b.id}/reactivar`, {}, { headers: h() }); toast$('Bono reactivado', 'success'); await refrescar(r.data); } catch (e) { err(e); }
  };

  const copiar = async (c) => { try { await navigator.clipboard.writeText(c); toast$('Código copiado', 'success'); } catch { toast$(c, 'info'); } };
  const imprimir = (b) => {
    const w = window.open('', '_blank', 'width=700,height=800');
    if (!w) { toast$('El navegador bloqueó la ventana de impresión', 'warning'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(b.codigo)}</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:40px;color:#0f172a}.v{border:2px dashed #94a3b8;border-radius:16px;padding:32px;max-width:520px;margin:auto;text-align:center}h1{margin:0 0 4px;font-size:1.3rem}small{color:#475569}.c{font:700 2rem ui-monospace,monospace;letter-spacing:.08em;margin:20px 0}.val{font-size:2.4rem;font-weight:800}p{margin:6px 0}</style><div class="v"><h1>${esc(config?.nombre || 'Escuela de esquí')}</h1><small>${b.tipo === 'GIFTCARD' ? 'Tarjeta regalo' : 'Bono'}</small><div class="val">${esc(valor(b.valorInicial, b.unidad))}</div><div class="c">${esc(b.codigo)}</div>${b.concepto ? `<p>${esc(b.concepto)}</p>` : ''}${b.titularNombre ? `<p>A nombre de <strong>${esc(b.titularNombre)}</strong></p>` : ''}<p><small>${esc(vencimientoTxt({ ...b, estado: 'ACTIVO' }))}</small></p><p><small>Indica este código al reservar.</small></p></div><script>window.onload=()=>window.print()<\/script>`);
    w.document.close();
  };
  const exportar = async () => {
    try {
      const r = await api.get('/api/admin/bonos/exportar.csv', { headers: h(), responseType: 'blob' });
      const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'bonos.csv'; a.click(); URL.revokeObjectURL(url);
    } catch (e) { err(e); }
  };

  if (!lista) return <div className="card"><div className="empty-state"><p>Cargando…</p></div></div>;
  const vivos = lista.filter(b => b.estado === 'ACTIVO');
  const suma = u => vivos.filter(b => b.unidad === u).reduce((a, b) => a + b.saldo, 0);
  const porVencer = vivos.filter(b => b.diasParaVencer != null && b.diasParaVencer <= 30).length;
  const visibles = lista.filter(b => filtro === 'TODOS' || b.estado === filtro);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const seta = (k, v) => setAccion(x => ({ ...x, [k]: v }));

  return (
    <>
      <div className="card">
        <h2>Bonos y giftcards</h2>
        <p className="form-hint">Valor ya abonado por el cliente (en euros o en horas de clase) con un código de seguimiento y, si quieres, vencimiento. Se <strong>consume</strong> aquí cuando la reserva ya está cargada en el software de reservas.</p>
        <p><strong>{vivos.length}</strong> activos · saldo vivo <strong>{num(suma('EUROS'))} €</strong> y <strong>{num(suma('HORAS'))} h</strong>{porVencer > 0 && <> · <strong>{porVencer}</strong> vence{porVencer === 1 ? '' : 'n'} en 30 días</>}</p>
        <form className="action-buttons" onSubmit={buscarCodigo} style={{ marginBottom: 8 }}>
          <input aria-label="Buscar por código" placeholder="Código (BONO-XXXX-XXXX) o nombre" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <button className="btn-sm" type="submit">Buscar código</button>
        </form>
        <div className="action-buttons">
          <button className="btn-primary" onClick={() => { setForm({ ...VACIO }); setAbierto(null); }}>+ Emitir</button>
          <button className="btn-sm" onClick={exportar}>⬇ CSV</button>
        </div>
      </div>

      {form && (
        <form className="card" onSubmit={emitir}>
          <h2>Emitir bono o giftcard</h2>
          <div className="form-group"><label htmlFor="bn-tipo">Tipo</label>
            <select id="bn-tipo" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="BONO">Bono (abonado por el cliente: cierre de temporada, clases contratadas…)</option>
              <option value="GIFTCARD">Giftcard (regalo)</option></select></div>
          <div className="form-group"><label htmlFor="bn-unidad">Vale por</label>
            <select id="bn-unidad" value={form.unidad} onChange={e => set('unidad', e.target.value)}><option value="EUROS">Un importe en euros</option><option value="HORAS">Horas de clase</option></select></div>
          <div className="form-group"><label htmlFor="bn-valor">{form.unidad === 'HORAS' ? 'Horas *' : 'Importe (€) *'}</label>
            <input id="bn-valor" required type="number" inputMode="decimal" min="0.01" step="0.01" value={form.valor} onChange={e => set('valor', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="bn-venc">Vencimiento</label>
            <select id="bn-venc" value={form.venc} onChange={e => set('venc', e.target.value)}><option value="duracion">A los… meses o días de hoy</option><option value="fecha">En una fecha concreta</option><option value="sin">Sin vencimiento</option></select></div>
          {form.venc === 'duracion' && <div className="form-row">
            <div className="form-group"><label htmlFor="bn-dc">Duración</label><input id="bn-dc" type="number" min="1" step="1" value={form.durCant} onChange={e => set('durCant', e.target.value)} /></div>
            <div className="form-group"><label htmlFor="bn-du">Unidad</label><select id="bn-du" value={form.durUnidad} onChange={e => set('durUnidad', e.target.value)}><option value="MESES">Meses</option><option value="DIAS">Días</option></select></div></div>}
          {form.venc === 'fecha' && <div className="form-group"><label htmlFor="bn-f">Vence el (incluido)</label><input id="bn-f" required type="date" value={form.venceAt} onChange={e => set('venceAt', e.target.value)} /></div>}
          <div className="form-group"><label htmlFor="bn-conc">Concepto</label><input id="bn-conc" maxLength={200} placeholder="Cierre de temporada 2026: 5 clases particulares" value={form.concepto} onChange={e => set('concepto', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="bn-tn">Titular (opcional)</label><input id="bn-tn" maxLength={120} placeholder="Nombre" value={form.titularNombre} onChange={e => set('titularNombre', e.target.value)} /></div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="bn-te">Email</label><input id="bn-te" type="email" value={form.titularEmail} onChange={e => set('titularEmail', e.target.value)} /></div>
            <div className="form-group"><label htmlFor="bn-tt">Teléfono</label><input id="bn-tt" type="tel" value={form.titularTelefono} onChange={e => set('titularTelefono', e.target.value)} /></div></div>
          <small className="form-hint">Los datos del titular son opcionales: guarda solo lo que necesites para atender al cliente.</small>
          <div className="action-buttons" style={{ marginTop: 12 }}>
            <button className="btn-primary" disabled={ocupado}>Emitir</button>
            <button type="button" className="btn-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="segmentado" role="tablist" aria-label="Filtrar por estado" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {[['ACTIVO', 'Activos'], ['AGOTADO', 'Agotados'], ['VENCIDO', 'Vencidos'], ['ANULADO', 'Anulados'], ['TODOS', 'Todos']].map(([k, t]) => (
            <button key={k} role="tab" aria-selected={filtro === k} className={filtro === k ? 'activo' : ''} onClick={() => setFiltro(k)}>{t}</button>))}
        </div>
        {!visibles.length && <div className="empty-state"><p>No hay bonos en este estado.</p></div>}
        <div className="catalogo-lista">
          {visibles.map(b => {
            const [clase, etiqueta] = ESTADO[b.estado];
            const abiertoAqui = abierto?.id === b.id;
            return (
              <div key={b.id} className="item-integracion" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button type="button" onClick={() => abrir(b.id)} aria-expanded={abiertoAqui} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                  <strong><span style={{ fontFamily: 'ui-monospace, monospace' }}>{b.codigo}</span> <span className={`estado-badge ${clase}`}>{etiqueta}</span></strong>
                  <small>{TIPO[b.tipo]} · saldo <strong>{valor(b.saldo, b.unidad)}</strong> de {valor(b.valorInicial, b.unidad)} · {vencimientoTxt(b)}</small>
                  {(b.titularNombre || b.concepto) && <small>{[b.titularNombre, b.concepto].filter(Boolean).join(' · ')}</small>}
                </button>
                {abiertoAqui && abierto.movimientos && (
                  <div style={{ marginTop: 10 }}>
                    <div className="action-buttons">
                      {b.estado === 'ACTIVO' && <button className="btn-primary" onClick={() => setAccion({ tipo: 'consumir', cantidad: '', referencia: '', nota: '' })}>Consumir</button>}
                      {!b.anulado && b.saldo < b.valorInicial && <button className="btn-sm" onClick={() => setAccion({ tipo: 'devolver', cantidad: '', referencia: '', nota: '' })}>Devolver saldo</button>}
                      <button className="btn-sm" onClick={() => setAccion({ tipo: 'editar', titularNombre: b.titularNombre || '', titularEmail: b.titularEmail || '', titularTelefono: b.titularTelefono || '', concepto: b.concepto || '', notas: b.notas || '', venc: 'mantener', durCant: '3', durUnidad: 'MESES', venceAt: b.venceAt ? String(b.venceAt).slice(0, 10) : '' })}>Editar</button>
                      <button className="btn-sm" onClick={() => copiar(b.codigo)}>Copiar código</button>
                      <button className="btn-sm" onClick={() => imprimir(b)}>Imprimir</button>
                      {b.anulado ? <button className="btn-sm" onClick={() => reactivar(b)}>Reactivar</button> : <button className="btn-sm" onClick={() => setAccion({ tipo: 'anular', motivo: '' })}>Anular</button>}
                    </div>
                    {b.anulado && b.anuladoMotivo && <p className="form-hint">Anulado: {b.anuladoMotivo}</p>}

                    {accion && (
                      <form onSubmit={ejecutar} className="observacion-box" style={{ marginTop: 10 }}>
                        {(accion.tipo === 'consumir' || accion.tipo === 'devolver') && <>
                          <div className="form-group"><label htmlFor="bn-c">{accion.tipo === 'consumir' ? `Cantidad a consumir (${b.unidad === 'HORAS' ? 'h' : '€'}) — quedan ${valor(b.saldo, b.unidad)}` : `Cantidad a devolver (${b.unidad === 'HORAS' ? 'h' : '€'})`}</label>
                            <input id="bn-c" required type="number" inputMode="decimal" min="0.01" step="0.01" value={accion.cantidad} onChange={e => seta('cantidad', e.target.value)} /></div>
                          <div className="form-group"><label htmlFor="bn-r">Reserva en el software de reservas {accion.tipo === 'consumir' ? '*' : ''}</label>
                            <input id="bn-r" required={accion.tipo === 'consumir'} maxLength={200} placeholder="N.º de reserva o nombre del cliente" value={accion.referencia} onChange={e => seta('referencia', e.target.value)} /></div>
                          <div className="form-group"><label htmlFor="bn-n">Nota</label><input id="bn-n" maxLength={500} value={accion.nota} onChange={e => seta('nota', e.target.value)} /></div>
                          {accion.tipo === 'consumir' && <small className="form-hint">Hazlo cuando la reserva ya esté cargada en el software de reservas: queda anotada con el bono.</small>}
                        </>}
                        {accion.tipo === 'anular' && <div className="form-group"><label htmlFor="bn-m">Motivo de la anulación *</label><input id="bn-m" required maxLength={300} value={accion.motivo} onChange={e => seta('motivo', e.target.value)} /></div>}
                        {accion.tipo === 'editar' && <>
                          <div className="form-group"><label htmlFor="be-tn">Titular</label><input id="be-tn" maxLength={120} value={accion.titularNombre} onChange={e => seta('titularNombre', e.target.value)} /></div>
                          <div className="form-row">
                            <div className="form-group"><label htmlFor="be-te">Email</label><input id="be-te" type="email" value={accion.titularEmail} onChange={e => seta('titularEmail', e.target.value)} /></div>
                            <div className="form-group"><label htmlFor="be-tt">Teléfono</label><input id="be-tt" type="tel" value={accion.titularTelefono} onChange={e => seta('titularTelefono', e.target.value)} /></div></div>
                          <div className="form-group"><label htmlFor="be-c">Concepto</label><input id="be-c" maxLength={200} value={accion.concepto} onChange={e => seta('concepto', e.target.value)} /></div>
                          <div className="form-group"><label htmlFor="be-v">Vencimiento</label>
                            <select id="be-v" value={accion.venc} onChange={e => seta('venc', e.target.value)}><option value="mantener">Dejarlo como está ({vencimientoTxt(b).toLowerCase()})</option><option value="duracion">Nuevo: a los… meses o días de hoy</option><option value="fecha">Nuevo: fecha concreta</option><option value="sin">Quitar el vencimiento</option></select></div>
                          {accion.venc === 'duracion' && <div className="form-row">
                            <div className="form-group"><input aria-label="Duración" type="number" min="1" step="1" value={accion.durCant} onChange={e => seta('durCant', e.target.value)} /></div>
                            <div className="form-group"><select aria-label="Unidad" value={accion.durUnidad} onChange={e => seta('durUnidad', e.target.value)}><option value="MESES">Meses</option><option value="DIAS">Días</option></select></div></div>}
                          {accion.venc === 'fecha' && <div className="form-group"><input aria-label="Fecha de vencimiento" required type="date" value={accion.venceAt} onChange={e => seta('venceAt', e.target.value)} /></div>}
                          <small className="form-hint">El valor no se edita: se consume o se devuelve para que quede el historial.</small>
                        </>}
                        <div className="action-buttons" style={{ marginTop: 8 }}>
                          <button className={accion.tipo === 'anular' ? 'btn-reject' : 'btn-primary'} disabled={ocupado}>{{ consumir: 'Registrar consumo', devolver: 'Devolver', anular: 'Anular bono', editar: 'Guardar' }[accion.tipo]}</button>
                          <button type="button" className="btn-ghost" onClick={() => setAccion(null)}>Cancelar</button>
                        </div>
                      </form>
                    )}

                    <h3 style={{ fontSize: '0.95rem', margin: '14px 0 6px' }}>Historial</h3>
                    <ul className="dash-lista">
                      {abierto.movimientos.map(m => (
                        <li key={m.id}><div><strong>{MOV[m.tipo] || m.tipo}{m.cantidad ? ` · ${m.cantidad > 0 ? '+' : ''}${valor(m.cantidad, b.unidad)}` : ''}</strong>
                          <small>{fechaHora(m.createdAt)} · saldo {valor(m.saldoDespues, b.unidad)}{m.referencia ? ` · reserva: ${m.referencia}` : ''}{m.nota ? ` · ${m.nota}` : ''}</small></div></li>))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
