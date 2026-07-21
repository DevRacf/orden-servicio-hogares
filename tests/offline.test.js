import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarACola, aplicarCierresPendientes, quitarDeCola } from '../js/offline-logica.js';

test('agregarACola agrega y reemplaza el cierre de la misma orden', () => {
  const c1 = agregarACola([], 'a', { trabajo_realizado: 'x' }, 1000);
  assert.equal(c1.length, 1);
  const c2 = agregarACola(c1, 'b', { trabajo_realizado: 'y' }, 2000);
  assert.equal(c2.length, 2);
  const c3 = agregarACola(c2, 'a', { trabajo_realizado: 'z' }, 3000);
  assert.equal(c3.length, 2);
  assert.equal(c3.find(c => c.ordenId === 'a').cierre.trabajo_realizado, 'z');
});

test('aplicarCierresPendientes marca completada + porEnviar solo a las encoladas', () => {
  const ordenes = [
    { id: 'a', estado: 'pendiente', trabajo_realizado: null },
    { id: 'b', estado: 'pendiente' }
  ];
  const cola = [{
    ordenId: 'a',
    cierre: { trabajo_realizado: 'Listo', materiales: [{ cantidad: 1, descripcion: 'Cable' }] },
    timestamp: 1700000000000
  }];
  const resultado = aplicarCierresPendientes(ordenes, cola);
  assert.equal(resultado[0].estado, 'completada');
  assert.equal(resultado[0].porEnviar, true);
  assert.equal(resultado[0].trabajo_realizado, 'Listo');
  assert.match(resultado[0].completed_at, /^\d{4}-/);
  assert.equal(resultado[1].estado, 'pendiente');
  assert.equal(resultado[1].porEnviar, undefined);
});

test('aplicarCierresPendientes con cola vacía regresa las órdenes tal cual', () => {
  const ordenes = [{ id: 'a', estado: 'pendiente' }];
  assert.equal(aplicarCierresPendientes(ordenes, []), ordenes);
});

test('quitarDeCola remueve solo la orden indicada', () => {
  const cola = [{ ordenId: 'a' }, { ordenId: 'b' }];
  assert.deepEqual(quitarDeCola(cola, 'a').map(c => c.ordenId), ['b']);
});
