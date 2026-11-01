// Zona horaria del negocio: fechas y horas de los informes de jornada (el servidor suele estar en UTC)
process.env.TZ = process.env.TZ || 'Europe/Madrid';
const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt     = require('bcryptjs');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { PrismaClient } = require('@prisma/client');
const legal = require('./legal');

dotenv.config();

// ---- Validación del entorno: en producción se aborta ante configuraciones inseguras ----
const ES_PROD = process.env.NODE_ENV === 'production';
(function validarEntorno() {
  const fallos = [], avisos = [];
  if (!process.env.JWT_SECRET) fallos.push('Falta JWT_SECRET.');
  else if (ES_PROD && process.env.JWT_SECRET.length < 32) fallos.push('JWT_SECRET debe tener al menos 32 caracteres (usa `openssl rand -hex 32`).');
  if (ES_PROD && process.env.PASSWORD_LOGIN === 'true') fallos.push('PASSWORD_LOGIN=true no está permitido en producción.');
  if (ES_PROD && !/^https:\/\//.test((process.env.FRONTEND_URL || '').split(',')[0].trim())) fallos.push('FRONTEND_URL debe ser una URL https en producción.');
  if (ES_PROD && !process.env.DATABASE_URL) fallos.push('Falta DATABASE_URL.');
  if (ES_PROD && !process.env.RESEND_API_KEY && !(process.env.SMTP_USER && process.env.SMTP_PASS)) avisos.push('Sin proveedor de correo (RESEND_API_KEY o SMTP): no se podrán enviar enlaces de acceso.');
  avisos.forEach(a => console.warn('⚠️ ', a));
  if (fallos.length) { fallos.forEach(f => console.error('❌', f)); console.error('Abortando: revisa las variables de entorno.'); process.exit(1); }
})();
const prisma = new PrismaClient();
const app = express();
app.set('trust proxy', 1); // detrás del proxy de Railway (IP real para el rate limit)

// ============ SECURITY ============
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(o => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use('/api/firma/enviar-email', express.json({ limit: '15mb' }));
app.use(express.json({ limit: '2mb' }));

// Red de seguridad general por IP (alto: un equipo entero suele compartir la IP de la wifi)
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 3000, standardHeaders: true, legacyHeaders: false, skip: req => req.path === '/salud', message: { error: 'Demasiadas peticiones. Esperá unos minutos.' } }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  standardHeaders: true, legacyHeaders: false,
});

// ============ UPLOADS ============
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
['firmas', 'documentos'].forEach(d => fs.mkdirSync(path.join(UPLOAD_DIR, d), { recursive: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = req.path.includes('firma') || req.baseUrl.includes('firma') ? 'firmas' : 'documentos';
    cb(null, path.join(UPLOAD_DIR, sub));
  },
  filename: (req, file, cb) => {
    // Sin extensión del cliente: la definitiva se pone tras comprobar el contenido (verificarArchivo)
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.subiendo`);
  },
});

// Detecta el tipo real por los primeros bytes. Solo PDF, PNG y JPEG.
function tipoPorContenido(ruta) {
  const fd = fs.openSync(ruta, 'r');
  try {
    const b = Buffer.alloc(8);
    fs.readSync(fd, b, 0, 8, 0);
    if (b.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
    if (b.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
    return null;
  } finally { fs.closeSync(fd); }
}
// Middleware tras multer: valida el contenido y fija la extensión (evita servir HTML/SVG/JS subido como «PDF»)
const verificarArchivo = permitidos => (req, res, next) => {
  if (!req.file) return next();
  try {
    const tipo = tipoPorContenido(req.file.path);
    if (!tipo || !permitidos.includes(tipo)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `El archivo no es válido: solo se admite ${permitidos.map(t => t.toUpperCase()).join(', ')}` });
    }
    const nuevo = req.file.filename.replace(/\.subiendo$/, `.${tipo}`);
    fs.renameSync(req.file.path, path.join(path.dirname(req.file.path), nuevo));
    req.file.filename = nuevo; req.file.path = path.join(path.dirname(req.file.path), nuevo);
    next();
  } catch (e) { console.error('verificarArchivo:', e.message); try { fs.unlinkSync(req.file.path); } catch {} res.status(400).json({ error: 'No se pudo procesar el archivo' }); }
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF'));
  },
});

// Para firmas de canvas (acepta PDF e imágenes)
const uploadFirma = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato no permitido'));
  },
});


// ============ EMAIL ============
const SMTP_OK = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const RESEND_KEY = process.env.RESEND_API_KEY;
const EMAIL_OK = !!RESEND_KEY || SMTP_OK;

async function enviarEmail(to, subject, html, attachments = []) {
  const from = process.env.EMAIL_FROM || 'Ski Jornada <no-reply@skijornada.com>';
  if (RESEND_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject, html,
        attachments: attachments.map(a => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
        })),
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    console.log(`📧 Enviado (Resend) → ${to}`);
    return;
  }
  if (!SMTP_OK) {
    console.log(`📧 [SIMULADO] → ${to}: ${subject}`);
    return;
  }
  await emailTransporter.sendMail({ from, to, subject, html, attachments });
  console.log(`📧 Enviado → ${to}`);
}

// ============ TOTP ============
function generarSecretoZona() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function calcularTOTP(secret, period = 30) {
  const counter = Math.floor(Date.now() / 1000 / period);
  return crypto.createHash('sha256').update(`${secret}:${counter}`).digest('hex').slice(0, 6).toUpperCase();
}

function validarTOTP(secret, token, period = 30) {
  const counter = Math.floor(Date.now() / 1000 / period);
  for (let i = -1; i <= 1; i++) {
    const expected = crypto.createHash('sha256')
      .update(`${secret}:${counter + i}`).digest('hex').slice(0, 6).toUpperCase();
    if (expected === token.toUpperCase()) return true;
  }
  return false;
}

// ============ HELPERS ============
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcularHorasMs(registrosDia) {
  let ms = 0, entradaTs = null;
  registrosDia.forEach(r => {
    if (r.tipo === 'ENTRADA') entradaTs = r.timestamp.getTime();
    else if (r.tipo === 'SALIDA' && entradaTs) { ms += r.timestamp.getTime() - entradaTs; entradaTs = null; }
  });
  return ms;
}

function fechaLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ============ MIDDLEWARE ============
// La sesión (JWT) identifica al usuario, pero cada petición se contrasta con la base: una baja o un cambio de rol
// surten efecto de inmediato (caché de 10 s por usuario, que se invalida al editar).
const _cacheUsuarios = new Map();
async function usuarioVigente(id) {
  const c = _cacheUsuarios.get(id);
  if (c && Date.now() - c.at < 10000) return c.u;
  const u = await prisma.profesor.findUnique({ where: { id }, select: { id: true, email: true, role: true, activo: true, esPrincipal: true } });
  _cacheUsuarios.set(id, { at: Date.now(), u });
  return u;
}
const invalidarUsuario = id => _cacheUsuarios.delete(id);

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Token inválido' }); }
  try {
    const u = await usuarioVigente(payload.userId);
    if (!u || !u.activo) return res.status(401).json({ error: 'Cuenta desactivada o inexistente' });
    req.user = { userId: u.id, email: u.email, role: u.role, esPrincipal: u.esPrincipal };
    // Una cuenta de colaborador solo llega a su propio portal, a sus avisos y a lo básico de la sesión
    if (u.role === 'COLABORADOR' && !/^\/api\/(auth|colaborador|notificaciones|config|legal)(\/|$)/.test(req.originalUrl.split('?')[0]))
      return res.status(403).json({ error: 'No autorizado para esta cuenta' });
    next();
  } catch {
    // Un fallo temporal de la base NO es una sesión inválida: con 401 el móvil cerraría la sesión del profesor
    res.status(503).json({ error: 'Servicio no disponible, reintenta en unos segundos' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Requiere permisos de administrador' });
  next();
};

// ============ ARCHIVOS (protegidos) ============
// Los PDFs (nóminas, contratos, firmas) solo los ve el administrador o el profesor dueño.
app.get('/uploads/:sub/:file', auth, async (req, res) => {
  try {
    const { sub, file } = req.params;
    if (!['documentos', 'firmas'].includes(sub) || !/^[\w.-]+$/.test(file)) return res.status(400).json({ error: 'Archivo inválido' });
    if (req.user.role !== 'ADMIN') {
      const campo = sub === 'documentos' ? 'archivoPath' : 'firmaPath';
      const doc = await prisma.documentoLegajo.findFirst({ where: { [campo]: file, profesorId: req.user.userId } });
      const reg = sub === 'firmas' && !doc
        ? await prisma.firmaRegistro.findFirst({ where: { pdfFirmadoPath: file, profesorId: req.user.userId } })
        : null;
      if (!doc && !reg) return res.status(403).json({ error: 'No autorizado' });
    }
    const ruta = path.join(UPLOAD_DIR, sub, file);
    if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'Archivo no encontrado' });
    // Tipo fijado por la extensión validada al subir; cualquier otra cosa (p. ej. archivos antiguos) no se sirve
    const TIPOS = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
    const tipo = TIPOS[path.extname(file).toLowerCase()];
    if (!tipo) return res.status(415).json({ error: 'Tipo de archivo no permitido' });
    res.sendFile(ruta, { headers: { 'Content-Type': tipo, 'Content-Disposition': 'inline', 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' } });
  } catch (err) { res.status(500).json({ error: 'Error leyendo el archivo' }); }
});

// ---- Módulos que administración puede apagar ----
// Un módulo apagado desaparece del menú y sus endpoints responden 404. Lo esencial (fichaje, usuarios, informes, config) no se apaga.
// `documentos` además se puede apagar por despliegue (DOCUMENTOS_HABILITADOS=false), y eso no se puede revertir desde la app.
const DOCUMENTOS_ON = process.env.DOCUMENTOS_HABILITADOS !== 'false';
const MODULOS = {
  clases:        { nombre: 'Clases y primas', rutas: [/^\/api\/(admin\/)?clases(\/|$)/] },
  libres:        { nombre: 'Días libres', rutas: [/^\/api\/libres(\/|$)/, /^\/api\/admin\/(solicitudes|informe-libres)(\/|$)/] },
  documentos:    { nombre: 'Documentos', rutas: [/^\/api\/(admin\/)?documentos(\/|$)/, /^\/api\/admin\/profesores\/[^/]+\/documentos$/, /^\/uploads\/documentos\//] },
  comparativa:   { nombre: 'Comparar con reservas', rutas: [/^\/api\/admin\/comparativa(\/|$)/] },
  integraciones: { nombre: 'Integraciones y WhatsApp', rutas: [/^\/api\/admin\/(integraciones|whatsapp|planning)(\/|$)/, /^\/api\/v1(\/|$)/] },
  avisos:        { nombre: 'Avisos masivos', rutas: [/^\/api\/admin\/notificaciones(\/|$)/] },
  colaboradores: { nombre: 'Colaboradores y subcontratas', rutas: [/^\/api\/admin\/colaboradores(\/|$)/, /^\/api\/colaborador(\/|$)/] },
};
let modulosOff = new Set();
const cargarModulosOff = async () => {
  try { modulosOff = new Set(String((await getConfig()).modulosOff || '').split(',').filter(k => MODULOS[k])); } catch (e) { console.error('módulos:', e.message); }
};
const moduloActivo = k => !!MODULOS[k] && !modulosOff.has(k) && (k !== 'documentos' || DOCUMENTOS_ON);
const modulosEstado = () => Object.fromEntries(Object.keys(MODULOS).map(k => [k, moduloActivo(k)]));
app.use((req, res, next) => {
  for (const [k, m] of Object.entries(MODULOS))
    if (!moduloActivo(k) && m.rutas.some(r => r.test(req.path))) return res.status(404).json({ error: `Módulo «${m.nombre}» desactivado`, modulo: k });
  next();
});

// ============ SERVER TIME ============
// Salud del servicio: comprueba la base de datos (lo usan Railway y los monitores de disponibilidad)
app.get('/api/salud', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, zonaHoraria: process.env.TZ, version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'local', uptimeSeg: Math.round(process.uptime()), ahora: new Date().toISOString() });
  } catch (e) { console.error('salud:', e.message); res.status(503).json({ ok: false, error: 'Base de datos no disponible' }); }
});

app.get('/api/server-time', (req, res) => {
  res.json({ timestamp: Date.now(), iso: new Date().toISOString() });
});

// ============ AUTH ============

// ============ MAGIC LINK ============
const MAGIC_TTL_MIN = 15;
const SESION_DIAS = 90;
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');
// El código de 6 dígitos tiene poco espacio: se guarda con HMAC (clave del servidor) y ligado al usuario
const hashCodigo = (profesorId, codigo) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${profesorId}:${codigo}`).digest('hex');
const firmarSesion = u => jwt.sign(
  { userId: u.id, email: u.email, role: u.role },
  process.env.JWT_SECRET,
  { expiresIn: `${SESION_DIAS}d` },
);
const perfilSesion = u => ({
  id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email,
  role: u.role, tipoJornada: u.tipoJornada, horasContrato: u.horasContrato,
  telefono: u.telefono, horaRecordatorio: u.horaRecordatorio, tarifaHora: u.tarifaHora, esPrincipal: u.esPrincipal, avisosWhatsapp: u.avisosWhatsapp,
});

// Crea el enlace y lo envía por email. `invitacion` cambia el texto para altas nuevas.
async function enviarMagicLink(u, { invitacion = false } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await prisma.magicLink.deleteMany({ where: { OR: [{ profesorId: u.id }, { expiraAt: { lt: new Date() } }] } });
  await prisma.magicLink.create({
    data: { profesorId: u.id, tokenHash: hashToken(token), codigoHash: hashCodigo(u.id, codigo), expiraAt: new Date(Date.now() + MAGIC_TTL_MIN * 60 * 1000) },
  });
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
  const url = `${base}/?magic=${token}`;
  if (!EMAIL_OK && process.env.NODE_ENV !== 'production') console.log(`🔗 [DEV] Enlace de acceso para ${u.email}: ${url} · código ${codigo}`);
  await enviarEmail(
    u.email,
    invitacion ? 'Te damos la bienvenida a Ski Jornada' : 'Tu enlace de acceso a Ski Jornada',
    `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f0f7ff;border-radius:12px">
      <h1 style="color:#0f4c81;margin-bottom:8px">⛷️ Ski Jornada</h1>
      <h2 style="color:#1e293b;font-weight:600">Hola, ${escHtml(u.nombre)}</h2>
      <p style="color:#475569">${invitacion
        ? 'El administrador creó tu cuenta. Tocá el botón para entrar; no necesitás contraseña.'
        : 'Tocá el botón para entrar. No necesitás contraseña.'}</p>
      <a href="${url}" style="display:inline-block;background:#0f4c81;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Entrar a Ski Jornada →</a>
      <p style="color:#475569;margin:22px 0 6px">¿Usas la app instalada en el móvil? Escribe este código en la app:</p>
      <p style="font-size:30px;font-weight:800;letter-spacing:8px;color:#0f4c81;margin:0;font-family:monospace">${codigo}</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">El enlace y el código valen ${MAGIC_TTL_MIN} minutos y se pueden usar una sola vez. Si no lo pediste, ignorá este mensaje.</p>
    </div>`,
  );
}

// Por IP. Alto a propósito: todo un equipo suele salir por la misma IP pública (la wifi de la escuela). El límite
// que protege a cada persona es el de «1 enlace por minuto y 5 por hora por email» (permitirEnlace).
const enlaceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos desde esta red. Esperá unos minutos.' },
});
const verificarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos desde esta red. Esperá unos minutos.' },
});

// Máximo 1 enlace por minuto y 5 por hora para cada email (evita inundar la bandeja de alguien)
const _pedidosEnlace = new Map();
function permitirEnlace(email) {
  const ahora = Date.now();
  const previos = (_pedidosEnlace.get(email) || []).filter(t => ahora - t < 3600000);
  if (previos.length >= 5 || (previos.length && ahora - previos[previos.length - 1] < 60000)) { _pedidosEnlace.set(email, previos); return false; }
  _pedidosEnlace.set(email, [...previos, ahora]);
  return true;
}
setInterval(() => { const l = Date.now() - 3600000; for (const [k, v] of _pedidosEnlace) if (!v.some(t => t > l)) _pedidosEnlace.delete(k); }, 600000).unref();

// Pide el enlace. Respuesta idéntica exista o no el email (no revela quién tiene cuenta).
app.post('/api/auth/magic-link', enlaceLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Introduce tu email' });
    const u = await prisma.profesor.findUnique({ where: { email } });
    if (u && u.activo && permitirEnlace(email)) enviarMagicLink(u).catch(console.error);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno del servidor' }); }
});

// Canjea el token del enlace por una sesión de larga duración.
app.post('/api/auth/magic-link/verificar', verificarLimiter, async (req, res) => {
  try {
    const token = String(req.body.token || '');
    if (!token) return res.status(400).json({ error: 'Enlace inválido' });
    const ml = await prisma.magicLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { profesor: true } });
    if (!ml || ml.expiraAt < new Date() || !ml.profesor.activo) {
      return res.status(401).json({ error: 'El enlace venció o ya fue usado. Pide uno nuevo.' });
    }
    // Consumo atómico: solo una petición puede borrarlo
    const borrado = await prisma.magicLink.deleteMany({ where: { id: ml.id } });
    if (borrado.count !== 1) return res.status(401).json({ error: 'El enlace venció o ya fue usado. Pide uno nuevo.' });
    res.json(await abrirSesion(ml.profesor));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno del servidor' }); }
});

// Sesión nueva: en el primer acceso el invitado se adhiere
async function abrirSesion(usuario) {
  if (!usuario.adheridoAt) {
    usuario = await prisma.profesor.update({ where: { id: usuario.id }, data: { adheridoAt: new Date() } });
    invalidarUsuario(usuario.id);
  }
  return { token: firmarSesion(usuario), user: perfilSesion(usuario) };
}

