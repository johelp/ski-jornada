import { useState, useEffect, useCallback, useRef } from 'react';
import { generarPDFClases } from './pdfClases';
import Icono from './Iconos';

const eur = n => (n == null ? '—' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const nh = n => String(Math.round(Number(n) * 100) / 100).replace('.', ','); // 19.5 → «19,5»
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoyISO = () => iso(new Date());
const ayerISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
const mesActual = () => hoyISO().slice(0, 7);
const mesDe = (m, n) => { const [a, b] = m.split('-').map(Number); return iso(new Date(a, b - 1 + n, 1)).slice(0, 7); };
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const nombreMes = m => { const [a, b] = m.split('-').map(Number); return cap(new Date(a, b - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })); };
const nombreMesCorto = m => { const [a, b] = m.split('-').map(Number); return new Date(a, b - 1, 1).toLocaleDateString('es-ES', { month: 'long' }); };
const etiquetaDia = f => cap(new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''));
export const REVISION = {
  APROBADO: { label: 'Aprobado por administración', clase: 'aprobado' },
  DISCREPANCIA: { label: 'Discrepancia detectada', clase: 'rechazado' },
  CORRECCION: { label: 'Corrección solicitada', clase: 'rechazado' },
  COMENTARIO: { label: 'Comentario de administración', clase: 'pendiente' },
  PENDIENTE: { label: 'En revisión', clase: 'pendiente' },
};
const HORAS_RAPIDAS = ['0.5', '1', '1.5', '2', '3', '4'];
const CLAVE_DISC = 'sj-clase-disciplina';
const recordada = () => { try { return localStorage.getItem(CLAVE_DISC) || ''; } catch { return ''; } };
const formVacio = () => ({ fecha: hoyISO(), horas: '1', tipoId: '', primaIds: [], notas: '' });

