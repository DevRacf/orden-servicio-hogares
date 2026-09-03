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

function esErrorDeEspacio(err) {
  return err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
}

// La cola de cierres (lo que el técnico ya trabajó) es lo que de verdad no
// se puede perder; la caché de lectura es solo un respaldo prescindible para
// ver órdenes sin conexión. Si el teléfono ya no tiene espacio, se vacía esa
// caché primero para hacerle lugar al cierre antes de rendirse.
function guardarColaOLiberarEspacio(cola) {
  try {
    guardarCola(cola);
    return true;
  } catch (err) {
    if (!esErrorDeEspacio(err)) throw err;
  }
  try { localStorage.removeItem(LLAVE_CACHE); } catch { /* nada que liberar */ }
  try {
    guardarCola(cola);
    return true;
  } catch (err) {
    if (!esErrorDeEspacio(err)) throw err;
    return false;
  }
}

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

// Si ya hay una sincronización en curso, un segundo llamador espera la MISMA
// promesa en vez de recibir un no-op inmediato — si no, obtenerOrden()/
// listarOrdenes() podrían leer el servidor antes de que el cierre en curso
// terminara de guardarse ahí.
let sincronizacionEnCurso = null;

// Un cierre que el servidor rechaza de plano (no por señal débil, sino p. ej.
// porque alguien más ya completó o borró esa orden) nunca va a pasar sin
// importar cuántas veces se reintente. Antes eso detenía la cola entera para
// siempre, atorando también los cierres de otras órdenes que sí iban a poder
// enviarse. Se avisa aparte para que alguien lo revise a mano.
function avisarCierreDescartado(ordenId, err) {
  const folio = (leerCache() || []).find(o => o.id === ordenId)?.folio || ordenId;
  window.dispatchEvent(new CustomEvent('cierre-descartado', {
    detail: { ordenId, folio, error: String(err?.message || err) }
  }));
}

// Reenvía los cierres encolados, en orden. Un fallo de red detiene el intento
// (se reintenta en la siguiente oportunidad, la cola no se toca); un rechazo
// del servidor para un cierre en concreto lo descarta y sigue con los demás.
export function sincronizar() {
  if (!navigator.onLine) return Promise.resolve();
  if (sincronizacionEnCurso) return sincronizacionEnCurso;
  sincronizacionEnCurso = (async () => {
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
          if (esFalloDeRed(err)) {
            avisarFalloDeRed();
            break;
          }
          guardarCola(quitarDeCola(leerCola(), item.ordenId));
          avisarCierreDescartado(item.ordenId, err);
        }
      }
    } finally {
      sincronizacionEnCurso = null;
    }
  })();
  return sincronizacionEnCurso;
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
    // Sin esto, reabrir una orden que se cerró sin conexión podía traer del
    // servidor la versión vieja "pendiente" (el cierre encolado aún no
    // llegaba) justo antes de que la sincronización la borrara de la cola,
    // mostrando el formulario vacío como si lo llenado se hubiera perdido.
    await sincronizar();
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
    // Caso aceptado: si esto marcó "tiempo agotado" pero el guardado en el
    // servidor en realidad sí llegó a completarse un instante después, se
    // reenviará igual al sincronizar — mismos datos, misma orden, solo con
    // completed_at unos segundos distinto al de la primera escritura. No hay
    // pérdida de información del técnico ni del cliente, solo ese margen.
    const cola = agregarACola(leerCola(), id, cierre, Date.now());
    if (!guardarColaOLiberarEspacio(cola)) {
      // Ni liberando la caché de lectura hubo espacio: esto sí se pierde si
      // no se libera espacio en el teléfono — muy distinto de "sin señal"
      // (esperar a tener señal no lo va a arreglar), así que se avisa aparte.
      const error = new Error('No hay espacio en el teléfono para guardar este cierre sin conexión. Libera espacio (fotos, apps) e inténtalo de nuevo.');
      error.sinEspacio = true;
      throw error;
    }
    avisarFalloDeRed();
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

export async function obtenerRol() {
  try {
    return await conTiempoLimite(sb.obtenerRol());
  } catch (err) {
    if (!esFalloDeRed(err)) throw err;
    avisarFalloDeRed();
    return 'tecnico'; // por seguridad: ante la duda, el lado restrictivo
  }
}

export const {
  iniciarSesion, haySesion, cerrarSesion, listarTecnicos,
  crearOrden, actualizarOrden, actualizarEstatusCobro, eliminarOrden,
  listarClientes, registrarClienteDesdeOrden, actualizarCliente,
  agregarDireccion, actualizarDireccion, eliminarDireccion
} = sb;
