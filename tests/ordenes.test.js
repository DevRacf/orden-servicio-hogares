import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, limpiarMateriales, validarCierre,
  ordenarParaLista, formatearFecha
} from '../js/ordenes.js';

test('validarNuevaOrden acepta una orden completa', () => {
  const r = validarNuevaOrden({
    cliente_nombre: 'Juan Pérez',
    cliente_direccion: 'Av. Siempre Viva 123',
    tipo_cliente: 'hogar',
    tipo_servicio: 'camaras',
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

test('formatearFecha regresa vacío sin fecha y texto legible con fecha', () => {
  assert.equal(formatearFecha(null), '');
  assert.match(formatearFecha('2026-07-14T12:00:00Z'), /2026/);
});

test('las etiquetas cubren todos los valores del esquema', () => {
  assert.deepEqual(Object.keys(TIPOS_SERVICIO),
    ['camaras', 'audio', 'internet', 'pantallas', 'mantenimiento', 'otro']);
  assert.deepEqual(Object.keys(TIPOS_CLIENTE), ['hogar', 'empresa']);
});
