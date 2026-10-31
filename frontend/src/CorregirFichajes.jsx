import { useState, useEffect, useCallback } from 'react';

// Corrección trazable de fichajes (administración). Nada se borra: queda el valor original, quién, cuándo y por qué.
const fmt = iso => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const aLocal = iso => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const ACCION = { CREAR: 'Alta manual', MODIFICAR: 'Modificado', ANULAR: 'Anulado' };

export default function CorregirFichajes({ api, headers, profesorId, mes, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const [regs, setRegs] = useState([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null); // { id?, tipo, fecha, motivo, anular? }

  const cargar = useCallback(async () => {
    try { setRegs((await api.get('/api/admin/fichajes', { headers: headers(), params: { profesorId, mes } })).data); }
    catch { setMsg('No se pudieron cargar los fichajes'); }
  }, [api, headers, profesorId, mes]);
  useEffect(() => { if (abierto) cargar(); }, [abierto, cargar]);

  const guardar = async e => {
    e.preventDefault(); setMsg('');
    try {
      const ts = form.fecha ? new Date(form.fecha).toISOString() : undefined;
      if (form.anular) await api.delete(`/api/admin/fichajes/${form.id}`, { headers: headers(), data: { motivo: form.motivo } });
      else if (form.id) await api.put(`/api/admin/fichajes/${form.id}`, { tipo: form.tipo, timestamp: ts, motivo: form.motivo }, { headers: headers() });
      else await api.post('/api/admin/fichajes', { profesorId, tipo: form.tipo, timestamp: ts, motivo: form.motivo }, { headers: headers() });
      setForm(null); await cargar(); onCambio?.();
    } catch (err) { setMsg(err.response?.data?.error || 'No se pudo guardar'); }
  };

  return (
    <div className="card">
      <button className="btn-tab" onClick={() => setAbierto(a => !a)}>{abierto ? '▾' : '▸'} Corregir fichajes de este mes</button>
      {abierto && (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Nada se borra: cada cambio guarda el valor original, quién lo hizo y el motivo, y la persona recibe un aviso.
          </p>
          {msg && <p style={{ color: 'var(--danger, #c0392b)', fontSize: '0.85rem' }}>{msg}</p>}
          {!form && <button className="btn-ghost" style={{ marginTop: '0.5rem' }} onClick={() => setForm({ tipo: 'ENTRADA', fecha: '', motivo: '' })}>+ Añadir fichaje olvidado</button>}
          {form && (
            <form onSubmit={guardar} style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
              <strong>{form.anular ? 'Anular fichaje' : form.id ? 'Modificar fichaje' : 'Añadir fichaje'}</strong>
              {!form.anular && <>
                <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                  <option value="ENTRADA">Entrada</option><option value="SALIDA">Salida</option>
                </select>
                <input type="datetime-local" required value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
              </>}
              <input type="text" required minLength={5} maxLength={500} placeholder="Motivo (obligatorio): p. ej. olvidó fichar la salida"
                value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} type="submit">{form.anular ? 'Anular' : 'Guardar'}</button>
                <button className="btn-ghost" type="button" onClick={() => setForm(null)}>Cancelar</button>
              </div>
            </form>
          )}
          <div className="tabla-scroll">
            <table className="planilla-table">
              <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Origen</th><th>Historial</th><th></th></tr></thead>
              <tbody>
                {regs.length === 0 && <tr><td colSpan="5">Sin fichajes este mes</td></tr>}
                {regs.map(r => (
                  <tr key={r.id} style={r.anulado ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}>
                    <td>{fmt(r.timestamp)}</td>
                    <td>{r.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}</td>
                    <td>{r.origen === 'ADMIN' ? 'Administración' : r.zonaNombre}</td>
                    <td style={{ fontSize: '0.78rem', textDecoration: 'none' }}>
                      {r.correcciones.map(c => (
                        <div key={c.id}>{ACCION[c.accion]}{c.anterior ? ` (antes ${fmt(JSON.parse(c.anterior).timestamp)})` : ''} · {c.actorEmail} · {fmt(c.createdAt)} · «{c.motivo}»</div>
                      ))}
                    </td>
                    <td>
                      {!r.anulado && <>
                        <button className="btn-ghost" onClick={() => setForm({ id: r.id, tipo: r.tipo, fecha: aLocal(r.timestamp), motivo: '' })}>Editar</button>{' '}
                        <button className="btn-ghost" onClick={() => setForm({ id: r.id, anular: true, motivo: '' })}>Anular</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
