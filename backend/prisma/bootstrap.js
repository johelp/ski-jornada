// Inicialización idempotente para PRODUCCIÓN: catálogo base + primer administrador.
// Variables: ADMIN_EMAIL (obligatoria la primera vez), ADMIN_NOMBRE, ADMIN_APELLIDOS.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  for (const nombre of ['Esquí', 'Snowboard']) {
    await prisma.tipoClase.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  for (const [nombre, modo] of [['Idioma', 'POR_HORA'], ['Disca', 'POR_HORA'], ['Repetida', 'POR_CLASE']]) {
    await prisma.primaClase.upsert({ where: { nombre }, update: {}, create: { nombre, modo } });
  }
  // Datos de la escuela en blanco (los completa la administración): los valores de ejemplo del esquema no deben salir en informes legales
  await prisma.configEscuela.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default', nombre: '', cif: '', direccion: '', telefono: '' } });
  for (const [campo, ejemplo] of [['nombre', 'Escuela de Esquí Sierra Nevada'], ['cif', 'B12345678'], ['direccion', 'Sierra Nevada, Granada'], ['telefono', '958 000 000']]) {
    await prisma.configEscuela.updateMany({ where: { id: 'default', [campo]: ejemplo }, data: { [campo]: '' } });
  }

  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  if (!email) {
    if (!(await prisma.profesor.count({ where: { role: 'ADMIN' } }))) console.warn('⚠️  No hay administrador: definí ADMIN_EMAIL y volvé a desplegar.');
    return;
  }
  await prisma.profesor.upsert({
    where: { email },
    update: { role: 'ADMIN', activo: true, esPrincipal: true },
    create: {
      email, role: 'ADMIN', esPrincipal: true,
      nombre: process.env.ADMIN_NOMBRE || 'Admin',
      apellidos: process.env.ADMIN_APELLIDOS ?? '', // puede ser una cuenta de empresa (sin apellidos)
      password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10), // se entra por enlace mágico
    },
  });
  console.log(`✅ Administrador listo: ${email}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
