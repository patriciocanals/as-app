import * as store from './store.js';
import { AIRPORTS, countryName } from './airports.js';
import { flagUrl } from './images.js';
import { clock, DAY } from './calc.js';
import { fromISO } from './schedule.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function airport(code) {
  const s = store.get();
  return s.customAirports[code] || AIRPORTS[code] || { iata: code, city: code, cc: '', name: '' };
}
export const allAirports = () => ({ ...AIRPORTS, ...store.get().customAirports });
export const cityOf = (c) => airport(c).city;

export const flagImg = (cc, cls = 'flag') =>
  cc ? `<img class="${cls}" src="${flagUrl(cc)}" alt="${esc(countryName(cc))}" loading="lazy" onerror="this.style.display='none'">` : '';

export const money = (n) => `${Number(n).toLocaleString('es-ES')} ${store.get().airline.currency}`;

export function fmtDate(iso, style = 'long') {
  const d = fromISO(iso);
  const opts = style === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' }).format(d);
}

export const fmtDuration = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
export const timeStr = (min) => clock(min);

/** Opciones <option> de aeropuertos de la red (los que aparecen en alguna ruta). */
export function networkAirports() {
  const set = new Set();
  store.get().routes.forEach((r) => { set.add(r.origin); set.add(r.dest); });
  return [...set].sort();
}
export const airportOptions = (codes, selected) =>
  codes.map((c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c} · ${esc(airport(c).city)}</option>`).join('');

/** Selectores horas + minutos (de 5 en 5) para duraciones. name -> data-time="name". */
export function timeSelect(name, minutes = 0) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === h ? 'selected' : ''}>${i} h</option>`).join('');
  const mins = Array.from({ length: 12 }, (_, i) => i * 5)
    .map((v) => `<option value="${v}" ${v === m ? 'selected' : ''}>${String(v).padStart(2, '0')} min</option>`).join('');
  return `<span class="timesel" data-time="${name}"><select aria-label="horas">${hours}</select><select aria-label="minutos">${mins}</select></span>`;
}
export function readTime(root, name) {
  const el = root.querySelector(`[data-time="${name}"]`);
  const [h, m] = el.querySelectorAll('select');
  return Number(h.value) * 60 + Number(m.value);
}

export function barcodeSvg(text, w = 220, h = 46) {
  let seed = 0;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let x = 0;
  let bars = '';
  while (x < w) {
    const bw = 1 + Math.floor(rnd() * 3);
    if (rnd() > 0.45) bars += `<rect x="${x}" y="0" width="${bw}" height="${h}"/>`;
    x += bw + 1;
  }
  return `<svg class="barcode" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-label="Código de barras" fill="currentColor">${bars}</svg>`;
}

export const cabinName = (c) => ({ Y: 'Economy', W: 'Premium Economy', B: 'Business', F: 'First' }[c]);
export const arrDayTag = (off) => (off > 0 ? `<sup class="plus">+${off}</sup>` : '');
export { DAY };
