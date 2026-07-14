import * as datos from './datos.js';

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

// Placeholders que las tareas 5 y 6 reemplazan por renders reales:
async function renderLista() { mostrarVista('vista-lista'); }
async function renderNueva() { mostrarVista('vista-nueva'); }
async function renderOrden(id) { mostrarVista('vista-orden'); }

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await datos.iniciarSesion($('#clave').value);
  if (!r.ok) return mostrarError('error-login', r.error);
  $('#clave').value = '';
  limpiarError('error-login');
  location.hash = '#/';
  rutear();
});

$('#btn-salir').addEventListener('click', async () => {
  await datos.cerrarSesion();
  location.hash = '#/';
  rutear();
});

window.addEventListener('hashchange', rutear);
rutear();
