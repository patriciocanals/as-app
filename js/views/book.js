import * as store from '../store.js';
import { $, $$, esc, money, fmtDate, timeStr, cabinName } from '../util.js';
import { seatMap, takenSeats, cabinSeats, makePNR } from '../schedule.js';
import { getFlow, setFlow, clearFlow } from '../flow.js';
import { go } from '../nav.js';

function segmentsOf(flow) {
  return [flow.out, flow.back].filter(Boolean);
}

function seatGrid(seg, taken, chosen, activePax) {
  const rows = seatMap(seg.config).filter((r) => r.cls === seg.cls);
  const mine = new Map(chosen.map((s, p) => [s, p]).filter(([s]) => s));
  return `<div class="seatmap" role="group" aria-label="Asientos ${cabinName(seg.cls)}">
    ${rows.map((r) => {
      let idx = 0;
      const cells = r.groups.map((g) => {
        const part = r.seats.slice(idx, idx + g);
        idx += g;
        return `<span class="grp">${Array.from({ length: g }, (_, k) => {
          const s = part[k];
          if (!s) return '<span class="seat ghost"></span>';
          const isTaken = taken.has(s.id);
          const owner = mine.get(s.id);
          const cls = isTaken ? 'taken' : owner !== undefined ? (owner === activePax ? 'sel active' : 'sel') : '';
          return `<button type="button" class="seat ${cls}" data-seat="${s.id}" ${isTaken ? 'disabled' : ''} title="${s.id}">${owner !== undefined ? owner + 1 : s.letter}</button>`;
        }).join('')}</span>`;
      }).join('<span class="aisle"></span>');
      return `<div class="seat-row"><span class="rn">${r.row}</span>${cells}<span class="rn">${r.row}</span></div>`;
    }).join('')}
  </div>`;
}

export function render(root) {
  const state = store.get();
  const flow = getFlow();
  const segs = segmentsOf(flow);
  if (!segs.length) { go('/'); return; }
  const pax = flow.pax || 1;
  flow.passengers ||= Array.from({ length: pax }, () => ({ first: '', last: '' }));
  flow.seats ||= segs.map(() => Array(pax).fill(''));
  flow.active ||= segs.map(() => 0);
  flow.email ||= '';
  setFlow(flow);

  const total = segs.reduce((a, s) => a + s.price * pax, 0);

  root.innerHTML = `
  <section class="section narrow">
    <div class="steps"><span class="done">Vuelos</span><span class="on">Pasajeros y asientos</span><span>Confirmación</span></div>
    <h1>Pasajeros y asientos</h1>
    <div class="layout-2">
      <div>
        <form id="pax-form" class="card" novalidate>
          <h2>Pasajeros</h2>
          ${flow.passengers.map((p, i) => `
            <div class="pax-row"><span class="pax-n">${i + 1}</span>
              <label>Nombre<input data-p="${i}" data-f="first" value="${esc(p.first)}" required autocomplete="given-name"></label>
              <label>Apellidos<input data-p="${i}" data-f="last" value="${esc(p.last)}" required autocomplete="family-name"></label>
            </div>`).join('')}
          <label>Email de contacto (opcional)<input type="email" id="email" value="${esc(flow.email)}" autocomplete="email"></label>
        </form>

        ${segs.map((seg, si) => {
          const taken = takenSeats(state, seg.key);
          return `<div class="card seg" data-seg="${si}">
            <h2>${seg.origin} → ${seg.dest} <small>${esc(seg.number)} · ${fmtDate(seg.date, 'short')} · ${cabinName(seg.cls)}</small></h2>
            <p class="muted small">Elige un pasajero y pulsa su asiento. Si lo dejas vacío se asigna automáticamente.</p>
            <div class="chips">${flow.passengers.map((p, i) => `<button type="button" class="chip ${flow.active[si] === i ? 'on' : ''}" data-chip="${si}:${i}">${i + 1} · ${esc(p.first || 'Pasajero')} ${flow.seats[si][i] ? `<b>${flow.seats[si][i]}</b>` : ''}</button>`).join('')}</div>
            <div class="legend"><span><i class="seat"></i> Libre</span><span><i class="seat sel"></i> Elegido</span><span><i class="seat taken"></i> Ocupado</span></div>
            ${seatGrid(seg, taken, flow.seats[si], flow.active[si])}
          </div>`;
        }).join('')}
      </div>

      <aside class="card summary">
        <h2>Resumen</h2>
        ${segs.map((s) => `<div class="sum-seg"><strong>${s.origin} → ${s.dest}</strong><br>
          ${esc(s.number)} · ${fmtDate(s.date, 'short')}<br>${timeStr(s.depMin)} – ${timeStr(s.arrMin)} · ${cabinName(s.cls)}<br>
          <span class="muted">${pax} × ${money(s.price)}</span></div>`).join('')}
        <div class="total"><span>Total</span><strong>${money(total)}</strong></div>
        <p class="muted small" id="err" role="alert"></p>
        <button class="btn btn-primary btn-lg" id="confirm">Confirmar reserva</button>
        <button class="btn btn-link" id="back">‹ Cambiar vuelos</button>
      </aside>
    </div>
  </section>`;

  // entradas de texto: se guardan sin re-renderizar (no pierde el foco)
  $$('[data-p]', root).forEach((el) => el.addEventListener('input', () => {
    flow.passengers[Number(el.dataset.p)][el.dataset.f] = el.value;
    setFlow(flow);
  }));
  $('#email', root).addEventListener('input', (e) => { flow.email = e.target.value; setFlow(flow); });

  $$('[data-chip]', root).forEach((b) => b.addEventListener('click', () => {
    const [si, pi] = b.dataset.chip.split(':').map(Number);
    flow.active[si] = pi; setFlow(flow); render(root);
  }));

  $$('.seg', root).forEach((box) => {
    const si = Number(box.dataset.seg);
    $$('[data-seat]', box).forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.seat;
      const cur = flow.seats[si];
      const owner = cur.indexOf(id);
      if (owner >= 0) cur[owner] = ''; // clic en un asiento ya elegido lo libera
      else cur[flow.active[si]] = id;
      setFlow(flow); render(root);
    }));
  });

  $('#back', root).onclick = () => { delete flow.out; delete flow.back; setFlow(flow); go('/results'); };

  $('#confirm', root).onclick = () => {
    const err = $('#err', root);
    if (flow.passengers.some((p) => !p.first.trim() || !p.last.trim())) { err.textContent = 'Completa nombre y apellidos de todos los pasajeros.'; return; }
    const fresh = store.get();
    const bookedSegs = [];
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      const taken = takenSeats(fresh, seg.key);
      const chosen = flow.seats[si].map((s) => (s && !taken.has(s) ? s : ''));
      const free = cabinSeats(seg.config, seg.cls).filter((s) => !taken.has(s) && !chosen.includes(s));
      const seats = chosen.map((s) => s || free.shift());
      if (seats.some((s) => !s)) { err.textContent = `No quedan asientos suficientes en ${seg.number}. Vuelve a buscar.`; return; }
      bookedSegs.push({ ...seg, seats });
    }
    const pnr = makePNR(new Set(fresh.bookings.map((b) => b.pnr)));
    fresh.bookings.push({
      pnr, createdAt: new Date().toISOString(),
      passengers: flow.passengers.map((p) => ({ first: p.first.trim(), last: p.last.trim() })),
      email: flow.email.trim(), segments: bookedSegs, total,
    });
    store.save();
    clearFlow();
    go(`/ticket/${pnr}?new=1`);
  };
}
