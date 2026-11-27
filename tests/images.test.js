import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCommons, pickWikiSummary, UNWANTED, isLandscape } from '../js/images.js';

const page = (title, w, h, mime = 'image/jpeg', index = 1) => ({ title, index, imageinfo: [{ width: w, height: h, mime, thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(title)}/1280px-x.jpg` }] });
const resp = (...pages) => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [String(100 + i), p])) } });

test('filtra banderas, escudos, mapas y logos; acepta paisajes', () => {
  for (const bad of ['File:Flag of Barcelona.svg', 'File:Bandera de Barcelona.png', 'File:Escudo de Madrid.jpg', 'File:Coat of arms of Rome.jpg', 'File:Map of Lisbon.jpg', 'File:Logo ciudad.jpg', 'File:Mapa de Roma.jpg']) {
    assert.ok(UNWANTED.test(bad), bad);
  }
  for (const good of ['File:Barcelona skyline from Montjuïc.jpg', 'File:Plaza de Armas, Cusco.jpg', 'File:Iconic view of Paris.jpg', 'File:Sealand beach.jpg'.replace('Sealand', 'Sea land')]) {
    assert.ok(!UNWANTED.test(good), good);
  }
});

test('pickCommons: solo JPEG apaisados y grandes, sin banderas; prioriza título con la ciudad', () => {
  const urls = pickCommons(resp(
    page('File:Flag of Barcelona.jpg', 3000, 2000, 'image/jpeg', 1),
    page('File:Vertical tower.jpg', 2000, 3000, 'image/jpeg', 2),
    page('File:Small view.jpg', 800, 500, 'image/jpeg', 3),
    page('File:Diagram.svg', 3000, 2000, 'image/svg+xml', 4),
    page('File:Skyline sunset.jpg', 4000, 2500, 'image/jpeg', 5),
    page('File:Barcelona skyline.jpg', 4000, 2600, 'image/jpeg', 9),
  ), { prefer: 'Barcelona' });
  assert.equal(urls.length, 2);
  assert.ok(decodeURIComponent(urls[0]).includes('Barcelona skyline'), 'la que nombra la ciudad va primero aunque tenga peor ranking');
  assert.ok(decodeURIComponent(urls[1]).includes('Skyline sunset'));
  assert.deepEqual(pickCommons({}), []);
  assert.deepEqual(pickCommons(null), []);
});

test('isLandscape', () => {
  assert.ok(isLandscape(1600, 900)); assert.ok(!isLandscape(1000, 1000)); assert.ok(!isLandscape(4000, 1000)); assert.ok(!isLandscape(0, 0));
});

test('resumen de Wikipedia: descarta la bandera; no pide miniaturas mayores que el original', () => {
  // el caso real de Barcelona: la imagen del resumen era la bandera de la ciudad
  assert.equal(pickWikiSummary({
    thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a/Flag_of_Barcelona.svg/320px-Flag_of_Barcelona.svg.png' },
    originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/a/a/Flag_of_Barcelona.svg', width: 900, height: 600 },
  }), null);
  // foto grande: se pide 1200px
  assert.equal(pickWikiSummary({
    thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A320.jpg/320px-A320.jpg' },
    originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/A320.jpg', width: 3000, height: 2000 },
  }), 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A320.jpg/1200px-A320.jpg');
  // foto pequeña (800px): pedir 1200px daba error 400 y la flota salía sin imagen -> se usa el original
  assert.equal(pickWikiSummary({
    thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/ATR.jpg/320px-ATR.jpg' },
    originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/ATR.jpg', width: 800, height: 533 },
  }), 'https://upload.wikimedia.org/wikipedia/commons/a/ab/ATR.jpg');
  assert.equal(pickWikiSummary({}), null);
});

// ---------- regresión: fotos de otra ciudad (Sídney para Alice Springs) ----------
import { searchName, EN_NAMES } from '../js/airports.js';

test('require: la foto debe nombrar la ciudad (no sirve una genérica de Australia/Sídney)', () => {
  const r = resp(
    page('File:Sydney skyline at dusk.jpg', 4000, 2500, 'image/jpeg', 1),
    page('File:Australia outback panorama.jpg', 4000, 2000, 'image/jpeg', 2),
    page('File:Alice Springs from Anzac Hill.jpg', 4000, 2600, 'image/jpeg', 7),
  );
  const urls = pickCommons(r, { prefer: 'Alice Springs', require: ['Alice Springs'] });
  assert.equal(urls.length, 1);
  assert.ok(decodeURIComponent(urls[0]).includes('Alice Springs'));
  // sin ninguna foto que nombre la ciudad: no devuelve nada (pasa al siguiente método en vez de poner Sídney)
  assert.deepEqual(pickCommons(resp(page('File:Sydney skyline.jpg', 4000, 2500)), { require: ['Alice Springs'] }), []);
  // insensible a acentos y mayúsculas
  assert.equal(pickCommons(resp(page('File:BOGOTA centro.jpg', 4000, 2500)), { require: ['Bogotá'] }).length, 1);
  // varios nombres válidos (inglés o como se escribió)
  assert.equal(pickCommons(resp(page('File:London Eye.jpg', 4000, 2500)), { require: ['London', 'Londres'] }).length, 1);
});

test('nombres de búsqueda en inglés para ciudades con nombre español', () => {
  assert.equal(searchName('Londres'), 'London'); assert.equal(searchName('Nueva York'), 'New York');
  assert.equal(searchName('Alice Springs'), 'Alice Springs'); // ciudad personalizada: tal cual
  assert.ok(Object.keys(EN_NAMES).length > 60);
});

import { mentions, aircraftTerms } from '../js/images.js';
test('mentions: palabras completas (Nice no encaja en Venice) y modelos sin importar guiones', () => {
  assert.equal(mentions('File:Venice skyline.jpg', 'Nice'), false);
  assert.equal(mentions('File:Nice - Promenade.jpg', 'Nice'), true);
  assert.equal(mentions('File:Garuda Bombardier CRJ-1000 PK.jpg', 'CRJ1000', true), true);
  assert.equal(mentions('File:Airline CRJ-1000.jpg', 'CRJ100', true), false);
});
test('modelos parecidos no comparten foto: CRJ900/CRJ1000, A350-900/A350-1000, Q100/Q400, A220-100/300', () => {
  const pg = (t) => ({ query: { pages: { 1: { title: t, index: 1, imageinfo: [{ mime: 'image/jpeg', width: 4000, height: 2500, thumburl: 'u' }] } } } });
  const ok = (model, name, title) => pickCommons(pg(title), { require: aircraftTerms(model, name), squash: true }).length === 1;
  assert.ok(ok('crj1000', 'CRJ1000', 'File:Bombardier CRJ-1000 EI-X.jpg')); assert.ok(!ok('crj900', 'CRJ900', 'File:Bombardier CRJ-1000 EI-X.jpg'));
  assert.ok(ok('a350-1000', 'Airbus A350-1000', 'File:Airbus A350-1000 F-WMIL.jpg')); assert.ok(!ok('a350-900', 'Airbus A350-900', 'File:Airbus A350-1000 F-WMIL.jpg'));
  assert.ok(ok('q400', 'De Havilland Q400', 'File:Bombardier Dash 8 Q400 C-FSRF.jpg')); assert.ok(!ok('q100', 'De Havilland Q100', 'File:Bombardier Dash 8 Q400 C-FSRF.jpg'));
  assert.ok(ok('a220-300', 'Airbus A220-300', 'File:Airbus A220-300 (CS300) HB-JCA.jpg')); assert.ok(!ok('a220-100', 'Airbus A220-100', 'File:Airbus A220-300 (CS300) HB-JCA.jpg'));
});
