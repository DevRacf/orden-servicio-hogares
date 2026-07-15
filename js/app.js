import * as datos from './datos.js';
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, validarCierre, limpiarMateriales,
  ordenarParaLista, formatearFecha
} from './ordenes.js';

const $ = (sel) => document.querySelector(sel);

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

async function rutear() {
  try {
    if (!(await datos.haySesion())) {
      $('#btn-salir').classList.add('oculto');
      mostrarVista('vista-login');
      return;
    }
    $('#btn-salir').classList.remove('oculto');
    const hash = location.hash || '#/';
    const m = hash.match(/^#\/orden\/(.+)$/);
    if (hash === '#/nueva') { await renderNueva(); return; }
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
  return `<a class="tarjeta" href="#/orden/${o.id}">
    <strong>${escapar(o.folio)}</strong> · ${escapar(o.cliente_nombre)}
    <span>${TIPOS_SERVICIO[o.tipo_servicio] || ''} — ${escapar(o.tecnico)}</span>
  </a>`;
}

async function renderLista() {
  mostrarVista('vista-lista');
  const hashEsperado = location.hash || '#/';
  const ordenes = await datos.listarOrdenes();
  // Si el usuario ya navegó a otra vista mientras esto cargaba, no pisar su pantalla actual.
  if ((location.hash || '#/') !== hashEsperado) return;
  const { pendientes, completadas } = ordenarParaLista(ordenes);
  $('#lista-pendientes').innerHTML =
    pendientes.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes pendientes</p>';
  $('#lista-completadas').innerHTML =
    completadas.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes completadas</p>';
}

async function renderNueva() {
  mostrarVista('vista-nueva');
  const hashEsperado = location.hash;
  const tecnicos = await datos.listarTecnicos();
  if (location.hash !== hashEsperado) return;
  $('#select-tecnico').innerHTML =
    tecnicos.map(t => `<option>${escapar(t)}</option>`).join('');
}

// Placeholder que la tarea 6 reemplaza por render real:
async function renderOrden(id) { mostrarVista('vista-orden'); }

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

$('#form-nueva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
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

window.addEventListener('hashchange', rutear);
rutear();