// Entrada con el código de 6 dígitos del correo. Pensado para la app instalada (en iPhone el enlace se abre en Safari,
// que no comparte la sesión con la app). Cada enlace admite 5 intentos y además se limita por email.
const _intentosCodigo = new Map();
app.post('/api/auth/codigo/verificar', verificarLimiter, async (req, res) => {
  const invalido = () => res.status(401).json({ error: 'Código incorrecto o vencido. Pide uno nuevo.' });
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const codigo = String(req.body.codigo || '').replace(/\s/g, '');
    if (!email || !/^\d{6}$/.test(codigo)) return res.status(400).json({ error: 'Escribe el código de 6 dígitos' });
    const ahora = Date.now();
    const previos = (_intentosCodigo.get(email) || []).filter(t => ahora - t < 15 * 60 * 1000);
    if (previos.length >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    _intentosCodigo.set(email, [...previos, ahora]);

    const u = await prisma.profesor.findUnique({ where: { email } });
    const ml = u && u.activo ? await prisma.magicLink.findFirst({ where: { profesorId: u.id }, orderBy: { createdAt: 'desc' } }) : null;
    if (!ml || ml.expiraAt < new Date() || !ml.codigoHash) return invalido();
    if (ml.intentos >= 5) { await prisma.magicLink.deleteMany({ where: { id: ml.id } }); return invalido(); }
    const a = Buffer.from(hashCodigo(u.id, codigo)), b = Buffer.from(ml.codigoHash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await prisma.magicLink.update({ where: { id: ml.id }, data: { intentos: { increment: 1 } } });
      return invalido();
    }
    const borrado = await prisma.magicLink.deleteMany({ where: { id: ml.id } }); // un solo uso, atómico
    if (borrado.count !== 1) return invalido();
    _intentosCodigo.delete(email);
    res.json(await abrirSesion(u));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno del servidor' }); }
});

// Renueva la sesión (el frontend lo llama al abrir la app → sesión "deslizante").
app.post('/api/auth/renovar', auth, async (req, res) => {
  try {
    const u = await prisma.profesor.findUnique({ where: { id: req.user.userId } });
    if (!u || !u.activo) return res.status(401).json({ error: 'Sesión inválida' });
    res.json({ token: firmarSesion(u), user: perfilSesion(u) });
  } catch { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// Login con contraseña: solo para desarrollo/demo (PASSWORD_LOGIN=true). En producción se entra con enlace mágico.
app.post('/api/auth/login', authLimiter, async (req, res) => {
  if (process.env.PASSWORD_LOGIN !== 'true') return res.status(404).json({ error: 'Usa el enlace de acceso por email' });
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const u = await prisma.profesor.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!u || !u.activo) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const valid = await bcrypt.compare(password, u.password);
    if (!valid) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const token = jwt.sign(
      { userId: u.id, email: u.email, role: u.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email,
        role: u.role, tipoJornada: u.tipoJornada, horasContrato: u.horasContrato,
        telefono: u.telefono, horaRecordatorio: u.horaRecordatorio,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const u = await prisma.profesor.findUnique({ where: { id: req.user.userId } });
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({
      id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email,
      role: u.role, tipoJornada: u.tipoJornada, horasContrato: u.horasContrato,
      telefono: u.telefono, horaRecordatorio: u.horaRecordatorio, avisosWhatsapp: u.avisosWhatsapp,
    });
  } catch (err) { res.status(500).json({ error: 'Error obteniendo perfil' }); }
});

app.put('/api/auth/me', auth, async (req, res) => {
  try {
    const { nombre, apellidos, telefono, horaRecordatorio, avisosWhatsapp } = req.body;
    const data = {};
    if (nombre            !== undefined) data.nombre           = nombre;
    if (apellidos         !== undefined) data.apellidos        = apellidos;
    if (telefono          !== undefined) data.telefono         = telefono || null;
    if (avisosWhatsapp    !== undefined) data.avisosWhatsapp   = !!avisosWhatsapp;
    if (horaRecordatorio  !== undefined) data.horaRecordatorio = horaRecordatorio;
    if (data.avisosWhatsapp) {
      const tel = data.telefono !== undefined ? data.telefono : (await prisma.profesor.findUnique({ where: { id: req.user.userId }, select: { telefono: true } }))?.telefono;
      if (!tel || !whatsapp.normalizar(tel)) return res.status(400).json({ error: 'Para recibir avisos por WhatsApp indica tu teléfono con prefijo (ej. +34612345678)' });
    }
    const u = await prisma.profesor.update({ where: { id: req.user.userId }, data });
    res.json({
      id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email,
      role: u.role, tipoJornada: u.tipoJornada, horasContrato: u.horasContrato,
      telefono: u.telefono, horaRecordatorio: u.horaRecordatorio, avisosWhatsapp: u.avisosWhatsapp,
    });
  } catch (err) { res.status(500).json({ error: 'Error actualizando perfil' }); }
});


// ============ ZONAS ============
app.get('/api/zonas', auth, async (req, res) => {
  try {
    const zonas = await prisma.zonaFichaje.findMany({
      where: { activa: true },
      select: { id: true, nombre: true, descripcion: true, lat: true, lng: true, radio: true, validationMode: true },
    });
    res.json(zonas);
  } catch (err) { res.status(500).json({ error: 'Error obteniendo zonas' }); }
});

app.get('/api/admin/zonas', auth, adminOnly, async (req, res) => {
  try {
    const zonas = await prisma.zonaFichaje.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(zonas);
  } catch (err) { res.status(500).json({ error: 'Error obteniendo zonas' }); }
});

app.post('/api/admin/zonas', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, descripcion, lat, lng, radio, validationMode } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const id = nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40) + '-' + Date.now();
    const zona = await prisma.zonaFichaje.create({
      data: {
        id, nombre, descripcion: descripcion || '',
        secret: generarSecretoZona(),
        lat: lat != null ? parseFloat(lat) : null,
        lng: lng != null ? parseFloat(lng) : null,
        radio: parseInt(radio) || 100,
        validationMode: validationMode || 'TOTP_GPS',
        activa: true,
      },
    });
    res.json({ success: true, zona });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando zona' });
  }
});

app.put('/api/admin/zonas/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, descripcion, lat, lng, radio, validationMode, activa } = req.body;
    const data = {};
    if (nombre         !== undefined) data.nombre         = nombre;
    if (descripcion    !== undefined) data.descripcion    = descripcion;
    if (lat            !== undefined) data.lat            = lat != null ? parseFloat(lat) : null;
    if (lng            !== undefined) data.lng            = lng != null ? parseFloat(lng) : null;
    if (radio          !== undefined) data.radio          = parseInt(radio);
    if (validationMode !== undefined) data.validationMode = validationMode;
    if (activa         !== undefined) data.activa         = activa;
    const zona = await prisma.zonaFichaje.update({ where: { id: req.params.id }, data });
    res.json({ success: true, zona });
  } catch (err) { res.status(500).json({ error: 'Error actualizando zona' }); }
});

app.post('/api/admin/zonas/:id/regenerar-secreto', auth, adminOnly, async (req, res) => {
  try {
    const zona = await prisma.zonaFichaje.update({
      where: { id: req.params.id },
      data: { secret: generarSecretoZona() },
    });
    res.json({ success: true, zona });
  } catch (err) { res.status(500).json({ error: 'Error regenerando secreto' }); }
});

