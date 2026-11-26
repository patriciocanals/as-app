import * as store from '../store.js';
import { $, $$, esc, airport, airportOptions, networkAirports, flagImg, money, cityOf } from '../util.js';
import { todayISO, addDays, nextDateWithFlights } from '../schedule.js';
import { go } from '../nav.js';
import { setFlow } from '../flow.js';

let timer;

function destinations(state) {
  // Destinos reales de la compañía: cada extremo de ruta, con el precio "desde" más bajo
  const map = new Map();
  for (const r of state.routes) {
    for (const [from, to] of [[r.origin, r.dest], [r.dest, r.origin]]) {
      const price = Math.min(...Object.values(r.prices).filter((p) => p > 0));
      const cur = map.get(to);
      if (!cur || price < cur.price) map.set(to, { from, to, price });
    }
  }
  // Prioriza destinos que no son el hub principal
  const hubCount = {};
  state.routes.forEach((r) => { hubCount[r.origin] = (hubCount[r.origin] || 0) + 1; hubCount[r.dest] = (hubCount[r.dest] || 0) + 1; });
  const hub = Object.entries(hubCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  return [...map.values()].filter((d) => d.to !== hub);
}

export function render(root) {
  const state = store.get();
  const codes = networkAirports();
  // hub = aeropuerto con más rutas; es el origen por defecto
  const count = (c) => state.routes.filter((r) => r.origin === c || r.dest === c).length;
  const hub = [...codes].sort((a, b) => count(b) - count(a))[0];
  const firstDest = codes.find((c) => c !== hub) || hub;
  const today = todayISO();
  const dests = destinations(state);
  const fleet = state.aircraft;

  root.innerHTML = `
  <section class="hero">
    <div class="hero-slides" id="slides">
      ${dests.map((d, i) => `
        <div class="slide ${i === 0 ? 'active' : ''}" data-img-kind="dest" data-img-title="${esc(cityOf(d.to))}" data-from="${d.from}" data-to="${d.to}">
          <div class="slide-text">
            <span class="eyebrow">${flagImg(airport(d.to).cc)} ${esc(airport(d.to).city)}</span>
            <h2>Vuela a ${esc(airport(d.to).city)} desde ${money(d.price)}</h2>
            <button class="btn btn-light" data-deal="${d.from}-${d.to}">Ver vuelos</button>
          </div>
        </div>`).join('') || `<div class="slide active no-img"><div class="slide-text"><h2>${esc(state.airline.tagline)}</h2></div></div>`}
      <div class="dots" id="dots">${dests.map((_, i) => `<button aria-label="Banner ${i + 1}" class="${i === 0 ? 'on' : ''}" data-dot="${i}"></button>`).join('')}</div>
    </div>

    <form class="search card" id="search">
      <div class="trip-type">
        <label><input type="radio" name="trip" value="rt" checked> Ida y vuelta</label>
        <label><input type="radio" name="trip" value="ow"> Solo ida</label>
      </div>
      <div class="grid-search">
        <label>Origen<select name="o" required>${airportOptions(codes, hub)}</select></label>
        <button type="button" class="swap" id="swap" title="Intercambiar" aria-label="Intercambiar origen y destino">⇄</button>
        <label>Destino<select name="d" required>${airportOptions(codes, firstDest)}</select></label>
        <label>Salida<input type="date" name="dep" min="${today}" value="${addDays(today, 1)}" required></label>
        <label id="ret-wrap">Regreso<input type="date" name="ret" min="${today}" value="${addDays(today, 8)}"></label>
        <label>Pasajeros<input type="number" name="pax" min="1" max="9" value="1" required></label>
        <button class="btn btn-primary btn-lg" type="submit">Buscar vuelos</button>
      </div>
      <p class="muted small" id="search-hint"></p>
    </form>
  </section>

  <section class="section">
    <h2>Destinos destacados</h2>
    <div class="cards">
      ${dests.map((d) => `
        <article class="dest-card">
          <div class="dest-img" data-img-kind="dest" data-img-title="${esc(cityOf(d.to))}"><span class="code">${d.to}</span></div>
          <div class="dest-body">
            <h3>${flagImg(airport(d.to).cc)} ${esc(airport(d.to).city)}</h3>
            <p class="muted">${esc(airport(d.to).name)}</p>
            <p class="price">desde <strong>${money(d.price)}</strong></p>
            <button class="btn btn-outline" data-deal="${d.from}-${d.to}">Reservar</button>
          </div>
        </article>`).join('') || '<p class="muted">Aún no hay rutas. Créalas en Administración.</p>'}
    </div>
  </section>

  ${fleet.length ? `<section class="section">
    <h2>Nuestra flota</h2>
    <div class="cards">
      ${fleet.map((a) => `
        <article class="dest-card">
          <div class="dest-img" data-img-kind="aircraft" data-img-title="${esc(a.wiki || a.name)}"><span class="code">${esc(a.name)}</span></div>
          <div class="dest-body"><h3>${esc(a.name)}</h3>
          <p class="muted">${a.config.map((c) => `${c.cls}${c.count}`).join(' · ')}</p></div>
        </article>`).join('')}
    </div></section>` : ''}`;

  const form = $('#search', root);
  const syncTrip = () => { $('#ret-wrap', root).style.display = form.trip.value === 'rt' ? '' : 'none'; };
  form.addEventListener('change', syncTrip);
  syncTrip();
  $('#swap', root).onclick = () => { const o = form.o.value; form.o.value = form.d.value; form.d.value = o; };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.o.value === form.d.value) { $('#search-hint', root).textContent = 'Origen y destino deben ser distintos.'; return; }
    const rt = form.trip.value === 'rt';
    if (rt && form.ret.value < form.dep.value) { $('#search-hint', root).textContent = 'La fecha de regreso no puede ser anterior a la salida.'; return; }
    setFlow({ o: form.o.value, d: form.d.value, dep: form.dep.value, ret: rt ? form.ret.value : '', pax: Number(form.pax.value), trip: rt ? 'rt' : 'ow' });
    go('/results');
  });

  $$('[data-deal]', root).forEach((b) => b.addEventListener('click', () => {
    const [o, d] = b.dataset.deal.split('-');
    const dep = nextDateWithFlights(state, o, d, addDays(today, 1)) || addDays(today, 1);
    const back = nextDateWithFlights(state, d, o, addDays(dep, 1));
    setFlow({ o, d, dep, ret: back || '', pax: 1, trip: back ? 'rt' : 'ow' });
    go('/results');
  }));

  // carrusel
  const slides = $$('.slide', root);
  const dots = $$('[data-dot]', root);
  let cur = 0;
  const show = (i) => {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('active', k === cur));
    dots.forEach((s, k) => s.classList.toggle('on', k === cur));
  };
  dots.forEach((d) => d.addEventListener('click', () => show(Number(d.dataset.dot))));
  clearInterval(timer);
  if (slides.length > 1) timer = setInterval(() => (document.body.contains(root) && $('#slides', root) ? show(cur + 1) : clearInterval(timer)), 5500);
}
