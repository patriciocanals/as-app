import * as store from '../store.js';
import { $ } from '../util.js';
import { switchUrl } from '../nav.js';

export function render(root, { q }) {
  const first = !store.get();
  const count = store.list().length;
  const full = count >= store.MAX_AIRLINES;
  root.innerHTML = `
  <section class="section narrow">
    <h1>${first ? 'Crea tu aerolínea' : 'Nueva aerolínea'}</h1>
    <p class="muted">${first
      ? 'Elige el nombre y el código de tus números de vuelo. Podrás cambiarlos cuando quieras y crear hasta 6 aerolíneas, cada una con sus rutas y reservas.'
      : `Cada aerolínea tiene sus propias rutas, programación y reservas. Tienes ${count} de ${store.MAX_AIRLINES}.`}</p>
    ${full ? '<div class="notice warn">Has llegado al máximo de 6 aerolíneas (como en el juego). Borra una desde Administración para crear otra.</div>' : `
    <form class="card form" id="f">
      <label>Nombre de la aerolínea<input name="name" required maxlength="40" placeholder="Nombre de tu aerolínea" autofocus></label>
      <label>Código de vuelo (2–3 letras o números, p. ej. el prefijo de tus vuelos)<input name="code" required maxlength="3" pattern="[A-Za-z0-9]{2,3}" style="text-transform:uppercase" placeholder="XX"></label>
      <label>Lema (opcional)<input name="tagline" maxlength="80"></label>
      <div class="row">
        <label>Color de marca<input type="color" name="color" value="#0a3d91"></label>
        <label>Moneda (símbolo)<input name="currency" value="€" maxlength="4" required></label>
      </div>
      <p class="muted small" id="err" role="alert"></p>
      <button class="btn btn-primary btn-lg">Crear aerolínea</button>
    </form>`}
    ${q.new ? '<p><a href="#/">‹ Volver</a></p>' : ''}
  </section>`;
  const f = $('#f', root);
  if (!f) return;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = f.code.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,3}$/.test(code)) { $('#err', root).textContent = 'El código debe tener 2 o 3 letras/números.'; return; }
    let nid;
    try {
      nid = store.createAirline({ name: f.name.value.trim(), code, tagline: f.tagline.value.trim(), color: f.color.value, currency: f.currency.value.trim() });
    } catch (err) { $('#err', root).textContent = err.message; return; }
    // si venías de la calculadora con una ruta a medias, se continúa con ella
    const next = sessionStorage.getItem('airsim.draft') ? '#/admin/route/new' : '#/calculator';
    location.href = switchUrl(nid, next);
  });
}
