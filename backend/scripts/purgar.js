#!/usr/bin/env node
// Retención de datos (RGPD): elimina por completo a los profesores DADOS DE BAJA cuya última
// actividad es anterior a N años (por defecto 4, plazo de conservación del registro de jornada, RD 8/2019).
// Uso:  node scripts/purgar.js [--anios=4]            → simulación (no borra nada)
//       node scripts/purgar.js [--anios=4] --aplicar  → borra de verdad (también los PDFs)
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const anios = parseInt((process.argv.find(a => a.startsWith('--anios=')) || '--anios=4').split('=')[1]) || 4;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

async function main() {
  const limite = new Date(); limite.setFullYear(limite.getFullYear() - anios);
  const limiteFecha = limite.toISOString().slice(0, 10);
  const bajas = await prisma.profesor.findMany({ where: { activo: false } });
  let afectados = 0;
  for (const p of bajas) {
    const [ultReg, ultClase] = await Promise.all([
      prisma.registroJornada.findFirst({ where: { profesorId: p.id }, orderBy: { timestamp: 'desc' } }),
      prisma.claseDada.findFirst({ where: { profesorId: p.id }, orderBy: { fecha: 'desc' } }),
    ]);
    const ultima = new Date(Math.max(p.createdAt.getTime(), ultReg?.timestamp.getTime() || 0, ultClase ? new Date(ultClase.fecha).getTime() : 0));
    if (ultima > limite) continue;
    afectados++;
    console.log(`${aplicar ? 'BORRANDO' : '[simulado]'} ${p.email} — última actividad ${ultima.toISOString().slice(0, 10)} (límite ${limiteFecha})`);
    if (!aplicar) continue;
    const docs = await prisma.documentoLegajo.findMany({ where: { profesorId: p.id } });
    const firmas = await prisma.firmaRegistro.findMany({ where: { profesorId: p.id } });
    const archivos = [
      ...docs.flatMap(d => [['documentos', d.archivoPath], d.firmaPath && ['firmas', d.firmaPath]]),
      ...firmas.map(f => f.pdfFirmadoPath && ['firmas', f.pdfFirmadoPath]),
    ].filter(Boolean);
    await prisma.$transaction([
      prisma.notificacion.deleteMany({ where: { OR: [{ profesorId: p.id }, { enviadaPorId: p.id }] } }),
      prisma.registroJornada.deleteMany({ where: { profesorId: p.id } }),
      prisma.solicitudLibre.deleteMany({ where: { profesorId: p.id } }),
      prisma.firmaRegistro.deleteMany({ where: { profesorId: p.id } }),
      prisma.documentoLegajo.deleteMany({ where: { profesorId: p.id } }),
      prisma.claseDada.deleteMany({ where: { profesorId: p.id } }),
      prisma.confirmacionClases.deleteMany({ where: { profesorId: p.id } }),
      prisma.profesor.delete({ where: { id: p.id } }), // RevisionMes, MagicLink y Planning caen en cascada
    ]);
    archivos.forEach(([sub, f]) => { try { fs.unlinkSync(path.join(UPLOAD_DIR, sub, f)); } catch {} });
  }
  console.log(`\n${afectados} profesor(es) ${aplicar ? 'eliminados' : 'a eliminar (simulación: usa --aplicar para borrar)'}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
