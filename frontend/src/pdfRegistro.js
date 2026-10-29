import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

const COLOR_LIGHT   = [240, 247, 255];
const COLOR_DARK    = [30, 41, 59];
const COLOR_MUTED   = [100, 116, 139];
const COLOR_WARN    = [245, 158, 11];
const COLOR_WHITE   = [255, 255, 255];

function hexToRgb(hex) {
  const m = (hex || '#0f4c81').replace('#', '').match(/.{2}/g);
  return m ? m.map(c => parseInt(c, 16)) : [15, 76, 129];
}

function _buildPDF(informe, opciones = {}) {
  const { incluirExtras = true, config = {} } = opciones;
  const COLOR_PRIMARY = hexToRgb(config.colorPrimario || '#0f4c81');
  const escuelaNombre = config.nombre     || 'Escuela de Esquí Sierra Nevada';
  const escuelaDirec  = config.direccion  || 'Sierra Nevada, Granada';
  const escuelaTel    = config.telefono   || '958 000 000';
  const escuelaCif    = config.cif        || 'B12345678';
  const { profesor, mesNum, anio, detalle, totalHoras, totalExceso, diasTrabajados, diasConExceso, promedioDiario } = informe;
  const mesNombre = MESES[parseInt(mesNum) - 1];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 0;

  // ===== CABECERA =====
  doc.setFillColor(...COLOR_PRIMARY);
  doc.rect(0, 0, W, 38, 'F');

  doc.setTextColor(...COLOR_WHITE);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('⛷  Ski Jornada', 14, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(escuelaNombre, 14, 23);
  doc.text(`${escuelaDirec} · Tel: ${escuelaTel}`, 14, 28);
  doc.text(`CIF: ${escuelaCif}`, 14, 33);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('REGISTRO DE JORNADA LABORAL', W - 14, 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`RD 8/2019 · Art. 34.9 Estatuto de los Trabajadores`, W - 14, 22, { align: 'right' });

  doc.setFillColor(...COLOR_LIGHT);
  doc.rect(0, 38, W, 14, 'F');
  doc.setTextColor(...COLOR_PRIMARY);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`Período: ${mesNombre} ${anio}`, W / 2, 47, { align: 'center' });

  y = 60;

  // ===== DATOS DEL TRABAJADOR =====
  const boxH = incluirExtras ? 32 : 26;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, W - 28, boxH, 3, 3, 'FD');

  doc.setTextColor(...COLOR_PRIMARY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL TRABAJADOR', 19, y + 7);

  doc.setTextColor(...COLOR_DARK);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${profesor.apellidos}, ${profesor.nombre}`, 19, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Email: ${profesor.email}`, 19, y + 20);
  doc.text(`Tipo de contrato: ${profesor.tipoJornada === 'COMPLETA' ? 'Jornada Completa' : 'Media Jornada'}`, 19, y + (incluirExtras ? 26 : 25));

  const colMid = W / 2 + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_MUTED);
  doc.text('Horas semanales contratadas', colMid, y + 14);
  doc.text('Horas trabajadas en el período', colMid, y + 20);
  if (incluirExtras) doc.text('Horas de exceso acumuladas', colMid, y + 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text(`${profesor.horasContrato}h`, W - 14, y + 14, { align: 'right' });
  doc.setTextColor(...COLOR_DARK);
  doc.text(`${totalHoras}h`, W - 14, y + 20, { align: 'right' });
  if (incluirExtras) {
    const excColor = totalExceso > 0 ? COLOR_WARN : [16, 185, 129];
    doc.setTextColor(...excColor);
    doc.text(`${totalExceso > 0 ? '+' : ''}${totalExceso}h`, W - 14, y + 26, { align: 'right' });
  }

  y += boxH + 6;

  // ===== TABLA DE REGISTROS =====
  const diasDelMes = new Date(anio, parseInt(mesNum), 0).getDate();
  const detalleMap = {};
  detalle.forEach(d => { detalleMap[d.fecha] = d; });

  const filas = [];
  for (let dia = 1; dia <= diasDelMes; dia++) {
    const fechaStr = `${anio}-${String(mesNum).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const fechaObj = new Date(fechaStr + 'T12:00:00');
    const diaSemana = fechaObj.getDay();
    const esFinde = diaSemana === 0 || diaSemana === 6;
    const d = detalleMap[fechaStr];

    const fechaDisplay = `${String(dia).padStart(2,'0')}/${String(mesNum).padStart(2,'0')}/${anio}`;
    const diaNombre = DIAS_SEMANA[diaSemana].charAt(0).toUpperCase() + DIAS_SEMANA[diaSemana].slice(1);

    if (!d) {
      const fila = [fechaDisplay, diaNombre, '', '', '', esFinde ? 'Fin de semana' : ''];
      if (incluirExtras) fila.splice(5, 0, '');
      filas.push(fila);
    } else {
      const entradas = d.registros.filter(r => r.tipo === 'ENTRADA');
      const salidas  = d.registros.filter(r => r.tipo === 'SALIDA');
      const horaEntrada = entradas.length ? entradas.map(r => r.hora).join(', ') : '—';
      const horaSalida  = salidas.length  ? salidas.map(r => r.hora).join(', ')  : 'Sin salida';
      const zonas = [...new Set(d.registros.map(r => r.zona))].join(', ');
      const excLabel = d.exceso > 0 ? `+${d.exceso}h` : '';

      const fila = [fechaDisplay, diaNombre, horaEntrada, horaSalida, `${d.horas}h`, zonas];
      if (incluirExtras) fila.splice(5, 0, excLabel);
      filas.push(fila);
    }
  }

  const tableHead = incluirExtras
    ? [['Fecha', 'Día', 'Entrada', 'Salida', 'Total', 'Exceso', 'Zona / Observaciones']]
    : [['Fecha', 'Día', 'Entrada', 'Salida', 'Total', 'Zona / Observaciones']];

  const colStyles = incluirExtras
    ? {
        0: { cellWidth: 23 },
        1: { cellWidth: 22 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 14, halign: 'center' },
        6: { cellWidth: 'auto' },
      }
    : {
        0: { cellWidth: 23 },
        1: { cellWidth: 22 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 'auto' },
      };

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: filas,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      textColor: COLOR_DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: COLOR_PRIMARY,
      textColor: COLOR_WHITE,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowIdx = data.row.index;
        const fechaStr = `${anio}-${String(mesNum).padStart(2,'0')}-${String(rowIdx + 1).padStart(2,'0')}`;
        const fechaObj = new Date(fechaStr + 'T12:00:00');
        const esFinde = fechaObj.getDay() === 0 || fechaObj.getDay() === 6;
        if (esFinde) {
          data.cell.styles.fillColor = [248, 250, 252];
          data.cell.styles.textColor = COLOR_MUTED;
        }
        if (incluirExtras && data.column.index === 5 && data.cell.text[0]?.startsWith('+')) {
          data.cell.styles.textColor = COLOR_WARN;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 8;

  // ===== RESUMEN =====
  if (y > H - 90) { doc.addPage(); y = 20; }

  const summaryH = 24;
  doc.setFillColor(240, 247, 255);
  doc.setDrawColor(...COLOR_PRIMARY);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y, W - 28, summaryH, 3, 3, 'FD');

  doc.setTextColor(...COLOR_PRIMARY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DEL PERÍODO', 19, y + 7);

  const cols = incluirExtras
    ? [
        { label: 'Días trabajados', value: String(diasTrabajados) },
        { label: 'Total horas', value: `${totalHoras}h` },
        { label: 'Horas de exceso', value: `${totalExceso > 0 ? '+' : ''}${totalExceso}h`, warn: totalExceso > 0 },
        { label: 'Días con exceso', value: String(diasConExceso) },
        { label: 'Promedio diario', value: `${promedioDiario}h` },
      ]
    : [
        { label: 'Días trabajados', value: String(diasTrabajados) },
        { label: 'Total horas', value: `${totalHoras}h` },
        { label: 'Promedio diario', value: `${promedioDiario}h` },
      ];

  const colW = (W - 28) / cols.length;
  cols.forEach((c, i) => {
    const cx = 14 + colW * i + colW / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(c.label, cx, y + 13, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...(c.warn ? COLOR_WARN : COLOR_DARK));
    doc.text(c.value, cx, y + 21, { align: 'center' });
  });

  y += summaryH + 8;

  // ===== DECLARACIÓN Y FIRMAS =====
  if (y > H - 75) { doc.addPage(); y = 20; }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR_MUTED);
  const declaracion = 'El trabajador/a abajo firmante declara que los datos de jornada laboral reflejados en el presente registro son correctos y verídicos, '
    + 'conforme a lo establecido en el Real Decreto-ley 8/2019, de 8 de marzo, y el artículo 34.9 del Estatuto de los Trabajadores.';
  const lines = doc.splitTextToSize(declaracion, W - 28);
  doc.text(lines, 14, y);
  y += lines.length * 4 + 6;

  const fw = (W - 28) / 2 - 5;
  const firmaY = y + 22;

  doc.setDrawColor(...COLOR_MUTED);
  doc.setLineWidth(0.4);
  doc.line(14, firmaY, 14 + fw, firmaY);
  doc.setTextColor(...COLOR_MUTED);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Firma del trabajador/a', 14 + fw / 2, firmaY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(`${profesor.nombre} ${profesor.apellidos}`, 14 + fw / 2, firmaY + 10, { align: 'center' });
  doc.text(`DNI/NIE: _____________________`, 14 + fw / 2, firmaY + 15, { align: 'center' });
  doc.text(`Fecha: ________________________`, 14 + fw / 2, firmaY + 20, { align: 'center' });

  const fx2 = 14 + fw + 10;
  doc.line(fx2, firmaY, fx2 + fw, firmaY);
  doc.setFont('helvetica', 'bold');
  doc.text('Firma y sello de la empresa', fx2 + fw / 2, firmaY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(escuelaNombre, fx2 + fw / 2, firmaY + 10, { align: 'center' });
  doc.text('Responsable: _________________', fx2 + fw / 2, firmaY + 15, { align: 'center' });
  doc.text(`Fecha: ________________________`, fx2 + fw / 2, firmaY + 20, { align: 'center' });

  // ===== PIE LEGAL =====
  const footerY = H - 18;
  doc.setFillColor(...COLOR_PRIMARY);
  doc.rect(0, footerY, W, 18, 'F');
  doc.setTextColor(...COLOR_WHITE);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento generado por Ski Jornada · Registro de jornada conforme a RD 8/2019 y Art. 34.9 ET', W / 2, footerY + 6, { align: 'center' });
  doc.text('Los registros deben conservarse durante 4 años y ser accesibles para trabajadores e Inspección de Trabajo', W / 2, footerY + 11, { align: 'center' });
  const fechaGen = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(`Generado el ${fechaGen}`, W / 2, footerY + 16, { align: 'center' });

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setTextColor(...COLOR_MUTED);
    doc.setFontSize(7);
    doc.text(`Pág. ${i} / ${totalPages}`, W - 14, footerY - 3, { align: 'right' });
  }

  return doc;
}

export function generarPDFRegistro(informe, opciones = {}) {
  const doc = _buildPDF(informe, opciones);
  const { profesor, mesNum, anio } = informe;
  const mesNombre = MESES[parseInt(mesNum) - 1];
  const apellidosSafe = profesor.apellidos.replace(/\s+/g, '_').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nombreSafe   = profesor.nombre.replace(/\s+/g, '_').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filename = `RegistroHorario_${apellidosSafe}_${nombreSafe}_${mesNombre}_${anio}.pdf`;
  doc.save(filename);
}

export function generarPDFBase64(informe, opciones = {}) {
  const doc = _buildPDF(informe, opciones);
  return doc.output('datauristring');
}
