import { useState } from 'react';
import { leerResumenInstructores, mesDelNombreDeArchivo } from './comparativa';
import Icono from './Iconos';

const eur = n => (n == null ? '—' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const hh = n => `${String(Math.round(n * 100) / 100).replace('.', ',')} h`;
const signo = n => (n > 0 ? '+' : '') + String(Math.round(n * 100) / 100).replace('.', ',');
const mesActual = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };

const ESTADOS = {
  OK: { label: 'Coincide', clase: 'aprobado' },
  DIFERENCIA_HORAS: { label: 'Difieren las horas', clase: 'rechazado' },
  DIFERENCIA_IMPORTE: { label: 'Difiere el importe', clase: 'pendiente' },
  SIN_CARGA: { label: 'Sin horas cargadas', clase: 'rechazado' },
  SIN_COINCIDENCIA: { label: 'Sin vincular', clase: 'pendiente' },
};
const FILTROS = [
  ['todos', 'Todos'], ['dif', 'Con diferencias'], ['OK', 'Coinciden'], ['SIN_COINCIDENCIA', 'Sin vincular'], ['SIN_CARGA', 'Sin carga'],
];

// Compara el resumen mensual por instructor del sistema de reservas con las horas cargadas en la plataforma
export default function VistaComparativa({ api, h, toast$ }) {
  const [mes, setMes] = useState(mesActual());
  const [archivo, setArchivo] = useState(null); // { nombre, filas }
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState('dif');
  const [abierto, setAbierto] = useState(null);
  const [vinculos, setVinculos] = useState({});

  const comparar = async (filas = archivo?.filas, mesUsado = mes) => {
    setCargando(true);
    try { setDatos((await api.post('/api/admin/comparativa', { mes: mesUsado, filas }, { headers: h() })).data); }
    catch (e) { toast$(e.response?.data?.error || 'Error al comparar', 'error'); }
    finally { setCargando(false); }
  };

  const elegirArchivo = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const filas = leerResumenInstructores(await f.text());
      const m = mesDelNombreDeArchivo(f.name);
      setArchivo({ nombre: f.name, filas }); setDatos(null);
      if (m) setMes(m);
      await comparar(filas, m || mes);
    } catch (err) { toast$(err.message || 'No se pudo leer el archivo', 'error', 6000); }
    e.target.value = '';
  };

  const vincular = async (nombre) => {
    const profesorId = vinculos[nombre];
    if (!profesorId) { toast$('Elige un profesor', 'warning'); return; }
    try {
      await api.post('/api/admin/comparativa/alias', { nombreExterno: nombre, profesorId }, { headers: h() });
      toast$('Vinculado ✓ (se recordará)', 'success'); comparar();
    } catch (e) { toast$(e.response?.data?.error || 'Error', 'error'); }
  };

  const exportar = () => {
    const filas = [['Instructor (reservas)', 'Profesor (plataforma)', 'Estado', 'Horas reservas', 'Horas plataforma', 'Dif. horas', 'Total € reservas', 'Total € plataforma', 'Dif. €', 'Salario reservas', 'Tarifa plataforma']];
    datos.resultado.forEach(r => filas.push([r.nombre, r.profesor?.nombre || '', ESTADOS[r.estado].label, r.externo.totalHoras, r.plataforma?.totalHoras ?? '', r.diferencia?.horas ?? '', r.externo.total, r.plataforma?.importeTotal ?? '', r.diferencia?.importe ?? '', r.externo.salario, r.plataforma?.tarifaHora ?? '']));
    const csv = '﻿' + filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""').replace('.', ',')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `comparativa_${datos.mes}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const visibles = datos?.resultado.filter(r => filtro === 'todos' ? true : filtro === 'dif' ? r.estado !== 'OK' : r.estado === filtro) || [];
  const rs = datos?.resumen;

  return (
    <div>
      <div className="card">
        <h2>Comparar con el sistema de reservas</h2>
        <p className="form-hint">Carga el <strong>resumen mensual por instructor</strong> (CSV) del sistema de reservas. Se compara con las horas y los importes cargados por los profesores en la plataforma. El archivo se procesa en el navegador y solo se envían los totales.</p>
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="form-group"><label htmlFor="cmp-mes">Mes a comparar</label>
            <input id="cmp-mes" type="month" value={mes} onChange={e => setMes(e.target.value)} /></div>
          <div className="form-group"><label>Archivo</label>
            <label className="btn-primary" style={{ cursor: 'pointer', display: 'flex', width: '100%' }}>
              <Icono n="mas1" size={20} /> {archivo ? 'Cambiar archivo' : 'Elegir CSV'}
              <input type="file" accept=".csv,text/csv,text/plain" onChange={elegirArchivo} style={{ display: 'none' }} />
            </label></div>
        </div>
        {archivo && (
          <p className="form-hint">{archivo.nombre} · {archivo.filas.length} filas{' '}
            <button className="btn-sm" disabled={cargando} onClick={() => comparar()}>{cargando ? 'Comparando…' : 'Volver a comparar'}</button></p>
        )}
      </div>

      {datos && (
        <>
          <div className="stats-grid stats-2x2">
            <div className="stat-card stat-green"><div><p className="stat-label">Coinciden</p><p className="stat-number">{rs.ok}</p></div></div>
            <div className="stat-card stat-amber"><div><p className="stat-label">Con diferencias</p><p className="stat-number">{rs.diferenciaHoras + rs.diferenciaImporte + rs.sinCarga}</p></div></div>
            <div className="stat-card stat-blue"><div><p className="stat-label">Sin vincular</p><p className="stat-number">{rs.sinCoincidencia}</p></div></div>
            <div className="stat-card stat-blue"><div><p className="stat-label">Horas (reservas / plataforma)</p><p className="stat-number">{rs.horasExterno} / {rs.horasPlataforma}</p></div></div>
          </div>

          {datos.sinAsignar && datos.sinAsignar.totalHoras > 0 && (
            <div className="revision revision-pendiente" role="status">
              <strong>{hh(datos.sinAsignar.totalHoras)} sin instructor asignado en el sistema de reservas</strong>
              <p>Son reservas sin profesor; ningún profesor puede haberlas cargado. Conviene asignarlas allí.</p>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h2>Detalle por instructor</h2>
              <button className="btn-sm" onClick={exportar}><Icono n="descargar" size={18} /> CSV</button>
            </div>
            <div className="informe-tabs" role="tablist" aria-label="Filtro">
              {FILTROS.map(([id, label]) => (
                <button key={id} role="tab" aria-selected={filtro === id} className={`btn-tab${filtro === id ? ' active' : ''}`} onClick={() => setFiltro(id)}>{label}</button>
              ))}
            </div>
            {!visibles.length ? <div className="empty-state"><p>Nada que mostrar con este filtro</p></div> : (
              <div className="cmp-lista">
                {visibles.map(r => {
                  const e = ESTADOS[r.estado]; const key = r.nombre;
                  return (
                    <div key={key} className={`cmp-item cmp-${r.estado.toLowerCase()}`}>
                      <button className="cmp-cab" onClick={() => setAbierto(abierto === key ? null : key)} aria-expanded={abierto === key}>
                        <span className="cmp-nombre"><strong>{r.nombre}</strong>{r.profesor && <small>{r.profesor.nombre}{r.via === 'alias' ? ' · vinculado' : ''}</small>}</span>
                        <span className={`estado-badge ${e.clase}`}>{e.label}</span>
                      </button>
                      <div className="cmp-cifras">
                        <div><small>Horas</small><span>{hh(r.externo.totalHoras)} <em>reservas</em></span>{r.plataforma && <span>{hh(r.plataforma.totalHoras)} <em>plataforma</em></span>}{r.diferencia && <strong className={r.diferencia.horas ? 'dif' : ''}>{signo(r.diferencia.horas)} h</strong>}</div>
                        <div><small>Importe</small><span>{eur(r.externo.total)} <em>reservas</em></span>{r.plataforma && <span>{eur(r.plataforma.importeTotal)} <em>plataforma</em></span>}{r.diferencia?.importe != null && <strong className={Math.abs(r.diferencia.importe) > 1 ? 'dif' : ''}>{signo(r.diferencia.importe)} €</strong>}</div>
                      </div>
                      {r.estado === 'SIN_COINCIDENCIA' && (
                        <div className="cmp-vincular">
                          <label htmlFor={`v-${key}`} className="form-hint">¿Quién es en la plataforma?</label>
                          <div className="mes-selector">
                            <select id={`v-${key}`} value={vinculos[key] || ''} onChange={ev => setVinculos({ ...vinculos, [key]: ev.target.value })}>
                              <option value="">Elegir profesor…</option>
                              {datos.profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                            <button className="btn-primary" onClick={() => vincular(key)}>Vincular</button>
                          </div>
                        </div>
                      )}
                      {abierto === key && r.plataforma && (
                        <div className="cmp-detalle">
                          <div className="desglose">
                            <div><span>Clases cargadas</span><span>{r.plataforma.clases}</span></div>
                            <div><span>Tarifa por hora</span><span>{eur(r.externo.salario)} reservas · {eur(r.plataforma.tarifaHora)} plataforma {r.diferencia.tarifa ? <b className="dif">({signo(r.diferencia.tarifa)} €)</b> : null}</span></div>
                            <div><span>Estado en la plataforma</span><span>{r.plataforma.confirmado ? 'Confirmado' : 'Sin confirmar'}{r.plataforma.revision ? ` · ${r.plataforma.revision.toLowerCase()}` : ''}</span></div>
                            <div><span>Horas privadas / grupales / cursillos</span><span>{hh(r.externo.horasPrivadas)} / {hh(r.externo.horasGrupales)} / {hh(r.externo.horasCursillos)}</span></div>
                            {r.primas.map(p => (
                              <div key={p.nombre}><span>Prima {p.nombre}</span><span>{eur(p.externo)} reservas · {p.plataforma == null ? 'no configurada' : eur(p.plataforma)} plataforma</span></div>
                            ))}
                            {r.externo.totalRequeridas > 0 && <div><span>Horas requeridas</span><span>{hh(r.externo.horasRequeridas)} · {eur(r.externo.totalRequeridas)} <em>(solo en reservas)</em></span></div>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {datos.soloPlataforma.length > 0 && (
            <div className="card">
              <h2>Solo en la plataforma</h2>
              <p className="form-hint">Profesores con horas cargadas que no aparecen en el resumen de reservas.</p>
              <div className="resumen-list">
                {datos.soloPlataforma.map(p => (
                  <div key={p.profesor.id} className="resumen-item"><span className="resumen-fecha">{p.profesor.nombre}</span>
                    <div className="resumen-right"><span className="resumen-horas">{hh(p.totalHoras)}</span></div></div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
