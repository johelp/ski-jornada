// Firma dibujada en pantalla, estampada en el propio PDF como una página final de «constancia de recepción».
// Es una firma electrónica SIMPLE: deja constancia de recepción y visualización, no se basa en un certificado.
// El texto de alcance (NOTA_ALCANCE) debe validarlo el asesor legal de cada escuela (ver docs/legal/).
const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const NOTA_ALCANCE = [
  'Esta firma es una firma electrónica simple, hecha a mano sobre la pantalla. Deja constancia de que el documento fue recibido y visualizado por la persona indicada, en la fecha y hora señaladas.',
  'No es una firma electrónica avanzada ni cualificada (no se basa en un certificado electrónico), por lo que no tiene el mismo valor probatorio que estas ni sustituye a una firma con certificado cuando la ley o el contrato la exijan. Si hay discrepancia, su eficacia se valorará junto con el resto de pruebas.',
  'La huella SHA-256 permite comprobar que el documento original no ha cambiado desde que se firmó.',
];

const MAX_PNG = 600 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// data:image/png;base64,... → Buffer (o null si no es un PNG razonable)
function pngDesdeDataUrl(s) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''));
  if (!m) return null;
  const b = Buffer.from(m[1], 'base64');
  return b.length > 60 && b.length <= MAX_PNG && b.subarray(0, 8).equals(PNG_MAGIC) ? b : null;
}

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

// Helvetica estándar solo codifica WinAnsi: lo que no entre se sustituye por «?» para que un nombre raro no rompa la firma
const seguro = (font, s) => [...String(s)].map(c => { try { font.encodeText(c); return c; } catch { return '?'; } }).join('');

function lineas(font, texto, tam, ancho) {
  const out = []; let linea = '';
  for (const p of texto.split(/\s+/)) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (font.widthOfTextAtSize(prueba, tam) <= ancho) linea = prueba; else { if (linea) out.push(linea); linea = p; }
  }
  if (linea) out.push(linea);
  return out;
}

/** Devuelve el PDF original con una página final de constancia. Lanza si el PDF no se puede abrir (p. ej. cifrado). */
async function estamparFirma({ pdfOriginal, png, firmante, documento, escuela, fecha = new Date() }) {
  const pdf = await PDFDocument.load(pdfOriginal, { updateMetadata: false });
  const imagen = await pdf.embedPng(png);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const pag = pdf.addPage([595.28, 841.89]);
  const M = 50, W = 595.28 - 2 * M;
  const gris = rgb(0.35, 0.4, 0.48), tinta = rgb(0.12, 0.16, 0.23);
  let y = 790;
  const texto = (t, { f = normal, s = 10, c = tinta, x = M } = {}) => { pag.drawText(seguro(f, t), { x, y, size: s, font: f, color: c }); y -= s + 5; };

  texto('Constancia de recepción y firma en pantalla', { f: negrita, s: 17 });
  if (escuela) texto(escuela, { s: 10, c: gris });
  y -= 14;
  texto('Documento', { f: negrita, s: 9, c: gris });
  for (const l of lineas(normal, seguro(normal, documento), 11, W)) texto(l, { s: 11 });
  y -= 6;
  texto('Firmante', { f: negrita, s: 9, c: gris });
  texto(firmante, { s: 11 });
  y -= 6;
  texto('Fecha y hora de la firma', { f: negrita, s: 9, c: gris });
  texto(fecha.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'medium' }), { s: 11 });
  y -= 6;
  const huella = sha256(pdfOriginal);
  texto('Huella SHA-256 del documento original', { f: negrita, s: 9, c: gris });
  texto(huella.slice(0, 32), { f: mono, s: 9 });
  texto(huella.slice(32), { f: mono, s: 9 });
  y -= 14;

  // Firma
  texto('Firma', { f: negrita, s: 9, c: gris });
  const esc = Math.min(260 / imagen.width, 110 / imagen.height, 1);
  const w = imagen.width * esc, h = imagen.height * esc;
  pag.drawRectangle({ x: M, y: y - 118, width: 280, height: 122, borderColor: rgb(0.8, 0.83, 0.88), borderWidth: 0.8 });
  pag.drawImage(imagen, { x: M + 10, y: y - 112 + (110 - h) / 2, width: w, height: h });
  y -= 140;

  // Nota de alcance
  const cuerpo = NOTA_ALCANCE.flatMap(p => [...lineas(normal, seguro(normal, p), 9.5, W - 24), '']);
  const alto = cuerpo.length * 13.5 + 36;
  pag.drawRectangle({ x: M, y: y - alto + 14, width: W, height: alto, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.6 });
  y -= 6;
  texto('Qué significa esta firma', { f: negrita, s: 10, x: M + 12 });
  for (const l of cuerpo) { if (l) pag.drawText(l, { x: M + 12, y, size: 9.5, font: normal, color: tinta }); y -= 13.5; }

  return { pdf: Buffer.from(await pdf.save()), huellaOriginal: huella };
}

module.exports = { estamparFirma, pngDesdeDataUrl, NOTA_ALCANCE, sha256 };
