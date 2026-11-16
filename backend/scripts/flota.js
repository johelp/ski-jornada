#!/usr/bin/env node
// Estado de la flota de clientes: consulta /api/salud de cada instalación y compara versiones.
//
//   node scripts/flota.js [estado]            comprueba todos los clientes activos y guarda el resultado
//   node scripts/flota.js lista               lista el registro sin consultar nada
//   node scripts/flota.js estado --archivo f.json   usa un registro en un archivo en vez de la base (no guarda nada)
//   opciones: --json (salida para máquinas) · --solo-anillo DEMO|PILOTO|CLIENTE · --sin-guardar
//
// Termina con código 1 si algún cliente está caído o desactualizado (sirve para alertas y CI).
// La base del registro vive en la instalación del proveedor: ejecutarlo allí, p. ej. `railway ssh -- node scripts/flota.js`.
const fs = require('fs');
const path = require('path');
const flota = require('../flota');

const args = process.argv.slice(2);
const cmd = args.find(a => !a.startsWith('--')) || 'estado';
const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = n => args.includes(`--${n}`);
const referencia = require('../package.json').version;

const color = (c, t) => (process.stdout.isTTY && !flag('json') ? `\x1b[${c}m${t}\x1b[0m` : t);
const ETIQ = { AL_DIA: color(32, 'AL DÍA'), DESACTUALIZADO: color(33, 'DESACTUALIZADO'), CAIDO: color(31, 'CAÍDO') };
const pad = (s, n) => String(s ?? '').replace(/\x1b\[\d+m/g, '').length >= n ? String(s ?? '') : String(s ?? '') + ' '.repeat(n - String(s ?? '').replace(/\x1b\[\d+m/g, '').length);
const dia = d => (d ? new Date(d).toISOString().slice(0, 10) : '—');

async function main() {
  let prisma = null, clientes;
  const archivo = opt('archivo');
  if (archivo) {
    clientes = JSON.parse(fs.readFileSync(path.resolve(archivo), 'utf8'));
    if (!Array.isArray(clientes)) throw new Error('El archivo debe contener una lista de clientes');
    clientes = clientes.map((c, i) => { const v = flota.validarCliente(c); if (v.error) throw new Error(`Cliente ${i + 1} (${c.nombre || '?'}): ${v.error}`); return { id: `f${i}`, ...v.data, activo: c.activo !== false }; });
  } else {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    clientes = await prisma.clienteFlota.findMany();
  }
  const orden = { DEMO: 0, PILOTO: 1, CLIENTE: 2 };
  clientes.sort((a, b) => (orden[a.anillo] - orden[b.anillo]) || a.nombre.localeCompare(b.nombre, 'es'));
  const sa = opt('solo-anillo'); if (sa) clientes = clientes.filter(c => c.anillo === sa.toUpperCase());

  if (cmd === 'lista') {
    if (flag('json')) console.log(JSON.stringify(clientes, null, 2));
    else for (const c of clientes) console.log(`${pad(c.anillo, 8)}${pad(c.nombre, 28)}${pad(c.tramo, 9)}${pad(c.urlApi, 44)}renueva ${dia(c.renovacionAt)}${c.activo ? '' : '  (inactivo)'}`);
    if (prisma) await prisma.$disconnect();
    return 0;
  }
  if (cmd !== 'estado') throw new Error(`Orden desconocida: ${cmd} (estado | lista)`);

  const activos = clientes.filter(c => c.activo);
  const res = await flota.comprobarTodos(activos, { referencia });
  if (prisma && !flag('sin-guardar')) await Promise.all(activos.map((c, i) => prisma.clienteFlota.update({ where: { id: c.id }, data: flota.comoCampos(res[i]) })));
  if (prisma) await prisma.$disconnect();

  const filas = activos.map((c, i) => ({ nombre: c.nombre, anillo: c.anillo, urlApi: c.urlApi, esperada: c.versionEsperada || referencia, ...res[i] }));
  if (flag('json')) console.log(JSON.stringify({ versionReferencia: referencia, clientes: filas }, null, 2));
  else {
    console.log(`Versión de referencia: ${referencia}\n`);
    console.log(['CLIENTE', 'ANILLO', 'ESTADO', 'VERSIÓN', 'COMMIT', 'MS', 'PUSH'].map((t, i) => pad(t, [28, 9, 16, 9, 9, 6, 6][i])).join(''));
    for (const f of filas) {
      console.log([pad(f.nombre.slice(0, 26), 28), pad(f.anillo, 9), pad(ETIQ[f.estado], 16), pad(f.version || '—', 9), pad(f.commit || '—', 9), pad(f.latenciaMs ?? '—', 6), pad(f.push == null ? '—' : f.push ? 'sí' : 'no', 6)].join('') + (f.error ? `  ${f.error}` : ''));
    }
    const n = e => filas.filter(f => f.estado === e).length;
    console.log(`\n${filas.length} clientes: ${n('AL_DIA')} al día · ${n('DESACTUALIZADO')} desactualizados · ${n('CAIDO')} caídos`);
  }
  return filas.some(f => f.estado !== 'AL_DIA') ? 1 : 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(`Error: ${e.message}`); process.exit(2); });
