import * as datos from './datos.js';
import {
  TIPOS_CLIENTE, TIPOS_SERVICIO,
  validarNuevaOrden, validarCierre, limpiarMateriales,
  ordenarParaLista, formatearFecha, etiquetasServicios, filtrarOrdenes,
  calcularDashboard, filtrarClientes
} from './ordenes.js';
import { crearPad } from './firma.js';
import { compartirPdf } from './pdf.js';

const $ = (sel) => document.querySelector(sel);

let ordenActual = null;
let pads = null;
let ordenesCargadas = [];
let rolActual = null;
let clientesNuevaCargados = [];
let clientesVistaCargados = [];

// Se activa en cada entrada nueva a la lista (no en un refresco de fondo) y
// se consume en actualizarVisibilidadPorRol(), que es donde ya se sabe el
// rol: a los técnicos no les interesa ver completadas de entrada, así que
// esa sección arranca colapsada cada vez que vuelven a la lista.
let colapsarCompletadasTecnico = false;

const OPCIONES_CANTIDAD = Array.from({ length: 20 }, (_, i) => i + 1)
  .map(n => `<option value="${n}">${n}</option>`).join('');

function filaMaterial(material) {
  const div = document.createElement('div');
  div.className = 'fila-material';
  div.innerHTML = `
    <select class="cantidad" aria-label="Cantidad">
      <option value="" disabled ${material ? '' : 'selected'}>Cant.</option>
      ${OPCIONES_CANTIDAD}
    </select>
    <input type="text" class="descripcion" placeholder="Descripción / modelo">
    <button type="button" class="quitar" aria-label="Quitar fila">×</button>`;
  if (material) {
    div.querySelector('.cantidad').value = material.cantidad ?? '';
    div.querySelector('.descripcion').value = material.descripcion ?? '';
  }
  div.querySelector('.quitar').addEventListener('click', () => div.remove());
  return div;
}

function leerFilasMateriales(contenedorId) {
  return [...document.querySelectorAll(`#${contenedorId} .fila-material`)].map(f => ({
    cantidad: f.querySelector('.cantidad').value,
    descripcion: f.querySelector('.descripcion').value
  }));
}

function ocultarSelectorDireccion() {
  $('#campo-direccion-guardada').classList.add('oculto');
  $('#select-direccion-nueva').innerHTML = '';
}

function mostrarModoFirmaCliente(sinFirma) {
  $('#firma-cliente').classList.toggle('oculto', sinFirma);
  $('[data-limpia="cliente"]').classList.toggle('oculto', sinFirma);
  $('#campo-autoriza-nombre').classList.toggle('oculto', !sinFirma);
}

// Precarga las filas con los materiales ya guardados (p. ej. los que la
// oficina agregó mientras la orden seguía pendiente); si no hay ninguno,
// una fila vacía para empezar.
function filasMateriales(lista) {
  return (lista && lista.length ? lista : [null]).map(filaMaterial);
}

const VISTAS = ['vista-login', 'vista-lista', 'vista-nueva', 'vista-orden', 'vista-dashboard', 'vista-clientes'];

// Se guarda aquí (no en el historial del navegador) para poder restaurarlo
// al volver a la lista con "← Órdenes" o con el botón atrás del celular.
let scrollListaGuardado = 0;

