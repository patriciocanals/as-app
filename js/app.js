import * as store from './store.js';
import { applyBrand } from './nav.js';
import { hydrateImages } from './images.js';
import * as home from './views/home.js';
import * as results from './views/results.js';
import * as book from './views/book.js';
import * as manage from './views/manage.js';
import * as ticket from './views/ticket.js';
import * as calculator from './views/calculator.js';
import * as admin from './views/admin.js';

const views = { home, results, book, manage, ticket, calculator, admin };
const app = document.getElementById('app');

function parse() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function render() {
  const ctx = parse();
  const name = ctx.parts[0] || 'home';
  const view = views[name] || home;
  // contenedor nuevo en cada navegación: así no se acumulan listeners
  const root = document.createElement('div');
  app.replaceChildren(root);
  try {
    view.render(root, ctx);
  } catch (err) {
    console.error(err);
    root.innerHTML = '<section class="section narrow"><div class="notice warn">Algo ha fallado al mostrar esta página. Prueba a recargar o a restaurar los datos en Administración → Datos.</div></section>';
  }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (name === 'home' ? 'home' : name)));
  hydrateImages(root);
  window.scrollTo(0, 0);
  document.getElementById('menu')?.classList.remove('open');
}

(async function boot() {
  await store.init();
  applyBrand();
  window.addEventListener('hashchange', render);
  document.getElementById('burger').addEventListener('click', () => document.getElementById('menu').classList.toggle('open'));
  render();
})();
