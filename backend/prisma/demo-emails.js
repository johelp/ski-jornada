// Correos de las cuentas demo. Por defecto son ficticios (@escuela.com). En una instancia de pruebas desplegada, donde el
// equipo entra por enlace, se asignan correos reales con SEED_EMAILS (JSON), p. ej.:
//   SEED_EMAILS={"admin@escuela.com":"ana@miempresa.com","laura.garcia@escuela.com":"laura@miempresa.com"}
// Las cuentas no mapeadas conservan su correo ficticio (no reciben el enlace de acceso).
let mapa = {};
try { mapa = JSON.parse(process.env.SEED_EMAILS || '{}'); } catch { console.warn('⚠️  SEED_EMAILS no es un JSON válido: se ignora'); }
const em = e => String(mapa[e] || e).toLowerCase().trim();
module.exports = { em };
