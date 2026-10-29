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

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('❌ Falta JWT_SECRET en las variables de entorno. Abortando.');
  process.exit(1);
}
const prisma = new PrismaClient();
const app = express();
app.set('trust proxy', 1); // detrás del proxy de Railway (IP real para el rate limit)

// ============ SECURITY ============
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(o => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '20mb' }));

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
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

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

async function enviarEmailBienvenida(profesor) {
  return enviarEmail(
    profesor.email,
    'Bienvenido/a a Ski Jornada — Tus datos de acceso',
    `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f0f7ff;border-radius:12px">
      <h1 style="color:#0f4c81;margin-bottom:8px">⛷️ Ski Jornada</h1>
      <h2 style="color:#1e293b;font-weight:600">Bienvenido/a, ${profesor.nombre} ${profesor.apellidos}</h2>
      <p style="color:#475569">Tu cuenta ha sido creada en el sistema de control de jornada laboral.</p>
      <div style="background:white;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #0f4c81">
        <p style="margin:0 0 8px"><strong>Email:</strong> ${profesor.email}</p>
        <p style="margin:0 0 8px"><strong>Contraseña inicial:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">ski123</code></p>
        <p style="margin:0"><strong>Jornada:</strong> ${profesor.tipoJornada === 'COMPLETA' ? 'Completa' : 'Media jornada'} (${profesor.horasContrato}h/semana)</p>
      </div>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}"
         style="display:inline-block;background:#0f4c81;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Acceder al sistema →
      </a>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Por seguridad, cambia tu contraseña en el primer acceso.</p>
    </div>`
  );
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
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
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
    res.sendFile(ruta);
  } catch (err) { res.status(500).json({ error: 'Error leyendo el archivo' }); }
});

// Módulo de documentos activable por despliegue (DOCUMENTOS_HABILITADOS=false lo apaga, p. ej. si las nóminas se firman en otra plataforma)
const DOCUMENTOS_ON = process.env.DOCUMENTOS_HABILITADOS !== 'false';
app.use((req, res, next) => {
  if (!DOCUMENTOS_ON && (/^\/api\/(admin\/)?documentos(\/|$)/.test(req.path) || /^\/api\/admin\/profesores\/[^/]+\/documentos$/.test(req.path) || req.path.startsWith('/uploads/documentos/')))
    return res.status(404).json({ error: 'Módulo de documentos deshabilitado' });
  next();
});

// ============ SERVER TIME ============
app.get('/api/server-time', (req, res) => {
  res.json({ timestamp: Date.now(), iso: new Date().toISOString() });
});

// ============ AUTH ============

// ============ MAGIC LINK ============
const MAGIC_TTL_MIN = 15;
const SESION_DIAS = 90;
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');
const firmarSesion = u => jwt.sign(
  { userId: u.id, email: u.email, role: u.role },
  process.env.JWT_SECRET,
  { expiresIn: `${SESION_DIAS}d` },
);
const perfilSesion = u => ({
  id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email,
  role: u.role, tipoJornada: u.tipoJornada, horasContrato: u.horasContrato,
  telefono: u.telefono, horaRecordatorio: u.horaRecordatorio, tarifaHora: u.tarifaHora,
});

