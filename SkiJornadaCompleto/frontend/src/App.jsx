import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { generarPDFRegistro } from './pdfRegistro';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
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
  const [token, setToken]   = useState(localStorage.getItem('token'));
  const [user,  setUser]    = useState(() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } });
  const [vista, setVista]   = useState('dashboard');
  const [modoEmpleado, setModoEmpleado] = useState(false);
  const [toast, setToast]   = useState(null);
  const [cargando, setCargando] = useState(false);

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
  const [cambioPass, setCambioPass] = useState({ actual: '', nueva: '', confirmar: '' });

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
  const [profesores, setProfesores]                 = useState([]);
  const [zonasAdmin, setZonasAdmin]                 = useState([]);
  const [informeMensual, setInformeMensual]         = useState(null);
  const [informeAusencias, setInformeAusencias]     = useState(null);
  const [profesorInforme, setProfesorInforme]       = useState('');
  const [documentosAdmin, setDocumentosAdmin]       = useState([]);
  const [docFiltro, setDocFiltro]                   = useState('todos');
  const [pdfIncluirExtras, setPdfIncluirExtras]     = useState(false);
  const [whatsappStatus, setWhatsappStatus]         = useState(null);
  const [presencia, setPresencia]                   = useState(null);

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

  useEffect(() => {
    if (token && user) {
      cargarHistorial(); cargarSolicitudes(); cargarMisDocumentos();
      if (user.role === 'ADMIN') {
        cargarAdminSolicitudes(); cargarProfesores(); cargarZonasAdmin(); cargarDocumentosAdmin();
        api.get('/api/whatsapp/status', { headers: h() }).then(r => setWhatsappStatus(r.data)).catch(() => {});
      }
    }
  }, [token]);

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
      cargarAdminSolicitudes(); cargarSolicitudes(); setObservacion(''); setSolicitudSeleccionada(null);
    } catch { toast$('Error al procesar', 'error'); }
    finally { setCargando(false); }
  };

  const agregarUsuario = async () => {
    if (!nuevoUsuario.nombre || !nuevoUsuario.apellidos || !nuevoUsuario.email) {
      toast$('Nombre, apellidos y email son obligatorios', 'warning'); return;
    }
    setCargando(true);
    try {
      await api.post('/api/admin/profesores', nuevoUsuario, { headers: h() });
      toast$('Usuario creado. Se ha enviado email de bienvenida.', 'success', 5000);
      cargarProfesores();
      setNuevoUsuario({ nombre: '', apellidos: '', email: '', tipoJornada: 'COMPLETA', horasContrato: 35, role: 'PROFESOR', telefono: '' });
    } catch (err) { toast$(err.response?.data?.error || 'Error al crear usuario', 'error'); }
    finally { setCargando(false); }
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
      localStorage.setItem('user', JSON.stringify(newUser));
      toast$('Perfil actualizado correctamente', 'success');
      setPerfilEdit(null);
    } catch (err) { toast$(err.response?.data?.error || 'Error al actualizar perfil', 'error'); }
    finally { setCargando(false); }
  };

  const cambiarPassword = async () => {
    if (!cambioPass.actual || !cambioPass.nueva) { toast$('Rellena todos los campos', 'warning'); return; }
    if (cambioPass.nueva !== cambioPass.confirmar) { toast$('Las contraseñas no coinciden', 'warning'); return; }
    if (cambioPass.nueva.length < 6) { toast$('La contraseña debe tener al menos 6 caracteres', 'warning'); return; }
    setCargando(true);
    try {
      await api.put('/api/auth/cambiar-password', { passwordActual: cambioPass.actual, passwordNueva: cambioPass.nueva }, { headers: h() });
      toast$('Contraseña cambiada correctamente', 'success');
      setCambioPass({ actual: '', nueva: '', confirmar: '' });
    } catch (err) { toast$(err.response?.data?.error || 'Error al cambiar contraseña', 'error'); }
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

  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setToken(null); setUser(null); };

  // ===== ESTADO ACTUAL =====
  const hoy = fechaLocal(horaActual);
  const registrosHoy   = historial[hoy] || [];
  const estadoFichaje  = registrosHoy[registrosHoy.length - 1]?.tipo || null;
  const esAdmin        = user?.role === 'ADMIN';
  const totalHoras     = Object.values(resumenDiario).reduce((s, d) => s + d.horas, 0).toFixed(1);
  const adminPendientes = adminSolicitudes.filter(s => s.estado === 'PENDIENTE').length;
  const docsPendientes  = documentosAdmin.filter(d => d.estado === 'PENDIENTE').length;
  const misDocsPendientes = misDocumentos.filter(d => d.estado === 'PENDIENTE').length;

  // ===== NAVEGACIÓN =====
  const navItems = esAdmin && !modoEmpleado
    ? [
        { id: 'dashboard',  icon: '📊', label: 'Panel' },
        { id: 'presencia',  icon: '🟢', label: 'Presencia' },
        { id: 'gestionar',  icon: '✅', label: 'Solicitudes', badge: adminPendientes },
        { id: 'informes',   icon: '📄', label: 'Informes' },
        { id: 'documentos', icon: '📁', label: 'Documentos', badge: docsPendientes },
        { id: 'usuarios',   icon: '👥', label: 'Usuarios' },
        { id: 'zonas',      icon: '📍', label: 'Zonas' },
        { id: 'perfil',     icon: '⚙️', label: 'Mi Perfil' },
      ]
    : [
        ...(!esAdmin ? [{ id: 'dashboard', icon: '📊', label: 'Dashboard' }] : []),
        { id: 'fichar',     icon: '🕐', label: 'Fichar' },
        { id: 'solicitar',  icon: '📅', label: 'Días Libres' },
        { id: 'informes',   icon: '📄', label: 'Mis Informes' },
        { id: 'documentos', icon: '📁', label: 'Mis Docs', badge: misDocsPendientes },
        { id: 'perfil',     icon: '⚙️', label: 'Mi Perfil' },
      ];

  // ===== LOGIN =====
  if (!token) {
    const handleLogin = async (e) => {
      e.preventDefault(); setCargando(true);
      try {
        const res = await api.post('/api/auth/login', { email: e.target.email.value, password: e.target.password.value });
        localStorage.setItem('token', res.data.token); localStorage.setItem('user', JSON.stringify(res.data.user));
        setToken(res.data.token); setUser(res.data.user);
      } catch (err) { toast$(err.response?.data?.error || 'Error al iniciar sesión', 'error'); }
      finally { setCargando(false); }
    };
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">⛷️</div>
          <h1>Ski Jornada</h1>
          <p className="login-subtitle">Control de jornada laboral</p>
          <form onSubmit={handleLogin}>
            <div className="form-group"><label>Correo electrónico</label>
              <input type="email" name="email" placeholder="usuario@escuela.com" required /></div>
            <div className="form-group"><label>Contraseña</label>
              <input type="password" name="password" placeholder="••••••••" required /></div>
            <button type="submit" className="btn-primary" disabled={cargando}>
              {cargando ? <span className="btn-spinner" /> : 'Iniciar sesión'}
            </button>
          </form>
          {pwaInstallEvent && (
            <button className="btn-pwa-login" onClick={instalarPWA}>
              📱 Añadir a pantalla de inicio
            </button>
          )}
          <div className="login-demo">
            <p>Acceso de prueba</p>
            <code>profesor@escuela.com · ski123</code>
            <code>admin@escuela.com · ski123</code>
          </div>
        </div>
        {toast && <div className={`toast toast-${toast.tipo}`}>{toast.msg}</div>}
        {cargando && <div className="loading-overlay"><div className="spinner" /></div>}
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div className="header-content">
          <div className="header-brand">
            <span className="header-logo">⛷️</span>
            <h1>Ski Jornada</h1>
          </div>
          <div className="user-info">
            {/* Live timer en header cuando está fichado */}
            {estadoFichaje === 'ENTRADA' && tiempoFichado !== null && (
              <div className="header-timer">
                <span className="timer-dot">●</span>
                <span className="timer-value">{formatTiempo(tiempoFichado)}</span>
              </div>
            )}
            {estadoFichaje && (
              <span className={`fichaje-status ${estadoFichaje.toLowerCase()}`}>
                {estadoFichaje === 'ENTRADA' ? '● Dentro' : '○ Fuera'}
              </span>
            )}
            <span className="user-name">{user?.nombre} {user?.apellidos}</span>
            <span className={`badge badge-${esAdmin ? 'admin' : 'profesor'}`}>{esAdmin ? '🛡 Admin' : '👤 Emp.'}</span>
            {esAdmin && (
              <button
                className={`btn-modo ${modoEmpleado ? 'btn-modo-active' : ''}`}
                onClick={() => { setModoEmpleado(m => !m); setVista(modoEmpleado ? 'dashboard' : 'fichar'); }}
                title={modoEmpleado ? 'Volver al panel de administración' : 'Cambiar a modo empleado para fichar'}
              >
                {modoEmpleado ? '🛡 Admin' : '🕐 Fichar'}
              </button>
            )}
            {pwaInstallEvent && (
              <button className="btn-pwa" onClick={instalarPWA} title="Instalar en pantalla de inicio">📱</button>
            )}
            <button onClick={logout} className="btn-logout">Salir</button>
          </div>
        </div>
      </header>

      <nav>
        {navItems.map(item => (
          <button key={item.id} className={vista === item.id ? 'active' : ''}
            onClick={() => {
              setVista(item.id);
              if (item.id === 'informes') { setInformeMensual(null); setInformeAusencias(null); }
              if (item.id === 'presencia') cargarPresencia();
              if (item.id === 'documentos' && esAdmin && !modoEmpleado) cargarDocumentosAdmin();
              if (item.id === 'documentos' && (!esAdmin || modoEmpleado)) cargarMisDocumentos();
            }}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>

      <main>

        {/* ===== DASHBOARD ADMIN ===== */}
        {esAdmin && !modoEmpleado && vista === 'dashboard' && (
          <div>
            <div className="stats-grid">
              <div className="stat-card stat-blue"><span className="stat-icon">👥</span><div>
                <p className="stat-label">Empleados activos</p>
                <p className="stat-number">{profesores.filter(p => p.activo !== false).length}</p></div></div>
              <div className="stat-card stat-amber"><span className="stat-icon">✅</span><div>
                <p className="stat-label">Solicitudes pendientes</p>
                <p className="stat-number">{adminPendientes}</p></div></div>
              <div className="stat-card stat-red"><span className="stat-icon">📁</span><div>
                <p className="stat-label">Docs pendientes firma</p>
                <p className="stat-number">{docsPendientes}</p></div></div>
            </div>
            {adminPendientes > 0 && (
              <div className="card">
                <div className="card-header">
                  <h2>Solicitudes pendientes</h2>
                  <button className="btn-sm" onClick={() => setVista('gestionar')}>Ver todas →</button>
                </div>
                <div className="solicitudes-list">
                  {adminSolicitudes.filter(s => s.estado === 'PENDIENTE').slice(0, 3).map(sol => (
                    <div key={sol.id} className="solicitud-item estado-pendiente">
                      <div className="solicitud-header">
                        <span className="solicitud-fechas"><strong>{sol.profesorNombre}</strong> · {new Date(sol.fechaInicio).toLocaleDateString('es-ES')} → {new Date(sol.fechaFin).toLocaleDateString('es-ES')}</span>
                        <span className="estado-badge pendiente">{sol.motivo.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {docsPendientes > 0 && (
              <div className="card">
                <div className="card-header">
                  <h2>Documentos pendientes de firma</h2>
                  <button className="btn-sm" onClick={() => { setVista('documentos'); setDocFiltro('pendientes'); }}>Ver todos →</button>
                </div>
                <div className="solicitudes-list">
                  {documentosAdmin.filter(d => d.estado === 'PENDIENTE').slice(0, 5).map(doc => (
                    <div key={doc.id} className="solicitud-item estado-pendiente">
                      <div className="solicitud-header">
                        <span className="solicitud-fechas">
                          {TIPO_DOC_ICON[doc.tipo] || '📄'} <strong>{doc.profesorNombre}</strong> — {doc.nombre}
                          {doc.mes && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {doc.mes}</span>}
                        </span>
                        <span className="estado-badge pendiente">Pendiente</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {adminPendientes === 0 && docsPendientes === 0 && (
              <div className="card"><div className="empty-state"><p>✅ Todo al día</p><small>No hay solicitudes ni documentos pendientes</small></div></div>
            )}
          </div>
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
            <div className="stats-grid">
              <div className="stat-card stat-blue"><span className="stat-icon">⏱</span><div>
                <p className="stat-label">Total horas</p><p className="stat-number">{totalHoras}h</p></div></div>
              <div className="stat-card stat-green"><span className="stat-icon">📆</span><div>
                <p className="stat-label">Días trabajados</p><p className="stat-number">{Object.keys(resumenDiario).length}</p></div></div>
              <div className="stat-card stat-amber"><span className="stat-icon">📋</span><div>
                <p className="stat-label">Solicitudes pendientes</p>
                <p className="stat-number">{solicitudes.filter(s => s.estado === 'PENDIENTE').length}</p></div></div>
            </div>
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
                {estadoFichaje === 'ENTRADA' && tiempoFichado !== null && (
                  <div className="timer-banner">
                    <span className="timer-dot">●</span>
                    Tiempo trabajado hoy: <strong>{formatTiempo(tiempoFichado)}</strong>
                  </div>
                )}
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
                  <button className="btn-ghost scanner-stop" onClick={detenerScanner}>✕ Cerrar cámara</button>
                </div>
              ) : (
                <>
                  <div className="scan-buttons">
                    <button className="btn-scan" onClick={iniciarScanner}>📷 Escanear QR con cámara</button>
                    {nfcDisponible && (
                      <button className={`btn-scan btn-nfc ${nfcActivo ? 'active' : ''}`} onClick={iniciarNFC}>
                        {nfcActivo ? '📡 Esperando NFC...' : '📡 Leer tag NFC'}
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
                  <option value="VACACIONES">🌴 Vacaciones</option>
                  <option value="ASUNTO_PROPIO">📌 Asunto propio</option>
                  <option value="ENFERMEDAD">🏥 Enfermedad</option>
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
              <div className="informe-selector">
                <h2>Mi registro de jornada</h2>
                <div className="mes-selector">
                  <input type="month" value={mesInforme} onChange={e => setMesInforme(e.target.value)} />
                  <button className="btn-primary" onClick={() => cargarInforme('')} style={{ width: 'auto', padding: '0.5rem 1.25rem', marginTop: 0 }}>Ver</button>
                </div>
              </div>
            </div>
            {informeMensual && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <h2 style={{ marginBottom: 0 }}>{informeMensual.mes}</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={pdfIncluirExtras} onChange={e => setPdfIncluirExtras(e.target.checked)} />
                      Incluir horas extra en el PDF
                    </label>
                    <button className="btn-download" onClick={() => generarPDFRegistro(informeMensual, { incluirExtras: pdfIncluirExtras })}>⬇ Descargar PDF oficial</button>
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
                        <a href={`${API_BASE}${doc.archivoUrl}`} target="_blank" rel="noreferrer" className="btn-sm">↓ Ver original</a>
                        {doc.estado === 'FIRMADO' && doc.firmaUrl && (
                          <a href={`${API_BASE}${doc.firmaUrl}`} target="_blank" rel="noreferrer"
                            className="btn-sm" style={{ background: 'var(--success)', color: 'white', border: 'none' }}>↓ Ver firmado</a>
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
        {esAdmin && !modoEmpleado && vista === 'informes' && (
          <div>
            <div className="informe-tabs">
              <button className="btn-tab active" onClick={() => { setInformeAusencias(null); }}>📊 Registro horario</button>
              <button className="btn-tab" onClick={() => { setInformeMensual(null); cargarInformeAusencias(); }}>📅 Ausencias</button>
            </div>
            {!informeAusencias && (
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
            )}
            {informeMensual && !informeAusencias && (
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
                    <button className="btn-download" onClick={() => generarPDFRegistro(informeMensual, { incluirExtras: pdfIncluirExtras })}>⬇ Descargar PDF oficial</button>
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
            {informeAusencias && (
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
        )}

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
                            <a href={`${API_BASE}${doc.archivoUrl}`} target="_blank" rel="noreferrer" className="btn-sm">↓ Original</a>
                            {doc.estado === 'FIRMADO' && doc.firmaUrl && (
                              <a href={`${API_BASE}${doc.firmaUrl}`} target="_blank" rel="noreferrer" className="btn-sm" style={{ background: '#16a34a', color: 'white', border: 'none' }}>↓ Firmado</a>
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
            <div className="card">
              <h2>Nuevo usuario</h2>
              <div className="form-row">
                <div className="form-group"><label>Nombre</label>
                  <input type="text" placeholder="Nombre" value={nuevoUsuario.nombre} onChange={e => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })} /></div>
                <div className="form-group"><label>Apellidos</label>
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
                    <option value="PROFESOR">👤 Profesor</option>
                    <option value="ADMIN">🛡 Administrador</option>
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
              <p className="form-hint">Se enviará un email de bienvenida con las credenciales (contraseña inicial: ski123).</p>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Usuarios ({profesores.length})</h2>
                <button className="btn-sm" onClick={cargarProfesores}>↻ Actualizar</button>
              </div>
              <div className="profesores-grid">
                {profesores.map(p => (
                  <div key={p.id} className={`profesor-card ${!p.activo ? 'inactivo' : ''}`}>
                    <div className="profesor-avatar">{p.nombre[0]}{p.apellidos[0]}</div>
                    <div className="profesor-info">
                      <strong>{p.nombre} {p.apellidos}</strong>
                      <small>{p.email}</small>
                      {p.telefono && <small style={{ color: 'var(--success)' }}>📱 {p.telefono}</small>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                      <span className={`badge badge-${p.role === 'ADMIN' ? 'admin' : 'profesor'}`} style={{ fontSize: '0.68rem' }}>
                        {p.role === 'ADMIN' ? '🛡 Admin' : '👤 Prof'}
                      </span>
                      <span className={`badge-jornada badge ${p.tipoJornada === 'COMPLETA' ? 'completa' : 'media'}`}>
                        {p.tipoJornada === 'COMPLETA' ? `${p.horasContrato}h/sem` : 'Media'}
                      </span>
                      {!p.activo && <span className="estado-badge rechazado">Inactivo</span>}
                      <button className="btn-sm" style={{ marginTop: '4px' }} onClick={() => {
                        setProfesorEditId(profesorEditId === p.id ? null : p.id);
                        setProfesorEditData({ nombre: p.nombre, apellidos: p.apellidos, tipoJornada: p.tipoJornada, horasContrato: p.horasContrato, telefono: p.telefono || '', horaRecordatorio: p.horaRecordatorio || '17:00', activo: p.activo });
                      }}>
                        {profesorEditId === p.id ? '✕ Cerrar' : '✏ Editar'}
                      </button>
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

            {/* Estado WhatsApp */}
            {whatsappStatus && (
              <div className="card">
                <h2>WhatsApp Baileys</h2>
                {!whatsappStatus.enabled ? (
                  <p style={{ color: 'var(--text-muted)' }}>WhatsApp deshabilitado. Añade <code>WHATSAPP_ENABLED=true</code> al .env e instala: <code>npm install @whiskeysockets/baileys</code></p>
                ) : whatsappStatus.connected ? (
                  <p style={{ color: 'var(--success)' }}>✓ Conectado — recordatorios automáticos activos</p>
                ) : (
                  <div>
                    <p style={{ color: 'var(--warning)' }}>⚠ No conectado. Escanea el QR desde tu teléfono:</p>
                    <a href={`${API_BASE}/api/whatsapp/qr`} target="_blank" rel="noreferrer" className="btn-sm">Ver QR de conexión →</a>
                  </div>
                )}
              </div>
            )}
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

        {/* ===== MI PERFIL ===== */}
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

            {/* Cambiar contraseña */}
            <div className="card">
              <h2>Cambiar contraseña</h2>
              <div className="form-group"><label>Contraseña actual</label>
                <input type="password" value={cambioPass.actual} onChange={e => setCambioPass({ ...cambioPass, actual: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-group"><label>Nueva contraseña</label>
                  <input type="password" value={cambioPass.nueva} onChange={e => setCambioPass({ ...cambioPass, nueva: e.target.value })} /></div>
                <div className="form-group"><label>Confirmar nueva</label>
                  <input type="password" value={cambioPass.confirmar} onChange={e => setCambioPass({ ...cambioPass, confirmar: e.target.value })} /></div>
              </div>
              <button className="btn-primary" style={{ width: 'auto' }} onClick={cambiarPassword} disabled={cargando}>
                Cambiar contraseña
              </button>
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
