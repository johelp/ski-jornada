import { useState, useEffect, useCallback } from 'react';
import { generarPDFClases } from './pdfClases';

const eur = n => (n == null ? '—' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const fechaCorta = f => { const [, m, d] = f.split('-'); return `${d}/${m}`; };
const mesActual = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };

// Vista del administrador: resumen mensual por profesor (para cotejar con el planning) y
// configuración de disciplinas y primas (con sus importes).
export default function VistaAdminClases({ api, h, toast$, config }) {
  const [tab, setTab] = useState('resumen');
  const [mes, setMes] = useState(mesActual());
  const [resumen, setResumen] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [primas, setPrimas] = useState([]);
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [nuevaPrima, setNuevaPrima] = useState({ nombre: '', importe: '', modo: 'POR_HORA' });

  const err = e => toast$(e.response?.data?.error || 'Error', 'error');

  const cargarResumen = useCallback(async () => {
    try { setResumen((await api.get(`/api/admin/clases/resumen/${mes}`, { headers: h() })).data); } catch (e) { err(e); }
  }, [mes]);
  const cargarCatalogo = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([api.get('/api/admin/tipos-clase', { headers: h() }), api.get('/api/admin/primas', { headers: h() })]);
      setTipos(t.data); setPrimas(p.data);
    } catch (e) { err(e); }
  }, []);

  useEffect(() => { setDetalle(null); cargarResumen(); }, [cargarResumen]);
  useEffect(() => { cargarCatalogo(); }, [cargarCatalogo]);

  const verDetalle = async id => {
    try { setDetalle((await api.get(`/api/clases/informe/${mes}?profesorId=${id}`, { headers: h() })).data); } catch (e) { err(e); }
  };
  const reabrir = async () => {
    if (!window.confirm('¿Reabrir el mes para que el profesor pueda corregir?')) return;
    try {
      await api.post('/api/admin/clases/reabrir', { profesorId: detalle.profesor.id, mes }, { headers: h() });
      toast$('Mes reabierto', 'success'); verDetalle(detalle.profesor.id); cargarResumen();
    } catch (e) { err(e); }
  };

  const crearTipo = async () => {
    if (!nuevoTipo.trim()) return;
    try { await api.post('/api/admin/tipos-clase', { nombre: nuevoTipo }, { headers: h() }); setNuevoTipo(''); cargarCatalogo(); } catch (e) { err(e); }
  };
  const actualizar = async (ruta, id, body) => {
    try { await api.put(`/api/admin/${ruta}/${id}`, body, { headers: h() }); cargarCatalogo(); } catch (e) { err(e); }
  };
  const crearPrima = async () => {
    if (!nuevaPrima.nombre.trim()) return;
    try {
      await api.post('/api/admin/primas', nuevaPrima, { headers: h() });
      setNuevaPrima({ nombre: '', importe: '', modo: 'POR_HORA' }); cargarCatalogo();
    } catch (e) { err(e); }
  };

  const exportarCSV = () => {
    const filas = [['Profesor', 'Horas', 'Clases', 'Días', 'Importe', 'Estado'],
      ...resumen.map(r => [`${r.apellidos}, ${r.nombre}`, r.totalHoras, r.cantidadClases, r.diasConClases, r.importeTotal ?? '', r.confirmado ? 'Confirmado' : 'Sin confirmar'])];
    const csv = '﻿' + filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `clases_${mes}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="informe-tabs">
        <button className={`btn-tab${tab === 'resumen' ? ' active' : ''}`} onClick={() => setTab('resumen')}>📋 Horas por profesor</button>
        <button className={`btn-tab${tab === 'config' ? ' active' : ''}`} onClick={() => setTab('config')}>⚙️ Disciplinas y primas</button>
      </div>

      {tab === 'resumen' && (
        <div className="card">
          <div className="card-header">
            <h2>Clases impartidas</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} />
              <button className="btn-sm" onClick={exportarCSV}>⬇ CSV</button>
            </div>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-clases">
              <thead><tr><th>Profesor</th><th>Horas</th><th>Clases</th><th>Importe</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {resumen.map(r => (
                  <tr key={r.id}>
                    <td>{r.apellidos}, {r.nombre}</td>
                    <td>{r.totalHoras}</td><td>{r.cantidadClases}</td>
                    <td>{eur(r.importeTotal)}</td>
                    <td><span className={`estado-badge ${r.confirmado ? 'aprobado' : 'pendiente'}`}>{r.confirmado ? 'Confirmado' : 'Sin confirmar'}</span></td>
                    <td><button className="btn-sm" onClick={() => verDetalle(r.id)}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detalle && (
            <div className="detalle-prof">
              <div className="card-header">
                <h3>{detalle.profesor.nombre} {detalle.profesor.apellidos} — {detalle.totalHoras} h {detalle.importeTotal != null && `· ${eur(detalle.importeTotal)}`}</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-sm" onClick={() => generarPDFClases(detalle, config || {})}>⬇ PDF</button>
                  {detalle.confirmado && <button className="btn-sm" onClick={reabrir}>↩ Reabrir mes</button>}
                </div>
              </div>
              {!detalle.detalle.length ? <p>Sin clases cargadas.</p> : (
                <div className="clases-lista">
                  {detalle.detalle.map(c => (
                    <div key={c.id} className="clase-item">
                      <div className="clase-fecha">{fechaCorta(c.fecha)}</div>
                      <div className="clase-info">
                        <strong>{c.tipoNombre}</strong> · {c.horas} h
                        {c.primas.length > 0 && <div className="clase-primas">{c.primas.map(p => <span key={p.id} className="chip chip-sm">{p.nombre}</span>)}</div>}
                        {c.notas && <small>{c.notas}</small>}
                      </div>
                      <div className="clase-importe">{eur(c.importe)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'config' && (
        <>
          <div className="card">
            <h2>Disciplinas</h2>
            <div className="catalogo-lista">
              {tipos.map(t => (
                <div key={t.id} className={`catalogo-item${t.activo ? '' : ' inactivo'}`}>
                  <input defaultValue={t.nombre} onBlur={e => e.target.value.trim() !== t.nombre && actualizar('tipos-clase', t.id, { nombre: e.target.value })} />
                  <label><input type="checkbox" checked={t.activo} onChange={e => actualizar('tipos-clase', t.id, { activo: e.target.checked })} /> Activa</label>
                </div>
              ))}
            </div>
            <div className="form-row">
              <div className="form-group"><input placeholder="Nueva disciplina (ej. Snowboard)" value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)} /></div>
              <button className="btn-primary" onClick={crearTipo}>+ Agregar</button>
            </div>
          </div>

          <div className="card">
            <h2>Primas</h2>
            <p className="form-hint">El importe se suma a la tarifa por hora del profesor. “Por hora” multiplica por las horas de la clase; “Por clase” es un monto fijo.</p>
            <div className="catalogo-lista">
              {primas.map(p => (
                <div key={p.id} className={`catalogo-item${p.activa ? '' : ' inactivo'}`}>
                  <input defaultValue={p.nombre} onBlur={e => e.target.value.trim() !== p.nombre && actualizar('primas', p.id, { nombre: e.target.value })} />
                  <input type="number" min="0" step="0.5" style={{ maxWidth: '6rem' }} placeholder="€" defaultValue={p.importe ?? ''}
                    onBlur={e => String(p.importe ?? '') !== e.target.value && actualizar('primas', p.id, { importe: e.target.value })} />
                  <select value={p.modo} onChange={e => actualizar('primas', p.id, { modo: e.target.value })}>
                    <option value="POR_HORA">€ por hora</option><option value="POR_CLASE">€ por clase</option>
                  </select>
                  <label><input type="checkbox" checked={p.activa} onChange={e => actualizar('primas', p.id, { activa: e.target.checked })} /> Activa</label>
                </div>
              ))}
            </div>
            <div className="catalogo-item">
              <input placeholder="Nueva prima (ej. Idioma)" value={nuevaPrima.nombre} onChange={e => setNuevaPrima({ ...nuevaPrima, nombre: e.target.value })} />
              <input type="number" min="0" step="0.5" style={{ maxWidth: '6rem' }} placeholder="€" value={nuevaPrima.importe} onChange={e => setNuevaPrima({ ...nuevaPrima, importe: e.target.value })} />
              <select value={nuevaPrima.modo} onChange={e => setNuevaPrima({ ...nuevaPrima, modo: e.target.value })}>
                <option value="POR_HORA">€ por hora</option><option value="POR_CLASE">€ por clase</option>
              </select>
              <button className="btn-primary" onClick={crearPrima}>+ Agregar</button>
            </div>
            <p className="form-hint">La tarifa base por hora se configura en cada profesor, en Usuarios → Editar.</p>
          </div>
        </>
      )}
    </div>
  );
}
