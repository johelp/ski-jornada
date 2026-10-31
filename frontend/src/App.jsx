import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { generarPDFRegistro } from './pdfRegistro';
import VistaMisClases from './VistaMisClases';
import InformeClases from './InformeClases';
import VistaIntegraciones from './VistaIntegraciones';
import ImportarLista from './ImportarLista';
import InstalarBanner from './InstalarBanner';
import { filaCsv } from './csv';
import AceptacionLegal, { PoliticaPrivacidad } from './AceptacionLegal';
import VistaAdminClases from './VistaAdminClases';
import Landing from './Landing';
import './App.css';
import './theme.css';
import Icono, { LogoMarca } from './Iconos';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import DashboardAdmin from './DashboardAdmin';
import CorregirFichajes from './CorregirFichajes';
import { leerSesion, guardarSesion as guardarSesionAlmacen, borrarSesion, restaurarSesion } from './sesion';
const api = axios.create({ baseURL: API_BASE });

// ===== TOTP — usa offset del servidor para hora precisa =====
async function generarTOTP(secret, period = 30, serverOffset = 0) {
  const counter = Math.floor((Date.now() + serverOffset) / 1000 / period);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}:${counter}`));
  return Array.from(new Uint8Array(buf)).slice(0, 3).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function parsearQR(raw) {
  if (!raw.startsWith('SKIJORNADA|')) return null;
  const parts = raw.split('|');
  if (parts.length < 4) return null;
  return { zoneId: parts[1], secret: parts[2], mode: parts[3] };
}

function contenidoQR(zona) {
  return `SKIJORNADA|${zona.id}|${zona.secret}|${zona.validationMode}`;
}

function fechaLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTiempo(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

const nfcDisponible = 'NDEFReader' in window;

const ETIQUETA_AUDITORIA = {
  'usuario.crear': 'Alta de profesor', 'usuario.crear_admin': 'Alta de administración', 'usuario.baja': 'Baja', 'usuario.alta': 'Reactivación',
  'usuario.editar': 'Edición', 'usuario.rol': 'Cambio de rol', 'usuario.importacion': 'Importación de lista',
  'usuario.invitacion_reenviada': 'Invitación reenviada', 'usuario.invitaciones_masivas': 'Invitaciones a pendientes',
  'integracion.key_crear': 'Clave de API creada', 'integracion.webhook_crear': 'Webhook creado', 'clases.revision': 'Revisión de horas',
};

// Temporada = 12 meses desde el mes de inicio (por defecto noviembre; configurable con VITE_TEMPORADA_INICIO_MES)
const TEMPORADA_INICIO = Math.min(12, Math.max(1, parseInt(import.meta.env.VITE_TEMPORADA_INICIO_MES) || 11));
const pad2 = n => String(n).padStart(2, '0');
function rangoPeriodo(periodo, ahora = new Date()) {
  const y = ahora.getFullYear(), m = ahora.getMonth() + 1;
  if (periodo === 'mes') return { desde: `${y}-${pad2(m)}`, hasta: `${y}-${pad2(m)}`, etiqueta: ahora.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) };
  const y0 = m >= TEMPORADA_INICIO ? y : y - 1;
  const fin = TEMPORADA_INICIO === 1 ? { y: y0, m: 12 } : { y: y0 + 1, m: TEMPORADA_INICIO - 1 };
  return {
    desde: `${y0}-${pad2(TEMPORADA_INICIO)}`, hasta: `${fin.y}-${pad2(fin.m)}`,
    etiqueta: TEMPORADA_INICIO === 1 ? `Temporada ${y0}` : `Temporada ${y0}-${String(fin.y).slice(2)}`,
  };
}
const eurFmt = n => (n == null ? null : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

const TIPO_DOC_LABEL = { NOMINA: 'Nómina', CONTRATO: 'Contrato', CERTIFICADO: 'Certificado', OTRO: 'Otro' };
const TIPO_DOC_ICON  = { NOMINA: '💰', CONTRATO: '📋', CERTIFICADO: '🏅', OTRO: '📄' };

// ===== FIRMA CANVAS (simple, no tiene validez legal — paso previo a plataforma externa) =====
function FirmaCanvas({ onFirma, onCancelar }) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);

  const limpiar = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(2, 2, canvasRef.current.width - 4, canvasRef.current.height - 4);
    ctx.setLineDash([]);
  };

  useEffect(() => {
    limpiar();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#0f4c81';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const src = e.touches?.[0] || e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    };

    const start = (e) => { e.preventDefault(); dibujando.current = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); };
    const move  = (e) => { e.preventDefault(); if (!dibujando.current) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end   = ()  => { dibujando.current = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move,  { passive: false });
    canvas.addEventListener('touchend', end);
    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, []);

  const confirmar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Verificar que hay algo dibujado
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // Background is #f8fafc (R=248); stroke is #0f4c81 (R=15). Any dark pixel = firma present.
    let hasFirma = false;
    for (let i = 0; i < data.length; i += 4) { if (data[i] < 100) { hasFirma = true; break; } }
    if (!hasFirma) { alert('Por favor, dibuja tu firma antes de continuar.'); return; }
    onFirma(canvas.toDataURL('image/png'));
  };

  return (
    <div className="firma-canvas-container">
      <p className="firma-aviso">Firma con el ratón o con el dedo. <em>Nota: esta firma no tiene validez legal — es un paso intermedio hasta integrar firma electrónica certificada.</em></p>
      <canvas ref={canvasRef} width={400} height={150} className="firma-canvas" />
      <div className="action-buttons" style={{ marginTop: '0.5rem' }}>
        <button className="btn-approve" onClick={confirmar}>✓ Confirmar firma</button>
        <button className="btn-ghost" onClick={limpiar}>Limpiar</button>
        <button className="btn-ghost" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

// ===== VISTA PRESENCIA — profesores fichados ahora mismo =====
function VistaPresencia({ presencia, onRefresh, serverTimeOffsetRef }) {
  const [ahora, setAhora] = useState(new Date());

  // Reloj local para actualizar los contadores en tiempo real
  useEffect(() => {
    const iv = setInterval(() => setAhora(new Date(Date.now() + serverTimeOffsetRef.current)), 1000);
    return () => clearInterval(iv);
  }, []);

  // Auto-refresh cada 60 s para capturar entradas/salidas nuevas
  useEffect(() => {
    const iv = setInterval(onRefresh, 60_000);
    return () => clearInterval(iv);
  }, [onRefresh]);

  if (!presencia) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>Cargando presencia...</p>
        </div>
      </div>
    );
  }

  const { activos, total, actualizadoEn } = presencia;

  return (
    <div>
      {/* Cabecera */}
      <div className="presencia-header">
        <div>
          <h2 className="presencia-titulo">
            <span className="presencia-dot-grande" />
            Presencia actual
          </h2>
          <p className="presencia-subtitulo">
            {ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}
            Actualizado {new Date(actualizadoEn).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <div className="presencia-header-right">
          <div className="presencia-count-badge">
            <span className="presencia-dot-grande" />
            {total} {total === 1 ? 'dentro' : 'dentro'}
          </div>
          <button className="btn-sm" onClick={onRefresh}>↻ Actualizar</button>
        </div>
      </div>

      {/* Lista */}
      {!activos.length ? (
        <div className="card">
          <div className="empty-state">
            <p>○ Nadie fichado aún hoy</p>
            <small>Aquí aparecerán los empleados en cuanto registren entrada</small>
          </div>
        </div>
      ) : (
        <div className="presencia-grid">
          {activos.map(p => {
            const entradaMs  = new Date(p.entradaTimestamp).getTime();
            const elapsed    = ahora.getTime() - entradaMs;
            const elapsed_h  = Math.floor(elapsed / 3_600_000);
            const elapsed_m  = Math.floor((elapsed % 3_600_000) / 60_000);
            const elapsed_s  = Math.floor((elapsed % 60_000) / 1000);
            const tiempoStr  = `${elapsed_h}h ${String(elapsed_m).padStart(2, '0')}m ${String(elapsed_s).padStart(2, '0')}s`;
            const esExceso   = elapsed > (p.horasContrato / 5) * 3_600_000 * 1.1; // >10% sobre jornada diaria estimada

            return (
              <div key={p.profesorId} className={`presencia-card${esExceso ? ' presencia-exceso' : ''}`}>
                <div className="presencia-card-avatar">
                  {p.nombre[0]}{p.apellidos[0]}
                </div>
                <div className="presencia-card-info">
                  <strong>{p.nombre} {p.apellidos}</strong>
                  <span className="presencia-zona">📍 {p.zona}</span>
                  <span className="presencia-jornada">
                    {p.tipoJornada === 'COMPLETA' ? `Completa · ${p.horasContrato}h/sem` : 'Media jornada'}
                  </span>
                </div>
                <div className="presencia-card-derecha">
                  <div className="presencia-entrada">
                    <span className="presencia-entrada-label">Entrada</span>
                    <span className="presencia-entrada-hora">{p.entradaHora}</span>
                  </div>
                  <div className="presencia-timer">
                    <span className="timer-dot">●</span>
                    <span className="presencia-timer-valor">{tiempoStr}</span>
                  </div>
                  {esExceso && <span className="presencia-exceso-pill">⚠ Exceso</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function App() {
  const [token, setToken]   = useState(() => leerSesion().token);
  const [user,  setUser]    = useState(() => leerSesion().user);
  const [vista, setVista]   = useState('dashboard');
  const [modoEmpleado, setModoEmpleado] = useState(false);
  const [toast, setToast]   = useState(null);
  const [cargando, setCargando] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [masAbierto, setMasAbierto] = useState(false);
  const ultimaRenovacion = useRef(0);
  const [periodoDash, setPeriodoDash] = useState('mes');
  const [nuevoUsuarioAbierto, setNuevoUsuarioAbierto] = useState(false);
  const [busquedaUsuario, setBusquedaUsuario] = useState('');
  const [importarAbierto, setImportarAbierto] = useState(false);
  const [legalPendiente, setLegalPendiente] = useState(false);
  const [verPrivacidad, setVerPrivacidad] = useState(false);
  const [auditoria, setAuditoria] = useState(null);
  const [tabInformeEmp, setTabInformeEmp] = useState('jornada');
  const [clasesPeriodo, setClasesPeriodo] = useState(null);
  const [emailLogin, setEmailLogin] = useState('');
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);
  const magicProcesado = useRef(false);

  // Server time
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const serverTimeOffsetRef = useRef(0);
  const [horaActual, setHoraActual] = useState(new Date());

  // Live timer (ms elapsed since last ENTRADA)
  const [tiempoFichado, setTiempoFichado] = useState(null);

  // PWA install
  const [pwaInstallEvent, setPwaInstallEvent] = useState(null);

  // Profile editing (own)
  const [perfilEdit, setPerfilEdit] = useState(null);

  // Admin editing employee
  const [profesorEditId, setProfesorEditId] = useState(null);
  const [profesorEditData, setProfesorEditData] = useState({});

  // Fichaje
  const [qrCode, setQrCode]       = useState('');
  const [escaneando, setEscaneando] = useState(false);
  const [nfcActivo, setNfcActivo]  = useState(false);
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const scanIntervalRef = useRef(null);

  // Datos empleado
  const [historial, setHistorial]         = useState({});
  const [resumenDiario, setResumenDiario] = useState({});
  const [solicitudes, setSolicitudes]     = useState([]);
  const [misDocumentos, setMisDocumentos] = useState([]);
  const [firmaCanvasDocId, setFirmaCanvasDocId] = useState(null);

  // Datos admin
  const [adminSolicitudes, setAdminSolicitudes]     = useState([]);
  const [resumenAdmin, setResumenAdmin]               = useState(null);
  const [profesores, setProfesores]                 = useState([]);
  const [zonasAdmin, setZonasAdmin]                 = useState([]);
  const [informeMensual, setInformeMensual]         = useState(null);
  const [informeAusencias, setInformeAusencias]     = useState(null);
  const [planillaData, setPlanillaData]             = useState(null);
  const [informeTab, setInformeTab]                 = useState('registro');
  const [planillaOrden, setPlanillaOrden]           = useState('apellidos');
  const [planillaDir, setPlanillaDir]               = useState('asc');
  const [profesorInforme, setProfesorInforme]       = useState('');
  const [documentosAdmin, setDocumentosAdmin]       = useState([]);
  const [docFiltro, setDocFiltro]                   = useState('todos');
  const [pdfIncluirExtras, setPdfIncluirExtras]     = useState(false);
  const [presencia, setPresencia]                   = useState(null);
  const [notificaciones, setNotificaciones]         = useState([]);
  const [notifPanel, setNotifPanel]                 = useState(false);
  const [notifAdmin, setNotifAdmin]                 = useState([]);
  const [nuevaNotif, setNuevaNotif]                 = useState({ titulo: '', mensaje: '', tipo: 'INFO', destinatarioId: '' });
  const [configEscuela, setConfigEscuela]           = useState(null);

  // Forms
  const [fechaInicio, setFechaInicio]         = useState('');
  const [fechaFin, setFechaFin]               = useState('');
  const [motivo, setMotivo]                   = useState('VACACIONES');
  const [comentario, setComentario]           = useState('');
  const [observacion, setObservacion]         = useState('');
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);
  const [mesInforme, setMesInforme] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: '', apellidos: '', email: '', tipoJornada: 'COMPLETA', horasContrato: 35, role: 'PROFESOR', telefono: '' });
  const [nuevaZona, setNuevaZona]       = useState({ nombre: '', descripcion: '', lat: '', lng: '', radio: 100, validationMode: 'TOTP_GPS' });
  const [qrGenerado, setQrGenerado]     = useState({});
  const [docNuevo, setDocNuevo]         = useState({ profesorId: '', tipo: 'NOMINA', nombre: '', mes: '', file: null });
  const docNuevoFileRef  = useRef(null);
  const firmaFileRefs    = useRef({});

  const h = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const toast$ = useCallback((msg, tipo = 'info', ms = 3500) => {
    setToast({ msg, tipo }); setTimeout(() => setToast(null), ms);
  }, []);
  const load = useCallback(async (fn) => { try { await fn(); } catch (e) { if (e.response?.status === 401) logout(); } }, []);

  // ===== SERVER TIME SYNC =====
  useEffect(() => {
    const sync = async () => {
      try {
        const t1 = Date.now();
        const r  = await api.get('/api/server-time');
        const offset = r.data.timestamp - t1 - (Date.now() - t1) / 2;
        setServerTimeOffset(offset);
        serverTimeOffsetRef.current = offset;
      } catch {}
    };
    sync();
    const iv = setInterval(sync, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { serverTimeOffsetRef.current = serverTimeOffset; }, [serverTimeOffset]);

  // ===== LIVE CLOCK =====
  useEffect(() => {
    const iv = setInterval(() => setHoraActual(new Date(Date.now() + serverTimeOffsetRef.current)), 1000);
    return () => clearInterval(iv);
  }, []);

  // ===== PWA INSTALL PROMPT =====
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setPwaInstallEvent(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ===== LIVE SHIFT TIMER =====
  useEffect(() => {
    const hoyStr = fechaLocal(new Date(Date.now() + serverTimeOffsetRef.current));
    const regs = historial[hoyStr] || [];
    const ultimo = regs[regs.length - 1];
    if (ultimo?.tipo === 'ENTRADA' && ultimo?.timestamp) {
      const t0 = new Date(ultimo.timestamp).getTime();
      const calc = () => setTiempoFichado(Date.now() + serverTimeOffsetRef.current - t0);
      calc();
      const iv = setInterval(calc, 1000);
      return () => clearInterval(iv);
    }
    setTiempoFichado(null);
  }, [historial, serverTimeOffset]);

  // ===== NOTIFICATIONS — request permission on login =====
  useEffect(() => {
    if (token && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [token]);

  // ===== SCHEDULE REMINDER NOTIFICATION =====
  useEffect(() => {
    if (!token || !user?.horaRecordatorio) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const [hh, mm] = user.horaRecordatorio.split(':').map(Number);
    const ahora  = new Date(Date.now() + serverTimeOffset);
    const target = new Date(ahora);
    target.setHours(hh, mm, 0, 0);
    const delay = target - ahora;
    if (delay <= 0) return;
    const tid = setTimeout(() => {
      const hoyStr = fechaLocal(new Date(Date.now() + serverTimeOffsetRef.current));
      const regs = historial[hoyStr] || [];
      if (regs[regs.length - 1]?.tipo === 'ENTRADA') {
        const entradaMs = new Date(regs[regs.length - 1].timestamp).getTime();
        const transcurrido = formatTiempo(Date.now() + serverTimeOffsetRef.current - entradaMs);
        new Notification('⛷️ Ski Jornada — Recordatorio', {
          body: `Son las ${user.horaRecordatorio}. Llevas ${transcurrido} trabajando. Recuerda fichar la salida.`,
          icon: '/favicon.svg',
          tag: 'recordatorio-salida',
        });
      }
    }, delay);
    return () => clearTimeout(tid);
  }, [token, user?.horaRecordatorio, serverTimeOffset, historial]);

  // ===== DATA LOADERS =====
  const cargarHistorial = useCallback(() => load(async () => {
    const r = await api.get('/api/fichaje/historial', { headers: h() });
    setHistorial(r.data.historial || {}); setResumenDiario(r.data.resumen || {});
  }), [token]);
  const cargarSolicitudes = useCallback(() => load(async () => {
    const r = await api.get('/api/libres/mis-solicitudes', { headers: h() });
    setSolicitudes(r.data);
  }), [token]);
  const cargarResumenAdmin = useCallback(() => load(async () => {
    const r = await api.get('/api/admin/resumen', { headers: h() });
    setResumenAdmin(r.data);
  }), [token]);
  const cargarAdminSolicitudes = useCallback(() => load(async () => {
    const r = await api.get('/api/admin/solicitudes', { headers: h() });
    setAdminSolicitudes(r.data);
  }), [token]);
  const cargarProfesores = useCallback(() => load(async () => {
    const r = await api.get('/api/admin/profesores', { headers: h() });
    setProfesores(r.data);
  }), [token]);
  const cargarZonasAdmin = useCallback(() => load(async () => {
    const r = await api.get('/api/admin/zonas', { headers: h() });
    setZonasAdmin(r.data);
  }), [token]);
  const cargarInforme = useCallback((pidOverride) => load(async () => {
    const [anio, mes] = mesInforme.split('-');
    const pid = pidOverride !== undefined ? pidOverride : profesorInforme;
    const params = pid ? `?profesorId=${pid}` : '';
    const r = await api.get(`/api/informe/${mes}/${anio}${params}`, { headers: h() });
    setInformeMensual(r.data);
  }), [token, mesInforme, profesorInforme]);
  const cargarInformeAusencias = useCallback(() => load(async () => {
    const r = await api.get('/api/admin/informe-libres', { headers: h() });
    setInformeAusencias(r.data);
  }), [token]);
  const cargarPlanilla = useCallback(() => load(async () => {
    const [anio, mes] = mesInforme.split('-');
    const r = await api.get(`/api/admin/planilla/${mes}/${anio}`, { headers: h() });
    setPlanillaData(r.data);
  }), [token, mesInforme]);
  const cargarDocumentosAdmin = useCallback(() => load(async () => {
    const r = await api.get('/api/admin/documentos', { headers: h() });
    setDocumentosAdmin(r.data);
  }), [token]);
  const cargarMisDocumentos = useCallback(() => load(async () => {
    const r = await api.get('/api/documentos/mis-documentos', { headers: h() });
    setMisDocumentos(r.data);
  }), [token]);
  const cargarPresencia = useCallback(() => load(async () => {
    const r = await api.get('/api/admin/fichajes-activos', { headers: h() });
    setPresencia(r.data);
  }), [token]);
  const cargarNotificaciones = useCallback(() => load(async () => {
    const r = await api.get('/api/notificaciones', { headers: h() });
    setNotificaciones(r.data);
  }), [token]);
  const cargarNotifAdmin = useCallback(() => load(async () => {
    const r = await api.get('/api/admin/notificaciones', { headers: h() });
    setNotifAdmin(r.data);
  }), [token]);
  const cargarConfig = useCallback(() => load(async () => {
    const r = await api.get('/api/config');
    setConfigEscuela(r.data);
  }), []);

  // Canje del enlace mágico (?magic=...) y renovación de la sesión al abrir la app
  useEffect(() => {
    const guardarSesion = (t, u) => {
      guardarSesionAlmacen(t, u);
      setToken(t); setUser(u);
    };
    const magic = new URLSearchParams(window.location.search).get('magic');
    if (magic) {
      if (magicProcesado.current) return;
      magicProcesado.current = true;
      window.history.replaceState({}, '', window.location.pathname);
      setCargando(true);
      api.post('/api/auth/magic-link/verificar', { token: magic })
        .then(r => guardarSesion(r.data.token, r.data.user))
        .catch(e => toast$(e.response?.data?.error || 'No se pudo iniciar sesión', 'error', 6000))
        .finally(() => setCargando(false));
      return;
    }
    const renovar = (t) => api.post('/api/auth/renovar', null, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => guardarSesion(r.data.token, r.data.user))
      .catch(e => { if (e.response?.status === 401) logout(); }); // sin red u otro error: se conserva la sesión
    if (token) renovar(token);
    else restaurarSesion().then(r => { if (r.token) { setToken(r.token); setUser(r.user); renovar(r.token); } });
    // Cada vez que la app vuelve a primer plano (máx. 1 vez cada 6 h) se amplía la sesión otros 90 días
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      const { token: t } = leerSesion();
      if (!t || Date.now() - ultimaRenovacion.current < 6 * 36e5) return;
      ultimaRenovacion.current = Date.now();
      renovar(t);
    };
    ultimaRenovacion.current = Date.now();
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, []);

  // El panel de administración se refresca al abrirlo y cada minuto
  useEffect(() => {
    if (!token || user?.role !== 'ADMIN' || vista !== 'dashboard' || modoEmpleado) return;
    cargarResumenAdmin();
    const t = setInterval(cargarResumenAdmin, 60000);
    return () => clearInterval(t);
  }, [token, vista, modoEmpleado]);

  useEffect(() => {
    if (token && user) {
      cargarHistorial(); cargarSolicitudes(); cargarMisDocumentos();
      cargarNotificaciones(); cargarConfig();
      if (user.role === 'ADMIN') {
        cargarAdminSolicitudes(); cargarProfesores(); cargarZonasAdmin(); cargarDocumentosAdmin(); cargarResumenAdmin();
        cargarNotifAdmin();
      }
    }
  }, [token]);

  // Totales de clases del período elegido en el inicio (mes en curso o temporada)
  useEffect(() => {
    if (!token) return;
    const { desde, hasta } = rangoPeriodo(periodoDash);
    setClasesPeriodo(null);
    api.get(`/api/clases/periodo?desde=${desde}&hasta=${hasta}`, { headers: h() })
      .then(r => setClasesPeriodo(r.data)).catch(() => {});
  }, [token, periodoDash]);

  // Atajos de la app instalada (manifest): /?vista=fichar, /?vista=misclases
  useEffect(() => {
    if (!token || !user) return;
    const v = new URLSearchParams(window.location.search).get('vista');
    if (!v) return;
    if (user.role === 'ADMIN' && ['fichar', 'misclases', 'solicitar'].includes(v)) setModoEmpleado(true);
    setVista(v);
    window.history.replaceState({}, '', window.location.pathname);
  }, [token]);

  // Información de privacidad / contrato de encargo pendientes de aceptar (bloquea la app hasta aceptarlos)
  useEffect(() => {
    if (!token) return;
    api.get('/api/legal/estado', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setLegalPendiente(r.data.some(d => !d.aceptado))).catch(() => {});
  }, [token]);

  // Poll notifications every 60s
  useEffect(() => {
    if (!token) return;
    const iv = setInterval(cargarNotificaciones, 60000);
    return () => clearInterval(iv);
  }, [token, cargarNotificaciones]);

  // ===== QR SCANNER =====
  const iniciarScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setEscaneando(true); // video element mounts on next render; useEffect below attaches stream
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      scanIntervalRef.current = setInterval(() => {
        if (!videoRef.current || videoRef.current.readyState !== 4) return;
        canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code?.data) { detenerScanner(); procesarQREscaneado(code.data); }
      }, 200);
    } catch { toast$('No se pudo acceder a la cámara', 'error'); }
  };
  const detenerScanner = () => {
    clearInterval(scanIntervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setEscaneando(false);
  };
  // Attach stream after React mounts the <video> element (escaneando===true triggers mount)
  useEffect(() => {
    if (escaneando && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [escaneando]);
  useEffect(() => () => detenerScanner(), []);

  // ===== NFC LEER =====
  const iniciarNFC = async () => {
    if (!nfcDisponible) { toast$('NFC no disponible (requiere Chrome Android)', 'warning'); return; }
    try {
      const ndef = new window.NDEFReader(); await ndef.scan(); setNfcActivo(true);
      toast$('Acerca el teléfono al tag NFC...', 'info', 10000);
      ndef.addEventListener('reading', ({ message }) => {
        for (const record of message.records) {
          if (record.recordType === 'text') { procesarQREscaneado(new TextDecoder().decode(record.data)); setNfcActivo(false); break; }
        }
      });
    } catch { toast$('Error al activar NFC', 'error'); }
  };

  // ===== NFC ESCRIBIR (asociar tag a zona — solo admin) =====
  const escribirTagNFC = async (zona) => {
    if (!nfcDisponible) { toast$('NFC no disponible en este dispositivo', 'warning'); return; }
    try {
      toast$('Acerca el tag NFC vacío al teléfono...', 'info', 8000);
      const ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: 'text', data: contenidoQR(zona) }] });
      toast$(`Tag NFC programado para: ${zona.nombre}`, 'success');
    } catch (err) { toast$('Error escribiendo tag NFC: ' + (err.message || err), 'error'); }
  };

  const procesarQREscaneado = async (rawData) => {
    const parsed = parsearQR(rawData);
    if (parsed) {
      setQrCode(parsed.zoneId);
      if (parsed.mode === 'TOTP' || parsed.mode === 'TOTP_GPS') {
        try {
          const totp = await generarTOTP(parsed.secret, 30, serverTimeOffsetRef.current);
          await ficharConTotp(parsed.zoneId, totp, parsed.mode);
        } catch { toast$('Error al generar token', 'error'); }
      } else { toast$(`✓ QR escaneado: ${parsed.zoneId}`, 'success'); }
    } else { setQrCode(rawData); toast$(`✓ QR leído: ${rawData}`, 'info'); }
  };

  const ficharConTotp = async (zoneId, totpToken, mode) => {
    setCargando(true);
    try {
      let lat = null, lng = null;
      if (mode === 'GPS' || mode === 'TOTP_GPS') {
        try {
          const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        } catch { if (mode === 'GPS') { toast$('No se pudo obtener la ubicación', 'error'); setCargando(false); return; } }
      }
      const res = await api.post('/api/fichaje/fichar', { qrCodeId: zoneId, totpToken, lat, lng }, { headers: h() });
      toast$(`${res.data.tipo === 'ENTRADA' ? '▶ Entrada' : '■ Salida'} registrada a las ${res.data.hora}`, 'success');
      cargarHistorial(); setQrCode('');
    } catch (err) { toast$(err.response?.data?.error || err.message, 'error', 5000); }
    finally { setCargando(false); }
  };

  const fichar = async () => {
    if (!qrCode) { toast$('Selecciona o escanea un código QR', 'warning'); return; }
    setCargando(true);
    try {
      let lat = null, lng = null;
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } catch {}
      const res = await api.post('/api/fichaje/fichar', { qrCodeId: qrCode, lat, lng }, { headers: h() });
      toast$(`${res.data.tipo === 'ENTRADA' ? '▶ Entrada' : '■ Salida'} registrada a las ${res.data.hora}`, 'success');
      cargarHistorial(); setQrCode('');
    } catch (err) { toast$(err.response?.data?.error || err.message, 'error', 5000); }
    finally { setCargando(false); }
  };

  const registrarSalida = async () => {
    setConfirmarSalida(false);
    setCargando(true);
    try {
      const res = await api.post('/api/fichaje/salida', {}, { headers: h() });
      toast$(`■ Salida registrada a las ${res.data.hora}`, 'success');
      cargarHistorial();
    } catch (err) { toast$(err.response?.data?.error || err.message, 'error', 5000); }
    finally { setCargando(false); }
  };

  const marcarLeida = async (id) => {
    await api.post(`/api/notificaciones/${id}/leer`, {}, { headers: h() });
    setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
  };
  const marcarTodasLeidas = async () => {
    await api.post('/api/notificaciones/leer-todas', {}, { headers: h() });
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
  };
  const enviarNotificacion = async () => {
    if (!nuevaNotif.titulo || !nuevaNotif.mensaje) { toast$('Escribe título y mensaje', 'warning'); return; }
    setCargando(true);
    try {
      const body = { ...nuevaNotif };
      if (!body.destinatarioId) delete body.destinatarioId;
      const r = await api.post('/api/admin/notificaciones', body, { headers: h() });
      toast$(`Notificación enviada a ${r.data.enviadas} empleado(s) ✓`, 'success', 4000);
      setNuevaNotif({ titulo: '', mensaje: '', tipo: 'INFO', destinatarioId: '' });
      cargarNotifAdmin();
    } catch (err) { toast$(err.response?.data?.error || 'Error', 'error'); }
    finally { setCargando(false); }
  };
  const eliminarNotifAdmin = async (id) => {
    try {
      await api.delete(`/api/admin/notificaciones/${id}`, { headers: h() });
      setNotifAdmin(prev => prev.filter(n => n.id !== id));
    } catch { toast$('Error al eliminar', 'error'); }
  };
  const guardarConfig = async () => {
    setCargando(true);
    try {
      const r = await api.put('/api/admin/config', configEscuela, { headers: h() });
      setConfigEscuela(r.data);
      toast$('Configuración guardada ✓', 'success');
    } catch { toast$('Error guardando configuración', 'error'); }
    finally { setCargando(false); }
  };

  const solicitarLibre = async () => {
    if (!fechaInicio || !fechaFin) { toast$('Selecciona las fechas', 'warning'); return; }
    if (new Date(fechaInicio) > new Date(fechaFin)) { toast$('La fecha inicio debe ser anterior', 'warning'); return; }
    setCargando(true);
    try {
      await api.post('/api/libres/solicitar', { fechaInicio, fechaFin, motivo, comentario }, { headers: h() });
      toast$('Solicitud enviada correctamente', 'success');
      cargarSolicitudes(); setFechaInicio(''); setFechaFin(''); setComentario('');
    } catch { toast$('Error al enviar la solicitud', 'error'); }
    finally { setCargando(false); }
  };

  const responderSolicitud = async (id, aprobado) => {
    if (!aprobado && !observacion) { toast$('Escribe una observación para rechazar', 'warning'); return; }
    setCargando(true);
    try {
      await api.post(`/api/admin/solicitudes/${id}/responder`, { aprobado, observacion }, { headers: h() });
      toast$(aprobado ? 'Solicitud aprobada ✓' : 'Solicitud rechazada', aprobado ? 'success' : 'error');
      cargarAdminSolicitudes(); cargarSolicitudes(); cargarResumenAdmin(); setObservacion(''); setSolicitudSeleccionada(null);
    } catch { toast$('Error al procesar', 'error'); }
    finally { setCargando(false); }
  };

  const agregarUsuario = async () => {
    const esEmpresa = nuevoUsuario.role === 'ADMIN';
    if (!nuevoUsuario.nombre || !nuevoUsuario.email || (!esEmpresa && !nuevoUsuario.apellidos)) {
      toast$(esEmpresa ? 'Nombre y email son obligatorios' : 'Nombre, apellidos y email son obligatorios', 'warning'); return;
    }
    setCargando(true);
    try {
      await api.post('/api/admin/profesores', nuevoUsuario, { headers: h() });
      toast$('Usuario creado. Se envió la invitación por correo.', 'success', 5000);
      cargarProfesores();
      setNuevoUsuario({ nombre: '', apellidos: '', email: '', tipoJornada: 'COMPLETA', horasContrato: 35, role: 'PROFESOR', telefono: '' });
    } catch (err) { toast$(err.response?.data?.error || 'Error al crear usuario', 'error'); }
    finally { setCargando(false); }
  };

  const invitarUno = async (p) => {
    try { await api.post(`/api/admin/profesores/${p.id}/invitar`, null, { headers: h() }); toast$(`Invitación enviada a ${p.email}`, 'success'); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo enviar', 'error'); }
  };
  const invitarPendientes = async () => {
    try {
      const r = await api.post('/api/admin/profesores/invitar-pendientes', null, { headers: h() });
      toast$(r.data.enviadas ? `${r.data.enviadas} invitaciones en camino` : 'No hay pendientes', 'success');
    } catch (e) { toast$(e.response?.data?.error || 'No se pudo enviar', 'error'); }
  };
  const cambiarRol = async (p, role) => {
    if (!window.confirm(role === 'ADMIN' ? `¿Dar acceso de administración a ${p.nombre}?` : `¿Quitar el acceso de administración a ${p.nombre}?`)) return;
    try { await api.put(`/api/admin/profesores/${p.id}/rol`, { role }, { headers: h() }); toast$('Rol actualizado', 'success'); cargarProfesores(); }
    catch (e) { toast$(e.response?.data?.error || 'No se pudo cambiar el rol', 'error'); }
  };
  const cargarAuditoria = async () => {
    try { setAuditoria((await api.get('/api/admin/auditoria?limit=40', { headers: h() })).data); }
    catch { toast$('No se pudo cargar el registro', 'error'); }
  };

  const guardarEdicionProfesor = async () => {
    if (!profesorEditId) return;
    setCargando(true);
    try {
      await api.put(`/api/admin/profesores/${profesorEditId}`, profesorEditData, { headers: h() });
      toast$('Usuario actualizado correctamente', 'success');
      cargarProfesores(); setProfesorEditId(null); setProfesorEditData({});
    } catch (err) { toast$(err.response?.data?.error || 'Error al actualizar', 'error'); }
    finally { setCargando(false); }
  };

  const guardarPerfil = async () => {
    if (!perfilEdit) return;
    setCargando(true);
    try {
      const r = await api.put('/api/auth/me', perfilEdit, { headers: h() });
      const newUser = { ...user, ...r.data };
      setUser(newUser);
      guardarSesionAlmacen(token, newUser);
      toast$('Perfil actualizado correctamente', 'success');
      setPerfilEdit(null);
    } catch (err) { toast$(err.response?.data?.error || 'Error al actualizar perfil', 'error'); }
    finally { setCargando(false); }
  };


  const agregarZona = async () => {
    if (!nuevaZona.nombre) { toast$('El nombre de la zona es obligatorio', 'warning'); return; }
    setCargando(true);
    try {
      await api.post('/api/admin/zonas', nuevaZona, { headers: h() });
      toast$('Zona creada correctamente', 'success');
      cargarZonasAdmin();
      setNuevaZona({ nombre: '', descripcion: '', lat: '', lng: '', radio: 100, validationMode: 'TOTP_GPS' });
    } catch (err) { toast$(err.response?.data?.error || 'Error al crear zona', 'error'); }
    finally { setCargando(false); }
  };

  const eliminarZona = async (id) => {
    if (!confirm('¿Eliminar esta zona?')) return;
    try { await api.delete(`/api/admin/zonas/${id}`, { headers: h() }); toast$('Zona eliminada', 'info'); cargarZonasAdmin(); }
    catch { toast$('Error al eliminar', 'error'); }
  };

  const regenerarSecretoZona = async (id) => {
    if (!confirm('¿Regenerar el secreto? Los QR impresos quedarán invalidados.')) return;
    try {
      await api.post(`/api/admin/zonas/${id}/regenerar-secreto`, {}, { headers: h() });
      toast$('Secreto regenerado. Imprime el nuevo QR.', 'warning', 5000);
      setQrGenerado(prev => ({ ...prev, [id]: null })); cargarZonasAdmin();
    } catch { toast$('Error al regenerar', 'error'); }
  };

  const generarQRImagen = async (zona) => {
    const contenido = contenidoQR(zona);
    try {
      const url = await QRCode.toDataURL(contenido, { width: 300, margin: 2, color: { dark: '#0f4c81', light: '#ffffff' } });
      setQrGenerado(prev => ({ ...prev, [zona.id]: { url, contenido } }));
    } catch { toast$('Error al generar QR', 'error'); }
  };

  const imprimirQR = (zonaId) => {
    const data = qrGenerado[zonaId]; if (!data) return;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>QR - Ski Jornada</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px}h2{color:#0f4c81}
      img{border:2px solid #0f4c81;border-radius:8px;padding:16px}
      .info{background:#f0f7ff;border-radius:8px;padding:16px;margin:16px auto;max-width:320px;font-size:14px}
      </style></head><body><h2>⛷️ Ski Jornada</h2>
      <img src="${data.url}" /><br>
      <div class="info"><strong>Zona:</strong> ${zonaId.replace(/-/g,' ')}</div>
      <p style="color:#64748b;font-size:12px">Escanea con la app Ski Jornada para fichar</p>
      </body></html>`);
    win.document.close(); win.print();
  };

  const instalarPWA = async () => {
    if (!pwaInstallEvent) return;
    pwaInstallEvent.prompt();
    const { outcome } = await pwaInstallEvent.userChoice;
    if (outcome === 'accepted') { setPwaInstallEvent(null); toast$('Aplicación instalada en pantalla de inicio', 'success'); }
  };

  const subirDocAdmin = async () => {
    if (!docNuevo.profesorId || !docNuevo.nombre || !docNuevo.file) {
      toast$('Selecciona empleado, escribe un nombre y adjunta el PDF', 'warning'); return;
    }
    setCargando(true);
    try {
      const fd = new FormData();
      fd.append('pdf', docNuevo.file);
      fd.append('profesorId', docNuevo.profesorId);
      fd.append('tipo', docNuevo.tipo);
      fd.append('nombre', docNuevo.nombre);
      if (docNuevo.mes) fd.append('mes', docNuevo.mes);
      await api.post('/api/admin/documentos', fd, { headers: { Authorization: `Bearer ${token}` } });
      toast$('Documento subido. El empleado recibirá un email.', 'success', 5000);
      cargarDocumentosAdmin();
      setDocNuevo({ profesorId: '', tipo: 'NOMINA', nombre: '', mes: '', file: null });
      if (docNuevoFileRef.current) docNuevoFileRef.current.value = '';
    } catch (err) { toast$(err.response?.data?.error || 'Error al subir documento', 'error'); }
    finally { setCargando(false); }
  };

  const subirFirmaProfesor = async (docId) => {
    const file = firmaFileRefs.current[docId]?.files?.[0];
    if (!file) { toast$('Selecciona el PDF firmado', 'warning'); return; }
    setCargando(true);
    try {
      const fd = new FormData(); fd.append('pdf', file);
      await api.post(`/api/documentos/${docId}/firmar`, fd, { headers: { Authorization: `Bearer ${token}` } });
      toast$('Documento firmado enviado correctamente ✓', 'success');
      cargarMisDocumentos();
      if (firmaFileRefs.current[docId]) firmaFileRefs.current[docId].value = '';
    } catch (err) { toast$(err.response?.data?.error || 'Error al subir firma', 'error'); }
    finally { setCargando(false); }
  };

  // Firma canvas → convierte a blob PNG y sube
  const subirFirmaCanvas = async (docId, dataUrl) => {
    setCargando(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'firma-canvas.png', { type: 'image/png' });
      const fd = new FormData(); fd.append('pdf', file);
      await api.post(`/api/documentos/${docId}/firmar`, fd, { headers: { Authorization: `Bearer ${token}` } });
      toast$('Firma enviada correctamente ✓', 'success');
      setFirmaCanvasDocId(null);
      cargarMisDocumentos();
    } catch (err) { toast$(err.response?.data?.error || 'Error al enviar firma', 'error'); }
    finally { setCargando(false); }
  };

  // Los PDFs están protegidos: se piden con la sesión y se abren como blob
  const abrirArchivo = async (url) => {
    const w = window.open('', '_blank');
    try {
      const r = await api.get(url, { headers: h(), responseType: 'blob' });
      // El tipo lo fijamos nosotros por la extensión, no el que declare el servidor: un HTML disfrazado no puede ejecutarse en esta página
      const TIPOS = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
      const tipo = TIPOS[(url.split('.').pop() || '').toLowerCase()];
      if (!tipo) throw new Error('tipo');
      const blobUrl = URL.createObjectURL(new Blob([r.data], { type: tipo }));
      if (w) w.location.href = blobUrl; else window.location.href = blobUrl;
    } catch { w?.close(); toast$('No se pudo abrir el archivo', 'error'); }
  };

  const exportarMisDatos = async () => {
    try {
      const r = await api.get('/api/auth/me/exportar', { headers: h(), responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data); a.download = 'mis-datos.json'; a.click(); URL.revokeObjectURL(a.href);
    } catch { toast$('No se pudo exportar', 'error'); }
  };

  const logout = () => { borrarSesion(); setToken(null); setUser(null); };

  // ===== ESTADO ACTUAL =====
  const hoy = fechaLocal(horaActual);
  const registrosHoy   = historial[hoy] || [];
  const estadoFichaje  = registrosHoy[registrosHoy.length - 1]?.tipo || null;
  const esAdmin        = user?.role === 'ADMIN';
  const totalHoras     = Object.values(resumenDiario).reduce((s, d) => s + d.horas, 0).toFixed(1);
  const rango          = rangoPeriodo(periodoDash, horaActual);
  const diasPeriodo    = Object.entries(resumenDiario).filter(([dia]) => dia.slice(0, 7) >= rango.desde && dia.slice(0, 7) <= rango.hasta);
  const horasPeriodo   = diasPeriodo.reduce((s, [, d]) => s + d.horas, 0).toFixed(1);
  const adminPendientes = adminSolicitudes.filter(s => s.estado === 'PENDIENTE').length;
  const docsPendientes  = documentosAdmin.filter(d => d.estado === 'PENDIENTE').length;
  const misDocsPendientes = misDocumentos.filter(d => d.estado === 'PENDIENTE').length;
  const notifNoLeidas   = notificaciones.filter(n => !n.leida).length;

  // ===== NAVEGACIÓN =====
  const docsOn = configEscuela?.documentosHabilitados !== false;
  const navItemsTodos = esAdmin && !modoEmpleado
    ? [
        { id: 'dashboard',  icon: '📊', label: 'Panel' },
        { id: 'presencia',  icon: '🟢', label: 'Presencia' },
        { id: 'gestionar',  icon: '✅', label: 'Solicitudes', badge: adminPendientes },
        { id: 'clases',     icon: '🎿', label: 'Clases', badge: (resumenAdmin?.clases.sinRevisar || 0) + (resumenAdmin?.clases.conProblema || 0) },
        { id: 'informes',   icon: '📄', label: 'Informes' },
        { id: 'documentos', icon: '📁', label: 'Documentos', badge: docsPendientes },
        { id: 'usuarios',   icon: '👥', label: 'Usuarios' },
        { id: 'zonas',      icon: '📍', label: 'Zonas' },
        { id: 'avisos',     icon: '🔔', label: 'Avisos' },
        { id: 'integraciones', icon: '🔗', label: 'Integraciones' },
        { id: 'config',     icon: '🏔', label: 'Config' },
        { id: 'perfil',     icon: '👤', label: 'Mi Perfil' },
      ]
    : [
        ...(!esAdmin ? [{ id: 'dashboard', icon: '📊', label: 'Inicio' }] : []),
        { id: 'fichar',     icon: '🕐', label: 'Fichar' },
        { id: 'misclases',  icon: '🎿', label: 'Clases' },
        { id: 'solicitar',  icon: '📅', label: 'Días libres' },
        { id: 'informes',   icon: '📄', label: 'Informes' },
        { id: 'documentos', icon: '📁', label: 'Documentos', badge: misDocsPendientes },
        { id: 'perfil',     icon: '⚙️', label: 'Mi perfil' },
      ];

  const navItems = docsOn ? navItemsTodos : navItemsTodos.filter(i => i.id !== 'documentos');

  const ICONO_NAV = {
    dashboard: 'inicio', presencia: 'presencia', gestionar: 'solicitudes', clases: 'clases', informes: 'informe', documentos: 'docs',
    usuarios: 'usuarios', zonas: 'zonas', avisos: 'avisos', integraciones: 'enlace', config: 'config', perfil: 'perfil', fichar: 'reloj', misclases: 'clases', solicitar: 'calendario',
  };
  const PRINCIPALES = esAdmin && !modoEmpleado ? ['dashboard', 'clases', 'usuarios', 'informes'] : ['dashboard', 'fichar', 'misclases', 'informes'];
  const navPrincipal = PRINCIPALES.map(id => navItems.find(i => i.id === id)).filter(Boolean);
  const navMas = navItems.filter(i => !PRINCIPALES.includes(i.id));
  const irA = (item) => {
    setVista(item.id); setMasAbierto(false); window.scrollTo({ top: 0 });
    if (item.id === 'informes') { setInformeMensual(null); setInformeAusencias(null); }
    if (item.id === 'presencia') cargarPresencia();
    if (item.id === 'documentos' && esAdmin && !modoEmpleado) cargarDocumentosAdmin();
    if (item.id === 'documentos' && (!esAdmin || modoEmpleado)) cargarMisDocumentos();
  };
  const BotonNav = ({ item }) => (
    <button className={`nav-item${vista === item.id ? ' active' : ''}`} onClick={() => irA(item)} aria-current={vista === item.id ? 'page' : undefined}>
      <Icono n={ICONO_NAV[item.id] || 'mas'} /><span>{item.label}</span>
      {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
    </button>
  );

  // ===== LOGIN =====
  if (!token) {
    const pedirEnlace = async (e) => {
      e.preventDefault(); setCargando(true);
      try {
        await api.post('/api/auth/magic-link', { email: emailLogin });
        setEnlaceEnviado(true);
      } catch (err) { toast$(err.response?.data?.error || 'No se pudo enviar el enlace', 'error'); }
      finally { setCargando(false); }
    };
    const verificarCodigo = async (email, codigo) => {
      setCargando(true);
      try {
        const res = await api.post('/api/auth/codigo/verificar', { email, codigo });
        guardarSesionAlmacen(res.data.token, res.data.user);
        setToken(res.data.token); setUser(res.data.user);
      } catch (err) { toast$(err.response?.data?.error || 'No se pudo verificar el código', 'error', 5000); }
      finally { setCargando(false); }
    };
    const handleLoginPassword = async (e) => {
      e.preventDefault(); setCargando(true);
      try {
        const res = await api.post('/api/auth/login', { email: e.target.email.value, password: e.target.password.value });
        guardarSesionAlmacen(res.data.token, res.data.user);
        setToken(res.data.token); setUser(res.data.user);
      } catch (err) { toast$(err.response?.data?.error || 'Error al iniciar sesión', 'error'); }
      finally { setCargando(false); }
    };
    return (
      <>
        <Landing
          emailLogin={emailLogin} setEmailLogin={setEmailLogin}
          enlaceEnviado={enlaceEnviado} setEnlaceEnviado={setEnlaceEnviado}
          api={api} verificarCodigo={verificarCodigo} pedirEnlace={pedirEnlace} cargando={cargando}
          pwaInstallEvent={pwaInstallEvent} instalarPWA={instalarPWA} toast={toast}
          devForm={import.meta.env.DEV && (
            <form onSubmit={handleLoginPassword} className="login-demo">
              <p>Solo desarrollo · contraseña (requiere PASSWORD_LOGIN=true)</p>
              <input type="email" name="email" placeholder="profesor@escuela.com" />
              <input type="password" name="password" placeholder="ski123" />
              <button type="submit" className="btn-sm">Entrar</button>
            </form>
          )}
        />
        <InstalarBanner evento={pwaInstallEvent} onInstalar={instalarPWA} />
        {cargando && <div className="loading-overlay"><div className="spinner" /></div>}
      </>
    );
  }

  return (
    <div className="app-container">
      {legalPendiente && <AceptacionLegal api={api} h={h} toast$={toast$} onListo={() => setLegalPendiente(false)} onSalir={logout} />}
      {verPrivacidad && <PoliticaPrivacidad api={api} onCerrar={() => setVerPrivacidad(false)} />}
      <header className="topbar">
        <div className="topbar-in">
          <div className="topbar-brand">
            <LogoMarca size={30} />
            <span>Ski Jornada</span>
          </div>
          <div className="topbar-right">
            {estadoFichaje && (
              <span className={`chip-estado ${estadoFichaje === 'ENTRADA' ? 'dentro' : ''}`} role="status">
                <span className="punto" />
                {estadoFichaje === 'ENTRADA'
                  ? (tiempoFichado !== null ? formatTiempo(tiempoFichado).replace(/ \d+s$/, '') : 'Dentro')
                  : 'Fuera'}
              </span>
            )}
            {esAdmin && (
              <button className={`chip-modo${modoEmpleado ? ' activo' : ''}`}
                onClick={() => { setModoEmpleado(m => !m); setVista(modoEmpleado ? 'dashboard' : 'fichar'); }}
                aria-pressed={modoEmpleado}>
                {modoEmpleado ? 'Vista admin' : 'Modo empleado'}
              </button>
            )}
            {pwaInstallEvent && (
              <button className="icon-btn solo-escritorio" onClick={instalarPWA} aria-label="Instalar la app"><Icono n="instalar" /></button>
            )}
            <button className="icon-btn" onClick={() => setNotifPanel(p => !p)} aria-label={`Notificaciones${notifNoLeidas ? `, ${notifNoLeidas} sin leer` : ''}`}>
              <Icono n="campana" />
              {notifNoLeidas > 0 && <span className="badge-dot">{notifNoLeidas > 9 ? '9+' : notifNoLeidas}</span>}
            </button>
            <button className="icon-btn solo-escritorio" onClick={logout} aria-label="Cerrar sesión"><Icono n="salir" /></button>
          </div>
        </div>
      </header>

      {/* ===== PANEL NOTIFICACIONES ===== */}
      {notifPanel && (
        <div className="notif-overlay" onClick={() => setNotifPanel(false)}>
          <div className="notif-panel" onClick={e => e.stopPropagation()}>
            <div className="notif-panel-header">
              <h3>Notificaciones</h3>
              {notifNoLeidas > 0 && (
                <button className="btn-ghost notif-leer-todas" onClick={marcarTodasLeidas}>
                  Marcar todas como leídas
                </button>
              )}
            </div>
            {!notificaciones.length ? (
              <div className="notif-empty">Sin notificaciones</div>
            ) : (
              <div className="notif-list">
                {notificaciones.map(n => (
                  <div key={n.id} className={`notif-item notif-tipo-${n.tipo.toLowerCase()}${n.leida ? ' leida' : ''}`}
                    onClick={() => !n.leida && marcarLeida(n.id)}>
                    <span className="notif-icono">
                      {n.tipo === 'ALERTA' ? '🚨' : n.tipo === 'AVISO' ? '⚠️' : 'ℹ️'}
                    </span>
                    <div className="notif-body">
                      <strong className="notif-titulo">{n.titulo}</strong>
                      <p className="notif-mensaje">{n.mensaje}</p>
                      <span className="notif-meta">
                        {new Date(n.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                        {' · '}{n.enviadoPorNombre}
                      </span>
                    </div>
                    {!n.leida && <span className="notif-dot" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="side-nav" aria-label="Principal">
        {navItems.map(item => <BotonNav key={item.id} item={item} />)}
        <div style={{ flex: 1 }} />
        <button className="nav-item" onClick={logout}><Icono n="salir" /><span>Cerrar sesión</span></button>
      </nav>

      <nav className="bottom-nav" aria-label="Principal">
        {navPrincipal.map(item => <BotonNav key={item.id} item={item} />)}
        {navMas.length > 0 && (
          <button className={`nav-item${navMas.some(i => i.id === vista) ? ' active' : ''}`} onClick={() => setMasAbierto(true)} aria-haspopup="dialog">
            <Icono n="mas" /><span>Más</span>
            {navMas.some(i => i.badge > 0) && <span className="nav-badge">{navMas.reduce((s, i) => s + (i.badge || 0), 0)}</span>}
          </button>
        )}
      </nav>

      <InstalarBanner evento={pwaInstallEvent} onInstalar={instalarPWA} />

      {masAbierto && (
        <div className="sheet-overlay" onClick={() => setMasAbierto(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Más opciones" onClick={e => e.stopPropagation()}>
            <div className="sheet-grip" />
            <h3>Más opciones</h3>
            <div className="sheet-grid">
              {navMas.map(item => (
                <button key={item.id} className={`sheet-item${vista === item.id ? ' activo' : ''}`} onClick={() => irA(item)}>
                  <Icono n={ICONO_NAV[item.id] || 'mas'} /><span>{item.label}</span>
                  {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
                </button>
              ))}
            </div>
            <div className="sheet-acciones">
              {pwaInstallEvent && <button onClick={() => { instalarPWA(); setMasAbierto(false); }}><Icono n="instalar" size={20} />Instalar la app</button>}
              <button className="salir" onClick={logout}><Icono n="salir" size={20} />Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      <main>

        {/* ===== DASHBOARD ADMIN ===== */}
        {esAdmin && !modoEmpleado && vista === 'dashboard' && (
          <DashboardAdmin resumen={resumenAdmin} cargando={cargando} irA={setVista} recargar={cargarResumenAdmin}
            aprobar={id => responderSolicitud(id, true)} />
        )}

        {/* ===== PRESENCIA (admin) ===== */}
        {esAdmin && !modoEmpleado && vista === 'presencia' && (
          <VistaPresencia
            presencia={presencia}
            onRefresh={cargarPresencia}
            serverTimeOffsetRef={serverTimeOffsetRef}
          />
        )}

        {/* ===== DASHBOARD EMPLEADO ===== */}
        {(!esAdmin || modoEmpleado) && vista === 'dashboard' && (
          <div>
            {/* Estado actual prominente */}
            <div className={`card fichar-clock-card ${estadoFichaje === 'ENTRADA' ? 'estado-dentro' : 'estado-fuera'}`}>
              <div className="fichar-hora-actual">
                {horaActual.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="fichar-fecha-actual">
                {horaActual.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div className="fichar-estado-row">
                <span className={`fichar-estado-pill ${estadoFichaje === 'ENTRADA' ? 'dentro' : 'fuera'}`}>
                  {estadoFichaje === 'ENTRADA' ? '▶ DENTRO' : (estadoFichaje === 'SALIDA' ? '■ FUERA' : '○ Sin fichar')}
                </span>
                {estadoFichaje === 'ENTRADA' && tiempoFichado !== null && (
                  <span className="fichar-timer">
                    <span className="timer-dot">●</span> {formatTiempo(tiempoFichado)}
                  </span>
                )}
              </div>
              {estadoFichaje === 'ENTRADA' && registrosHoy.length > 0 && (
                <p className="dashboard-entrada-hora">
                  Entrada a las {registrosHoy.find(r => r.tipo === 'ENTRADA')?.hora}
                </p>
              )}
              <button className="btn-sm" onClick={() => setVista('fichar')}>
                {estadoFichaje === 'ENTRADA' ? 'Fichar salida' : 'Fichar entrada'}
              </button>
            </div>

            <div className="periodo-bar">
              <div className="segmentado" role="tablist" aria-label="Período de los totales">
                <button role="tab" aria-selected={periodoDash === 'mes'} className={periodoDash === 'mes' ? 'activo' : ''} onClick={() => setPeriodoDash('mes')}>Este mes</button>
                <button role="tab" aria-selected={periodoDash === 'temporada'} className={periodoDash === 'temporada' ? 'activo' : ''} onClick={() => setPeriodoDash('temporada')}>Temporada</button>
              </div>
              <span className="periodo-etiqueta">{rango.etiqueta}</span>
            </div>
            <div className="stats-grid stats-2x2">
              <div className="stat-card stat-blue"><div>
                <p className="stat-label">Horas fichadas</p><p className="stat-number">{horasPeriodo}h</p></div></div>
              <div className="stat-card stat-green"><div>
                <p className="stat-label">Días trabajados</p><p className="stat-number">{diasPeriodo.length}</p></div></div>
              <div className="stat-card stat-blue"><div>
                <p className="stat-label">Horas de clase</p><p className="stat-number">{clasesPeriodo ? `${clasesPeriodo.totalHoras}h` : '…'}</p></div></div>
              {clasesPeriodo?.totalImporte != null ? (
                <div className="stat-card stat-amber"><div>
                  <p className="stat-label">Importe estimado</p><p className="stat-number">{eurFmt(clasesPeriodo.totalImporte)}</p></div></div>
              ) : (
                <div className="stat-card stat-amber"><div>
                  <p className="stat-label">Solicitudes pendientes</p>
                  <p className="stat-number">{solicitudes.filter(s => s.estado === 'PENDIENTE').length}</p></div></div>
              )}
            </div>
            {periodoDash === 'temporada' && clasesPeriodo?.meses?.some(m => m.horas > 0) && (
              <div className="card">
                <h2>Clases por mes</h2>
                <div className="resumen-list">
                  {clasesPeriodo.meses.filter(m => m.horas > 0).map(m => (
                    <div key={m.mes} className="resumen-item">
                      <span className="resumen-fecha">{new Date(m.mes + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                      <div className="resumen-right">
                        <span className="resumen-horas">{m.horas} h</span>
                        {m.importe != null && <span className="badge-ok">{eurFmt(m.importe)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {registrosHoy.length > 0 && (
              <div className="card"><h2>Hoy</h2>
                <div className="timeline">
                  {registrosHoy.map((r, i) => (
                    <div key={i} className={`timeline-item ${r.tipo.toLowerCase()}`}>
                      <span className="timeline-icon">{r.tipo === 'ENTRADA' ? '▶' : '■'}</span>
                      <span className="timeline-tipo">{r.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}</span>
                      <span className="timeline-hora">{r.hora}</span>
                      <span className="timeline-zona">{r.zona}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card">
              <div className="card-header"><h2>Resumen últimos días</h2>
                <button className="btn-sm" onClick={cargarHistorial}>↻ Actualizar</button></div>
              {!Object.keys(resumenDiario).length
                ? <div className="empty-state"><p>🏔 Sin registros aún</p><small>Ve a Fichar para registrar tu jornada</small></div>
                : <div className="resumen-list">
                    {Object.entries(resumenDiario).sort(([a], [b]) => b.localeCompare(a)).slice(0, 10).map(([dia, d]) => (
                      <div key={dia} className="resumen-item">
                        <span className="resumen-fecha">{new Date(dia + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                        <div className="resumen-right">
                          <span className="resumen-horas">{d.horas}h</span>
                          {d.exceso > 0 && <span className="badge-warning">+{d.exceso}h extra</span>}
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
        )}

        {/* ===== FICHAR ===== */}
        {vista === 'fichar' && (
          <div>
            {/* Reloj y estado principal */}
            <div className={`card fichar-clock-card ${estadoFichaje === 'ENTRADA' ? 'estado-dentro' : 'estado-fuera'}`}>
              <div className="fichar-hora-actual">
                {horaActual.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="fichar-fecha-actual">
                {horaActual.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div className="fichar-estado-row">
                <span className={`fichar-estado-pill ${estadoFichaje === 'ENTRADA' ? 'dentro' : 'fuera'}`}>
                  {estadoFichaje === 'ENTRADA' ? '▶ DENTRO' : (estadoFichaje === 'SALIDA' ? '■ FUERA' : '○ Sin fichar')}
                </span>
                {estadoFichaje === 'ENTRADA' && tiempoFichado !== null && (
                  <span className="fichar-timer">
                    <span className="timer-dot">●</span> {formatTiempo(tiempoFichado)}
                  </span>
                )}
              </div>
            </div>

            {/* Scanner / NFC */}
            <div className="card">
              <h2>Registrar fichaje</h2>
              {escaneando ? (
                <div className="scanner-container">
                  <video ref={videoRef} className="scanner-video" playsInline muted />
                  <div className="scanner-overlay"><div className="scanner-frame" /></div>
                  <button className="btn-ghost scanner-stop" onClick={detenerScanner}><Icono n="cerrar" size={20} /> Cerrar cámara</button>
                </div>
              ) : (
                <>
                  <div className="scan-buttons">
                    <button className="btn-scan" onClick={iniciarScanner}><Icono n="qr" size={22} /> Escanear QR con cámara</button>
                    {nfcDisponible && (
                      <button className={`btn-scan btn-nfc ${nfcActivo ? 'active' : ''}`} onClick={iniciarNFC}>
                        <Icono n="nfc" size={22} /> {nfcActivo ? 'Esperando NFC…' : 'Leer tag NFC'}
                      </button>
                    )}
                  </div>
                  <div className="or-divider"><span>o introduce manualmente</span></div>
                  <div className="fichar-action">
                    <input type="text" className="qr-input" placeholder="Código de zona" value={qrCode} onChange={e => setQrCode(e.target.value)} />
                    <button onClick={fichar} disabled={cargando || !qrCode} className="btn-fichar">
                      {cargando ? <span className="btn-spinner" /> : (estadoFichaje === 'ENTRADA' ? '■ Registrar salida' : '▶ Registrar entrada')}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Salida sin QR — solo visible si está fichado */}
            {estadoFichaje === 'ENTRADA' && (
              <div className="card salida-directa-card">
                <h2>Salida rápida</h2>
                <p className="salida-directa-info">Registra tu salida sin necesidad de escanear el código QR.</p>
                <button className="btn-salida-directa" onClick={() => setConfirmarSalida(true)} disabled={cargando}>
                  ■ Registrar salida ahora
                </button>
              </div>
            )}

            {/* Modal confirmación salida */}
            {confirmarSalida && (
              <div className="modal-overlay" onClick={() => setConfirmarSalida(false)}>
                <div className="modal-box" onClick={e => e.stopPropagation()}>
                  <h3>¿Confirmar salida?</h3>
                  <p>Se registrará tu salida a las <strong>{horaActual.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong>.</p>
                  <div className="modal-actions">
                    <button className="btn-ghost" onClick={() => setConfirmarSalida(false)}>Cancelar</button>
                    <button className="btn-primary" onClick={registrarSalida}>Sí, registrar salida</button>
                  </div>
                </div>
              </div>
            )}

            {/* Registros de hoy */}
            {registrosHoy.length > 0 && (
              <div className="card"><h2>Registros de hoy</h2>
                <div className="timeline">
                  {registrosHoy.map((r, i) => (
                    <div key={i} className={`timeline-item ${r.tipo.toLowerCase()}`}>
                      <span className="timeline-icon">{r.tipo === 'ENTRADA' ? '▶' : '■'}</span>
                      <span className="timeline-tipo">{r.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}</span>
                      <span className="timeline-hora">{r.hora}</span>
                      <span className="timeline-zona">{r.zona}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DÍAS LIBRES ===== */}
        {vista === 'solicitar' && (
          <div className="view-solicitar">
            <div className="card">
              <h2>Nueva solicitud</h2>
              <div className="form-row">
                <div className="form-group"><label>Fecha inicio</label>
                  <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} /></div>
                <div className="form-group"><label>Fecha fin</label>
                  <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} /></div>
              </div>
              <div className="form-group"><label>Motivo</label>
                <select value={motivo} onChange={e => setMotivo(e.target.value)}>
                  <option value="VACACIONES">Vacaciones</option>
                  <option value="ASUNTO_PROPIO">Asunto propio</option>
                  <option value="ENFERMEDAD">Enfermedad</option>
                </select>
              </div>
              <div className="form-group"><label>Comentario (opcional)</label>
                <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows="3" placeholder="Añade un comentario..." /></div>
              <button onClick={solicitarLibre} disabled={cargando} className="btn-primary">Enviar solicitud</button>
            </div>
            <div className="card">
              <h2>Mis solicitudes</h2>
              {!solicitudes.length ? <div className="empty-state"><p>📋 Sin solicitudes</p></div> : (
                <div className="solicitudes-list">
                  {solicitudes.map(sol => (
                    <div key={sol.id} className={`solicitud-item estado-${sol.estado.toLowerCase()}`}>
                      <div className="solicitud-header">
                        <span className="solicitud-fechas">{new Date(sol.fechaInicio).toLocaleDateString('es-ES')} → {new Date(sol.fechaFin).toLocaleDateString('es-ES')}</span>
                        <span className={`estado-badge ${sol.estado.toLowerCase()}`}>{sol.estado}</span>
                      </div>
                      <div className="solicitud-motivo">{sol.motivo.replace('_', ' ')}</div>
                      {sol.observacion && <div className="solicitud-observacion">💬 {sol.observacion}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== MIS INFORMES (empleado) ===== */}
        {(!esAdmin || modoEmpleado) && vista === 'informes' && (
          <div>
            <div className="card">
              <h2>Mis informes</h2>
              <div className="segmentado" role="tablist" aria-label="Tipo de informe" style={{ marginBottom: 12 }}>
                <button role="tab" aria-selected={tabInformeEmp === 'jornada'} className={tabInformeEmp === 'jornada' ? 'activo' : ''} onClick={() => setTabInformeEmp('jornada')}>Jornada</button>
                <button role="tab" aria-selected={tabInformeEmp === 'clases'} className={tabInformeEmp === 'clases' ? 'activo' : ''} onClick={() => setTabInformeEmp('clases')}>Clases y economía</button>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="inf-mes">Mes</label>
                <div className="mes-selector">
                  <input id="inf-mes" type="month" value={mesInforme} onChange={e => setMesInforme(e.target.value)} />
                  {tabInformeEmp === 'jornada' && <button className="btn-primary" onClick={() => cargarInforme('')}>Ver</button>}
                </div>
              </div>
            </div>
            {tabInformeEmp === 'clases' && <InformeClases api={api} h={h} toast$={toast$} config={configEscuela} mes={mesInforme} />}
            {tabInformeEmp === 'jornada' && informeMensual && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <h2 style={{ marginBottom: 0 }}>{informeMensual.mes}</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={pdfIncluirExtras} onChange={e => setPdfIncluirExtras(e.target.checked)} />
                      Incluir horas extra en el PDF
                    </label>
                    <button className="btn-download" onClick={() => generarPDFRegistro(informeMensual, { incluirExtras: pdfIncluirExtras, config: configEscuela || {} })}>⬇ Descargar PDF oficial</button>
                  </div>
                </div>
                <div className="informe-stats">
                  <div className="informe-stat"><span className="informe-stat-icon">⏱</span><span className="informe-stat-value">{informeMensual.totalHoras}h</span><span className="informe-stat-label">Total horas</span></div>
                  <div className="informe-stat"><span className="informe-stat-icon">📆</span><span className="informe-stat-value">{informeMensual.diasTrabajados}</span><span className="informe-stat-label">Días trabajados</span></div>
                  <div className={`informe-stat${informeMensual.diasConExceso > 0 ? ' warning' : ''}`}><span className="informe-stat-icon">⚠️</span><span className="informe-stat-value">{informeMensual.diasConExceso}</span><span className="informe-stat-label">Días con exceso</span></div>
                  <div className="informe-stat"><span className="informe-stat-icon">📊</span><span className="informe-stat-value">{informeMensual.promedioDiario}h</span><span className="informe-stat-label">Promedio diario</span></div>
                </div>
                {informeMensual.detalle?.length > 0 && (
                  <div className="informe-detalle">
                    <h3>Detalle por día</h3>
                    <div className="detalle-list">
                      {informeMensual.detalle.map(d => (
                        <div key={d.fecha} className={`detalle-item${!d.cumpleNormativa ? ' exceso' : ''}`}>
                          <span className="detalle-fecha">{new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                          <span className="detalle-horas">{d.horas}h</span>
                          {d.exceso > 0 && <span className="badge-warning">+{d.exceso}h</span>}
                          {d.cumpleNormativa ? <span className="badge-ok">✓</span> : <span className="badge-warning">!</span>}
                          {d.registros?.length > 0 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', gridColumn: '1 / -1', marginTop: '2px' }}>
                              {d.registros.map(r => `${r.tipo === 'ENTRADA' ? '▶' : '■'} ${r.hora}`).join('  ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="nota-legal">* RD 8/2019 · Art. 34.9 ET: obligación de registro diario · conservar 4 años</p>
              </div>
            )}
          </div>
        )}

        {/* ===== MIS DOCUMENTOS (empleado) ===== */}
        {(!esAdmin || modoEmpleado) && vista === 'documentos' && (
          <div>
            <div className="view-header">
              <h2>Mis documentos</h2>
              {misDocsPendientes > 0 && <span className="count-badge">{misDocsPendientes} pendientes de firma</span>}
            </div>
            {!misDocumentos.length
              ? <div className="card"><div className="empty-state"><p>📁 Sin documentos</p><small>La administración te enviará aquí tus nóminas y contratos</small></div></div>
              : misDocumentos.map(doc => (
                  <div key={doc.id} className="card" style={{ borderLeft: `4px solid ${doc.estado === 'FIRMADO' ? 'var(--success)' : 'var(--warning)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '1.4rem' }}>{TIPO_DOC_ICON[doc.tipo] || '📄'}</span>
                          <strong style={{ fontSize: '1rem' }}>{doc.nombre}</strong>
                          <span className={`estado-badge ${doc.estado === 'FIRMADO' ? 'aprobado' : 'pendiente'}`}>
                            {doc.estado === 'FIRMADO' ? '✓ Firmado' : '⏳ Pendiente'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                          {TIPO_DOC_LABEL[doc.tipo] || doc.tipo}{doc.mes ? ` · ${doc.mes}` : ''} · Subido {new Date(doc.createdAt).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" className="btn-sm" onClick={() => abrirArchivo(doc.archivoUrl)}>↓ Ver original</button>
                        {doc.estado === 'FIRMADO' && doc.firmaUrl && (
                          <button type="button"
                            className="btn-sm" style={{ background: 'var(--success)', color: 'white', border: 'none' }} onClick={() => abrirArchivo(doc.firmaUrl)}>↓ Ver firmado</button>
                        )}
                      </div>
                    </div>
                    {doc.estado !== 'FIRMADO' && (
                      <div style={{ marginTop: '0.75rem' }}>
                        {firmaCanvasDocId === doc.id ? (
                          <FirmaCanvas
                            onFirma={(dataUrl) => subirFirmaCanvas(doc.id, dataUrl)}
                            onCancelar={() => setFirmaCanvasDocId(null)}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button className="btn-primary" style={{ width: 'auto', padding: '0.4rem 1rem', marginTop: 0 }}
                              onClick={() => setFirmaCanvasDocId(doc.id)}>
                              ✍ Firmar ahora (canvas)
                            </button>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>o</span>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Subir PDF firmado:</label>
                            <input type="file" accept="application/pdf" style={{ fontSize: '0.8rem' }}
                              ref={el => { firmaFileRefs.current[doc.id] = el; }} />
                            <button className="btn-sm" style={{ background: 'var(--primary)', color: 'white', border: 'none' }}
                              onClick={() => subirFirmaProfesor(doc.id)} disabled={cargando}>
                              📤 Enviar PDF firmado
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
            }
          </div>
        )}

        {/* ===== GESTIONAR SOLICITUDES (admin) ===== */}
        {esAdmin && !modoEmpleado && vista === 'gestionar' && (
          <div>
            <div className="view-header">
              <h2>Solicitudes</h2>
              {adminPendientes > 0 && <span className="count-badge">{adminPendientes} pendientes</span>}
            </div>
            {!adminSolicitudes.length ? <div className="empty-state card"><p>✅ Sin solicitudes</p></div> : (
              adminSolicitudes.map(sol => (
                <div key={sol.id} className="admin-card">
                  <div className="admin-card-header">
                    <div>
                      <strong className="admin-nombre">{sol.profesorNombre}</strong>
                      <span className="admin-fechas">{new Date(sol.fechaInicio).toLocaleDateString('es-ES')} → {new Date(sol.fechaFin).toLocaleDateString('es-ES')}</span>
                      <span className="admin-motivo">{sol.motivo.replace('_', ' ')}</span>
                    </div>
                    <span className={`estado-badge ${sol.estado.toLowerCase()}`}>{sol.estado}</span>
                  </div>
                  {sol.comentario && <p className="admin-comentario">"{sol.comentario}"</p>}
                  {sol.estado === 'PENDIENTE' && solicitudSeleccionada === sol.id && (
                    <div className="observacion-box">
                      <textarea placeholder="Observación (obligatoria para rechazar)" value={observacion} onChange={e => setObservacion(e.target.value)} rows="2" />
                      <div className="action-buttons">
                        <button className="btn-approve" onClick={() => responderSolicitud(sol.id, true)}>✓ Aprobar</button>
                        <button className="btn-reject"  onClick={() => responderSolicitud(sol.id, false)}>✗ Rechazar</button>
                        <button className="btn-ghost"   onClick={() => { setSolicitudSeleccionada(null); setObservacion(''); }}>Cancelar</button>
                      </div>
                    </div>
                  )}
                  {sol.estado === 'PENDIENTE' && solicitudSeleccionada !== sol.id && (
                    <button className="btn-responder" onClick={() => setSolicitudSeleccionada(sol.id)}>Responder</button>
                  )}
                  {sol.observacion && sol.estado !== 'PENDIENTE' && <p className="observacion-text">💬 {sol.observacion}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== INFORMES ADMIN ===== */}
        {esAdmin && !modoEmpleado && vista === 'informes' && (() => {
          // helpers locales al bloque
          const sortPlanilla = (campo) => {
            if (planillaOrden === campo) setPlanillaDir(d => d === 'asc' ? 'desc' : 'asc');
            else { setPlanillaOrden(campo); setPlanillaDir('asc'); }
          };
          const planillaOrdenada = planillaData ? [...planillaData.profesores].sort((a, b) => {
            const va = a[planillaOrden] ?? '', vb = b[planillaOrden] ?? '';
            const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
            return planillaDir === 'asc' ? cmp : -cmp;
          }) : [];
          const thSort = (campo, label) => (
            <th className={`planilla-th sortable${planillaOrden === campo ? ' sorted' : ''}`}
              onClick={() => sortPlanilla(campo)}>
              {label}{planillaOrden === campo ? (planillaDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
          );
          const exportarCSV = () => {
            if (!planillaData) return;
            const [anio, mes] = mesInforme.split('-');
            const cols = ['Apellidos','Nombre','Email','Tipo Jornada','h/Semana','h Esperadas','h Trabajadas','h Exceso','h Déficit','Cumpl. %','Días Trab.','Días Exceso','Estado'];
            const filas = planillaOrdenada.map(p => [
              p.apellidos, p.nombre, p.email, p.tipoJornada, p.horasContrato,
              p.horasEsperadas, p.horasTrabajadas, p.horasExceso, p.horasDeficit,
              p.cumplimiento, p.diasTrabajados, p.diasConExceso, p.estado,
            ]);
            const csv = [cols, ...filas].map(r => filaCsv(r, ',')).join('\r\n');
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `Planilla_${mes}-${anio}.csv`; a.click();
            URL.revokeObjectURL(url);
          };
          const estadoBadge = (e) => {
            if (e === 'OK')       return <span className="planilla-badge ok">✓ OK</span>;
            if (e === 'EXCESO')   return <span className="planilla-badge exceso">↑ Exceso</span>;
            if (e === 'DEFICIT')  return <span className="planilla-badge deficit">↓ Déficit</span>;
            return                       <span className="planilla-badge sin-datos">— Sin datos</span>;
          };

          return (
            <div>
              <div className="informe-tabs">
                <button className={`btn-tab${informeTab === 'registro' ? ' active' : ''}`}
                  onClick={() => { setInformeTab('registro'); setPlanillaData(null); }}>
                  📊 Registro individual
                </button>
                <button className={`btn-tab${informeTab === 'planilla' ? ' active' : ''}`}
                  onClick={() => { setInformeTab('planilla'); setInformeMensual(null); setInformeAusencias(null); }}>
                  📋 Planilla global
                </button>
                <button className={`btn-tab${informeTab === 'ausencias' ? ' active' : ''}`}
                  onClick={() => { setInformeTab('ausencias'); setInformeMensual(null); setPlanillaData(null); cargarInformeAusencias(); }}>
                  📅 Ausencias
                </button>
              </div>

              {/* ── Registro individual ── */}
              {informeTab === 'registro' && (
                <>
                  <div className="card">
                    <div className="informe-selector">
                      <h2>Registro de jornada</h2>
                      <div className="mes-selector">
                        <select value={profesorInforme} onChange={e => setProfesorInforme(e.target.value)}
                          style={{ padding: '0.5rem 0.75rem', border: '2px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
                          <option value="">— Seleccionar empleado —</option>
                          {profesores.filter(p => p.role === 'PROFESOR').map(p => (
                            <option key={p.id} value={p.id}>{p.apellidos}, {p.nombre}</option>
                          ))}
                        </select>
                        <input type="month" value={mesInforme} onChange={e => setMesInforme(e.target.value)} />
                        <button className="btn-primary" onClick={() => cargarInforme()} style={{ width: 'auto', padding: '0.5rem 1.25rem', marginTop: 0 }}>Ver</button>
                      </div>
                    </div>
                  </div>
                  {informeMensual && profesorInforme && (
                    <CorregirFichajes api={api} headers={h} profesorId={profesorInforme} mes={mesInforme} onCambio={() => cargarInforme()} />
                  )}
                  {informeMensual && (
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <h2 style={{ marginBottom: '0.25rem' }}>{informeMensual.profesor.apellidos}, {informeMensual.profesor.nombre} — {informeMensual.mes}</h2>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{informeMensual.profesor.tipoJornada === 'COMPLETA' ? 'Jornada Completa' : 'Media Jornada'} · {informeMensual.profesor.horasContrato}h/semana</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={pdfIncluirExtras} onChange={e => setPdfIncluirExtras(e.target.checked)} />
                            Incluir horas extra en el PDF
                          </label>
                          <button className="btn-download" onClick={() => generarPDFRegistro(informeMensual, { incluirExtras: pdfIncluirExtras, config: configEscuela || {} })}>⬇ Descargar PDF oficial</button>
                        </div>
                      </div>
                      <div className="informe-stats">
                        <div className="informe-stat"><span className="informe-stat-icon">⏱</span><span className="informe-stat-value">{informeMensual.totalHoras}h</span><span className="informe-stat-label">Total horas</span></div>
                        <div className="informe-stat"><span className="informe-stat-icon">📆</span><span className="informe-stat-value">{informeMensual.diasTrabajados}</span><span className="informe-stat-label">Días trabajados</span></div>
                        <div className={`informe-stat${informeMensual.diasConExceso > 0 ? ' warning' : ''}`}><span className="informe-stat-icon">⚠️</span><span className="informe-stat-value">{informeMensual.diasConExceso}</span><span className="informe-stat-label">Días con exceso</span></div>
                        <div className="informe-stat"><span className="informe-stat-icon">📊</span><span className="informe-stat-value">{informeMensual.promedioDiario}h</span><span className="informe-stat-label">Promedio diario</span></div>
                      </div>
                      {informeMensual.detalle?.length > 0 && (
                        <div className="informe-detalle">
                          <h3>Detalle por día</h3>
                          <div className="detalle-list">
                            {informeMensual.detalle.map(d => (
                              <div key={d.fecha} className={`detalle-item${!d.cumpleNormativa ? ' exceso' : ''}`}>
                                <span className="detalle-fecha">{new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                <span className="detalle-horas">{d.horas}h</span>
                                {d.exceso > 0 && <span className="badge-warning">+{d.exceso}h</span>}
                                {d.cumpleNormativa ? <span className="badge-ok">✓</span> : <span className="badge-warning">!</span>}
                                {d.registros?.length > 0 && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', gridColumn: '1 / -1', marginTop: '2px' }}>
                                    {d.registros.map(r => `${r.tipo === 'ENTRADA' ? '▶' : '■'} ${r.hora}`).join('  ')}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="nota-legal">* RD 8/2019 · Art. 34.9 ET: obligación de registro diario · conservar 4 años</p>
                    </div>
                  )}
                </>
              )}

              {/* ── Planilla global ── */}
              {informeTab === 'planilla' && (
                <>
                  <div className="card planilla-controls">
                    <div className="planilla-controls-row">
                      <div>
                        <h2>Planilla de horas</h2>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Comparativa horas contratadas vs trabajadas — todos los empleados
                        </p>
                      </div>
                      <div className="planilla-controls-right">
                        <input type="month" value={mesInforme} onChange={e => { setMesInforme(e.target.value); setPlanillaData(null); }} />
                        <button className="btn-primary" onClick={cargarPlanilla} disabled={cargando}
                          style={{ width: 'auto', padding: '0.5rem 1.25rem', marginTop: 0 }}>
                          {cargando ? <span className="btn-spinner" /> : 'Generar'}
                        </button>
                        {planillaData && (
                          <button className="btn-sm btn-csv" onClick={exportarCSV} title="Exportar a CSV / Excel">
                            ⬇ CSV
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {planillaData && (
                    <>
                      {/* Resumen global */}
                      <div className="planilla-resumen">
                        <div className="planilla-kpi">
                          <span className="planilla-kpi-val">{planillaData.diasLaborables}</span>
                          <span className="planilla-kpi-lab">días laborables</span>
                        </div>
                        <div className="planilla-kpi">
                          <span className="planilla-kpi-val">{planillaData.totEsperadas}h</span>
                          <span className="planilla-kpi-lab">horas esperadas (total)</span>
                        </div>
                        <div className="planilla-kpi">
                          <span className="planilla-kpi-val">{planillaData.totTrabajadas}h</span>
                          <span className="planilla-kpi-lab">horas trabajadas (total)</span>
                        </div>
                        <div className={`planilla-kpi${planillaData.cumplimientoGlobal < 90 ? ' kpi-warn' : planillaData.cumplimientoGlobal >= 98 ? ' kpi-ok' : ''}`}>
                          <span className="planilla-kpi-val">{planillaData.cumplimientoGlobal}%</span>
                          <span className="planilla-kpi-lab">cumplimiento global</span>
                        </div>
                        <div className="planilla-kpi kpi-ok">
                          <span className="planilla-kpi-val">{planillaData.profesores.filter(p => p.estado === 'OK').length}</span>
                          <span className="planilla-kpi-lab">empleados OK</span>
                        </div>
                        <div className="planilla-kpi kpi-warn">
                          <span className="planilla-kpi-val">{planillaData.profesores.filter(p => p.estado === 'DEFICIT').length}</span>
                          <span className="planilla-kpi-lab">con déficit</span>
                        </div>
                        <div className="planilla-kpi kpi-exceso">
                          <span className="planilla-kpi-val">{planillaData.profesores.filter(p => p.estado === 'EXCESO').length}</span>
                          <span className="planilla-kpi-lab">con exceso</span>
                        </div>
                        <div className="planilla-kpi kpi-sin">
                          <span className="planilla-kpi-val">{planillaData.profesores.filter(p => p.estado === 'SIN_DATOS').length}</span>
                          <span className="planilla-kpi-lab">sin registros</span>
                        </div>
                      </div>

                      {/* Tabla planilla */}
                      <div className="card planilla-card">
                        <div className="planilla-table-wrap">
                          <table className="planilla-table">
                            <thead>
                              <tr>
                                {thSort('apellidos',       'Empleado')}
                                {thSort('tipoJornada',     'Jornada')}
                                {thSort('horasEsperadas',  'Esperadas')}
                                {thSort('horasTrabajadas', 'Trabajadas')}
                                <th className="planilla-th">Diferencia</th>
                                {thSort('cumplimiento',    'Cumpl. %')}
                                {thSort('diasTrabajados',  'Días trab.')}
                                {thSort('diasConExceso',   'Días exc.')}
                                {thSort('estado',          'Estado')}
                                <th className="planilla-th">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {planillaOrdenada.map(p => {
                                const diff = p.horasTrabajadas - p.horasEsperadas;
                                return (
                                  <tr key={p.id} className={`planilla-row planilla-row-${p.estado.toLowerCase().replace('_','-')}`}>
                                    <td className="planilla-td planilla-nombre">
                                      <strong>{p.apellidos}, {p.nombre}</strong>
                                      <span className="planilla-email">{p.email}</span>
                                    </td>
                                    <td className="planilla-td planilla-center">
                                      {p.tarifaHora != null && <small>{p.tarifaHora} €/h</small>}
                      <span className={`badge-jornada badge ${p.tipoJornada === 'COMPLETA' ? 'completa' : 'media'}`}>
                                        {p.tipoJornada === 'COMPLETA' ? `${p.horasContrato}h` : 'Media'}
                                      </span>
                                    </td>
                                    <td className="planilla-td planilla-num">{p.horasEsperadas}h</td>
                                    <td className="planilla-td planilla-num planilla-trab">{p.horasTrabajadas}h</td>
                                    <td className={`planilla-td planilla-num${diff > 0 ? ' planilla-pos' : diff < -0.1 ? ' planilla-neg' : ''}`}>
                                      {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${Math.round(diff * 100) / 100}h`}
                                    </td>
                                    <td className="planilla-td planilla-num">
                                      <div className="planilla-cumpl-wrap">
                                        <span className={p.cumplimiento >= 98 ? 'planilla-pos' : p.cumplimiento < 85 ? 'planilla-neg' : ''}>
                                          {p.cumplimiento}%
                                        </span>
                                        <div className="planilla-bar">
                                          <div className="planilla-bar-fill" style={{
                                            width: `${Math.min(100, p.cumplimiento)}%`,
                                            background: p.cumplimiento >= 98 ? 'var(--success)' : p.cumplimiento < 85 ? 'var(--danger)' : 'var(--warning)',
                                          }} />
                                        </div>
                                      </div>
                                    </td>
                                    <td className="planilla-td planilla-num">{p.diasTrabajados}</td>
                                    <td className="planilla-td planilla-num">{p.diasConExceso > 0 ? <span className="planilla-warn">{p.diasConExceso}</span> : '—'}</td>
                                    <td className="planilla-td">{estadoBadge(p.estado)}</td>
                                    <td className="planilla-td">
                                      <button className="btn-sm" onClick={() => {
                                        setProfesorInforme(p.id);
                                        setInformeTab('registro');
                                        cargarInforme(p.id);
                                      }}>Ver →</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="planilla-tfoot">
                                <td className="planilla-td" colSpan="2"><strong>TOTALES</strong></td>
                                <td className="planilla-td planilla-num"><strong>{planillaData.totEsperadas}h</strong></td>
                                <td className="planilla-td planilla-num"><strong>{planillaData.totTrabajadas}h</strong></td>
                                <td className="planilla-td planilla-num">
                                  <strong className={planillaData.totTrabajadas - planillaData.totEsperadas >= 0 ? 'planilla-pos' : 'planilla-neg'}>
                                    {(() => { const d = Math.round((planillaData.totTrabajadas - planillaData.totEsperadas) * 100) / 100; return `${d > 0 ? '+' : ''}${d}h`; })()}
                                  </strong>
                                </td>
                                <td className="planilla-td planilla-num"><strong>{planillaData.cumplimientoGlobal}%</strong></td>
                                <td className="planilla-td" colSpan="4" />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <p className="nota-legal" style={{ marginTop: '0.75rem' }}>
                          * Horas esperadas = (h/semana ÷ 5) × días laborables del mes. Días laborables: {planillaData.diasLaborables} (lun–vie, sin festivos nacionales).
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Ausencias ── */}
              {informeTab === 'ausencias' && informeAusencias && (
                <div className="card">
                  <h2>Ausencias por empleado</h2>
                  <div className="ausencias-list">
                    {informeAusencias.map(p => (
                      <div key={p.id} className="ausencia-card">
                        <div className="ausencia-header">
                          <div className="profesor-avatar small">{p.nombre[0]}{p.apellidos[0]}</div>
                          <div className="ausencia-info"><strong>{p.nombre} {p.apellidos}</strong><small>{p.email}</small></div>
                          <div className="ausencia-badges">
                            {p.diasVacaciones > 0 && <span className="ausencia-pill vac">🌴 {p.diasVacaciones}d vac.</span>}
                            {p.diasEnfermedad > 0 && <span className="ausencia-pill enf">🏥 {p.diasEnfermedad}d enf.</span>}
                            {p.diasAsuntoPropios > 0 && <span className="ausencia-pill ap">📌 {p.diasAsuntoPropios}d A.P.</span>}
                            {p.pendientes > 0 && <span className="ausencia-pill pend">⏳ {p.pendientes} pend.</span>}
                            {!p.totalSolicitudes && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Sin solicitudes</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}


        {/* ===== DOCUMENTOS ADMIN ===== */}
        {esAdmin && !modoEmpleado && vista === 'documentos' && (
          <div>
            <div className="stats-grid">
              <div className="stat-card stat-blue"><span className="stat-icon">📁</span><div><p className="stat-label">Total documentos</p><p className="stat-number">{documentosAdmin.length}</p></div></div>
              <div className="stat-card stat-amber"><span className="stat-icon">⏳</span><div><p className="stat-label">Pendientes de firma</p><p className="stat-number">{documentosAdmin.filter(d => d.estado === 'PENDIENTE').length}</p></div></div>
              <div className="stat-card stat-green"><span className="stat-icon">✅</span><div><p className="stat-label">Firmados</p><p className="stat-number">{documentosAdmin.filter(d => d.estado === 'FIRMADO').length}</p></div></div>
            </div>
            <div className="card">
              <h2>Subir documento a empleado</h2>
              <div className="form-row">
                <div className="form-group"><label>Empleado</label>
                  <select value={docNuevo.profesorId} onChange={e => setDocNuevo({ ...docNuevo, profesorId: e.target.value })}>
                    <option value="">— Seleccionar —</option>
                    {profesores.filter(p => p.role === 'PROFESOR').map(p => (
                      <option key={p.id} value={p.id}>{p.apellidos}, {p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group"><label>Tipo</label>
                  <select value={docNuevo.tipo} onChange={e => setDocNuevo({ ...docNuevo, tipo: e.target.value })}>
                    <option value="NOMINA">💰 Nómina</option>
                    <option value="CONTRATO">📋 Contrato</option>
                    <option value="CERTIFICADO">🏅 Certificado</option>
                    <option value="OTRO">📄 Otro</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Nombre del documento</label>
                  <input type="text" placeholder="Ej: Nómina Abril 2026" value={docNuevo.nombre} onChange={e => setDocNuevo({ ...docNuevo, nombre: e.target.value })} /></div>
                <div className="form-group"><label>Mes (opcional)</label>
                  <input type="month" value={docNuevo.mes} onChange={e => setDocNuevo({ ...docNuevo, mes: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Archivo PDF</label>
                <input type="file" accept="application/pdf" ref={docNuevoFileRef}
                  onChange={e => setDocNuevo({ ...docNuevo, file: e.target.files[0] || null })} /></div>
              <button onClick={subirDocAdmin} disabled={cargando} className="btn-primary">📤 Subir y notificar por email</button>
              <p className="form-hint">El empleado recibirá un email con enlace al documento.</p>
            </div>
            <div className="informe-tabs" style={{ marginBottom: '0.5rem' }}>
              <button className={`btn-tab${docFiltro === 'todos' ? ' active' : ''}`} onClick={() => setDocFiltro('todos')}>Todos ({documentosAdmin.length})</button>
              <button className={`btn-tab${docFiltro === 'pendientes' ? ' active' : ''}`} onClick={() => setDocFiltro('pendientes')}>⏳ Pendientes ({documentosAdmin.filter(d => d.estado === 'PENDIENTE').length})</button>
              <button className={`btn-tab${docFiltro === 'firmados' ? ' active' : ''}`} onClick={() => setDocFiltro('firmados')}>✓ Firmados ({documentosAdmin.filter(d => d.estado === 'FIRMADO').length})</button>
            </div>
            {documentosAdmin.length === 0
              ? <div className="card"><div className="empty-state"><p>📁 Sin documentos</p></div></div>
              : (() => {
                  const filtrados = documentosAdmin.filter(d =>
                    docFiltro === 'todos' ? true : docFiltro === 'pendientes' ? d.estado === 'PENDIENTE' : d.estado === 'FIRMADO'
                  );
                  if (!filtrados.length) return <div className="card"><div className="empty-state"><p>Sin documentos en esta categoría</p></div></div>;
                  const porEmpleado = {};
                  filtrados.forEach(d => {
                    if (!porEmpleado[d.profesorId]) porEmpleado[d.profesorId] = { nombre: d.profesorNombre || d.profesorId, docs: [] };
                    porEmpleado[d.profesorId].docs.push(d);
                  });
                  return Object.entries(porEmpleado).map(([pid, emp]) => (
                    <div key={pid} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ background: 'var(--primary)', color: 'white', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700 }}>{emp.nombre}</span>
                        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>— {emp.docs.length} doc{emp.docs.length !== 1 ? 's' : ''}</span>
                      </div>
                      {emp.docs.map((doc, idx) => (
                        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: idx < emp.docs.length - 1 ? '1px solid var(--border)' : 'none', background: doc.estado === 'FIRMADO' ? '#f0fdf4' : '#fffbeb', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{TIPO_DOC_ICON[doc.tipo] || '📄'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.nombre}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{TIPO_DOC_LABEL[doc.tipo] || doc.tipo}{doc.mes ? ` · ${doc.mes}` : ''} · {new Date(doc.createdAt).toLocaleDateString('es-ES')}</div>
                          </div>
                          <span className={`estado-badge ${doc.estado === 'FIRMADO' ? 'aprobado' : 'pendiente'}`} style={{ flexShrink: 0 }}>{doc.estado === 'FIRMADO' ? '✓ Firmado' : '⏳ Pendiente'}</span>
                          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                            <button type="button" className="btn-sm" onClick={() => abrirArchivo(doc.archivoUrl)}>↓ Original</button>
                            {doc.estado === 'FIRMADO' && doc.firmaUrl && (
                              <button type="button" className="btn-sm" style={{ background: '#16a34a', color: 'white', border: 'none' }} onClick={() => abrirArchivo(doc.firmaUrl)}>↓ Firmado</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ));
                })()
            }
          </div>
        )}

        {/* ===== USUARIOS (admin) ===== */}
        {esAdmin && !modoEmpleado && vista === 'usuarios' && (
          <div>
            <div className="toolbar">
              <input type="search" className="busqueda" aria-label="Buscar usuario" placeholder="Buscar por nombre o email"
                value={busquedaUsuario} onChange={e => setBusquedaUsuario(e.target.value)} />
              <button className="btn-primary" onClick={() => setNuevoUsuarioAbierto(a => !a)} aria-expanded={nuevoUsuarioAbierto}>
                {nuevoUsuarioAbierto ? 'Cerrar' : '+ Nuevo'}
              </button>
            </div>
            <div className="action-buttons">
              <button className="btn-sm" onClick={() => setImportarAbierto(a => !a)} aria-expanded={importarAbierto}><Icono n="mas1" size={18} /> Importar lista</button>
              <button className="btn-sm" onClick={invitarPendientes} disabled={!profesores.some(p => p.activo && !p.adheridoAt && p.id !== user?.id)}>
                <Icono n="enlace" size={18} /> Invitar a los pendientes ({profesores.filter(p => p.activo && !p.adheridoAt && p.id !== user?.id).length})
              </button>
            </div>
            {importarAbierto && <ImportarLista api={api} h={h} toast$={toast$} onTerminado={cargarProfesores} onCerrar={() => setImportarAbierto(false)} />}
            {nuevoUsuarioAbierto && <div className="card">
              <h2>Nuevo usuario</h2>
              <div className="form-row">
                <div className="form-group"><label>Nombre</label>
                  <input type="text" placeholder="Nombre" value={nuevoUsuario.nombre} onChange={e => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })} /></div>
                <div className="form-group"><label>{nuevoUsuario.role === 'ADMIN' ? 'Apellidos (opcional en cuentas de empresa)' : 'Apellidos'}</label>
                  <input type="text" placeholder="Apellidos" value={nuevoUsuario.apellidos} onChange={e => setNuevoUsuario({ ...nuevoUsuario, apellidos: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Email</label>
                  <input type="email" placeholder="correo@escuela.com" value={nuevoUsuario.email} onChange={e => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })} /></div>
                <div className="form-group"><label>Teléfono WhatsApp (opcional)</label>
                  <input type="tel" placeholder="+34612345678" value={nuevoUsuario.telefono} onChange={e => setNuevoUsuario({ ...nuevoUsuario, telefono: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Rol</label>
                  <select value={nuevoUsuario.role} onChange={e => setNuevoUsuario({ ...nuevoUsuario, role: e.target.value })}>
                    <option value="PROFESOR">Profesor</option>
                    {user?.esPrincipal && <option value="ADMIN">Administración</option>}
                  </select>
                </div>
                <div className="form-group"><label>Tipo de jornada</label>
                  <select value={nuevoUsuario.tipoJornada} onChange={e => setNuevoUsuario({ ...nuevoUsuario, tipoJornada: e.target.value })}>
                    <option value="COMPLETA">Jornada completa</option>
                    <option value="MEDIA_JORNADA">Media jornada</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Horas/semana</label>
                <input type="number" min="1" max="40" value={nuevoUsuario.horasContrato} onChange={e => setNuevoUsuario({ ...nuevoUsuario, horasContrato: parseInt(e.target.value) })} /></div>
              <button onClick={agregarUsuario} disabled={cargando} className="btn-primary">+ Crear usuario</button>
              <p className="form-hint">Se enviará un email con un enlace para entrar (sin contraseña).</p>
            </div>}

            <div className="card">
              <div className="card-header">
                <h2>Usuarios ({profesores.length})</h2>
                <button className="btn-sm" onClick={cargarProfesores}>↻ Actualizar</button>
              </div>
              <div className="profesores-grid">
                {profesores.filter(p => `${p.nombre} ${p.apellidos} ${p.email}`.toLowerCase().includes(busquedaUsuario.toLowerCase())).map(p => (
                  <div key={p.id} className={`profesor-card ${!p.activo ? 'inactivo' : ''}`}>
                    <div className="profesor-avatar">{(p.nombre?.[0] || '') + (p.apellidos?.[0] || '')}</div>
                    <div className="profesor-info">
                      <strong>{p.nombre} {p.apellidos}</strong>
                      <small>{p.email}</small>
                      {p.telefono && <small style={{ color: 'var(--success)' }}>📱 {p.telefono}</small>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                      <span className={`badge badge-${p.role === 'ADMIN' ? 'admin' : 'profesor'}`} style={{ fontSize: '0.68rem' }}>
                        {p.role === 'ADMIN' ? 'Admin' : 'Profesor'}
                      </span>
                      <span className={`badge-jornada badge ${p.tipoJornada === 'COMPLETA' ? 'completa' : 'media'}`}>
                        {p.tipoJornada === 'COMPLETA' ? `${p.horasContrato}h/sem` : 'Media'}
                      </span>
                      {!p.activo ? <span className="estado-badge rechazado">Inactivo</span>
                        : p.adheridoAt ? <span className="estado-badge aprobado">Activo</span>
                        : <span className="estado-badge pendiente">Invitado · sin entrar</span>}
                      {p.esPrincipal && <span className="badge badge-admin">Principal</span>}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '4px', flexWrap: 'wrap' }}>
                        <button className="btn-sm" onClick={() => {
                          setProfesorEditId(profesorEditId === p.id ? null : p.id);
                          setProfesorEditData({ nombre: p.nombre, apellidos: p.apellidos, tipoJornada: p.tipoJornada, horasContrato: p.horasContrato, telefono: p.telefono || '', horaRecordatorio: p.horaRecordatorio || '17:00', tarifaHora: p.tarifaHora ?? '', activo: p.activo });
                        }}>
                          {profesorEditId === p.id ? 'Cerrar' : <><Icono n="editar" size={18} /> Editar</>}
                        </button>
                        {p.activo && !p.adheridoAt && (
                          <button className="btn-sm" onClick={() => invitarUno(p)}><Icono n="enlace" size={18} /> Reenviar invitación</button>
                        )}
                        {user?.esPrincipal && !p.esPrincipal && p.activo && (
                          <button className="btn-sm" onClick={() => cambiarRol(p, p.role === 'ADMIN' ? 'PROFESOR' : 'ADMIN')}>
                            {p.role === 'ADMIN' ? 'Quitar administración' : 'Dar administración'}
                          </button>
                        )}
                        <button className="btn-sm btn-sm-bell" onClick={() => {
                          setNuevaNotif({ titulo: '', mensaje: '', tipo: 'INFO', destinatarioId: p.id });
                          setVista('avisos');
                        }} title="Enviar aviso personal">
                          <Icono n="campana" size={18} /> Aviso
                        </button>
                      </div>
                    </div>
                    {profesorEditId === p.id && (
                      <div className="profesor-edit-form">
                        <div className="form-row">
                          <div className="form-group"><label>Nombre</label>
                            <input type="text" value={profesorEditData.nombre || ''} onChange={e => setProfesorEditData({ ...profesorEditData, nombre: e.target.value })} /></div>
                          <div className="form-group"><label>Apellidos</label>
                            <input type="text" value={profesorEditData.apellidos || ''} onChange={e => setProfesorEditData({ ...profesorEditData, apellidos: e.target.value })} /></div>
                        </div>
                        <div className="form-row">
                          <div className="form-group"><label>Teléfono WhatsApp</label>
                            <input type="tel" placeholder="+34612345678" value={profesorEditData.telefono || ''} onChange={e => setProfesorEditData({ ...profesorEditData, telefono: e.target.value })} /></div>
                          <div className="form-group"><label>Hora recordatorio</label>
                            <input type="time" value={profesorEditData.horaRecordatorio || '17:00'} onChange={e => setProfesorEditData({ ...profesorEditData, horaRecordatorio: e.target.value })} /></div>
                        </div>
                        <div className="form-row">
                          <div className="form-group"><label>Tipo jornada</label>
                            <select value={profesorEditData.tipoJornada || 'COMPLETA'} onChange={e => setProfesorEditData({ ...profesorEditData, tipoJornada: e.target.value })}>
                              <option value="COMPLETA">Jornada completa</option>
                              <option value="MEDIA_JORNADA">Media jornada</option>
                            </select>
                          </div>
                          <div className="form-group"><label>Horas/semana</label>
                            <input type="number" min="1" max="40" value={profesorEditData.horasContrato || 35} onChange={e => setProfesorEditData({ ...profesorEditData, horasContrato: parseInt(e.target.value) })} /></div>
                        </div>
                        <div className="form-group"><label>Tarifa por hora de clase (€, opcional)</label>
                          <input type="number" min="0" step="0.5" placeholder="Ej. 18" value={profesorEditData.tarifaHora ?? ''} onChange={e => setProfesorEditData({ ...profesorEditData, tarifaHora: e.target.value })} /></div>
                        <div className="form-group">
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={profesorEditData.activo !== false} onChange={e => setProfesorEditData({ ...profesorEditData, activo: e.target.checked })} />
                            Usuario activo
                          </label>
                        </div>
                        <div className="action-buttons">
                          <button className="btn-approve" onClick={guardarEdicionProfesor} disabled={cargando}>Guardar cambios</button>
                          <button className="btn-ghost" onClick={() => setProfesorEditId(null)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Actividad de administración</h2>
                <button className="btn-sm" onClick={cargarAuditoria}>{auditoria ? 'Actualizar' : 'Ver registro'}</button>
              </div>
              {auditoria && (!auditoria.length ? <p className="form-hint">Sin actividad registrada.</p> : (
                <div className="resumen-list">
                  {auditoria.map(a => (
                    <div key={a.id} className="resumen-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                      <strong>{ETIQUETA_AUDITORIA[a.accion] || a.accion}{a.objetivoEmail ? ` · ${a.objetivoEmail}` : ''}</strong>
                      <small className="form-hint">{new Date(a.createdAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {a.actorEmail || 'sistema'}</small>
                    </div>
                  ))}
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ===== ZONAS (admin) ===== */}
        {esAdmin && !modoEmpleado && vista === 'zonas' && (
          <div>
            <div className="card">
              <h2>Nueva zona de fichaje</h2>
              <div className="form-row">
                <div className="form-group"><label>Nombre</label>
                  <input type="text" placeholder="Ej: Pista Principal" value={nuevaZona.nombre} onChange={e => setNuevaZona({ ...nuevaZona, nombre: e.target.value })} /></div>
                <div className="form-group"><label>Descripción</label>
                  <input type="text" placeholder="Opcional" value={nuevaZona.descripcion} onChange={e => setNuevaZona({ ...nuevaZona, descripcion: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Latitud (opcional)</label>
                  <input type="number" step="0.0001" placeholder="37.0907" value={nuevaZona.lat} onChange={e => setNuevaZona({ ...nuevaZona, lat: e.target.value })} /></div>
                <div className="form-group"><label>Longitud (opcional)</label>
                  <input type="number" step="0.0001" placeholder="-3.3869" value={nuevaZona.lng} onChange={e => setNuevaZona({ ...nuevaZona, lng: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Radio (metros)</label>
                  <input type="number" min="10" max="1000" value={nuevaZona.radio} onChange={e => setNuevaZona({ ...nuevaZona, radio: parseInt(e.target.value) })} /></div>
                <div className="form-group"><label>Modo de validación</label>
                  <select value={nuevaZona.validationMode} onChange={e => setNuevaZona({ ...nuevaZona, validationMode: e.target.value })}>
                    <option value="TOTP_GPS">QR + GPS (máxima seguridad)</option>
                    <option value="TOTP">Solo QR rotativo (sin GPS)</option>
                    <option value="GPS">Solo GPS</option>
                    <option value="NONE">Sin validación (pruebas)</option>
                  </select>
                </div>
              </div>
              <button onClick={agregarZona} disabled={cargando} className="btn-primary">+ Crear zona</button>
            </div>

            <div className="zonas-list">
              {zonasAdmin.map(zona => (
                <div key={zona.id} className="zona-card">
                  <div className="zona-card-header">
                    <div>
                      <strong className="zona-nombre">{zona.nombre}</strong>
                      {zona.descripcion && <span className="zona-desc">{zona.descripcion}</span>}
                      <div className="zona-meta">
                        {zona.lat != null && <span className="zona-coords">📍 {zona.lat}, {zona.lng} · {zona.radio}m</span>}
                        <span className={`mode-badge mode-${zona.validationMode.toLowerCase().replace('_', '-')}`}>
                          {zona.validationMode === 'TOTP_GPS' ? '🔐 QR+GPS' : zona.validationMode === 'TOTP' ? '🔑 QR rotativo' : zona.validationMode === 'GPS' ? '📡 GPS' : '🔓 Sin validación'}
                        </span>
                        <span className={`estado-badge ${zona.activa ? 'aprobado' : 'rechazado'}`}>{zona.activa ? 'Activa' : 'Inactiva'}</span>
                      </div>
                    </div>
                    <div className="zona-actions">
                      <button className="btn-sm" onClick={() => generarQRImagen(zona)}>🖨 Ver QR</button>
                      {qrGenerado[zona.id] && <button className="btn-sm" onClick={() => imprimirQR(zona.id)}>🖨 Imprimir</button>}
                      {nfcDisponible && (
                        <button className="btn-sm btn-nfc-write" onClick={() => escribirTagNFC(zona)} title="Programar un tag NFC con esta zona">📡 Grabar NFC</button>
                      )}
                      <button className="btn-sm btn-warn" onClick={() => regenerarSecretoZona(zona.id)}>🔄 Nuevo QR</button>
                      <button className="btn-sm btn-danger" onClick={() => eliminarZona(zona.id)}>✕</button>
                    </div>
                  </div>
                  {qrGenerado[zona.id] && (
                    <div className="qr-preview">
                      <img src={qrGenerado[zona.id].url} alt={`QR ${zona.nombre}`} />
                      <div className="qr-preview-info">
                        <p><strong>Zona:</strong> {zona.nombre}</p>
                        <p><strong>Validación:</strong> {zona.validationMode}</p>
                        <p className="qr-secret"><strong>Secreto:</strong> <code>{zona.secret}</code></p>
                        <p style={{ fontSize: '0.75rem', color: '#64748b' }}>El token cambia cada 30s.<br />Imprime y coloca en la zona física.</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== AVISOS (admin) ===== */}
        {esAdmin && !modoEmpleado && vista === 'avisos' && (
          <div>
            <div className="card">
              <h2>Nueva notificación</h2>
              <div className="form-row">
                <div className="form-group"><label>Destinatario</label>
                  <select value={nuevaNotif.destinatarioId} onChange={e => setNuevaNotif({ ...nuevaNotif, destinatarioId: e.target.value })}>
                    <option value="">Todos los empleados</option>
                    {profesores.filter(p => p.activo).map(p => (
                      <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group"><label>Tipo</label>
                  <select value={nuevaNotif.tipo} onChange={e => setNuevaNotif({ ...nuevaNotif, tipo: e.target.value })}>
                    <option value="INFO">ℹ️ Información</option>
                    <option value="AVISO">⚠️ Aviso</option>
                    <option value="ALERTA">🚨 Alerta</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Título</label>
                <input type="text" placeholder="Ej: Reunión mañana a las 9:00" value={nuevaNotif.titulo}
                  onChange={e => setNuevaNotif({ ...nuevaNotif, titulo: e.target.value })} />
              </div>
              <div className="form-group"><label>Mensaje</label>
                <textarea rows="4" placeholder="Escribe el mensaje completo..." value={nuevaNotif.mensaje}
                  onChange={e => setNuevaNotif({ ...nuevaNotif, mensaje: e.target.value })} />
              </div>
              <button className="btn-primary" onClick={enviarNotificacion} disabled={cargando}>
                {cargando ? <span className="btn-spinner" /> : '🔔 Enviar notificación'}
              </button>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2>Enviadas recientes</h2>
                <button className="btn-sm" onClick={cargarNotifAdmin}>↻ Actualizar</button>
              </div>
              {!notifAdmin.length ? (
                <div className="empty-state"><p>📭 Sin notificaciones enviadas</p></div>
              ) : (
                <div className="notif-admin-list">
                  {notifAdmin.map(n => (
                    <div key={n.id} className={`notif-admin-item notif-tipo-${n.tipo.toLowerCase()}${n.leida ? ' leida' : ''}`}>
                      <span className="notif-icono">
                        {n.tipo === 'ALERTA' ? '🚨' : n.tipo === 'AVISO' ? '⚠️' : 'ℹ️'}
                      </span>
                      <div className="notif-body">
                        <strong>{n.titulo}</strong>
                        <p className="notif-mensaje">{n.mensaje}</p>
                        <span className="notif-meta">
                          Para: <strong>{n.profesorNombre}</strong>
                          {' · '}{new Date(n.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {n.leida ? <span className="notif-leida-tag"> · Leída ✓</span> : <span className="notif-noleida-tag"> · No leída</span>}
                        </span>
                      </div>
                      <button className="btn-delete" onClick={() => eliminarNotifAdmin(n.id)} title="Eliminar">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== CONFIG ESCUELA (admin) ===== */}
        {esAdmin && !modoEmpleado && vista === 'config' && (
          <div>
            <div className="card">
              <h2>Datos de la escuela</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Esta información aparece en el encabezado de los informes PDF.
              </p>
              {configEscuela && (
                <>
                  <div className="form-row">
                    <div className="form-group"><label>Nombre de la escuela</label>
                      <input type="text" value={configEscuela.nombre}
                        onChange={e => setConfigEscuela({ ...configEscuela, nombre: e.target.value })} />
                    </div>
                    <div className="form-group"><label>CIF / NIF</label>
                      <input type="text" value={configEscuela.cif}
                        onChange={e => setConfigEscuela({ ...configEscuela, cif: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Dirección</label>
                      <input type="text" value={configEscuela.direccion}
                        onChange={e => setConfigEscuela({ ...configEscuela, direccion: e.target.value })} />
                    </div>
                    <div className="form-group"><label>Teléfono</label>
                      <input type="text" value={configEscuela.telefono}
                        onChange={e => setConfigEscuela({ ...configEscuela, telefono: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Email de contacto</label>
                      <input type="email" value={configEscuela.email}
                        onChange={e => setConfigEscuela({ ...configEscuela, email: e.target.value })} />
                    </div>
                    <div className="form-group config-color-group"><label>Color principal del informe PDF</label>
                      <div className="config-color-row">
                        <input type="color" value={configEscuela.colorPrimario}
                          onChange={e => setConfigEscuela({ ...configEscuela, colorPrimario: e.target.value })} />
                        <span className="config-color-hex">{configEscuela.colorPrimario}</span>
                        <div className="config-color-preview" style={{ background: configEscuela.colorPrimario }}>
                          Cabecera PDF
                        </div>
                      </div>
                    </div>
                  </div>
                  <button className="btn-primary" onClick={guardarConfig} disabled={cargando}>
                    {cargando ? <span className="btn-spinner" /> : '💾 Guardar configuración'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== MI PERFIL ===== */}
        {(!esAdmin || modoEmpleado) && vista === 'misclases' && (
          <VistaMisClases api={api} h={h} toast$={toast$} config={configEscuela} />
        )}
        {esAdmin && !modoEmpleado && vista === 'integraciones' && (
          <VistaIntegraciones api={api} h={h} toast$={toast$} />
        )}
        {esAdmin && !modoEmpleado && vista === 'clases' && (
          <VistaAdminClases api={api} h={h} toast$={toast$} config={configEscuela} />
        )}

        {vista === 'perfil' && (
          <div>
            {/* Cabecera de perfil */}
            <div className="card perfil-header-card">
              <div className="perfil-avatar-grande">{user?.nombre?.[0]}{user?.apellidos?.[0]}</div>
              <div className="perfil-datos-principales">
                <h2>{user?.nombre} {user?.apellidos}</h2>
                <p className="perfil-email">{user?.email}</p>
                <div className="perfil-badges">
                  <span className={`badge badge-${esAdmin ? 'admin' : 'profesor'}`}>{esAdmin ? '🛡 Admin' : '👤 Profesor'}</span>
                  <span className={`badge-jornada badge ${user?.tipoJornada === 'COMPLETA' ? 'completa' : 'media'}`}>
                    {user?.tipoJornada === 'COMPLETA' ? `Jornada completa · ${user?.horasContrato}h/sem` : 'Media jornada'}
                  </span>
                </div>
              </div>
              {pwaInstallEvent && (
                <button className="btn-pwa-perfil" onClick={instalarPWA}>
                  📱 Añadir a pantalla de inicio
                </button>
              )}
            </div>

            {/* Editar datos */}
            <div className="card">
              <div className="card-header">
                <h2>Datos personales</h2>
                {!perfilEdit && (
                  <button className="btn-sm" onClick={() => setPerfilEdit({
                    nombre: user?.nombre || '',
                    apellidos: user?.apellidos || '',
                    telefono: user?.telefono || '',
                    horaRecordatorio: user?.horaRecordatorio || '17:00',
                    avisosWhatsapp: !!user?.avisosWhatsapp,
                  })}>✏ Editar</button>
                )}
              </div>
              {perfilEdit ? (
                <div>
                  <div className="form-row">
                    <div className="form-group"><label>Nombre</label>
                      <input type="text" value={perfilEdit.nombre} onChange={e => setPerfilEdit({ ...perfilEdit, nombre: e.target.value })} /></div>
                    <div className="form-group"><label>Apellidos</label>
                      <input type="text" value={perfilEdit.apellidos} onChange={e => setPerfilEdit({ ...perfilEdit, apellidos: e.target.value })} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Teléfono WhatsApp (para recordatorios)</label>
                      <input type="tel" placeholder="+34612345678" value={perfilEdit.telefono} onChange={e => setPerfilEdit({ ...perfilEdit, telefono: e.target.value })} /></div>
                    <div className="form-group">
                      <label>Hora recordatorio de salida</label>
                      <input type="time" value={perfilEdit.horaRecordatorio} onChange={e => setPerfilEdit({ ...perfilEdit, horaRecordatorio: e.target.value })} />
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Recibirás una notificación a esta hora si sigues fichado</small>
                    </div>
                  </div>
                  {configEscuela?.whatsappActivo && (
                    <label className="opcion" style={{ marginBottom: 12 }}>
                      <input type="checkbox" checked={!!perfilEdit.avisosWhatsapp} onChange={e => setPerfilEdit({ ...perfilEdit, avisosWhatsapp: e.target.checked })} />
                      <span><strong>Recibir avisos por WhatsApp</strong><small>Respuestas a tus solicitudes, revisión de horas y recordatorios. Necesita tu teléfono con prefijo. Puedes desactivarlo cuando quieras.</small></span>
                    </label>
                  )}
                  <div className="action-buttons">
                    <button className="btn-approve" onClick={guardarPerfil} disabled={cargando}>Guardar cambios</button>
                    <button className="btn-ghost" onClick={() => setPerfilEdit(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="perfil-info-list">
                  <div className="perfil-info-row"><span>Nombre completo</span><strong>{user?.nombre} {user?.apellidos}</strong></div>
                  <div className="perfil-info-row"><span>Email</span><strong>{user?.email}</strong></div>
                  <div className="perfil-info-row"><span>Teléfono WhatsApp</span><strong>{user?.telefono || <em style={{ color: 'var(--text-muted)' }}>No configurado</em>}</strong></div>
                  {configEscuela?.whatsappActivo && <div className="perfil-info-row"><span>Avisos por WhatsApp</span><strong>{user?.avisosWhatsapp ? '✓ Activados' : 'Desactivados'}</strong></div>}
                  <div className="perfil-info-row"><span>Recordatorio de salida</span><strong>{user?.horaRecordatorio || '17:00'}</strong></div>
                  <div className="perfil-info-row"><span>Notificaciones</span>
                    <strong>
                      {'Notification' in window
                        ? Notification.permission === 'granted' ? '✓ Activadas' : Notification.permission === 'denied' ? '✗ Bloqueadas' : 'Sin configurar'
                        : 'No soportado'}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Privacidad: derecho de acceso y portabilidad (RGPD) */}
            <div className="card">
              <h2>Mis datos</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Descarga una copia de todos tus datos personales guardados en la plataforma (perfil, fichajes, clases, solicitudes y avisos).
              </p>
              <div className="action-buttons">
                <button className="btn-primary" style={{ width: 'auto' }} onClick={exportarMisDatos}>⬇ Exportar mis datos</button>
                <button className="btn-sm" onClick={() => setVerPrivacidad(true)}>Ver información de privacidad</button>
              </div>
            </div>

            {/* Activar notificaciones si no están activas */}
            {'Notification' in window && Notification.permission !== 'granted' && (
              <div className="card">
                <h2>Activar notificaciones</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Las notificaciones del navegador te avisarán cuando sea hora de fichar la salida.</p>
                <button className="btn-primary" style={{ width: 'auto' }} onClick={() => Notification.requestPermission().then(p => { if (p === 'granted') toast$('Notificaciones activadas ✓', 'success'); })}>
                  🔔 Activar notificaciones
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {toast && <div className={`toast toast-${toast.tipo}`}>{toast.msg}</div>}
      {cargando && <div className="loading-overlay"><div className="spinner" /></div>}
    </div>
  );
}

export default App;
