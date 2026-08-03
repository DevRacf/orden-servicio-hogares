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
  return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function filtrarOrdenes(ordenes, texto) {
  const t = normalizar(texto).trim();
  if (!t) return ordenes;
  return (ordenes || []).filter(o =>
    normalizar(o.cliente_nombre).includes(t) || normalizar(o.folio).includes(t));
}

export function filtrarClientes(clientes, texto) {
  const t = normalizar(texto).trim();
  if (!t) return clientes;
  return (clientes || []).filter(c =>
    normalizar(c.nombre).includes(t) || normalizar(c.telefono).includes(t));
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

export const ESTATUS_COBRO = {
  por_cobrar: 'Por cobrar',
  cobrada: 'Cobrada',
  pagada: 'Pagada'
};

export function ordenarParaLista(ordenes) {
  const recientesPrimero = (campo) => (a, b) => (a[campo] < b[campo] ? 1 : -1);
  const todasCompletadas = ordenes.filter(o => o.estado === 'completada').sort(recientesPrimero('completed_at'));
  // Completadas antes de que existiera este campo (o con algún hueco) se
  // tratan como "por cobrar" — nunca se pierden de la vista de oficina.
  const porEstatusCobro = (estatus) => todasCompletadas.filter(o => (o.estatus_cobro || 'por_cobrar') === estatus);
  const pagadas = porEstatusCobro('pagada');
  return {
    pendientes: ordenes.filter(o => o.estado === 'pendiente').sort(recientesPrimero('created_at')),
    // Ya pagadas no aparecen aquí: quedan solo en la columna de Pagadas, no
    // hay que verlas dos veces.
    completadas: todasCompletadas.filter(o => (o.estatus_cobro || 'por_cobrar') !== 'pagada'),
    porCobrar: porEstatusCobro('por_cobrar'),
    cobradas: porEstatusCobro('cobrada'),
    pagadas
  };
}

export function formatearFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

const MS_DIA = 24 * 60 * 60 * 1000;

// Ventana del periodo elegido y la ventana equivalente inmediatamente
// anterior (misma duración), para poder comparar "vs. periodo anterior".
// 'anio' usa lo que va del año en curso, comparado con el mismo número de
// días del año pasado.
function rangoFechas(rango, ahora) {
  let dias;
  if (rango === '7d') dias = 7;
  else if (rango === 'anio') {
    const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
    dias = Math.max(1, Math.round((ahora - inicioAnio) / MS_DIA));
  } else dias = 30;
  const inicio = new Date(ahora.getTime() - dias * MS_DIA);
  const inicioPrevio = new Date(inicio.getTime() - dias * MS_DIA);
  return { inicio, fin: ahora, inicioPrevio, finPrevio: inicio };
}

function enRango(fechaIso, inicio, fin) {
  if (!fechaIso) return false;
  const t = new Date(fechaIso).getTime();
  return t >= inicio.getTime() && t <= fin.getTime();
}

function conteoPorMes(ordenes, ahora) {
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ anio: d.getFullYear(), mes: d.getMonth(), etiqueta: d.toLocaleDateString('es-MX', { month: 'short' }), cuenta: 0 });
  }
  for (const o of ordenes) {
    if (!o.created_at) continue;
    const d = new Date(o.created_at);
    const fila = meses.find(m => m.anio === d.getFullYear() && m.mes === d.getMonth());
    if (fila) fila.cuenta++;
  }
  return meses;
}

function conteoConPorcentaje(valores) {
  const total = valores.length;
  const conteo = valores.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  return Object.entries(conteo)
    .map(([clave, cuenta]) => ({ clave, cuenta, pct: total ? Math.round((cuenta / total) * 100) : 0 }))
    .sort((a, b) => b.cuenta - a.cuenta);
}

// Junta las cifras del panel de oficina a partir de las órdenes ya cargadas
// (no pega a la base de datos). `rango` filtra lo que depende del periodo
// (completadas, servicios, tipo de cliente); lo demás (pendientes, por
// cobrar, histórico) es el estado actual, sin importar el periodo elegido.
export function calcularDashboard(ordenes, rango = '30d', ahora = new Date()) {
  const { inicio, fin, inicioPrevio, finPrevio } = rangoFechas(rango, ahora);

  const pendientes = ordenes.filter(o => o.estado === 'pendiente');
  const completadas = ordenes.filter(o => o.estado === 'completada');
  const porCobrar = completadas.filter(o => (o.estatus_cobro || 'por_cobrar') === 'por_cobrar');
  const cobradas = completadas.filter(o => o.estatus_cobro === 'cobrada');
  const pagadas = completadas.filter(o => o.estatus_cobro === 'pagada');

  const completadasPeriodo = completadas.filter(o => enRango(o.completed_at, inicio, fin));
  const completadasPeriodoPrevio = completadas.filter(o => enRango(o.completed_at, inicioPrevio, finPrevio));
  const creadasPeriodo = ordenes.filter(o => enRango(o.created_at, inicio, fin));

  const porTecnico = Object.entries(
    completadasPeriodo.reduce((acc, o) => { acc[o.tecnico] = (acc[o.tecnico] || 0) + 1; return acc; }, {})
  ).map(([nombre, cuenta]) => ({ nombre, cuenta })).sort((a, b) => b.cuenta - a.cuenta);

  const porCobrarLista = [...porCobrar].sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));

  return {
    pendientes: pendientes.length,
    completadasPeriodo: completadasPeriodo.length,
    completadasPeriodoPrevio: completadasPeriodoPrevio.length,
    porCobrar: porCobrar.length,
    cobradas: cobradas.length,
    pagadas: pagadas.length,
    total: ordenes.length,
    porMes: conteoPorMes(ordenes, ahora),
    porTecnico,
    porCobrarLista,
    servicios: conteoConPorcentaje(creadasPeriodo.flatMap(o => o.servicios || [])),
    tipoCliente: conteoConPorcentaje(creadasPeriodo.map(o => o.tipo_cliente).filter(Boolean))
  };
}
