import * as store from '../store.js';
import { $, $$, esc, airport, allAirports, timeSelect, readTime } from '../util.js';
import { formatHM, REFUEL_OPTIONS, calculate, autoSchedule, CLASS_NAMES } from '../calc.js';
import { DAY_LABELS, seatSummary, isConfigured } from '../schedule.js';
import { AIRCRAFT_GROUPS, aircraftById } from '../aircraft.js';
import { go, toast, applyBrand, switchUrl } from '../nav.js';

const TABS = [['routes', 'Rutas'], ['airline', 'Aerolínea'], ['data', 'Datos']];
const CLS = ['F', 'B', 'W', 'Y'];

export function render(root, { parts }) {
  const tab = parts[1] || 'routes';
  const sub = parts[2];
  const body = { airline, routes, route: routeForm, data }[tab] || routes;
  root.innerHTML = `
  <section class="section">
    <h1>Administración <small class="muted">· ${esc(store.get().airline.name)}</small></h1>
    <nav class="tabs">${TABS.map(([k, l]) => `<a href="#/admin/${k}" class="${tab === k || (tab === 'route' && k === 'routes') ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div id="admin-body"></div>
  </section>`;
  body($('#admin-body', root), sub);
}

// ---------- Aerolínea (datos de la actual + gestión de todas) ----------
function airline(el) {
  const a = store.get().airline;
  const all = store.list();
  const cur = store.currentId();
  el.innerHTML = `
  <form class="card form" id="f">
    <h2>Esta aerolínea</h2>
    <label>Nombre<input name="name" value="${esc(a.name)}" required maxlength="40"></label>
    <label>Código de vuelo (2–3 letras o números; prefijo de los números de vuelo)<input name="code" value="${esc(a.code)}" maxlength="3" required pattern="[A-Za-z0-9]{2,3}" style="text-transform:uppercase"></label>
    <label>Lema<input name="tagline" value="${esc(a.tagline)}" maxlength="80"></label>
    <div class="row"><label>Color de marca<input type="color" name="color" value="${esc(a.color)}"></label>
    <label>Símbolo de moneda<input name="currency" value="${esc(a.currency)}" maxlength="4" required></label></div>
    <p class="muted small">Al cambiar el código, los números de vuelo de las reservas ya hechas conservan el código anterior.</p>
    <button class="btn btn-primary">Guardar</button></form>

  <div class="card">
    <h2>Mis aerolíneas <small class="muted">(${all.length}/${store.MAX_AIRLINES})</small></h2>
    <p class="muted small">Cada aerolínea tiene sus propias rutas y reservas. Puedes abrir varias en pestañas distintas a la vez.</p>
    <div class="table-wrap"><table><tbody>${all.map((x) => `<tr>
      <td><span class="logo-mark" style="background:${esc(x.color)}">${esc(x.code)}</span></td>
      <td><strong>${esc(x.name)}</strong> ${x.id === cur ? '<span class="tag">activa</span>' : ''}</td>
      <td class="nowrap">${x.id === cur ? '' : `<a class="btn btn-outline btn-sm" href="${switchUrl(x.id, '#/admin/routes')}">Abrir</a> <a class="btn btn-outline btn-sm" href="${switchUrl(x.id, '#/admin/routes')}" target="_blank" rel="noopener">En pestaña nueva</a> `}
      <button class="btn btn-link btn-sm" data-del="${x.id}">Eliminar</button></td></tr>`).join('')}</tbody></table></div>
    ${all.length < store.MAX_AIRLINES ? '<a class="btn btn-primary" href="#/welcome?new=1">+ Nueva aerolínea</a>' : '<p class="muted small">Máximo de 6 aerolíneas alcanzado.</p>'}
  </div>`;

  $('#f', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const code = f.code.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,3}$/.test(code)) { toast('El código debe tener 2 o 3 letras/números'); return; }
    Object.assign(store.get().airline, { name: f.name.value.trim(), code, tagline: f.tagline.value.trim(), color: f.color.value, currency: f.currency.value.trim() });
    store.save(); applyBrand(); airline(el); toast('Aerolínea guardada');
  });
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', () => {
    const x = all.find((k) => k.id === b.dataset.del);
    if (!confirm(`¿Eliminar "${x.name}" con todas sus rutas y reservas? No se puede deshacer.`)) return;
    const left = store.deleteAirline(x.id);
    // recarga con otra query para que el estado en memoria no reescriba lo borrado
    location.href = left.length ? switchUrl(x.id === cur ? left[0] : cur, '#/admin/airline') : `${location.pathname}?x=0#/`;
  }));
}

