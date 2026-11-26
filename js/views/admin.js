import * as store from '../store.js';
import { $, $$, esc, airport, allAirports, timeSelect, readTime } from '../util.js';
import { formatHM, REFUEL_OPTIONS, calculate, autoSchedule, CLASS_NAMES } from '../calc.js';
import { DAY_LABELS, seatSummary } from '../schedule.js';
import { go, toast, applyBrand } from '../nav.js';

const TABS = [['airline', 'Aerolínea'], ['fleet', 'Flota'], ['routes', 'Rutas'], ['data', 'Datos']];
const CLS = ['F', 'B', 'W', 'Y'];

export function render(root, { parts }) {
  const tab = parts[1] || 'routes';
  const sub = parts[2];
  const body = { airline, fleet, routes, route: routeForm, data }[tab] || routes;
  root.innerHTML = `
  <section class="section">
    <h1>Administración</h1>
    <nav class="tabs">${TABS.map(([k, l]) => `<a href="#/admin/${k}" class="${tab === k || (tab === 'route' && k === 'routes') ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div id="admin-body"></div>
  </section>`;
  body($('#admin-body', root), sub);
}

// ---------- Aerolínea ----------
function airline(el) {
  const a = store.get().airline;
  el.innerHTML = `<form class="card form" id="f">
    <label>Nombre<input name="name" value="${esc(a.name)}" required></label>
    <label>Código (2–3 letras, prefijo de los vuelos)<input name="code" value="${esc(a.code)}" maxlength="3" required pattern="[A-Za-z0-9]{2,3}" style="text-transform:uppercase"></label>
    <label>Lema<input name="tagline" value="${esc(a.tagline)}"></label>
    <label>Color de marca<input type="color" name="color" value="${esc(a.color)}"></label>
    <label>Símbolo de moneda<input name="currency" value="${esc(a.currency)}" maxlength="4" required></label>
    <button class="btn btn-primary">Guardar</button></form>`;
  $('#f', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    Object.assign(store.get().airline, { name: f.name.value.trim(), code: f.code.value.trim().toUpperCase(), tagline: f.tagline.value.trim(), color: f.color.value, currency: f.currency.value.trim() });
    store.save(); applyBrand(); toast('Aerolínea guardada');
  });
}

// ---------- Flota ----------
function fleet(el) {
  const s = store.get();
  el.innerHTML = `
  <div class="card table-wrap"><table>
    <thead><tr><th>Modelo</th><th>Configuración</th><th>Asientos</th><th></th></tr></thead>
    <tbody>${s.aircraft.map((a) => `<tr><td><strong>${esc(a.name)}</strong></td>
      <td>${CLS.map((c) => { const x = a.config.find((k) => k.cls === c); return x?.count ? `${c}${x.count} <span class="muted">(${x.layout})</span>` : ''; }).filter(Boolean).join(' · ')}</td>
      <td>${a.config.reduce((t, c) => t + c.count, 0)}</td>
      <td class="nowrap"><button class="btn btn-outline btn-sm" data-edit="${a.id}">Editar</button> <button class="btn btn-link btn-sm" data-del="${a.id}">Borrar</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin aviones.</td></tr>'}</tbody></table></div>
  <button class="btn btn-primary" id="add">+ Añadir avión</button><div id="form"></div>`;
  const open = (a) => {
    a ||= { id: store.uid(), name: '', wiki: '', config: CLS.map((c) => ({ cls: c, count: 0, layout: c === 'Y' ? '3-3' : c === 'W' ? '2-2' : '1-1' })) };
    const isNew = !s.aircraft.some((x) => x.id === a.id);
    $('#form', el).innerHTML = `<form class="card form" id="af"><h2>${isNew ? 'Nuevo avión' : 'Editar avión'}</h2>
      <label>Nombre / modelo<input name="name" value="${esc(a.name)}" required placeholder="Airbus A320"></label>
      <label>Artículo de Wikipedia para la imagen (opcional)<input name="wiki" value="${esc(a.wiki || '')}" placeholder="Airbus A320"></label>
      <p class="muted small">Asientos por clase y distribución por fila (p. ej. <code>3-3</code> o <code>3-4-3</code>; el guion es el pasillo). Las clases se ordenan F, B, W, Y de delante hacia atrás.</p>
      ${CLS.map((c) => { const x = a.config.find((k) => k.cls === c) || { count: 0, layout: '3-3' }; return `<div class="row cfg"><strong>${c}</strong>
        <label>Asientos<input type="number" min="0" name="n-${c}" value="${x.count}"></label>
        <label>Distribución<input name="l-${c}" value="${esc(x.layout)}" pattern="\\d(-\\d)*"></label></div>`; }).join('')}
      <div class="row"><button class="btn btn-primary">Guardar</button><button type="button" class="btn btn-link" id="cancel">Cancelar</button></div></form>`;
    $('#cancel', el).onclick = () => { $('#form', el).innerHTML = ''; };
    $('#af', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const next = { id: a.id, name: f.name.value.trim(), wiki: f.wiki.value.trim(), config: CLS.map((c) => ({ cls: c, count: Math.max(0, parseInt(f[`n-${c}`].value, 10) || 0), layout: f[`l-${c}`].value.trim() || '3-3' })) };
      if (!next.config.some((c) => c.count)) { toast('Añade al menos un asiento'); return; }
      const i = s.aircraft.findIndex((x) => x.id === a.id);
      if (i >= 0) s.aircraft[i] = next; else s.aircraft.push(next);
      store.save(); fleet(el); toast('Avión guardado');
    });
  };
  $('#add', el).onclick = () => open();
  $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => open(s.aircraft.find((a) => a.id === b.dataset.edit))));
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', () => {
    if (s.routes.some((r) => r.aircraftId === b.dataset.del)) { toast('Hay rutas que usan este avión'); return; }
    if (!confirm('¿Borrar este avión?')) return;
    s.aircraft = s.aircraft.filter((a) => a.id !== b.dataset.del); store.save(); fleet(el);
  }));
}

