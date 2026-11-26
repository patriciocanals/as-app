import * as store from './store.js';
import { esc } from './util.js';

export const go = (hash) => { location.hash = hash; };

export function applyBrand() {
  const a = store.get().airline;
  document.documentElement.style.setProperty('--primary', a.color);
  document.title = `${a.name} · Reservas`;
  const logo = document.getElementById('brand');
  if (logo) logo.innerHTML = `<span class="logo-mark">${esc(a.code)}</span><span class="logo-name">${esc(a.name)}</span>`;
  const foot = document.getElementById('footer-name');
  if (foot) foot.textContent = a.name;
}

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}