function mostrarVista(id) {
  const listaVisible = !document.getElementById('vista-lista').classList.contains('oculto');
  if (listaVisible && id !== 'vista-lista') scrollListaGuardado = window.scrollY;
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

// Resalta el destino activo en la barra lateral (solo se ve en escritorio,
// pero no hace daño calcularlo siempre). "Órdenes" cuenta como activo tanto
// en la lista como al ver o crear una orden — son parte de la misma sección.
function actualizarNavActiva(hash) {
  const esOrdenes = hash === '#/' || /^#\/orden\//.test(hash) || hash === '#/nueva';
  $('#link-ordenes')?.classList.toggle('activo', esOrdenes);
  $('#link-clientes')?.classList.toggle('activo', hash === '#/clientes');
  $('#link-dashboard')?.classList.toggle('activo', hash === '#/dashboard');
}

function actualizarVisibilidadPorRol() {
  if (colapsarCompletadasTecnico) {
    colapsarCompletadasTecnico = false;
    if (rolActual === 'tecnico') $('#vista-lista .col-completada').open = false;
  }
  $('#link-nueva-orden').classList.toggle('oculto', rolActual === 'tecnico');
  $('#link-dashboard').classList.toggle('oculto', rolActual !== 'oficina');
  $('#link-clientes').classList.toggle('oculto', rolActual !== 'oficina');
  $('#seccion-cobros').classList.toggle('oculto', rolActual !== 'oficina');
  const puedeEditar = !!ordenActual && rolActual === 'oficina'
    && $('#form-editar').classList.contains('oculto');
  $('#btn-editar-orden').classList.toggle('oculto', !puedeEditar);
  const puedeVerCobro = ordenActual?.estado === 'completada' && rolActual === 'oficina';
  $('#control-cobro').classList.toggle('oculto', !puedeVerCobro);
  $('#btn-eliminar-orden').classList.toggle('oculto', !puedeVerCobro);
  // El rol puede resolverse después de que la lista ya se pintó (se pinta sin
  // esperar red, ver rutear()); si acaba de llegar y cambia qué cuenta como
  // "completada" según el rol, se repinta con lo que ya está cargado.
  if (ordenesCargadas.length) pintarListas(filtrarOrdenes(ordenesCargadas, $('#buscador').value));
}

async function rutear() {
  try {
    if (!(await datos.haySesion())) {
      $('#btn-salir').classList.add('oculto');
      $('#link-dashboard').classList.add('oculto');
      $('#link-clientes').classList.add('oculto');
      $('#link-ordenes').classList.add('oculto');
      mostrarVista('vista-login');
      rolActual = null; // se vuelve a resolver en el siguiente login
      return;
    }
    $('#btn-salir').classList.remove('oculto');
    $('#link-ordenes').classList.remove('oculto');
    const hash = location.hash || '#/';
    actualizarNavActiva(hash);
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
    if (hash === '#/dashboard') {
      // Solo oficina: igual que #/nueva, aquí sí esperamos el rol antes de
      // mostrar nada.
      await obtenerRolCacheado();
      actualizarVisibilidadPorRol();
      if (rolActual !== 'oficina') { location.hash = '#/'; return; }
      await renderDashboard();
      return;
    }
    if (hash === '#/clientes') {
      await obtenerRolCacheado();
      actualizarVisibilidadPorRol();
      if (rolActual !== 'oficina') { location.hash = '#/'; return; }
      await renderClientes();
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

// Solo en pendientes tiene sentido un orden de trabajo manual. Oficina puede
// asignarlo (número aparte del folio, indica qué se atiende primero); a
// cualquier otro rol que ya tenga uno asignado se le muestra de solo lectura
// para que sepa el orden, sin poder cambiarlo.
function prioridadTarjeta(o) {
  if (o.estado !== 'pendiente') return '';
  if (rolActual === 'oficina') {
    return `<input type="number" class="prioridad-orden" min="1" step="1" inputmode="numeric"
      data-id="${o.id}" value="${o.prioridad ?? ''}" placeholder="#"
      aria-label="Orden de trabajo de ${escapar(o.folio)}" title="Orden de trabajo (solo oficina)">`;
  }
  return o.prioridad
    ? `<span class="prioridad-etiqueta" title="Orden de trabajo asignado por oficina">#${o.prioridad}</span>`
    : '';
}

function tarjetaOrden(o) {
  const etiquetas = etiquetasServicios(o.servicios).map(e => `<span class="etiqueta">${escapar(e)}</span>`).join('');
  return `<a class="tarjeta" href="#/orden/${o.id}">
    ${prioridadTarjeta(o)}
    <strong>${escapar(o.folio)}</strong> · ${escapar(o.cliente_nombre)}${o.porEnviar ? ' <span class="estado por-enviar">por enviar</span>' : ''}
    <div class="etiquetas-servicio">${etiquetas}</div>
    <span>${escapar(o.tecnico)}</span>
  </a>`;
}

function pintarListas(ordenes) {
  const { pendientes, completadas, porCobrar, cobradas, pagadas } = ordenarParaLista(ordenes, rolActual);
  $('#lista-pendientes').innerHTML =
    pendientes.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes pendientes</p>';
  $('#lista-completadas').innerHTML =
    completadas.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes completadas</p>';
  $('#cuenta-pendientes').textContent = pendientes.length;
  $('#cuenta-completadas').textContent = completadas.length;
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
  if (!yaVisible) {
    $('#buscador').value = '';
    colapsarCompletadasTecnico = true;
  }
  const hashEsperado = location.hash || '#/';
  const ordenes = await datos.listarOrdenes();
  // Si el usuario ya navegó a otra vista mientras esto cargaba, no pisar su pantalla actual.
  if ((location.hash || '#/') !== hashEsperado) return;
  ordenesCargadas = ordenes;
  pintarListas(filtrarOrdenes(ordenesCargadas, $('#buscador').value));
  // Solo al volver de otra vista (no en un refresco de fondo): espera a que
  // el navegador acomode el layout con el contenido ya pintado antes de
  // restaurar dónde estaba, si no el scroll se queda en 0 sin efecto.
  if (!yaVisible) requestAnimationFrame(() => window.scrollTo(0, scrollListaGuardado));
}

async function renderNueva() {
  mostrarVista('vista-nueva');
  $('#filas-materiales-nueva').replaceChildren(...filasMateriales([]));
  $('#filas-materiales-cliente-nueva').replaceChildren(...filasMateriales([]));
  ocultarSelectorDireccion();
  const hashEsperado = location.hash;
  const [tecnicos, clientes] = await Promise.all([datos.listarTecnicos(), datos.listarClientes()]);
  if (location.hash !== hashEsperado) return;
  $('#select-tecnico').innerHTML =
    tecnicos.map(t => `<option>${escapar(t)}</option>`).join('');
  clientesNuevaCargados = clientes;
  $('#datalist-clientes').replaceChildren(...clientes.map(c => {
    const opt = document.createElement('option');
    opt.value = c.nombre;
    return opt;
  }));
}

function filaDireccion(direccion) {
  const div = document.createElement('div');
  div.className = 'fila-direccion';
  div.innerHTML = `
    <input type="text" class="texto-direccion" aria-label="Dirección">
    <button type="button" class="quitar" aria-label="Quitar dirección">×</button>`;
  const input = div.querySelector('.texto-direccion');
  input.value = direccion.direccion;
  input.addEventListener('change', async () => {
    const texto = input.value.trim();
    if (!texto) { input.value = direccion.direccion; return; }
    try {
      await datos.actualizarDireccion(direccion.id, texto);
      direccion.direccion = texto;
    } catch {
      input.value = direccion.direccion;
      alert('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  });
  div.querySelector('.quitar').addEventListener('click', async () => {
    if (!confirm('¿Quitar esta dirección?')) return;
    try {
      await datos.eliminarDireccion(direccion.id);
      div.remove();
    } catch {
      alert('No se pudo quitar. Revisa tu conexión e intenta de nuevo.');
    }
  });
  return div;
}

function tarjetaCliente(cliente) {
  const div = document.createElement('div');
  div.className = 'tarjeta-cliente';
  div.innerHTML = `
    <div class="fila-nombre-tel">
      <input type="text" class="nombre-cliente" aria-label="Nombre">
      <input type="tel" class="telefono-cliente" placeholder="Teléfono" aria-label="Teléfono">
    </div>
    <h4>Direcciones</h4>
    <div class="filas-direcciones"></div>
    <button type="button" class="liga agregar-direccion">+ Agregar dirección</button>`;

  const nombreInput = div.querySelector('.nombre-cliente');
  nombreInput.value = cliente.nombre;
  nombreInput.addEventListener('change', async () => {
    const texto = nombreInput.value.trim();
    if (!texto) { nombreInput.value = cliente.nombre; return; }
    try {
      await datos.actualizarCliente(cliente.id, { nombre: texto });
      cliente.nombre = texto;
    } catch {
      nombreInput.value = cliente.nombre;
      alert('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  });

  const telInput = div.querySelector('.telefono-cliente');
  telInput.value = cliente.telefono || '';
  telInput.addEventListener('change', async () => {
    const texto = telInput.value.trim();
    try {
      await datos.actualizarCliente(cliente.id, { telefono: texto || null });
      cliente.telefono = texto;
    } catch {
      telInput.value = cliente.telefono || '';
      alert('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  });

  const contenedorDirecciones = div.querySelector('.filas-direcciones');
  contenedorDirecciones.replaceChildren(...(cliente.direcciones || []).map(filaDireccion));

  div.querySelector('.agregar-direccion').addEventListener('click', async () => {
    const texto = prompt('Nueva dirección:');
    if (!texto || !texto.trim()) return;
    try {
      const nueva = await datos.agregarDireccion(cliente.id, texto.trim());
      cliente.direcciones = [...(cliente.direcciones || []), nueva];
      contenedorDirecciones.appendChild(filaDireccion(nueva));
    } catch {
      alert('No se pudo agregar. Revisa tu conexión e intenta de nuevo.');
    }
  });

  return div;
}

function pintarClientes(clientes) {
  if (!clientes.length) {
    $('#lista-clientes-vista').innerHTML = '<p class="vacio">Sin clientes todavía</p>';
    return;
  }
  $('#lista-clientes-vista').replaceChildren(...clientes.map(tarjetaCliente));
}

function filaTablaCliente(cliente) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="nombre-cliente-tabla" aria-label="Nombre"></td>
    <td><input type="tel" class="telefono-cliente-tabla" placeholder="—" aria-label="Teléfono"></td>
    <td class="celda-domicilio"></td>`;

  const nombreInput = tr.querySelector('.nombre-cliente-tabla');
  nombreInput.value = cliente.nombre;
  nombreInput.addEventListener('change', async () => {
    const texto = nombreInput.value.trim();
    if (!texto) { nombreInput.value = cliente.nombre; return; }
    try {
      await datos.actualizarCliente(cliente.id, { nombre: texto });
      cliente.nombre = texto;
    } catch {
      nombreInput.value = cliente.nombre;
      alert('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  });

  const telInput = tr.querySelector('.telefono-cliente-tabla');
  telInput.value = cliente.telefono || '';
  telInput.addEventListener('change', async () => {
    const texto = telInput.value.trim();
    try {
      await datos.actualizarCliente(cliente.id, { telefono: texto || null });
      cliente.telefono = texto;
    } catch {
      telInput.value = cliente.telefono || '';
      alert('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  });

  const direcciones = cliente.direcciones || [];
  const celdaDomicilio = tr.querySelector('.celda-domicilio');
  celdaDomicilio.replaceChildren(...(direcciones.length
    ? direcciones.flatMap((d, i) => i === 0
      ? [document.createTextNode(d.direccion)]
      : [document.createElement('br'), document.createTextNode(d.direccion)])
    : [document.createTextNode('—')]));

  return tr;
}

function pintarTablaClientes(clientes) {
  if (!clientes.length) {
    $('#tabla-clientes-vista').innerHTML = '<p class="vacio">Sin clientes todavía</p>';
    return;
  }
  $('#tabla-clientes-vista').innerHTML = `
    <div class="tabla-scroll">
      <table class="tabla-clientes">
        <colgroup>
          <col class="col-nombre"><col class="col-telefono"><col class="col-domicilio">
        </colgroup>
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Domicilio</th></tr></thead>
        <tbody id="cuerpo-tabla-clientes"></tbody>
      </table>
    </div>`;
  $('#cuerpo-tabla-clientes').replaceChildren(...clientes.map(filaTablaCliente));
}

let vistaClientesActual = 'tarjetas';
let ultimosClientesFiltrados = [];

// Ambas vistas se arman a partir de los mismos objetos cliente (una edición
// en una se refleja en la otra en cuanto se cambia de vista, sin refrescar
// desde el servidor) — solo se pinta la que está visible.
function pintarVistaClientesActual(clientes) {
  ultimosClientesFiltrados = clientes;
  if (vistaClientesActual === 'tabla') pintarTablaClientes(clientes);
  else pintarClientes(clientes);
}

async function renderClientes() {
  const yaVisible = !document.getElementById('vista-clientes').classList.contains('oculto');
  mostrarVista('vista-clientes');
  if (!yaVisible) $('#buscador-clientes').value = '';
  const hashEsperado = location.hash;
  const clientes = await datos.listarClientes();
  if (location.hash !== hashEsperado) return;
  clientesVistaCargados = clientes;
  pintarVistaClientesActual(filtrarClientes(clientesVistaCargados, $('#buscador-clientes').value));
}

let rangoDashboard = '30d';
const ETIQUETAS_RANGO = { '7d': '7 días', '30d': '30 días', anio: 'este año' };
const PALETA_DONA = ['var(--azul-2)', 'var(--acento)', '#7FB3C9', '#C9A6D9', 'var(--gris)', '#B5D99C'];

function tendenciaTexto(actual, previo) {
  if (previo === 0) return actual > 0 ? { texto: `▲ ${actual} nuevas`, clase: 'subio' } : { texto: 'Sin cambio', clase: 'neutral' };
  const cambio = Math.round(((actual - previo) / previo) * 100);
  if (cambio > 0) return { texto: `▲ ${cambio}% vs. periodo anterior`, clase: 'subio' };
  if (cambio < 0) return { texto: `▼ ${Math.abs(cambio)}% vs. periodo anterior`, clase: 'bajo' };
  return { texto: 'Sin cambio vs. periodo anterior', clase: 'neutral' };
}

function dona(items, etiquetas) {
  if (!items.length) return '<p class="vacio">Sin datos en este periodo</p>';
  let acumulado = 0;
  const segmentos = items.map((it, i) => {
    const color = PALETA_DONA[i % PALETA_DONA.length];
    const desde = acumulado;
    acumulado += it.pct;
    return `${color} ${desde}% ${i === items.length - 1 ? 100 : acumulado}%`;
  }).join(', ');
  const leyenda = items.map((it, i) => `
    <div class="leyenda-item">
      <span class="punto" style="background:${PALETA_DONA[i % PALETA_DONA.length]}"></span>
      <span class="etq">${escapar(etiquetas[it.clave] || it.clave)}</span>
      <span class="pct">${it.pct}%</span>
    </div>`).join('');
  return `<div class="dona" style="--dona-grad: ${segmentos};"></div><div class="leyenda">${leyenda}</div>`;
}

function pintarDashboard() {
  const d = calcularDashboard(ordenesCargadas, rangoDashboard);
  const tendencia = tendenciaTexto(d.completadasPeriodo, d.completadasPeriodoPrevio);
  const etiquetaPeriodo = ETIQUETAS_RANGO[rangoDashboard];

  $('#franja-kpi').innerHTML = `
    <div class="kpi pendiente">
      <div class="num">${d.pendientes}</div>
      <div class="etiqueta">Pendientes</div>
      <div class="tendencia neutral">Órdenes por completar</div>
    </div>
    <div class="kpi completada">
      <div class="num">${d.completadasPeriodo}</div>
      <div class="etiqueta">Completadas (${etiquetaPeriodo})</div>
      <div class="tendencia ${tendencia.clase}">${tendencia.texto}</div>
    </div>
    <div class="kpi cobrar">
      <div class="num">${d.porCobrar}</div>
      <div class="etiqueta">Por cobrar</div>
      <div class="tendencia bajo">${d.porCobrar ? 'Necesitan seguimiento' : 'Al día'}</div>
    </div>
    <div class="kpi cobrada">
      <div class="num">${d.cobradas}</div>
      <div class="etiqueta">Cobradas, sin pagar</div>
      <div class="tendencia neutral">En proceso</div>
    </div>
    <div class="kpi pagada">
      <div class="num">${d.pagadas}</div>
      <div class="etiqueta">Pagadas (histórico)</div>
      <div class="tendencia neutral">Ciclo cerrado</div>
    </div>
    <div class="kpi total">
      <div class="num">${d.total}</div>
      <div class="etiqueta">Órdenes totales</div>
      <div class="tendencia neutral">Desde el inicio</div>
    </div>`;

  const maxMes = Math.max(1, ...d.porMes.map(m => m.cuenta));
  $('#barras-mensual').innerHTML = d.porMes.map((m, i) => `
    <div class="barra-mes ${i === d.porMes.length - 1 ? 'actual' : ''}">
      <div class="valor">${m.cuenta}</div>
      <div class="col" style="height:${Math.max(6, Math.round((m.cuenta / maxMes) * 100))}%"></div>
      <div class="mes">${m.etiqueta}</div>
    </div>`).join('');

  const maxTecnico = Math.max(1, ...d.porTecnico.map(t => t.cuenta));
  $('#lista-tecnicos').innerHTML = d.porTecnico.length
    ? d.porTecnico.map(t => `
      <div class="fila-tecnico">
        <span class="nombre">${escapar(t.nombre)}</span>
        <div class="pista"><div class="relleno" style="width:${Math.round((t.cuenta / maxTecnico) * 100)}%"></div></div>
        <span class="n">${t.cuenta}</span>
      </div>`).join('')
    : '<p class="vacio">Sin órdenes completadas en este periodo</p>';

  $('#lista-cobrar-dashboard').innerHTML = d.porCobrarLista.length
    ? d.porCobrarLista.map(o => {
      const dias = Math.max(0, Math.floor((Date.now() - new Date(o.completed_at)) / 86400000));
      return `
        <div class="fila-cobrar">
          <span><span class="cliente">${escapar(o.cliente_nombre)}</span><span class="folio">${escapar(o.folio)}</span></span>
          <span class="dias ${dias > 5 ? 'viejo' : 'reciente'}">${dias} día${dias === 1 ? '' : 's'}</span>
        </div>`;
    }).join('')
    : '<p class="vacio">No hay órdenes por cobrar</p>';

  $('#dona-servicios').innerHTML = dona(d.servicios, TIPOS_SERVICIO);
  $('#dona-tipo-cliente').innerHTML = dona(d.tipoCliente, TIPOS_CLIENTE);
}

async function renderDashboard() {
  mostrarVista('vista-dashboard');
  const hashEsperado = location.hash;
  const ordenes = await datos.listarOrdenes();
  if (location.hash !== hashEsperado) return;
  ordenesCargadas = ordenes;
  pintarDashboard();
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
    $('#chk-sin-firma-cliente').checked = false;
    $('#autoriza-nombre').value = '';
    mostrarModoFirmaCliente(false);
    pads = {
      tecnico: crearPad(document.getElementById('firma-tecnico')),
      cliente: crearPad(document.getElementById('firma-cliente'))
    };
  } else {
    $('#select-estatus-cobro').value = o.estatus_cobro || '';
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

// En celular, Pendientes/Completadas se navegan con este segmentado en vez
// de ver las dos secciones apiladas; en escritorio no se ve (sigue el
// kanban de columnas lado a lado, sin este control).
$('.segmentado-lista').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-segmento-lista]');
  if (!boton) return;
  document.querySelectorAll('.segmentado-lista .rango-boton').forEach(b => b.classList.toggle('activo', b === boton));
  const activo = boton.dataset.segmentoLista;
  $('#vista-lista .col-pendiente').classList.toggle('oculto-en-movil', activo !== 'pendientes');
  $('#vista-lista .col-completada').classList.toggle('oculto-en-movil', activo !== 'completadas');
});

// El input de prioridad vive dentro de la tarjeta, que es un <a> a la orden;
// sin preventDefault() aquí, tocarlo igual dispara la navegación del enlace
// (stopPropagation por sí solo no cancela esa acción por default).
$('#lista-pendientes').addEventListener('click', (e) => {
  if (e.target.closest('.prioridad-orden')) {
    e.preventDefault();
    e.stopPropagation();
  }
});

$('#lista-pendientes').addEventListener('change', async (e) => {
  const input = e.target.closest('.prioridad-orden');
  if (!input) return;
  const id = input.dataset.id;
  const n = Math.trunc(Number(input.value));
  const prioridad = input.value.trim() && Number.isFinite(n) && n > 0 ? n : null;
  input.disabled = true;
  try {
    await datos.actualizarOrden(id, { prioridad });
    ordenesCargadas = ordenesCargadas.map(o => (o.id === id ? { ...o, prioridad } : o));
    pintarListas(filtrarOrdenes(ordenesCargadas, $('#buscador').value));
  } catch {
    alert('No se pudo guardar el orden de trabajo. Revisa tu conexión e intenta de nuevo.');
    pintarListas(filtrarOrdenes(ordenesCargadas, $('#buscador').value));
  } finally {
    input.disabled = false;
  }
});

$('#vista-dashboard .selector-rango').addEventListener('click', (e) => {
  const boton = e.target.closest('.rango-boton');
  if (!boton) return;
  rangoDashboard = boton.dataset.rango;
  document.querySelectorAll('#vista-dashboard .rango-boton').forEach(b => b.classList.toggle('activo', b === boton));
  pintarDashboard();
});

$('#buscador-clientes').addEventListener('input', () => {
  pintarVistaClientesActual(filtrarClientes(clientesVistaCargados, $('#buscador-clientes').value));
});

$('#vista-clientes .selector-vista-clientes').addEventListener('click', (e) => {
  const boton = e.target.closest('.rango-boton');
  if (!boton) return;
  vistaClientesActual = boton.dataset.vista;
  document.querySelectorAll('#vista-clientes .rango-boton').forEach(b => b.classList.toggle('activo', b === boton));
  $('#lista-clientes-vista').classList.toggle('oculto', vistaClientesActual !== 'tarjetas');
  $('#tabla-clientes-vista').classList.toggle('oculto', vistaClientesActual !== 'tabla');
  pintarVistaClientesActual(ultimosClientesFiltrados);
});

$('#cliente-nombre-nueva').addEventListener('input', () => {
  const nombre = $('#cliente-nombre-nueva').value.trim().toLowerCase();
  const cliente = nombre && clientesNuevaCargados.find(c => c.nombre.trim().toLowerCase() === nombre);
  if (!cliente) { ocultarSelectorDireccion(); return; }
  if (cliente.telefono) $('#form-nueva [name="cliente_telefono"]').value = cliente.telefono;
  const direcciones = cliente.direcciones || [];
  if (direcciones.length <= 1) {
    ocultarSelectorDireccion();
    if (direcciones.length === 1) $('#form-nueva [name="cliente_direccion"]').value = direcciones[0].direccion;
  } else {
    $('#select-direccion-nueva').replaceChildren(...direcciones.map(d => {
      const opt = document.createElement('option');
      opt.value = d.direccion;
      opt.textContent = d.direccion;
      return opt;
    }));
    $('#campo-direccion-guardada').classList.remove('oculto');
    $('#form-nueva [name="cliente_direccion"]').value = direcciones[0].direccion;
  }
});

$('#select-direccion-nueva').addEventListener('change', (e) => {
  $('#form-nueva [name="cliente_direccion"]').value = e.target.value;
});

$('#btn-agregar-material-nueva').addEventListener('click', () => {
  $('#filas-materiales-nueva').appendChild(filaMaterial());
});

$('#btn-agregar-material-cliente-nueva').addEventListener('click', () => {
  $('#filas-materiales-cliente-nueva').appendChild(filaMaterial());
});

$('#form-nueva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const d = Object.fromEntries(form);
  d.servicios = form.getAll('servicios');
  d.materiales = limpiarMateriales(leerFilasMateriales('filas-materiales-nueva'));
  d.materiales_cliente = limpiarMateriales(leerFilasMateriales('filas-materiales-cliente-nueva'));
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
  datos.registrarClienteDesdeOrden(d).catch(err => console.error(err));
  e.target.reset();
  $('#filas-materiales-nueva').replaceChildren(...filasMateriales([]));
  $('#filas-materiales-cliente-nueva').replaceChildren(...filasMateriales([]));
  ocultarSelectorDireccion();
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
  const esCompletada = o.estado === 'completada';
  $('#campo-trabajo-realizado-editar').classList.toggle('oculto', !esCompletada);
  form.trabajo_realizado.value = esCompletada ? (o.trabajo_realizado || '') : '';
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
  if (ordenActual.estado === 'completada') {
    d.trabajo_realizado = d.trabajo_realizado?.trim();
    if (!d.trabajo_realizado) return mostrarError('error-editar', 'Describe el trabajo realizado');
  } else {
    delete d.trabajo_realizado;
  }
  limpiarError('error-editar');
  d.materiales = limpiarMateriales(leerFilasMateriales('filas-materiales-editar'));
  d.materiales_cliente = limpiarMateriales(leerFilasMateriales('filas-materiales-cliente-editar'));
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
  const anterior = ordenActual.estatus_cobro || '';
  const nuevo = e.target.value || null;
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

$('#chk-sin-firma-cliente').addEventListener('change', (e) => {
  mostrarModoFirmaCliente(e.target.checked);
  if (e.target.checked) pads?.cliente?.limpiar();
  else $('#autoriza-nombre').value = '';
});

$('#btn-pdf').addEventListener('click', () => compartirPdf(ordenActual));

$('#btn-eliminar-orden').addEventListener('click', async () => {
  const o = ordenActual;
  limpiarError('error-eliminar');
  if (!confirm(`¿Borrar la orden ${o.folio} de ${o.cliente_nombre}? Esto no se puede deshacer.`)) return;
  const boton = $('#btn-eliminar-orden');
  boton.disabled = true;
  try {
    await datos.eliminarOrden(o.id);
    navegar('#/');
  } catch {
    mostrarError('error-eliminar', 'No se pudo borrar. Revisa tu conexión e intenta de nuevo.');
  } finally {
    boton.disabled = false;
  }
});

$('#form-completar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sinFirmaCliente = $('#chk-sin-firma-cliente').checked;
  const cierre = {
    trabajo_realizado: $('#trabajo-realizado').value,
    materiales: limpiarMateriales(leerFilasMateriales('filas-materiales')),
    materiales_cliente: limpiarMateriales(leerFilasMateriales('filas-materiales-cliente')),
    firma_tecnico: pads.tecnico.vacia() ? null : pads.tecnico.imagen(),
    firma_cliente: sinFirmaCliente || pads.cliente.vacia() ? null : pads.cliente.imagen(),
    autoriza_nombre: sinFirmaCliente ? $('#autoriza-nombre').value.trim() || null : null
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
