// PDF de prueba con y sin firma digital (certificado autofirmado de pega, generado al vuelo con openssl).
// Solo para el smoke y las pruebas: nada de esto es un certificado real.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HEX = 8192; // tamaño reservado para la firma (hex)
const base = (extra = '') => `%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n${extra}trailer<</Root 1 0 R>>\n%%EOF\n`;

function crearPdfSinFirma() { return Buffer.from(base(), 'latin1'); }

function crearPdfFirmado({ cn = 'GARCIA LOPEZ MARIA - NIF 12345678Z', md = 'sha256' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'firma-test-'));
  try {
    const key = path.join(dir, 'k.pem'), crt = path.join(dir, 'c.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '30', '-subj', `/C=ES/O=Prueba/CN=${cn}`], { stdio: 'ignore' });
    const sig = `4 0 obj<</Type/Sig/Filter/Adobe.PPKLite/SubFilter/adbe.pkcs7.detached/ByteRange [0 0000000000 0000000000 0000000000]/Contents <${'0'.repeat(HEX)}>>>endobj\n`;
    const pdf = Buffer.from(base(sig), 'latin1');
    const txt = pdf.toString('latin1');
    const ini = txt.indexOf('/Contents <') + '/Contents '.length; // posición de '<'
    const fin = ini + HEX + 2;                                      // justo después de '>'
    const rango = [0, ini, fin, pdf.length - fin].map((n, i) => (i === 0 ? String(n) : String(n).padStart(10, '0')));
    const cab = `/ByteRange [${rango.join(' ')}]`;
    const viejo = '/ByteRange [0 0000000000 0000000000 0000000000]';
    const pos = txt.indexOf(viejo);
    pdf.write(cab.padEnd(viejo.length), pos, 'latin1');
    const firmado = Buffer.concat([pdf.subarray(0, ini), pdf.subarray(fin)]);
    const entrada = path.join(dir, 'in.bin'); fs.writeFileSync(entrada, firmado);
    const cms = execFileSync('openssl', ['smime', '-sign', '-binary', '-in', entrada, '-signer', crt, '-inkey', key, '-md', md, '-outform', 'DER']);
    if (cms.length * 2 > HEX) throw new Error('Firma demasiado grande para el hueco reservado');
    pdf.write(cms.toString('hex').padEnd(HEX, '0'), ini + 1, 'latin1');
    return pdf;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

module.exports = { crearPdfSinFirma, crearPdfFirmado };