app.delete('/api/admin/zonas/:id', auth, adminOnly, async (req, res) => {
  try {
    await prisma.zonaFichaje.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error eliminando zona' }); }
});

// ============ FICHAJE ============
app.post('/api/fichaje/fichar', auth, async (req, res) => {
  try {
    const { qrCodeId, totpToken, lat, lng } = req.body;
    if (!qrCodeId) return res.status(400).json({ error: 'Falta el identificador de zona' });

    const zona = await prisma.zonaFichaje.findFirst({ where: { id: qrCodeId, activa: true } });
    if (!zona) return res.status(404).json({ error: 'Zona no válida o inactiva' });

    const mode = zona.validationMode;

    if ((mode === 'TOTP' || mode === 'TOTP_GPS') && totpToken) {
      if (!validarTOTP(zona.secret, totpToken))
        return res.status(400).json({ error: 'Código QR expirado o inválido. Vuelve a escanear el QR.' });
    } else if ((mode === 'TOTP' || mode === 'TOTP_GPS') && !totpToken) {
      return res.status(400).json({ error: 'Esta zona requiere escanear el código QR.' });
    }

    if ((mode === 'GPS' || mode === 'TOTP_GPS') && zona.lat != null && zona.lng != null) {
      if (lat == null || lng == null)
        return res.status(400).json({ error: 'Esta zona requiere geolocalización.' });
      const distancia = calcularDistancia(lat, lng, zona.lat, zona.lng);
      if (distancia > zona.radio)
        return res.status(400).json({ error: `Fuera del radio permitido. Distancia: ${Math.round(distancia)}m (máx ${zona.radio}m)` });
    }

    const ahora = new Date();
    const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const finDia    = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);

    const registrosHoy = await prisma.registroJornada.findMany({
      where: { anulado: false, profesorId: req.user.userId, timestamp: { gte: inicioDia, lte: finDia } },
      orderBy: { timestamp: 'asc' },
    });

    const ultimo = registrosHoy[registrosHoy.length - 1];
    const tipo = (!ultimo || ultimo.tipo === 'SALIDA') ? 'ENTRADA' : 'SALIDA';
    const distancia = (lat != null && lng != null && zona.lat != null && zona.lng != null)
      ? Math.round(calcularDistancia(lat, lng, zona.lat, zona.lng)) : null;

    await prisma.registroJornada.create({
      data: {
        profesorId: req.user.userId, zonaId: zona.id, zonaNombre: zona.nombre,
        tipo, timestamp: ahora, lat: lat ?? null, lng: lng ?? null, distancia,
      },
    });

    res.json({
      success: true, tipo,
      hora: ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      fecha: ahora.toLocaleDateString('es-ES'),
      zona: zona.nombre,
      timestamp: ahora.toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error registrando fichaje' });
  }
});

app.post('/api/fichaje/salida', auth, async (req, res) => {
  try {
    const ahora = new Date();
    const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const finDia    = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
    const registrosHoy = await prisma.registroJornada.findMany({
      where: { anulado: false, profesorId: req.user.userId, timestamp: { gte: inicioDia, lte: finDia } },
      orderBy: { timestamp: 'asc' },
    });
    const ultimo = registrosHoy[registrosHoy.length - 1];
    if (!ultimo || ultimo.tipo !== 'ENTRADA')
      return res.status(400).json({ error: 'No hay entrada activa para registrar salida.' });
    await prisma.registroJornada.create({
      data: {
        profesorId: req.user.userId,
        zonaId: ultimo.zonaId,
        zonaNombre: ultimo.zonaNombre,
        tipo: 'SALIDA',
        timestamp: ahora,
        lat: null, lng: null, distancia: null,
      },
    });
    res.json({
      success: true, tipo: 'SALIDA',
      hora: ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      timestamp: ahora.toISOString(),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error registrando salida' }); }
});

app.get('/api/fichaje/historial', auth, async (req, res) => {
  try {
    const registros = await prisma.registroJornada.findMany({
      where: { anulado: false, profesorId: req.user.userId },
      orderBy: { timestamp: 'asc' },
    });

    const porDia = {};
    registros.forEach(r => {
      const dia = fechaLocal(r.timestamp);
      if (!porDia[dia]) porDia[dia] = [];
      porDia[dia].push(r);
    });

    const historial = {}, resumen = {};
    for (const [dia, regs] of Object.entries(porDia)) {
      historial[dia] = regs.map(r => ({
        tipo: r.tipo,
        hora: r.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        zona: r.zonaNombre,
        timestamp: r.timestamp.toISOString(),
      }));
      const horas = calcularHorasMs(regs) / 3600000;
      resumen[dia] = { fecha: dia, horas: Math.round(horas * 100) / 100, exceso: Math.max(0, Math.round((horas - 7) * 100) / 100) };
    }
    res.json({ historial, resumen });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo historial' });
  }
});

// ============ DÍAS LIBRES ============
app.post('/api/libres/solicitar', auth, async (req, res) => {
  try {
    const { fechaInicio, fechaFin, motivo, comentario } = req.body;
    const ini = new Date(fechaInicio), fin = new Date(fechaFin);
    if (isNaN(ini) || isNaN(fin)) return res.status(400).json({ error: 'Indica fechas válidas' });
    if (fin < ini) return res.status(400).json({ error: 'La fecha final no puede ser anterior a la inicial' });
    if (!String(motivo || '').trim()) return res.status(400).json({ error: 'Indica el motivo' });
    const sol = await prisma.solicitudLibre.create({
      data: {
        profesorId: req.user.userId,
        fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin),
        motivo, comentario: comentario || '', estado: 'PENDIENTE',
      },
    });
    emitirEvento('solicitud.creada', { id: sol.id, profesorId: sol.profesorId, fechaInicio: sol.fechaInicio, fechaFin: sol.fechaFin, motivo: sol.motivo });
    res.json({ success: true, solicitud: sol });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando solicitud' });
  }
});

app.get('/api/libres/mis-solicitudes', auth, async (req, res) => {
  try {
    const solicitudes = await prisma.solicitudLibre.findMany({
      where: { profesorId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(solicitudes);
  } catch (err) { res.status(500).json({ error: 'Error obteniendo solicitudes' }); }
});

// ============ ADMIN — Solicitudes ============
app.get('/api/admin/solicitudes', auth, adminOnly, async (req, res) => {
  try {
    const solicitudes = await prisma.solicitudLibre.findMany({
      include: { profesor: { select: { nombre: true, apellidos: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(solicitudes.map(s => ({
      ...s,
      profesorNombre: `${s.profesor.nombre} ${s.profesor.apellidos}`,
      profesorEmail: s.profesor.email,
    })));
  } catch (err) { res.status(500).json({ error: 'Error obteniendo solicitudes' }); }
});

app.post('/api/admin/solicitudes/:id/responder', auth, adminOnly, async (req, res) => {
  try {
    const sol = await prisma.solicitudLibre.update({
      where: { id: req.params.id },
      data: {
        estado: req.body.aprobado ? 'APROBADO' : 'RECHAZADO',
        observacion: req.body.observacion || '',
        aprobadoPor: req.user.userId,
        fechaRespuesta: new Date(),
      },
    });
    emitirEvento('solicitud.respondida', { id: sol.id, profesorId: sol.profesorId, estado: sol.estado, observacion: sol.observacion });
    avisarWhatsapp([sol.profesorId], `tu solicitud de días libres fue ${req.body.aprobado ? 'APROBADA ✅' : 'RECHAZADA ❌'}.${req.body.observacion ? ` ${req.body.observacion}` : ''}`);
    res.json({ success: true, solicitud: sol });
  } catch (err) { res.status(500).json({ error: 'Error respondiendo solicitud' }); }
});

// ============ ADMIN — Resumen del dashboard ============
// Todo lo que requiere atención de administración, en una sola llamada.
async function resumenColaboradores() {
  const cols = await prisma.colaborador.findMany({ where: { activo: true }, include: { movimientos: true, liquidaciones: true } });
  const filas = cols.map(c => ({ id: c.id, nombre: c.nombre, ...saldoDe(c.movimientos, c.liquidaciones) }));
  return {
    total: cols.length,
    pendientes: filas.reduce((a, c) => a + c.pendientes, 0), enRevision: filas.reduce((a, c) => a + c.enRevision, 0),
    aFavorEuros: r2(filas.filter(c => c.euros > 0).reduce((a, c) => a + c.euros, 0)),
    enContraEuros: r2(-filas.filter(c => c.euros < 0).reduce((a, c) => a + c.euros, 0)),
    listaRevision: filas.filter(c => c.enRevision > 0).slice(0, 5).map(c => ({ id: c.id, nombre: c.nombre, enRevision: c.enRevision })),
  };
}
app.get('/api/admin/resumen', auth, adminOnly, async (req, res) => {
  try {
    const ahora = new Date();
    const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const mesDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const meses = [0, 1, 2].map(i => mesDe(new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)));
    const hace60 = new Date(hoy0.getTime() - 60 * 864e5);
    const nombre = p => `${p.nombre} ${p.apellidos || ''}`.trim();
    const quien = { select: { nombre: true, apellidos: true } };

    const [sols, confirmaciones, revisiones, docs, equipo, ultimos, incidencias] = await Promise.all([
      prisma.solicitudLibre.findMany({ where: { OR: [{ estado: 'PENDIENTE' }, { createdAt: { gte: hace60 } }, { fechaFin: { gte: hoy0 } }] }, include: { profesor: quien }, orderBy: { createdAt: 'desc' } }),
      prisma.confirmacionClases.findMany({ where: { mes: { in: meses } }, include: { profesor: quien } }),
      prisma.revisionMes.findMany({ where: { mes: { in: meses } } }),
      prisma.documentoLegajo.findMany({ where: { estado: 'PENDIENTE' }, include: { profesor: quien }, orderBy: { createdAt: 'asc' }, take: 50 }),
      prisma.profesor.findMany({ where: { role: 'PROFESOR', activo: true }, select: { id: true, nombre: true, apellidos: true, adheridoAt: true } }),
      prisma.registroJornada.findMany({ where: { anulado: false, timestamp: { gte: new Date(hoy0.getTime() - 864e5) } }, orderBy: { timestamp: 'desc' }, select: { profesorId: true, tipo: true, timestamp: true } }),
      prisma.registroJornada.count({ where: { esIncidencia: true, timestamp: { gte: new Date(hoy0.getTime() - 7 * 864e5) } } }),
    ]);

    const porEstado = e => sols.filter(x => x.estado === e);
    const pend = porEstado('PENDIENTE');
    const proximas = porEstado('APROBADO').filter(x => x.fechaFin >= hoy0).sort((a, b) => a.fechaInicio - b.fechaInicio);
    const fila = x => ({ id: x.id, profesor: nombre(x.profesor), fechaInicio: x.fechaInicio, fechaFin: x.fechaFin, motivo: x.motivo, comentario: x.comentario, createdAt: x.createdAt });

    const rev = new Map(revisiones.map(r => [`${r.profesorId}|${r.mes}`, r]));
    const sinRevisar = confirmaciones.filter(c => { const r = rev.get(`${c.profesorId}|${c.mes}`); return !r || r.estado === 'PENDIENTE'; })
      .map(c => ({ profesorId: c.profesorId, profesor: nombre(c.profesor), mes: c.mes, confirmadoAt: c.confirmadoAt }));
    const conProblema = revisiones.filter(r => r.estado === 'DISCREPANCIA' || r.estado === 'CORRECCION');
    const nombres = new Map(equipo.map(p => [p.id, nombre(p)]));

    // Dentro ahora: última marca de cada profesor en las últimas 24 h es una entrada
    const ultima = new Map();
    for (const r of ultimos) if (!ultima.has(r.profesorId)) ultima.set(r.profesorId, r);
    const dentro = [...ultima.values()].filter(r => r.tipo === 'ENTRADA').length;

    res.json({
      mesActual: meses[0],
      equipo: { activos: equipo.length, invitadosSinEntrar: equipo.filter(p => !p.adheridoAt).map(p => ({ id: p.id, nombre: nombre(p) })), dentroAhora: dentro },
      solicitudes: {
        pendientes: pend.length,
        aprobadas: porEstado('APROBADO').filter(x => x.createdAt >= hace60).length,
        rechazadas: porEstado('RECHAZADO').filter(x => x.createdAt >= hace60).length,
        listaPendientes: pend.slice(0, 5).map(fila),
        proximas: proximas.slice(0, 5).map(fila),
        ausentesHoy: proximas.filter(x => x.fechaInicio <= ahora).length,
      },
      clases: {
        sinRevisar: sinRevisar.length, listaSinRevisar: sinRevisar.slice(0, 5),
        conProblema: conProblema.length,
        listaConProblema: conProblema.slice(0, 5).map(r => ({ profesorId: r.profesorId, profesor: nombres.get(r.profesorId) || '—', mes: r.mes, estado: r.estado })),
      },
      documentos: { pendientesFirma: docs.length, lista: docs.slice(0, 5).map(d => ({ id: d.id, profesor: nombre(d.profesor), nombre: d.nombre, mes: d.mes })) },
      incidenciasSemana: incidencias,
      colaboradores: moduloActivo('colaboradores') ? await resumenColaboradores() : null,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error obteniendo el resumen' }); }
});

// ============ ADMIN — Informe ausencias ============
app.get('/api/admin/informe-libres', auth, adminOnly, async (req, res) => {
  try {
    const profesores = await prisma.profesor.findMany({
      where: { role: 'PROFESOR', activo: true },
      include: { solicitudes: true },
      orderBy: { apellidos: 'asc' },
    });
    const resultado = profesores.map(p => {
      const aprobadas = p.solicitudes.filter(s => s.estado === 'APROBADO');
      const resumen = { DIA_LIBRE: 0, ASUNTO_PROPIO: 0, ENFERMEDAD: 0 };
      aprobadas.forEach(s => {
        const dias = Math.round((new Date(s.fechaFin) - new Date(s.fechaInicio)) / 86400000) + 1;
        if (resumen[s.motivo] !== undefined) resumen[s.motivo] += dias;
      });
      return {
        id: p.id, nombre: p.nombre, apellidos: p.apellidos, email: p.email,
        tipoJornada: p.tipoJornada, horasContrato: p.horasContrato,
        totalSolicitudes: p.solicitudes.length,
        aprobadas:          p.solicitudes.filter(s => s.estado === 'APROBADO').length,
        pendientes:         p.solicitudes.filter(s => s.estado === 'PENDIENTE').length,
        rechazadas:         p.solicitudes.filter(s => s.estado === 'RECHAZADO').length,
        diasVacaciones:     resumen.DIA_LIBRE,
        diasEnfermedad:     resumen.ENFERMEDAD,
        diasAsuntoPropios:  resumen.ASUNTO_PROPIO,
        solicitudes: p.solicitudes.sort((a, b) => b.createdAt - a.createdAt),
      };
    });
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error generando informe' });
  }
});

// ============ ADMIN — Profesores ============
app.get('/api/admin/profesores', auth, adminOnly, async (req, res) => {
  try {
    const where = { role: { not: 'COLABORADOR' } }; // los colaboradores se gestionan en su módulo
    const profesores = await prisma.profesor.findMany({
      where,
      select: {
        id: true, nombre: true, apellidos: true, email: true,
        tipoJornada: true, horasContrato: true, role: true, activo: true,
        createdAt: true, telefono: true, horaRecordatorio: true, tarifaHora: true, adheridoAt: true, esPrincipal: true,
      },
      orderBy: { apellidos: 'asc' },
    });
    res.json(profesores);
  } catch (err) { res.status(500).json({ error: 'Error obteniendo profesores' }); }
});

app.post('/api/admin/profesores', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, apellidos, email, tipoJornada, horasContrato, role, telefono } = req.body;
    const esAdminNuevo = role === 'ADMIN';
    if (esAdminNuevo && !req.user.esPrincipal) return res.status(403).json({ error: 'Solo la cuenta principal puede crear administradores' });
    // Una cuenta de administración puede ser de empresa (sin apellidos); un profesor necesita nombre y apellidos
    if (!nombre || !email || (!apellidos && !esAdminNuevo)) return res.status(400).json({ error: esAdminNuevo ? 'Nombre y email son obligatorios' : 'Nombre, apellidos y email son obligatorios' });
    if (!EMAIL_RE.test(String(email).trim())) return res.status(400).json({ error: 'Email inválido' });

    const existe = await prisma.profesor.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existe) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });

    const password = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10); // sin contraseña usable: se entra por enlace
    const nuevo = await prisma.profesor.create({
      data: {
        email: email.toLowerCase().trim(), nombre, apellidos: apellidos || '', password,
        tipoJornada: tipoJornada || 'COMPLETA',
        horasContrato: parseInt(horasContrato) || 35,
        role: role === 'ADMIN' ? 'ADMIN' : 'PROFESOR',
        telefono: telefono || null,
      },
    });
    enviarMagicLink(nuevo, { invitacion: true }).catch(console.error);
    await auditar(req, nuevo.role === 'ADMIN' ? 'usuario.crear_admin' : 'usuario.crear', nuevo);
    res.json({
      success: true,
      usuario: {
        id: nuevo.id, nombre, apellidos, email: nuevo.email,
        tipoJornada: nuevo.tipoJornada, horasContrato: nuevo.horasContrato,
        role: nuevo.role, telefono: nuevo.telefono,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando profesor' });
  }
});

app.put('/api/admin/profesores/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, apellidos, tipoJornada, horasContrato, activo, telefono, horaRecordatorio, tarifaHora } = req.body;
    const data = {};
    if (nombre           !== undefined) data.nombre           = nombre;
    if (apellidos        !== undefined) data.apellidos        = apellidos;
    if (tipoJornada      !== undefined) data.tipoJornada      = tipoJornada;
    if (horasContrato    !== undefined) data.horasContrato    = parseInt(horasContrato);
    if (activo           !== undefined) {
      data.activo = !!activo;
      if (!activo) { // baja: no dejar la escuela sin administración ni tocar a la cuenta principal
        const objetivo = await prisma.profesor.findUnique({ where: { id: req.params.id } });
        if (objetivo && objetivo.id === req.user.userId) return res.status(400).json({ error: 'No puedes darte de baja a ti mismo' });
        const e = objetivo && await validarBajaAdmin(objetivo);
        if (e) return res.status(400).json({ error: e });
      }
    }
    if (telefono         !== undefined) data.telefono         = telefono || null;
    if (horaRecordatorio !== undefined) data.horaRecordatorio = horaRecordatorio;
    if (tarifaHora       !== undefined) data.tarifaHora       = (tarifaHora === '' || tarifaHora === null || isNaN(parseFloat(tarifaHora))) ? null : Math.max(0, parseFloat(tarifaHora));
    const prof = await prisma.profesor.update({ where: { id: req.params.id }, data });
    invalidarUsuario(prof.id);
    await auditar(req, activo === false ? 'usuario.baja' : activo === true ? 'usuario.alta' : 'usuario.editar', prof, { campos: Object.keys(data).filter(k => k !== 'tarifaHora') });
    res.json({
      success: true,
      profesor: {
        id: prof.id, nombre: prof.nombre, apellidos: prof.apellidos, email: prof.email,
        tipoJornada: prof.tipoJornada, horasContrato: prof.horasContrato,
        role: prof.role, activo: prof.activo, telefono: prof.telefono, horaRecordatorio: prof.horaRecordatorio,
      },
    });
  } catch (err) { res.status(500).json({ error: 'Error actualizando profesor' }); }
});

app.delete('/api/admin/profesores/:id', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.userId) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    const objetivo = await prisma.profesor.findUnique({ where: { id } });
    if (!objetivo) return res.status(404).json({ error: 'Usuario no encontrado' });
    const e = await validarBajaAdmin(objetivo);
    if (e) return res.status(400).json({ error: e });
    await prisma.profesor.update({ where: { id }, data: { activo: false } });
    invalidarUsuario(id);
    await auditar(req, 'usuario.baja', objetivo);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error desactivando usuario' }); }
});

// ============ ACCESO: invitaciones, roles y auditoría ============
// Modelo: la escuela tiene una cuenta de administración (puede ser una cuenta de empresa). Administración carga la
// lista de profesores y los invita; cada profesor "se adhiere" al entrar por primera vez con su email.
// Nadie puede crear una cuenta por su cuenta: solo entra quien está en la lista y está activo.

async function auditar(req, accion, objetivo, detalle) {
  try {
    await prisma.auditoriaLog.create({ data: {
      actorId: req.user?.userId || null, actorEmail: req.user?.email || null, accion,
      objetivoId: objetivo?.id || null, objetivoEmail: objetivo?.email || null, detalle: detalle ? JSON.stringify(detalle) : null,
    } });
  } catch (e) { console.error('auditoria:', e.message); }
}

const dormir = ms => new Promise(r => setTimeout(r, ms));
// Envía invitaciones en segundo plano y de una en una (los proveedores de correo limitan la velocidad)
async function enviarInvitaciones(usuarios) {
  for (const u of usuarios) {
    try { await enviarMagicLink(u, { invitacion: true }); } catch (e) { console.error('invitación:', u.email, e.message); }
    await dormir(600);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const adminsActivos = () => prisma.profesor.count({ where: { role: 'ADMIN', activo: true } });

// Impide dejar la escuela sin administración o dar de baja a la cuenta principal
async function validarBajaAdmin(objetivo) {
  if (objetivo.esPrincipal) return 'La cuenta principal no se puede dar de baja';
  if (objetivo.role === 'ADMIN' && (await adminsActivos()) <= 1) return 'Tiene que quedar al menos un administrador activo';
  return null;
}

// Reenviar la invitación a un usuario
app.post('/api/admin/profesores/:id/invitar', auth, adminOnly, async (req, res) => {
  try {
    const u = await prisma.profesor.findUnique({ where: { id: req.params.id } });
    if (!u || !u.activo) return res.status(404).json({ error: 'Usuario no encontrado o inactivo' });
    await enviarMagicLink(u, { invitacion: true });
    await auditar(req, 'usuario.invitacion_reenviada', u);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'No se pudo enviar la invitación' }); }
});

// Invitar de una vez a todos los que todavía no entraron
app.post('/api/admin/profesores/invitar-pendientes', auth, adminOnly, async (req, res) => {
  try {
    const pendientes = await prisma.profesor.findMany({ where: { activo: true, adheridoAt: null, NOT: { id: req.user.userId } } });
    if (!pendientes.length) return res.json({ success: true, enviadas: 0 });
    if (pendientes.length > 300) return res.status(400).json({ error: 'Demasiados pendientes a la vez (máx. 300)' });
    enviarInvitaciones(pendientes);
    await auditar(req, 'usuario.invitaciones_masivas', null, { cantidad: pendientes.length });
    res.json({ success: true, enviadas: pendientes.length });
  } catch (err) { console.error(err); res.status(500).json({ error: 'No se pudieron enviar las invitaciones' }); }
});

// Cargar la lista de profesores (siempre con rol PROFESOR; idempotente por email)
app.post('/api/admin/profesores/importar', auth, adminOnly, async (req, res) => {
  try {
    const { filas, invitar } = req.body;
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'La lista está vacía' });
    if (filas.length > 300) return res.status(400).json({ error: 'Máximo 300 filas por carga' });
    let creados = 0, actualizados = 0;
    const errores = [], nuevos = [];
    for (const [i, f] of filas.entries()) {
      const email = String(f.email || '').toLowerCase().trim();
      const nombre = String(f.nombre || '').trim();
      if (!EMAIL_RE.test(email) || !nombre) { errores.push({ fila: i + 1, motivo: 'Falta el nombre o el email es inválido', email }); continue; }
      const tarifa = f.tarifaHora === '' || f.tarifaHora == null ? null : parseFloat(String(f.tarifaHora).replace(',', '.'));
      if (tarifa != null && (isNaN(tarifa) || tarifa < 0)) { errores.push({ fila: i + 1, motivo: 'Tarifa inválida', email }); continue; }
      const datos = {
        nombre, apellidos: String(f.apellidos || '').trim(), telefono: f.telefono ? String(f.telefono).trim() : null,
        tipoJornada: f.tipoJornada === 'MEDIA_JORNADA' ? 'MEDIA_JORNADA' : 'COMPLETA',
        horasContrato: parseInt(f.horasContrato) || 35, tarifaHora: tarifa,
      };
      const existe = await prisma.profesor.findUnique({ where: { email } });
      if (existe) {
        if (existe.role === 'ADMIN') { errores.push({ fila: i + 1, motivo: 'Es un administrador: no se modifica desde la importación', email }); continue; }
        await prisma.profesor.update({ where: { email }, data: { ...datos, activo: true } });
        invalidarUsuario(existe.id); actualizados++;
      } else {
        const nuevo = await prisma.profesor.create({ data: { ...datos, email, role: 'PROFESOR', password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10) } });
        nuevos.push(nuevo); creados++;
      }
    }
    if (invitar && nuevos.length) enviarInvitaciones(nuevos);
    await auditar(req, 'usuario.importacion', null, { creados, actualizados, errores: errores.length, invitados: invitar ? nuevos.length : 0 });
    res.json({ creados, actualizados, errores, invitados: invitar ? nuevos.length : 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error importando la lista' }); }
});

// Cambiar de rol: solo la cuenta principal. Siempre debe quedar un administrador activo.
app.put('/api/admin/profesores/:id/rol', auth, adminOnly, async (req, res) => {
  try {
    if (!req.user.esPrincipal) return res.status(403).json({ error: 'Solo la cuenta principal puede cambiar roles' });
    const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'PROFESOR';
    const u = await prisma.profesor.findUnique({ where: { id: req.params.id } });
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (u.esPrincipal) return res.status(400).json({ error: 'No se puede cambiar el rol de la cuenta principal' });
    if (u.role === role) return res.json({ success: true });
    if (role === 'PROFESOR') { const e = await validarBajaAdmin(u); if (e) return res.status(400).json({ error: e }); }
    await prisma.profesor.update({ where: { id: u.id }, data: { role } });
    invalidarUsuario(u.id);
    await auditar(req, 'usuario.rol', u, { de: u.role, a: role });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error cambiando el rol' }); }
});

app.get('/api/admin/auditoria', auth, adminOnly, async (req, res) => {
  try {
    const limite = Math.min(parseInt(req.query.limit) || 50, 200);
    const filas = await prisma.auditoriaLog.findMany({ orderBy: { createdAt: 'desc' }, take: limite });
    res.json(filas.map(f => ({ ...f, detalle: f.detalle ? JSON.parse(f.detalle) : null })));
  } catch { res.status(500).json({ error: 'Error' }); }
});

// ============ INFORMES ============
function countWorkingDays(anio, mes) {
  let count = 0;
  const days = new Date(anio, mes, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const wd = new Date(anio, mes - 1, d).getDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

app.get('/api/admin/planilla/:mes/:anio', auth, adminOnly, async (req, res) => {
  try {
    const mesNum = parseInt(req.params.mes), anioNum = parseInt(req.params.anio);
    if (!(mesNum >= 1 && mesNum <= 12 && anioNum >= 2000 && anioNum <= 2100)) return res.status(400).json({ error: 'Mes o año inválido' });
    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin    = new Date(anioNum, mesNum, 0, 23, 59, 59, 999);
    const diasLaborables = countWorkingDays(anioNum, mesNum);

    const [profesores, todosRegistros] = await Promise.all([
      prisma.profesor.findMany({ where: { activo: true }, orderBy: { apellidos: 'asc' } }),
      prisma.registroJornada.findMany({ where: { anulado: false, timestamp: { gte: inicio, lte: fin } }, orderBy: { timestamp: 'asc' } }),
    ]);

    const porProfesor = {};
    todosRegistros.forEach(r => {
      if (!porProfesor[r.profesorId]) porProfesor[r.profesorId] = [];
      porProfesor[r.profesorId].push(r);
    });

    const resultado = profesores.map(p => {
      const horasDiarias  = p.horasContrato / 5;
      const horasEsperadas = Math.round(horasDiarias * diasLaborables * 100) / 100;
      const regs = porProfesor[p.id] || [];

      if (!regs.length) return {
        id: p.id, nombre: p.nombre, apellidos: p.apellidos, email: p.email,
        tipoJornada: p.tipoJornada, horasContrato: p.horasContrato,
        horasEsperadas, horasTrabajadas: 0,
        horasExceso: 0, horasDeficit: horasEsperadas,
        diasTrabajados: 0, diasConExceso: 0,
        cumplimiento: 0, estado: 'SIN_DATOS',
      };

      const porDia = {};
      regs.forEach(r => {
        const dia = fechaLocal(r.timestamp);
        if (!porDia[dia]) porDia[dia] = [];
        porDia[dia].push(r);
      });

      let totalHoras = 0, diasConExceso = 0;
      Object.values(porDia).forEach(dRegs => {
        const h = calcularHorasMs(dRegs) / 3_600_000;
        totalHoras += h;
        if (h > horasDiarias + 0.05) diasConExceso++;
      });

      const exceso  = Math.max(0, totalHoras - horasEsperadas);
      const deficit = Math.max(0, horasEsperadas - totalHoras);
      const cumplimiento = horasEsperadas > 0 ? Math.round(totalHoras / horasEsperadas * 1000) / 10 : 0;
      const estado = exceso > 1 ? 'EXCESO' : deficit > 2 ? 'DEFICIT' : totalHoras === 0 ? 'SIN_DATOS' : 'OK';

      return {
        id: p.id, nombre: p.nombre, apellidos: p.apellidos, email: p.email,
        tipoJornada: p.tipoJornada, horasContrato: p.horasContrato,
        horasEsperadas,
        horasTrabajadas: Math.round(totalHoras * 100) / 100,
        horasExceso:     Math.round(exceso  * 100) / 100,
        horasDeficit:    Math.round(deficit * 100) / 100,
        diasTrabajados:  Object.keys(porDia).length, diasConExceso,
        cumplimiento, estado,
      };
    });

    const totTrabajadas = Math.round(resultado.reduce((s, p) => s + p.horasTrabajadas, 0) * 100) / 100;
    const totEsperadas  = Math.round(resultado.reduce((s, p) => s + p.horasEsperadas,  0) * 100) / 100;

    res.json({
      mes: req.params.mes, anio: req.params.anio, diasLaborables,
      totTrabajadas, totEsperadas,
      cumplimientoGlobal: totEsperadas > 0 ? Math.round(totTrabajadas / totEsperadas * 1000) / 10 : 0,
      profesores: resultado,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error generando planilla' }); }
});

app.get('/api/informe/:mes/:anio', auth, async (req, res) => {
  try {
    const { mes, anio } = req.params;
    if (!(parseInt(mes) >= 1 && parseInt(mes) <= 12 && parseInt(anio) >= 2000 && parseInt(anio) <= 2100)) return res.status(400).json({ error: 'Mes o año inválido' });
    const targetId = (req.user.role === 'ADMIN' && req.query.profesorId) ? req.query.profesorId : req.user.userId;

    const profesor = await prisma.profesor.findUnique({ where: { id: targetId } });
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });

    const mesNum = parseInt(mes), anioNum = parseInt(anio);
    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin    = new Date(anioNum, mesNum, 0, 23, 59, 59, 999);

    const regs = await prisma.registroJornada.findMany({
      where: { anulado: false, profesorId: targetId, timestamp: { gte: inicio, lte: fin } },
      orderBy: { timestamp: 'asc' },
    });

    const porDia = {};
    regs.forEach(r => {
      const dia = fechaLocal(r.timestamp);
      if (!porDia[dia]) porDia[dia] = [];
      porDia[dia].push(r);
    });

    const horasDiarias = profesor.horasContrato / 5;
    let totalHoras = 0, diasConExceso = 0, totalExceso = 0;

    const detalle = Object.entries(porDia).map(([dia, registrosDia]) => {
      const h = calcularHorasMs(registrosDia) / 3600000;
      const exceso = Math.max(0, h - horasDiarias);
      if (exceso > 0) { diasConExceso++; totalExceso += exceso; }
      totalHoras += h;
      return {
        fecha: dia,
        horas:  Math.round(h * 100) / 100,
        exceso: Math.round(exceso * 100) / 100,
        cumpleNormativa: h <= horasDiarias,
        registros: registrosDia.map(r => ({
          tipo: r.tipo,
          hora: r.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          zona: r.zonaNombre,
        })),
      };
    });

    const n = detalle.length;
    res.json({
      mes: `${mes}/${anio}`, anio, mesNum: mes,
      profesor: { id: profesor.id, nombre: profesor.nombre, apellidos: profesor.apellidos, email: profesor.email, tipoJornada: profesor.tipoJornada, horasContrato: profesor.horasContrato },
      totalHoras:     Math.round(totalHoras * 100) / 100,
      totalExceso:    Math.round(totalExceso * 100) / 100,
      diasTrabajados: n, diasConExceso,
      promedioDiario: n > 0 ? Math.round((totalHoras / n) * 100) / 100 : 0,
      detalle,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error generando informe' });
  }
});

// ============ FIRMA DE REGISTRO HORARIO ============
app.post('/api/firma/enviar-email', auth, adminOnly, async (req, res) => {
  try {
    const { profesorId, mes, anio, pdfBase64 } = req.body;
    if (!profesorId || !mes || !anio || !pdfBase64) return res.status(400).json({ error: 'Datos incompletos' });

    const profesor = await prisma.profesor.findUnique({ where: { id: profesorId } });
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });

    const mesKey  = `${anio}-${String(mes).padStart(2, '0')}`;
    const MESES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mesNombre = MESES[parseInt(mes) - 1];
    const buffer  = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');

    await enviarEmail(
      profesor.email,
      `Registro de Jornada ${mesNombre} ${anio} — Pendiente de firma`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f0f7ff;border-radius:12px">
        <h1 style="color:#0f4c81">⛷️ Ski Jornada</h1>
        <p>Hola <strong>${escHtml(profesor.nombre)}</strong>,</p>
        <p>Adjunto encontrarás el registro de jornada laboral de <strong>${mesNombre} ${anio}</strong>.</p>
        <ol>
          <li>Descarga el PDF adjunto</li>
          <li>Fírmalo (físicamente o con firma digital)</li>
          <li>Súbelo en la app: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Ski Jornada →</a></li>
        </ol>
      </div>`,
      [{ filename: `RegistroHorario_${String(profesor.apellidos || 'profesor').replace(/[^\w.-]+/g, '_')}_${mesNombre}_${String(anio).replace(/\D/g, '')}.pdf`, content: buffer, contentType: 'application/pdf' }]
    );

    await prisma.firmaRegistro.upsert({
      where: { profesorId_mes: { profesorId, mes: mesKey } },
      update: { estado: 'ENVIADO', emailEnviadoAt: new Date() },
      create: { profesorId, mes: mesKey, estado: 'ENVIADO', emailEnviadoAt: new Date() },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error enviando email' });
  }
});

app.post('/api/firma/subir-firmado', auth, upload.single('pdf'), verificarArchivo(['pdf']), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    const { mes, anio } = req.body;
    if (!mes || !anio) return res.status(400).json({ error: 'Mes y año requeridos' });

    const mesKey = `${anio}-${String(mes).padStart(2, '0')}`;
    await prisma.firmaRegistro.upsert({
      where: { profesorId_mes: { profesorId: req.user.userId, mes: mesKey } },
      update: { estado: 'FIRMADO', pdfFirmadoPath: req.file.filename, firmadoAt: new Date() },
      create: { profesorId: req.user.userId, mes: mesKey, estado: 'FIRMADO', pdfFirmadoPath: req.file.filename, firmadoAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error subiendo firma' });
  }
});

app.get('/api/firma/estado/:profesorId/:mes', auth, async (req, res) => {
  try {
    const targetId = req.user.role === 'ADMIN' ? req.params.profesorId : req.user.userId;
    const firma = await prisma.firmaRegistro.findUnique({
      where: { profesorId_mes: { profesorId: targetId, mes: req.params.mes } },
    });
    res.json({ estado: firma?.estado || 'PENDIENTE', firma: firma || null });
  } catch (err) { res.status(500).json({ error: 'Error obteniendo estado' }); }
});

app.get('/api/admin/firmas', auth, adminOnly, async (req, res) => {
  try {
    const firmas = await prisma.firmaRegistro.findMany({
      include: { profesor: { select: { nombre: true, apellidos: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(firmas.map(f => ({
      ...f,
      profesorNombre: `${f.profesor.nombre} ${f.profesor.apellidos}`,
      firmadoUrl: f.pdfFirmadoPath ? `/uploads/firmas/${f.pdfFirmadoPath}` : null,
    })));
  } catch (err) { res.status(500).json({ error: 'Error obteniendo firmas' }); }
});

// ============ LEGAJO — Documentos ============
app.post('/api/admin/documentos', auth, adminOnly, upload.single('pdf'), verificarArchivo(['pdf']), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    const { profesorId, tipo, nombre, mes } = req.body;
    if (!profesorId || !tipo || !nombre) return res.status(400).json({ error: 'profesorId, tipo y nombre son obligatorios' });

    const doc = await prisma.documentoLegajo.create({
      data: {
        profesorId, tipo, nombre,
        mes: mes || null,
        archivoPath: req.file.filename,
        subidoPor: req.user.userId,
        estado: 'PENDIENTE',
      },
    });

    const profesor = await prisma.profesor.findUnique({ where: { id: profesorId } });
    if (profesor) {
      enviarEmail(
        profesor.email,
        `Nuevo documento en tu legajo: ${nombre}`,
        `<div style="font-family:sans-serif;padding:24px;background:#f0f7ff;border-radius:12px">
          <h2 style="color:#0f4c81">⛷️ Ski Jornada</h2>
          <p>Hola <strong>${escHtml(profesor.nombre)}</strong>, hay un nuevo documento en tu legajo:</p>
          <p style="font-size:16px;font-weight:bold">${escHtml(nombre)}${mes ? ` — ${escHtml(mes)}` : ''}</p>
          <p>Consúltalo y fírmalo en: <a href="${process.env.FRONTEND_URL}">Ski Jornada →</a></p>
        </div>`
      ).catch(console.error);
    }

    res.json({ success: true, documento: { ...doc, archivoUrl: `/uploads/documentos/${doc.archivoPath}` } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error subiendo documento' });
  }
});

app.get('/api/documentos/mis-documentos', auth, async (req, res) => {
  try {
    const docs = await prisma.documentoLegajo.findMany({
      where: { profesorId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs.map(d => ({
      ...d,
      archivoUrl: `/uploads/documentos/${d.archivoPath}`,
      firmaUrl: d.firmaPath ? `/uploads/firmas/${d.firmaPath}` : null,
    })));
  } catch (err) { res.status(500).json({ error: 'Error obteniendo documentos' }); }
});

app.post('/api/documentos/:id/firmar', auth, uploadFirma.single('pdf'), verificarArchivo(['pdf', 'png', 'jpg']), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const doc = await prisma.documentoLegajo.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
    if (doc.profesorId !== req.user.userId && req.user.role !== 'ADMIN')
      return res.status(403).json({ error: 'No autorizado' });

    const updated = await prisma.documentoLegajo.update({
      where: { id: req.params.id },
      data: { estado: 'FIRMADO', firmaPath: req.file.filename, firmadoAt: new Date() },
    });
    emitirEvento('documento.firmado', { documentoId: updated.id, tipo: updated.tipo, mes: updated.mes, profesorId: updated.profesorId });
    res.json({ success: true, documento: { ...updated, firmaUrl: `/uploads/firmas/${updated.firmaPath}` } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error firmando documento' });
  }
});

app.get('/api/admin/documentos', auth, adminOnly, async (req, res) => {
  try {
    const docs = await prisma.documentoLegajo.findMany({
      include: { profesor: { select: { nombre: true, apellidos: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs.map(d => ({
      ...d,
      archivoUrl: `/uploads/documentos/${d.archivoPath}`,
      firmaUrl: d.firmaPath ? `/uploads/firmas/${d.firmaPath}` : null,
      profesorNombre: `${d.profesor.nombre} ${d.profesor.apellidos}`,
    })));
  } catch (err) { res.status(500).json({ error: 'Error obteniendo documentos' }); }
});

app.get('/api/admin/profesores/:id/documentos', auth, adminOnly, async (req, res) => {
  try {
    const docs = await prisma.documentoLegajo.findMany({
      where: { profesorId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs.map(d => ({
      ...d,
      archivoUrl: `/uploads/documentos/${d.archivoPath}`,
      firmaUrl: d.firmaPath ? `/uploads/firmas/${d.firmaPath}` : null,
    })));
  } catch (err) { res.status(500).json({ error: 'Error obteniendo documentos' }); }
});

// ============ ADMIN — Presencia en tiempo real ============
// ============ COLABORADORES Y SUBCONTRATAS ============
// Escuelas y autónomos con los que se intercambian horas. Administración lo gestiona todo; si el colaborador tiene correo
// se le puede dar acceso (opcional) a un portal de solo lectura donde acepta o pide revisar las horas.
const fechaValida = f => FECHA_RE.test(f || '') && !isNaN(new Date(`${f}T12:00:00`));
const signoMov = m => (m.sentido === 'DADAS' ? 1 : -1);

// Saldo: + a favor de la escuela (nos deben), − en contra (les debemos). Lo que está en revisión queda aparte hasta aclararlo.
function saldoDe(movs, liqs) {
  let horas = 0, euros = 0, enRevisionH = 0, dadas = 0, recibidas = 0;
  for (const m of movs) {
    if (m.estado === 'EN_REVISION') { enRevisionH += m.horas; continue; }
    horas += signoMov(m) * m.horas; euros += signoMov(m) * m.horas * m.tarifaHora;
    if (m.sentido === 'DADAS') dadas += m.horas; else recibidas += m.horas;
  }
  for (const l of liqs) { horas -= l.horas; euros -= l.importe; }
  return { horas: r2(horas), euros: r2(euros), dadas: r2(dadas), recibidas: r2(recibidas), enRevisionHoras: r2(enRevisionH),
    pendientes: movs.filter(m => m.estado === 'PENDIENTE').length, enRevision: movs.filter(m => m.estado === 'EN_REVISION').length };
}
const colabPublico = c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, cif: c.cif, email: c.email, telefono: c.telefono, contacto: c.contacto, tarifaHora: c.tarifaHora, notas: c.notas, activo: c.activo });
const accesoDe = c => { const u = (c.usuarios || [])[0]; return u ? { activo: u.activo, entro: !!u.adheridoAt } : null; };

function validarColab(b, parcial = false) {
  const d = {};
  if (b.nombre !== undefined || !parcial) { const n = String(b.nombre || '').trim(); if (!n) return { error: 'El nombre es obligatorio' }; d.nombre = n.slice(0, 120); }
  if (b.tipo !== undefined || !parcial) { if (!['ESCUELA', 'AUTONOMO'].includes(b.tipo || 'ESCUELA')) return { error: 'Tipo no válido' }; d.tipo = b.tipo || 'ESCUELA'; }
  if (b.email !== undefined) {
    const e = String(b.email || '').toLowerCase().trim();
    if (e && !EMAIL_RE.test(e)) return { error: 'Email inválido' };
    d.email = e || null;
  }
  for (const k of ['cif', 'telefono', 'contacto', 'notas']) if (b[k] !== undefined) d[k] = String(b[k] || '').trim().slice(0, 500) || null;
  if (b.tarifaHora !== undefined || !parcial) { const t = Number(b.tarifaHora ?? 0); if (!(t >= 0 && t <= 1000)) return { error: 'Valor hora no válido' }; d.tarifaHora = r2(t); }
  if (b.activo !== undefined) d.activo = !!b.activo;
  return { d };
}
function validarMov(b, tarifaDefecto) {
  if (!fechaValida(b.fecha)) return { error: 'Fecha no válida (AAAA-MM-DD)' };
  if (!['DADAS', 'RECIBIDAS'].includes(b.sentido)) return { error: 'Indica si son horas dadas o recibidas' };
  const horas = Number(b.horas);
  if (!(horas > 0 && horas <= 500)) return { error: 'Las horas deben ser mayores que 0' };
  const tarifa = b.tarifaHora === undefined || b.tarifaHora === '' ? tarifaDefecto : Number(b.tarifaHora);
  if (!(tarifa >= 0 && tarifa <= 1000)) return { error: 'Valor hora no válido' };
  return { d: { fecha: b.fecha, sentido: b.sentido, horas: r2(horas), tarifaHora: r2(tarifa), nota: String(b.nota || '').trim().slice(0, 300) || null } };
}
const avisarColaborador = async (req, colab, titulo, mensaje) => {
  const us = await prisma.profesor.findMany({ where: { colaboradorId: colab.id, activo: true }, select: { id: true } });
  if (us.length) await prisma.notificacion.createMany({ data: us.map(u => ({ titulo, mensaje, tipo: 'INFO', profesorId: u.id, enviadaPorId: req.user.userId })) }).catch(() => {});
};

app.get('/api/admin/colaboradores', auth, adminOnly, async (req, res) => {
  try {
    const cols = await prisma.colaborador.findMany({ orderBy: { nombre: 'asc' }, include: { movimientos: true, liquidaciones: true, usuarios: { select: { activo: true, adheridoAt: true } } } });
    res.json(cols.map(c => ({ ...colabPublico(c), acceso: accesoDe(c), saldo: saldoDe(c.movimientos, c.liquidaciones) })));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error obteniendo colaboradores' }); }
});

// Estadísticas para el dashboard: horas dadas y recibidas por mes, saldo por colaborador y totales
app.get('/api/admin/colaboradores/estadisticas', auth, adminOnly, async (req, res) => {
  try {
    const nMeses = Math.min(24, Math.max(1, parseInt(req.query.meses) || 12));
    const [cols, movs, liqs] = await Promise.all([
      prisma.colaborador.findMany({ orderBy: { nombre: 'asc' } }), prisma.movimientoHoras.findMany(), prisma.liquidacion.findMany(),
    ]);
    const ahora = new Date();
    const meses = Array.from({ length: nMeses }, (_, i) => { const d = new Date(ahora.getFullYear(), ahora.getMonth() - (nMeses - 1 - i), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
    const porMes = meses.map(mes => {
      const m = movs.filter(x => x.fecha.startsWith(mes) && x.estado !== 'EN_REVISION');
      const dadas = r2(m.filter(x => x.sentido === 'DADAS').reduce((a, x) => a + x.horas, 0));
      const recibidas = r2(m.filter(x => x.sentido === 'RECIBIDAS').reduce((a, x) => a + x.horas, 0));
      return { mes, dadas, recibidas, neto: r2(dadas - recibidas) };
    });
    const porColaborador = cols.map(c => {
      const s = saldoDe(movs.filter(x => x.colaboradorId === c.id), liqs.filter(x => x.colaboradorId === c.id));
      return { id: c.id, nombre: c.nombre, tipo: c.tipo, activo: c.activo, ...s };
    });
    res.json({
      meses: porMes, colaboradores: porColaborador,
      totales: {
        aFavorEuros: r2(porColaborador.filter(c => c.euros > 0).reduce((a, c) => a + c.euros, 0)),
        enContraEuros: r2(-porColaborador.filter(c => c.euros < 0).reduce((a, c) => a + c.euros, 0)),
        aFavorHoras: r2(porColaborador.filter(c => c.horas > 0).reduce((a, c) => a + c.horas, 0)),
        enContraHoras: r2(-porColaborador.filter(c => c.horas < 0).reduce((a, c) => a + c.horas, 0)),
        pendientes: porColaborador.reduce((a, c) => a + c.pendientes, 0), enRevision: porColaborador.reduce((a, c) => a + c.enRevision, 0),
      },
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error calculando estadísticas' }); }
});

// Todo lo cargado en un día (de todos los colaboradores): base de la pantalla de carga rápida
app.get('/api/admin/colaboradores/dia', auth, adminOnly, async (req, res) => {
  try {
    const fecha = req.query.fecha || fechaLocal(new Date());
    if (!fechaValida(fecha)) return res.status(400).json({ error: 'Fecha no válida' });
    const movs = await prisma.movimientoHoras.findMany({ where: { fecha }, orderBy: { createdAt: 'asc' }, include: { colaborador: { select: { id: true, nombre: true } } } });
    res.json({ fecha, movimientos: movs });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error obteniendo el día' }); }
});

app.post('/api/admin/colaboradores', auth, adminOnly, async (req, res) => {
  try {
    const v = validarColab(req.body); if (v.error) return res.status(400).json({ error: v.error });
    const c = await prisma.colaborador.create({ data: v.d });
    await auditar(req, 'colaborador.crear', null, { nombre: c.nombre });
    res.json(colabPublico(c));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error creando colaborador' }); }
});

app.get('/api/admin/colaboradores/:id', auth, adminOnly, async (req, res) => {
  try {
    const c = await prisma.colaborador.findUnique({ where: { id: req.params.id }, include: { usuarios: { select: { activo: true, adheridoAt: true } } } });
    if (!c) return res.status(404).json({ error: 'Colaborador no encontrado' });
    const { desde, hasta } = req.query;
    if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta))) return res.status(400).json({ error: 'Fechas no válidas' });
    const [movs, liqs] = await Promise.all([
      prisma.movimientoHoras.findMany({ where: { colaboradorId: c.id }, orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }] }),
      prisma.liquidacion.findMany({ where: { colaboradorId: c.id }, orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    const enRango = f => (!desde || f >= desde) && (!hasta || f <= hasta);
    const movP = movs.filter(m => enRango(m.fecha)), liqP = liqs.filter(l => enRango(l.fecha));
    const out = {
      colaborador: { ...colabPublico(c), acceso: accesoDe(c) },
      saldo: saldoDe(movs, liqs), movimientos: movP, liquidaciones: liqP,
    };
    if (desde || hasta) {
      out.periodo = { desde: desde || null, hasta: hasta || null,
        saldoAnterior: desde ? saldoDe(movs.filter(m => m.fecha < desde), liqs.filter(l => l.fecha < desde)) : null,
        saldoFinal: hasta ? saldoDe(movs.filter(m => m.fecha <= hasta), liqs.filter(l => l.fecha <= hasta)) : saldoDe(movs, liqs) };
    }
    res.json(out);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error obteniendo el colaborador' }); }
});

app.put('/api/admin/colaboradores/:id', auth, adminOnly, async (req, res) => {
  try {
    const c = await prisma.colaborador.findUnique({ where: { id: req.params.id }, include: { usuarios: true } });
    if (!c) return res.status(404).json({ error: 'Colaborador no encontrado' });
    const v = validarColab(req.body, true); if (v.error) return res.status(400).json({ error: v.error });
    if (v.d.email !== undefined && c.usuarios.length && v.d.email !== c.email) return res.status(400).json({ error: 'Quita el acceso al portal antes de cambiar el correo' });
    const n = await prisma.colaborador.update({ where: { id: c.id }, data: v.d });
    if (v.d.activo === false) { await prisma.profesor.updateMany({ where: { colaboradorId: c.id }, data: { activo: false } }); c.usuarios.forEach(u => invalidarUsuario(u.id)); }
    await auditar(req, 'colaborador.editar', null, { id: c.id, campos: Object.keys(v.d) });
    res.json(colabPublico(n));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error guardando' }); }
});

// Horas dadas / recibidas
app.post('/api/admin/colaboradores/:id/horas', auth, adminOnly, async (req, res) => {
  try {
    const c = await prisma.colaborador.findUnique({ where: { id: req.params.id } });
    if (!c || !c.activo) return res.status(404).json({ error: 'Colaborador no encontrado o inactivo' });
    const v = validarMov(req.body, c.tarifaHora); if (v.error) return res.status(400).json({ error: v.error });
    const m = await prisma.movimientoHoras.create({ data: { ...v.d, colaboradorId: c.id, creadoPorId: req.user.userId } });
    await avisarColaborador(req, c, 'Nuevas horas en tu cuenta', `${v.d.sentido === 'DADAS' ? 'Horas que te dimos' : 'Horas que nos diste'}: ${v.d.horas} h el ${v.d.fecha}. Revísalas y acéptalas o pide revisión.`);
    await auditar(req, 'colaborador.horas_crear', null, { colaborador: c.nombre, ...v.d });
    res.json(m);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error cargando horas' }); }
});

app.put('/api/admin/colaboradores/horas/:mid', auth, adminOnly, async (req, res) => {
  try {
    const m = await prisma.movimientoHoras.findUnique({ where: { id: req.params.mid }, include: { colaborador: true } });
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' });
    const v = validarMov({ ...m, ...req.body }, m.tarifaHora); if (v.error) return res.status(400).json({ error: v.error });
    const n = await prisma.movimientoHoras.update({ where: { id: m.id }, data: { ...v.d, estado: 'PENDIENTE', notaColaborador: null, respondidoAt: null } });
    await avisarColaborador(req, m.colaborador, 'Se modificaron unas horas de tu cuenta', `Revisa las horas del ${v.d.fecha} y vuelve a aceptarlas.`);
    await auditar(req, 'colaborador.horas_editar', null, { id: m.id, antes: { fecha: m.fecha, sentido: m.sentido, horas: m.horas, tarifaHora: m.tarifaHora }, despues: v.d });
    res.json(n);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error modificando horas' }); }
});

// Administración marca las horas como aceptadas (p. ej. confirmadas por teléfono) o las devuelve a pendientes
app.post('/api/admin/colaboradores/horas/:mid/estado', auth, adminOnly, async (req, res) => {
  try {
    const estado = req.body.estado;
    if (!['ACEPTADA', 'PENDIENTE'].includes(estado)) return res.status(400).json({ error: 'Estado no válido' });
    const m = await prisma.movimientoHoras.findUnique({ where: { id: req.params.mid } });
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' });
    const n = await prisma.movimientoHoras.update({ where: { id: m.id }, data: { estado, respondidoAt: estado === 'ACEPTADA' ? new Date() : null, notaColaborador: estado === 'ACEPTADA' ? (String(req.body.nota || '').trim().slice(0, 300) || 'Confirmada por administración') : null } });
    await auditar(req, 'colaborador.horas_estado', null, { id: m.id, estado });
    res.json(n);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error actualizando' }); }
});

app.delete('/api/admin/colaboradores/horas/:mid', auth, adminOnly, async (req, res) => {
  try {
    const m = await prisma.movimientoHoras.findUnique({ where: { id: req.params.mid } });
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' });
    await prisma.movimientoHoras.delete({ where: { id: m.id } });
    await auditar(req, 'colaborador.horas_borrar', null, { fecha: m.fecha, sentido: m.sentido, horas: m.horas, estado: m.estado });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error borrando' }); }
});

// Saldar: pago en dinero o compensación (horas contra horas). Sin `horas` salda todo el saldo.
app.post('/api/admin/colaboradores/:id/liquidar', auth, adminOnly, async (req, res) => {
  try {
    const c = await prisma.colaborador.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Colaborador no encontrado' });
    const tipo = req.body.tipo;
    if (!['PAGO', 'COMPENSACION'].includes(tipo)) return res.status(400).json({ error: 'Indica si es un pago o una compensación' });
    const fecha = req.body.fecha || fechaLocal(new Date());
    if (!fechaValida(fecha)) return res.status(400).json({ error: 'Fecha no válida' });
    const [movs, liqs] = await Promise.all([prisma.movimientoHoras.findMany({ where: { colaboradorId: c.id } }), prisma.liquidacion.findMany({ where: { colaboradorId: c.id } })]);
    const s = saldoDe(movs, liqs);
    if (Math.abs(s.horas) < 0.01) return res.status(400).json({ error: 'No hay saldo que saldar' });
    const signo = s.horas > 0 ? 1 : -1, max = Math.abs(s.horas);
    const horas = req.body.horas === undefined || req.body.horas === '' ? max : r2(Number(req.body.horas));
    if (!(horas > 0) || horas > max + 0.001) return res.status(400).json({ error: `Las horas a saldar deben estar entre 0 y ${max}` });
    const completo = Math.abs(horas - max) < 0.01;
    const valor = req.body.importe === undefined || req.body.importe === '' ? (completo ? Math.abs(s.euros) : horas * c.tarifaHora) : Number(req.body.importe);
    if (!(valor >= 0 && valor <= 1e6)) return res.status(400).json({ error: 'Importe no válido' });
    const l = await prisma.liquidacion.create({ data: {
      colaboradorId: c.id, fecha, tipo, horas: signo * (completo ? max : horas), importe: signo * r2(valor),
      nota: String(req.body.nota || '').trim().slice(0, 300) || null, creadoPorId: req.user.userId,
    } });
    await avisarColaborador(req, c, 'Se saldaron horas de tu cuenta', `${tipo === 'PAGO' ? 'Pago' : 'Compensación'} de ${Math.abs(l.horas)} h (${Math.abs(l.importe)} €).`);
    await auditar(req, 'colaborador.liquidar', null, { colaborador: c.nombre, tipo, horas: l.horas, importe: l.importe });
    res.json(l);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error saldando' }); }
});

app.delete('/api/admin/colaboradores/liquidaciones/:lid', auth, adminOnly, async (req, res) => {
  try {
    const l = await prisma.liquidacion.findUnique({ where: { id: req.params.lid } });
    if (!l) return res.status(404).json({ error: 'Liquidación no encontrada' });
    await prisma.liquidacion.delete({ where: { id: l.id } });
    await auditar(req, 'colaborador.liquidacion_anular', null, { fecha: l.fecha, tipo: l.tipo, horas: l.horas, importe: l.importe });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error anulando' }); }
});

// Acceso opcional al portal del colaborador
app.post('/api/admin/colaboradores/:id/acceso', auth, adminOnly, async (req, res) => {
  try {
    const c = await prisma.colaborador.findUnique({ where: { id: req.params.id }, include: { usuarios: true } });
    if (!c || !c.activo) return res.status(404).json({ error: 'Colaborador no encontrado o inactivo' });
    if (!c.email) return res.status(400).json({ error: 'Añade un correo al colaborador para darle acceso' });
    let u = c.usuarios[0];
    if (!u) {
      if (await prisma.profesor.findUnique({ where: { email: c.email } })) return res.status(400).json({ error: 'Ese correo ya está en uso por otra cuenta' });
      u = await prisma.profesor.create({ data: {
        email: c.email, nombre: c.nombre, apellidos: '', role: 'COLABORADOR', colaboradorId: c.id,
        password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
      } });
      await auditar(req, 'colaborador.acceso_crear', u);
    } else if (!u.activo) { u = await prisma.profesor.update({ where: { id: u.id }, data: { activo: true } }); invalidarUsuario(u.id); }
    await enviarMagicLink(u, { invitacion: true });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error dando acceso' }); }
});

app.delete('/api/admin/colaboradores/:id/acceso', auth, adminOnly, async (req, res) => {
  try {
    const us = await prisma.profesor.findMany({ where: { colaboradorId: req.params.id } });
    await prisma.profesor.updateMany({ where: { colaboradorId: req.params.id }, data: { activo: false } });
    us.forEach(u => invalidarUsuario(u.id));
    await auditar(req, 'colaborador.acceso_quitar', null, { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error quitando el acceso' }); }
});

// ---- Portal del colaborador (solo su propia cuenta) ----
async function colaboradorDe(req) {
  const u = await prisma.profesor.findUnique({ where: { id: req.user.userId }, select: { colaboradorId: true } });
  if (!u?.colaboradorId) return null;
  const c = await prisma.colaborador.findUnique({ where: { id: u.colaboradorId } });
  return c && c.activo ? c : null;
}
app.get('/api/colaborador/mi', auth, async (req, res) => {
  try {
    if (req.user.role !== 'COLABORADOR') return res.status(403).json({ error: 'Solo para colaboradores' });
    const c = await colaboradorDe(req); if (!c) return res.status(404).json({ error: 'Cuenta de colaborador no disponible' });
    const [movs, liqs, cfg] = await Promise.all([
      prisma.movimientoHoras.findMany({ where: { colaboradorId: c.id }, orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }] }),
      prisma.liquidacion.findMany({ where: { colaboradorId: c.id }, orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }] }),
      getConfig(),
    ]);
    // Visto desde la escuela: DADAS = horas que la escuela les dio. El portal lo etiqueta desde su punto de vista.
    res.json({ escuela: { nombre: cfg.nombre, cif: cfg.cif, email: cfg.email }, colaborador: { nombre: c.nombre, tipo: c.tipo, tarifaHora: c.tarifaHora }, saldo: saldoDe(movs, liqs), movimientos: movs, liquidaciones: liqs });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

app.post('/api/colaborador/horas/:mid/responder', auth, async (req, res) => {
  try {
    if (req.user.role !== 'COLABORADOR') return res.status(403).json({ error: 'Solo para colaboradores' });
    const c = await colaboradorDe(req); if (!c) return res.status(404).json({ error: 'Cuenta de colaborador no disponible' });
    const m = await prisma.movimientoHoras.findFirst({ where: { id: req.params.mid, colaboradorId: c.id } });
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' });
    const accion = req.body.accion, nota = String(req.body.nota || '').trim().slice(0, 300);
    if (!['ACEPTAR', 'REVISAR'].includes(accion)) return res.status(400).json({ error: 'Acción no válida' });
    if (accion === 'REVISAR' && nota.length < 5) return res.status(400).json({ error: 'Explica qué hay que revisar (mín. 5 caracteres)' });
    const n = await prisma.movimientoHoras.update({ where: { id: m.id }, data: { estado: accion === 'ACEPTAR' ? 'ACEPTADA' : 'EN_REVISION', notaColaborador: nota || null, respondidoAt: new Date() } });
    const admins = await prisma.profesor.findMany({ where: { role: 'ADMIN', activo: true }, select: { id: true } });
    await prisma.notificacion.createMany({ data: admins.map(a => ({
      titulo: accion === 'ACEPTAR' ? `${c.nombre} aceptó unas horas` : `${c.nombre} pide revisar unas horas`,
      mensaje: `${m.sentido === 'DADAS' ? 'Horas dadas' : 'Horas recibidas'} del ${m.fecha} (${m.horas} h).${nota ? ` Nota: ${nota}` : ''}`,
      tipo: accion === 'ACEPTAR' ? 'INFO' : 'AVISO', profesorId: a.id, enviadaPorId: req.user.userId,
    })) });
    await auditar(req, accion === 'ACEPTAR' ? 'colaborador.acepta' : 'colaborador.pide_revision', null, { id: m.id });
    res.json(n);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// ---- Corrección de fichajes (trazable: nunca se borra, se conserva el valor original, quién, cuándo y por qué) ----
const instante = v => { const d = new Date(v); return isNaN(d) ? null : d; };
// El trabajador siempre es informado de cualquier cambio en su registro
const avisarCorreccion = (req, profesorId, titulo, motivo) => prisma.notificacion.create({ data: {
  titulo, mensaje: `Motivo indicado por administración: ${String(motivo).trim()}. Si no estás de acuerdo, díselo a administración.`,
  tipo: 'AVISO', profesorId, enviadaPorId: req.user.userId,
} }).catch(e => console.error('aviso corrección:', e.message));
const foto = r => JSON.stringify({ tipo: r.tipo, timestamp: r.timestamp.toISOString() });

// Fichajes de un profesor en un mes (incluye anulados y su historial de cambios)
app.get('/api/admin/fichajes', auth, adminOnly, async (req, res) => {
  try {
    const { profesorId, mes } = req.query; // mes = AAAA-MM
    if (!profesorId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) return res.status(400).json({ error: 'Indica profesorId y mes (AAAA-MM)' });
    const [a, m] = mes.split('-').map(Number);
    const regs = await prisma.registroJornada.findMany({
      where: { profesorId, timestamp: { gte: new Date(a, m - 1, 1), lte: new Date(a, m, 0, 23, 59, 59, 999) } },
      orderBy: { timestamp: 'asc' }, include: { correcciones: { orderBy: { createdAt: 'asc' } } },
    });
    res.json(regs);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error obteniendo fichajes' }); }
});

app.post('/api/admin/fichajes', auth, adminOnly, async (req, res) => {
  try {
    const { profesorId, tipo, timestamp, motivo } = req.body;
    const ts = instante(timestamp);
    if (!['ENTRADA', 'SALIDA'].includes(tipo) || !ts) return res.status(400).json({ error: 'Tipo (ENTRADA/SALIDA) y fecha-hora válidos' });
    if (!motivo || String(motivo).trim().length < 5) return res.status(400).json({ error: 'Indica el motivo de la corrección (mín. 5 caracteres)' });
    if (ts > new Date()) return res.status(400).json({ error: 'No se puede registrar un fichaje futuro' });
    const prof = await prisma.profesor.findUnique({ where: { id: profesorId } });
    if (!prof) return res.status(404).json({ error: 'Profesor no encontrado' });
    const zona = await prisma.zonaFichaje.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!zona) return res.status(400).json({ error: 'Crea primero una zona de fichaje' });
    const reg = await prisma.registroJornada.create({ data: {
      profesorId, zonaId: zona.id, zonaNombre: 'Corrección de administración', tipo, timestamp: ts, origen: 'ADMIN',
    } });
    await prisma.correccionFichaje.create({ data: {
      registroId: reg.id, profesorId, accion: 'CREAR', nuevo: foto(reg), motivo: String(motivo).trim().slice(0, 500),
      actorId: req.user.userId, actorEmail: req.user.email,
    } });
    await auditar(req, 'fichaje.crear', prof, { tipo, timestamp: ts.toISOString() });
    await avisarCorreccion(req, profesorId, `Se añadió una ${tipo.toLowerCase()} a tu registro de jornada (${ts.toLocaleString('es-ES')})`, motivo);
    res.json(reg);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error creando fichaje' }); }
});

app.put('/api/admin/fichajes/:id', auth, adminOnly, async (req, res) => {
  try {
    const { tipo, timestamp, motivo } = req.body;
    const reg = await prisma.registroJornada.findUnique({ where: { id: req.params.id } });
    if (!reg || reg.anulado) return res.status(404).json({ error: 'Fichaje no encontrado' });
    if (!motivo || String(motivo).trim().length < 5) return res.status(400).json({ error: 'Indica el motivo de la corrección (mín. 5 caracteres)' });
    const data = {};
    if (tipo !== undefined) { if (!['ENTRADA', 'SALIDA'].includes(tipo)) return res.status(400).json({ error: 'Tipo no válido' }); data.tipo = tipo; }
    if (timestamp !== undefined) { const ts = instante(timestamp); if (!ts || ts > new Date()) return res.status(400).json({ error: 'Fecha-hora no válida' }); data.timestamp = ts; }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada que modificar' });
    const nuevo = await prisma.registroJornada.update({ where: { id: reg.id }, data });
    await prisma.correccionFichaje.create({ data: {
      registroId: reg.id, profesorId: reg.profesorId, accion: 'MODIFICAR', anterior: foto(reg), nuevo: foto(nuevo),
      motivo: String(motivo).trim().slice(0, 500), actorId: req.user.userId, actorEmail: req.user.email,
    } });
    await auditar(req, 'fichaje.modificar', { id: reg.profesorId }, { registro: reg.id });
    await avisarCorreccion(req, reg.profesorId, `Se modificó un fichaje de tu registro de jornada (ahora ${nuevo.tipo.toLowerCase()} del ${nuevo.timestamp.toLocaleString('es-ES')})`, motivo);
    res.json(nuevo);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error modificando fichaje' }); }
});

app.delete('/api/admin/fichajes/:id', auth, adminOnly, async (req, res) => {
  try {
    const motivo = req.body?.motivo || req.query.motivo;
    const reg = await prisma.registroJornada.findUnique({ where: { id: req.params.id } });
    if (!reg || reg.anulado) return res.status(404).json({ error: 'Fichaje no encontrado' });
    if (!motivo || String(motivo).trim().length < 5) return res.status(400).json({ error: 'Indica el motivo de la anulación (mín. 5 caracteres)' });
    await prisma.registroJornada.update({ where: { id: reg.id }, data: { anulado: true } });
    await prisma.correccionFichaje.create({ data: {
      registroId: reg.id, profesorId: reg.profesorId, accion: 'ANULAR', anterior: foto(reg),
      motivo: String(motivo).trim().slice(0, 500), actorId: req.user.userId, actorEmail: req.user.email,
    } });
    await auditar(req, 'fichaje.anular', { id: reg.profesorId }, { registro: reg.id });
    await avisarCorreccion(req, reg.profesorId, `Se anuló un fichaje de tu registro de jornada (${reg.tipo.toLowerCase()} del ${reg.timestamp.toLocaleString('es-ES')})`, motivo);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error anulando fichaje' }); }
});

app.get('/api/admin/fichajes-activos', auth, adminOnly, async (req, res) => {
  try {
    const ahora = new Date();
    const inicioHoy = new Date(ahora);
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(ahora);
    finHoy.setHours(23, 59, 59, 999);

    // Todos los registros de hoy, ordenados cronológicamente
    const registros = await prisma.registroJornada.findMany({
      where: { anulado: false, timestamp: { gte: inicioHoy, lte: finHoy } },
      include: {
        profesor: {
          select: { id: true, nombre: true, apellidos: true, tipoJornada: true, horasContrato: true, email: true },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Para cada profesor, quedarse con el último registro del día
    const porProfesor = {};
    registros.forEach(r => { porProfesor[r.profesorId] = r; });

    // Filtrar los que tienen ENTRADA como último registro
    const activos = Object.values(porProfesor)
      .filter(r => r.tipo === 'ENTRADA')
      .map(r => ({
        profesorId:        r.profesorId,
        nombre:            r.profesor.nombre,
        apellidos:         r.profesor.apellidos,
        tipoJornada:       r.profesor.tipoJornada,
        horasContrato:     r.profesor.horasContrato,
        email:             r.profesor.email,
        entradaTimestamp:  r.timestamp.toISOString(),
        entradaHora:       r.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        zona:              r.zonaNombre,
      }))
      .sort((a, b) => a.entradaTimestamp.localeCompare(b.entradaTimestamp));

    res.json({ activos, total: activos.length, actualizadoEn: ahora.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo fichajes activos' });
  }
});

// ============ NOTIFICACIONES ============
app.get('/api/notificaciones', auth, async (req, res) => {
  try {
    const notifs = await prisma.notificacion.findMany({
      where: { profesorId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { enviadaPor: { select: { nombre: true, apellidos: true } } },
    });
    res.json(notifs.map(n => ({ ...n, enviadoPorNombre: `${n.enviadaPor.nombre} ${n.enviadaPor.apellidos}` })));
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/notificaciones/leer-todas', auth, async (req, res) => {
  try {
    await prisma.notificacion.updateMany({ where: { profesorId: req.user.userId, leida: false }, data: { leida: true } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/notificaciones/:id/leer', auth, async (req, res) => {
  try {
    await prisma.notificacion.updateMany({ where: { id: req.params.id, profesorId: req.user.userId }, data: { leida: true } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/admin/notificaciones', auth, adminOnly, async (req, res) => {
  try {
    const { titulo, mensaje, tipo = 'INFO', destinatarioId } = req.body;
    if (!titulo || !mensaje) return res.status(400).json({ error: 'Faltan título y mensaje' });
    const destinatarios = destinatarioId
      ? [{ id: destinatarioId }]
      : await prisma.profesor.findMany({ where: { activo: true, NOT: { id: req.user.userId } }, select: { id: true } });
    if (!destinatarios.length) return res.status(400).json({ error: 'No hay destinatarios activos' });
    await prisma.notificacion.createMany({
      data: destinatarios.map(p => ({ titulo, mensaje, tipo, profesorId: p.id, enviadaPorId: req.user.userId })),
    });
    avisarWhatsapp(destinatarios.map(p => p.id), `${titulo}. ${mensaje}`);
    res.json({ success: true, enviadas: destinatarios.length });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error enviando notificación' }); }
});

app.get('/api/admin/notificaciones', auth, adminOnly, async (req, res) => {
  try {
    const notifs = await prisma.notificacion.findMany({
      orderBy: { createdAt: 'desc' }, take: 200,
      include: {
        profesor:   { select: { nombre: true, apellidos: true } },
        enviadaPor: { select: { nombre: true, apellidos: true } },
      },
    });
    res.json(notifs.map(n => ({
      ...n,
      profesorNombre:    `${n.profesor.nombre} ${n.profesor.apellidos}`,
      enviadoPorNombre:  `${n.enviadaPor.nombre} ${n.enviadaPor.apellidos}`,
    })));
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.delete('/api/admin/notificaciones/:id', auth, adminOnly, async (req, res) => {
  try {
    await prisma.notificacion.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// ============ CONFIG ESCUELA ============
async function getConfig() {
  return prisma.configEscuela.upsert({ where: { id: 'default' }, create: { id: 'default', nombre: '', cif: '', direccion: '', telefono: '' }, update: {} });
}

app.get('/api/config', async (req, res) => {
  try { res.json({ ...(await getConfig()), modulos: modulosEstado(), documentosHabilitados: DOCUMENTOS_ON, whatsappActivo: WHATSAPP_PERMITIDO && whatsapp.conectado() }); } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Apagar o encender módulos (cualquier administración). Cuerpo: { off: ['colaboradores', ...] }
app.get('/api/admin/modulos', auth, adminOnly, (req, res) => {
  res.json(Object.entries(MODULOS).map(([clave, m]) => ({ clave, nombre: m.nombre, activo: moduloActivo(clave), bloqueadoPorDespliegue: clave === 'documentos' && !DOCUMENTOS_ON })));
});
app.put('/api/admin/modulos', auth, adminOnly, async (req, res) => {
  try {
    const off = [...new Set((Array.isArray(req.body.off) ? req.body.off : []).map(String))];
    if (off.some(k => !MODULOS[k])) return res.status(400).json({ error: 'Módulo desconocido' });
    await getConfig();
    await prisma.configEscuela.update({ where: { id: 'default' }, data: { modulosOff: off.join(',') } });
    modulosOff = new Set(off);
    await auditar(req, 'config.modulos', null, { apagados: off });
    res.json(modulosEstado());
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error guardando los módulos' }); }
});

app.put('/api/admin/config', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, cif, direccion, telefono, email, colorPrimario } = req.body;
    const config = await prisma.configEscuela.upsert({
      where: { id: 'default' },
      create: { id: 'default', nombre, cif, direccion, telefono, email, colorPrimario },
      update: { nombre, cif, direccion, telefono, email, colorPrimario },
    });
    res.json(config);
  } catch (err) { res.status(500).json({ error: 'Error guardando configuración' }); }
});

// ============ CLASES DADAS / PRIMAS ============
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const r2 = n => Math.round(n * 100) / 100;
const escHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Catálogo (tipos de clase y primas activas) para el formulario de carga
app.get('/api/clases/catalogo', auth, async (req, res) => {
  try {
    const [tipos, primas] = await Promise.all([
      prisma.tipoClase.findMany({ where: { activo: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] }),
      prisma.primaClase.findMany({ where: { activa: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] }),
    ]);
    res.json({ tipos, primas });
  } catch (err) { res.status(500).json({ error: 'Error obteniendo catálogo' }); }
});

// Admin: configuración de tipos y primas (alta, edición, baja lógica)
function crudCatalogo(ruta, modelo, campoActivo, extra = () => ({})) {
  app.get(`/api/admin/${ruta}`, auth, adminOnly, async (req, res) => {
    try { res.json(await prisma[modelo].findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })); }
    catch { res.status(500).json({ error: 'Error' }); }
  });
  app.post(`/api/admin/${ruta}`, auth, adminOnly, async (req, res) => {
    try {
      const nombre = String(req.body.nombre || '').trim();
      if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
      if (await prisma[modelo].findUnique({ where: { nombre } })) return res.status(400).json({ error: 'Ya existe uno con ese nombre' });
      res.json(await prisma[modelo].create({ data: { nombre, ...extra(req.body) } }));
    } catch { res.status(500).json({ error: 'Error creando' }); }
  });
  app.put(`/api/admin/${ruta}/:id`, auth, adminOnly, async (req, res) => {
    try {
      const data = {};
      if (req.body.nombre !== undefined) {
        const nombre = String(req.body.nombre).trim();
        if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
        const dup = await prisma[modelo].findUnique({ where: { nombre } });
        if (dup && dup.id !== req.params.id) return res.status(400).json({ error: 'Ya existe uno con ese nombre' });
        data.nombre = nombre;
      }
      if (req.body[campoActivo] !== undefined) data[campoActivo] = !!req.body[campoActivo];
      Object.assign(data, extra(req.body));
      res.json(await prisma[modelo].update({ where: { id: req.params.id }, data }));
    } catch { res.status(500).json({ error: 'Error actualizando' }); }
  });
}
crudCatalogo('tipos-clase', 'tipoClase', 'activo');
const importeONull = v => (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) ? null : Math.max(0, r2(parseFloat(v)));
crudCatalogo('primas', 'primaClase', 'activa', b => {
  const d = {};
  if (b.importe !== undefined) d.importe = importeONull(b.importe);
  if (b.modo !== undefined && ['POR_HORA', 'POR_CLASE'].includes(b.modo)) d.modo = b.modo;
  return d;
});

const incluirClase = { tipo: true, primas: true };
const mapClase = c => ({
  id: c.id, fecha: c.fecha, horas: c.horas, notas: c.notas, marca: c.marca, notaAdmin: c.notaAdmin,
  tipoId: c.tipoId, tipoNombre: c.tipo.nombre,
  primas: c.primas.map(p => ({ id: p.id, nombre: p.nombre })),
});

async function mesConfirmado(profesorId, mes) {
  return prisma.confirmacionClases.findUnique({ where: { profesorId_mes: { profesorId, mes } } });
}

async function validarClase(body) {
  const horas = parseFloat(body.horas);
  if (!FECHA_RE.test(body.fecha || '') || isNaN(new Date(body.fecha).getTime())) return { error: 'Fecha inválida' };
  if (!(horas > 0 && horas <= 12)) return { error: 'Las horas deben estar entre 0,25 y 12' };
  if (!body.tipoId) return { error: 'Elige el tipo de clase' };
  const tipo = await prisma.tipoClase.findUnique({ where: { id: body.tipoId } });
  if (!tipo) return { error: 'Tipo de clase inexistente' };
  const primaIds = Array.isArray(body.primaIds) ? [...new Set(body.primaIds)] : [];
  const primas = primaIds.length ? await prisma.primaClase.findMany({ where: { id: { in: primaIds } } }) : [];
  if (primas.length !== primaIds.length) return { error: 'Prima inexistente' };
  return {
    data: { fecha: body.fecha, horas: Math.round(horas * 4) / 4, tipoId: tipo.id, notas: (body.notas || '').toString().slice(0, 300) || null },
    primaIds,
  };
}

// Profesor: cargar una clase dada
app.post('/api/clases', auth, async (req, res) => {
  try {
    const v = await validarClase(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    if (await mesConfirmado(req.user.userId, v.data.fecha.slice(0, 7)))
      return res.status(400).json({ error: 'Ese mes ya está confirmado. Pide al administrador que lo reabra.' });
    const c = await prisma.claseDada.create({
      data: { ...v.data, profesorId: req.user.userId, primas: { connect: v.primaIds.map(id => ({ id })) } },
      include: incluirClase,
    });
    res.json(mapClase(c));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error guardando la clase' }); }
});

app.put('/api/clases/:id', auth, async (req, res) => {
  try {
    const actual = await prisma.claseDada.findUnique({ where: { id: req.params.id } });
    if (!actual || actual.profesorId !== req.user.userId) return res.status(404).json({ error: 'Clase no encontrada' });
    const v = await validarClase(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    for (const mes of new Set([actual.fecha.slice(0, 7), v.data.fecha.slice(0, 7)]))
      if (await mesConfirmado(req.user.userId, mes)) return res.status(400).json({ error: 'Ese mes ya está confirmado.' });
    const c = await prisma.claseDada.update({
      where: { id: actual.id },
      data: { ...v.data, primas: { set: v.primaIds.map(id => ({ id })) } },
      include: incluirClase,
    });
    res.json(mapClase(c));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error actualizando la clase' }); }
});

app.delete('/api/clases/:id', auth, async (req, res) => {
  try {
    const actual = await prisma.claseDada.findUnique({ where: { id: req.params.id } });
    if (!actual || actual.profesorId !== req.user.userId) return res.status(404).json({ error: 'Clase no encontrada' });
    if (await mesConfirmado(req.user.userId, actual.fecha.slice(0, 7)))
      return res.status(400).json({ error: 'Ese mes ya está confirmado.' });
    await prisma.claseDada.delete({ where: { id: actual.id } });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error eliminando la clase' }); }
});

// Informe del mes de un profesor (propio; el admin puede pedir ?profesorId=)
async function construirInformeClases(profesorId, mes) {
  const [profesor, clases, conf, primasCat, revision] = await Promise.all([
    prisma.profesor.findUnique({ where: { id: profesorId }, select: { id: true, nombre: true, apellidos: true, email: true, tarifaHora: true } }),
    prisma.claseDada.findMany({
      where: { profesorId, fecha: { startsWith: mes } },
      include: incluirClase, orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    }),
    mesConfirmado(profesorId, mes),
    prisma.primaClase.findMany(),
    prisma.revisionMes.findUnique({ where: { profesorId_mes: { profesorId, mes } } }),
  ]);
  if (!profesor) return null;
  // Mes confirmado → se usan las tarifas congeladas al confirmar; si no, las vigentes.
  const tarifaHora = conf ? conf.tarifaHora : (profesor.tarifaHora ?? null);
  const tarifasPrima = conf?.primasJson
    ? JSON.parse(conf.primasJson)
    : Object.fromEntries(primasCat.map(p => [p.id, { importe: p.importe, modo: p.modo }]));

  const porTipo = {}, porDia = {}, desglose = {};
  let base = null, primasTotal = null;
  const detalle = clases.map(c => {
    const m = mapClase(c);
    const impBase = tarifaHora != null ? r2(c.horas * tarifaHora) : null;
    let impPrimas = null;
    m.primas.forEach(p => {
      const t = tarifasPrima[p.id];
      const d = desglose[p.nombre] || (desglose[p.nombre] = { nombre: p.nombre, horas: 0, clases: 0, importe: null });
      d.horas = r2(d.horas + c.horas); d.clases += 1;
      if (t && t.importe != null) {
        const imp = r2(t.modo === 'POR_CLASE' ? t.importe : t.importe * c.horas);
        impPrimas = r2((impPrimas || 0) + imp);
        d.importe = r2((d.importe || 0) + imp);
      }
    });
    if (impBase != null) base = r2((base || 0) + impBase);
    if (impPrimas != null) primasTotal = r2((primasTotal || 0) + impPrimas);
    m.importe = impBase == null && impPrimas == null ? null : r2((impBase || 0) + (impPrimas || 0));
    porTipo[m.tipoNombre] = r2((porTipo[m.tipoNombre] || 0) + c.horas);
    porDia[m.fecha] = r2((porDia[m.fecha] || 0) + c.horas);
    return m;
  });
  const totalHoras = r2(detalle.reduce((s, c) => s + c.horas, 0));
  const importeTotal = base == null && primasTotal == null ? null : r2((base || 0) + (primasTotal || 0));
  return {
    profesor: { id: profesor.id, nombre: profesor.nombre, apellidos: profesor.apellidos, email: profesor.email },
    mes, detalle, totalHoras, porTipo, porDia,
    desglosePrimas: Object.values(desglose),
    diasConClases: Object.keys(porDia).length,
    tarifaHora, importeBase: base, importePrimas: primasTotal, importeTotal,
    confirmado: !!conf, confirmadoAt: conf?.confirmadoAt ?? null,
    revision: revision ? { estado: revision.estado, nota: revision.nota, revisadoAt: revision.revisadoAt } : null,
  };
}

app.get('/api/clases/informe/:mes', auth, async (req, res) => {
  try {
    if (!MES_RE.test(req.params.mes)) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' });
    const pid = req.user.role === 'ADMIN' && req.query.profesorId ? req.query.profesorId : req.user.userId;
    const informe = await construirInformeClases(pid, req.params.mes);
    if (!informe) return res.status(404).json({ error: 'Profesor no encontrado' });
    if (req.user.role === 'ADMIN' && req.query.profesorId) informe.planning = await comparativaPlanning(pid, req.params.mes, informe);
    res.json(informe);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error generando informe' }); }
});

// Totales de clases por mes en un rango (mes en curso, temporada…). Propio; el admin puede pedir ?profesorId=
app.get('/api/clases/periodo', auth, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!MES_RE.test(desde || '') || !MES_RE.test(hasta || '') || desde > hasta) return res.status(400).json({ error: 'Rango inválido (AAAA-MM)' });
    const pid = req.user.role === 'ADMIN' && req.query.profesorId ? req.query.profesorId : req.user.userId;
    const meses = [];
    for (let [y, m] = desde.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= hasta && meses.length < 24; m === 12 ? (y++, m = 1) : m++)
      meses.push(`${y}-${String(m).padStart(2, '0')}`);
    const informes = await Promise.all(meses.map(mes => construirInformeClases(pid, mes)));
    if (!informes[0]) return res.status(404).json({ error: 'Profesor no encontrado' });
    const filas = informes.map((i, k) => ({ mes: meses[k], horas: i.totalHoras, clases: i.detalle.length, importe: i.importeTotal, confirmado: i.confirmado }));
    const conImporte = filas.some(f => f.importe != null);
    res.json({
      desde, hasta, meses: filas,
      totalHoras: r2(filas.reduce((t, f) => t + f.horas, 0)),
      totalClases: filas.reduce((t, f) => t + f.clases, 0),
      totalImporte: conImporte ? r2(filas.reduce((t, f) => t + (f.importe || 0), 0)) : null,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error calculando el período' }); }
});

// Profesor: confirmar las horas del mes → avisa al administrador
app.post('/api/clases/confirmar-mes', auth, async (req, res) => {
  try {
    const { mes } = req.body;
    if (!MES_RE.test(mes || '')) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' });
    if (await mesConfirmado(req.user.userId, mes)) return res.status(400).json({ error: 'El mes ya estaba confirmado' });
    const informe = await construirInformeClases(req.user.userId, mes);
    if (!informe.detalle.length) return res.status(400).json({ error: 'No hay clases cargadas en ese mes' });
    const [prof, primasCat] = await Promise.all([
      prisma.profesor.findUnique({ where: { id: req.user.userId }, select: { tarifaHora: true } }),
      prisma.primaClase.findMany(),
    ]);
    await prisma.revisionMes.updateMany({ where: { profesorId: req.user.userId, mes }, data: { estado: 'PENDIENTE', revisadoAt: new Date() } });
    await prisma.confirmacionClases.create({ data: {
      profesorId: req.user.userId, mes, tarifaHora: prof.tarifaHora ?? null,
      primasJson: JSON.stringify(Object.fromEntries(primasCat.map(p => [p.id, { importe: p.importe, modo: p.modo }]))),
    } });

    const nombre = `${informe.profesor.nombre} ${informe.profesor.apellidos}`;
    const admins = await prisma.profesor.findMany({ where: { role: 'ADMIN', activo: true }, select: { id: true, email: true } });
    await prisma.notificacion.createMany({
      data: admins.map(a => ({
        titulo: 'Horas de clases confirmadas',
        mensaje: `${nombre} confirmó ${informe.totalHoras} h de clases de ${mes}.`,
        tipo: 'INFO', profesorId: a.id, enviadaPorId: req.user.userId,
      })),
    });
    const cfg = await getConfig();
    const destinos = [...new Set([cfg.email, ...admins.map(a => a.email)].filter(Boolean))];
    const fila = (k, v, pre = '') => `<tr><td style="padding:4px 12px">${pre}${escHtml(k)}</td><td style="padding:4px 12px;text-align:right">${v} h</td></tr>`;
    const filas = Object.entries(informe.porTipo).map(([k, v]) => fila(k, v)).join('')
      + informe.desglosePrimas.map(d => fila(d.nombre, d.horas, '+ ')).join('');
    Promise.all(destinos.map(d => enviarEmail(d, `Horas de clases confirmadas — ${nombre} (${mes})`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#0f4c81">⛷️ ${escHtml(nombre)} confirmó sus horas de ${mes}</h2>
        <p><strong>Total:</strong> ${informe.totalHoras} h en ${informe.diasConClases} días${informe.importeTotal != null ? ` · <strong>${informe.importeTotal} €</strong>` : ''}</p>
        <table style="border-collapse:collapse;background:#f0f7ff">${filas}</table>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Ver el detalle en Ski Jornada →</a></p>
      </div>`))).catch(console.error);
    emitirEvento('clases.mes_confirmado', { email: informe.profesor.email, mes, totalHoras: informe.totalHoras, diasConClases: informe.diasConClases });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error confirmando el mes' }); }
});

// Admin: resumen de todos los profesores en un mes
app.get('/api/admin/clases/resumen/:mes', auth, adminOnly, async (req, res) => {
  try {
    if (!MES_RE.test(req.params.mes)) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' });
    const mes = req.params.mes;
    const profesores = await prisma.profesor.findMany({
      where: { activo: true, role: 'PROFESOR' }, orderBy: { apellidos: 'asc' }, select: { id: true },
    });
    const informes = await Promise.all(profesores.map(p => construirInformeClases(p.id, mes)));
    res.json(informes.map(i => ({
      id: i.profesor.id, nombre: i.profesor.nombre, apellidos: i.profesor.apellidos,
      totalHoras: i.totalHoras, cantidadClases: i.detalle.length, diasConClases: i.diasConClases,
      tarifaHora: i.tarifaHora, importeTotal: i.importeTotal,
      confirmado: i.confirmado, confirmadoAt: i.confirmadoAt, revisionEstado: i.revision?.estado ?? null,
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// Admin: revisión del mes de un profesor (aprobar, marcar discrepancia, pedir corrección o dejar un comentario)
const ESTADOS_REVISION = ['APROBADO', 'DISCREPANCIA', 'CORRECCION', 'COMENTARIO'];
app.post('/api/admin/clases/revision', auth, adminOnly, async (req, res) => {
  try {
    const { profesorId, mes, estado } = req.body;
    const nota = String(req.body.nota || '').trim().slice(0, 600) || null;
    if (!profesorId || !MES_RE.test(mes || '')) return res.status(400).json({ error: 'Datos inválidos' });
    if (!ESTADOS_REVISION.includes(estado)) return res.status(400).json({ error: 'Estado de revisión inválido' });
    if (['DISCREPANCIA', 'CORRECCION', 'COMENTARIO'].includes(estado) && !nota)
      return res.status(400).json({ error: 'Escribe una nota para el profesor' });
    const prof = await prisma.profesor.findUnique({ where: { id: profesorId } });
    if (!prof) return res.status(404).json({ error: 'Profesor no encontrado' });

    const rev = await prisma.revisionMes.upsert({
      where: { profesorId_mes: { profesorId, mes } },
      create: { profesorId, mes, estado, nota, revisadoPorId: req.user.userId },
      update: { estado, nota, revisadoPorId: req.user.userId, revisadoAt: new Date() },
    });
    // Pedir corrección = reabrir el mes para que el profesor edite
    if (estado === 'CORRECCION') await prisma.confirmacionClases.deleteMany({ where: { profesorId, mes } });

    const titulos = {
      APROBADO: 'Horas aprobadas', DISCREPANCIA: 'Discrepancia en tus horas',
      CORRECCION: 'Corrección solicitada', COMENTARIO: 'Comentario sobre tus horas',
    };
    await prisma.notificacion.create({ data: {
      titulo: `${titulos[estado]} · ${mes}`,
      mensaje: nota || 'El administrador revisó tus horas y están correctas.',
      tipo: estado === 'APROBADO' ? 'INFO' : 'AVISO', profesorId, enviadaPorId: req.user.userId,
    } });
    avisarWhatsapp([profesorId], `${titulos[estado]} (${mes}).${nota ? ` ${nota}` : ''}`);
    enviarEmail(prof.email, `${titulos[estado]} (${mes})`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#0f4c81">⛷️ ${titulos[estado]} — ${mes}</h2>
        <p>${escHtml(nota || 'El administrador revisó tus horas y están correctas.')}</p>
        <p><a href="${(process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim()}">Abrir Ski Jornada →</a></p>
      </div>`).catch(console.error);
    emitirEvento('clases.revision', { email: prof.email, mes, estado, nota });
    await auditar(req, 'clases.revision', prof, { mes, estado });
    res.json({ success: true, revision: rev });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error guardando la revisión' }); }
});

// Admin: marca y anotación sobre una clase concreta (visible para el profesor)
app.put('/api/admin/clases/:id/anotacion', auth, adminOnly, async (req, res) => {
  try {
    const marca = ['OK', 'REVISAR'].includes(req.body.marca) ? req.body.marca : null;
    const notaAdmin = String(req.body.nota || '').trim().slice(0, 300) || null;
    const c = await prisma.claseDada.update({
      where: { id: req.params.id }, data: { marca, notaAdmin }, include: incluirClase,
    });
    res.json(mapClase(c));
  } catch (err) { res.status(404).json({ error: 'Clase no encontrada' }); }
});

// Admin: reabrir un mes confirmado para que el profesor pueda corregir
app.post('/api/admin/clases/reabrir', auth, adminOnly, async (req, res) => {
  try {
    const { profesorId, mes } = req.body;
    if (!profesorId || !MES_RE.test(mes || '')) return res.status(400).json({ error: 'Datos inválidos' });
    await prisma.confirmacionClases.deleteMany({ where: { profesorId, mes } });
    await prisma.notificacion.create({ data: {
      titulo: 'Mes reabierto', mensaje: `El administrador reabrió ${mes} para que puedas corregir tus clases.`,
      tipo: 'AVISO', profesorId, enviadaPorId: req.user.userId } });
    avisarWhatsapp([profesorId], `administración reabrió ${mes} para que corrijas tus clases.`);
    emitirEvento('clases.mes_reabierto', { profesorId, mes });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error reabriendo el mes' }); }
});

// ============ INTEGRACIONES (API keys, webhooks, planning) ============
const SCOPES_API = ['lectura', 'economico', 'planning'];
const hashKey = k => crypto.createHash('sha256').update(k).digest('hex');

// Autenticación por API key para sistemas externos (X-API-Key o Authorization: Bearer sj_...)
function apiAuth(scope) {
  return async (req, res, next) => {
    try {
      const raw = String(req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!raw.startsWith('sj_')) return res.status(401).json({ error: 'API key requerida' });
      const k = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(raw) } });
      if (!k || !k.activa) return res.status(401).json({ error: 'API key inválida' });
      const scopes = k.scopes.split(',');
      if (!scopes.includes(scope)) return res.status(403).json({ error: `La key no tiene el permiso "${scope}"` });
      req.apiKey = { id: k.id, scopes };
      prisma.apiKey.update({ where: { id: k.id }, data: { ultimoUso: new Date() } }).catch(() => {});
      next();
    } catch { res.status(500).json({ error: 'Error de autenticación' }); }
  };
}
app.use('/api/v1', rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: 'Demasiadas peticiones' }, standardHeaders: true, legacyHeaders: false }));

// Webhooks salientes firmados con HMAC-SHA256 (cabecera X-SkiJornada-Signature: sha256=<hex>)
const EVENTOS_WEBHOOK = ['clases.mes_confirmado', 'clases.revision', 'clases.mes_reabierto', 'solicitud.creada', 'solicitud.respondida', 'documento.firmado', 'planning.importado'];

// Un webhook nunca debe poder llamar a la red interna (SSRF): se resuelve el host y se rechazan IP privadas
const dns = require('dns').promises;
const net = require('net');
function ipPrivada(ip) {
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:') && ipPrivada(l.slice(7)); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function destinoPublico(url) {
  const u = new URL(url);
  if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return !ipPrivada(host);
  const dirs = await dns.lookup(host, { all: true });
  return dirs.length > 0 && dirs.every(d => !ipPrivada(d.address));
}

async function enviarWebhook(w, evento, datos) {
  const body = JSON.stringify({ evento, ocurridoAt: new Date().toISOString(), datos });
  const firma = crypto.createHmac('sha256', w.secret).update(body).digest('hex');
  let estado = 0;
  try {
    if (!(await destinoPublico(w.url))) throw new Error('destino no permitido');
    const r = await fetch(w.url, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'X-SkiJornada-Event': evento, 'X-SkiJornada-Signature': `sha256=${firma}` },
      body, signal: AbortSignal.timeout(5000),
    });
    estado = r.status;
  } catch { estado = 0; }
  await prisma.webhook.update({ where: { id: w.id }, data: { ultimoEstado: estado, ultimoEnvio: new Date() } }).catch(() => {});
  return estado;
}

async function emitirEvento(evento, datos) {
  try {
    const hooks = await prisma.webhook.findMany({ where: { activo: true } });
    await Promise.allSettled(hooks
      .filter(w => w.eventos === '*' || w.eventos.split(',').includes(evento))
      .map(w => enviarWebhook(w, evento, datos)));
  } catch (e) { console.error('webhook:', e.message); }
}

const urlWebhookValida = u => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(x.hostname));
  } catch { return false; }
};

// --- Administración de API keys ---
app.get('/api/admin/integraciones/keys', auth, adminOnly, async (req, res) => {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(keys.map(({ keyHash, ...k }) => ({ ...k, scopes: k.scopes.split(',') })));
});
app.post('/api/admin/integraciones/keys', auth, adminOnly, async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim().slice(0, 80);
    const scopes = (Array.isArray(req.body.scopes) ? req.body.scopes : ['lectura']).filter(s => SCOPES_API.includes(s));
    if (!nombre) return res.status(400).json({ error: 'Pon un nombre a la clave' });
    if (!scopes.length) return res.status(400).json({ error: 'Elige al menos un permiso' });
    const key = `sj_${crypto.randomBytes(24).toString('base64url')}`;
    const k = await prisma.apiKey.create({ data: { nombre, prefijo: key.slice(0, 10), keyHash: hashKey(key), scopes: scopes.join(','), creadaPorId: req.user.userId } });
    // La key en claro se muestra UNA sola vez
    await auditar(req, 'integracion.key_crear', null, { nombre: k.nombre, scopes });
    res.json({ id: k.id, nombre: k.nombre, scopes, prefijo: k.prefijo, key });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error creando la key' }); }
});
app.put('/api/admin/integraciones/keys/:id', auth, adminOnly, async (req, res) => {
  try { await prisma.apiKey.update({ where: { id: req.params.id }, data: { activa: !!req.body.activa } }); res.json({ success: true }); }
  catch { res.status(404).json({ error: 'Key no encontrada' }); }
});
app.delete('/api/admin/integraciones/keys/:id', auth, adminOnly, async (req, res) => {
  await prisma.apiKey.deleteMany({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- Administración de webhooks ---
app.get('/api/admin/integraciones/webhooks', auth, adminOnly, async (req, res) => {
  const hooks = await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ eventos: EVENTOS_WEBHOOK, webhooks: hooks.map(({ secret, ...w }) => ({ ...w, eventos: w.eventos === '*' ? ['*'] : w.eventos.split(',') })) });
});
app.post('/api/admin/integraciones/webhooks', auth, adminOnly, async (req, res) => {
  try {
    const url = String(req.body.url || '').trim();
    if (!urlWebhookValida(url)) return res.status(400).json({ error: 'La URL debe ser https' });
    if (!(await destinoPublico(url).catch(() => false))) return res.status(400).json({ error: 'La URL debe apuntar a un servidor público (no a una red interna)' });
    const eventos = Array.isArray(req.body.eventos) && req.body.eventos.length
      ? req.body.eventos.filter(e => EVENTOS_WEBHOOK.includes(e)) : ['*'];
    if (!eventos.length) return res.status(400).json({ error: 'Eventos inválidos' });
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const w = await prisma.webhook.create({ data: { url, secret, eventos: eventos.join(',') } });
    await auditar(req, 'integracion.webhook_crear', null, { url: w.url, eventos });
    res.json({ id: w.id, url: w.url, eventos, secret }); // el secreto se muestra una sola vez
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error creando el webhook' }); }
});
app.put('/api/admin/integraciones/webhooks/:id', auth, adminOnly, async (req, res) => {
  try { await prisma.webhook.update({ where: { id: req.params.id }, data: { activo: !!req.body.activo } }); res.json({ success: true }); }
  catch { res.status(404).json({ error: 'Webhook no encontrado' }); }
});
app.delete('/api/admin/integraciones/webhooks/:id', auth, adminOnly, async (req, res) => {
  await prisma.webhook.deleteMany({ where: { id: req.params.id } });
  res.json({ success: true });
});
app.post('/api/admin/integraciones/webhooks/:id/probar', auth, adminOnly, async (req, res) => {
  const w = await prisma.webhook.findUnique({ where: { id: req.params.id } });
  if (!w) return res.status(404).json({ error: 'Webhook no encontrado' });
  const estado = await enviarWebhook(w, 'prueba', { mensaje: 'Evento de prueba de Ski Jornada' });
  res.json({ estado, ok: estado >= 200 && estado < 300 });
});

// --- Planning (clases planificadas por el sistema de reservas) ---
async function importarPlanning(items, { reemplazarMes, fuente = 'API' } = {}) {
  if (!Array.isArray(items) || !items.length) return { error: 'Envía una lista "items" con al menos una fila' };
  if (items.length > 5000) return { error: 'Máximo 5000 filas por envío' };
  const emails = [...new Set(items.map(i => String(i.email || '').toLowerCase().trim()).filter(Boolean))];
  const profs = await prisma.profesor.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
  const porEmail = Object.fromEntries(profs.map(p => [p.email, p.id]));
  const sinProfesor = emails.filter(e => !porEmail[e]);
  let invalidas = 0;
  const validas = [];
  for (const i of items) {
    const profesorId = porEmail[String(i.email || '').toLowerCase().trim()];
    const horas = parseFloat(String(i.horas).replace(',', '.'));
    if (!profesorId || !FECHA_RE.test(i.fecha || '') || !(horas > 0 && horas <= 24)) { if (profesorId) invalidas++; continue; }
    validas.push({
      profesorId, fecha: i.fecha, horas: r2(horas),
      disciplina: i.disciplina ? String(i.disciplina).slice(0, 60) : null,
      referencia: String(i.referencia || '').slice(0, 80), fuente,
    });
  }
  if (MES_RE.test(reemplazarMes || '')) {
    await prisma.planningClase.deleteMany({ where: { fecha: { startsWith: reemplazarMes }, profesorId: { in: Object.values(porEmail) } } });
  }
  for (const v of validas) {
    await prisma.planningClase.upsert({
      where: { profesorId_fecha_referencia: { profesorId: v.profesorId, fecha: v.fecha, referencia: v.referencia } },
      create: v, update: { horas: v.horas, disciplina: v.disciplina, fuente: v.fuente },
    });
  }
  emitirEvento('planning.importado', { filas: validas.length, fuente });
  return { importadas: validas.length, invalidas, sinProfesor };
}

app.post('/api/v1/planning', apiAuth('planning'), async (req, res) => {
  try {
    const r = await importarPlanning(req.body.items, { reemplazarMes: req.body.reemplazarMes, fuente: 'API' });
    if (r.error) return res.status(400).json({ error: r.error });
    res.json(r);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error importando el planning' }); }
});
app.post('/api/admin/planning/importar', auth, adminOnly, async (req, res) => {
  try {
    const r = await importarPlanning(req.body.items, { reemplazarMes: req.body.reemplazarMes, fuente: 'CSV' });
    if (r.error) return res.status(400).json({ error: r.error });
    res.json(r);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error importando el planning' }); }
});

// Cotejo planificado vs. cargado por día (para el detalle de administración)
async function comparativaPlanning(profesorId, mes, informe) {
  const plan = await prisma.planningClase.findMany({ where: { profesorId, fecha: { startsWith: mes } } });
  if (!plan.length) return null;
  const planPorDia = {};
  plan.forEach(p => { planPorDia[p.fecha] = r2((planPorDia[p.fecha] || 0) + p.horas); });
  const dias = [...new Set([...Object.keys(planPorDia), ...Object.keys(informe.porDia)])].sort();
  const filas = dias.map(fecha => {
    const planificadas = planPorDia[fecha] || 0, cargadas = informe.porDia[fecha] || 0;
    return { fecha, planificadas, cargadas, diferencia: r2(cargadas - planificadas) };
  });
  return {
    filas,
    totalPlanificadas: r2(filas.reduce((s, f) => s + f.planificadas, 0)),
    totalCargadas: r2(filas.reduce((s, f) => s + f.cargadas, 0)),
    diasConDiferencia: filas.filter(f => f.diferencia !== 0).length,
  };
}

// --- API de lectura para integraciones (nóminas, BI, etc.) ---
const sinEconomico = i => {
  const { tarifaHora, importeBase, importePrimas, importeTotal, ...resto } = i;
  return {
    ...resto,
    detalle: i.detalle.map(({ importe, ...c }) => c),
    desglosePrimas: i.desglosePrimas.map(({ importe, ...d }) => d),
  };
};

app.get('/api/v1/profesores', apiAuth('lectura'), async (req, res) => {
  const profs = await prisma.profesor.findMany({ orderBy: { apellidos: 'asc' } });
  const eco = req.apiKey.scopes.includes('economico');
  res.json(profs.map(p => ({
    id: p.id, nombre: p.nombre, apellidos: p.apellidos, email: p.email, rol: p.role, activo: p.activo,
    tipoJornada: p.tipoJornada, horasContrato: p.horasContrato, ...(eco ? { tarifaHora: p.tarifaHora } : {}),
  })));
});

app.get('/api/v1/informe/:mes', apiAuth('lectura'), async (req, res) => {
  try {
    if (!MES_RE.test(req.params.mes)) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' });
    const where = { activo: true, role: 'PROFESOR' };
    if (req.query.email) where.email = String(req.query.email).toLowerCase();
    const profs = await prisma.profesor.findMany({ where, select: { id: true } });
    const eco = req.apiKey.scopes.includes('economico');
    const informes = await Promise.all(profs.map(p => construirInformeClases(p.id, req.params.mes)));
    res.json(informes.filter(i => i.detalle.length || i.confirmado).map(i => {
      const r = eco ? i : sinEconomico(i);
      return { ...r, porDia: undefined };
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error generando el informe' }); }
});

// ============ RGPD: exportación de datos personales ============
async function exportarDatosProfesor(id) {
  const [perfil, registros, libres, clases, revisiones, confirmaciones, documentos, firmas, notifs, planning, aceptaciones] = await Promise.all([
    prisma.profesor.findUnique({ where: { id }, select: { id: true, email: true, nombre: true, apellidos: true, telefono: true, role: true, tipoJornada: true, horasContrato: true, tarifaHora: true, horaRecordatorio: true, activo: true, createdAt: true } }),
    prisma.registroJornada.findMany({ where: { profesorId: id }, orderBy: { timestamp: 'asc' }, select: { tipo: true, timestamp: true, zonaNombre: true, lat: true, lng: true, distancia: true, esIncidencia: true, origen: true, anulado: true, correcciones: { select: { accion: true, anterior: true, nuevo: true, motivo: true, actorEmail: true, createdAt: true } } } }),
    prisma.solicitudLibre.findMany({ where: { profesorId: id } }),
    prisma.claseDada.findMany({ where: { profesorId: id }, include: { tipo: true, primas: true }, orderBy: { fecha: 'asc' } }),
    prisma.revisionMes.findMany({ where: { profesorId: id } }),
    prisma.confirmacionClases.findMany({ where: { profesorId: id } }),
    prisma.documentoLegajo.findMany({ where: { profesorId: id }, select: { tipo: true, nombre: true, mes: true, estado: true, createdAt: true, firmadoAt: true } }),
    prisma.firmaRegistro.findMany({ where: { profesorId: id }, select: { mes: true, estado: true, firmadoAt: true } }),
    prisma.notificacion.findMany({ where: { profesorId: id }, select: { titulo: true, mensaje: true, tipo: true, createdAt: true } }),
    prisma.planningClase.findMany({ where: { profesorId: id } }),
    prisma.aceptacionLegal.findMany({ where: { profesorId: id }, select: { documento: true, version: true, aceptadoAt: true } }),
  ]);
  if (!perfil) return null;
  return {
    generadoEl: new Date().toISOString(), perfil, registrosJornada: registros, solicitudesLibres: libres,
    clases: clases.map(c => ({ fecha: c.fecha, horas: c.horas, disciplina: c.tipo.nombre, primas: c.primas.map(p => p.nombre), notas: c.notas, marca: c.marca, notaAdmin: c.notaAdmin })),
    revisionesMensuales: revisiones, confirmacionesMensuales: confirmaciones, documentos, firmasRegistro: firmas, notificaciones: notifs, planning, aceptacionesLegales: aceptaciones,
  };
}
app.get('/api/auth/me/exportar', auth, async (req, res) => {
  try {
    const d = await exportarDatosProfesor(req.user.userId);
    if (!d) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos.json"');
    res.json(d);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error exportando los datos' }); }
});
app.get('/api/admin/profesores/:id/exportar', auth, adminOnly, async (req, res) => {
  try {
    const d = await exportarDatosProfesor(req.params.id);
    if (!d) return res.status(404).json({ error: 'Profesor no encontrado' });
    res.setHeader('Content-Disposition', 'attachment; filename="datos-profesor.json"');
    res.json(d);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error exportando los datos' }); }
});

// ============ COMPARATIVA CON EL SISTEMA DE RESERVAS ============
// Compara el resumen mensual por instructor del sistema de reservas (CSV) con las horas cargadas en la plataforma.
const normNombre = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokensNombre = s => normNombre(s).split(' ').filter(t => t.length > 1);

// Coincidencia por nombre: alias guardado → todas las palabras de uno están en el otro → mayor solapamiento
function buscarProfesor(nombreExterno, profes, alias) {
  const aliasId = alias[normNombre(nombreExterno)];
  if (aliasId) { const p = profes.find(x => x.id === aliasId); if (p) return { prof: p, via: 'alias' }; }
  const te = tokensNombre(nombreExterno);
  if (!te.length) return { prof: null };
  const candidatos = profes.map(p => {
    const tp = tokensNombre(`${p.nombre} ${p.apellidos}`);
    const comunes = tp.filter(t => te.includes(t)).length;
    const subconjunto = comunes === Math.min(tp.length, te.length) && comunes >= 2;
    return { p, score: comunes / Math.max(tp.length, te.length), subconjunto };
  }).filter(c => c.subconjunto || c.score >= 0.6).sort((a, b) => b.score - a.score);
  if (!candidatos.length) return { prof: null };
  if (candidatos.length > 1 && candidatos[0].score === candidatos[1].score) return { prof: null, ambiguo: candidatos.slice(0, 3).map(c => c.p.id) };
  return { prof: candidatos[0].p, via: 'nombre' };
}

const TOL_HORAS = 0.25, TOL_EUROS = 1;
const num = v => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

app.post('/api/admin/comparativa', auth, adminOnly, async (req, res) => {
  try {
    const { mes, filas } = req.body;
    if (!MES_RE.test(mes || '')) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' });
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'El archivo no tiene filas' });
    if (filas.length > 500) return res.status(400).json({ error: 'Máximo 500 filas' });

    const [profes, aliasRows] = await Promise.all([
      prisma.profesor.findMany({ where: { activo: true }, select: { id: true, nombre: true, apellidos: true, email: true, tarifaHora: true } }),
      prisma.aliasProfesor.findMany(),
    ]);
    const alias = Object.fromEntries(aliasRows.map(a => [a.nombreExterno, a.profesorId]));
    const usados = new Set();
    const resultado = [];
    let sinAsignar = null;

    for (const f of filas) {
      const nombre = String(f.profesor || '').trim();
      const ext = {
        salario: num(f.salario), totalHoras: r2(num(f.totalHoras)), horasPrivadas: num(f.horasPrivadas), horasGrupales: num(f.horasGrupales),
        horasCursillos: num(f.horasCursillos), horasRequeridas: num(f.horasRequeridas), totalSinPrimas: num(f.totalSinPrimas),
        totalPrimas: num(f.totalPrimas), totalRequeridas: num(f.totalRequeridas), total: num(f.total),
        primas: Object.fromEntries(Object.entries(f.primas || {}).map(([k, v]) => [k, num(v)])),
      };
      if (/^NO ASIGNADO/i.test(nombre)) { sinAsignar = { nombre, ...ext }; continue; }
      if (ext.totalHoras === 0 && ext.total === 0) continue; // sin actividad en el sistema de reservas

      const { prof, via, ambiguo } = buscarProfesor(nombre, profes, alias);
      if (!prof) { resultado.push({ nombre, estado: 'SIN_COINCIDENCIA', externo: ext, candidatos: ambiguo || [] }); continue; }
      usados.add(prof.id);
      const inf = await construirInformeClases(prof.id, mes);
      const plat = {
        totalHoras: inf.totalHoras, clases: inf.detalle.length, tarifaHora: inf.tarifaHora, importeTotal: inf.importeTotal,
        confirmado: inf.confirmado, revision: inf.revision?.estado || null,
        primas: Object.fromEntries(inf.desglosePrimas.map(d => [d.nombre, { horas: d.horas, importe: d.importe }])),
      };
      const dif = {
        horas: r2(plat.totalHoras - ext.totalHoras),
        importe: plat.importeTotal == null ? null : r2(plat.importeTotal - ext.total),
        tarifa: plat.tarifaHora == null ? null : r2(plat.tarifaHora - ext.salario),
      };
      // Primas: se comparan por nombre las del sistema externo con las de la plataforma (importe)
      const primas = Object.entries(ext.primas).filter(([, v]) => v !== 0).map(([n, v]) => {
        const k = Object.keys(plat.primas).find(x => normNombre(x) === normNombre(n));
        const p = k ? plat.primas[k] : null;
        return { nombre: n, externo: v, plataforma: p?.importe ?? null, horasPlataforma: p?.horas ?? 0, diferencia: p?.importe == null ? null : r2(p.importe - v) };
      });
      let estado;
      if (plat.totalHoras === 0) estado = 'SIN_CARGA';
      else if (Math.abs(dif.horas) <= TOL_HORAS) estado = (dif.importe != null && Math.abs(dif.importe) > TOL_EUROS) ? 'DIFERENCIA_IMPORTE' : 'OK';
      else estado = 'DIFERENCIA_HORAS';
      resultado.push({
        nombre, estado, via, profesor: { id: prof.id, nombre: `${prof.nombre} ${prof.apellidos}`, email: prof.email },
        externo: ext, plataforma: plat, diferencia: dif, primas,
      });
    }

    // Profesores con horas cargadas que no aparecen en el sistema de reservas
    const restantes = profes.filter(p => !usados.has(p.id));
    const soloPlataforma = [];
    for (const p of restantes) {
      const inf = await construirInformeClases(p.id, mes);
      if (inf.totalHoras > 0) soloPlataforma.push({ profesor: { id: p.id, nombre: `${p.nombre} ${p.apellidos}`, email: p.email }, totalHoras: inf.totalHoras, importeTotal: inf.importeTotal });
    }

    const cuenta = e => resultado.filter(r => r.estado === e).length;
    res.json({
      mes, resultado, soloPlataforma, sinAsignar,
      resumen: {
        instructores: resultado.length, ok: cuenta('OK'), diferenciaHoras: cuenta('DIFERENCIA_HORAS'), diferenciaImporte: cuenta('DIFERENCIA_IMPORTE'),
        sinCarga: cuenta('SIN_CARGA'), sinCoincidencia: cuenta('SIN_COINCIDENCIA'), soloPlataforma: soloPlataforma.length,
        horasExterno: r2(resultado.reduce((s, r) => s + r.externo.totalHoras, 0)),
        horasPlataforma: r2(resultado.reduce((s, r) => s + (r.plataforma?.totalHoras || 0), 0)),
      },
      profesores: profes.map(p => ({ id: p.id, nombre: `${p.nombre} ${p.apellidos}` })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error generando la comparativa' }); }
});

// Vincula un nombre del sistema externo con un profesor (se recuerda para próximas comparativas)
app.post('/api/admin/comparativa/alias', auth, adminOnly, async (req, res) => {
  try {
    const nombreExterno = normNombre(req.body.nombreExterno);
    if (!nombreExterno || !req.body.profesorId) return res.status(400).json({ error: 'Datos inválidos' });
    await prisma.aliasProfesor.upsert({ where: { nombreExterno }, create: { nombreExterno, profesorId: req.body.profesorId }, update: { profesorId: req.body.profesorId } });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error guardando el vínculo' }); }
});

// ============ COPIAS DE SEGURIDAD (SQLite) ============
// Copia consistente con VACUUM INTO. En producción: una al día (a partir de las 03:00) y se conservan BACKUP_CONSERVAR (14).
function rutaBaseDatos() {
  const raw = String(process.env.DATABASE_URL || 'file:./prisma/dev.db').replace(/^file:/, '').split('?')[0];
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, 'prisma', raw);
}
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(rutaBaseDatos()), 'backups');
const nombreBackup = (d = new Date()) => `ski-jornada-${d.toISOString().slice(0, 10)}.db`;
const { pipeline } = require('stream/promises');
const zlib = require('zlib');

async function crearBackup(destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (fs.existsSync(destino)) fs.unlinkSync(destino);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  return destino;
}
// Las copias programadas se comprimen (la base SQLite baja a ~20 % del tamaño): ski-jornada-AAAA-MM-DD.db.gz
async function comprimirBackup(ruta) {
  await pipeline(fs.createReadStream(ruta), zlib.createGzip({ level: 9 }), fs.createWriteStream(`${ruta}.gz`));
  fs.unlinkSync(ruta);
  return `${ruta}.gz`;
}
function podarBackups() {
  const conservar = parseInt(process.env.BACKUP_CONSERVAR) || 14;
  const archivos = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => /^ski-jornada-\d{4}-\d{2}-\d{2}\.db(\.gz)?$/.test(f)).sort() : [];
  archivos.slice(0, Math.max(0, archivos.length - conservar)).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {} });
}
async function backupDiario() {
  try {
    const hoy = path.join(BACKUP_DIR, nombreBackup());
    if (new Date().getHours() < 3 || fs.existsSync(`${hoy}.gz`)) return;
    const gz = await comprimirBackup(await crearBackup(hoy)); podarBackups();
    console.log(`💾 Copia de seguridad creada: ${path.basename(gz)} (${Math.round(fs.statSync(gz).size / 1024)} KB)`);
  } catch (e) { console.error('backup:', e.message); }
}
if (ES_PROD && process.env.BACKUP_DIARIO !== 'false') {
  setTimeout(backupDiario, 60 * 1000).unref();
  setInterval(backupDiario, 60 * 60 * 1000).unref();
}

// Solo la cuenta principal: crear una copia ahora y descargarla (para guardarla fuera del servidor)
app.get('/api/admin/backup/descargar', auth, adminOnly, async (req, res) => {
  if (!req.user.esPrincipal) return res.status(403).json({ error: 'Solo la cuenta principal puede descargar copias' });
  const tmp = path.join(BACKUP_DIR, `descarga-${Date.now()}.db`);
  try {
    await crearBackup(tmp);
    await auditar(req, 'sistema.backup_descargado', null);
    res.download(tmp, nombreBackup(), () => { try { fs.unlinkSync(tmp); } catch {} });
  } catch (e) { console.error('backup descarga:', e.message); try { fs.unlinkSync(tmp); } catch {} res.status(500).json({ error: 'No se pudo crear la copia' }); }
});
app.get('/api/admin/backup', auth, adminOnly, (req, res) => {
  const archivos = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => /^ski-jornada-.*\.db(\.gz)?$/.test(f)).sort().reverse() : [];
  res.json({ automatico: ES_PROD && process.env.BACKUP_DIARIO !== 'false', carpeta: BACKUP_DIR, copias: archivos.map(f => ({ nombre: f, bytes: fs.statSync(path.join(BACKUP_DIR, f)).size })) });
});

// ============ ACEPTACIONES LEGALES (RGPD) ============
// Constancia (versionada) de que cada persona recibió la información de privacidad y, en la cuenta principal, de que la
// escuela aceptó el contrato de encargo. No es un consentimiento: ver docs/RGPD.md.
const opcionesLegal = () => ({ documentosHabilitados: DOCUMENTOS_ON });

// Pública: la política de privacidad de la escuela (se enlaza desde la landing)
app.get('/api/legal/privacidad', async (req, res) => {
  try { res.json(legal.generar.PRIVACIDAD(await getConfig(), opcionesLegal())); }
  catch { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/legal/estado', auth, async (req, res) => {
  try {
    const cfg = await getConfig();
    const requeridos = legal.requeridosPara(req.user);
    const hechas = await prisma.aceptacionLegal.findMany({ where: { profesorId: req.user.userId, documento: { in: requeridos } } });
    res.json(requeridos.map(doc => {
      const v = legal.VERSION[doc];
      const a = hechas.find(x => x.documento === doc && x.version === v);
      return { documento: doc, version: v, titulo: legal.generar[doc](cfg, opcionesLegal()).titulo, aceptado: !!a, aceptadoAt: a?.aceptadoAt || null };
    }));
  } catch { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/legal/documento/:tipo', auth, async (req, res) => {
  try {
    const tipo = String(req.params.tipo).toUpperCase();
    if (!legal.requeridosPara(req.user).includes(tipo)) return res.status(404).json({ error: 'Documento no disponible' });
    res.json(legal.generar[tipo](await getConfig(), opcionesLegal()));
  } catch { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/legal/aceptar', auth, async (req, res) => {
  try {
    const documento = String(req.body.documento || '').toUpperCase();
    if (!legal.requeridosPara(req.user).includes(documento)) return res.status(400).json({ error: 'Documento no válido para tu cuenta' });
    if (String(req.body.version) !== legal.VERSION[documento]) return res.status(409).json({ error: 'El texto cambió: recarga para leer la versión vigente' });
    await prisma.aceptacionLegal.upsert({
      where: { profesorId_documento_version: { profesorId: req.user.userId, documento, version: legal.VERSION[documento] } },
      create: { profesorId: req.user.userId, documento, version: legal.VERSION[documento] }, update: {},
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error guardando la aceptación' }); }
});

// Administración: quién recibió la información y quién no (evidencia para el responsable)
app.get('/api/admin/legal/aceptaciones', auth, adminOnly, async (req, res) => {
  try {
    const [usuarios, filas] = await Promise.all([
      prisma.profesor.findMany({ where: { activo: true }, select: { id: true, nombre: true, apellidos: true, email: true, role: true, esPrincipal: true }, orderBy: { apellidos: 'asc' } }),
      prisma.aceptacionLegal.findMany(),
    ]);
    const lista = usuarios.map(u => {
      const docs = legal.requeridosPara(u).map(doc => {
        const a = filas.find(x => x.profesorId === u.id && x.documento === doc && x.version === legal.VERSION[doc]);
        return { documento: doc, version: legal.VERSION[doc], aceptado: !!a, aceptadoAt: a?.aceptadoAt || null };
      });
      return { ...u, documentos: docs, completo: docs.every(d => d.aceptado) };
    });
    res.json({ versiones: legal.VERSION, total: lista.length, completos: lista.filter(u => u.completo).length, usuarios: lista });
  } catch { res.status(500).json({ error: 'Error' }); }
});

// ============ WHATSAPP (opcional, Baileys) ============
// Desactivado por defecto. Administración lo activa desde Integraciones → WhatsApp («Generar QR»).
// WHATSAPP_ENABLED=false lo oculta por completo. Solo se escribe a quien lo pidió (avisosWhatsapp) y tiene teléfono.
const whatsapp = require('./whatsapp');
const WHATSAPP_PERMITIDO = process.env.WHATSAPP_ENABLED !== 'false';
whatsapp.configurar(process.env.WHATSAPP_DIR || path.join(path.dirname(rutaBaseDatos()), 'whatsapp'));
if (WHATSAPP_PERMITIDO) whatsapp.arrancarSiActivo().catch(e => console.error('WhatsApp:', e.message));

const whatsappOn = (req, res, next) => (WHATSAPP_PERMITIDO ? next() : res.status(404).json({ error: 'WhatsApp no está habilitado en este despliegue' }));

app.get('/api/admin/whatsapp', auth, adminOnly, async (req, res) => {
  if (!WHATSAPP_PERMITIDO) return res.json({ permitido: false, estado: 'deshabilitado' });
  const [est, optin] = await Promise.all([
    whatsapp.estadoActual(),
    prisma.profesor.count({ where: { activo: true, avisosWhatsapp: true, NOT: { telefono: null } } }),
  ]);
  res.json({ permitido: true, ...est, destinatarios: optin });
});
app.post('/api/admin/whatsapp/iniciar', auth, adminOnly, whatsappOn, async (req, res) => {
  const est = await whatsapp.iniciar();
  await auditar(req, 'whatsapp.activar', null, {});
  res.json({ permitido: true, ...est });
});
app.post('/api/admin/whatsapp/detener', auth, adminOnly, whatsappOn, async (req, res) => {
  const est = await whatsapp.detener();
  await auditar(req, 'whatsapp.desactivar', null, {});
  res.json({ permitido: true, ...est });
});
app.post('/api/admin/whatsapp/desvincular', auth, adminOnly, whatsappOn, async (req, res) => {
  const est = await whatsapp.desvincular();
  await auditar(req, 'whatsapp.desvincular', null, {});
  res.json({ permitido: true, ...est });
});
app.post('/api/admin/whatsapp/probar', auth, adminOnly, whatsappOn, async (req, res) => {
  try {
    const tel = req.body.telefono || (await prisma.profesor.findUnique({ where: { id: req.user.userId }, select: { telefono: true } }))?.telefono;
    if (!tel) return res.status(400).json({ error: 'Indica un teléfono o completa el tuyo en Mi perfil' });
    await whatsapp.enviar(tel, '⛷️ Mensaje de prueba de Ski Jornada. Si lo lees, WhatsApp está bien conectado.');
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Avisa por WhatsApp a quien lo activó en su perfil (sin bloquear ni fallar la operación principal)
async function avisarWhatsapp(profesorIds, texto) {
  try {
    if (!WHATSAPP_PERMITIDO || !whatsapp.conectado()) return 0;
    const dest = await prisma.profesor.findMany({
      where: { id: { in: profesorIds }, activo: true, avisosWhatsapp: true, NOT: { telefono: null } },
      select: { nombre: true, telefono: true },
    });
    dest.forEach(d => whatsapp.enviar(d.telefono, `⛷️ *${process.env.VITE_APP_NAME || 'Ski Jornada'}* — Hola ${d.nombre}: ${texto}`).catch(() => {}));
    return dest.length;
  } catch { return 0; }
}

// ============ RECORDATORIOS AUTOMÁTICOS ============
// Cada minuto (hora de Madrid): recordatorio de salida a quien está fichado y, a fin de mes, de confirmar horas.
const claveMes = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const recordadoMes = new Set();
setInterval(async () => {
  try {
    if (!WHATSAPP_PERMITIDO || !whatsapp.conectado()) return;
    const ahora = new Date();
    const hh = ahora.getHours(), mm = ahora.getMinutes();
    const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

    const profesores = await prisma.profesor.findMany({ where: { activo: true, avisosWhatsapp: true, NOT: { telefono: null } } });
    for (const p of profesores) {
      const [rh, rm] = (p.horaRecordatorio || '17:00').split(':').map(Number);
      if (hh !== rh || mm !== rm) continue;
      const ultReg = await prisma.registroJornada.findFirst({ where: { anulado: false, profesorId: p.id, timestamp: { gte: inicioDia } }, orderBy: { timestamp: 'desc' } });
      if (ultReg?.tipo === 'ENTRADA') avisarWhatsapp([p.id], `son las ${p.horaRecordatorio} y sigues fichado. Recuerda fichar la salida.`);
    }

    // Últimos 2 días del mes, a las 10:00: quien tiene clases cargadas y no confirmó
    const ultimoDia = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    const clave = `${claveMes(ahora)}-${ahora.getDate()}`;
    if (hh === 10 && mm === 0 && ahora.getDate() >= ultimoDia - 1 && !recordadoMes.has(clave)) {
      recordadoMes.add(clave);
      const mes = claveMes(ahora);
      const conClases = await prisma.claseDada.findMany({ where: { fecha: { startsWith: mes } }, distinct: ['profesorId'], select: { profesorId: true } });
      const confirmados = new Set((await prisma.confirmacionClases.findMany({ where: { mes }, select: { profesorId: true } })).map(c => c.profesorId));
      avisarWhatsapp(conClases.map(c => c.profesorId).filter(id => !confirmados.has(id)), `el mes termina: revisa y confirma tus horas de clases de ${mes}.`);
    }
  } catch {}
}, 60 * 1000);

// ============ ERRORES Y CIERRE ============
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo supera el tamaño máximo (20 MB)' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande' });
  if (err?.message?.startsWith('Solo se permiten') || err?.message === 'Formato no permitido') return res.status(400).json({ error: err.message });
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
process.on('unhandledRejection', e => console.error('unhandledRejection:', e));
process.on('uncaughtException', e => console.error('uncaughtException:', e));

// ============ START ============
const PORT = process.env.PORT || 3000;
cargarModulosOff();
const servidor = app.listen(PORT, () => {
  console.log('========================================');
  console.log(`  Ski Jornada API — http://localhost:${PORT}`);
  if (process.env.PASSWORD_LOGIN === 'true') console.log('  Demo (PASSWORD_LOGIN): admin@escuela.com / profesor@escuela.com · ski123');
  console.log(RESEND_KEY ? '  📧 Email: Resend' : SMTP_OK ? '  📧 Email: SMTP' : '  📧 Email: modo consola');
  console.log(`  📱 WhatsApp: ${WHATSAPP_PERMITIDO ? 'disponible (se activa desde Integraciones)' : 'deshabilitado'}`);
  console.log('========================================');
});

// Cierre ordenado (Railway envía SIGTERM al desplegar una versión nueva)
for (const señal of ['SIGTERM', 'SIGINT']) {
  process.on(señal, () => {
    console.log(`${señal}: cerrando…`);
    servidor.close(async () => { await prisma.$disconnect().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
