import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, limpiarMateriales, validarCierre,
  ordenarParaLista, formatearFecha, etiquetasServicios, filtrarOrdenes
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

test('ordenarParaLista agrupa las completadas por estatus de cobro', () => {
  const ordenes = [
    { id: 'a', estado: 'completada', completed_at: '2026-07-01T10:00:00Z', estatus_cobro: 'por_cobrar' },
    { id: 'b', estado: 'completada', completed_at: '2026-07-02T10:00:00Z', estatus_cobro: 'cobrada' },
    { id: 'c', estado: 'completada', completed_at: '2026-07-03T10:00:00Z', estatus_cobro: 'pagada' },
    // sin estatus_cobro (órdenes de antes de que existiera el campo): cuentan como por cobrar
    { id: 'd', estado: 'completada', completed_at: '2026-07-04T10:00:00Z' },
    { id: 'e', estado: 'pendiente', created_at: '2026-07-05T10:00:00Z' }
  ];
  const { porCobrar, cobradas, pagadas } = ordenarParaLista(ordenes);
  assert.deepEqual(porCobrar.map(o => o.id), ['d', 'a']);
  assert.deepEqual(cobradas.map(o => o.id), ['b']);
  assert.deepEqual(pagadas.map(o => o.id), ['c']);
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