// Vista del profesor: cargar clases dadas, consultarlas, confirmar el mes y bajar el informe.
// Pensada para cargar en segundos desde el móvil: hoy/ayer de un toque, horas con botones, la última disciplina recordada.
export default function VistaMisClases({ api, h, toast$, config }) {
  const [catalogo, setCatalogo] = useState({ tipos: [], primas: [] });
  const [mes, setMes] = useState(mesActual());
  const [informe, setInforme] = useState(null);
  const [form, setForm] = useState(formVacio());
  const [editId, setEditId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [otroDia, setOtroDia] = useState(false);
  const [otraHora, setOtraHora] = useState(false);
  const [ultima, setUltima] = useState(null);          // { id, texto }: última clase cargada, con «Deshacer»
  const [mesPrevio, setMesPrevio] = useState(null);    // mes anterior con clases sin confirmar
  const [confirmando, setConfirmando] = useState(false);
  const temp = useRef(null);

  const cargarInforme = useCallback(async () => {
    try { setInforme((await api.get(`/api/clases/informe/${mes}`, { headers: h() })).data); }
    catch { toast$('No se pudo cargar el mes', 'error'); }
  }, [mes, api, h, toast$]);

  // ¿Quedó el mes anterior sin confirmar? (lo normal a principios de mes)
  const comprobarPrevio = useCallback(async () => {
    const prev = mesDe(mesActual(), -1);
    try {
      const r = (await api.get(`/api/clases/informe/${prev}`, { headers: h() })).data;
      setMesPrevio(r.detalle.length && !r.confirmado ? { mes: prev, horas: r.totalHoras } : null);
    } catch { setMesPrevio(null); }
  }, [api, h]);

  useEffect(() => {
    api.get('/api/clases/catalogo', { headers: h() }).then(r => {
      setCatalogo(r.data);
      const ultimaDisc = recordada();
      setForm(f => ({ ...f, tipoId: f.tipoId || (r.data.tipos.some(t => t.id === ultimaDisc) ? ultimaDisc : '') }));
    }).catch(() => toast$('No se pudo cargar el catálogo', 'error'));
    comprobarPrevio();
  }, []);
  useEffect(() => { cargarInforme(); setConfirmando(false); }, [cargarInforme]);
  useEffect(() => () => clearTimeout(temp.current), []);

  const togglePrima = id => setForm(f => ({
    ...f, primaIds: f.primaIds.includes(id) ? f.primaIds.filter(x => x !== id) : [...f.primaIds, id],
  }));

  const horas = parseFloat(String(form.horas).replace(',', '.'));
  const horasOk = horas > 0 && horas <= 12;
  const razon = !form.tipoId ? 'Elige la disciplina' : !horasOk ? 'Indica las horas (entre 0,25 y 12)' : null;

  const guardar = async e => {
    e?.preventDefault();
    if (razon) { toast$(razon, 'warning'); return; }
    setGuardando(true);
    try {
      const body = { ...form, horas };
      const r = editId ? await api.put(`/api/clases/${editId}`, body, { headers: h() }) : await api.post('/api/clases', body, { headers: h() });
      const nombreDisc = catalogo.tipos.find(t => t.id === form.tipoId)?.nombre || 'Clase';
      try { localStorage.setItem(CLAVE_DISC, form.tipoId); } catch {}
      clearTimeout(temp.current);
      if (!editId && r.data?.id) {
        setUltima({ id: r.data.id, texto: `${nombreDisc} · ${nh(horas)} h · ${form.fecha === hoyISO() ? 'hoy' : etiquetaDia(form.fecha)}` });
        temp.current = setTimeout(() => setUltima(null), 12000);
      } else { setUltima(null); toast$('Clase actualizada ✓', 'success'); }
      setEditId(null); setOtraHora(false);
      setForm(f => ({ ...formVacio(), tipoId: f.tipoId, fecha: f.fecha }));
      if (form.fecha.slice(0, 7) !== mes) setMes(form.fecha.slice(0, 7)); else cargarInforme();
      comprobarPrevio();
    } catch (err) { toast$(err.response?.data?.error || 'Error al guardar', 'error'); }
    finally { setGuardando(false); }
  };

  const deshacer = async () => {
    if (!ultima) return;
    try { await api.delete(`/api/clases/${ultima.id}`, { headers: h() }); setUltima(null); cargarInforme(); comprobarPrevio(); toast$('Clase quitada', 'info', 2000); }
    catch (err) { toast$(err.response?.data?.error || 'No se pudo deshacer', 'error'); }
  };

  const editar = c => {
    setEditId(c.id); setUltima(null);
    setOtroDia(c.fecha !== hoyISO() && c.fecha !== ayerISO());
    setOtraHora(!HORAS_RAPIDAS.includes(String(c.horas)));
    setForm({ fecha: c.fecha, horas: String(c.horas), tipoId: c.tipoId, primaIds: c.primas.map(p => p.id), notas: c.notas || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelarEdicion = () => { setEditId(null); setOtraHora(false); setOtroDia(false); setForm(f => ({ ...formVacio(), tipoId: f.tipoId })); };

  const eliminar = async c => {
    if (!window.confirm(`¿Eliminar la clase del ${etiquetaDia(c.fecha)} (${nh(c.horas)} h)?`)) return;
    try { await api.delete(`/api/clases/${c.id}`, { headers: h() }); cargarInforme(); comprobarPrevio(); }
    catch (e) { toast$(e.response?.data?.error || 'Error al eliminar', 'error'); }
  };

  const confirmarMes = async () => {
    try {
      await api.post('/api/clases/confirmar-mes', { mes }, { headers: h() });
      toast$('Horas confirmadas. Se avisó a administración ✓', 'success');
      setConfirmando(false); cargarInforme(); comprobarPrevio();
    } catch (e) { toast$(e.response?.data?.error || 'Error al confirmar', 'error'); }
  };

  const bloqueado = informe?.confirmado;
  const conImporte = informe?.importeTotal != null;
  const esHoy = form.fecha === hoyISO(), esAyer = form.fecha === ayerISO();
  const verFecha = otroDia || (!esHoy && !esAyer);
  const verOtra = otraHora || !HORAS_RAPIDAS.includes(String(form.horas));

  // Clases agrupadas por día (la lista llega ordenada por fecha)
  const dias = [];
  (informe?.detalle || []).forEach(c => {
    const d = dias[dias.length - 1];
    if (d && d.fecha === c.fecha) { d.items.push(c); d.horas += c.horas; } else dias.push({ fecha: c.fecha, items: [c], horas: c.horas });
  });

  return (
    <div>
      {mesPrevio && mes !== mesPrevio.mes && (
        <div className="banner-mes" role="status">
          <div><strong>Te falta confirmar {nombreMesCorto(mesPrevio.mes)}</strong><small>{nh(mesPrevio.horas)} h cargadas sin confirmar</small></div>
          <button className="btn-sm" onClick={() => setMes(mesPrevio.mes)}>Revisar</button>
        </div>
      )}

      <form className="card" onSubmit={guardar}>
        <h2>{editId ? 'Editar clase' : 'Cargar clase'}</h2>

        <div className="form-group"><label id="cl-dia">Día</label>
          <div className="seg" role="group" aria-labelledby="cl-dia">
            <button type="button" className={esHoy && !verFecha ? 'on' : ''} aria-pressed={esHoy && !verFecha} onClick={() => { setOtroDia(false); setForm({ ...form, fecha: hoyISO() }); }}>Hoy</button>
            <button type="button" className={esAyer && !verFecha ? 'on' : ''} aria-pressed={esAyer && !verFecha} onClick={() => { setOtroDia(false); setForm({ ...form, fecha: ayerISO() }); }}>Ayer</button>
            <button type="button" className={verFecha ? 'on' : ''} aria-pressed={verFecha} onClick={() => setOtroDia(true)}>Otro día</button>
          </div>
          {verFecha && <input id="cl-fecha" type="date" aria-label="Fecha de la clase" value={form.fecha} max={hoyISO()} onChange={e => e.target.value && setForm({ ...form, fecha: e.target.value })} />}
        </div>

        <div className="form-group"><label id="cl-horas">Horas</label>
          <div className="horas-grid" role="group" aria-labelledby="cl-horas">
            {HORAS_RAPIDAS.map(x => (
              <button type="button" key={x} className={`chip chip-btn${!verOtra && String(form.horas) === x ? ' chip-on' : ''}`} aria-pressed={!verOtra && String(form.horas) === x}
                onClick={() => { setOtraHora(false); setForm({ ...form, horas: x }); }}>{x.replace('.', ',')}</button>
            ))}
          </div>
          {verOtra ? (
            <input type="number" inputMode="decimal" min="0.25" max="12" step="0.25" autoFocus={otraHora} aria-label="Otra cantidad de horas" placeholder="Otra cantidad, p. ej. 2,75"
              value={form.horas} onChange={e => setForm({ ...form, horas: e.target.value })} />
          ) : <button type="button" className="enlace-sutil" onClick={() => setOtraHora(true)}>Otra cantidad…</button>}
        </div>

        <div className="form-group"><label id="cl-disc">Disciplina</label>
          {catalogo.tipos.length <= 5 ? (
            <div className="chips" role="radiogroup" aria-labelledby="cl-disc">
              {catalogo.tipos.map(t => (
                <button type="button" key={t.id} role="radio" aria-checked={form.tipoId === t.id}
                  className={`chip${form.tipoId === t.id ? ' chip-on' : ''}`} onClick={() => setForm({ ...form, tipoId: t.id })}>
                  {t.nombre}
                </button>
              ))}
            </div>
          ) : (
            <select aria-labelledby="cl-disc" value={form.tipoId} onChange={e => setForm({ ...form, tipoId: e.target.value })}>
              <option value="">Elige la disciplina…</option>
              {catalogo.tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          )}
        </div>

        {catalogo.primas.length > 0 && (
          <div className="form-group"><label id="cl-primas">Primas <small>(solo si corresponden)</small></label>
            <div className="chips" role="group" aria-labelledby="cl-primas">
              {catalogo.primas.map(p => (
                <button type="button" key={p.id} role="checkbox" aria-checked={form.primaIds.includes(p.id)}
                  className={`chip${form.primaIds.includes(p.id) ? ' chip-on' : ''}`} onClick={() => togglePrima(p.id)}>
                  {form.primaIds.includes(p.id) && <Icono n="check" size={16} />}{p.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="form-group"><label htmlFor="cl-notas">Notas <small>(opcional)</small></label>
          <input id="cl-notas" type="text" maxLength="300" enterKeyHint="done" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })}
            placeholder="Ej. grupo de niños, reserva #123" /></div>

        {ultima && (
          <div className="ultima-carga" role="status" aria-live="polite">
            <span><Icono n="check" size={18} /> Cargada: {ultima.texto}</span>
            <button type="button" className="enlace-sutil" onClick={deshacer}>Deshacer</button>
          </div>
        )}

        <div className="action-buttons">
          <button className="btn-primary" type="submit" disabled={guardando || !!razon}>
            {guardando ? 'Guardando…' : razon || (editId ? 'Guardar cambios' : `Cargar clase · ${nh(horas)} h`)}
          </button>
          {editId && <button className="btn-ghost" type="button" onClick={cancelarEdicion}>Cancelar</button>}
        </div>
      </form>

      <div className="card">
        <div className="card-header"><h2>Mis horas</h2></div>
        <div className="mes-nav">
          <button type="button" className="btn-ghost" onClick={() => setMes(mesDe(mes, -1))} aria-label="Mes anterior">‹</button>
          <strong aria-live="polite">{nombreMes(mes)}</strong>
          <button type="button" className="btn-ghost" onClick={() => setMes(mesDe(mes, 1))} disabled={mes >= mesActual()} aria-label="Mes siguiente">›</button>
        </div>

        {!informe ? <p>Cargando…</p> : (
          <>
            <div className="resumen-clases">
              <div><strong>{nh(informe.totalHoras)} h</strong><small>{informe.detalle.length} {informe.detalle.length === 1 ? 'clase' : 'clases'} · {informe.diasConClases} {informe.diasConClases === 1 ? 'día' : 'días'}</small></div>
              {conImporte ? <div><strong>{eur(informe.importeTotal)}</strong><small>importe estimado</small></div>
                : <div><span className={`estado-badge ${bloqueado ? 'aprobado' : 'pendiente'}`}>{bloqueado ? 'Confirmado' : 'Sin confirmar'}</span></div>}
            </div>
            {conImporte && <p className="estado-linea"><span className={`estado-badge ${bloqueado ? 'aprobado' : 'pendiente'}`}>{bloqueado ? 'Confirmado' : 'Sin confirmar'}</span></p>}

            {informe.revision ? (
              <div className={`revision revision-${REVISION[informe.revision.estado]?.clase}`} role="status">
                <strong>{REVISION[informe.revision.estado]?.label}</strong>
                {informe.revision.nota && <p>“{informe.revision.nota}”</p>}
                {informe.revision.estado === 'CORRECCION' && <p className="form-hint">Corrige lo indicado y vuelve a confirmar el mes.</p>}
              </div>
            ) : bloqueado && (
              <div className="revision revision-pendiente" role="status"><strong>En espera de revisión</strong><p>Administración revisará tus horas.</p></div>
            )}

            {!dias.length ? <div className="empty-state"><p>🎿 Sin clases cargadas en {nombreMesCorto(mes)}</p></div> : (
              <div className="dias-lista">
                {dias.map(d => (
                  <section key={d.fecha} aria-label={etiquetaDia(d.fecha)}>
                    <div className="dia-cab"><strong>{etiquetaDia(d.fecha)}</strong><span>{nh(d.horas)} h</span></div>
                    {d.items.map(c => (
                      <div key={c.id} className="clase-fila">
                        <div className="clase-fila-info">
                          <span className="clase-fila-titulo"><strong>{c.tipoNombre}</strong> <span className="nowrap">· {nh(c.horas)} h</span></span>
                          {c.primas.length > 0 && <div className="clase-primas">{c.primas.map(p => <span key={p.id} className="chip chip-sm">{p.nombre}</span>)}</div>}
                          {c.notas && <small>{c.notas}</small>}
                          {c.marca && (
                            <small className={`marca marca-${c.marca.toLowerCase()}`}>
                              {c.marca === 'OK' ? 'Revisada por administración' : 'A revisar'}{c.notaAdmin ? ` — ${c.notaAdmin}` : ''}
                            </small>
                          )}
                        </div>
                        {conImporte && <div className="clase-importe">{eur(c.importe)}</div>}
                        {!bloqueado && (
                          <div className="clase-fila-acciones">
                            <button type="button" className="btn-accion" onClick={() => editar(c)}><Icono n="editar" size={18} /> Editar</button>
                            <button type="button" className="btn-accion" onClick={() => eliminar(c)} aria-label={`Eliminar la clase de ${c.tipoNombre} del ${etiquetaDia(c.fecha)}`}><Icono n="borrar" size={18} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
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

            {confirmando ? (
              <div className="confirmar-panel" role="alertdialog" aria-labelledby="cm-t">
                <strong id="cm-t">¿Confirmar {nh(informe.totalHoras)} h de {nombreMes(mes)}?</strong>
                <p>Después no podrás editarlas y se avisa a administración. Si algo está mal, corrígelo antes.</p>
                <div className="action-buttons">
                  <button type="button" className="btn-approve" onClick={confirmarMes}><Icono n="check" size={18} /> Sí, confirmar</button>
                  <button type="button" className="btn-ghost" onClick={() => setConfirmando(false)}>Todavía no</button>
                </div>
              </div>
            ) : (
              <div className="action-buttons" style={{ marginTop: '1rem' }}>
                {!bloqueado && (
                  <button type="button" className="btn-approve" disabled={!informe.detalle.length} onClick={() => setConfirmando(true)}><Icono n="check" size={18} /> Confirmar horas del mes</button>
                )}
                <button type="button" className="btn-sm btn-accion" disabled={!informe.detalle.length} onClick={() => generarPDFClases(informe, config || {})}><Icono n="descargar" size={18} /> Descargar informe PDF</button>
              </div>
            )}
            {bloqueado && <p className="form-hint">Para corregir algo, pídele a administración que reabra el mes.</p>}
          </>
        )}
      </div>
    </div>
  );
}
