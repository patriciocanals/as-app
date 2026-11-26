import * as store from '../store.js';
import { $, esc, airport, money, fmtDate, timeStr, cabinName, barcodeSvg, flagImg } from '../util.js';
import { addDays } from '../schedule.js';
import { go, toast } from '../nav.js';

function ticketHtml(b, seg, pi) {
  const a = store.get().airline;
  const p = b.passengers[pi];
  const o = airport(seg.origin);
  const d = airport(seg.dest);
  const board = (((seg.depMin - 40) % 1440) + 1440) % 1440;
  const name = `${p.last}/${p.first}`.toUpperCase();
  return `
  <article class="ticket" style="--tk:${esc(a.color)}">
    <div class="tk-main">
      <header class="tk-head"><span class="tk-brand"><span class="logo-mark">${esc(a.code)}</span> ${esc(a.name)}</span><span class="tk-title">TARJETA DE EMBARQUE · BOARDING PASS</span></header>
      <div class="tk-route">
        <div><span class="tk-iata">${seg.origin}</span><span class="tk-city">${flagImg(o.cc, 'flag sm')} ${esc(o.city)}</span></div>
        <div class="tk-plane" aria-hidden="true">✈</div>
        <div><span class="tk-iata">${seg.dest}</span><span class="tk-city">${flagImg(d.cc, 'flag sm')} ${esc(d.city)}</span></div>
      </div>
      <dl class="tk-grid">
        <div class="wide"><dt>Pasajero / Passenger</dt><dd>${esc(name)}</dd></div>
        <div><dt>Vuelo / Flight</dt><dd>${esc(seg.number)}</dd></div>
        <div><dt>Fecha / Date</dt><dd>${fmtDate(seg.date, 'short')}</dd></div>
        <div><dt>Salida / Dep.</dt><dd>${timeStr(seg.depMin)}</dd></div>
        <div><dt>Llegada / Arr.</dt><dd>${timeStr(seg.arrMin)}${seg.arrDayOffset ? ` (${fmtDate(addDays(seg.date, seg.arrDayOffset), 'short')})` : ''}</dd></div>
        <div><dt>Embarque / Boarding</dt><dd>${timeStr(board)}</dd></div>
        <div><dt>Clase / Class</dt><dd>${cabinName(seg.cls)}</dd></div>
        <div><dt>Asiento / Seat</dt><dd class="seat-big">${seg.seats[pi]}</dd></div>
        <div><dt>Avión / Aircraft</dt><dd>${esc(seg.aircraftName)}</dd></div>
        <div><dt>Reserva / PNR</dt><dd>${b.pnr}</dd></div>
      </dl>
      <footer class="tk-foot">${barcodeSvg(`${b.pnr}${seg.number}${seg.seats[pi]}${p.last}`)}<small>${esc(o.name)} → ${esc(d.name)}</small></footer>
    </div>
    <div class="tk-stub">
      <span class="tk-brand-sm">${esc(a.name)}</span>
      <div class="stub-route"><strong>${seg.origin}</strong> ✈ <strong>${seg.dest}</strong></div>
      <dl>
        <dt>Pasajero</dt><dd>${esc(name)}</dd>
        <dt>Vuelo</dt><dd>${esc(seg.number)} · ${fmtDate(seg.date, 'short')}</dd>
        <dt>Salida</dt><dd>${timeStr(seg.depMin)}</dd>
        <dt>Asiento</dt><dd class="seat-big">${seg.seats[pi]}</dd>
        <dt>PNR</dt><dd>${b.pnr}</dd>
      </dl>
    </div>
  </article>`;
}

export function render(root, { parts, q }) {
  const pnr = (parts[1] || '').toUpperCase();
  const b = store.get().bookings.find((x) => x.pnr === pnr);
  if (!b) {
    root.innerHTML = `<section class="section narrow"><div class="card empty"><h2>Reserva no encontrada</h2><p class="muted">Este navegador no tiene la reserva ${esc(pnr)}.</p><a class="btn btn-primary" href="#/manage">Buscar mi reserva</a></div></section>`;
    return;
  }
  root.innerHTML = `
  <section class="section narrow">
    <div class="no-print">
      ${q.new ? `<div class="notice ok"><h2>¡Reserva confirmada!</h2><p>Tu código de reserva es <strong class="pnr">${b.pnr}</strong>. Guárdalo para consultar tu reserva más adelante.</p></div>` : `<h1>Reserva ${b.pnr}</h1>`}
      <p class="muted">Total: <strong>${money(b.total)}</strong> · ${b.passengers.length} pasajero${b.passengers.length > 1 ? 's' : ''} · ${b.segments.length} vuelo${b.segments.length > 1 ? 's' : ''}</p>
      <div class="actions">
        <button class="btn btn-primary" id="print">Imprimir / guardar PDF</button>
        <button class="btn btn-outline" id="cancel">Cancelar reserva</button>
      </div>
    </div>
    <div class="tickets">
      ${b.segments.map((s) => b.passengers.map((_, pi) => ticketHtml(b, s, pi)).join('')).join('')}
    </div>
  </section>`;
  $('#print', root).onclick = () => window.print();
  $('#cancel', root).onclick = () => {
    if (!confirm(`¿Cancelar la reserva ${b.pnr}? Se liberarán los asientos.`)) return;
    const s = store.get();
    s.bookings = s.bookings.filter((x) => x.pnr !== b.pnr);
    store.save();
    toast('Reserva cancelada');
    go('/manage');
  };
}
