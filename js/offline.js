// Capa que envuelve a datos-supabase para funcionar sin internet:
// - cachea las órdenes en localStorage al leerlas con red
// - encola los cierres hechos sin red y los reenvía al reconectar
// El modo demo no pasa por aquí (ya es local por naturaleza).
import * as sb from './datos-supabase.js';
import { agregarACola, aplicarCierresPendientes, quitarDeCola } from './offline-logica.js';

const LLAVE_CACHE = 'cache_ordenes';
const LLAVE_COLA = 'cola_cierres';

function leerCache() { return JSON.parse(localStorage.getItem(LLAVE_CACHE) || 'null'); }
function guardarCache(ordenes) { localStorage.setItem(LLAVE_CACHE, JSON.stringify(ordenes)); }
function leerCola() { return JSON.parse(localStorage.getItem(LLAVE_COLA) || '[]'); }
function guardarCola(cola) { localStorage.setItem(LLAVE_COLA, JSON.stringify(cola)); }

// Distingue "no hay conexión" de un error del servidor: solo los fallos de
// red van a la caché/cola; los demás suben al llamador como siempre.
function esFalloDeRed(err) {
  return !navigator.onLine ||
    err instanceof TypeError ||
    /fetch|network/i.test(String(err?.message || ''));
}

let sincronizando = false;

// Reenvía los cierres encolados, en orden. Un fallo detiene el intento (se
// reintenta en la siguiente oportunidad); la cola nunca se descarta.
export async function sincronizar() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  try {
    let cola = leerCola();
    for (const item of [...cola]) {
      try {
        // Se manda la fecha real de cierre (cuando el técnico terminó, no
        // cuando volvió la señal) para que datos-supabase.js la respete.
        await sb.completarOrden(item.ordenId, {
          ...item.cierre,
          completed_at: new Date(item.timestamp).toISOString()
        });
        cola = quitarDeCola(cola, item.ordenId);
        guardarCola(cola);
      } catch (err) {
        console.error('No se pudo sincronizar el cierre de', item.ordenId, err);
        break;
      }
    }
  } finally {
    sincronizando = false;
  }
}

export async function listarOrdenes() {
  try {
    await sincronizar();
    const ordenes = await sb.listarOrdenes();
    guardarCache(ordenes);
    return aplicarCierresPendientes(ordenes, leerCola());
  } catch (err) {
    if (!esFalloDeRed(err)) throw err;
    const cache = leerCache();
    if (!cache) throw err;
    return aplicarCierresPendientes(cache, leerCola());
  }
}

export async function obtenerOrden(id) {
  try {
    const orden = await sb.obtenerOrden(id);
    if (orden) {
      const cache = leerCache();
      if (cache) {
        guardarCache(cache.some(o => o.id === orden.id)
          ? cache.map(o => (o.id === orden.id ? orden : o))
          : [...cache, orden]);
      }
    }
    return aplicarCierresPendientes(orden ? [orden] : [], leerCola())[0] || null;
  } catch (err) {
    if (!esFalloDeRed(err)) throw err;
    const cache = leerCache() || [];
    return aplicarCierresPendientes(cache, leerCola()).find(o => o.id === id) || null;
  }
}

export async function completarOrden(id, cierre) {
  try {
    const orden = await sb.completarOrden(id, cierre);
    const cache = leerCache();
    if (cache) guardarCache(cache.map(o => (o.id === id ? orden : o)));
    return orden;
  } catch (err) {
    if (!esFalloDeRed(err)) throw err;
    const cola = agregarACola(leerCola(), id, cierre, Date.now());
    guardarCola(cola);
    const cache = leerCache() || [];
    return aplicarCierresPendientes(cache, cola).find(o => o.id === id)
      || aplicarCierresPendientes([{ id, estado: 'pendiente' }], cola)[0];
  }
}

export const { iniciarSesion, haySesion, cerrarSesion, listarTecnicos, crearOrden } = sb;