// ---------- Rutas ----------
function routes(el) {
  const s = store.get();
  el.innerHTML = `
  <div class="card table-wrap"><table>
    <thead><tr><th>Ruta</th><th>Avión</th><th>Tiempos</th><th>Vuelos</th><th></th></tr></thead>
    <tbody>${s.routes.map((r) => {
      const ac = s.aircraft.find((a) => a.id === r.aircraftId);
      return `<tr><td><strong>${r.origin} ⇄ ${r.dest}</strong><br><span class="muted">${esc(airport(r.origin).city)} – ${esc(airport(r.dest).city)}</span></td>
      <td>${esc(ac?.name || '—')}<br><span class="muted">${ac ? seatSummary(ac.config) : ''}</span></td>
      <td>${formatHM(r.t1)} / ${formatHM(r.t2)} · R ${formatHM(r.r1)}</td>
      <td>${r.rotations.map((x) => `${s.airline.code}${x.outNo}/${x.retNo}`).join(', ')}</td>
      <td class="nowrap"><a class="btn btn-outline btn-sm" href="#/admin/route/${r.id}">Editar</a> <button class="btn btn-link btn-sm" data-del="${r.id}">Borrar</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Sin rutas. Usa la calculadora o crea una a mano.</td></tr>'}</tbody></table></div>
  <div class="row"><a class="btn btn-primary" href="#/admin/route/new">+ Nueva ruta</a><a class="btn btn-outline" href="#/calculator">Ir a la calculadora</a></div>`;
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', () => {
    const r = s.routes.find((x) => x.id === b.dataset.del);
    if (!confirm(`¿Borrar la ruta ${r.origin}-${r.dest}? Las reservas existentes se conservan.`)) return;
    s.routes = s.routes.filter((x) => x.id !== r.id); store.save(); routes(el);
  }));
}

function nextNumber(s) {
  const all = s.routes.flatMap((r) => r.rotations.flatMap((x) => [x.outNo, x.retNo]));
  return all.length ? Math.max(...all) + 1 : 100;
}

function routeForm(el, id) {
  const s = store.get();
  const existing = s.routes.find((r) => r.id === id);
  let draft = null;
  if (!existing) { try { draft = JSON.parse(sessionStorage.getItem('airsim.draft')); } catch { /* sin borrador */ } }

  const r = existing || {
    id: store.uid(), origin: '', dest: '', aircraftId: s.aircraft[0]?.id || '',
    t1: draft?.t1 || 120, t2: draft?.t2 || 120, r1: draft?.r1 || 60, prices: { Y: 0, W: 0, B: 0, F: 0 }, rotations: [],
  };
  if (draft && !existing) {
    r.rotations = autoSchedule({ mode: draft.mode, perPeriod: draft.perPeriod, aircraft: draft.aircraft, rt: draft.rt, startNumber: nextNumber(s) }).map((x) => ({ id: store.uid(), ...x }));
  }
  const dl = Object.values(allAirports()).sort((a, b) => a.iata.localeCompare(b.iata));

  el.innerHTML = `
  ${draft && !existing ? `<div class="notice">Datos de la calculadora: <strong>${draft.aircraft}</strong> avión(es). Asientos necesarios por vuelo →
    ${CLS.map((c) => `<b>${c}${draft.seats[c]}</b>`).join(' ')}. Elige un avión de tu flota con esa configuración (o créalo en Flota).</div>` : ''}
  <form class="card form" id="rf">
    <h2>${existing ? 'Editar ruta' : 'Nueva ruta'}</h2>
    <datalist id="apts">${dl.map((a) => `<option value="${a.iata}">${esc(a.city)} · ${esc(a.name)}</option>`).join('')}</datalist>
    <div class="row">
      <label>Origen (IATA)<input name="o" list="apts" value="${esc(r.origin)}" maxlength="3" required style="text-transform:uppercase"></label>
      <label>Destino (IATA)<input name="d" list="apts" value="${esc(r.dest)}" maxlength="3" required style="text-transform:uppercase"></label>
      <label>Avión<select name="ac" required>${s.aircraft.map((a) => `<option value="${a.id}" ${a.id === r.aircraftId ? 'selected' : ''}>${esc(a.name)} (${seatSummary(a.config)})</option>`).join('')}</select></label>
    </div>
    <div id="newapts"></div>
    <div class="row">
      <div class="field"><span class="lbl">T1 · ida</span>${timeSelect('t1', r.t1)}</div>
      <div class="field"><span class="lbl">T2 · vuelta</span>${timeSelect('t2', r.t2)}</div>
      <div class="field"><span class="lbl">R1 · refuelling</span><select name="r1">${REFUEL_OPTIONS.map((m) => `<option value="${m}" ${m === r.r1 ? 'selected' : ''}>${formatHM(m)}</option>`).join('')}</select></div>
    </div>
    <h3>Precio por pasajero y tramo (${esc(s.airline.currency)}) <small class="muted">— 0 = clase no disponible</small></h3>
    <div class="row">${CLS.map((c) => `<label>${c} · ${CLASS_NAMES[c]}<input type="number" min="0" name="p-${c}" value="${r.prices[c] || 0}"></label>`).join('')}</div>

    <h3>Programación semanal</h3>
    <p class="muted small">Cada fila es una rotación: ida (nº de vuelo + hora de salida) y vuelta. La vuelta sale por defecto tras T1 + R1. Marca los días de salida de la ida (L–D).</p>
    <div class="table-wrap"><table id="rot"><thead><tr><th>Ida</th><th>Vuelta</th><th>Sale (ida)</th><th>Días</th><th></th></tr></thead><tbody></tbody></table></div>
    <div class="row"><button type="button" class="btn btn-outline btn-sm" id="addrot">+ Rotación</button>
      <details class="auto"><summary>Generar programación automática</summary>
        <div class="row"><label>Aviones<input type="number" id="g-n" min="1" max="12" value="${draft?.aircraft || 1}"></label>
        <label>Primera salida<input type="time" id="g-t" value="08:00" step="300"></label>
        <label>Primer nº de vuelo<input type="number" id="g-num" value="${nextNumber(s)}"></label>
        <button type="button" class="btn btn-outline btn-sm" id="gen">Generar</button></div></details></div>
    <p class="muted small" id="err" role="alert"></p>
    <div class="row"><button class="btn btn-primary">Guardar ruta</button><a class="btn btn-link" href="#/admin/routes">Cancelar</a></div>
  </form>`;

  const tbody = $('#rot tbody', el);
  let rows = r.rotations.map((x) => ({ ...x }));
  const drawRows = () => {
    tbody.innerHTML = rows.map((x, i) => `<tr data-i="${i}">
      <td><input class="num" type="number" data-k="outNo" value="${x.outNo}"></td>
      <td><input class="num" type="number" data-k="retNo" value="${x.retNo}"></td>
      <td><input type="time" step="300" data-k="outDep" value="${x.outDep}"></td>
      <td class="days">${DAY_LABELS.map((l, d) => `<label class="day"><input type="checkbox" data-d="${d}" ${x.days.includes(d) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</td>
      <td><button type="button" class="btn btn-link btn-sm" data-rm="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin rotaciones.</td></tr>';
  };
  drawRows();
  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const x = rows[Number(tr.dataset.i)];
    if (e.target.dataset.k) x[e.target.dataset.k] = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    if (e.target.dataset.d !== undefined) {
      const d = Number(e.target.dataset.d);
      x.days = e.target.checked ? [...new Set([...x.days, d])].sort() : x.days.filter((k) => k !== d);
    }
  });
  tbody.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { rows.splice(Number(b.dataset.rm), 1); drawRows(); } });
  $('#addrot', el).onclick = () => {
    const n = rows.length ? Math.max(...rows.flatMap((x) => [x.outNo, x.retNo])) + 1 : nextNumber(s);
    rows.push({ id: store.uid(), outNo: n, retNo: n + 1, outDep: '08:00', days: [0, 1, 2, 3, 4, 5, 6] });
    drawRows();
  };
  $('#gen', el).onclick = () => {
    const f = $('#rf', el);
    const t1 = readTime(f, 't1'); const t2 = readTime(f, 't2'); const r1 = Number(f.r1.value);
    const c = calculate({ t1, t2, r1, demand: {} });
    if (c.error) { $('#err', el).textContent = c.error; return; }
    const [h, m] = $('#g-t', el).value.split(':').map(Number);
    rows = autoSchedule({ mode: c.mode, perPeriod: c.perPeriod, aircraft: Number($('#g-n', el).value) || 1, rt: c.rt, firstDep: h * 60 + m, startNumber: Number($('#g-num', el).value) || 100 })
      .map((x) => ({ id: store.uid(), ...x }));
    drawRows(); $('#err', el).textContent = '';
  };

  // aeropuertos desconocidos: pedir ciudad y país
  const f = $('#rf', el);
  const checkApts = () => {
    const missing = [f.o.value, f.d.value].map((v) => v.trim().toUpperCase()).filter((c, i, a) => c.length === 3 && !allAirports()[c] && a.indexOf(c) === i);
    $('#newapts', el).innerHTML = missing.map((c) => `<fieldset class="row newapt" data-code="${c}"><legend>Aeropuerto nuevo ${c}</legend>
      <label>Ciudad<input name="city" required></label><label>País (ISO-2, ej. ES)<input name="cc" maxlength="2" required style="text-transform:uppercase"></label>
      <label>Nombre del aeropuerto<input name="name"></label></fieldset>`).join('');
  };
  f.o.addEventListener('change', checkApts); f.d.addEventListener('change', checkApts); checkApts();

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('#err', el);
    const o = f.o.value.trim().toUpperCase(); const d = f.d.value.trim().toUpperCase();
    if (o.length !== 3 || d.length !== 3 || o === d) { err.textContent = 'Indica dos códigos IATA distintos de 3 letras.'; return; }
    if (!f.ac.value) { err.textContent = 'Primero crea un avión en Flota.'; return; }
    if (!rows.length || rows.some((x) => !x.days.length || !x.outDep)) { err.textContent = 'Cada rotación necesita hora de salida y al menos un día.'; return; }
    const nums = rows.flatMap((x) => [x.outNo, x.retNo]);
    const others = new Set(s.routes.filter((x) => x.id !== r.id).flatMap((x) => x.rotations.flatMap((k) => [k.outNo, k.retNo])));
    if (new Set(nums).size !== nums.length || nums.some((n) => others.has(n))) { err.textContent = 'Hay números de vuelo repetidos.'; return; }
    const t1 = readTime(f, 't1'); const t2 = readTime(f, 't2');
    if (!t1 || !t2) { err.textContent = 'T1 y T2 deben ser mayores que 0.'; return; }
    $$('.newapt', el).forEach((fs) => {
      s.customAirports[fs.dataset.code] = { iata: fs.dataset.code, city: fs.city.value.trim(), cc: fs.cc.value.trim().toUpperCase(), name: fs.name.value.trim() };
    });
    const next = {
      id: r.id, origin: o, dest: d, aircraftId: f.ac.value, t1, t2, r1: Number(f.r1.value),
      prices: Object.fromEntries(CLS.map((c) => [c, Math.max(0, Number(f[`p-${c}`].value) || 0)])),
      rotations: rows.map((x) => ({ id: x.id || store.uid(), outNo: x.outNo, retNo: x.retNo, outDep: x.outDep, days: x.days })),
    };
    const i = s.routes.findIndex((x) => x.id === r.id);
    if (i >= 0) s.routes[i] = next; else s.routes.push(next);
    store.save();
    sessionStorage.removeItem('airsim.draft');
    toast('Ruta guardada');
    go('/admin/routes');
  });
}

// ---------- Datos ----------
function data(el) {
  const s = store.get();
  el.innerHTML = `<div class="card form">
    <p>Los datos se guardan en <strong>este navegador</strong> (localStorage). Para publicarlos con tu web, exporta el JSON y guárdalo como <code>data/seed.json</code> en el repositorio: se cargará la primera vez que alguien abra la web.</p>
    <div class="row"><button class="btn btn-primary" id="exp">Exportar JSON</button>
      <label class="btn btn-outline">Importar JSON<input type="file" id="imp" accept="application/json" hidden></label></div>
    <hr><div class="row"><button class="btn btn-outline" id="demo">Restaurar datos de ejemplo</button>
    <button class="btn btn-outline" id="nobk">Borrar todas las reservas (${s.bookings.length})</button></div></div>`;
  $('#exp', el).onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' }));
    a.download = 'seed.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#imp', el).addEventListener('change', async (e) => {
    try { store.replace(JSON.parse(await e.target.files[0].text())); applyBrand(); toast('Datos importados'); data(el); } catch { toast('Archivo no válido'); }
  });
  $('#demo', el).onclick = () => { if (confirm('Se sustituirán tus datos por los de ejemplo.')) { store.resetDemo(); applyBrand(); toast('Datos de ejemplo restaurados'); data(el); } };
  $('#nobk', el).onclick = () => { if (confirm('¿Borrar todas las reservas?')) { s.bookings = []; store.save(); data(el); } };
}
