import { $, $$, esc, timeSelect, readTime } from '../util.js';
import { calculate, formatHM, suggestRefuel, REFUEL_OPTIONS, R2_MIN, CLASS_NAMES } from '../calc.js';
import { go } from '../nav.js';
import * as store from '../store.js';

const KEY = 'airsim.calc';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export function render(root) {
  const s = { t1: 110, t2: 120, r1: 60, Y: 500, W: 250, B: 125, F: 62, n: 6, ...load() };

  root.innerHTML = `
  <section class="section narrow calc">
    <h1>Calculadora de rutas</h1>
    <p class="muted">Introduce los datos de la ruta tal y como aparecen en el juego y obtén cuántas rotaciones caben y cuántos asientos de cada clase necesitas.</p>

    <form class="card" id="calc" onsubmit="return false">
      <div class="calc-grid">
        <div class="field"><span class="lbl">T1 · Tiempo de ida</span>${timeSelect('t1', s.t1)}</div>
        <div class="field"><span class="lbl">T2 · Tiempo de vuelta</span>${timeSelect('t2', s.t2)}</div>
        <div class="field"><span class="lbl">R1 · Refuelling</span>
          <select id="r1">${REFUEL_OPTIONS.map((m) => `<option value="${m}" ${m === s.r1 ? 'selected' : ''}>${formatHM(m)}</option>`).join('')}</select>
          <small id="r1-hint" class="muted"></small></div>
        <div class="field"><span class="lbl">R2 · Fijo</span><output class="fixed">0:0${R2_MIN}</output></div>
      </div>
      <div class="calc-grid four">
        ${['Y', 'W', 'B', 'F'].map((c) => `<label class="field"><span class="lbl">${c} · Demanda ${CLASS_NAMES[c]}</span>
          <input type="number" min="0" inputmode="numeric" id="d-${c}" value="${s[c]}"></label>`).join('')}
      </div>
      <div class="field inline"><label for="n">Mostrar hasta</label>
        <select id="n">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === s.n ? 'selected' : ''}>${n} avion${n > 1 ? 'es' : ''}</option>`).join('')}</select></div>
    </form>

    <div id="out" aria-live="polite"></div>
  </section>`;

  const out = $('#out', root);

  const read = () => ({
    t1: readTime(root, 't1'), t2: readTime(root, 't2'), r1: Number($('#r1', root).value),
    Y: +$('#d-Y', root).value || 0, W: +$('#d-W', root).value || 0, B: +$('#d-B', root).value || 0, F: +$('#d-F', root).value || 0,
    n: Number($('#n', root).value),
  });

  const update = () => {
    const v = read();
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignorar */ }
    const sug = suggestRefuel(v.t1, v.t2);
    $('#r1-hint', root).textContent = sug.minutes === v.r1 ? `✓ coincide con lo habitual (${formatHM(sug.minutes)})` : `Habitual en el juego: ${formatHM(sug.minutes)} (confianza ${sug.confidence})`;

    const r = calculate({ t1: v.t1, t2: v.t2, r1: v.r1, demand: v, maxAircraft: v.n });
    if (r.error) { out.innerHTML = `<div class="notice warn">${esc(r.error)}</div>`; return; }
    const daily = r.mode === 'daily';

    out.innerHTML = `
      <div class="stats">
        <div class="stat"><span>Roundtrip (RT)</span><strong>${formatHM(r.rt)} h</strong><small>T1 + T2 + R1 + R2</small></div>
        <div class="stat"><span>${daily ? 'RT que caben en 24 h' : 'RT que caben en 1 semana'}</span><strong>${r.perPeriod}</strong>
          <small>${daily ? `24 h / ${formatHM(r.rt)} (redondeo hacia abajo)` : `168 h / ${formatHM(r.rt)} (redondeo hacia abajo)`}</small></div>
        <div class="stat"><span>Modo</span><strong>${daily ? 'Diario' : 'Semanal'}</strong>
          <small>${daily ? 'Numeración repetida a diario' : 'Un número de vuelo por RT'}</small></div>
      </div>
      ${daily ? '' : `<div class="notice">El RT supera las 24 h: se aprovecha cada avión al máximo semanal. Demanda dividida entre ${r.perPeriod} × N rotaciones por semana.</div>`}

      <div class="card table-wrap"><table class="res">
        <thead><tr><th>Aviones</th><th>${daily ? 'Rotaciones/día' : 'Rotaciones/semana'}</th>
          <th>Y</th><th>W</th><th>B</th><th>F</th><th>Total asientos</th><th></th></tr></thead>
        <tbody>${r.scenarios.map((sc) => `<tr>
          <td><strong>${sc.aircraft}</strong></td>
          <td>${daily ? sc.rotationsPerDay : sc.rotationsPerWeek}<small class="muted"> (${sc.flightsPerWeek} vuelos/sem)</small></td>
          <td>${sc.seats.Y}</td><td>${sc.seats.W}</td><td>${sc.seats.B}</td><td>${sc.seats.F}</td><td>${sc.totalSeats}</td>
          <td><button class="btn btn-outline btn-sm" data-make="${sc.aircraft}">Crear ruta</button></td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Asientos por vuelo, redondeados hacia arriba. ${daily ? 'Demanda diaria = demanda / 7, repartida entre las rotaciones del día y los aviones.' : 'Demanda repartida entre las rotaciones semanales y los aviones.'}
      Tiempo sin usar por avión: ${formatHM(r.idleMinutes)} h.</p>`;

    $$('[data-make]', out).forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.make);
      const sc = r.scenarios[n - 1];
      sessionStorage.setItem('airsim.draft', JSON.stringify({ t1: v.t1, t2: v.t2, r1: v.r1, aircraft: n, mode: r.mode, perPeriod: r.perPeriod, rt: r.rt, seats: sc.seats }));
      go(store.get() ? '/admin/route/new' : '/welcome');
    }));
  };

  // solo 'input': un 'change' al perder el foco repintaría la tabla entre mousedown y mouseup y se perdería el clic
  root.addEventListener('input', update);
  update();
}
