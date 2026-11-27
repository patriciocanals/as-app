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

import { reachableFrom } from '../js/schedule.js';
test('reachableFrom: solo destinos con ruta, en ambos sentidos', () => {
  const cfg = [{ cls: 'Y', count: 10, layout: '3-3' }];
  const mk = (o, d) => ({ origin: o, dest: d, aircraft: { config: cfg } });
  const st = { routes: [mk('ADL', 'ASP'), mk('AKL', 'EZE'), mk('AKL', 'SYD'), { origin: 'AKL', dest: 'MEL', aircraft: { config: null } }] };
  assert.deepEqual(reachableFrom(st, 'AKL'), ['EZE', 'SYD']);
  assert.deepEqual(reachableFrom(st, 'ASP'), ['ADL']);
  assert.deepEqual(reachableFrom(st, 'MEL'), []);
});

import { fromText } from '../js/views/home.js';
const rc = (origin, dest, Y, createdAt) => ({ origin, dest, createdAt, prices: { Y, W: 0, B: 0, F: 0 } });

test('orden: la ruta publicada más recientemente va primero (rutas antiguas sin fecha: orden de la lista)', () => {
  const d = destinations([r('MAD', 'AAA'), r('MAD', 'BBB'), rc('MAD', 'CCC', 100, 5000), rc('MAD', 'DDD', 100, 9000)]);
  assert.deepEqual(d.map((x) => x.to), ['DDD', 'CCC', 'BBB', 'AAA']);
});

test('destino con varios orígenes: una sola tarjeta con todos los orígenes y el precio más bajo', () => {
  const d = destinations([r('MAD', 'LHR', 150), r('BCN', 'LHR', 90), r('LIS', 'LHR', 120)]);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].froms.map((f) => f.code), ['BCN', 'LIS', 'MAD']);
  assert.equal(d[0].price, 90);
});

test('fromText: hasta 3 orígenes los nombra; con más, invita a consultar', () => {
  const c = (x) => ({ MAD: 'Madrid', BCN: 'Barcelona', LIS: 'Lisboa', OPO: 'Oporto' }[x]);
  assert.equal(fromText([{ code: 'MAD' }], c), 'desde Madrid');
  assert.equal(fromText([{ code: 'MAD' }, { code: 'BCN' }, { code: 'LIS' }], c), 'desde Madrid, Barcelona y Lisboa');
  assert.match(fromText([{ code: 'MAD' }, { code: 'BCN' }, { code: 'LIS' }, { code: 'OPO' }], c), /Varios orígenes/);
});

test('hub destacado: tiene su propia tarjeta y se llega desde los destinos de sus rutas', () => {
  const routes = [rc('ADL', 'ASP', 100, 1), rc('ADL', 'MEL', 80, 2)];
  assert.deepEqual(codes(destinations(routes)), ['ASP', 'MEL']);
  const d = destinations(routes, ['ADL']);
  assert.deepEqual(codes(d), ['ADL', 'ASP', 'MEL']);
  const adl = d.find((x) => x.to === 'ADL');
  assert.deepEqual(adl.froms.map((f) => f.code), ['MEL', 'ASP']); assert.equal(adl.hub, true);
  assert.deepEqual(destinations(routes, ['XXX']).map((x) => x.to).sort(), ['ASP', 'MEL']); // no es hub: se ignora
});
