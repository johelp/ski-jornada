import { useState, useEffect, useCallback } from 'react';
import GuiaNotificaciones from './GuiaNotificaciones';
import { esIOS, estaInstalada, soportaPush, suscripcionActual, activarPush, desactivarPush } from './push';

// Cuadro de «Mi perfil» para activar o desactivar las notificaciones en ESTE dispositivo, con la guía visual de cada móvil.
export default function NotificacionesPush({ api, h, config, toast$, onCambio }) {
  const [estado, setEstado] = useState('cargando');
  const [ocupado, setOcupado] = useState(false);
  const [dispositivos, setDispositivos] = useState([]);
  const [verGuia, setVerGuia] = useState(false);

  const evaluar = useCallback(async () => {
    if (!config) return setEstado('cargando');
    if (esIOS() && !estaInstalada()) return setEstado('ios-instalar'); // en iPhone solo existe push en la app instalada
    if (!soportaPush()) return setEstado('nosoportado');
    if (!config.pushDisponible) return setEstado('servidor-off');
    if (Notification.permission === 'denied') return setEstado('bloqueado');
    const sub = await suscripcionActual();
    if (!sub && !(await navigator.serviceWorker.getRegistration())) return setEstado('sin-sw'); // desarrollo: el service worker no se registra
    const activo = !!sub && Notification.permission === 'granted';
    setEstado(activo ? 'activo' : 'inactivo');
    onCambio?.(activo);
  }, [config, onCambio]);
  useEffect(() => { evaluar(); }, [evaluar]);

  useEffect(() => {
    if (estado !== 'activo') return undefined;
    let vivo = true;
    api.get('/api/push/dispositivos', { headers: h() }).then(r => vivo && setDispositivos(r.data.dispositivos || [])).catch(() => {});
    return () => { vivo = false; };
  }, [estado, api, h]);

  const activar = async () => {
    setOcupado(true);
    try {
      const r = await activarPush({ api, headers: h(), publicKey: config.vapidPublicKey });
      if (r.ok) { toast$('Notificaciones activadas en este dispositivo ✓', 'success'); await evaluar(); }
      else if (r.permiso === 'denied') { setEstado('bloqueado'); toast$('Las notificaciones quedaron bloqueadas. Mira cómo permitirlas.', 'warning', 6000); }
      else if (r.motivo === 'sin-sw') toast$('La app aún no está lista. Recarga e inténtalo de nuevo.', 'warning', 5000);
      else toast$('No se activaron: cerraste el aviso sin permitir.', 'warning', 5000);
    } catch (e) { toast$(e.response?.data?.error || 'No se pudieron activar las notificaciones', 'error', 6000); }
    finally { setOcupado(false); }
  };
  const desactivar = async () => {
    setOcupado(true);
    try { await desactivarPush({ api, headers: h() }); toast$('Notificaciones desactivadas en este dispositivo', 'success'); await evaluar(); onCambio?.(false); }
    finally { setOcupado(false); }
  };
  const probar = async () => {
    setOcupado(true);
    try { const r = await api.post('/api/push/probar', null, { headers: h() }); toast$(r.data.enviadas ? 'Prueba enviada: debería llegarte en unos segundos' : 'No hay dispositivos activos', r.data.enviadas ? 'success' : 'warning', 5000); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo enviar la prueba', 'error', 5000); }
    finally { setOcupado(false); }
  };
  const quitar = async id => {
    try { await api.post('/api/push/baja', { id }, { headers: h() }); setDispositivos(d => d.filter(x => x.id !== id)); await evaluar(); } catch { toast$('No se pudo quitar el dispositivo', 'error'); }
  };

  const CHIP = {
    activo: ['✓ Activadas en este dispositivo', 'ok'], inactivo: ['Desactivadas', 'no'], bloqueado: ['✗ Bloqueadas', 'mal'],
    'ios-instalar': ['Instala la app primero', 'aviso'], nosoportado: ['No disponibles en este navegador', 'no'], 'servidor-off': ['No activadas por tu escuela', 'no'], 'sin-sw': ['Solo en la app publicada', 'no'],
  };
  const [chipTxt, chipCls] = CHIP[estado] || ['Comprobando…', 'no'];
  const guiaAbierta = verGuia || estado === 'ios-instalar' || estado === 'bloqueado';

  return (
    <div className="card notif-push">
      <div className="notif-cab">
        <h2>🔔 Notificaciones en este dispositivo</h2>
        <span className={`notif-chip ${chipCls}`}>{chipTxt}</span>
      </div>
      <p className="notif-txt">Recibe en el móvil, aunque no tengas la app abierta, los avisos de tu escuela: respuestas a tus solicitudes, revisión de horas, recordatorio de fichar la salida y fin de mes.</p>

      {estado === 'servidor-off' && <p className="notif-txt">Tu escuela todavía no ha activado las notificaciones en el servidor. Pídeselo a administración.</p>}
      {estado === 'nosoportado' && <p className="notif-txt">Este navegador no admite notificaciones push. Prueba con Chrome, Edge, Firefox o Safari actualizados.</p>}
      {estado === 'sin-sw' && <p className="notif-txt">Las notificaciones solo funcionan en la versión publicada de la app, no en modo desarrollo.</p>}
      {estado === 'ios-instalar' && <p className="notif-txt"><b>En iPhone hay que instalar la app primero.</b> Sigue estos pasos y vuelve aquí.</p>}
      {estado === 'bloqueado' && <p className="notif-txt"><b>Las bloqueaste en este dispositivo.</b> Hay que permitirlas desde los ajustes:</p>}

      {estado === 'inactivo' && <button type="button" className="btn-primary notif-btn" onClick={activar} disabled={ocupado}>{ocupado ? 'Activando…' : '🔔 Activar notificaciones'}</button>}
      {estado === 'activo' && (
        <>
          <div className="notif-acciones">
            <button type="button" className="btn-sm" onClick={probar} disabled={ocupado}>Enviarme una prueba</button>
            <button type="button" className="btn-ghost" onClick={desactivar} disabled={ocupado}>Desactivar en este dispositivo</button>
          </div>
          {dispositivos.length > 1 && (
            <div className="notif-disp"><small>Tus dispositivos con notificaciones:</small>
              <ul>{dispositivos.map(d => <li key={d.id}><span>{d.dispositivo || 'Dispositivo'} · {new Date(d.createdAt).toLocaleDateString('es-ES')}</span><button type="button" className="btn-ghost" onClick={() => quitar(d.id)}>Quitar</button></li>)}</ul>
            </div>
          )}
        </>
      )}

      {['inactivo', 'activo', 'bloqueado', 'ios-instalar'].includes(estado) && (
        <>
          {estado !== 'ios-instalar' && estado !== 'bloqueado' && <button type="button" className="btn-link notif-como" onClick={() => setVerGuia(v => !v)} aria-expanded={guiaAbierta}>{guiaAbierta ? 'Ocultar la guía' : '¿Cómo se activan? Ver guía paso a paso'}</button>}
          {guiaAbierta && <GuiaNotificaciones inicial={estado === 'ios-instalar' ? 'ios' : undefined} bloqueado={estado === 'bloqueado'} />}
        </>
      )}
    </div>
  );
}
