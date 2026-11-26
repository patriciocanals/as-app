import * as store from '../store.js';
import { $, $$, esc, airport, flagImg, money, fmtDate, fmtDuration, timeStr, arrDayTag, cabinName } from '../util.js';
import { flightsOn, availability, addDays, todayISO, seatSummary } from '../schedule.js';
import { getFlow, setFlow } from '../flow.js';
import { go } from '../nav.js';

const ORDER = ['F', 'B', 'W', 'Y'];

function segmentSummary(seg, label) {
  return `<div class="picked">
    <span class="tag">${label}</span>
    <strong>${seg.origin} → ${seg.dest}</strong> · ${esc(seg.number)} · ${fmtDate(seg.date, 'short')} · ${timeStr(seg.depMin)}–${timeStr(seg.arrMin)}
    · ${cabinName(seg.cls)} · ${money(seg.price)} /pax
  </div>`;
}

export function render(root) {
  const state = store.get();
  const flow = getFlow();
  if (!flow.o) { go('/'); return; }
  const rt = flow.trip === 'rt';
  const stage = !flow.out ? 'out' : rt && !flow.back ? 'back' : 'done';

  if (stage === 'done') { go('/book'); return; }

  const [o, d, date] = stage === 'out' ? [flow.o, flow.d, flow.dep] : [flow.d, flow.o, flow.ret];
  const minDate = stage === 'out' ? todayISO() : flow.dep;
  const flights = flightsOn(state, o, d, date);
  const pax = flow.pax || 1;

  root.innerHTML = `
  <section class="section narrow">
    <div class="steps"><span class="${stage === 'out' ? 'on' : 'done'}">1 · Ida</span>${rt ? `<span class="${stage === 'back' ? 'on' : ''}">2 · Vuelta</span>` : ''}<span>${rt ? 3 : 2} · Pasajeros y asientos</span><span>${rt ? 4 : 3} · Confirmación</span></div>
    <h1>${stage === 'out' ? 'Elige tu vuelo de ida' : 'Elige tu vuelo de vuelta'}</h1>
    <p class="route-line">${flagImg(airport(o).cc)} <strong>${esc(airport(o).city)} (${o})</strong> → ${flagImg(airport(d).cc)} <strong>${esc(airport(d).city)} (${d})</strong> · ${pax} pasajero${pax > 1 ? 's' : ''}</p>
    ${flow.out ? segmentSummary(flow.out, 'Ida') : ''}

    <div class="datebar">
      <button class="btn btn-outline" id="prev" ${addDays(date, -1) < minDate ? 'disabled' : ''}>‹ Día anterior</button>
      <strong>${fmtDate(date)}</strong>
      <button class="btn btn-outline" id="next">Día siguiente ›</button>
    </div>

    ${flights.length ? flights.map((f, i) => {
      const dur = f.duration;
      return `<article class="flight card">
        <div class="f-main">
          <div class="f-times">
            <div><span class="big">${timeStr(f.depMin)}</span><span class="iata">${f.origin}</span></div>
            <div class="f-line"><span>${fmtDuration(dur)}</span><i></i><span>Directo</span></div>
            <div><span class="big">${timeStr(f.arrMin)}${arrDayTag(f.arrDayOffset)}</span><span class="iata">${f.dest}</span></div>
          </div>
          <div class="f-meta">Vuelo <strong>${esc(f.number)}</strong> · ${esc(f.aircraftName)} · <span class="muted">${seatSummary(f.config)}</span></div>
        </div>
        <div class="fares">
          ${ORDER.map((c) => {
            const price = f.prices[c] || 0;
            const free = availability(state, f, c);
            const off = !price || free < pax;
            return `<button class="fare ${off ? 'off' : ''}" data-i="${i}" data-c="${c}" ${off ? 'disabled' : ''}>
              <span class="fare-name">${cabinName(c)}</span>
              <span class="fare-price">${price ? money(price) : '—'}</span>
              <span class="fare-left">${!price ? 'No disponible' : free < pax ? (free ? `Solo quedan ${free}` : 'Completo') : free <= 9 ? `Quedan ${free}` : 'Disponible'}</span>
            </button>`;
          }).join('')}
        </div>
      </article>`;
    }).join('') : `<div class="card empty"><h3>No hay vuelos ese día</h3><p class="muted">Prueba con otra fecha.</p></div>`}
  </section>`;

  const shift = (n) => {
    const next = { ...flow };
    if (stage === 'out') {
      next.dep = addDays(flow.dep, n);
      if (rt && flow.ret < next.dep) next.ret = next.dep;
    } else next.ret = addDays(flow.ret, n);
    setFlow(next);
    render(root);
  };
  $('#prev', root).onclick = () => shift(-1);
  $('#next', root).onclick = () => shift(1);

  $$('.fare', root).forEach((b) => b.addEventListener('click', () => {
    const f = flights[Number(b.dataset.i)];
    const cls = b.dataset.c;
    const seg = {
      key: f.key, number: f.number, origin: f.origin, dest: f.dest, date: f.date,
      depMin: f.depMin, arrMin: f.arrMin, arrDayOffset: f.arrDayOffset, duration: f.duration,
      aircraftId: f.aircraftId, aircraftName: f.aircraftName, config: f.config, cls, price: f.prices[cls],
    };
    const next = { ...flow, seats: undefined };
    if (stage === 'out') { next.out = seg; delete next.back; } else next.back = seg;
    setFlow(next);
    if (rt && stage === 'out') {
      // salto directo a la vuelta; si ese día no hay vuelos, el usuario cambia de fecha
      render(root);
    } else go('/book');
  }));
}
