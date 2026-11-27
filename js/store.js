// Persistencia con VARIAS aerolíneas (como en el juego: hasta 6).
//  - Modo nube (Netlify): los datos viven en tu cuenta y se sincronizan entre dispositivos (js/sync.js).
//  - Modo local (sin backend): localStorage del navegador.
//
//   container = { v: 2, last: "<id>", airlines: { "<id>": { airline, routes, customAirports, destImages, bookings } } }
//
// La aerolínea activa se decide por pestaña con ?a=<id> en la URL, así puedes tener
// dos aerolíneas abiertas a la vez en dos pestañas. Cada guardado solo escribe SU aerolínea.
import * as sync from './sync.js';

const KEY = 'airsim.v2';
const OLD_KEY = 'airsim.v1';
export const MAX_AIRLINES = 6;

let id = null;
let state = null;
let cache = { v: 2, last: null, airlines: {} };

export const uid = () => (Math.random().toString(36) + '00000000').slice(2, 10);

const cloud = () => sync.mode === 'cloud';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

function readLocal() {
  try {
    const c = JSON.parse(lsGet(KEY));
    if (c && c.airlines) return c;
  } catch { /* vacío o corrupto */ }
  return null;
}
const read = () => (cloud() ? cache : readLocal());
function write(c) {
  cache = c;
  if (!cloud()) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* cuota o bloqueado */ } }
}
const pushAirline = (aid, delay) => sync.schedule(aid, () => (aid === id ? state : cache.airlines[aid]), delay);

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
    destImages: d.destImages || {},
    featuredHubs: Array.isArray(d.featuredHubs) ? d.featuredHubs : [],
    bookings: d.bookings || [],
  };
}

const isV1Demo = (old) => (old.routes || []).length > 0 && old.routes.every((r) => String(r.id).startsWith('r-mad-'));

async function initLocal() {
  let c = readLocal();
  if (!c) {
    c = { v: 2, last: null, airlines: {} };
    try { // migrar la versión 1 (salvo que fueran solo los datos de ejemplo que traía)
      const old = JSON.parse(lsGet(OLD_KEY));
      if (old && !isV1Demo(old)) { const n = uid(); c.airlines[n] = normalize(old); c.last = n; }
    } catch { /* sin datos antiguos */ }
    if (!Object.keys(c.airlines).length) {
      try { // data/seed.json publicado con la web (solo modo local)
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
  return c;
}

async function initCloud() {
  const remote = await sync.loadAll();
  sync.setRevs(remote);
  const c = { v: 2, last: lsGet(`airsim.last.${sync.user()}`), airlines: {} };
  for (const [k, rec] of Object.entries(remote)) c.airlines[k] = normalize(rec.data);
  cache = c;

  // primera vez en la nube con datos guardados en este navegador: ofrecer subirlos
  const flag = `airsim.migrated.${sync.user()}`;
  const local = readLocal();
  if (!Object.keys(c.airlines).length && local && Object.keys(local.airlines).length && !lsGet(flag)) {
    const n = Object.keys(local.airlines).length;
    try { localStorage.setItem(flag, '1'); } catch { /* ignorar */ }
    if (confirm(`Hay ${n} aerolínea(s) guardada(s) solo en este navegador. ¿Subirlas a tu cuenta para verlas en todos tus dispositivos?`)) {
      for (const [k, v] of Object.entries(local.airlines)) { c.airlines[k] = normalize(v); }
      c.last = local.last;
      Object.keys(c.airlines).forEach((k) => pushAirline(k, 0));
    }
  }
  return c;
}

export async function init() {
  const c = cloud() ? await initCloud() : await initLocal();
  cache = c;
  const wanted = new URLSearchParams(location.search).get('a');
  id = c.airlines[wanted] ? wanted : c.airlines[c.last] ? c.last : Object.keys(c.airlines)[0] || null;
  state = id ? c.airlines[id] : null;
  if (id) {
    try { localStorage.setItem(`airsim.last.${sync.user() || ''}`, id); } catch { /* ignorar */ }
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
  pushAirline(id);
}

/** Crea una aerolínea vacía y devuelve su id (no cambia la activa). Se sube a la nube al momento. */
export function createAirline(fields) {
  const c = read() || cache;
  if (Object.keys(c.airlines).length >= MAX_AIRLINES) throw new Error(`Máximo ${MAX_AIRLINES} aerolíneas.`);
  const n = uid();
  c.airlines[n] = normalize({ airline: fields });
  c.last = n;
  write(c);
  pushAirline(n, 0);
  return n;
}

export async function deleteAirline(target) {
  const c = read() || cache;
  delete c.airlines[target];
  if (c.last === target) c.last = Object.keys(c.airlines)[0] || null;
  write(c);
  await sync.remove(target);
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
    const n = uid();
    c.airlines[n] = normalize(a);
    pushAirline(n, 0);
    added++;
  }
  write(c);
  return added;
}

export const exportCurrent = () => JSON.stringify(state, null, 2);
export const exportAll = () => JSON.stringify({ v: 2, airlines: (read() || cache).airlines }, null, 2);
