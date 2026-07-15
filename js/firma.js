// Envuelve signature_pad (cargado por CDN como window.SignaturePad)
// ajustando el canvas a la densidad de pantalla del dispositivo.
export function crearPad(canvas) {
  const pad = new window.SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });

  function redimensionar() {
    // Tope en 2x: suficiente nitidez para el PDF: más resolución solo
    // engorda el PNG de la firma sin mejorarla al ojo.
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    const trazos = pad.toData();
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    pad.fromData(trazos);
  }

  redimensionar();

  return {
    limpiar: () => pad.clear(),
    vacia: () => pad.isEmpty(),
    imagen: () => pad.toDataURL('image/png'),
    // Quita los listeners del canvas. Debe llamarse antes de crear un pad
    // nuevo sobre el mismo canvas (el elemento se reutiliza entre órdenes;
    // sin esto, cada visita a una orden pendiente apilaría otro juego de
    // listeners de puntero sobre #firma-tecnico/#firma-cliente).
    destruir: () => pad.off()
  };
}
