import { CONFIG } from './config.js';

const LLAVE_ORDENES = 'demo_ordenes';
const LLAVE_FOLIO = 'demo_folio';
const LLAVE_SESION = 'demo_sesion';
const LLAVE_CLIENTES = 'demo_clientes';
const TECNICOS_DEMO = ['Carlos Ramírez', 'Miguel Torres', 'Luis Ortega'];

function leerOrdenes() {
  return JSON.parse(localStorage.getItem(LLAVE_ORDENES) || '[]');
}

function guardarOrdenes(ordenes) {
  localStorage.setItem(LLAVE_ORDENES, JSON.stringify(ordenes));
}

function leerClientes() {
  return JSON.parse(localStorage.getItem(LLAVE_CLIENTES) || '[]');
}

function guardarClientes(clientes) {
  localStorage.setItem(LLAVE_CLIENTES, JSON.stringify(clientes));
}

export async function iniciarSesion(clave) {
  if (clave !== CONFIG.CLAVE_DEMO) return { ok: false, error: 'Clave incorrecta' };
  localStorage.setItem(LLAVE_SESION, '1');
  return { ok: true };
}

export async function haySesion() {
  return localStorage.getItem(LLAVE_SESION) === '1';
}

export async function cerrarSesion() {
  localStorage.removeItem(LLAVE_SESION);
}

export async function listarTecnicos() {
  return TECNICOS_DEMO;
}

export async function listarOrdenes() {
  return leerOrdenes();
}

export async function obtenerOrden(id) {
  return leerOrdenes().find(o => o.id === id) || null;
}

export async function crearOrden(datos) {
  const ordenes = leerOrdenes();
  const n = Number(localStorage.getItem(LLAVE_FOLIO) || '0') + 1;
  localStorage.setItem(LLAVE_FOLIO, String(n));
  const orden = {
    id: crypto.randomUUID(),
    folio: 'OS-' + String(n).padStart(4, '0'),
    estado: 'pendiente',
    created_at: new Date().toISOString(),
    trabajo_realizado: null,
    materiales: [],
    materiales_cliente: [],
    firma_tecnico: null,
    firma_cliente: null,
    completed_at: null,
    ...datos
  };
  ordenes.push(orden);
  guardarOrdenes(ordenes);
  return orden;
}

export async function actualizarOrden(id, cambios) {
  const ordenes = leerOrdenes();
  const orden = ordenes.find(o => o.id === id);
  if (!orden || orden.estado !== 'pendiente') throw new Error('Orden no encontrada o ya completada');
  Object.assign(orden, cambios);
  guardarOrdenes(ordenes);
  return orden;
}

export async function completarOrden(id, cierre) {
  const ordenes = leerOrdenes();
  const orden = ordenes.find(o => o.id === id);
  if (!orden) throw new Error('Orden no encontrada');
  Object.assign(orden, cierre, {
    estado: 'completada',
    estatus_cobro: 'por_cobrar',
    completed_at: new Date().toISOString()
  });
  guardarOrdenes(ordenes);
  return orden;
}

export async function actualizarEstatusCobro(id, estatusCobro) {
  const ordenes = leerOrdenes();
  const orden = ordenes.find(o => o.id === id);
  if (!orden || orden.estado !== 'completada') throw new Error('Orden no encontrada o no completada');
  orden.estatus_cobro = estatusCobro;
  guardarOrdenes(ordenes);
  return orden;
}

export async function eliminarOrden(id) {
  const ordenes = leerOrdenes();
  const orden = ordenes.find(o => o.id === id);
  if (!orden || orden.estado !== 'completada') throw new Error('No se pudo borrar la orden');
  guardarOrdenes(ordenes.filter(o => o.id !== id));
}

// El modo demo es solo para desarrollo local; siempre acceso completo.
export async function obtenerRol() {
  return 'oficina';
}

export async function listarClientes() {
  return leerClientes();
}

export async function registrarClienteDesdeOrden({ cliente_nombre, cliente_telefono, cliente_direccion }) {
  const nombre = (cliente_nombre || '').trim();
  if (!nombre) return;
  const clientes = leerClientes();
  let cliente = clientes.find(c => c.nombre.trim().toLowerCase() === nombre.toLowerCase());
  if (!cliente) {
    cliente = { id: crypto.randomUUID(), nombre, telefono: cliente_telefono || null, direcciones: [] };
    clientes.push(cliente);
  } else if (!cliente.telefono && cliente_telefono) {
    cliente.telefono = cliente_telefono;
  }
  const direccion = (cliente_direccion || '').trim();
  if (direccion && !cliente.direcciones.some(d => d.direccion.trim().toLowerCase() === direccion.toLowerCase())) {
    cliente.direcciones.push({ id: crypto.randomUUID(), direccion });
  }
  guardarClientes(clientes);
}

export async function actualizarCliente(id, cambios) {
  const clientes = leerClientes();
  const cliente = clientes.find(c => c.id === id);
  if (!cliente) throw new Error('Cliente no encontrado');
  Object.assign(cliente, cambios);
  guardarClientes(clientes);
  return cliente;
}

export async function agregarDireccion(clienteId, direccion) {
  const clientes = leerClientes();
  const cliente = clientes.find(c => c.id === clienteId);
  if (!cliente) throw new Error('Cliente no encontrado');
  const nueva = { id: crypto.randomUUID(), direccion };
  cliente.direcciones.push(nueva);
  guardarClientes(clientes);
  return nueva;
}

export async function actualizarDireccion(id, direccion) {
  const clientes = leerClientes();
  for (const cliente of clientes) {
    const dir = cliente.direcciones.find(d => d.id === id);
    if (dir) {
      dir.direccion = direccion;
      guardarClientes(clientes);
      return dir;
    }
  }
  throw new Error('Dirección no encontrada');
}

export async function eliminarDireccion(id) {
  const clientes = leerClientes();
  for (const cliente of clientes) {
    const idx = cliente.direcciones.findIndex(d => d.id === id);
    if (idx !== -1) {
      cliente.direcciones.splice(idx, 1);
      guardarClientes(clientes);
      return;
    }
  }
}
