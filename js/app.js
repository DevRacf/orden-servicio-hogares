import * as datos from './datos.js';
import {
  TIPOS_CLIENTE,
  validarNuevaOrden, validarCierre, limpiarMateriales,
  ordenarParaLista, formatearFecha, etiquetasServicios, filtrarOrdenes
} from './ordenes.js';
import { crearPad } from './firma.js';
import { compartirPdf } from './pdf.js';

const $ = (sel) => document.querySelector(sel);

let ordenActual = null;
let pads = null;
let ordenesCargadas = [];
let rolActual = null;

function filaMaterial(material) {
  const div = document.createElement('div');
  div.className = 'fila-material';
  div.innerHTML = `
    <input type="number" min="1" class="cantidad" placeholder="Cant.">
    <input type="text" class="descripcion" placeholder="Descripción / modelo">
    <button type="button" class="quitar" aria-label="Quitar fila">×</button>`;
  if (material) {
    div.querySelector('.cantidad').value = material.cantidad ?? '';
    div.querySelector('.descripcion').value = material.descripcion ?? '';
  }
  div.querySelector('.quitar').addEventListener('click', () => div.remove());
  return div;
}

// Precarga las filas con los materiales ya guardados (p. ej. los que la
// oficina agregó mientras la orden seguía pendiente); si no hay ninguno,
// una fila vacía para empezar.
function filasMateriales(lista) {
  return (lista && lista.length ? lista : [null]).map(filaMaterial);
}

const VISTAS = ['vista-login', 'vista-lista', 'vista-nueva', 'vista-orden'];

function mostrarVista(id) {
  for (const v of VISTAS) document.getElementById(v).classList.toggle('oculto', v !== id);
}

function mostrarError(idParrafo, mensajes) {
  const p = document.getElementById(idParrafo);
  p.textContent = Array.isArray(mensajes) ? mensajes.join('. ') : mensajes;
  p.classList.remove('oculto');
}

function limpiarError(idParrafo) {
  document.getElementById(idParrafo).classList.add('oculto');
}

// Navega a `hash`. Si el hash ya es ese, `hashchange` no dispara solo,
// así que forzamos rutear() para no perder la actualización. Si el hash
// sí cambia, dejamos que el propio hashchange dispare rutear() una vez
// (llamarlo aquí también duplicaría la ejecución).
function navegar(hash) {
  if (location.hash === hash) rutear();
  else location.hash = hash;
}

async function obtenerRolCacheado() {
  if (rolActual === null) rolActual = await datos.obtenerRol();
  return rolActual;
}

function actualizarVisibilidadPorRol() {
  $('#link-nueva-orden').classList.toggle('oculto', rolActual === 'tecnico');
  $('#seccion-cobros').classList.toggle('oculto', rolActual !== 'oficina');
  const puedeEditar = ordenActual?.estado === 'pendiente' && rolActual === 'oficina'
    && $('#form-editar').classList.contains('oculto');
  $('#btn-editar-orden').classList.toggle('oculto', !puedeEditar);
  const puedeVerCobro = ordenActual?.estado === 'completada' && rolActual === 'oficina';
  $('#control-cobro').classList.toggle('oculto', !puedeVerCobro);
}

