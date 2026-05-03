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
const prisma = new PrismaClient();
const app = express();

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
const UPLOAD_DIR = path.join(__dirname, 'uploads');
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

app.use('/uploads', express.static(UPLOAD_DIR));

// ============ EMAIL ============
const SMTP_OK = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function enviarEmail(to, subject, html, attachments = []) {
  if (!SMTP_OK) {
    console.log(`📧 [SIMULADO] → ${to}: ${subject}`);
    return;
  }
  await emailTransporter.sendMail({
    from: process.env.EMAIL_FROM || 'Ski Jornada <no-reply@skijornada.com>',
    to, subject, html, attachments,
  });
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
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'mi-secreto'); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Requiere permisos de administrador' });
  next();
};

// ============ SERVER TIME ============
app.get('/api/server-time', (req, res) => {
  res.json({ timestamp: Date.now(), iso: new Date().toISOString() });
});

// ============ AUTH ============
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const u = await prisma.profesor.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!u || !u.activo) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const valid = await bcrypt.compare(password, u.password);
    if (!valid) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const token = jwt.sign(
      { userId: u.id, email: u.email, role: u.role },
      process.env.JWT_SECRET || 'mi-secreto',
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
        createdAt: true, telefono: true, horaRecordatorio: true,
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

    const password = await bcrypt.hash('ski123', 10);
    const nuevo = await prisma.profesor.create({
      data: {
        email: email.toLowerCase().trim(), nombre, apellidos, password,
        tipoJornada: tipoJornada || 'COMPLETA',
        horasContrato: parseInt(horasContrato) || 35,
        role: role === 'ADMIN' ? 'ADMIN' : 'PROFESOR',
        telefono: telefono || null,
      },
    });
    enviarEmailBienvenida(nuevo).catch(console.error);
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
    const { nombre, apellidos, tipoJornada, horasContrato, activo, telefono, horaRecordatorio } = req.body;
    const data = {};
    if (nombre           !== undefined) data.nombre           = nombre;
    if (apellidos        !== undefined) data.apellidos        = apellidos;
    if (tipoJornada      !== undefined) data.tipoJornada      = tipoJornada;
    if (horasContrato    !== undefined) data.horasContrato    = parseInt(horasContrato);
    if (activo           !== undefined) data.activo           = activo;
    if (telefono         !== undefined) data.telefono         = telefono || null;
    if (horaRecordatorio !== undefined) data.horaRecordatorio = horaRecordatorio;
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

app.post('/api/documentos/:id/firmar', auth, upload.single('pdf'), async (req, res) => {
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
  console.log('  Admin:    admin@escuela.com / ski123');
  console.log('  Profesor: profesor@escuela.com / ski123');
  console.log(SMTP_OK ? '  📧 Email: configurado' : '  📧 Email: modo consola (sin SMTP)');
  console.log(`  📱 WhatsApp: ${process.env.WHATSAPP_ENABLED === 'true' ? 'habilitado' : 'deshabilitado'}`);
  console.log('========================================');
});
