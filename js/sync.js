// Sincronización con la nube (Netlify Functions + Blobs). Si /api no existe (servidor estático
// sin backend) la app funciona en "modo local" con localStorage, como antes.

const TOKEN = 'airsim.token';
const USER = 'airsim.user';

export let mode = 'local'; // 'local' | 'cloud'
export let inviteRequired = false;

const listeners = new Set();
export const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (status, detail) => listeners.forEach((fn) => fn(status, detail));

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* bloqueado */ } };
const del = (k) => { try { localStorage.removeItem(k); } catch { /* bloqueado */ } };

export const token = () => get(TOKEN);
export const user = () => get(USER);

async function request(method, path, body, { keepalive = false, timeout = 15000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(`/api/${path}`, {
      method, keepalive, signal: ctl.signal, cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(token() ? { authorization: `Bearer ${token()}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* sin cuerpo */ }
    return { status: res.status, json };
  } finally { clearTimeout(timer); }
}

export async function detect() {
  try {
    const r = await request('GET', 'ping', null, { timeout: 2500 });
    if (r.status === 200 && r.json?.cloud) { mode = 'cloud'; inviteRequired = !!r.json.invite; }
  } catch { /* sin backend */ }
  return mode;
}

export async function login(kind, username, password, invite) {
  const r = await request('POST', kind, { username, password, invite });
  if (r.status === 200 || r.status === 201) {
    set(TOKEN, r.json.token); set(USER, r.json.user);
    return { ok: true };
  }
  return { ok: false, error: r.json?.error || 'No se pudo completar la operación.' };
}

export async function logout() {
  try { await request('POST', 'logout', null, { timeout: 4000 }); } catch { /* da igual */ }
  del(TOKEN); del(USER);
}

function expired() {
  del(TOKEN); del(USER);
  location.reload();
}

/** Descarga todas las aerolíneas de la cuenta: { id: { rev, data } }. */
export async function loadAll() {
  const r = await request('GET', 'data');
  if (r.status === 401) { expired(); return new Promise(() => {}); }
  if (r.status !== 200) throw new Error(r.json?.error || 'No se pudieron cargar los datos');
  return r.json.airlines || {};
}

// ---------- subida con retardo, reintentos y control de conflictos ----------
const revs = {};          // id -> revisión conocida en el servidor
const timers = new Map(); // id -> temporizador de subida
const getters = new Map(); // id -> () => datos actuales
const inflight = new Set();
const running = new Set(); // promesas de subidas en curso
let failures = 0;

export const setRevs = (obj) => { for (const [id, rec] of Object.entries(obj)) revs[id] = rec.rev; };

export function schedule(id, getData, delay = 700) {
  if (mode !== 'cloud') return;
  getters.set(id, getData);
  clearTimeout(timers.get(id));
  emit('saving');
  timers.set(id, setTimeout(() => push(id), delay));
}

function push(id, keepalive = false) {
  const p = doPush(id, keepalive);
  running.add(p);
  p.finally(() => running.delete(p));
  return p;
}

async function doPush(id, keepalive) {
  clearTimeout(timers.get(id)); timers.delete(id);
  const getData = getters.get(id);
  if (!getData) return;
  inflight.add(id);
  try {
    const r = await request('PUT', `airline/${id}`, { rev: revs[id] || 0, data: getData() }, { keepalive });
    if (r.status === 200) { revs[id] = r.json.rev; failures = 0; }
    else if (r.status === 409) { emit('conflict'); return; }
    else if (r.status === 401) { expired(); return; }
    else throw new Error(r.json?.error || `HTTP ${r.status}`);
    inflight.delete(id);
    if (!timers.size && !inflight.size) emit('saved');
  } catch (e) {
    inflight.delete(id);
    failures++;
    emit('offline', e.message);
    timers.set(id, setTimeout(() => push(id), Math.min(30000, 1500 * 2 ** failures))); // reintento con espera creciente
  }
}

export async function remove(id) {
  if (mode !== 'cloud') return;
  clearTimeout(timers.get(id)); timers.delete(id); getters.delete(id);
  const r = await request('DELETE', `airline/${id}`);
  if (r.status === 401) expired();
  delete revs[id];
}

export const hasPending = () => mode === 'cloud' && (timers.size > 0 || running.size > 0);

/** Envía ya lo pendiente y espera a que termine (antes de recargar o cambiar de aerolínea). */
export async function settle() {
  if (mode !== 'cloud') return;
  await Promise.all([...[...timers.keys()].map((id) => push(id)), ...running]);
}

/** Envía ya lo pendiente (al cerrar o ocultar la pestaña). */
export function flush() {
  if (mode !== 'cloud') return;
  for (const id of [...timers.keys()]) push(id, true);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  // si queda algo sin subir, el navegador pregunta antes de cerrar
  window.addEventListener('beforeunload', (e) => { if (hasPending()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
