import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Extracto de horas con un colaborador (escuela o autónomo): para enviárselo o para liquidar.
// Signo: + horas a favor de la escuela (nos deben) · − a favor del colaborador (les debemos).
const num = n => n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const eur = n => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fechaCorta = f => { const [y, m, d] = f.split('-'); return `${d}/${m}/${y}`; };
const safe = s => String(s).replace(/\s+/g, '_').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]/g, '');
const ESTADO = { PENDIENTE: 'Pendiente', ACEPTADA: 'Aceptada', EN_REVISION: 'En revisión' };

export function hexToRgb(hex) {
  const m = (hex || '#0f4c81').replace('#', '').match(/.{2}/g);
  return m ? m.map(c => parseInt(c, 16)) : [15, 76, 129];
}

export const signo = m => (m.sentido === 'DADAS' ? 1 : -1);
export const conSigno = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n))}`;

// Agrupa los movimientos por día (de más antiguo a más reciente) con el neto de cada día
export function agruparPorDia(movs) {
  const dias = new Map();
  for (const m of movs) { if (!dias.has(m.fecha)) dias.set(m.fecha, []); dias.get(m.fecha).push(m); }
  return [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, items]) => ({
    fecha, items,
    horas: items.filter(m => m.estado !== 'EN_REVISION').reduce((a, m) => a + signo(m) * m.horas, 0),
    euros: items.filter(m => m.estado !== 'EN_REVISION').reduce((a, m) => a + signo(m) * m.horas * m.tarifaHora, 0),
  }));
}

/** datos: respuesta de GET /api/admin/colaboradores/:id (o el equivalente del portal). */
export function generarPDFColaborador(datos, config = {}) {
  const { colaborador: c, saldo, movimientos, liquidaciones, periodo } = datos;
  const color = hexToRgb(config.colorPrimario);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const escuela = config.nombre || 'La escuela';

  doc.setFillColor(...color); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Extracto de horas', 14, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const rango = periodo && (periodo.desde || periodo.hasta)
    ? `${periodo.desde ? fechaCorta(periodo.desde) : 'inicio'} – ${periodo.hasta ? fechaCorta(periodo.hasta) : 'hoy'}` : 'Todo el historial';
  doc.text(`${escuela}${config.cif ? ` · CIF ${config.cif}` : ''} · ${rango}`, 14, 21);

  doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(c.nombre, 14, 40);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`${c.tipo === 'AUTONOMO' ? 'Autónomo' : 'Escuela'}${c.cif ? ` · ${c.cif}` : ''} · Valor hora del trato: ${eur(c.tarifaHora)}`, 14, 46);
  doc.text(`Emitido el ${new Date().toLocaleDateString('es-ES')}`, W - 14, 46, { align: 'right' });

  // Resumen
  const final = periodo?.saldoFinal || saldo;
  const dadas = movimientos.filter(m => m.sentido === 'DADAS' && m.estado !== 'EN_REVISION').reduce((a, m) => a + m.horas, 0);
  const recib = movimientos.filter(m => m.sentido === 'RECIBIDAS' && m.estado !== 'EN_REVISION').reduce((a, m) => a + m.horas, 0);
  const filasResumen = [
    ['Horas dadas por la escuela', `${num(dadas)} h`],
    ['Horas recibidas por la escuela', `${num(recib)} h`],
  ];
  if (periodo?.saldoAnterior) filasResumen.unshift(['Saldo anterior', `${conSigno(periodo.saldoAnterior.horas)} h · ${eur(periodo.saldoAnterior.euros)}`]);
  autoTable(doc, { startY: 52, body: filasResumen, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.2 }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }, margin: { left: 14, right: W / 2 } });
  const y1 = doc.lastAutoTable.finalY + 3;
  const aFavor = final.horas > 0.004, enContra = final.horas < -0.004;
  doc.setFillColor(aFavor ? 232 : enContra ? 254 : 240, aFavor ? 245 : enContra ? 243 : 244, aFavor ? 233 : enContra ? 199 : 248);
  doc.roundedRect(14, y1, W - 28, 20, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
  doc.text(aFavor ? `Saldo a favor de ${escuela}` : enContra ? `Saldo a favor de ${c.nombre}` : 'Cuentas saldadas', 18, y1 + 8);
  doc.setFontSize(15);
  doc.text(`${num(Math.abs(final.horas))} h · ${eur(Math.abs(final.euros))}`, W - 18, y1 + 13, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
  doc.text(aFavor ? 'Es lo que nos debe el colaborador.' : enContra ? 'Es lo que debe la escuela al colaborador.' : 'No hay horas pendientes.', 18, y1 + 15);
  if (final.enRevisionHoras) doc.text(`${num(final.enRevisionHoras)} h en revisión no incluidas en el saldo.`, 18, y1 + 19);

  // Detalle agrupado por día
  const dias = agruparPorDia(movimientos);
  const filas = [];
  for (const d of dias) {
    d.items.forEach((m, i) => filas.push([
      i === 0 ? fechaCorta(d.fecha) : '', m.sentido === 'DADAS' ? 'Dadas por nosotros' : 'Recibidas de ellos',
      `${m.sentido === 'DADAS' ? '+' : '−'}${num(m.horas)}`, eur(m.tarifaHora), eur(m.horas * m.tarifaHora), ESTADO[m.estado] || m.estado, m.nota || '',
    ]));
    if (d.items.length > 1) filas.push([{ content: `Total ${fechaCorta(d.fecha)}`, colSpan: 2, styles: { fontStyle: 'italic', textColor: [100, 116, 139] } }, { content: `${conSigno(d.horas)}`, styles: { fontStyle: 'bold' } }, '', { content: d.euros < 0 ? `−${eur(-d.euros)}` : eur(d.euros), styles: { fontStyle: 'bold' } }, '', '']);
  }
  doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Detalle de horas por día', 14, y1 + 30);
  autoTable(doc, {
    startY: y1 + 33, head: [['Día', 'Concepto', 'Horas', 'Valor hora', 'Importe', 'Estado', 'Nota']],
    body: filas.length ? filas : [[{ content: 'Sin movimientos en el periodo', colSpan: 7, styles: { halign: 'center', textColor: [148, 163, 184] } }]],
    styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: color }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  if (liquidaciones.length) {
    const y2 = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Liquidaciones', 14, y2);
    autoTable(doc, {
      startY: y2 + 3, head: [['Fecha', 'Tipo', 'Horas saldadas', 'Importe', 'Nota']],
      body: liquidaciones.map(l => [fechaCorta(l.fecha), l.tipo === 'PAGO' ? 'Pago' : 'Compensación', `${conSigno(l.horas)} h`, eur(Math.abs(l.importe)), l.nota || '']),
      styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: color }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } }, margin: { left: 14, right: 14 },
    });
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
    doc.text(`${escuela} · Extracto de horas con ${c.nombre}`, 14, 289);
    doc.text(`Página ${i} de ${n}`, W - 14, 289, { align: 'right' });
  }
  doc.save(`Extracto_${safe(c.nombre)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
