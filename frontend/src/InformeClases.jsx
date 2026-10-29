import { useState, useEffect } from 'react';
import { generarPDFClases } from './pdfClases';
import { REVISION } from './VistaMisClases';
import Icono from './Iconos';

const eur = n => (n == null ? '—' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

// Informe mensual de clases y económico del profesor (resumen + descarga del PDF)
export default function InformeClases({ api, h, toast$, config, mes }) {
  const [informe, setInforme] = useState(null);

  useEffect(() => {
    setInforme(null);
    if (!mes) return;
    api.get(`/api/clases/informe/${mes}`, { headers: h() }).then(r => setInforme(r.data)).catch(() => toast$('No se pudo cargar el informe', 'error'));
  }, [mes]);

  if (!informe) return <div className="card"><p className="form-hint">Cargando…</p></div>;
  const eco = informe.importeTotal != null;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Clases y economía</h2>
        <span className={`estado-badge ${informe.confirmado ? 'aprobado' : 'pendiente'}`}>{informe.confirmado ? 'Confirmado' : 'Sin confirmar'}</span>
      </div>
      {informe.revision && (
        <div className={`revision revision-${REVISION[informe.revision.estado]?.clase}`} role="status">
          <strong>{REVISION[informe.revision.estado]?.label}</strong>
          {informe.revision.nota && <p>“{informe.revision.nota}”</p>}
        </div>
      )}
      <div className="stats-grid stats-2x2">
        <div className="stat-card stat-blue"><div><p className="stat-label">Horas de clase</p><p className="stat-number">{informe.totalHoras}h</p></div></div>
        <div className="stat-card stat-green"><div><p className="stat-label">Días con clases</p><p className="stat-number">{informe.diasConClases}</p></div></div>
        {eco && <div className="stat-card stat-amber"><div><p className="stat-label">Importe estimado</p><p className="stat-number">{eur(informe.importeTotal)}</p></div></div>}
        <div className="stat-card stat-blue"><div><p className="stat-label">Clases</p><p className="stat-number">{informe.detalle.length}</p></div></div>
      </div>
      {eco && (
        <div className="desglose">
          <div><span>Base {informe.tarifaHora != null ? `(${eur(informe.tarifaHora)}/h)` : ''}</span><span>{eur(informe.importeBase)}</span></div>
          {informe.desglosePrimas.filter(d => d.importe != null).map(d => (
            <div key={d.nombre}><span>Prima {d.nombre} ({d.clases} cl.)</span><span>{eur(d.importe)}</span></div>
          ))}
          <div className="desglose-total"><span>Total</span><span>{eur(informe.importeTotal)}</span></div>
        </div>
      )}
      {!informe.detalle.length && <div className="empty-state"><p>Sin clases cargadas este mes</p></div>}
      <button className="btn-primary" style={{ width: '100%', marginTop: 14 }} disabled={!informe.detalle.length}
        onClick={() => generarPDFClases(informe, config || {})}>
        <Icono n="descargar" size={20} /> Descargar informe PDF
      </button>
    </div>
  );
}
