import { $ } from '../util.js';
import * as sync from '../sync.js';

/** Pantalla de acceso (solo en modo nube). Al entrar recarga la página para cargar los datos de la cuenta. */
export function render(root) {
  let kind = 'login';
  const draw = () => {
    root.innerHTML = `
    <section class="section narrow auth">
      <div class="card form">
        <h1>${kind === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</h1>
        <p class="muted">Tus aerolíneas, rutas y reservas se guardan en tu cuenta y las ves desde cualquier dispositivo.</p>
        <div class="trip-type" role="tablist">
          <label><input type="radio" name="kind" value="login" ${kind === 'login' ? 'checked' : ''}> Ya tengo cuenta</label>
          <label><input type="radio" name="kind" value="register" ${kind === 'register' ? 'checked' : ''}> Soy nuevo</label>
        </div>
        <form id="af" class="form" autocomplete="on">
          <label>Usuario<input name="username" required minlength="3" maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
          <label>Contraseña${kind === 'register' ? ' (mínimo 8 caracteres)' : ''}<input type="password" name="password" required minlength="${kind === 'register' ? 8 : 1}" autocomplete="${kind === 'login' ? 'current-password' : 'new-password'}"></label>
          ${kind === 'register' && sync.inviteRequired ? '<label>Código de invitación<input name="invite" required autocomplete="off"></label>' : ''}
          <p class="muted small" id="err" role="alert"></p>
          <button class="btn btn-primary btn-lg">${kind === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        </form>
      </div>
    </section>`;
    root.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', () => { kind = r.value; draw(); }));
    $('#af', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = f.querySelector('button');
      btn.disabled = true;
      const res = await sync.login(kind, f.username.value.trim(), f.password.value, f.invite?.value.trim());
      if (res.ok) { location.reload(); return; }
      btn.disabled = false;
      $('#err', root).textContent = res.error;
    });
  };
  draw();
}
