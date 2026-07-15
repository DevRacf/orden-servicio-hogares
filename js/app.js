import * as datos from './datos.js';
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, validarCierre, limpiarMateriales,
  ordenarParaLista, formatearFecha
} from './ordenes.js';
import { crearPad } from './firma.js';

const $ = (sel) => document.querySelector(sel);

let ordenActual = null;
let pads = null;

function filaMaterial() {
  const div = document.createElement('div');
  div.className = 'fila-material';
  div.innerHTML = `
    <input type="number" min="1" class="cantidad" placeholder="Cant.">
    <input type="text" class="descripcion" placeholder="Descripción / modelo">
    <button type="button" class="quitar" aria-label="Quitar fila">×</button>`;
  div.querySelector('.quitar').addEventListener('click', () => div.remove());
  return div;
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

async function renderOrden(id) {
  mostrarVista('vista-orden');
  const hashEsperado = location.hash;
  const orden = await datos.obtenerOrden(id);
  // Si el usuario ya abrió otra orden mientras esta cargaba, no pisar sus datos
  // ni crear un segundo SignaturePad sobre los mismos canvas.
  if (location.hash !== hashEsperado) return;
  ordenActual = orden;
  if (!ordenActual) { location.hash = '#/'; return; }
  const o = ordenActual;

  $('#orden-datos').innerHTML = `
    <h2>${escapar(o.folio)} <span class="estado ${o.estado}">${o.estado}</span></h2>
    <dl>
      <dt>Cliente</dt><dd>${escapar(o.cliente_nombre)} (${TIPOS_CLIENTE[o.tipo_cliente] || ''})</dd>
      <dt>Teléfono</dt><dd>${escapar(o.cliente_telefono || '—')}</dd>
      <dt>Dirección</dt><dd>${escapar(o.cliente_direccion)}</dd>
      <dt>Servicio</dt><dd>${TIPOS_SERVICIO[o.tipo_servicio] || ''}</dd>
      <dt>Solicitado</dt><dd>${escapar(o.descripcion || '—')}</dd>
      <dt>Técnico</dt><dd>${escapar(o.tecnico)}</dd>
      <dt>Creada</dt><dd>${formatearFecha(o.created_at)}</dd>
      ${o.estado === 'completada' ? `
      <dt>Trabajo realizado</dt><dd>${escapar(o.trabajo_realizado)}</dd>
      <dt>Materiales</dt><dd>${(o.materiales || [])
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
  $('#btn-pdf').classList.toggle('oculto', esPendiente);

  if (esPendiente) {
    $('#trabajo-realizado').value = '';
    $('#filas-materiales').replaceChildren(filaMaterial());
    pads = {
      tecnico: crearPad(document.getElementById('firma-tecnico')),
      cliente: crearPad(document.getElementById('firma-cliente'))
    };
  }
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

$('#btn-agregar-material').addEventListener('click', () => {
  $('#filas-materiales').appendChild(filaMaterial());
});

document.querySelectorAll('[data-limpia]').forEach(b =>
  b.addEventListener('click', () => pads?.[b.dataset.limpia]?.limpiar()));

$('#form-completar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const filas = [...document.querySelectorAll('#filas-materiales .fila-material')].map(f => ({
    cantidad: f.querySelector('.cantidad').value,
    descripcion: f.querySelector('.descripcion').value
  }));
  const cierre = {
    trabajo_realizado: $('#trabajo-realizado').value,
    materiales: limpiarMateriales(filas),
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
  navegar(`#/orden/${ordenActual.id}`);
});

window.addEventListener('hashchange', rutear);
rutear();
