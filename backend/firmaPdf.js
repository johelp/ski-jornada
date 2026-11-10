// Comprobación de firmas electrónicas incrustadas en un PDF (PAdES / CMS detached), sin dependencias.
//
// Qué comprueba: que el PDF lleva firma digital, que el contenido firmado no se ha tocado (hash y firma criptográfica
// contra la clave del certificado incluido) y quién firmó según ese certificado.
// Qué NO comprueba: que el certificado lo emita un prestador reconocido ni que no esté revocado (cadena de confianza,
// OCSP/CRL) ni el sello de tiempo. Por eso el mejor estado es INTEGRA y no «válida». Ver docs/PLAN-AUTOFIRMA.md.
const crypto = require('crypto');

const ESTADOS = {
  SIN_FIRMA_ELECTRONICA: 'SIN_FIRMA_ELECTRONICA', // PDF sin firma digital (p. ej. firmado a mano y escaneado)
  INTEGRA: 'INTEGRA',                             // firma criptográficamente correcta sobre el documento
  CON_CAMBIOS: 'CON_CAMBIOS',                     // firma correcta, pero hay contenido añadido después de firmar
  NO_COMPROBADA: 'NO_COMPROBADA',                 // hay firma, pero no se ha podido comprobar (formato o algoritmo no soportado)
  ALTERADA: 'ALTERADA',                           // el contenido no coincide con lo firmado: documento modificado
};

const HASHES = { '1.3.14.3.2.26': 'sha1', '2.16.840.1.101.3.4.2.1': 'sha256', '2.16.840.1.101.3.4.2.2': 'sha384', '2.16.840.1.101.3.4.2.3': 'sha512' };
const OID = {
  signedData: '1.2.840.113549.1.7.2', messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5',
  tstInfo: '1.2.840.113549.1.9.16.1.4', rsaPss: '1.2.840.113549.1.1.10',
};

// ---- Lector DER mínimo ----
function der(buf, pos) {
  if (pos + 2 > buf.length) throw new Error('DER truncado');
  const tag = buf[pos]; let len = buf[pos + 1]; let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('Longitud DER no soportada');
    len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[pos + 2 + i];
    hdr = 2 + n;
  }
  const ini = pos + hdr, fin = ini + len;
  if (fin > buf.length) throw new Error('DER truncado');
  return { tag, pos, ini, fin };
}
function hijos(buf, nodo) {
  const r = []; let p = nodo.ini;
  while (p < nodo.fin) { const n = der(buf, p); r.push(n); p = n.fin; }
  return r;
}
function oidDe(buf, nodo) {
  const b = buf.subarray(nodo.ini, nodo.fin); if (!b.length) return '';
  const partes = [Math.floor(b[0] / 40), b[0] % 40]; let v = 0;
  for (let i = 1; i < b.length; i++) { v = v * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { partes.push(v); v = 0; } }
  return partes.join('.');
}
function fechaDe(buf, nodo) {
  const s = buf.subarray(nodo.ini, nodo.fin).toString('latin1');
  const m = nodo.tag === 0x17 ? s.match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/) : s.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/);
  if (!m) return null;
  const y = nodo.tag === 0x17 ? (+m[1] >= 50 ? 1900 + +m[1] : 2000 + +m[1]) : +m[1];
  return new Date(Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
}

