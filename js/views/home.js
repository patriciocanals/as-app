import * as store from '../store.js';
import { $, $$, esc, airport, airportOptions, networkAirports, flagImg, money, destImageAttrs } from '../util.js';
import { todayISO, addDays, nextDateWithFlights, isConfigured } from '../schedule.js';
import { go } from '../nav.js';
import { setFlow } from '../flow.js';
import { countryName } from '../airports.js';

let timer;

const sellable = (state) => state.routes.filter((x) => isConfigured(x.aircraft?.config));

function hubOf(routes) {
  const n = {};
  routes.forEach((r) => { n[r.origin] = (n[r.origin] || 0) + 1; n[r.dest] = (n[r.dest] || 0) + 1; });
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function destinations(routes) {
  // Destinos reales de la compañía, con el precio "desde" más bajo (el del hub no se destaca)
  const map = new Map();
  for (const r of routes) {
    const prices = Object.values(r.prices).filter((p) => p > 0);
    if (!prices.length) continue;
    const price = Math.min(...prices);
    for (const [from, to] of [[r.origin, r.dest], [r.dest, r.origin]]) {
      const cur = map.get(to);
      if (!cur || price < cur.price) map.set(to, { from, to, price });
    }
  }
  const hub = hubOf(routes);
  return [...map.values()].filter((d) => d.to !== hub);
}

export function render(root) {
  const state = store.get();
  const routes = sellable(state);
  const codes = networkAirports();
  const today = todayISO();

  if (!codes.length) {
    const pending = state.routes.length;
    root.innerHTML = `<section class="section narrow"><div class="card empty">
      <h1>${esc(state.airline.name)}</h1>
      <p class="muted">${pending ? `Tienes ${pending} ruta(s) pendientes de configurar los asientos del avión. Cuando indiques la configuración, aparecerán aquí para reservar.` : 'Esta aerolínea aún no tiene rutas.'}</p>
      <div class="actions" style="justify-content:center"><a class="btn btn-primary" href="#/calculator">Calcular una ruta</a><a class="btn btn-outline" href="#/admin/routes">Administrar rutas</a></div>
    </div></section>`;
    return;
  }

  const hub = hubOf(routes);
  const firstDest = codes.find((c) => c !== hub) || hub;
  const dests = destinations(routes).sort((a, b) => a.price - b.price || a.to.localeCompare(b.to));
  const SHOWN = 8;
  const slidesList = dests.slice(0, 6);
  const fleetMap = new Map();
  routes.forEach((r) => {
    const k = r.aircraft.model + r.aircraft.name;
    const cur = fleetMap.get(k) || { ...r.aircraft, routes: 0 };
    cur.routes++;
    fleetMap.set(k, cur);
  });
  const fleet = [...fleetMap.values()];

  root.innerHTML = `
  <section class="hero">
    <div class="hero-slides" id="slides">
      ${slidesList.map((d, i) => `
        <div class="slide ${i === 0 ? 'active' : ''}" ${destImageAttrs(d.to)}>
          <div class="slide-text">
            <span class="eyebrow">${flagImg(airport(d.to).cc)} ${esc(countryName(airport(d.to).cc) || '')}</span>
            <h2>Vuela a ${esc(airport(d.to).city)} desde ${money(d.price)}</h2>
            <button class="btn btn-light" data-deal="${d.from}-${d.to}">Ver vuelos</button>
          </div>
        </div>`).join('') || `<div class="slide active no-img"><div class="slide-text"><h2>${esc(state.airline.tagline || state.airline.name)}</h2></div></div>`}
      <div class="dots" id="dots">${slidesList.map((_, i) => `<button aria-label="Banner ${i + 1}" class="${i === 0 ? 'on' : ''}" data-dot="${i}"></button>`).join('')}</div>
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

  ${dests.length ? `<section class="section">
    <div class="sec-head"><h2>Destinos que te esperan</h2><p class="muted">Las mejores ofertas de nuestra red</p></div>
    <div class="dest-grid">
      ${dests.map((d, i) => `
        <article class="dest" ${i >= SHOWN ? 'hidden data-extra' : ''} tabindex="0" role="link" aria-label="Vuelos a ${esc(airport(d.to).city)}" data-deal="${d.from}-${d.to}">
          <div class="dest-photo" ${destImageAttrs(d.to)}></div>
          <span class="dest-price">desde <strong>${money(d.price)}</strong></span>
          <div class="dest-info">
            <h3>${esc(airport(d.to).city)}</h3>
            <p>${flagImg(airport(d.to).cc, 'flag sm')} ${esc(countryName(airport(d.to).cc) || '')} · desde ${esc(airport(d.from).city)}</p>
            <span class="dest-cta">Ver vuelos →</span>
          </div>
        </article>`).join('')}
    </div>
    ${dests.length > SHOWN ? `<div class="more-wrap"><button class="btn btn-outline" id="more">Ver los ${dests.length} destinos</button></div>` : ''}
  </section>` : ''}

  ${fleet.length ? `<section class="section">
    <div class="sec-head"><h2>Nuestra flota</h2><p class="muted">Los aviones con los que volamos</p></div>
    <div class="fleet-grid">
      ${fleet.map((a) => `
        <article class="plane">
          <div class="plane-photo" data-img-kind="aircraft" data-img-title="${esc(a.wiki || a.name)}" role="img" aria-label="${esc(a.name)}"></div>
          <div class="plane-info"><h3>${esc(a.name)}</h3>
            <p class="muted">${a.config.filter((c) => c.count).map((c) => `${c.cls} ${c.count}`).join(' · ')}</p>
            <p class="muted small">${a.routes} ruta${a.routes > 1 ? 's' : ''}</p></div>
        </article>`).join('')}
    </div>
  </section>` : ''}`;

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

  $('#more', root)?.addEventListener('click', (e) => { $$('[data-extra]', root).forEach((c) => { c.hidden = false; }); e.target.remove(); });

  const deal = (el) => {
    const [o, d] = el.dataset.deal.split('-');
    const dep = nextDateWithFlights(state, o, d, addDays(today, 1)) || addDays(today, 1);
    const back = nextDateWithFlights(state, d, o, addDays(dep, 1));
    setFlow({ o, d, dep, ret: back || '', pax: 1, trip: back ? 'rt' : 'ow' });
    go('/results');
  };
  $$('[data-deal]', root).forEach((el) => {
    el.addEventListener('click', () => deal(el));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); deal(el); } });
  });

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
