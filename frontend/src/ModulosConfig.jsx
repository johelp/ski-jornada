import { useState, useEffect, useCallback } from 'react';

// Administración enciende o apaga módulos. Un módulo apagado desaparece del menú y deja de responder; no se borra ningún dato.
const DESC = {
  clases: 'Carga de clases con disciplinas y primas, revisión de horas y economía.',
  libres: 'Solicitudes de días libres y su aprobación.',
  documentos: 'Nóminas, contratos y certificados por profesor, con firma.',
  comparativa: 'Cotejo de las horas con el CSV del sistema de reservas.',
  integraciones: 'Claves de API, webhooks, planning y WhatsApp.',
  avisos: 'Avisos masivos al equipo (campana y correo).',
  colaboradores: 'Escuelas y autónomos con los que se intercambian horas, saldos y extractos.',
};

export default function ModulosConfig({ api, h, toast$, onCambio }) {
  const [mods, setMods] = useState(null);
  const cargar = useCallback(async () => {
    try { setMods((await api.get('/api/admin/modulos', { headers: h() })).data); }
    catch { setMods([]); }
  }, [api, h]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!mods) return null;

  const cambiar = async (clave, activo) => {
    const off = mods.filter(m => (m.clave === clave ? !activo : !m.activo) && !m.bloqueadoPorDespliegue).map(m => m.clave);
    try { await api.put('/api/admin/modulos', { off }, { headers: h() }); toast$(activo ? 'Módulo activado' : 'Módulo desactivado', 'success'); await cargar(); onCambio?.(); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo guardar', 'error'); }
  };
  return (
    <div className="card">
      <h2>Módulos</h2>
      <p className="form-hint">Apaga lo que tu escuela no use: desaparece del menú y del panel. Los datos no se borran y puedes volver a encenderlo cuando quieras. Fichaje, usuarios e informes de jornada son esenciales y no se apagan.</p>
      <div className="mod-lista">
        {mods.map(m => (
          <label key={m.clave} className={`mod-fila${m.activo ? '' : ' mod-off'}`}>
            <input type="checkbox" checked={m.activo} disabled={m.bloqueadoPorDespliegue} onChange={e => cambiar(m.clave, e.target.checked)} />
            <span><strong>{m.nombre}</strong><small>{DESC[m.clave]}{m.bloqueadoPorDespliegue ? ' · Desactivado en el despliegue (no se puede activar desde aquí).' : ''}</small></span>
          </label>
        ))}
      </div>
    </div>
  );
}
