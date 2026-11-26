import * as store from '../store.js';
import { $, esc, money, fmtDate } from '../util.js';
import { go } from '../nav.js';

export function render(root) {
  const list = store.get().bookings.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  root.innerHTML = `
  <section class="section narrow">
    <h1>Mis reservas</h1>
    <form class="card" id="find">
      <h2>Consultar una reserva</h2>
      <div class="row">
        <label>Código de reserva<input name="pnr" maxlength="6" placeholder="ABC123" required style="text-transform:uppercase"></label>
        <label>Apellido<input name="last" required></label>
        <button class="btn btn-primary">Buscar</button>
      </div>
      <p class="muted small" id="msg" role="alert"></p>
    </form>

    <h2>Reservas guardadas en este navegador</h2>
    ${list.length ? `<div class="card table-wrap"><table>
      <thead><tr><th>PNR</th><th>Pasajeros</th><th>Vuelos</th><th>Total</th><th></th></tr></thead>
      <tbody>${list.map((b) => `<tr>
        <td><strong>${b.pnr}</strong></td>
        <td>${b.passengers.map((p) => esc(`${p.first} ${p.last}`)).join(', ')}</td>
        <td>${b.segments.map((s) => `${s.origin}→${s.dest} ${esc(s.number)} <span class="muted">${fmtDate(s.date, 'short')}</span>`).join('<br>')}</td>
        <td>${money(b.total)}</td>
        <td><a class="btn btn-outline btn-sm" href="#/ticket/${b.pnr}">Ver ticket</a></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty"><p class="muted">Todavía no hay reservas.</p></div>'}
  </section>`;
  $('#find', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const pnr = f.pnr.value.trim().toUpperCase();
    const last = f.last.value.trim().toLowerCase();
    const b = store.get().bookings.find((x) => x.pnr === pnr && x.passengers.some((p) => p.last.toLowerCase() === last));
    if (b) go(`/ticket/${pnr}`);
    else $('#msg', root).textContent = 'No encontramos ninguna reserva con esos datos en este navegador.';
  });
}
