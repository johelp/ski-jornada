// Carga masiva de profesores desde un CSV (idempotente: actualiza por email).
// Uso:  node prisma/import-profesores.js ../deploy/profesores.csv [--dry]
// Columnas: nombre,apellidos,email,telefono,tipoJornada,horasContrato,tarifaHora,rol
// No envía correos: cada profesor entra pidiendo su enlace con el email cargado.
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const [archivo, ...flags] = process.argv.slice(2);
const dry = flags.includes('--dry');

function parsear(texto) {
  const filas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const cab = filas.shift().split(',').map(c => c.trim());
  return filas.map(l => {
    const v = l.split(',').map(c => c.trim());
    return Object.fromEntries(cab.map((c, i) => [c, v[i] ?? '']));
  });
}

async function main() {
  if (!archivo) { console.error('Uso: node prisma/import-profesores.js <archivo.csv> [--dry]'); process.exit(1); }
  const filas = parsear(fs.readFileSync(archivo, 'utf8'));
  let creados = 0, actualizados = 0, errores = 0;
  for (const [i, f] of filas.entries()) {
    const email = f.email.toLowerCase();
    if (!f.nombre || !f.apellidos || !/^\S+@\S+\.\S+$/.test(email)) { console.error(`Fila ${i + 2}: datos inválidos (${f.email || 'sin email'})`); errores++; continue; }
    const tarifa = f.tarifaHora === '' ? null : parseFloat(f.tarifaHora.replace(',', '.'));
    if (tarifa !== null && isNaN(tarifa)) { console.error(`Fila ${i + 2}: tarifa inválida`); errores++; continue; }
    const datos = {
      nombre: f.nombre, apellidos: f.apellidos, telefono: f.telefono || null,
      tipoJornada: f.tipoJornada === 'MEDIA_JORNADA' ? 'MEDIA_JORNADA' : 'COMPLETA',
      horasContrato: parseInt(f.horasContrato) || 35,
      tarifaHora: tarifa, role: String(f.rol).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'PROFESOR', activo: true,
    };
    const existe = await prisma.profesor.findUnique({ where: { email } });
    if (!dry) {
      if (existe) await prisma.profesor.update({ where: { email }, data: datos });
      else await prisma.profesor.create({ data: { ...datos, email, password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10) } });
    }
    existe ? actualizados++ : creados++;
    console.log(`${dry ? '[simulado] ' : ''}${existe ? 'actualizado' : 'creado    '} ${email} (${datos.role})`);
  }
  console.log(`\n${creados} creados, ${actualizados} actualizados, ${errores} con error${dry ? ' (simulación: no se guardó nada)' : ''}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
