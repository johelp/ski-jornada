import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
export const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

const verificarToken = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    req.userId = (decoded as any).userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const jwt = await import('jsonwebtoken');
  
  const profesor = await prisma.profesor.findFirst({
    where: { email: email }
  });
  
  if (!profesor) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  
  const token = jwt.sign(
    { userId: profesor.id, email: profesor.email, role: 'PROFESOR' },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
  
  res.json({ token, profesor: { id: profesor.id, nombre: profesor.nombre, apellidos: profesor.apellidos } });
});

app.post('/api/fichaje/fichar', verificarToken, async (req: any, res: any) => {
  const { qrCodeId, lat, lng } = req.body;
  const profesorId = req.userId;
  
  try {
    const zona = await prisma.zonaFichaje.findFirst({
      where: { id: qrCodeId },
      include: { escuela: true }
    });
    
    if (!zona) {
      return res.status(404).json({ error: 'Código QR no válido' });
    }
    
    const distancia = Math.sqrt(Math.pow(lat - zona.lat, 2) + Math.pow(lng - zona.lng, 2)) * 111000;
    
    if (distancia > zona.escuela.radioMetros) {
      return res.status(400).json({ 
        error: 'Debes estar dentro del radio de ' + zona.escuela.radioMetros + 'm'
      });
    }
    
    const ultimoRegistro = await prisma.registroJornada.findFirst({
      where: { profesorId },
      orderBy: { timestamp: 'desc' }
    });
    
    const tipo = (!ultimoRegistro || ultimoRegistro.tipo === 'SALIDA') ? 'ENTRADA' : 'SALIDA';
    
    const registro = await prisma.registroJornada.create({
      data: {
        profesorId,
        zonaFichajeId: zona.id,
        tipo,
        lat: lat || 0,
        lng: lng || 0,
        dentroRadio: distancia <= zona.escuela.radioMetros,
        dispositivoFingerprint: 'test-fingerprint',
        esIncidencia: false
      }
    });
    
    res.json({ success: true, tipo, timestamp: registro.timestamp });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al procesar fichaje' });
  }
});

app.get('/api/fichaje/historial', verificarToken, async (req: any, res: any) => {
  const profesorId = req.userId;
  const registros = await prisma.registroJornada.findMany({
    where: { profesorId },
    include: { zonaFichaje: true },
    orderBy: { timestamp: 'desc' },
    take: 30
  });
  
  const historial: any = {};
  registros.forEach(reg => {
    const dia = reg.timestamp.toISOString().split('T')[0];
    if (!historial[dia]) historial[dia] = [];
    historial[dia].push({
      tipo: reg.tipo,
      hora: new Date(reg.timestamp).toLocaleTimeString(),
      zona: reg.zonaFichaje.nombre
    });
  });
  res.json(historial);
});

app.post('/api/libres/solicitar', verificarToken, async (req: any, res: any) => {
  const { fechaInicio, fechaFin, motivo, comentario } = req.body;
  const solicitud = await prisma.solicitudLibre.create({
    data: {
      profesorId: req.userId,
      fechaInicio: new Date(fechaInicio),
      fechaFin: new Date(fechaFin),
      motivo,
      comentario,
      estado: 'PENDIENTE'
    }
  });
  res.json({ success: true, solicitud });
});

app.get('/api/libres/mis-solicitudes', verificarToken, async (req: any, res: any) => {
  const solicitudes = await prisma.solicitudLibre.findMany({
    where: { profesorId: req.userId },
    orderBy: { createdAt: 'desc' }
  });
  res.json(solicitudes);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT);
});