import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, parseHM, formatHM, suggestRefuel, autoSchedule } from '../js/calc.js';
import { flightsOn, seatMap, weekday, addDays, availability, isConfigured } from '../js/schedule.js';
import { AIRCRAFT, AIRCRAFT_GROUPS, aircraftById } from '../js/aircraft.js';
import { normalize } from '../js/store.js';

const hm = parseHM;

test('parseHM / formatHM', () => {
  assert.equal(hm('1:50'), 110);
  assert.equal(formatHM(295), '4:55');
});

test('ejemplo del documento: ruta diaria (RT 4:55, 4 rotaciones, 18/9/5/3 con 1 avión)', () => {
  const r = calculate({ t1: hm('1:50'), t2: hm('2:00'), r1: hm('1:00'), demand: { Y: 500, W: 250, B: 125, F: 62 } });
  assert.equal(r.rt, hm('4:55'));
  assert.equal(r.mode, 'daily');
  assert.equal(r.perPeriod, 4);
  const s = (n) => Object.values(r.scenarios[n - 1].seats);
  assert.deepEqual(s(1), [18, 9, 5, 3]);
  assert.deepEqual(s(2), [9, 5, 3, 2]);
  assert.deepEqual(s(3), [6, 3, 2, 1]);
  assert.deepEqual(s(6), [3, 2, 1, 1]);
});

test('ejemplo del documento: ruta semanal (RT 29:30 -> 5 por semana, 1277/194/265/29)', () => {
  const r = calculate({ t1: hm('13:50'), t2: hm('13:05'), r1: hm('2:30'), demand: { Y: 6382, W: 967, B: 1324, F: 144 } });
  assert.equal(r.rt, hm('29:30'));
  assert.equal(r.mode, 'weekly');
  assert.equal(r.perPeriod, 5);
  assert.deepEqual(Object.values(r.scenarios[0].seats), [1277, 194, 265, 29]);
  assert.deepEqual(Object.values(r.scenarios[1].seats), [639, 97, 133, 15]); // N=2 -> /10
});

test('sin decimales por redondeo hacia arriba en división exacta', () => {
  const r = calculate({ t1: hm('2:00'), t2: hm('2:00'), r1: hm('1:00'), demand: { Y: 700, W: 0, B: 0, F: 0 } });
  // RT 5:05 -> 4 rotaciones; 700/7/4 = 25 exacto
  assert.equal(r.scenarios[0].seats.Y, 25);
});

test('errores', () => {
  assert.ok(calculate({ t1: 0, t2: 100, r1: 60 }).error);
  assert.ok(calculate({ t1: 6000, t2: 6000, r1: 60 }).error);
});

test('sugerencia de refuel', () => {
  assert.equal(suggestRefuel(hm('1:50'), hm('2:00')).minutes, 60);
  assert.equal(suggestRefuel(hm('12:00'), hm('13:40')).minutes, 150);
  assert.equal(suggestRefuel(hm('7:00'), hm('7:00')).minutes, 120);
});

test('autoSchedule diario y semanal', () => {
  const d = autoSchedule({ mode: 'daily', perPeriod: 4, aircraft: 1, rt: 295 });
  assert.equal(d.length, 4);
  assert.ok(d.every((x) => x.days.length === 7));
  assert.equal(d[0].outNo, 100);
  assert.equal(d[0].retNo, 101);
  const w = autoSchedule({ mode: 'weekly', perPeriod: 5, aircraft: 1, rt: 1770 });
  assert.equal(w.length, 5);
  assert.equal(new Set(w.map((x) => x.days[0])).size, 5);
});

// ---------- horarios ----------
const state = {
  airline: { code: 'AW' },
  routes: [{
    id: 'r1', origin: 'MAD', dest: 'LHR', t1: 145,
    aircraft: { model: 'a320-200', name: 'Airbus A320-200', config: [{ cls: 'F', count: 2, layout: '1-1' }, { cls: 'B', count: 4, layout: '1-1' }, { cls: 'W', count: 20, layout: '2-2' }, { cls: 'Y', count: 100, layout: '3-3' }] }, t2: 130, r1: 60, prices: { Y: 100 },
    rotations: [{ id: 'x', outNo: 100, retNo: 101, outDep: '22:00', days: [0] }], // lunes 22:00
  }],
  bookings: [],
};

