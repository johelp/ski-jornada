#!/usr/bin/env node
// Genera el par de claves VAPID para las notificaciones push de un despliegue.
//   node scripts/vapid-keys.js          → las muestra para copiarlas a las variables del servidor
//   node scripts/vapid-keys.js --env    → formato VARIABLE=valor (p. ej. para añadir a un archivo de entorno)
// La clave PRIVADA es un secreto: solo va en las variables de entorno del servidor (Railway), nunca al repositorio ni a la web.
// Hay que generarla UNA vez por cliente y no cambiarla: si cambia, todos los dispositivos tendrían que volver a activar las notificaciones.
const webpush = require('web-push');
const k = webpush.generateVAPIDKeys();
if (process.argv.includes('--env')) {
  console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
} else {
  console.log('\nClaves VAPID generadas. Añádelas como variables del servidor (Railway):\n');
  console.log(`  VAPID_PUBLIC_KEY=${k.publicKey}`);
  console.log(`  VAPID_PRIVATE_KEY=${k.privateKey}`);
  console.log('  VAPID_SUBJECT=mailto:administracion@tuescuela.com   (o usa ADMIN_EMAIL)\n');
  console.log('La clave privada es un secreto. Guárdala en el gestor de contraseñas y no la cambies después.\n');
}
