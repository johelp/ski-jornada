// Lector del resumen mensual por instructor que exporta el sistema de reservas (CSV con ";" y decimales con coma).
// Columnas fijas: PROFESOR, SALARIO, HORAS PRIVADAS, HORAS REQUERIDAS, TOTAL € HORAS REQUERIDAS, HORAS GRUPALES, HORAS CURSILLOS,
// TOTAL HORAS, TOTAL € SIN PRIMAS, <primas…>, TOTAL € PRIMAS, TOTAL €, y luego el desglose por producto.
// Las primas son las columnas entre «TOTAL € SIN PRIMAS» y «TOTAL € PRIMAS» (importes en €).

// "2.013,50" → 2013.5 ; "" → 0
export const numEs = v => {
  const t = String(v ?? '').trim();
  if (!t) return 0;
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function parseCSV(texto, sep = ';') {
  const filas = []; let fila = [], campo = '', comillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(x => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some(x => x.trim() !== '')) filas.push(fila);
  return filas;
}

export function leerResumenInstructores(texto) {
  const filas = parseCSV(texto);
  if (filas.length < 2) throw new Error('El archivo está vacío');
  const cab = filas[0].map(c => c.trim());
  const idx = nombre => cab.findIndex(c => c.toUpperCase() === nombre.toUpperCase());
  const col = { profesor: idx('PROFESOR'), salario: idx('SALARIO'), totalHoras: idx('TOTAL HORAS'), total: idx('TOTAL €') };
  if (Object.values(col).some(i => i < 0)) throw new Error('No parece el resumen de instructores: faltan las columnas PROFESOR, SALARIO, TOTAL HORAS o TOTAL €');
  const c = {
    horasPrivadas: idx('HORAS PRIVADAS'), horasRequeridas: idx('HORAS REQUERIDAS'), totalRequeridas: idx('TOTAL € HORAS REQUERIDAS'),
    horasGrupales: idx('HORAS GRUPALES'), horasCursillos: idx('HORAS CURSILLOS'), totalSinPrimas: idx('TOTAL € SIN PRIMAS'), totalPrimas: idx('TOTAL € PRIMAS'),
  };
  const primasCols = c.totalSinPrimas >= 0 && c.totalPrimas > c.totalSinPrimas ? cab.slice(c.totalSinPrimas + 1, c.totalPrimas).map((n, k) => ({ n, i: c.totalSinPrimas + 1 + k })) : [];
  const v = (r, i) => (i >= 0 ? numEs(r[i]) : 0);
  return filas.slice(1).map(r => ({
    profesor: (r[col.profesor] || '').trim(),
    salario: v(r, col.salario), totalHoras: v(r, col.totalHoras), total: v(r, col.total),
    horasPrivadas: v(r, c.horasPrivadas), horasRequeridas: v(r, c.horasRequeridas), totalRequeridas: v(r, c.totalRequeridas),
    horasGrupales: v(r, c.horasGrupales), horasCursillos: v(r, c.horasCursillos), totalSinPrimas: v(r, c.totalSinPrimas), totalPrimas: v(r, c.totalPrimas),
    primas: Object.fromEntries(primasCols.map(p => [p.n, numEs(r[p.i])])),
  })).filter(f => f.profesor);
}

// instructors_summary_2026-01-31T23_00_00.000Z_2026-02-28T22_59_59.999Z.csv → "2026-02" (mes local en España)
export function mesDelNombreDeArchivo(nombre) {
  const m = /(\d{4}-\d{2}-\d{2})T(\d{2})_(\d{2})_(\d{2})(?:\.\d+)?Z_(\d{4}-\d{2}-\d{2})T/.exec(nombre || '');
  if (!m) return null;
  const desde = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  const medio = new Date(desde.getTime() + 14 * 24 * 3600 * 1000);
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).formatToParts(medio);
  return `${partes.find(p => p.type === 'year').value}-${partes.find(p => p.type === 'month').value}`;
}
