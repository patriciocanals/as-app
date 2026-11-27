import test from 'node:test';
import assert from 'node:assert/strict';
import { countryList, autoAirportName } from '../js/airports.js';

test('países por nombre: España, Australia, Nueva Zelanda y sin códigos raros', () => {
  const l = countryList();
  const by = Object.fromEntries(l.map((c) => [c.cc, c.name]));
  assert.equal(by.ES, 'España'); assert.equal(by.AU, 'Australia'); assert.equal(by.NZ, 'Nueva Zelanda');
  assert.ok(l.length > 200 && l.length < 280, `países: ${l.length}`);
  assert.ok(!by.ZZ && !by.AA && !by.EU);
});
test('nombre automático de aeropuerto', () => {
  assert.equal(autoAirportName('Adelaida', 'intl'), 'Aeropuerto Internacional de Adelaida');
  assert.equal(autoAirportName('Adelaida', 'apt'), 'Aeropuerto de Adelaida');
});