async function rutear() {
  try {
    if (!(await datos.haySesion())) {
      $('#btn-salir').classList.add('oculto');
      mostrarVista('vista-login');
      rolActual = null; // se vuelve a resolver en el siguiente login
      return;
    }
    $('#btn-salir').classList.remove('oculto');
    const hash = location.hash || '#/';
    if (hash === '#/nueva') {
      // Crear órdenes ya requería internet antes de este cambio (igual que
      // iniciar sesión); esperar el rol aquí no le quita nada al modo offline,
      // que solo cubre ver/completar órdenes ya cargadas.
      await obtenerRolCacheado();
      actualizarVisibilidadPorRol();
      if (rolActual === 'tecnico') { location.hash = '#/'; return; }
      await renderNueva();
      return;
    }
    // Para las demás rutas no se espera: no debe bloquear la navegación ni
    // romper el modo sin internet si todavía no hay red para resolver el rol.
    // Si falla, se reintenta solo en la siguiente llamada a rutear().
    obtenerRolCacheado().then(actualizarVisibilidadPorRol).catch(err => console.error(err));
    const m = hash.match(/^#\/orden\/(.+)$/);
    if (m) { await renderOrden(m[1]); return; }
    await renderLista();
  } catch (err) {
    // Cualquier lectura del backend (listarOrdenes, listarTecnicos, obtenerOrden,
    // haySesion) puede rechazar en modo Supabase por falta de conexión; en modo
    // demo esto nunca ocurre, así que solo se ejerce contra Supabase real.
    console.error(err);
    mostrarVista('vista-lista');
    $('#lista-pendientes').innerHTML =
      '<p class="error">No se pudo conectar. Revisa tu conexión e intenta de nuevo.</p>';
    $('#lista-completadas').innerHTML = '';
  }
}

function escapar(texto) {
  const d = document.createElement('div');
  d.textContent = texto ?? '';
  return d.innerHTML;
}

function tarjetaOrden(o) {
  const etiquetas = etiquetasServicios(o.servicios).map(e => `<span class="etiqueta">${escapar(e)}</span>`).join('');
  return `<a class="tarjeta" href="#/orden/${o.id}">
    <strong>${escapar(o.folio)}</strong> · ${escapar(o.cliente_nombre)}${o.porEnviar ? ' <span class="estado por-enviar">por enviar</span>' : ''}
    <div class="etiquetas-servicio">${etiquetas}</div>
    <span>${escapar(o.tecnico)}</span>
  </a>`;
}

function pintarListas(ordenes) {
  const { pendientes, completadas, porCobrar, cobradas, pagadas } = ordenarParaLista(ordenes);
  $('#lista-pendientes').innerHTML =
    pendientes.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes pendientes</p>';
  $('#lista-completadas').innerHTML =
    completadas.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes completadas</p>';
  // Estas tres solo se ven (#seccion-cobros) si el rol es oficina, pero se
  // llenan siempre — es más simple que duplicar pintarListas por rol.
  $('#lista-por-cobrar').innerHTML =
    porCobrar.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes por cobrar</p>';
  $('#lista-cobradas').innerHTML =
    cobradas.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes cobradas</p>';
  $('#lista-pagadas').innerHTML =
    pagadas.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes pagadas</p>';
  $('#cuenta-por-cobrar').textContent = porCobrar.length;
  $('#cuenta-cobradas').textContent = cobradas.length;
  $('#cuenta-pagadas').textContent = pagadas.length;
}

async function renderLista() {
  // Si la lista ya estaba visible (recarga en el sitio: reconexión, sincronización
  // de la cola offline), no es una navegación nueva — se conserva lo que el usuario
  // ya escribió en el buscador en vez de borrarlo bajo sus dedos.
  const yaVisible = !document.getElementById('vista-lista').classList.contains('oculto');
  mostrarVista('vista-lista');
  if (!yaVisible) $('#buscador').value = '';
  const hashEsperado = location.hash || '#/';
  const ordenes = await datos.listarOrdenes();
  // Si el usuario ya navegó a otra vista mientras esto cargaba, no pisar su pantalla actual.
  if ((location.hash || '#/') !== hashEsperado) return;
  ordenesCargadas = ordenes;
  pintarListas(filtrarOrdenes(ordenesCargadas, $('#buscador').value));
}

async function renderNueva() {
  mostrarVista('vista-nueva');
  const hashEsperado = location.hash;
  const tecnicos = await datos.listarTecnicos();
  if (location.hash !== hashEsperado) return;
  $('#select-tecnico').innerHTML =
    tecnicos.map(t => `<option>${escapar(t)}</option>`).join('');
}

async function renderOrden(id, forzar = false) {
  // Si ya se estaba viendo esta misma orden pendiente (p. ej. una reconexión en
  // segundo plano volvió a llamar rutear()), no se reconstruye el formulario:
  // perdería el trabajo/materiales ya escritos y destruiría los pads de firma
  // con lo que ya se hubiera firmado, incluida la firma del cliente. `forzar`
  // se usa tras guardar una edición de oficina, donde sí queremos reconstruir
  // todo con los datos recién guardados.
  const yaEnEstaOrdenPendiente = !forzar
    && !document.getElementById('vista-orden').classList.contains('oculto')
    && ordenActual?.id === id
    && ordenActual?.estado === 'pendiente';
  mostrarVista('vista-orden');
  const hashEsperado = location.hash;
  const orden = await datos.obtenerOrden(id);
  // Si el usuario ya abrió otra orden mientras esta cargaba, no pisar sus datos
  // ni crear un segundo SignaturePad sobre los mismos canvas.
  if (location.hash !== hashEsperado) return;
  if (yaEnEstaOrdenPendiente && orden?.estado === 'pendiente') return;
  ordenActual = orden;
  if (!ordenActual) { location.hash = '#/'; return; }
  const o = ordenActual;

  $('#orden-titulo').innerHTML =
    `<h2>${escapar(o.folio)} <span class="estado ${o.estado}">${o.estado}</span>${o.porEnviar ? ' <span class="estado por-enviar">por enviar</span>' : ''}</h2>`;

  $('#orden-datos').innerHTML = `
    <dl>
      <dt>Cliente</dt><dd>${escapar(o.cliente_nombre)} (${TIPOS_CLIENTE[o.tipo_cliente] || ''})</dd>
      <dt>Teléfono</dt><dd>${escapar(o.cliente_telefono || '—')}</dd>
      <dt>Dirección</dt><dd>${escapar(o.cliente_direccion)}</dd>
      <dt>Servicios</dt><dd>${etiquetasServicios(o.servicios).map(e => escapar(e)).join(', ')}</dd>
      <dt>Solicitado</dt><dd>${escapar(o.descripcion || '—')}</dd>
      <dt>Técnico</dt><dd>${escapar(o.tecnico)}</dd>
      <dt>Creada</dt><dd>${formatearFecha(o.created_at)}</dd>
      ${o.estado === 'completada' ? `
      <dt>Trabajo realizado</dt><dd>${escapar(o.trabajo_realizado)}</dd>
      <dt>Materiales</dt><dd>${(o.materiales || [])
        .map(m => `${m.cantidad} × ${escapar(m.descripcion)}`).join('<br>') || '—'}</dd>
      <dt>Materiales y equipo del cliente</dt><dd>${(o.materiales_cliente || [])
        .map(m => `${m.cantidad} × ${escapar(m.descripcion)}`).join('<br>') || '—'}</dd>
      <dt>Cerrada</dt><dd>${formatearFecha(o.completed_at)}</dd>` : ''}
    </dl>`;

  // #firma-tecnico/#firma-cliente son canvas fijos que se reutilizan entre
  // órdenes; hay que soltar los listeners del pad anterior antes de crear
  // uno nuevo (o de dejar de necesitarlo, si la orden ya está completada).
  pads?.tecnico?.destruir();
  pads?.cliente?.destruir();
  pads = null;

  const esPendiente = o.estado === 'pendiente';
  $('#form-completar').classList.toggle('oculto', !esPendiente);
  $('#form-editar').classList.add('oculto');
  $('#btn-pdf').classList.toggle('oculto', esPendiente);

  if (esPendiente) {
    $('#trabajo-realizado').value = '';
    $('#filas-materiales').replaceChildren(...filasMateriales(o.materiales));
    $('#filas-materiales-cliente').replaceChildren(...filasMateriales(o.materiales_cliente));
    pads = {
      tecnico: crearPad(document.getElementById('firma-tecnico')),
      cliente: crearPad(document.getElementById('firma-cliente'))
    };
  } else {
    $('#select-estatus-cobro').value = o.estatus_cobro || 'por_cobrar';
    limpiarError('error-cobro');
  }
  actualizarVisibilidadPorRol();
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await datos.iniciarSesion($('#clave').value);
  if (!r.ok) return mostrarError('error-login', r.error);
  $('#clave').value = '';
  limpiarError('error-login');
  navegar('#/');
});

