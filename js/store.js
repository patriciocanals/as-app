// Persistencia en localStorage (sin backend). Exportable/importable como JSON.
import { demoData } from './demo.js';

const KEY = 'airsim.v1';
let state = null;

export const uid = () => Math.random().toString(36).slice(2, 10);

export async function init() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw);
  } catch { /* almacenamiento bloqueado o corrupto */ }
  if (!state) {
    // 1) data/seed.json del repositorio (tu export publicado)  2) datos demo incluidos
    try {
      const r = await fetch('data/seed.json', { cache: 'no-store' });
      if (r.ok) state = normalize(await r.json());
    } catch { /* sin seed */ }
    state ||= demoData();
    save();
  }
  return state;
}

export const get = () => state;

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignorar */ }
}

export function replace(next) {
  state = normalize(next);
  save();
}

export function resetDemo() {
  state = demoData();
  save();
}

export function normalize(d) {
  return {
    airline: { name: 'Mi Aerolínea', code: 'MA', color: '#0a3d91', currency: '€', tagline: 'Volamos contigo', ...(d.airline || {}) },
    aircraft: d.aircraft || [],
    routes: d.routes || [],
    customAirports: d.customAirports || {},
    bookings: d.bookings || [],
  };
}

export const exportJSON = () => JSON.stringify(state, null, 2);
