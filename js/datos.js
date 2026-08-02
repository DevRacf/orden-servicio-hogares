import { CONFIG } from './config.js';
import * as demo from './datos-demo.js';
import * as offline from './offline.js';

const impl = CONFIG.MODO === 'supabase' ? offline : demo;

export const {
  iniciarSesion, haySesion, cerrarSesion,
  listarTecnicos, listarOrdenes, obtenerOrden,
  crearOrden, actualizarOrden, actualizarEstatusCobro, completarOrden, obtenerRol
} = impl;

// Solo existe en modo supabase (reenvía cierres encolados); en demo queda undefined.
export const sincronizar = impl.sincronizar;
