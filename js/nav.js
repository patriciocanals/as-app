import * as store from './store.js';
import { esc } from './util.js';

export const go = (hash) => { location.hash = hash; };

/** Cambia de aerolínea recargando con ?a=<id> (así cada pestaña puede tener una distinta). */
export const switchUrl = (id, hash = '#/') => `${location.pathname}?a=${id}${hash}`;

export function applyBrand() {
  const a = store.get()?.airline;
  const root = document.documentElement.style;
  const brand = document.getElementById('brand');
  if (a) {
    root.setProperty('--primary', a.color);
    document.title = `${a.name} · Reservas`;
    brand.innerHTML = `<span class="logo-mark">${esc(a.code)}</span><span class="logo-name">${esc(a.name)}</span>`;
    document.getElementById('footer-name').textContent = a.name;
  } else {
    document.title = 'Airline Simulator WebApp';
    brand.innerHTML = '<span class="logo-mark">✈</span><span class="logo-name">Airline Simulator</span>';
    document.getElementById('footer-name').textContent = 'Airline Simulator WebApp';
  }
  renderSwitcher();
}

function renderSwitcher() {
  const el = document.getElementById('switcher');
  const items = store.list();
  const cur = store.currentId();
  if (!items.length) { el.hidden = true; return; }
  el.hidden = false;
  const chip = (a) => `<span class="logo-mark sm" style="background:${esc(a.color)}">${esc(a.code)}</span>`;
  const me = items.find((x) => x.id === cur) || items[0];
  el.innerHTML = `<summary title="Cambiar de aerolínea">${chip(me)}<span class="sw-name">${esc(me.name)}</span> ▾</summary>
    <div class="sw-menu" role="menu">
      <p class="sw-title">Mis aerolíneas (${items.length}/${store.MAX_AIRLINES})</p>
      ${items.map((a) => `<a role="menuitem" href="${switchUrl(a.id)}" class="${a.id === cur ? 'on' : ''}">${chip(a)} ${esc(a.name)}</a>`).join('')}
      ${items.length < store.MAX_AIRLINES ? '<a role="menuitem" href="#/welcome?new=1" class="new">＋ Nueva aerolínea</a>' : ''}
      <a role="menuitem" href="#/admin/airline" class="new">⚙ Gestionar aerolíneas</a>
    </div>`;
  el.open = false;
}

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}
