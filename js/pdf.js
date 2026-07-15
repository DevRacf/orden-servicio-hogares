import { TIPOS_SERVICIO, TIPOS_CLIENTE, formatearFecha } from './ordenes.js';

export function seccionesPdf(orden) {
  return [
    ['Cliente', orden.cliente_nombre],
    ['Teléfono', orden.cliente_telefono || '—'],
    ['Dirección', orden.cliente_direccion],
    ['Tipo de cliente', TIPOS_CLIENTE[orden.tipo_cliente] || orden.tipo_cliente],
    ['Servicio', TIPOS_SERVICIO[orden.tipo_servicio] || orden.tipo_servicio],
    ['Técnico', orden.tecnico],
    ['Fecha de creación', formatearFecha(orden.created_at)],
    ['Fecha de cierre', formatearFecha(orden.completed_at)]
  ];
}

function bloqueTexto(doc, titulo, texto, y, margen, ancho) {
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const lineas = doc.splitTextToSize(texto || '—', ancho);
  doc.text(lineas, margen, y);
  return y + lineas.length * 5 + 6;
}

export function generarPdf(orden) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' }); // carta: 216 x 279 mm
  const MARGEN = 16;
  const DERECHA = 216 - MARGEN;
  const ANCHO = DERECHA - MARGEN;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Hogares Inteligentes', MARGEN, y);
  doc.setFontSize(13);
  doc.text(orden.folio, DERECHA, y, { align: 'right' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Orden de servicio — cámaras, audio, internet y pantallas', MARGEN, y);
  y += 4;
  doc.line(MARGEN, y, DERECHA, y);
  y += 9;

  doc.setFontSize(11);
  for (const [etiqueta, valor] of seccionesPdf(orden)) {
    doc.setFont('helvetica', 'bold');
    doc.text(etiqueta + ':', MARGEN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(valor ?? '—'), MARGEN + 44, y);
    y += 7;
  }
  y += 3;

  y = bloqueTexto(doc, 'Descripción solicitada', orden.descripcion, y, MARGEN, ANCHO);
  y = bloqueTexto(doc, 'Trabajo realizado', orden.trabajo_realizado, y, MARGEN, ANCHO);

  doc.setFont('helvetica', 'bold');
  doc.text('Materiales y equipos', MARGEN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const materiales = orden.materiales || [];
  if (materiales.length === 0) {
    doc.text('—', MARGEN, y);
    y += 6;
  }
  for (const m of materiales) {
    doc.text(`${m.cantidad} × ${m.descripcion}`, MARGEN, y);
    y += 6;
  }

  // Firmas al pie (nueva página si el contenido bajó demasiado)
  if (y > 225) { doc.addPage(); y = 30; } else { y = Math.max(y + 10, 225); }
  const ANCHO_FIRMA = 70;
  const ALTO_FIRMA = 25;
  if (orden.firma_tecnico) {
    doc.addImage(orden.firma_tecnico, 'PNG', MARGEN, y, ANCHO_FIRMA, ALTO_FIRMA);
  }
  if (orden.firma_cliente) {
    doc.addImage(orden.firma_cliente, 'PNG', DERECHA - ANCHO_FIRMA, y, ANCHO_FIRMA, ALTO_FIRMA);
  }
  y += ALTO_FIRMA + 3;
  doc.line(MARGEN, y, MARGEN + ANCHO_FIRMA, y);
  doc.line(DERECHA - ANCHO_FIRMA, y, DERECHA, y);
  y += 5;
  doc.setFontSize(9);
  doc.text(`Técnico: ${orden.tecnico}`, MARGEN, y);
  doc.text(`Cliente: ${orden.cliente_nombre}`, DERECHA - ANCHO_FIRMA, y);

  return doc;
}

export async function compartirPdf(orden) {
  const doc = generarPdf(orden);
  const nombre = `${orden.folio}.pdf`;
  const archivo = new File([doc.output('blob')], nombre, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch {
      // usuario canceló el diálogo de compartir: no es error
      return;
    }
  }
  doc.save(nombre);
}
