import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, limpiarMateriales, validarCierre,
  ordenarParaLista, formatearFecha, etiquetasServicios, filtrarOrdenes,
  calcularDashboard, filtrarClientes
} from '../js/ordenes.js';

test('validarNuevaOrden acepta una orden completa', () => {
  const r = validarNuevaOrden({
    cliente_nombre: 'Juan Pérez',
    cliente_direccion: 'Av. Siempre Viva 123',
    tipo_cliente: 'hogar',
    servicios: ['camaras'],
    tecnico: 'Carlos'
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test('validarNuevaOrden junta un error por cada campo obligatorio faltante', () => {
  const r = validarNuevaOrden({ cliente_nombre: '  ', tipo_cliente: 'oficina' });
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 5);
});

test('validarNuevaOrden exige al menos un servicio', () => {
  const base = {
    cliente_nombre: 'Juan Pérez',
    cliente_direccion: 'Av. Siempre Viva 123',
    tipo_cliente: 'hogar',
    tecnico: 'Carlos'
  };
  const sinServicios = validarNuevaOrden({ ...base, servicios: [] });
  assert.equal(sinServicios.ok, false);
  assert.ok(sinServicios.errores.includes('Selecciona al menos un servicio'));

  const servicioInvalido = validarNuevaOrden({ ...base, servicios: ['camaras', 'desconocido'] });
  assert.equal(servicioInvalido.ok, false);
  assert.ok(servicioInvalido.errores.includes('Selecciona al menos un servicio'));

  const conServicios = validarNuevaOrden({ ...base, servicios: ['audio', 'internet'] });
  assert.equal(conServicios.ok, true);
});

test('etiquetasServicios traduce claves a etiquetas legibles', () => {
  assert.deepEqual(etiquetasServicios(['camaras', 'internet']), ['Cámaras', 'Internet']);
  assert.deepEqual(etiquetasServicios(undefined), []);
  assert.deepEqual(etiquetasServicios(['camaras', 'desconocido']), ['Cámaras', 'desconocido']);
});

test('limpiarMateriales descarta filas vacías o inválidas y normaliza', () => {
  const filas = [
    { cantidad: '2', descripcion: ' Cámara domo 1080p ' },
    { cantidad: '', descripcion: '' },
    { cantidad: '0', descripcion: 'Cable UTP' },
    { cantidad: 'abc', descripcion: 'DVR' }
  ];
  assert.deepEqual(limpiarMateriales(filas), [
    { cantidad: 2, descripcion: 'Cámara domo 1080p' }
  ]);
  assert.deepEqual(limpiarMateriales(undefined), []);
});

test('validarCierre exige trabajo realizado y firma del cliente', () => {
  const r = validarCierre({ trabajo_realizado: ' ', firma_cliente: null });
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 2);
  const ok = validarCierre({
    trabajo_realizado: 'Instalación de 4 cámaras',
    firma_cliente: 'data:image/png;base64,xyz'
  });
  assert.equal(ok.ok, true);
});

test('ordenarParaLista separa por estado con las más recientes primero', () => {
  const ordenes = [
    { id: 'a', estado: 'completada', created_at: '2026-07-01T10:00:00Z', completed_at: '2026-07-02T10:00:00Z' },
    { id: 'b', estado: 'pendiente', created_at: '2026-07-03T10:00:00Z' },
    { id: 'c', estado: 'pendiente', created_at: '2026-07-05T10:00:00Z' },
    { id: 'd', estado: 'completada', created_at: '2026-07-01T09:00:00Z', completed_at: '2026-07-06T10:00:00Z' }
  ];
  const { pendientes, completadas } = ordenarParaLista(ordenes);
  assert.deepEqual(pendientes.map(o => o.id), ['c', 'b']);
  assert.deepEqual(completadas.map(o => o.id), ['d', 'a']);
});

test('ordenarParaLista agrupa las completadas por estatus de cobro, sin duplicar ninguna', () => {
  const ordenes = [
    { id: 'a', estado: 'completada', completed_at: '2026-07-01T10:00:00Z', estatus_cobro: 'por_cobrar' },
    { id: 'b', estado: 'completada', completed_at: '2026-07-02T10:00:00Z', estatus_cobro: 'cobrada' },
    { id: 'c', estado: 'completada', completed_at: '2026-07-03T10:00:00Z', estatus_cobro: 'pagada' },
    // sin estatus_cobro (recién completada, o de antes de que existiera el
    // campo): se queda solo en "completadas" hasta que oficina la mueva.
    { id: 'd', estado: 'completada', completed_at: '2026-07-04T10:00:00Z' },
    { id: 'e', estado: 'pendiente', created_at: '2026-07-05T10:00:00Z' }
  ];
  const { completadas, porCobrar, cobradas, pagadas } = ordenarParaLista(ordenes);
  assert.deepEqual(completadas.map(o => o.id), ['d']);
  assert.deepEqual(porCobrar.map(o => o.id), ['a']);
  assert.deepEqual(cobradas.map(o => o.id), ['b']);
  assert.deepEqual(pagadas.map(o => o.id), ['c']);
});

test('ordenarParaLista para técnicos muestra todo lo completado, sin importar el cobro', () => {
  const ordenes = [
    { id: 'a', estado: 'completada', completed_at: '2026-07-01T10:00:00Z', estatus_cobro: 'por_cobrar' },
    { id: 'b', estado: 'completada', completed_at: '2026-07-02T10:00:00Z', estatus_cobro: 'cobrada' },
    { id: 'c', estado: 'completada', completed_at: '2026-07-03T10:00:00Z', estatus_cobro: 'pagada' },
    { id: 'd', estado: 'completada', completed_at: '2026-07-04T10:00:00Z' }
  ];
  const { completadas } = ordenarParaLista(ordenes, 'tecnico');
  // Los técnicos no ven las columnas de cobro, así que a ellos no se les debe
  // "perder" una orden nada más porque oficina ya la categorizó.
  assert.deepEqual(completadas.map(o => o.id), ['d', 'c', 'b', 'a']);
});

test('formatearFecha regresa vacío sin fecha y texto legible con fecha', () => {
  assert.equal(formatearFecha(null), '');
  assert.match(formatearFecha('2026-07-14T12:00:00Z'), /2026/);
});

test('las etiquetas cubren todos los valores del esquema', () => {
  assert.deepEqual(Object.keys(TIPOS_SERVICIO),
    ['camaras', 'audio', 'internet', 'pantallas', 'mantenimiento', 'otro']);
  assert.deepEqual(Object.keys(TIPOS_CLIENTE), ['hogar', 'empresa']);
});

test('calcularDashboard junta las cifras del panel de oficina', () => {
  const ahora = new Date('2026-08-15T12:00:00Z');
  const ordenes = [
    { id: 'p1', estado: 'pendiente', created_at: '2026-08-10T10:00:00Z' },
    { id: 'p2', estado: 'pendiente', created_at: '2026-08-12T10:00:00Z' },
    {
      id: 'c1', estado: 'completada', created_at: '2026-08-01T10:00:00Z', completed_at: '2026-08-05T10:00:00Z',
      estatus_cobro: 'por_cobrar', tecnico: 'Ana', servicios: ['camaras'], tipo_cliente: 'hogar'
    },
    {
      id: 'c2', estado: 'completada', created_at: '2026-08-02T10:00:00Z', completed_at: '2026-08-06T10:00:00Z',
      estatus_cobro: 'cobrada', tecnico: 'Ana', servicios: ['audio'], tipo_cliente: 'empresa'
    },
    {
      id: 'c3', estado: 'completada', created_at: '2026-08-03T10:00:00Z', completed_at: '2026-08-07T10:00:00Z',
      estatus_cobro: 'pagada', tecnico: 'Beto', servicios: ['camaras', 'internet'], tipo_cliente: 'hogar'
    },
    {
      // fuera del periodo de 30 días, pero dentro del periodo anterior equivalente
      id: 'c4', estado: 'completada', created_at: '2026-06-25T10:00:00Z', completed_at: '2026-07-01T10:00:00Z',
      estatus_cobro: 'pagada', tecnico: 'Beto', servicios: ['audio'], tipo_cliente: 'hogar'
    }
  ];

  const d = calcularDashboard(ordenes, '30d', ahora);

  assert.equal(d.pendientes, 2);
  assert.equal(d.total, 6);
  assert.equal(d.porCobrar, 1);
  assert.equal(d.cobradas, 1);
  assert.equal(d.pagadas, 2);
  assert.equal(d.completadasPeriodo, 3);
  assert.equal(d.completadasPeriodoPrevio, 1);

  assert.deepEqual(d.porTecnico, [{ nombre: 'Ana', cuenta: 2 }, { nombre: 'Beto', cuenta: 1 }]);
  assert.deepEqual(d.porCobrarLista.map(o => o.id), ['c1']);

  assert.deepEqual(d.servicios, [
    { clave: 'camaras', cuenta: 2, pct: 50 },
    { clave: 'audio', cuenta: 1, pct: 25 },
    { clave: 'internet', cuenta: 1, pct: 25 }
  ]);
  assert.deepEqual(d.tipoCliente, [
    { clave: 'hogar', cuenta: 2, pct: 67 },
    { clave: 'empresa', cuenta: 1, pct: 33 }
  ]);

  assert.equal(d.porMes.length, 6);
  assert.deepEqual(d.porMes.map(m => m.cuenta), [0, 0, 0, 1, 0, 5]);
  assert.equal(d.porMes.at(-1).mes, 7); // agosto (0-indexado)
});

test('calcularDashboard con "anio" usa lo que va del año como ventana', () => {
  const ahora = new Date('2026-03-10T12:00:00Z'); // 68 días desde el 1 de enero
  const ordenes = [
    { id: 'a', estado: 'completada', created_at: '2026-02-01T10:00:00Z', completed_at: '2026-02-01T10:00:00Z', estatus_cobro: 'pagada' },
    { id: 'b', estado: 'completada', created_at: '2025-12-01T10:00:00Z', completed_at: '2025-12-01T10:00:00Z', estatus_cobro: 'pagada' }
  ];
  const d = calcularDashboard(ordenes, 'anio', ahora);
  assert.equal(d.completadasPeriodo, 1); // solo la de este año
  assert.equal(d.completadasPeriodoPrevio, 1); // la de diciembre cae en la ventana equivalente del año pasado
});

test('calcularDashboard no truena con una lista vacía', () => {
  const d = calcularDashboard([], '7d', new Date('2026-08-15T12:00:00Z'));
  assert.equal(d.total, 0);
  assert.deepEqual(d.porTecnico, []);
  assert.deepEqual(d.porCobrarLista, []);
  assert.deepEqual(d.servicios, []);
  assert.deepEqual(d.tipoCliente, []);
  assert.equal(d.porMes.length, 6);
});

test('filtrarClientes busca por nombre o teléfono, sin acentos ni mayúsculas', () => {
  const clientes = [
    { id: 'a', nombre: 'Familia Gómez Herrera', telefono: '3312345678' },
    { id: 'b', nombre: 'Ferretería El Martillo', telefono: '3398765432' },
    { id: 'c', nombre: 'Consultorio Dental Sonrisa', telefono: null }
  ];
  assert.deepEqual(filtrarClientes(clientes, 'gomez').map(c => c.id), ['a']);
  assert.deepEqual(filtrarClientes(clientes, 'FERRETERIA').map(c => c.id), ['b']);
  assert.deepEqual(filtrarClientes(clientes, '3398').map(c => c.id), ['b']);
  assert.deepEqual(filtrarClientes(clientes, '  '), clientes);
  assert.deepEqual(filtrarClientes(clientes, 'zzz'), []);
});

test('filtrarOrdenes busca por cliente o folio, sin acentos ni mayúsculas', () => {
  const ordenes = [
    { id: 'a', folio: 'OS-0001', cliente_nombre: 'Familia Gómez Herrera' },
    { id: 'b', folio: 'OS-0002', cliente_nombre: 'Ferretería El Martillo' },
    { id: 'c', folio: 'OS-0003', cliente_nombre: 'Consultorio Dental Sonrisa' }
  ];
  assert.deepEqual(filtrarOrdenes(ordenes, 'gomez').map(o => o.id), ['a']);
  assert.deepEqual(filtrarOrdenes(ordenes, 'FERRETERIA').map(o => o.id), ['b']);
  assert.deepEqual(filtrarOrdenes(ordenes, 'os-0003').map(o => o.id), ['c']);
  assert.deepEqual(filtrarOrdenes(ordenes, '  '), ordenes);
  assert.deepEqual(filtrarOrdenes(ordenes, ''), ordenes);
  assert.deepEqual(filtrarOrdenes(ordenes, 'zzz'), []);
});