test('weekday: 2026-11-30 es lunes', () => assert.equal(weekday('2026-11-30'), 0));

test('vuelos del día: ida el lunes, vuelta cruzando medianoche', () => {
  assert.equal(flightsOn(state, 'MAD', 'LHR', '2026-11-30').length, 1);
  assert.equal(flightsOn(state, 'MAD', 'LHR', '2026-12-01').length, 0);
  const f = flightsOn(state, 'MAD', 'LHR', '2026-11-30')[0];
  assert.equal(f.arrDayOffset, 1); // 22:00 + 2:25 -> 00:25 del día siguiente
  // llegada 00:25 + refuel 1:00 -> sale 01:25 del martes
  const back = flightsOn(state, 'LHR', 'MAD', '2026-12-01');
  assert.equal(back.length, 1);
  assert.equal(back[0].number, 'AW101');
  assert.equal(back[0].depMin, 85);
});

test('mapa de asientos: F2B4W20Y100 -> F fila 1, B 2-3, W empieza en fila 4', () => {
  const rows = seatMap(state.routes[0].aircraft.config);
  assert.deepEqual(rows[0].seats.map((s) => s.id), ['1A', '1B']);
  assert.equal(rows.find((r) => r.cls === 'W').row, 4);
  assert.equal(rows.flatMap((r) => r.seats).length, 126);
});

test('disponibilidad descuenta reservas', () => {
  const f = flightsOn(state, 'MAD', 'LHR', '2026-11-30')[0];
  const st = { ...state, bookings: [{ segments: [{ key: f.key, seats: ['1A'] }] }] };
  assert.equal(availability(st, f, 'F'), 1);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

// ---------- versión 2 ----------
test('ruta sin configuración de asientos queda pendiente y no se vende', () => {
  const pending = { ...state, routes: [{ ...state.routes[0], aircraft: { model: 'a320-200', name: 'Airbus A320-200', config: null } }] };
  assert.equal(isConfigured(pending.routes[0].aircraft.config), false);
  assert.equal(flightsOn(pending, 'MAD', 'LHR', '2026-11-30').length, 0);
  assert.equal(isConfigured([{ cls: 'Y', count: 0, layout: '3-3' }]), false);
  assert.equal(isConfigured(state.routes[0].aircraft.config), true);
});

test('catálogo: 51 modelos de la lista, ids únicos, ninguno con configuración por defecto', () => {
  assert.equal(AIRCRAFT.length, 51);
  assert.equal(new Set(AIRCRAFT.map((a) => a.id)).size, 51);
  assert.deepEqual(AIRCRAFT_GROUPS.map((g) => g.models.length), [23, 6, 11, 2, 4, 3, 2]);
  assert.ok(AIRCRAFT.every((a) => !('config' in a) && !('seats' in a)));
  assert.equal(aircraftById('a350-1000ulr').name, 'Airbus A350-1000 ULR');
  assert.equal(aircraftById('q400').group, 'De Havilland Canada');
});

test('normalize: datos de la v1 (flota aparte) se convierten al avión dentro de la ruta', () => {
  const v1 = {
    airline: { name: 'Vieja', code: 'VI' },
    aircraft: [{ id: 'a1', name: 'Airbus A320', config: [{ cls: 'Y', count: 150, layout: '3-3' }] }],
    routes: [{ id: 'r', origin: 'MAD', dest: 'BCN', aircraftId: 'a1', t1: 60, t2: 60, r1: 60, prices: {}, rotations: [] }],
  };
  const n = normalize(v1);
  assert.equal(n.routes[0].aircraft.name, 'Airbus A320');
  assert.equal(n.routes[0].aircraft.config[0].count, 150);
  assert.equal(n.routes[0].aircraftId, undefined);
  assert.equal(n.airline.currency, '€'); // rellena valores que faltan
  assert.deepEqual(normalize({}).routes, []);
});
