// Exportación a CSV segura. Excel y Google Sheets ejecutan como fórmula las celdas que empiezan por = + - @ (o tabulador /
// retorno): un nombre o una nota con ese formato podría lanzar una fórmula al abrir el archivo («inyección de fórmulas»).
// Los textos se prefijan con una comilla simple; los números se dejan como números.
export function celdaCsv(v, { decimalComa = false } = {}) {
  let t = typeof v === 'number' ? (decimalComa ? String(v).replace('.', ',') : String(v)) : String(v ?? '');
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}
export const filaCsv = (fila, sep = ';', opciones) => fila.map(c => celdaCsv(c, opciones)).join(sep);
