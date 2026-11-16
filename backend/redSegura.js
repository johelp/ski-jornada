// Comprobación de destinos salientes: el servidor nunca debe llamar a la red interna (SSRF).
// Se resuelve el host y se rechazan las IP privadas. Lo usan los webhooks y la flota de clientes.
const dns = require('dns').promises;
const net = require('net');

function ipPrivada(ip) {
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:') && ipPrivada(l.slice(7)); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function destinoPublico(url) {
  const u = new URL(url);
  if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return !ipPrivada(host);
  const dirs = await dns.lookup(host, { all: true });
  return dirs.length > 0 && dirs.every(d => !ipPrivada(d.address));
}

module.exports = { ipPrivada, destinoPublico };
