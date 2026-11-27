import test from 'node:test';
import assert from 'node:assert/strict';
import { destinations, hubOf } from '../js/views/home.js';

const r = (origin, dest, Y = 100) => ({ origin, dest, prices: { Y, W: 0, B: 0, F: 0 } });
const codes = (d) => d.map((x) => x.to).sort();

test('el origen de cada ruta es un hub y no se anuncia: solo el destino', () => {
  const d = destinations([r('AKL', 'EZE'), r('ADL', 'ASP')]);
  assert.deepEqual(codes(d), ['ASP', 'EZE']);
  assert.equal(d.find((x) => x.to === 'ASP').from, 'ADL');
});

test('caso reportado: ADL-ASP con otro hub más grande NO duplica (antes salían ADL y ASP)', () => {
  const routes = [r('AKL', 'EZE'), r('AKL', 'SYD'), r('AKL', 'SCL'), r('ADL', 'ASP')];
  assert.equal(hubOf(routes), 'AKL');
  assert.deepEqual(codes(destinations(routes)), ['ASP', 'EZE', 'SCL', 'SYD']);
  assert.ok(!codes(destinations(routes)).includes('ADL'), 'ADL es hub: no se anuncia como destino');
});

test('multi-hub: un hub que también es destino de otra ruta no se anuncia', () => {
  assert.deepEqual(codes(destinations([r('MAD', 'BCN'), r('BCN', 'LHR')])), ['LHR']);
});

test('destino repetido: se queda el precio más bajo; rutas sin precio no se anuncian', () => {
  const d = destinations([r('MAD', 'LHR', 150), r('BCN', 'LHR', 90), { origin: 'MAD', dest: 'XXX', prices: { Y: 0 } }]);
  assert.equal(d.length, 1); assert.deepEqual([d[0].to, d[0].price, d[0].from], ['LHR', 90, 'BCN']);
});

test('rutas en ambos sentidos (A-B y B-A): no se queda sin destinos', () => {
  const d = destinations([r('MAD', 'LHR'), r('LHR', 'MAD'), r('MAD', 'CDG')]);
  assert.ok(d.length > 0);
});

test('hubOf: el aeropuerto con más rutas como origen', () => {
  assert.equal(hubOf([r('A', 'B'), r('C', 'D'), r('C', 'E')]), 'C');
  assert.equal(hubOf([]), undefined);
});
