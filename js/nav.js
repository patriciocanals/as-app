import * as store from './store.js';
import { esc } from './util.js';
import * as sync from './sync.js';

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

// ---------- cuenta, estado de sincronización y avisos ----------
const STATUS = {
  saving: ['⟳ Guardando…', ''],
  saved: ['☁ Guardado', 'ok'],
  offline: ['⚠ Sin conexión: reintentando', 'warn'],
};

export function setupChrome() {
  const el = document.getElementById('account');
  if (sync.mode === 'cloud' && sync.token()) {
    el.innerHTML = `<span id="sync" class="sync ok" role="status">☁ Guardado</span>
      <span class="who" title="Tu cuenta">👤 ${esc(sync.user())}</span><button class="btn btn-link btn-sm" id="logout">Salir</button>`;
    document.getElementById('logout').onclick = async () => {
      await sync.settle();
      await sync.logout();
      location.replace(`${location.pathname}?bye=1`);
    };
    sync.onStatus((st) => {
      const s = document.getElementById('sync');
      if (st === 'conflict') {
        showBanner('Esta aerolínea se modificó desde otro dispositivo, así que tus últimos cambios no se han guardado. Recarga para ver la versión más reciente.', 'Recargar', () => location.reload());
        return;
      }
      if (!s || !STATUS[st]) return;
      s.textContent = STATUS[st][0];
      s.className = `sync ${STATUS[st][1]}`;
    });
  } else {
    el.innerHTML = '';
  }
  const foot = document.getElementById('footer-mode');
  if (foot) foot.textContent = sync.mode === 'cloud' ? '' : ' Modo local: los datos solo están en este navegador.';
}

export function showBanner(text, label, onClick) {
  const b = document.getElementById('banner');
  b.hidden = false;
  b.innerHTML = `<span>${esc(text)}</span> <button class="btn btn-light btn-sm">${esc(label)}</button>`;
  b.querySelector('button').onclick = onClick;
}
