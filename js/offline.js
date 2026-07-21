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

// navigator.onLine solo dice si el teléfono tiene alguna interfaz de red
// activa, no si esa red de verdad llega a internet — con una barra de señal
// se queda en "online" mientras las peticiones se cuelgan y agotan el tiempo.
// Este aviso le permite al letrero de la UI reaccionar también a esos casos,
// no solo al evento nativo `offline`.
function avisarFalloDeRed() {
  window.dispatchEvent(new Event('fallo-red-detectado'));
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
    // Se recorre una foto de los pendientes al empezar, pero cada escritura
    // relee la cola justo antes de guardar (no arrastra la foto vieja) — así
    // no se pierde un cierre que completarOrden() haya agregado en paralelo
    // mientras esta sincronización seguía en curso.
    for (const item of [...leerCola()]) {
      try {
        // Se manda la fecha real de cierre (cuando el técnico terminó, no
        // cuando volvió la señal) para que datos-supabase.js la respete.
        await conTiempoLimite(sb.completarOrden(item.ordenId, {
          ...item.cierre,
          completed_at: new Date(item.timestamp).toISOString()
        }));
        guardarCola(quitarDeCola(leerCola(), item.ordenId));
      } catch (err) {
        console.error('No se pudo sincronizar el cierre de', item.ordenId, err);
        // La causa típica es señal débil (mismo conTiempoLimite que el resto);
        // se avisa igual aunque no se distinga la causa exacta, para que el
        // letrero no se quede apagado durante una sincronización en segundo
        // plano que en realidad sigue fallando.
        avisarFalloDeRed();
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
    avisarFalloDeRed();
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
    avisarFalloDeRed();
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
    avisarFalloDeRed();
    // Caso aceptado: si esto marcó "tiempo agotado" pero el guardado en el
    // servidor en realidad sí llegó a completarse un instante después, se
    // reenviará igual al sincronizar — mismos datos, misma orden, solo con
    // completed_at unos segundos distinto al de la primera escritura. No hay
    // pérdida de información del técnico ni del cliente, solo ese margen.
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
