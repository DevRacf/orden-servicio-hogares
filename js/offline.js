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
    /fetch|network|tiempo agotado/i.test(String(err?.message || ''));
}

// Con señal débil la petición no falla, se queda colgada — el caso real de
// un técnico con una barra de señal, no una desconexión limpia. Sin esto,
// listarOrdenes/obtenerOrden/completarOrden se quedarían esperando para
// siempre en vez de caer al respaldo local.
function conTiempoLimite(promesa, ms = 8000) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error('tiempo agotado de red')), ms))
  ]);
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
        await conTiempoLimite(sb.completarOrden(item.ordenId, {
          ...item.cierre,
          completed_at: new Date(item.timestamp).toISOString()
        }));
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
    const ordenes = await conTiempoLimite(sb.listarOrdenes());
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
    const orden = await conTiempoLimite(sb.obtenerOrden(id));
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
  // El try solo cubre la petición de red: si el guardado en el servidor ya
  // tuvo éxito, un problema local después (p. ej. localStorage lleno) no debe
  // reclasificarse como "sin conexión" y volver a encolar un cierre que ya
  // se guardó de verdad.
  let orden;
  try {
    orden = await conTiempoLimite(sb.completarOrden(id, cierre));
  } catch (err) {
    if (!esFalloDeRed(err)) throw err;
    const cola = agregarACola(leerCola(), id, cierre, Date.now());
    guardarCola(cola);
    const cache = leerCache() || [];
    return aplicarCierresPendientes(cache, cola).find(o => o.id === id)
      || aplicarCierresPendientes([{ id, estado: 'pendiente' }], cola)[0];
  }
  // Si ya había un cierre encolado para esta misma orden (un intento offline
  // previo), se descarta: el que se acaba de guardar con red es el vigente.
  guardarCola(quitarDeCola(leerCola(), id));
  const cache = leerCache();
  if (cache) guardarCache(cache.map(o => (o.id === id ? orden : o)));
  return orden;
}

export const { iniciarSesion, haySesion, cerrarSesion, listarTecnicos, crearOrden } = sb;
