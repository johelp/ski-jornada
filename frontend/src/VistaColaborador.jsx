import { useState, useEffect, useCallback } from 'react';
import { generarPDFColaborador, agruparPorDia, conSigno } from './pdfColaborador';

// Portal del colaborador (opcional): ve su cuenta de horas con la escuela, acepta o pide revisar, e imprime su extracto.
const num = n => (n ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const eur = n => `${(n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fechaLarga = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const ESTADO = { PENDIENTE: ['Por revisar', 'col-est-pend'], ACEPTADA: ['Aceptada', 'col-est-ok'], EN_REVISION: ['En revisión', 'col-est-rev'] };

export default function VistaColaborador({ api, h, toast$ }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [rev, setRev] = useState(null); // { id, nota }
  const cargar = useCallback(async () => {
    try { setD((await api.get('/api/colaborador/mi', { headers: h() })).data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'No se pudo cargar tu cuenta'); }
  }, [api, h]);
  useEffect(() => { cargar(); }, [cargar]);

  const responder = async (id, accion, nota) => {
    try { await api.post(`/api/colaborador/horas/${id}/responder`, { accion, nota }, { headers: h() }); toast$(accion === 'ACEPTAR' ? 'Horas aceptadas' : 'Revisión solicitada', 'success'); setRev(null); await cargar(); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo enviar', 'error', 5000); }
  };
  if (error) return <div className="card"><p>{error}</p></div>;
  if (!d) return <div className="card"><p>Cargando…</p></div>;
  const { saldo, movimientos, liquidaciones, escuela, colaborador } = d;
  const pend = movimientos.filter(m => m.estado === 'PENDIENTE').length;
  // El saldo está expresado desde la escuela (+ = nos debéis): aquí se lee desde el punto de vista del colaborador
  const fav = saldo.horas > 0.004, con = saldo.horas < -0.004;
  const dias = agruparPorDia(movimientos).reverse();

  const imprimir = () => generarPDFColaborador({
    colaborador: { nombre: colaborador.nombre, tipo: colaborador.tipo, tarifaHora: colaborador.tarifaHora }, saldo, movimientos: [...movimientos].reverse(), liquidaciones: [...liquidaciones].reverse(),
  }, { nombre: escuela.nombre, cif: escuela.cif });

  return (
    <div>
      <div className="card">
        <h2>Tu cuenta de horas con {escuela.nombre || 'la escuela'}</h2>
        <p className="form-hint">{colaborador.nombre} · valor hora del trato {eur(colaborador.tarifaHora)}</p>
        <div className={`col-saldo-grande ${fav ? 'col-saldo-con' : con ? 'col-saldo-fav' : 'col-saldo-cero'}`}>
          <strong>{fav ? `Debéis ${num(saldo.horas)} h a la escuela` : con ? `La escuela os debe ${num(-saldo.horas)} h` : 'Cuentas saldadas'}</strong>
          {(fav || con) && <span>{eur(Math.abs(saldo.euros))}</span>}
        </div>
        <div className="col-resumen">
          <div><b>{num(saldo.dadas)} h</b><span>que os dimos</span></div>
          <div><b>{num(saldo.recibidas)} h</b><span>que nos disteis</span></div>
          <div><b>{pend}</b><span>por revisar</span></div>
        </div>
        <button className="btn-download" onClick={imprimir}>⬇ Descargar mi extracto (PDF)</button>
      </div>

      <div className="card">
        <h2>Horas por día</h2>
        {!dias.length && <p className="dash-vacio">Todavía no hay horas en tu cuenta.</p>}
        {dias.map(dia => (
          <div key={dia.fecha} className="col-dia">
            <div className="col-dia-cab"><strong>{fechaLarga(dia.fecha)}</strong>{dia.items.length > 1 && <small>neto {conSigno(dia.horas)} h</small>}</div>
            {dia.items.map(m => (
              <div key={m.id} className="col-mov">
                <div>
                  <b>{m.sentido === 'DADAS' ? 'Os dimos' : 'Nos disteis'} {num(m.horas)} h</b> · {eur(m.horas * m.tarifaHora)}
                  {m.nota && <small className="col-nota"> · {m.nota}</small>}
                  <div><span className={`col-est ${ESTADO[m.estado][1]}`}>{ESTADO[m.estado][0]}</span>{m.notaColaborador && <small className="col-nota"> «{m.notaColaborador}»</small>}</div>
                </div>
                {m.estado !== 'ACEPTADA' && (rev?.id === m.id ? (
                  <form className="col-rev" onSubmit={e => { e.preventDefault(); responder(m.id, 'REVISAR', rev.nota); }}>
                    <input autoFocus required minLength={5} placeholder="¿Qué hay que revisar?" value={rev.nota} onChange={e => setRev({ id: m.id, nota: e.target.value })} />
                    <button className="btn-sm" type="submit">Enviar</button><button className="btn-ghost" type="button" onClick={() => setRev(null)}>Cancelar</button>
                  </form>
                ) : (
                  <div className="col-acciones">
                    <button className="btn-approve" onClick={() => responder(m.id, 'ACEPTAR')}>✓ Aceptar</button>
                    {m.estado !== 'EN_REVISION' && <button className="btn-ghost" onClick={() => setRev({ id: m.id, nota: '' })}>Pedir revisión</button>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {liquidaciones.length > 0 && (
        <div className="card">
          <h2>Liquidaciones</h2>
          {liquidaciones.map(l => (
            <div key={l.id} className="col-mov"><div><b>{l.tipo === 'PAGO' ? 'Pago' : 'Compensación'}</b> · {num(Math.abs(l.horas))} h · {eur(Math.abs(l.importe))}<small className="col-nota"> · {l.fecha}{l.nota ? ` · ${l.nota}` : ''}</small></div></div>
          ))}
        </div>
      )}
    </div>
  );
}