$('#btn-salir').addEventListener('click', async () => {
  await datos.cerrarSesion();
  navegar('#/');
});

$('#buscador').addEventListener('input', () => {
  pintarListas(filtrarOrdenes(ordenesCargadas, $('#buscador').value));
});

$('#form-nueva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const d = Object.fromEntries(form);
  d.servicios = form.getAll('servicios');
  const v = validarNuevaOrden(d);
  if (!v.ok) return mostrarError('error-nueva', v.errores);
  limpiarError('error-nueva');
  const boton = e.target.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    await datos.crearOrden(d);
  } catch {
    return mostrarError('error-nueva', 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
  } finally {
    boton.disabled = false;
  }
  e.target.reset();
  navegar('#/');
});

$('#btn-agregar-material').addEventListener('click', () => {
  $('#filas-materiales').appendChild(filaMaterial());
});

$('#btn-agregar-material-cliente').addEventListener('click', () => {
  $('#filas-materiales-cliente').appendChild(filaMaterial());
});

$('#btn-editar-orden').addEventListener('click', async () => {
  const o = ordenActual;
  const form = $('#form-editar');
  form.cliente_nombre.value = o.cliente_nombre;
  form.cliente_telefono.value = o.cliente_telefono || '';
  form.cliente_direccion.value = o.cliente_direccion;
  form.tipo_cliente.value = o.tipo_cliente;
  form.querySelectorAll('input[name="servicios"]').forEach(c => {
    c.checked = o.servicios.includes(c.value);
  });
  form.descripcion.value = o.descripcion || '';
  const tecnicos = new Set(await datos.listarTecnicos());
  tecnicos.add(o.tecnico); // por si el técnico asignado ya no está activo
  $('#select-tecnico-editar').innerHTML = [...tecnicos]
    .map(t => `<option ${t === o.tecnico ? 'selected' : ''}>${escapar(t)}</option>`).join('');
  $('#filas-materiales-editar').replaceChildren(...filasMateriales(o.materiales));
  $('#filas-materiales-cliente-editar').replaceChildren(...filasMateriales(o.materiales_cliente));
  limpiarError('error-editar');
  $('#form-completar').classList.add('oculto');
  form.classList.remove('oculto');
  actualizarVisibilidadPorRol();
});

