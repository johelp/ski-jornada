// Panel de administración: lo que requiere atención, siempre a la vista.
const fecha = d => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
const rango = s => (fecha(s.fechaInicio) === fecha(s.fechaFin) ? fecha(s.fechaInicio) : `${fecha(s.fechaInicio)} → ${fecha(s.fechaFin)}`);
const mesLargo = m => { const [a, n] = m.split('-'); return new Date(a, n - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); };
const motivo = m => (m || '').replace(/_/g, ' ').toLowerCase();

function Tarjeta({ titulo, cuenta, tono, vacio, onVer, verTexto = 'Ver todo →', children }) {
  return (
    <div className={`card dash-card ${cuenta > 0 ? `dash-${tono}` : ''}`}>
      <div className="card-header">
        <h2>{titulo}{cuenta > 0 && <span className={`dash-cuenta dash-cuenta-${tono}`}>{cuenta}</span>}</h2>
        {onVer && <button className="btn-sm" onClick={onVer}>{verTexto}</button>}
      </div>
      {cuenta > 0 ? children : <p className="dash-vacio">✓ {vacio}</p>}
    </div>
  );
}

export default function DashboardAdmin({ resumen, cargando, irA, aprobar, recargar, modulos }) {
  if (!resumen) return <div className="card"><div className="empty-state"><p>Cargando panel…</p></div></div>;
  const { solicitudes: sol, clases, documentos, equipo, incidenciasSemana } = resumen;
  const on = k => modulos?.[k] !== false; // módulos apagados por administración no aparecen
  const col = on('colaboradores') ? resumen.colaboradores : null;
  const urgentes = (on('libres') ? sol.pendientes : 0) + (on('clases') ? clases.sinRevisar + clases.conProblema : 0) + (on('documentos') ? documentos.pendientesFirma : 0) + (col ? col.enRevision : 0);

  return (
    <div className="dash-admin">
      <div className={`dash-resumen ${urgentes ? 'dash-resumen-aviso' : 'dash-resumen-ok'}`}>
        <div>
          <strong>{urgentes ? `${urgentes} cosa${urgentes > 1 ? 's' : ''} por atender` : 'Todo al día'}</strong>
          <small>{mesLargo(resumen.mesActual)} · {equipo.dentroAhora} dentro ahora · {equipo.activos} en el equipo</small>
        </div>
        <button className="btn-sm" onClick={recargar} aria-label="Actualizar">↻ Actualizar</button>
      </div>

      {on('libres') && <>
      <div className="dash-estados" role="group" aria-label="Estado de las solicitudes de días libres">
        <button className="dash-estado dash-estado-pend" onClick={() => irA('gestionar')}><b>{sol.pendientes}</b><span>Pendientes</span></button>
        <button className="dash-estado dash-estado-ok" onClick={() => irA('gestionar')}><b>{sol.aprobadas}</b><span>Aprobadas</span></button>
        <button className="dash-estado dash-estado-no" onClick={() => irA('gestionar')}><b>{sol.rechazadas}</b><span>Rechazadas</span></button>
        <button className="dash-estado" onClick={() => irA('gestionar')}><b>{sol.ausentesHoy}</b><span>Ausentes hoy</span></button>
      </div>
      <p className="dash-nota">Solicitudes de los últimos 60 días.</p>
      </>}

      {on('libres') && <Tarjeta titulo="Solicitudes por responder" cuenta={sol.pendientes} tono="amber" vacio="No hay solicitudes pendientes" onVer={() => irA('gestionar')}>
        <ul className="dash-lista">
          {sol.listaPendientes.map(s => (
            <li key={s.id}>
              <div><strong>{s.profesor}</strong><small>{rango(s)} · {motivo(s.motivo)}</small></div>
              <button className="btn-approve" disabled={cargando} onClick={() => aprobar(s.id)}>✓ Aprobar</button>
            </li>
          ))}
        </ul>
        {sol.pendientes > sol.listaPendientes.length && <p className="dash-nota">y {sol.pendientes - sol.listaPendientes.length} más…</p>}
      </Tarjeta>}

      {on('clases') && <Tarjeta titulo="Horas por revisar" cuenta={clases.sinRevisar} tono="blue" vacio="No hay meses confirmados sin revisar" onVer={() => irA('clases')}>
        <ul className="dash-lista">
          {clases.listaSinRevisar.map(c => (
            <li key={`${c.profesorId}${c.mes}`}><div><strong>{c.profesor}</strong><small>{mesLargo(c.mes)} · confirmó el {fecha(c.confirmadoAt)}</small></div>
              <button className="btn-sm" onClick={() => irA('clases')}>Revisar</button></li>
          ))}
        </ul>
      </Tarjeta>}

      {on('clases') && clases.conProblema > 0 && (
        <Tarjeta titulo="Discrepancias y correcciones abiertas" cuenta={clases.conProblema} tono="red" vacio="" onVer={() => irA('clases')}>
          <ul className="dash-lista">
            {clases.listaConProblema.map(c => (
              <li key={`${c.profesorId}${c.mes}`}><div><strong>{c.profesor}</strong><small>{mesLargo(c.mes)}</small></div>
                <span className={`estado-badge ${c.estado === 'CORRECCION' ? 'pendiente' : 'rechazado'}`}>{c.estado === 'CORRECCION' ? 'Corrección pedida' : 'Discrepancia'}</span></li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {on('documentos') && documentos.pendientesFirma > 0 && (
        <Tarjeta titulo="Documentos sin firmar" cuenta={documentos.pendientesFirma} tono="red" vacio="" onVer={() => irA('documentos')}>
          <ul className="dash-lista">
            {documentos.lista.map(d => (
              <li key={d.id}><div><strong>{d.profesor}</strong><small>{d.nombre}{d.mes ? ` · ${d.mes}` : ''}</small></div></li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {col && col.total > 0 && (
        <Tarjeta titulo="Colaboradores: horas por aclarar" cuenta={col.enRevision + col.pendientes} tono={col.enRevision ? 'red' : 'amber'} vacio="Nada en revisión" onVer={() => irA('colaboradores')}>
          <ul className="dash-lista">
            {col.listaRevision.map(c => <li key={c.id}><div><strong>{c.nombre}</strong><small>{c.enRevision} movimiento{c.enRevision > 1 ? 's' : ''} en revisión</small></div></li>)}
            <li><div><strong>{col.pendientes} horas pendientes de aceptar</strong>
              <small>Nos deben {col.aFavorEuros.toLocaleString('es-ES')} € · les debemos {col.enContraEuros.toLocaleString('es-ES')} €</small></div>
              <button className="btn-sm" onClick={() => irA('colaboradores')}>Ver cuentas</button></li>
          </ul>
        </Tarjeta>
      )}

      {on('libres') && <Tarjeta titulo="Próximas ausencias" cuenta={sol.proximas.length} tono="green" vacio="Sin ausencias aprobadas próximas" onVer={() => irA('gestionar')}>
        <ul className="dash-lista">
          {sol.proximas.map(s => <li key={s.id}><div><strong>{s.profesor}</strong><small>{rango(s)} · {motivo(s.motivo)}</small></div></li>)}
        </ul>
      </Tarjeta>}

      {(equipo.invitadosSinEntrar.length > 0 || incidenciasSemana > 0) && (
        <div className="card dash-card">
          <div className="card-header"><h2>Seguimiento</h2></div>
          <ul className="dash-lista">
            {equipo.invitadosSinEntrar.length > 0 && (
              <li><div><strong>{equipo.invitadosSinEntrar.length} invitado{equipo.invitadosSinEntrar.length > 1 ? 's' : ''} sin entrar</strong>
                <small>{equipo.invitadosSinEntrar.slice(0, 3).map(p => p.nombre).join(', ')}{equipo.invitadosSinEntrar.length > 3 ? '…' : ''}</small></div>
                <button className="btn-sm" onClick={() => irA('usuarios')}>Gestionar</button></li>
            )}
            {incidenciasSemana > 0 && (
              <li><div><strong>{incidenciasSemana} fichaje{incidenciasSemana > 1 ? 's' : ''} con incidencia</strong><small>Últimos 7 días</small></div>
                <button className="btn-sm" onClick={() => irA('informes')}>Ver informes</button></li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
