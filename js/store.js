// Persistencia en localStorage con VARIAS aerolíneas (como en el juego: hasta 6).
//
//   airsim.v2 = { v: 2, last: "<id>", airlines: { "<id>": { airline, routes, customAirports, bookings } } }
//
// La aerolínea activa se decide por pestaña con ?a=<id> en la URL, así puedes tener
// dos aerolíneas abiertas a la vez en dos pestañas. Cada guardado relee el almacenamiento
// y solo escribe SU aerolínea, para que las pestañas no se pisen entre sí.

const KEY = 'airsim.v2';
const OLD_KEY = 'airsim.v1';
export const MAX_AIRLINES = 6;

let id = null;
let state = null;
let cache = { v: 2, last: null, airlines: {} };

export const uid = () => Math.random().toString(36).slice(2, 10);

function read() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (c && c.airlines) return c;
  } catch { /* vacío o corrupto */ }
  return null;
}
function write(c) {
  cache = c;
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* cuota o bloqueado */ }
}

/** Normaliza datos de cualquier versión (incluida la 1, que guardaba aviones aparte). */
export function normalize(d = {}) {
  const fleetV1 = d.aircraft || [];
  const routes = (d.routes || []).map((r) => {
    const { aircraftId, ...rest } = r;
    if (!rest.aircraft) {
      const ac = fleetV1.find((a) => a.id === aircraftId);
      rest.aircraft = ac
        ? { model: 'custom', name: ac.name, wiki: ac.wiki || ac.name, config: ac.config }
        : { model: '', name: '', wiki: '', config: null };
    }
    rest.aircraftCount ||= 1;
    return rest;
  });
  return {
    airline: { name: 'Mi aerolínea', code: 'XX', color: '#0a3d91', currency: '€', tagline: '', ...(d.airline || {}) },
    routes,
    customAirports: d.customAirports || {},
    bookings: d.bookings || [],
  };
}

const isV1Demo = (old) => (old.routes || []).length > 0 && old.routes.every((r) => String(r.id).startsWith('r-mad-'));

export async function init() {
  let c = read();
  if (!c) {
    c = { v: 2, last: null, airlines: {} };
    try { // migrar la versión 1 (salvo que fueran solo los datos de ejemplo que traía)
      const old = JSON.parse(localStorage.getItem(OLD_KEY));
      if (old && !isV1Demo(old)) { const n = uid(); c.airlines[n] = normalize(old); c.last = n; }
    } catch { /* sin datos antiguos */ }
    if (!Object.keys(c.airlines).length) {
      try { // data/seed.json publicado con la web (exportación de una aerolínea o de todas)
        const r = await fetch('data/seed.json', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          const list = j.airlines ? Object.values(j.airlines) : [j];
          list.slice(0, MAX_AIRLINES).forEach((a) => { const n = uid(); c.airlines[n] = normalize(a); c.last ||= n; });
        }
      } catch { /* sin seed */ }
    }
    write(c);
  }
  cache = c;
  const wanted = new URLSearchParams(location.search).get('a');
  id = c.airlines[wanted] ? wanted : c.airlines[c.last] ? c.last : Object.keys(c.airlines)[0] || null;
  state = id ? c.airlines[id] : null;
  if (id) {
    // fija ?a=<id> en esta pestaña para que recargar no cambie de aerolínea
    const url = new URL(location.href);
    url.searchParams.set('a', id);
    history.replaceState(null, '', url);
  }
  return state;
}

export const get = () => state;
export const currentId = () => id;

export function list() {
  const c = read() || cache;
  return Object.entries(c.airlines).map(([k, v]) => ({ id: k, ...v.airline }));
}

export function save() {
  if (!id) return;
  const c = read() || cache;
  c.airlines[id] = state;
  c.last = id;
  write(c);
}

/** Crea una aerolínea vacía y devuelve su id (no cambia la activa). */
export function createAirline(fields) {
  const c = read() || cache;
  if (Object.keys(c.airlines).length >= MAX_AIRLINES) throw new Error(`Máximo ${MAX_AIRLINES} aerolíneas.`);
  const n = uid();
  c.airlines[n] = normalize({ airline: fields });
  c.last = n;
  write(c);
  return n;
}

export function deleteAirline(target) {
  const c = read() || cache;
  delete c.airlines[target];
  if (c.last === target) c.last = Object.keys(c.airlines)[0] || null;
  write(c);
  return Object.keys(c.airlines);
}

/** Sustituye los datos de la aerolínea activa. */
export function replaceCurrent(data) {
  state = normalize(data);
  save();
}

/** Importa un export de varias aerolíneas (añade las que quepan). Devuelve cuántas añadió. */
export function importAll(obj) {
  const c = read() || cache;
  let added = 0;
  for (const a of Object.values(obj.airlines || {})) {
    if (Object.keys(c.airlines).length >= MAX_AIRLINES) break;
    c.airlines[uid()] = normalize(a);
    added++;
  }
  write(c);
  return added;
}

export const exportCurrent = () => JSON.stringify(state, null, 2);
export const exportAll = () => JSON.stringify({ v: 2, airlines: (read() || cache).airlines }, null, 2);