// El nombre del certificado de persona física suele llevar el NIF/NIE: se quita, no hace falta guardarlo
const NIF_RE = /\b(?:[XYZ]\d{7}|\d{8})[A-Z]\b/gi;
function nombreFirmante(subject) {
  const campos = {};
  for (const l of String(subject || '').split('\n')) { const i = l.indexOf('='); if (i > 0) campos[l.slice(0, i).trim().toUpperCase()] = l.slice(i + 1).trim(); }
  let n = campos.CN || [campos.GN || campos.GIVENNAME, campos.SN || campos.SURNAME].filter(Boolean).join(' ') || campos.O || '';
  n = n.replace(/\s*[-–(]?\s*\b(?:NIF|DNI|NIE|CIF)\b[:\s]*\S*\)?/gi, '').replace(NIF_RE, '').replace(/\s{2,}/g, ' ').replace(/[\s\-–(]+$/, '').trim();
  return n.slice(0, 160) || 'Firmante sin nombre';
}
const nombreEmisor = issuer => nombreFirmante(issuer);

// ---- Una firma (diccionario /ByteRange + /Contents) ----
function verificarFirma(pdf, br) {
  const [a, b, c, d] = br;
  const contenido = pdf.subarray(a + b, c);
  if (contenido[0] !== 0x3c || contenido[contenido.length - 1] !== 0x3e) throw new Error('Contents mal situado');
  const cms = Buffer.from(contenido.subarray(1, -1).toString('latin1').replace(/[^0-9a-fA-F]/g, ''), 'hex');

  const ci = der(cms, 0);
  const [tipo, envol] = hijos(cms, ci);
  if (oidDe(cms, tipo) !== OID.signedData) throw new Error('No es SignedData');
  const sd = hijos(cms, hijos(cms, envol)[0]);
  const encap = hijos(cms, sd[2]);
  if (oidDe(cms, encap[0]) === OID.tstInfo) return { selloTiempo: true };
  const certs = [];
  let signerInfos = null;
  for (const n of sd.slice(3)) {
    if (n.tag === 0xa0) for (const cn of hijos(cms, n)) certs.push(cms.subarray(cn.pos, cn.fin));
    else if (n.tag === 0x31) signerInfos = n;
  }
  if (!signerInfos) throw new Error('Sin SignerInfo');
  const si = hijos(cms, hijos(cms, signerInfos)[0]);
  let i = 1;
  const sid = si[i++];
  const digestOid = oidDe(cms, hijos(cms, si[i++])[0]);
  const hash = HASHES[digestOid];
  if (!hash) return { noSoportada: `algoritmo de resumen ${digestOid}` };
  if (si[i].tag !== 0xa0) return { noSoportada: 'firma sin atributos firmados' };
  const attrs = si[i++];
  const sigAlg = oidDe(cms, hijos(cms, si[i++])[0]);
  if (sigAlg === OID.rsaPss) return { noSoportada: 'RSA-PSS' };
  const firma = cms.subarray(si[i].ini, si[i].fin);

  // Atributos firmados: messageDigest y (declarada por el firmante) la hora de firma
  let md = null, declarada = null;
  for (const at of hijos(cms, attrs)) {
    const [o, valores] = hijos(cms, at);
    const oid = oidDe(cms, o);
    const v = hijos(cms, valores)[0];
    if (oid === OID.messageDigest) md = cms.subarray(v.ini, v.fin);
    else if (oid === OID.signingTime) declarada = fechaDe(cms, v);
  }
  if (!md) throw new Error('Sin messageDigest');

  // 1) El resumen del contenido firmado coincide con el de la firma
  const contenidoFirmado = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
  const resumenOk = crypto.createHash(hash).update(contenidoFirmado).digest().equals(md);

  // 2) La firma sobre los atributos es correcta con la clave de alguno de los certificados incluidos
  const attrsDer = Buffer.from(cms.subarray(attrs.pos, attrs.fin)); attrsDer[0] = 0x31; // [0] IMPLICIT → SET para firmar
  let cert = null, firmaOk = false;
  const candidatos = certs.map(c => { try { return new crypto.X509Certificate(c); } catch { return null; } }).filter(Boolean);
  let serial = null;
  if (sid.tag === 0x30) { const s = hijos(cms, sid)[1]; serial = cms.subarray(s.ini, s.fin).toString('hex').replace(/^0+/, '').toUpperCase(); }
  candidatos.sort((x, y) => (y.serialNumber.replace(/^0+/, '') === serial) - (x.serialNumber.replace(/^0+/, '') === serial));
  for (const x of candidatos) {
    try { if (crypto.verify(hash, attrsDer, x.publicKey, firma)) { cert = x; firmaOk = true; break; } } catch { /* otra clave */ }
  }
  if (!cert) cert = candidatos[0] || null;
  return { hash, resumenOk, firmaOk, declarada, cert };
}

/**
 * Analiza un PDF. Devuelve { estado, huella, firmas: [...], cubreTodo, nota? }.
 * Nunca lanza: ante cualquier fallo del análisis devuelve NO_COMPROBADA si había firma.
 */
function analizarPdf(buffer) {
  const huella = crypto.createHash('sha256').update(buffer).digest('hex');
  const txt = buffer.toString('latin1');
  const rangos = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let m;
  while ((m = re.exec(txt))) rangos.push(m.slice(1, 5).map(Number));
  if (!rangos.length) return { estado: ESTADOS.SIN_FIRMA_ELECTRONICA, huella, firmas: [], cubreTodo: false };

  const firmas = [];
  let alterada = false, sinComprobar = false;
  for (const br of rangos) {
    const [a, b, c, d] = br;
    const f = { rango: br };
    try {
      if (a !== 0 || a + b > c || c + d > buffer.length) throw new Error('ByteRange fuera del documento');
      const r = verificarFirma(buffer, br);
      if (r.selloTiempo) continue; // sello de tiempo del documento: no es una firma de persona
      if (r.noSoportada) { f.estado = ESTADOS.NO_COMPROBADA; f.nota = `No se pudo comprobar (${r.noSoportada}).`; sinComprobar = true; }
      else if (!r.resumenOk || !r.firmaOk) { f.estado = ESTADOS.ALTERADA; alterada = true; f.nota = !r.resumenOk ? 'El contenido del documento no coincide con lo que se firmó.' : 'La firma no corresponde a la clave del certificado.'; }
      else f.estado = ESTADOS.INTEGRA;
      if (r.cert) {
        f.firmante = nombreFirmante(r.cert.subject); f.emisor = nombreEmisor(r.cert.issuer);
        f.certDesde = new Date(r.cert.validFrom).toISOString(); f.certHasta = new Date(r.cert.validTo).toISOString();
        const cuando = r.declarada || new Date();
        f.certVigente = cuando >= new Date(r.cert.validFrom) && cuando <= new Date(r.cert.validTo);
      }
      if (r.declarada) f.fechaDeclarada = r.declarada.toISOString(); // la declara el propio firmante: no es un sello de tiempo
      if (r.hash === 'sha1') f.nota = `${f.nota ? `${f.nota} ` : ''}Usa SHA-1, un algoritmo considerado débil.`;
    } catch (e) { f.estado = ESTADOS.NO_COMPROBADA; f.nota = 'No se pudo leer la estructura de la firma.'; sinComprobar = true; }
    firmas.push(f);
  }
  if (!firmas.length) return { estado: ESTADOS.SIN_FIRMA_ELECTRONICA, huella, firmas: [], cubreTodo: false };

  // La última firma debe llegar hasta el final del fichero (se tolera solo espacio en blanco)
  const fin = Math.max(...rangos.map(r => r[2] + r[3]));
  const cola = buffer.subarray(fin).toString('latin1');
  const cubreTodo = /^\s*$/.test(cola);
  let estado;
  if (alterada) estado = ESTADOS.ALTERADA;
  else if (sinComprobar) estado = ESTADOS.NO_COMPROBADA;
  else if (!cubreTodo) estado = ESTADOS.CON_CAMBIOS;
  else estado = ESTADOS.INTEGRA;
  return { estado, huella, firmas, cubreTodo };
}

// ¿El PDF firmado conserva, byte a byte, el original? (firmas incrementales). Si el firmador reescribe el PDF, da false:
// no es una alteración, solo que no se puede comprobar automáticamente.
const conservaOriginal = (firmado, original) => original.length > 0 && firmado.length >= original.length && firmado.subarray(0, original.length).equals(original);

// Lo que se guarda en la base de datos (sin NIF ni el PDF)
function resumenParaGuardar(an, extra = {}) {
  return JSON.stringify({ cubreTodo: an.cubreTodo, firmas: an.firmas.map(({ rango, ...f }) => f), ...extra });
}

module.exports = { analizarPdf, conservaOriginal, resumenParaGuardar, nombreFirmante, ESTADOS };
