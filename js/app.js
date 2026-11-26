import * as store from './store.js';
import * as sync from './sync.js';
import { applyBrand, setupChrome } from './nav.js';
import { hydrateImages } from './images.js';
import * as home from './views/home.js';
import * as results from './views/results.js';
import * as book from './views/book.js';
import * as manage from './views/manage.js';
import * as ticket from './views/ticket.js';
import * as calculator from './views/calculator.js';
import * as admin from './views/admin.js';
import * as welcome from './views/welcome.js';
import * as auth from './views/auth.js';

const views = { home, results, book, manage, ticket, calculator, admin, welcome };
const app = document.getElementById('app');

function parse() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function render() {
  const ctx = parse();
  let name = ctx.parts[0] || 'home';
  // sin aerolínea solo funcionan la calculadora y el alta de la primera aerolínea
  if (!store.get() && name !== 'calculator') name = 'welcome';
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
  document.getElementById('burger').addEventListener('click', () => document.getElementById('menu').classList.toggle('open'));
  await sync.detect();
  setupChrome();

  if (sync.mode === 'cloud' && !sync.token()) {
    document.body.classList.add('logged-out');
    applyBrand();
    const root = document.createElement('div');
    app.replaceChildren(root);
    auth.render(root);
    return;
  }
  try {
    await store.init();
  } catch (err) {
    console.error(err);
    app.innerHTML = '<section class="section narrow"><div class="notice warn">No se pudo conectar con el servidor para cargar tus datos.</div><button class="btn btn-primary" onclick="location.reload()">Reintentar</button></section>';
    return;
  }
  applyBrand();
  window.addEventListener('hashchange', render);
  render();
})();
