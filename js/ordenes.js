export const TIPOS_SERVICIO = {
  camaras: 'Cámaras',
  audio: 'Audio',
  internet: 'Internet',
  pantallas: 'Pantallas',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro'
};

export const TIPOS_CLIENTE = {
  hogar: 'Hogar',
  empresa: 'Empresa'
};

export function etiquetasServicios(servicios) {
  return (servicios || []).map(s => TIPOS_SERVICIO[s] || s);
}

function normalizar(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function filtrarOrdenes(ordenes, texto) {
  const t = normalizar(texto).trim();
  if (!t) return ordenes;
  return (ordenes || []).filter(o =>
    normalizar(o.cliente_nombre).includes(t) || normalizar(o.folio).includes(t));
}

export function validarNuevaOrden(d) {
  const errores = [];
  if (!d.cliente_nombre?.trim()) errores.push('El nombre del cliente es obligatorio');
  if (!d.cliente_direccion?.trim()) errores.push('La dirección es obligatoria');
  if (!TIPOS_CLIENTE[d.tipo_cliente]) errores.push('Elige hogar o empresa');
  if (!Array.isArray(d.servicios) || d.servicios.length === 0 || !d.servicios.every(s => TIPOS_SERVICIO[s])) errores.push('Selecciona al menos un servicio');
  if (!d.tecnico?.trim()) errores.push('Asigna un técnico');
  return { ok: errores.length === 0, errores };
}

export function limpiarMateriales(filas) {
  return (filas || [])
    .map(f => ({
      cantidad: Number(f.cantidad),
      descripcion: (f.descripcion || '').trim()
    }))
    .filter(f => f.descripcion && Number.isFinite(f.cantidad) && f.cantidad > 0);
}

export function validarCierre(d) {
  const errores = [];
  if (!d.trabajo_realizado?.trim()) errores.push('Describe el trabajo realizado');
  if (!d.firma_cliente) errores.push('Falta la firma del cliente');
  return { ok: errores.length === 0, errores };
}

export function ordenarParaLista(ordenes) {
  const recientesPrimero = (campo) => (a, b) => (a[campo] < b[campo] ? 1 : -1);
  return {
    pendientes: ordenes.filter(o => o.estado === 'pendiente').sort(recientesPrimero('created_at')),
    completadas: ordenes.filter(o => o.estado === 'completada').sort(recientesPrimero('completed_at'))
  };
}

export function formatearFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}
