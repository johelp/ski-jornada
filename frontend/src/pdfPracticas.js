import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fecha = f => { const [y, m, d] = f.split('-'); return `${d}/${m}/${y}`; };
const nh = n => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
const safe = s => s.replace(/\s+/g, '_').normalize('NFD').replace(/[̀-ͯ]/g, '');
const hex = h => { const m = (h || '#0f4c81').replace('#', '').match(/.{2}/g); return m ? m.map(c => parseInt(c, 16)) : [15, 76, 129]; };

// Planilla de control de prácticas: la escuela la firma y la sella para acreditar las horas ante la entidad que emite la titulación.
// `datos` es la respuesta de GET /api/admin/practicas/:id (profesor, planilla, registros, resumen, tipos).
export function generarPDFPracticas(datos, config = {}) {
  const color = hex(config.colorPrimario);
  const { profesor, planilla, registros, resumen, tipos } = datos;
  const nombreTipo = Object.fromEntries(tipos.map(t => [t.id, t.nombre]));
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();

  doc.setFillColor(...color); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text('Planilla de control de prácticas', 14, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(config.nombre || 'Escuela', 14, 21);
  const linea2 = [config.cif && `CIF ${config.cif}`, config.direccion, config.telefono].filter(Boolean).join(' · ');
  if (linea2) { doc.setFontSize(8); doc.text(linea2, 14, 26); }

  doc.setTextColor(30, 41, 59); doc.setFontSize(10);
  const filas = [
    ['Persona en prácticas', `${profesor.apellidos}, ${profesor.nombre}`],
    ['Titulación que se acredita', planilla.titulacion || '—'],
    ['Entidad que emite la titulación', planilla.entidad || '—'],
    ['Horas requeridas', planilla.horasRequeridas != null ? `${nh(planilla.horasRequeridas)} h` : '—'],
    ['Periodo', registros.length ? `${fecha(registros[0].fecha)} – ${fecha(registros[registros.length - 1].fecha)}` : '—'],
  ];
  autoTable(doc, { startY: 36, body: filas, theme: 'plain', styles: { fontSize: 10, cellPadding: 1.2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 58, textColor: [71, 85, 105] } } });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head: [['Fecha', 'Inicio', 'Fin', 'Horas', 'Tipo de clase', 'Profesor / coordinador']],
    body: registros.map(r => [fecha(r.fecha), r.inicio, r.fin, nh(r.horas), nombreTipo[r.tipo] || r.tipo, r.supervisor]),
    headStyles: { fillColor: color }, styles: { fontSize: 9 },
    columnStyles: { 3: { halign: 'right' } },
    foot: [['', '', 'Total', `${nh(resumen.totalHoras)} h`, '', '']],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'left' },
    showFoot: 'lastPage',
  });

  const porTipo = tipos.filter(t => resumen.porTipo[t.id] > 0).map(t => [t.nombre, `${nh(resumen.porTipo[t.id])} h`]);
  if (porTipo.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6, head: [['Horas por tipo de clase', '']], body: porTipo,
      headStyles: { fillColor: [100, 116, 139] }, styles: { fontSize: 9 }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }, tableWidth: 90,
    });
  }

  let y = doc.lastAutoTable.finalY + 8;
  if (planilla.observacion) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Observaciones', 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const lineas = doc.splitTextToSize(planilla.observacion, W - 28);
    if (y + 6 + lineas.length * 4.6 > H - 60) { doc.addPage(); y = 20; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Observaciones', 14, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); }
    doc.text(lineas, 14, y + 6);
    y += 6 + lineas.length * 4.6 + 6;
  }

  // Bloque de firma y sello: siempre entero en la misma página
  if (y > H - 62) { doc.addPage(); y = 20; }
  doc.setTextColor(30, 41, 59); doc.setFontSize(9.5);
  doc.text(`La escuela certifica que ${profesor.nombre} ${profesor.apellidos} ha realizado las prácticas arriba indicadas, con un total de ${nh(resumen.totalHoras)} horas.`, 14, y, { maxWidth: W - 28 });
  y += 14;
  doc.setDrawColor(148, 163, 184);
  doc.rect(14, y, 80, 36); doc.rect(W - 94, y, 80, 36);
  doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text('Firma del responsable de la escuela', 16, y + 33);
  doc.text('Sello de la escuela', W - 92, y + 33);
  doc.text('Nombre y cargo: ______________________________', 14, y + 44);
  doc.text('Lugar y fecha: ________________________________', W - 94, y + 44);

  doc.setFontSize(7);
  doc.text(`Generado el ${new Date().toLocaleString('es-ES')} · Ski Jornada`, 14, H - 8);
  doc.save(`Practicas_${safe(profesor.apellidos)}_${safe(profesor.nombre)}.pdf`);
}