// Crea el enlace y lo envía por email. `invitacion` cambia el texto para altas nuevas.
async function enviarMagicLink(u, { invitacion = false } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.magicLink.deleteMany({ where: { OR: [{ profesorId: u.id }, { expiraAt: { lt: new Date() } }] } });
  await prisma.magicLink.create({
    data: { profesorId: u.id, tokenHash: hashToken(token), expiraAt: new Date(Date.now() + MAGIC_TTL_MIN * 60 * 1000) },
  });
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
  const url = `${base}/?magic=${token}`;
  if (!EMAIL_OK && process.env.NODE_ENV !== 'production') console.log(`🔗 [DEV] Enlace de acceso para ${u.email}: ${url}`);
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
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">El enlace vale ${MAGIC_TTL_MIN} minutos y se puede usar una sola vez. Si no lo pediste, ignorá este mensaje.</p>
    </div>`,
  );
}

const magicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
});

// Pide el enlace. Respuesta idéntica exista o no el email (no revela quién tiene cuenta).
app.post('/api/auth/magic-link', magicLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Ingresá tu email' });
    const u = await prisma.profesor.findUnique({ where: { email } });
    if (u && u.activo) enviarMagicLink(u).catch(console.error);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno del servidor' }); }
});

// Canjea el token del enlace por una sesión de larga duración.
app.post('/api/auth/magic-link/verificar', magicLimiter, async (req, res) => {
  try {
    const token = String(req.body.token || '');
    if (!token) return res.status(400).json({ error: 'Enlace inválido' });
    const ml = await prisma.magicLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { profesor: true } });
    if (!ml || ml.expiraAt < new Date() || !ml.profesor.activo) {
      return res.status(401).json({ error: 'El enlace venció o ya fue usado. Pedí uno nuevo.' });
    }
    // Consumo atómico: solo una petición puede borrarlo
    const borrado = await prisma.magicLink.deleteMany({ where: { id: ml.id } });
    if (borrado.count !== 1) return res.status(401).json({ error: 'El enlace venció o ya fue usado. Pedí uno nuevo.' });
    res.json({ token: firmarSesion(ml.profesor), user: perfilSesion(ml.profesor) });
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
  if (process.env.PASSWORD_LOGIN !== 'true') return res.status(404).json({ error: 'Usá el enlace de acceso por email' });
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
      telefono: u.telefono, horaRecordatorio: u.horaRecordatorio,
    });
  } catch (err) { res.status(500).json({ error: 'Error obteniendo perfil' }); }
});

app.put('/api/auth/me', auth, async (req, res) => {
  try {
    const { nombre, apellidos, telefono, horaRecordatorio } = req.body;
    const data = {};
    if (nombre            !== undefined) data.nombre           = nombre;
    if (apellidos         !== undefined) data.apellidos        = apellidos;
    if (telefono          !== undefined) data.telefono         = telefono || null;
    if (horaRecordatorio  !== undefined) data.horaRecordatorio = horaRecordatorio;
    const u = await prisma.profesor.update({ where: { id: req.user.userId }, data });
    res.json({
      id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email,
      role: u.role, tipoJornada: u.tipoJornada, horasContrato: u.horasContrato,
      telefono: u.telefono, horaRecordatorio: u.horaRecordatorio,
    });
  } catch (err) { res.status(500).json({ error: 'Error actualizando perfil' }); }
});

app.put('/api/auth/cambiar-password', auth, async (req, res) => {
  try {
    const { passwordActual, passwordNueva } = req.body;
    if (!passwordActual || !passwordNueva) return res.status(400).json({ error: 'Contraseñas requeridas' });
    if (passwordNueva.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    const u = await prisma.profesor.findUnique({ where: { id: req.user.userId } });
    const valid = await bcrypt.compare(passwordActual, u.password);
    if (!valid) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    const hash = await bcrypt.hash(passwordNueva, 10);
    await prisma.profesor.update({ where: { id: req.user.userId }, data: { password: hash } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error cambiando contraseña' }); }
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
      where: { profesorId: req.user.userId, timestamp: { gte: inicioDia, lte: finDia } },
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
      where: { profesorId: req.user.userId, timestamp: { gte: inicioDia, lte: finDia } },
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
      where: { profesorId: req.user.userId },
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
    const sol = await prisma.solicitudLibre.create({
      data: {
        profesorId: req.user.userId,
        fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin),
        motivo, comentario: comentario || '', estado: 'PENDIENTE',
      },
    });
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
    res.json({ success: true, solicitud: sol });
  } catch (err) { res.status(500).json({ error: 'Error respondiendo solicitud' }); }
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
    const where = req.query.todos === 'true' ? {} : {};
    const profesores = await prisma.profesor.findMany({
      where,
      select: {
        id: true, nombre: true, apellidos: true, email: true,
        tipoJornada: true, horasContrato: true, role: true, activo: true,
        createdAt: true, telefono: true, horaRecordatorio: true, tarifaHora: true,
      },
      orderBy: { apellidos: 'asc' },
    });
    res.json(profesores);
  } catch (err) { res.status(500).json({ error: 'Error obteniendo profesores' }); }
});

app.post('/api/admin/profesores', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, apellidos, email, tipoJornada, horasContrato, role, telefono } = req.body;
    if (!nombre || !apellidos || !email) return res.status(400).json({ error: 'Nombre, apellidos y email son obligatorios' });

    const existe = await prisma.profesor.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existe) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });

    const password = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10); // sin contraseña usable: se entra por enlace
    const nuevo = await prisma.profesor.create({
      data: {
        email: email.toLowerCase().trim(), nombre, apellidos, password,
        tipoJornada: tipoJornada || 'COMPLETA',
        horasContrato: parseInt(horasContrato) || 35,
        role: role === 'ADMIN' ? 'ADMIN' : 'PROFESOR',
        telefono: telefono || null,
      },
    });
    enviarMagicLink(nuevo, { invitacion: true }).catch(console.error);
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
    if (activo           !== undefined) data.activo           = activo;
    if (telefono         !== undefined) data.telefono         = telefono || null;
    if (horaRecordatorio !== undefined) data.horaRecordatorio = horaRecordatorio;
    if (tarifaHora       !== undefined) data.tarifaHora       = (tarifaHora === '' || tarifaHora === null || isNaN(parseFloat(tarifaHora))) ? null : Math.max(0, parseFloat(tarifaHora));
    const prof = await prisma.profesor.update({ where: { id: req.params.id }, data });
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
    await prisma.profesor.update({ where: { id }, data: { activo: false } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error desactivando usuario' }); }
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
    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin    = new Date(anioNum, mesNum, 0, 23, 59, 59, 999);
    const diasLaborables = countWorkingDays(anioNum, mesNum);

    const [profesores, todosRegistros] = await Promise.all([
      prisma.profesor.findMany({ where: { activo: true }, orderBy: { apellidos: 'asc' } }),
      prisma.registroJornada.findMany({ where: { timestamp: { gte: inicio, lte: fin } }, orderBy: { timestamp: 'asc' } }),
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
    const targetId = (req.user.role === 'ADMIN' && req.query.profesorId) ? req.query.profesorId : req.user.userId;

    const profesor = await prisma.profesor.findUnique({ where: { id: targetId } });
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });

    const mesNum = parseInt(mes), anioNum = parseInt(anio);
    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin    = new Date(anioNum, mesNum, 0, 23, 59, 59, 999);

    const regs = await prisma.registroJornada.findMany({
      where: { profesorId: targetId, timestamp: { gte: inicio, lte: fin } },
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
        <p>Hola <strong>${profesor.nombre}</strong>,</p>
        <p>Adjunto encontrarás el registro de jornada laboral de <strong>${mesNombre} ${anio}</strong>.</p>
        <ol>
          <li>Descarga el PDF adjunto</li>
          <li>Fírmalo (físicamente o con firma digital)</li>
          <li>Súbelo en la app: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Ski Jornada →</a></li>
        </ol>
      </div>`,
      [{ filename: `RegistroHorario_${profesor.apellidos}_${mesNombre}_${anio}.pdf`, content: buffer, contentType: 'application/pdf' }]
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

app.post('/api/firma/subir-firmado', auth, upload.single('pdf'), async (req, res) => {
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
app.post('/api/admin/documentos', auth, adminOnly, upload.single('pdf'), async (req, res) => {
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
          <p>Hola <strong>${profesor.nombre}</strong>, hay un nuevo documento en tu legajo:</p>
          <p style="font-size:16px;font-weight:bold">${nombre}${mes ? ` — ${mes}` : ''}</p>
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

app.post('/api/documentos/:id/firmar', auth, uploadFirma.single('pdf'), async (req, res) => {
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
app.get('/api/admin/fichajes-activos', auth, adminOnly, async (req, res) => {
  try {
    const ahora = new Date();
    const inicioHoy = new Date(ahora);
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(ahora);
    finHoy.setHours(23, 59, 59, 999);

    // Todos los registros de hoy, ordenados cronológicamente
    const registros = await prisma.registroJornada.findMany({
      where: { timestamp: { gte: inicioHoy, lte: finHoy } },
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
  return prisma.configEscuela.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
}

app.get('/api/config', async (req, res) => {
  try { res.json({ ...(await getConfig()), documentosHabilitados: DOCUMENTOS_ON }); } catch (err) { res.status(500).json({ error: 'Error' }); }
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
      return res.status(400).json({ error: 'Ese mes ya está confirmado. Pedí al administrador que lo reabra.' });
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
      return res.status(400).json({ error: 'Escribí una nota para el profesor' });
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
    enviarEmail(prof.email, `${titulos[estado]} (${mes})`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#0f4c81">⛷️ ${titulos[estado]} — ${mes}</h2>
        <p>${escHtml(nota || 'El administrador revisó tus horas y están correctas.')}</p>
        <p><a href="${(process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim()}">Abrir Ski Jornada →</a></p>
      </div>`).catch(console.error);
    emitirEvento('clases.revision', { email: prof.email, mes, estado, nota });
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
const EVENTOS_WEBHOOK = ['clases.mes_confirmado', 'clases.revision', 'clases.mes_reabierto', 'documento.firmado', 'planning.importado'];

async function enviarWebhook(w, evento, datos) {
  const body = JSON.stringify({ evento, ocurridoAt: new Date().toISOString(), datos });
  const firma = crypto.createHmac('sha256', w.secret).update(body).digest('hex');
  let estado = 0;
  try {
    const r = await fetch(w.url, {
      method: 'POST',
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
    if (!nombre) return res.status(400).json({ error: 'Ponele un nombre a la key' });
    if (!scopes.length) return res.status(400).json({ error: 'Elegí al menos un permiso' });
    const key = `sj_${crypto.randomBytes(24).toString('base64url')}`;
    const k = await prisma.apiKey.create({ data: { nombre, prefijo: key.slice(0, 10), keyHash: hashKey(key), scopes: scopes.join(','), creadaPorId: req.user.userId } });
    // La key en claro se muestra UNA sola vez
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
    const eventos = Array.isArray(req.body.eventos) && req.body.eventos.length
      ? req.body.eventos.filter(e => EVENTOS_WEBHOOK.includes(e)) : ['*'];
    if (!eventos.length) return res.status(400).json({ error: 'Eventos inválidos' });
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const w = await prisma.webhook.create({ data: { url, secret, eventos: eventos.join(',') } });
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
  if (!Array.isArray(items) || !items.length) return { error: 'Enviá una lista "items" con al menos una fila' };
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
  const [perfil, registros, libres, clases, revisiones, confirmaciones, documentos, firmas, notifs, planning] = await Promise.all([
    prisma.profesor.findUnique({ where: { id }, select: { id: true, email: true, nombre: true, apellidos: true, telefono: true, role: true, tipoJornada: true, horasContrato: true, tarifaHora: true, horaRecordatorio: true, activo: true, createdAt: true } }),
    prisma.registroJornada.findMany({ where: { profesorId: id }, orderBy: { timestamp: 'asc' }, select: { tipo: true, timestamp: true, zonaNombre: true, lat: true, lng: true, distancia: true, esIncidencia: true } }),
    prisma.solicitudLibre.findMany({ where: { profesorId: id } }),
    prisma.claseDada.findMany({ where: { profesorId: id }, include: { tipo: true, primas: true }, orderBy: { fecha: 'asc' } }),
    prisma.revisionMes.findMany({ where: { profesorId: id } }),
    prisma.confirmacionClases.findMany({ where: { profesorId: id } }),
    prisma.documentoLegajo.findMany({ where: { profesorId: id }, select: { tipo: true, nombre: true, mes: true, estado: true, createdAt: true, firmadoAt: true } }),
    prisma.firmaRegistro.findMany({ where: { profesorId: id }, select: { mes: true, estado: true, firmadoAt: true } }),
    prisma.notificacion.findMany({ where: { profesorId: id }, select: { titulo: true, mensaje: true, tipo: true, createdAt: true } }),
    prisma.planningClase.findMany({ where: { profesorId: id } }),
  ]);
  if (!perfil) return null;
  return {
    generadoEl: new Date().toISOString(), perfil, registrosJornada: registros, solicitudesLibres: libres,
    clases: clases.map(c => ({ fecha: c.fecha, horas: c.horas, disciplina: c.tipo.nombre, primas: c.primas.map(p => p.nombre), notas: c.notas, marca: c.marca, notaAdmin: c.notaAdmin })),
    revisionesMensuales: revisiones, confirmacionesMensuales: confirmaciones, documentos, firmasRegistro: firmas, notificaciones: notifs, planning,
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

// ============ WHATSAPP (Baileys) ============
// Carga condicional — requiere WHATSAPP_ENABLED=true en .env y ejecutar: npm install @whiskeysockets/baileys
let whatsapp = null;
if (process.env.WHATSAPP_ENABLED === 'true') {
  try {
    whatsapp = require('./whatsapp');
    whatsapp.init().catch(console.error);
    console.log('📱 WhatsApp Baileys: módulo cargado');
  } catch (e) {
    console.warn('⚠️  WhatsApp Baileys no disponible:', e.message);
  }
}

app.get('/api/whatsapp/status', auth, adminOnly, (req, res) => {
  if (!whatsapp) return res.json({ enabled: false, status: 'disabled' });
  res.json({ enabled: true, ...whatsapp.getStatus() });
});

app.get('/api/whatsapp/qr', auth, adminOnly, (req, res) => {
  if (!whatsapp) return res.status(503).json({ error: 'WhatsApp no habilitado' });
  const qr = whatsapp.getQR();
  if (!qr) return res.json({ connected: true });
  res.json({ qr });
});

app.post('/api/whatsapp/test', auth, adminOnly, async (req, res) => {
  if (!whatsapp) return res.status(503).json({ error: 'WhatsApp no habilitado' });
  const { telefono, mensaje } = req.body;
  try {
    await whatsapp.enviarMensaje(telefono, mensaje || 'Test desde Ski Jornada ⛷️');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ RECORDATORIOS AUTOMÁTICOS ============
// Comprueba cada minuto si algún empleado necesita recordatorio de desfichaje
setInterval(async () => {
  try {
    const ahora = new Date();
    const hh = ahora.getHours();
    const mm = ahora.getMinutes();

    const profesores = await prisma.profesor.findMany({
      where: { activo: true, NOT: { telefono: null } },
    });

    for (const p of profesores) {
      const [rh, rm] = (p.horaRecordatorio || '17:00').split(':').map(Number);
      if (hh !== rh || mm !== rm) continue;

      const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      const finDia    = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59);
      const ultReg    = await prisma.registroJornada.findFirst({
        where: { profesorId: p.id, timestamp: { gte: inicioDia, lte: finDia } },
        orderBy: { timestamp: 'desc' },
      });

      if (ultReg?.tipo === 'ENTRADA' && whatsapp?.getStatus().connected && p.telefono) {
        const msg = `⛷️ *Ski Jornada* — Hola ${p.nombre}, son las ${p.horaRecordatorio}. Recuerda fichar la salida.`;
        whatsapp.enviarMensaje(p.telefono, msg).catch(() => {});
      }
    }
  } catch {}
}, 60 * 1000);

// ============ START ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('========================================');
  console.log(`  Ski Jornada API — http://localhost:${PORT}`);
  if (process.env.PASSWORD_LOGIN === 'true') console.log('  Demo (PASSWORD_LOGIN): admin@escuela.com / profesor@escuela.com · ski123');
  console.log(RESEND_KEY ? '  📧 Email: Resend' : SMTP_OK ? '  📧 Email: SMTP' : '  📧 Email: modo consola');
  console.log(`  📱 WhatsApp: ${process.env.WHATSAPP_ENABLED === 'true' ? 'habilitado' : 'deshabilitado'}`);
  console.log('========================================');
});