$('#btn-cancelar-editar').addEventListener('click', () => {
  $('#form-editar').classList.add('oculto');
  $('#form-completar').classList.toggle('oculto', ordenActual.estado !== 'pendiente');
  actualizarVisibilidadPorRol();
});

$('#btn-agregar-material-editar').addEventListener('click', () => {
  $('#filas-materiales-editar').appendChild(filaMaterial());
});

$('#btn-agregar-material-cliente-editar').addEventListener('click', () => {
  $('#filas-materiales-cliente-editar').appendChild(filaMaterial());
});

$('#form-editar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const d = Object.fromEntries(form);
  d.servicios = form.getAll('servicios');
  const v = validarNuevaOrden(d);
  if (!v.ok) return mostrarError('error-editar', v.errores);
  limpiarError('error-editar');
  const leerFilas = (contenedor) => [...document.querySelectorAll(`#${contenedor} .fila-material`)].map(f => ({
    cantidad: f.querySelector('.cantidad').value,
    descripcion: f.querySelector('.descripcion').value
  }));
  d.materiales = limpiarMateriales(leerFilas('filas-materiales-editar'));
  d.materiales_cliente = limpiarMateriales(leerFilas('filas-materiales-cliente-editar'));
  const boton = e.target.querySelector('button[type="submit"]');
  boton.disabled = true;
  let ordenActualizada;
  try {
    ordenActualizada = await datos.actualizarOrden(ordenActual.id, d);
  } catch {
    return mostrarError('error-editar', 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
  } finally {
    boton.disabled = false;
  }
  ordenActual = ordenActualizada;
  await renderOrden(ordenActual.id, true);
});

$('#select-estatus-cobro').addEventListener('change', async (e) => {
  const anterior = ordenActual.estatus_cobro || 'por_cobrar';
  const nuevo = e.target.value;
  limpiarError('error-cobro');
  try {
    ordenActual = await datos.actualizarEstatusCobro(ordenActual.id, nuevo);
  } catch {
    e.target.value = anterior;
    return mostrarError('error-cobro', 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
  }
});

document.querySelectorAll('[data-limpia]').forEach(b =>
  b.addEventListener('click', () => pads?.[b.dataset.limpia]?.limpiar()));

$('#btn-pdf').addEventListener('click', () => compartirPdf(ordenActual));

$('#form-completar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const leerFilas = (contenedor) => [...document.querySelectorAll(`#${contenedor} .fila-material`)].map(f => ({
    cantidad: f.querySelector('.cantidad').value,
    descripcion: f.querySelector('.descripcion').value
  }));
  const cierre = {
    trabajo_realizado: $('#trabajo-realizado').value,
    materiales: limpiarMateriales(leerFilas('filas-materiales')),
    materiales_cliente: limpiarMateriales(leerFilas('filas-materiales-cliente')),
    firma_tecnico: pads.tecnico.vacia() ? null : pads.tecnico.imagen(),
    firma_cliente: pads.cliente.vacia() ? null : pads.cliente.imagen()
  };
  const v = validarCierre(cierre);
  if (!v.ok) return mostrarError('error-completar', v.errores);
  limpiarError('error-completar');
  const boton = e.target.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    ordenActual = await datos.completarOrden(ordenActual.id, cierre);
  } catch {
    return mostrarError('error-completar', 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
  } finally {
    boton.disabled = false;
  }
  try {
    await compartirPdf(ordenActual);
  } catch (err) {
    console.error(err);
  }
  navegar(`#/orden/${ordenActual.id}`);
});

window.addEventListener('hashchange', rutear);
rutear();

// navigator.onLine no detecta señal débil (la petición se cuelga, no falla
// limpio) — js/offline.js avisa esos casos con 'fallo-red-detectado'. Se
// muestra el letrero por 15s tras el último aviso, no solo con offline real.
let ultimoFalloDeRed = 0;
const VENTANA_AVISO_MS = 15000;

function actualizarAvisoConexion() {
  const falloReciente = Date.now() - ultimoFalloDeRed < VENTANA_AVISO_MS;
  $('#aviso-offline').classList.toggle('oculto', navigator.onLine && !falloReciente);
}

window.addEventListener('online', async () => {
  actualizarAvisoConexion();
  await datos.sincronizar?.();
  rutear();
});
window.addEventListener('offline', actualizarAvisoConexion);
window.addEventListener('fallo-red-detectado', () => {
  ultimoFalloDeRed = Date.now();
  actualizarAvisoConexion();
  setTimeout(actualizarAvisoConexion, VENTANA_AVISO_MS + 100);
});
actualizarAvisoConexion();

// Al arrancar la app también se reenvía lo encolado (p. ej. si la señal volvió
// con la app cerrada); en modo demo `sincronizar` es undefined y no hace nada.
datos.sincronizar?.();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
}
