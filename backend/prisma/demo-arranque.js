// Siembra los datos de demostración UNA SOLA VEZ en una instancia de PRUEBAS desplegada (donde el equipo lo prueba).
// No hace nada salvo con SEED_DEMO=true. Se ejecuta en cada arranque, antes de la API (ver railway.json).
//
//   SEED_DEMO=true            activa la siembra (una vez: deja una marca junto a la base de datos)
//   SEED_DEMO_FORZAR=true     vuelve a sembrar aunque ya exista la marca (renueva fechas; borra lo cargado en las cuentas demo)
//   SEED_EMAILS={"admin@escuela.com":"...", ...}   correos reales para las cuentas demo (obligatorio mapear admin@escuela.com)
//   SEED_RESPETAR_CONFIG=true no sobrescribe el nombre/CIF/dirección de la escuela
//
// NUNCA activar en la instancia de un cliente con datos reales: el seed borra y recrea los datos de las cuentas demo,
// el registro de actividad y los colaboradores.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.env.SEED_DEMO !== 'true') process.exit(0);

let mapa = {};
try { mapa = JSON.parse(process.env.SEED_EMAILS || '{}'); } catch {}
if (!mapa['admin@escuela.com']) {
  console.error('❌ SEED_DEMO: define SEED_EMAILS con el correo real de la administración ("admin@escuela.com") para no crear una cuenta principal ficticia.');
  process.exit(1);
}

const url = process.env.DATABASE_URL || '';
const carpeta = url.startsWith('file:') ? path.dirname(path.resolve(url.slice(5))) : process.cwd();
const marca = path.join(carpeta, '.demo-sembrado');
if (fs.existsSync(marca) && process.env.SEED_DEMO_FORZAR !== 'true') {
  console.log('🌱 Datos de demostración ya cargados (SEED_DEMO_FORZAR=true para renovarlos).');
  process.exit(0);
}

console.log('🌱 Sembrando datos de demostración en la instancia de pruebas…');
try {
  execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], { stdio: 'inherit', env: { ...process.env, FORCE_SEED: 'true' } });
  fs.writeFileSync(marca, new Date().toISOString());
  console.log('✅ Datos de demostración cargados. Quita SEED_DEMO (o déjalo: no se repetirá sin SEED_DEMO_FORZAR).');
} catch (e) {
  console.error('❌ No se pudieron cargar los datos de demostración; la API arranca igualmente.');
}
