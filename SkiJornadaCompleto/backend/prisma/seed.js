const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generarSecreto() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function ts(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`);
}

async function main() {
  console.log('🌱 Iniciando seed de datos demo...');
  const hash = await bcrypt.hash('ski123', 10);

  // ── Usuarios ─────────────────────────────────────────────
  const admin = await prisma.profesor.upsert({
    where: { email: 'admin@escuela.com' },
    update: { password: hash },
    create: {
      email: 'admin@escuela.com', nombre: 'Ana', apellidos: 'Rodríguez',
      password: hash, tipoJornada: 'COMPLETA', horasContrato: 35, role: 'ADMIN',
    },
  });

  const carlos = await prisma.profesor.upsert({
    where: { email: 'profesor@escuela.com' },
    update: { password: hash },
    create: {
      email: 'profesor@escuela.com', nombre: 'Carlos', apellidos: 'Martínez',
      password: hash, tipoJornada: 'COMPLETA', horasContrato: 35, role: 'PROFESOR',
    },
  });

  const laura = await prisma.profesor.upsert({
    where: { email: 'laura.garcia@escuela.com' },
    update: { password: hash },
    create: {
      email: 'laura.garcia@escuela.com', nombre: 'Laura', apellidos: 'García',
      password: hash, tipoJornada: 'COMPLETA', horasContrato: 35, role: 'PROFESOR',
    },
  });

  const miguel = await prisma.profesor.upsert({
    where: { email: 'miguel.torres@escuela.com' },
    update: { password: hash },
    create: {
      email: 'miguel.torres@escuela.com', nombre: 'Miguel', apellidos: 'Torres',
      password: hash, tipoJornada: 'MEDIA', horasContrato: 20, role: 'PROFESOR',
    },
  });

  const sofia = await prisma.profesor.upsert({
    where: { email: 'sofia.perez@escuela.com' },
    update: { password: hash },
    create: {
      email: 'sofia.perez@escuela.com', nombre: 'Sofía', apellidos: 'Pérez',
      password: hash, tipoJornada: 'COMPLETA', horasContrato: 35, role: 'PROFESOR',
    },
  });

  // ── Zonas de fichaje ──────────────────────────────────────
  const zonaEntrada = await prisma.zonaFichaje.upsert({
    where: { id: 'zona-entrada' },
    update: {},
    create: {
      id: 'zona-entrada', nombre: 'Entrada Principal',
      descripcion: 'Acceso principal al edificio',
      secret: generarSecreto(), lat: 37.0907, lng: -3.3869, radio: 100,
      validationMode: 'TOTP_GPS', activa: true,
    },
  });

  const zonaOficina = await prisma.zonaFichaje.upsert({
    where: { id: 'zona-oficina' },
    update: {},
    create: {
      id: 'zona-oficina', nombre: 'Oficina Central',
      descripcion: 'Planta baja, ala norte',
      secret: generarSecreto(), lat: 37.0910, lng: -3.3870, radio: 80,
      validationMode: 'TOTP', activa: true,
    },
  });

  const zonaPista = await prisma.zonaFichaje.upsert({
    where: { id: 'zona-pista' },
    update: {},
    create: {
      id: 'zona-pista', nombre: 'Pista Borreguiles',
      descripcion: 'Zona de pistas principal',
      secret: generarSecreto(), lat: 37.0920, lng: -3.3900, radio: 200,
      validationMode: 'GPS', activa: true,
    },
  });

  // ── Registros de fichaje ──────────────────────────────────
  const yaHayRegistros = await prisma.registroJornada.count({ where: { profesorId: carlos.id } });
  if (yaHayRegistros === 0) {
    const fichajesCarlos = [
      { dia: '2026-04-07', e: '09:00', s: '17:30', zona: zonaEntrada },
      { dia: '2026-04-08', e: '08:45', s: '17:15', zona: zonaEntrada },
      { dia: '2026-04-09', e: '09:10', s: '18:10', zona: zonaOficina },
      { dia: '2026-04-10', e: '08:30', s: '16:30', zona: zonaPista },
      { dia: '2026-04-11', e: '09:00', s: '17:00', zona: zonaEntrada },
      { dia: '2026-04-14', e: '08:55', s: '17:25', zona: zonaEntrada },
      { dia: '2026-04-15', e: '09:05', s: '18:05', zona: zonaOficina },
      { dia: '2026-04-16', e: '08:40', s: '16:10', zona: zonaEntrada },
      { dia: '2026-04-22', e: '09:00', s: '17:30', zona: zonaEntrada },
      { dia: '2026-04-23', e: '08:50', s: '17:20', zona: zonaEntrada },
      { dia: '2026-04-24', e: '09:15', s: '18:15', zona: zonaOficina },
      { dia: '2026-04-25', e: '09:00', s: '17:00', zona: zonaPista },
      { dia: '2026-04-28', e: '08:45', s: '17:45', zona: zonaEntrada },
      { dia: '2026-04-29', e: '09:00', s: '17:30', zona: zonaEntrada },
      { dia: '2026-04-30', e: '08:30', s: '17:00', zona: zonaOficina },
      { dia: '2026-05-01', e: '09:00', s: '17:30', zona: zonaEntrada },
    ];

    for (const f of fichajesCarlos) {
      await prisma.registroJornada.createMany({
        data: [
          { profesorId: carlos.id, zonaId: f.zona.id, zonaNombre: f.zona.nombre, tipo: 'ENTRADA', timestamp: ts(f.dia, f.e) },
          { profesorId: carlos.id, zonaId: f.zona.id, zonaNombre: f.zona.nombre, tipo: 'SALIDA',  timestamp: ts(f.dia, f.s) },
        ],
      });
    }
  }

  const yaHayRegLaura = await prisma.registroJornada.count({ where: { profesorId: laura.id } });
  if (yaHayRegLaura === 0) {
    const fichajesLaura = [
      { dia: '2026-04-07', e: '08:30', s: '16:30', zona: zonaPista },
      { dia: '2026-04-08', e: '08:00', s: '15:45', zona: zonaPista },
      { dia: '2026-04-09', e: '08:45', s: '17:00', zona: zonaEntrada },
      { dia: '2026-04-10', e: '09:00', s: '17:30', zona: zonaPista },
      { dia: '2026-04-14', e: '08:30', s: '16:00', zona: zonaPista },
      { dia: '2026-04-15', e: '09:00', s: '17:00', zona: zonaEntrada },
      { dia: '2026-04-22', e: '08:45', s: '16:45', zona: zonaPista },
      { dia: '2026-04-23', e: '09:00', s: '17:30', zona: zonaPista },
      { dia: '2026-04-28', e: '08:30', s: '16:30', zona: zonaEntrada },
      { dia: '2026-04-29', e: '09:00', s: '17:00', zona: zonaEntrada },
      { dia: '2026-04-30', e: '08:45', s: '17:15', zona: zonaPista },
    ];
    for (const f of fichajesLaura) {
      await prisma.registroJornada.createMany({
        data: [
          { profesorId: laura.id, zonaId: f.zona.id, zonaNombre: f.zona.nombre, tipo: 'ENTRADA', timestamp: ts(f.dia, f.e) },
          { profesorId: laura.id, zonaId: f.zona.id, zonaNombre: f.zona.nombre, tipo: 'SALIDA',  timestamp: ts(f.dia, f.s) },
        ],
      });
    }
  }

  const yaHayRegMiguel = await prisma.registroJornada.count({ where: { profesorId: miguel.id } });
  if (yaHayRegMiguel === 0) {
    const fichajesMiguel = [
      { dia: '2026-04-07', e: '09:00', s: '13:00', zona: zonaOficina },
      { dia: '2026-04-08', e: '09:00', s: '13:00', zona: zonaOficina },
      { dia: '2026-04-09', e: '09:00', s: '13:30', zona: zonaOficina },
      { dia: '2026-04-14', e: '09:00', s: '13:00', zona: zonaOficina },
      { dia: '2026-04-15', e: '09:00', s: '13:00', zona: zonaOficina },
      { dia: '2026-04-22', e: '09:00', s: '13:00', zona: zonaOficina },
      { dia: '2026-04-28', e: '09:00', s: '13:00', zona: zonaOficina },
      { dia: '2026-04-29', e: '09:00', s: '13:00', zona: zonaOficina },
    ];
    for (const f of fichajesMiguel) {
      await prisma.registroJornada.createMany({
        data: [
          { profesorId: miguel.id, zonaId: f.zona.id, zonaNombre: f.zona.nombre, tipo: 'ENTRADA', timestamp: ts(f.dia, f.e) },
          { profesorId: miguel.id, zonaId: f.zona.id, zonaNombre: f.zona.nombre, tipo: 'SALIDA',  timestamp: ts(f.dia, f.s) },
        ],
      });
    }
  }

  // ── Solicitudes de días libres ────────────────────────────
  const yaHaySols = await prisma.solicitudLibre.count();
  if (yaHaySols === 0) {
    await prisma.solicitudLibre.createMany({
      data: [
        {
          profesorId: carlos.id,
          fechaInicio: new Date('2026-05-15'), fechaFin: new Date('2026-05-22'),
          motivo: 'VACACIONES', estado: 'APROBADO',
          aprobadoPor: admin.id, fechaRespuesta: new Date('2026-05-01'),
        },
        {
          profesorId: laura.id,
          fechaInicio: new Date('2026-05-05'), fechaFin: new Date('2026-05-05'),
          motivo: 'ASUNTO_PROPIO', comentario: 'Gestión médica', estado: 'PENDIENTE',
        },
        {
          profesorId: miguel.id,
          fechaInicio: new Date('2026-04-20'), fechaFin: new Date('2026-04-24'),
          motivo: 'ENFERMEDAD', estado: 'APROBADO',
          aprobadoPor: admin.id, fechaRespuesta: new Date('2026-04-20'),
        },
        {
          profesorId: sofia.id,
          fechaInicio: new Date('2026-06-02'), fechaFin: new Date('2026-06-13'),
          motivo: 'VACACIONES', comentario: 'Vacaciones de verano', estado: 'PENDIENTE',
        },
        {
          profesorId: carlos.id,
          fechaInicio: new Date('2026-04-17'), fechaFin: new Date('2026-04-18'),
          motivo: 'ASUNTO_PROPIO', estado: 'APROBADO',
          aprobadoPor: admin.id, fechaRespuesta: new Date('2026-04-16'),
        },
      ],
    });
  }

  console.log('\n✅ Seed completado exitosamente');
  console.log('\n👤 Cuentas demo (contraseña: ski123):');
  console.log('   🔑 Admin:    admin@escuela.com');
  console.log('   👨 Profesor: profesor@escuela.com  (Carlos Martínez)');
  console.log('   👩 Profesor: laura.garcia@escuela.com  (Laura García)');
  console.log('   👨 Profesor: miguel.torres@escuela.com  (Miguel Torres, media jornada)');
  console.log('   👩 Profesor: sofia.perez@escuela.com  (Sofía Pérez)');
  console.log('\n📍 Zonas: Entrada Principal (TOTP+GPS), Oficina Central (TOTP), Pista Borreguiles (GPS)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
