import * as store from '../store.js';
import { $, $$, esc, airport, airportOptions, networkAirports, flagImg, money, destImageAttrs } from '../util.js';
import { todayISO, addDays, nextDateWithFlights, isConfigured, reachableFrom } from '../schedule.js';
import { go } from '../nav.js';
import { setFlow } from '../flow.js';
import { countryName } from '../airports.js';

let timer;

const sellable = (state) => state.routes.filter((x) => isConfigured(x.aircraft?.config));

/** Hub principal = el aeropuerto que más veces es origen de una ruta. */
export function hubOf(routes) {
  const n = {};
  routes.forEach((r) => { n[r.origin] = (n[r.origin] || 0) + 1; });
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Tarjetas de propaganda: una por aeropuerto de destino, la más reciente primero (según cuándo se creó su ruta).
 * - Todo aeropuerto que es origen de alguna ruta es un hub (puede haber varios) y no se anuncia como destino,
 *   salvo que se haya marcado como "destacado" (featured): entonces tiene su propia tarjeta y se llega a él
 *   desde los destinos de sus rutas.
 * - Un destino con varios orígenes (p. ej. LHR desde MAD y BCN) es UNA tarjeta con la lista `froms`.
 */
export function destinations(routes, featured = []) {
  const hubs = new Set(routes.map((r) => r.origin));
  const feat = new Set(featured.filter((c) => hubs.has(c)));
  const minPrice = (r) => { const p = Object.values(r.prices || {}).filter((x) => x > 0); return p.length ? Math.min(...p) : 0; };
  const build = (skip) => {
    const map = new Map();
    const add = (to, from, price, ts) => {
      if (!price) return;
      const c = map.get(to) || { to, froms: new Map(), ts: -Infinity };
      const prev = c.froms.get(from);
      if (prev === undefined || price < prev) c.froms.set(from, price);
      c.ts = Math.max(c.ts, ts);
      map.set(to, c);
    };
    routes.forEach((r, i) => {
      const price = minPrice(r);
      const ts = r.createdAt ?? i; // rutas antiguas sin fecha: el orden de la lista hace de fecha
      if (!skip(r.dest)) add(r.dest, r.origin, price, ts);
      if (feat.has(r.origin)) add(r.origin, r.dest, price, ts);
    });
    return [...map.values()].map((c) => {
      const froms = [...c.froms].map(([code, price]) => ({ code, price })).sort((x, y) => x.price - y.price || x.code.localeCompare(y.code));
      return { to: c.to, froms, from: froms[0].code, price: froms[0].price, ts: c.ts, hub: feat.has(c.to) };
    }).sort((x, y) => y.ts - x.ts || Number(x.hub) - Number(y.hub) || x.to.localeCompare(y.to));
  };
  const found = build((c) => hubs.has(c) && !feat.has(c));
  // rutas definidas en ambos sentidos (A-B y B-A): todos serían hubs; entonces solo se aparta el hub principal
  return found.length ? found : build((c) => c === hubOf(routes));
}

/** Texto de orígenes de una tarjeta: hasta 3 ciudades; con más, invita a consultar el buscador. */
export function fromText(froms, cityOf) {
  if (froms.length > 3) return 'Varios orígenes: consulta desde dónde puedes volar';
  const names = froms.map((f) => cityOf(f.code));
  return `desde ${names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0]}`;
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
  const firstDest = reachableFrom(state, hub)[0] || '';
  const dests = destinations(routes, state.featuredHubs || []);
  // dos destinos de la misma ciudad (p. ej. MEL y AVV en Melbourne): se distinguen con el código del aeropuerto
  const cityCount = {};
  dests.forEach((d) => { const c = airport(d.to).city; cityCount[c] = (cityCount[c] || 0) + 1; });
  const label = (code) => (cityCount[airport(code).city] > 1 ? `${airport(code).city} (${code})` : airport(code).city);
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
            <h2>Vuela a ${esc(label(d.to))} desde ${money(d.price)}</h2>
            <button class="btn btn-light" data-deal="${d.from}-${d.to}" ${d.froms.length > 1 ? 'data-multi' : ''}>${d.froms.length > 1 ? 'Elegir origen' : 'Ver vuelos'}</button>
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
        <label>Destino<select name="d" required>${airportOptions(reachableFrom(state, hub), firstDest)}</select></label>
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
        <article class="dest" ${i >= SHOWN ? 'hidden data-extra' : ''} tabindex="0" role="link" aria-label="Vuelos a ${esc(label(d.to))}" data-deal="${d.from}-${d.to}" ${d.froms.length > 1 ? 'data-multi' : ''}>
          <div class="dest-photo" ${destImageAttrs(d.to)}></div>
          <span class="dest-price">desde <strong>${money(d.price)}</strong></span>
          <div class="dest-info">
            <h3>${esc(label(d.to))}</h3>
            <p>${flagImg(airport(d.to).cc, 'flag sm')} ${esc(countryName(airport(d.to).cc) || '')}</p>
            <p class="dest-from">${esc(fromText(d.froms, (c) => airport(c).city))}</p>
            <span class="dest-cta">${d.froms.length > 1 ? 'Elegir origen →' : 'Ver vuelos →'}</span>
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
          <div class="plane-photo" data-img-kind="aircraft" data-img-title="${esc(a.wiki || a.name)}" data-img-alt="${esc(a.name)}" data-img-model="${esc(a.model)}" role="img" aria-label="${esc(a.name)}"></div>
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
  // el desplegable de destino solo muestra los destinos con ruta desde el origen elegido
  const fillDest = (keep) => {
    const list = reachableFrom(state, form.o.value);
    form.d.innerHTML = airportOptions(list, list.includes(keep) ? keep : list[0]);
  };
  form.o.addEventListener('change', () => fillDest(form.d.value));
  $('#swap', root).onclick = () => { const o = form.o.value; form.o.value = form.d.value; fillDest(o); };

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
    if ('multi' in el.dataset) { // varios orígenes posibles: se rellena el buscador para que elija
      form.o.value = o; fillDest(d);
      $('#search-hint', root).textContent = `Elige desde dónde quieres volar a ${airport(d).city}.`;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.o.focus();
      return;
    }
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
