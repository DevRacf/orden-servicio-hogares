import { CONFIG } from './config.js';

const LLAVE_ORDENES = 'demo_ordenes';
const LLAVE_FOLIO = 'demo_folio';
const LLAVE_SESION = 'demo_sesion';
const TECNICOS_DEMO = ['Carlos Ramírez', 'Miguel Torres', 'Luis Ortega'];

function leerOrdenes() {
  return JSON.parse(localStorage.getItem(LLAVE_ORDENES) || '[]');
}

function guardarOrdenes(ordenes) {
  localStorage.setItem(LLAVE_ORDENES, JSON.stringify(ordenes));
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
    firma_tecnico: null,
    firma_cliente: null,
    completed_at: null,
    ...datos
  };
  ordenes.push(orden);
  guardarOrdenes(ordenes);
  return orden;
}

export async function completarOrden(id, cierre) {
  const ordenes = leerOrdenes();
  const orden = ordenes.find(o => o.id === id);
  if (!orden) throw new Error('Orden no encontrada');
  Object.assign(orden, cierre, {
    estado: 'completada',
    completed_at: new Date().toISOString()
  });
  guardarOrdenes(ordenes);
  return orden;
}
