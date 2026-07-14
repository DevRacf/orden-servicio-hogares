import { CONFIG } from './config.js';
import * as demo from './datos-demo.js';
import * as supabase from './datos-supabase.js';

const impl = CONFIG.MODO === 'supabase' ? supabase : demo;

export const {
  iniciarSesion, haySesion, cerrarSesion,
  listarTecnicos, listarOrdenes, obtenerOrden,
  crearOrden, completarOrden
} = impl;
