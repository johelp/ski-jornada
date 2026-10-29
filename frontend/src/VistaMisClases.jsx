import { useState, useEffect, useCallback } from 'react';
import { generarPDFClases } from './pdfClases';

const eur = n => (n == null ? '—' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const fechaCorta = f => { const [, m, d] = f.split('-'); return `${d}/${m}`; };
const hoyISO = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const mesActual = () => hoyISO().slice(0, 7);
const formVacio = () => ({ fecha: hoyISO(), horas: '1', tipoId: '', primaIds: [], notas: '' });

// Vista del profesor: cargar clases dadas, consultarlas, confirmar el mes y bajar el informe.
export default function VistaMisClases({ api, h, toast$, config }) {
  const [catalogo, setCatalogo] = useState({ tipos: [], primas: [] });
  const [mes, setMes] = useState(mesActual());
  const [informe, setInforme] = useState(null);
  const [form, setForm] = useState(formVacio());
  const [editId, setEditId] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargarInforme = useCallback(async () => {
    try { setInforme((await api.get(`/api/clases/informe/${mes}`, { headers: h() })).data); }
    catch { toast$('No se pudo cargar el mes', 'error'); }
  }, [mes, api, h, toast$]);

  useEffect(() => {
    api.get('/api/clases/catalogo', { headers: h() }).then(r => {
      setCatalogo(r.data);
      setForm(f => ({ ...f, tipoId: f.tipoId || r.data.tipos[0]?.id || '' }));
    }).catch(() => toast$('No se pudo cargar el catálogo', 'error'));
  }, []);
  useEffect(() => { cargarInforme(); }, [cargarInforme]);

  const togglePrima = id => setForm(f => ({
    ...f, primaIds: f.primaIds.includes(id) ? f.primaIds.filter(x => x !== id) : [...f.primaIds, id],
  }));

  const guardar = async () => {
    if (!form.tipoId) { toast$('Elegí la disciplina', 'warning'); return; }
    setGuardando(true);
    try {
      const body = { ...form, horas: parseFloat(String(form.horas).replace(',', '.')) };
      if (editId) await api.put(`/api/clases/${editId}`, body, { headers: h() });
      else await api.post('/api/clases', body, { headers: h() });
      toast$(editId ? 'Clase actualizada' : 'Clase cargada ✓', 'success');
      setEditId(null);
      setForm(f => ({ ...formVacio(), tipoId: f.tipoId, fecha: f.fecha }));
      if (form.fecha.slice(0, 7) !== mes) setMes(form.fecha.slice(0, 7)); else cargarInforme();
    } catch (e) { toast$(e.response?.data?.error || 'Error al guardar', 'error'); }
    finally { setGuardando(false); }
  };

  const editar = c => {
    setEditId(c.id);
    setForm({ fecha: c.fecha, horas: String(c.horas), tipoId: c.tipoId, primaIds: c.primas.map(p => p.id), notas: c.notas || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminar = async c => {
    if (!window.confirm(`¿Eliminar la clase del ${fechaCorta(c.fecha)} (${c.horas} h)?`)) return;
    try { await api.delete(`/api/clases/${c.id}`, { headers: h() }); cargarInforme(); }
    catch (e) { toast$(e.response?.data?.error || 'Error al eliminar', 'error'); }
  };

  const confirmarMes = async () => {
    if (!window.confirm(`Vas a confirmar ${informe.totalHoras} h de ${mes}. Después no podrás editarlas y se avisa al administrador. ¿Confirmar?`)) return;
    try {
      await api.post('/api/clases/confirmar-mes', { mes }, { headers: h() });
      toast$('Horas confirmadas. Se avisó al administrador ✓', 'success');
      cargarInforme();
    } catch (e) { toast$(e.response?.data?.error || 'Error al confirmar', 'error'); }
  };

  const bloqueado = informe?.confirmado;
  const conImporte = informe?.importeTotal != null;

  return (
    <div>
      <div className="card">
        <h2>{editId ? 'Editar clase' : 'Cargar clase'}</h2>
        <div className="form-row">
          <div className="form-group"><label>Fecha</label>
            <input type="date" value={form.fecha} max={hoyISO()} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
          <div className="form-group"><label>Horas</label>
            <input type="number" inputMode="decimal" min="0.25" max="12" step="0.25" value={form.horas}
              onChange={e => setForm({ ...form, horas: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>Disciplina</label>
          <select value={form.tipoId} onChange={e => setForm({ ...form, tipoId: e.target.value })}>
            {catalogo.tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        {catalogo.primas.length > 0 && (
          <div className="form-group"><label>Primas</label>
            <div className="chips">
              {catalogo.primas.map(p => (
                <button type="button" key={p.id}
                  className={`chip${form.primaIds.includes(p.id) ? ' chip-on' : ''}`} onClick={() => togglePrima(p.id)}>
                  {form.primaIds.includes(p.id) ? '✓ ' : ''}{p.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="form-group"><label>Notas (opcional)</label>
          <input type="text" maxLength="300" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })}
            placeholder="Ej. grupo de niños, reserva #123" /></div>
        <div className="action-buttons">
          <button className="btn-primary" onClick={guardar} disabled={guardando}>{editId ? 'Guardar cambios' : '+ Cargar clase'}</button>
          {editId && <button className="btn-ghost" onClick={() => { setEditId(null); setForm(formVacio()); }}>Cancelar</button>}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Mis horas</h2>
          <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} />
        </div>
        {!informe ? <p>Cargando…</p> : (
          <>
            <div className="resumen-clases">
              <div><strong>{informe.totalHoras} h</strong><small>{informe.detalle.length} clases · {informe.diasConClases} días</small></div>
              {conImporte && <div><strong>{eur(informe.importeTotal)}</strong><small>importe estimado</small></div>}
              <div>
                <span className={`estado-badge ${bloqueado ? 'aprobado' : 'pendiente'}`}>{bloqueado ? 'Confirmado' : 'Sin confirmar'}</span>
              </div>
            </div>

            {!informe.detalle.length ? <div className="empty-state"><p>🎿 Sin clases cargadas este mes</p></div> : (
              <div className="clases-lista">
                {informe.detalle.map(c => (
                  <div key={c.id} className="clase-item">
                    <div className="clase-fecha">{fechaCorta(c.fecha)}</div>
                    <div className="clase-info">
                      <strong>{c.tipoNombre}</strong> · {c.horas} h
                      {c.primas.length > 0 && <div className="clase-primas">{c.primas.map(p => <span key={p.id} className="chip chip-sm">{p.nombre}</span>)}</div>}
                      {c.notas && <small>{c.notas}</small>}
                    </div>
                    {conImporte && <div className="clase-importe">{eur(c.importe)}</div>}
                    {!bloqueado && (
                      <div className="clase-acciones">
                        <button className="btn-sm" onClick={() => editar(c)}>✏</button>
                        <button className="btn-sm" onClick={() => eliminar(c)}>🗑</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {conImporte && (
              <div className="desglose">
                <div><span>Base {informe.tarifaHora != null ? `(${eur(informe.tarifaHora)}/h)` : ''}</span><span>{eur(informe.importeBase)}</span></div>
                {informe.desglosePrimas.filter(d => d.importe != null).map(d => (
                  <div key={d.nombre}><span>Prima {d.nombre} ({d.clases} cl.)</span><span>{eur(d.importe)}</span></div>
                ))}
                <div className="desglose-total"><span>Total</span><span>{eur(informe.importeTotal)}</span></div>
              </div>
            )}

            <div className="action-buttons" style={{ marginTop: '1rem' }}>
              <button className="btn-sm" disabled={!informe.detalle.length} onClick={() => generarPDFClases(informe, config || {})}>⬇ Descargar informe PDF</button>
              {!bloqueado && (
                <button className="btn-approve" disabled={!informe.detalle.length} onClick={confirmarMes}>✔ Confirmar horas del mes</button>
              )}
            </div>
            {bloqueado && <p className="form-hint">Para corregir algo pedile al administrador que reabra el mes.</p>}
          </>
        )}
      </div>
    </div>
  );
}