// ---------- Rutas ----------
function routes(el) {
  const s = store.get();
  el.innerHTML = `
  <div class="card table-wrap"><table>
    <thead><tr><th>Ruta</th><th>Avión</th><th>Tiempos</th><th>Vuelos</th><th></th></tr></thead>
    <tbody>${s.routes.map((r) => {
      const ok = isConfigured(r.aircraft?.config);
      return `<tr><td><strong>${r.origin} ⇄ ${r.dest}</strong><br><span class="muted">${esc(airport(r.origin).city)} – ${esc(airport(r.dest).city)}</span></td>
      <td>${esc(r.aircraft?.name || '—')} <span class="muted">× ${r.aircraftCount || 1}</span><br>
        ${ok ? `<span class="muted">${seatSummary(r.aircraft.config)}</span>` : '<span class="pending">Falta la configuración de asientos</span>'}</td>
      <td>${formatHM(r.t1)} / ${formatHM(r.t2)} · R ${formatHM(r.r1)}</td>
      <td>${r.rotations.map((x) => `${s.airline.code}${x.outNo}/${x.retNo}`).join(', ')}</td>
      <td class="nowrap"><a class="btn ${ok ? 'btn-outline' : 'btn-primary'} btn-sm" href="#/admin/route/${r.id}">${ok ? 'Editar' : 'Configurar asientos'}</a> <button class="btn btn-link btn-sm" data-del="${r.id}">Borrar</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Sin rutas. Empieza por la calculadora.</td></tr>'}</tbody></table></div>
  <div class="row"><a class="btn btn-primary" href="#/calculator">Calcular y crear ruta</a><a class="btn btn-outline" href="#/admin/route/new">+ Ruta manual</a></div>`;
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

const LAYOUT_RE = /^[1-9](-[1-9])*$/;

function routeForm(el, id) {
  const s = store.get();
  const existing = s.routes.find((r) => r.id === id);
  let draft = null;
  if (!existing) { try { draft = JSON.parse(sessionStorage.getItem('airsim.draft')); } catch { /* sin borrador */ } }

  const r = existing || {
    id: store.uid(), origin: '', dest: '', aircraftCount: draft?.aircraft || 1,
    aircraft: { model: '', name: '', wiki: '', config: null },
    t1: draft?.t1 || 120, t2: draft?.t2 || 120, r1: draft?.r1 || 60, prices: { Y: 0, W: 0, B: 0, F: 0 }, rotations: [],
  };
  if (draft && !existing) {
    r.rotations = autoSchedule({ mode: draft.mode, perPeriod: draft.perPeriod, aircraft: draft.aircraft, rt: draft.rt, startNumber: nextNumber(s) }).map((x) => ({ id: store.uid(), ...x }));
  }
  const dl = Object.values(allAirports()).sort((a, b) => a.iata.localeCompare(b.iata));
  const cfg = (c) => r.aircraft.config?.find((x) => x.cls === c);

  el.innerHTML = `
  ${draft && !existing ? `<div class="notice">Datos de la calculadora para <strong>${draft.aircraft}</strong> avión(es). Asientos necesarios por vuelo →
    ${CLS.map((c) => `<b>${c}${draft.seats[c]}</b>`).join(' ')}. Elige el modelo y, cuando tengas la configuración del avión en el juego, indícala abajo (puedes hacerlo más tarde).</div>` : ''}
  <form class="card form" id="rf">
    <h2>${existing ? 'Editar ruta' : 'Nueva ruta'}</h2>
    <datalist id="apts">${dl.map((a) => `<option value="${a.iata}">${esc(a.city)} · ${esc(a.name)}</option>`).join('')}</datalist>
    <div class="row">
      <label>Origen (IATA)<input name="o" list="apts" value="${esc(r.origin)}" maxlength="3" required style="text-transform:uppercase"></label>
      <label>Destino (IATA)<input name="d" list="apts" value="${esc(r.dest)}" maxlength="3" required style="text-transform:uppercase"></label>
    </div>
    <div id="newapts"></div>

    <div class="row">
      <label>Modelo de avión<select name="model" required>
        <option value="">— Elige un modelo —</option>
        ${AIRCRAFT_GROUPS.map((g) => `<optgroup label="${esc(g.group)}">${g.models.map(([mid, name]) => `<option value="${mid}" ${r.aircraft.model === mid ? 'selected' : ''}>${esc(name)}</option>`).join('')}</optgroup>`).join('')}
        <option value="custom" ${r.aircraft.model === 'custom' ? 'selected' : ''}>Otro (escribir nombre)…</option></select></label>
      <label id="custom-wrap" ${r.aircraft.model === 'custom' ? '' : 'hidden'}>Nombre del modelo<input name="customName" value="${esc(r.aircraft.model === 'custom' ? r.aircraft.name : '')}"></label>
      <label>Nº de aviones en la ruta<input type="number" name="count" min="1" max="12" value="${r.aircraftCount || 1}"></label>
    </div>

    <div class="row">
      <div class="field"><span class="lbl">T1 · ida</span>${timeSelect('t1', r.t1)}</div>
      <div class="field"><span class="lbl">T2 · vuelta</span>${timeSelect('t2', r.t2)}</div>
      <div class="field"><span class="lbl">R1 · refuelling</span><select name="r1">${REFUEL_OPTIONS.map((m) => `<option value="${m}" ${m === r.r1 ? 'selected' : ''}>${formatHM(m)}</option>`).join('')}</select></div>
    </div>

    <h3>Configuración de asientos del avión</h3>
    <p class="muted small">Se aporta después de la calculadora, con la configuración que montes en el juego. Mientras esté vacía, la ruta queda <b>pendiente</b> y no se vende.
      En <i>distribución</i> escribe los asientos por fila con el pasillo como guion (<code>3-3</code>, <code>2-4-2</code>…).${draft && !existing ? ` Necesitas ${CLS.map((c) => `${c}${draft.seats[c]}`).join(' ')} por vuelo.` : ''}</p>
    ${CLS.map((c) => `<div class="row cfg"><strong title="${CLASS_NAMES[c]}">${c}</strong>
      <label>Asientos ${CLASS_NAMES[c]}<input type="number" min="0" name="n-${c}" value="${cfg(c)?.count || ''}" placeholder="0"></label>
      <label>Distribución por fila<input name="l-${c}" value="${esc(cfg(c)?.count ? cfg(c).layout : '')}" placeholder="p. ej. 3-3"></label></div>`).join('')}

    <h3>Precio por pasajero y tramo (${esc(s.airline.currency)}) <small class="muted">— 0 = clase no disponible</small></h3>
    <div class="row">${CLS.map((c) => `<label>${c} · ${CLASS_NAMES[c]}<input type="number" min="0" name="p-${c}" value="${r.prices[c] || 0}"></label>`).join('')}</div>

    <h3>Programación semanal</h3>
    <p class="muted small">Cada fila es una rotación: ida (nº de vuelo + hora de salida) y vuelta. La vuelta sale por defecto tras T1 + R1. Marca los días de salida de la ida (L–D).</p>
    <div class="table-wrap"><table id="rot"><thead><tr><th>Ida</th><th>Vuelta</th><th>Sale (ida)</th><th>Días</th><th></th></tr></thead><tbody></tbody></table></div>
    <div class="row"><button type="button" class="btn btn-outline btn-sm" id="addrot">+ Rotación</button>
      <details class="auto"><summary>Generar programación automática</summary>
        <div class="row"><label>Primera salida<input type="time" id="g-t" value="08:00" step="300"></label>
        <label>Primer nº de vuelo<input type="number" id="g-num" value="${nextNumber(s)}"></label>
        <button type="button" class="btn btn-outline btn-sm" id="gen">Generar con los tiempos y nº de aviones de arriba</button></div></details></div>
    <p class="muted small" id="err" role="alert"></p>
    <div class="row"><button class="btn btn-primary">Guardar ruta</button><a class="btn btn-link" href="#/admin/routes">Cancelar</a></div>
  </form>`;

  const f = $('#rf', el);
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
    const c = calculate({ t1: readTime(f, 't1'), t2: readTime(f, 't2'), r1: Number(f.r1.value), demand: {} });
    if (c.error) { $('#err', el).textContent = c.error; return; }
    const [h, m] = $('#g-t', el).value.split(':').map(Number);
    rows = autoSchedule({ mode: c.mode, perPeriod: c.perPeriod, aircraft: Math.max(1, Number(f.count.value) || 1), rt: c.rt, firstDep: h * 60 + m, startNumber: Number($('#g-num', el).value) || 100 })
      .map((x) => ({ id: store.uid(), ...x }));
    drawRows(); $('#err', el).textContent = '';
  };

  f.model.addEventListener('change', () => { $('#custom-wrap', el).hidden = f.model.value !== 'custom'; });

  // aeropuertos desconocidos: pedir ciudad y país
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
    if (!f.model.value) { err.textContent = 'Elige el modelo de avión.'; return; }
    if (f.model.value === 'custom' && !f.customName.value.trim()) { err.textContent = 'Escribe el nombre del modelo.'; return; }
    if (!rows.length || rows.some((x) => !x.days.length || !x.outDep)) { err.textContent = 'Cada rotación necesita hora de salida y al menos un día.'; return; }
    const nums = rows.flatMap((x) => [x.outNo, x.retNo]);
    const others = new Set(s.routes.filter((x) => x.id !== r.id).flatMap((x) => x.rotations.flatMap((k) => [k.outNo, k.retNo])));
    if (new Set(nums).size !== nums.length || nums.some((n) => others.has(n))) { err.textContent = 'Hay números de vuelo repetidos.'; return; }
    const t1 = readTime(f, 't1'); const t2 = readTime(f, 't2');
    if (!t1 || !t2) { err.textContent = 'T1 y T2 deben ser mayores que 0.'; return; }

    // configuración de asientos: vacía = ruta pendiente; si hay asientos, cada clase usada necesita distribución válida
    const config = CLS.map((c) => ({ cls: c, count: Math.max(0, parseInt(f[`n-${c}`].value, 10) || 0), layout: f[`l-${c}`].value.trim() }));
    const bad = config.find((c) => c.count > 0 && !LAYOUT_RE.test(c.layout));
    if (bad) { err.textContent = `Clase ${bad.cls}: indica la distribución por fila (por ejemplo 3-3 o 2-4-2).`; return; }
    const configured = config.some((c) => c.count > 0);

    const cat = aircraftById(f.model.value);
    const aircraft = f.model.value === 'custom'
      ? { model: 'custom', name: f.customName.value.trim(), wiki: f.customName.value.trim(), config: configured ? config : null }
      : { model: cat.id, name: cat.name, wiki: cat.wiki, config: configured ? config : null };

    $$('.newapt', el).forEach((fs) => {
      s.customAirports[fs.dataset.code] = { iata: fs.dataset.code, city: fs.city.value.trim(), cc: fs.cc.value.trim().toUpperCase(), name: fs.name.value.trim() };
    });
    const next = {
      id: r.id, origin: o, dest: d, aircraft, aircraftCount: Math.max(1, Number(f.count.value) || 1), t1, t2, r1: Number(f.r1.value),
      prices: Object.fromEntries(CLS.map((c) => [c, Math.max(0, Number(f[`p-${c}`].value) || 0)])),
      rotations: rows.map((x) => ({ id: x.id || store.uid(), outNo: x.outNo, retNo: x.retNo, outDep: x.outDep, days: x.days })),
    };
    const i = s.routes.findIndex((x) => x.id === r.id);
    if (i >= 0) s.routes[i] = next; else s.routes.push(next);
    store.save();
    sessionStorage.removeItem('airsim.draft');
    toast(configured ? 'Ruta guardada' : 'Ruta guardada: falta la configuración de asientos para venderla');
    go('/admin/routes');
  });
}

// ---------- Datos ----------
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function data(el) {
  const s = store.get();
  el.innerHTML = `<div class="card form">
    <p>Los datos se guardan en <strong>este navegador</strong>. Para publicarlos con tu web, exporta el JSON y guárdalo como <code>data/seed.json</code> en el repositorio: se cargará la primera vez que alguien abra la web.</p>
    <div class="row"><button class="btn btn-primary" id="exp">Exportar esta aerolínea</button>
      <button class="btn btn-outline" id="expall">Exportar todas (${store.list().length})</button>
      <label class="btn btn-outline">Importar JSON<input type="file" id="imp" accept="application/json" hidden></label></div>
    <p class="muted small">Importar un archivo de <i>una</i> aerolínea sustituye los datos de la actual; uno de <i>varias</i> las añade a las que ya tienes.</p>
    <hr><button class="btn btn-outline" id="nobk">Borrar todas las reservas de esta aerolínea (${s.bookings.length})</button></div>`;
  $('#exp', el).onclick = () => download(`${s.airline.code.toLowerCase()}-seed.json`, store.exportCurrent());
  $('#expall', el).onclick = () => download('seed.json', store.exportAll());
  $('#imp', el).addEventListener('change', async (e) => {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (j.airlines) { toast(`${store.importAll(j)} aerolínea(s) importadas`); applyBrand(); }
      else if (confirm('Se sustituirán los datos de esta aerolínea por los del archivo.')) { store.replaceCurrent(j); applyBrand(); toast('Datos importados'); }
      data(el);
    } catch { toast('Archivo no válido'); }
  });
  $('#nobk', el).onclick = () => { if (confirm('¿Borrar todas las reservas?')) { s.bookings = []; store.save(); data(el); } };
}
