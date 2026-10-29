import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const eur = n => (n == null ? '—' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const fechaCorta = f => { const [y, m, d] = f.split('-'); return `${d}/${m}/${y}`; };
const safe = s => s.replace(/\s+/g, '_').normalize('NFD').replace(/[̀-ͯ]/g, '');

function hexToRgb(hex) {
  const m = (hex || '#0f4c81').replace('#', '').match(/.{2}/g);
  return m ? m.map(c => parseInt(c, 16)) : [15, 76, 129];
}

// Informe mensual de clases dadas (con parte económica si el admin cargó importes).
export function generarPDFClases(informe, config = {}) {
  const color = hexToRgb(config.colorPrimario);
  const [anio, mes] = informe.mes.split('-');
  const mesNombre = MESES[parseInt(mes) - 1];
  const conImporte = informe.importeTotal != null;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...color);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Informe de clases impartidas', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${config.nombre || 'Escuela de Esquí'} · ${mesNombre} ${anio}`, 14, 21);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`${informe.profesor.nombre} ${informe.profesor.apellidos}`, 14, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    informe.confirmado
      ? `Horas confirmadas el ${new Date(informe.confirmadoAt).toLocaleDateString('es-ES')}`
      : 'Horas sin confirmar (borrador)',
    14, 46,
  );

  autoTable(doc, {
    startY: 52,
    head: [['Fecha', 'Disciplina', 'Primas', 'Horas', ...(conImporte ? ['Importe'] : [])]],
    body: informe.detalle.map(c => [
      fechaCorta(c.fecha), c.tipoNombre, c.primas.map(p => p.nombre).join(' + ') || '—',
      String(c.horas).replace('.', ','), ...(conImporte ? [eur(c.importe)] : []),
    ]),
    headStyles: { fillColor: color },
    styles: { fontSize: 9 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  let y = doc.lastAutoTable.finalY + 8;
  const resumen = [['Total de horas', String(informe.totalHoras).replace('.', ',') + ' h'], ['Días con clases', String(informe.diasConClases)]];
  Object.entries(informe.porTipo).forEach(([k, v]) => resumen.push([`  ${k}`, `${v} h`]));
  informe.desglosePrimas.forEach(d => resumen.push([`  Prima ${d.nombre} (${d.clases} cl.)`, `${d.horas} h${d.importe != null ? ' · ' + eur(d.importe) : ''}`]));
  if (conImporte) {
    resumen.push([`Base (${eur(informe.tarifaHora)}/h)`, eur(informe.importeBase)]);
    resumen.push(['Primas', eur(informe.importePrimas)]);
    resumen.push(['TOTAL', eur(informe.importeTotal)]);
  }
  autoTable(doc, {
    startY: y, body: resumen, theme: 'plain', styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }, tableWidth: 110,
  });

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generado el ${new Date().toLocaleString('es-ES')} · Ski Jornada`, 14, 287);

  doc.save(`Clases_${safe(informe.profesor.apellidos)}_${safe(informe.profesor.nombre)}_${mesNombre}_${anio}.pdf`);
}
