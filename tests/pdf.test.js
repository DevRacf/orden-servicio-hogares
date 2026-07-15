import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seccionesPdf } from '../js/pdf.js';

const orden = {
  folio: 'OS-0007',
  cliente_nombre: 'Ferretería El Martillo',
  cliente_telefono: '555 123 4567',
  cliente_direccion: 'Calle Hidalgo 45, Centro',
  tipo_cliente: 'empresa',
  servicios: ['camaras', 'internet'],
  tecnico: 'Carlos Ramírez',
  created_at: '2026-07-10T15:00:00Z',
  completed_at: '2026-07-14T18:30:00Z'
};

test('seccionesPdf arma los pares etiqueta/valor con etiquetas legibles', () => {
  const secciones = seccionesPdf(orden);
  const mapa = Object.fromEntries(secciones);
  assert.equal(mapa['Cliente'], 'Ferretería El Martillo');
  assert.equal(mapa['Tipo de cliente'], 'Empresa');
  assert.equal(mapa['Servicios'], 'Cámaras, Internet');
  assert.equal(mapa['Técnico'], 'Carlos Ramírez');
  assert.match(mapa['Fecha de cierre'], /2026/);
});

test('seccionesPdf usa guion para teléfono vacío', () => {
  const mapa = Object.fromEntries(seccionesPdf({ ...orden, cliente_telefono: null }));
  assert.equal(mapa['Teléfono'], '—');
});

test('seccionesPdf junta un solo servicio sin coma de sobra', () => {
  const mapa = Object.fromEntries(seccionesPdf({ ...orden, servicios: ['pantallas'] }));
  assert.equal(mapa['Servicios'], 'Pantallas');
});

test('seccionesPdf usa guion si no hay servicios', () => {
  const mapa = Object.fromEntries(seccionesPdf({ ...orden, servicios: [] }));
  assert.equal(mapa['Servicios'], '—');
});
