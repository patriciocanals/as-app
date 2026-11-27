import * as store from '../store.js';
import { $, $$, esc, airport, allAirports, timeSelect, readTime, todSelect, readTod } from '../util.js';
import { formatHM, REFUEL_OPTIONS, calculate, autoSchedule, CLASS_NAMES } from '../calc.js';
import { DAY_LABELS, seatSummary, isConfigured } from '../schedule.js';
import { AIRCRAFT_GROUPS, aircraftById } from '../aircraft.js';
import { go, toast, applyBrand, switchUrl } from '../nav.js';
import * as sync from '../sync.js';
import { countryList, autoAirportName, countryName } from '../airports.js';

const TABS = [['routes', 'Rutas'], ['airports', 'Aeropuertos'], ['airline', 'Aerolínea'], ['data', 'Datos']];
const CLS = ['F', 'B', 'W', 'Y'];

export function render(root, { parts }) {
  const tab = parts[1] || 'routes';
  const sub = parts[2];
  const body = { airline, routes, route: routeForm, airports: airportsTab, data }[tab] || routes;
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
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
    const x = all.find((k) => k.id === b.dataset.del);
    if (!confirm(`¿Eliminar "${x.name}" con todas sus rutas y reservas? No se puede deshacer.`)) return;
    const left = await store.deleteAirline(x.id);
    await sync.settle();
    // recarga con otra query para que el estado en memoria no reescriba lo borrado
    location.href = left.length ? switchUrl(x.id === cur ? left[0] : cur, '#/admin/airline') : `${location.pathname}?x=0#/`;
  }));
}

// ---------- Rutas: agrupadas por hub (origen), cada hub se despliega para ver sus destinos ----------
const PER_HUB = 30;
const RV = { q: '', origin: '', model: '', status: '', sort: 'route', hubOpen: new Set(), more: new Set(), allOpen: false, open: new Set() };
const DAYS_TXT = (days) => (days.length === 7 ? 'todos los días' : days.map((d) => DAY_LABELS[d]).join(' '));

function routes(el) {
  const s = store.get();
  const code = s.airline.code;
  const origins = [...new Set(s.routes.map((r) => r.origin))].sort();
  const models = [...new Set(s.routes.map((r) => r.aircraft?.name).filter(Boolean))].sort();
  const pendingCount = s.routes.filter((r) => !isConfigured(r.aircraft?.config)).length;

  el.innerHTML = `
  <div class="rt-toolbar card">
    <input type="search" id="rq" placeholder="Buscar: MAD, Londres, A320, ${esc(code)}100…" value="${esc(RV.q)}" aria-label="Buscar rutas">
    <select id="ro" aria-label="Hub"><option value="">Todos los hubs</option>${origins.map((o) => `<option value="${o}" ${RV.origin === o ? 'selected' : ''}>${o} · ${esc(airport(o).city)}</option>`).join('')}</select>
    <select id="rm" aria-label="Avión"><option value="">Todos los aviones</option>${models.map((m) => `<option ${RV.model === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
    <select id="rs" aria-label="Estado"><option value="">Todas</option><option value="ok" ${RV.status === 'ok' ? 'selected' : ''}>Operativas</option><option value="pending" ${RV.status === 'pending' ? 'selected' : ''}>Pendientes de asientos${pendingCount ? ` (${pendingCount})` : ''}</option></select>
    <select id="rsort" aria-label="Ordenar destinos"><option value="route" ${RV.sort === 'route' ? 'selected' : ''}>Destinos: por código</option><option value="aircraft" ${RV.sort === 'aircraft' ? 'selected' : ''}>Destinos: por avión</option><option value="pending" ${RV.sort === 'pending' ? 'selected' : ''}>Destinos: pendientes primero</option><option value="rot" ${RV.sort === 'rot' ? 'selected' : ''}>Destinos: más vuelos</option></select>
  </div>
  <div id="rlist"></div>
  <div class="row"><a class="btn btn-primary" href="#/calculator">Calcular y crear ruta</a><a class="btn btn-outline" href="#/admin/route/new">+ Ruta manual</a></div>`;

  const text = (r) => [r.origin, r.dest, airport(r.origin).city, airport(r.dest).city, r.aircraft?.name,
    ...r.rotations.flatMap((x) => [`${code}${x.outNo}`, `${code}${x.retNo}`])].join(' ').toLowerCase();
  const filtering = () => !!(RV.q || RV.origin || RV.model || RV.status);

  const draw = () => {
    const rows = s.routes.filter((r) => {
      const ok = isConfigured(r.aircraft?.config);
      return (!RV.q || RV.q.toLowerCase().split(/\s+/).every((t) => text(r).includes(t)))
        && (!RV.origin || r.origin === RV.origin) && (!RV.model || r.aircraft?.name === RV.model)
        && (!RV.status || (RV.status === 'ok') === ok);
    });
    const cmp = {
      route: (a, b) => a.dest.localeCompare(b.dest),
      aircraft: (a, b) => String(a.aircraft?.name).localeCompare(String(b.aircraft?.name)) || a.dest.localeCompare(b.dest),
      pending: (a, b) => Number(isConfigured(a.aircraft?.config)) - Number(isConfigured(b.aircraft?.config)) || a.dest.localeCompare(b.dest),
      rot: (a, b) => b.rotations.length - a.rotations.length || a.dest.localeCompare(b.dest),
    }[RV.sort];
    const groups = new Map();
    rows.sort(cmp).forEach((r) => { if (!groups.has(r.origin)) groups.set(r.origin, []); groups.get(r.origin).push(r); });
    const hubs = [...groups.keys()].sort();
    const featured = new Set(s.featuredHubs || []);

    const routeRows = (list, hub) => list.map((r) => {
      const ok = isConfigured(r.aircraft?.config);
      const open = RV.open.has(r.id);
      return `<tr class="rt-row ${open ? 'open' : ''}" data-id="${r.id}">
        <td><button class="exp" data-exp="${r.id}" aria-expanded="${open}" aria-label="Ver vuelos">${open ? '▾' : '▸'}</button>
          <strong>${hub} ⇄ ${r.dest}</strong> <span class="muted hide-sm">${esc(airport(r.dest).city)}</span></td>
        <td>${esc(r.aircraft?.name || '—')} <span class="muted">×${r.aircraftCount || 1}</span></td>
        <td class="hide-sm">${ok ? r.aircraft.config.filter((c) => c.count).map((c) => `${c.cls}${c.count}`).join(' ') : '<span class="pending">Pendiente</span>'}</td>
        <td class="hide-sm muted">${formatHM(r.t1)} / ${formatHM(r.t2)}</td>
        <td>${r.rotations.length}</td>
        <td class="nowrap"><a class="btn ${ok ? 'btn-outline' : 'btn-primary'} btn-sm" href="#/admin/route/${r.id}">${ok ? 'Editar' : 'Configurar'}</a>
          <button class="btn btn-link btn-sm" data-del="${r.id}" aria-label="Borrar ruta ${r.origin}-${r.dest}">✕</button></td></tr>
        ${open ? `<tr class="rt-detail"><td colspan="6"><div class="chips-flights">${r.rotations.map((x) =>
          `<span class="fchip"><b>${esc(code)}${x.outNo}/${x.retNo}</b> ${esc(x.outDep)} · ${DAYS_TXT(x.days)}</span>`).join('') || '<span class="muted">Sin vuelos programados</span>'}</div>
          <p class="muted small">R1 ${formatHM(r.r1)} · Precios: ${Object.entries(r.prices).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(' · ') || 'sin precios'}</p></td></tr>` : ''}`;
    }).join('');

    $('#rlist', el).innerHTML = `
    <div class="rt-count-row"><p class="muted small rt-count">${rows.length} de ${s.routes.length} ruta${s.routes.length === 1 ? '' : 's'} · ${hubs.length} hub${hubs.length === 1 ? '' : 's'}${pendingCount ? ` · <span class="pending">${pendingCount} pendiente${pendingCount > 1 ? 's' : ''} de configurar</span>` : ''}</p>
      ${hubs.length > 1 ? '<span><button class="btn btn-link btn-sm" data-all="1">Desplegar todos</button><button class="btn btn-link btn-sm" data-all="0">Plegar todos</button></span>' : ''}</div>
    ${hubs.map((h) => {
      const list = groups.get(h);
      const open = RV.allOpen || filtering() || RV.hubOpen.has(h);
      const flights = list.reduce((n, r) => n + r.rotations.length, 0);
      const pend = list.filter((r) => !isConfigured(r.aircraft?.config)).length;
      const shown = RV.more.has(h) ? list : list.slice(0, PER_HUB);
      return `<section class="card hubgrp ${open ? 'open' : ''}" data-hub="${h}">
        <header class="hubhead"><button class="hubtoggle" data-hubtoggle="${h}" aria-expanded="${open}">
          <span class="chev">${open ? '▾' : '▸'}</span> <strong>${h}</strong> <span class="hubcity">${esc(airport(h).city)}</span>
          <span class="muted small">· ${list.length} destino${list.length === 1 ? '' : 's'} · ${flights} vuelo${flights === 1 ? '' : 's'}${pend ? ` · <span class="pending">${pend} pendiente${pend > 1 ? 's' : ''}</span>` : ''}</span></button>
          <label class="feat" title="Muestra una tarjeta de ${esc(airport(h).city)} en la portada. No cuenta como destino exclusivo: se llega desde los destinos de sus rutas."><input type="checkbox" data-feat="${h}" ${featured.has(h) ? 'checked' : ''}> Anunciar hub en portada</label></header>
        ${open ? `<div class="table-wrap rt-card"><table class="rt">
          <thead><tr><th>Ruta</th><th>Avión</th><th class="hide-sm">Asientos</th><th class="hide-sm">T1 / T2</th><th>Vuelos</th><th></th></tr></thead>
          <tbody>${routeRows(shown, h)}</tbody></table>
          ${list.length > shown.length ? `<div class="more-wrap"><button class="btn btn-outline btn-sm" data-more="${h}">Mostrar los ${list.length} destinos</button></div>` : ''}</div>` : ''}
      </section>`;
    }).join('') || '<div class="card empty muted">Ninguna ruta coincide.</div>'}`;
  };

  const bind = (id, key, ev = 'change') => $(id, el).addEventListener(ev, (e) => { RV[key] = e.target.value; draw(); });
  bind('#rq', 'q', 'input'); bind('#ro', 'origin'); bind('#rm', 'model'); bind('#rs', 'status'); bind('#rsort', 'sort');

  $('#rlist', el).addEventListener('change', (e) => {
    const f = e.target.closest('[data-feat]');
    if (!f) return;
    const set = new Set(s.featuredHubs || []);
    if (f.checked) set.add(f.dataset.feat); else set.delete(f.dataset.feat);
    s.featuredHubs = [...set];
    store.save();
    toast(f.checked ? `${f.dataset.feat} se anunciará en la portada` : `${f.dataset.feat} ya no se anuncia`);
  });
  $('#rlist', el).addEventListener('click', (e) => {
    const exp = e.target.closest('[data-exp]');
    const hub = e.target.closest('[data-hubtoggle]');
    const more = e.target.closest('[data-more]');
    const all = e.target.closest('[data-all]');
    const del = e.target.closest('[data-del]');
    if (exp) { RV.open.has(exp.dataset.exp) ? RV.open.delete(exp.dataset.exp) : RV.open.add(exp.dataset.exp); draw(); }
    else if (hub) {
      const h = hub.dataset.hubtoggle;
      if (RV.allOpen) { RV.allOpen = false; RV.hubOpen = new Set([...new Set(s.routes.map((r) => r.origin))]); }
      RV.hubOpen.has(h) ? RV.hubOpen.delete(h) : RV.hubOpen.add(h);
      draw();
    } else if (more) { RV.more.add(more.dataset.more); draw(); }
    else if (all) { RV.allOpen = all.dataset.all === '1'; if (!RV.allOpen) RV.hubOpen.clear(); draw(); }
    else if (del) {
      const r = s.routes.find((x) => x.id === del.dataset.del);
      if (!confirm(`¿Borrar la ruta ${r.origin}-${r.dest}? Las reservas existentes se conservan.`)) return;
      s.routes = s.routes.filter((x) => x.id !== r.id); store.save(); routes(el);
    }
  });
  draw();
}

// ---------- Aeropuertos: editar ciudad, país y nombre (también los de la base) ----------
let editingApt = '';
let lastApt = { cc: '', kind: 'intl' }; // se recuerda el último país/tipo para no repetirlos
const countrySelect = (name, selected) => `<select name="${name}" required><option value="">— Elige el país —</option>${countryList().map((c) => `<option value="${c.cc}" ${c.cc === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;

function airportsTab(el) {
  const s = store.get();
  const used = new Set(s.routes.flatMap((r) => [r.origin, r.dest]));
  Object.keys(s.customAirports || {}).forEach((c) => used.add(c));
  const list = [...used].sort();
  el.innerHTML = `<div class="card form">
    <h2>Aeropuertos de tu red <small class="muted">(${list.length})</small></h2>
    <p class="muted small">Cambia el nombre de la ciudad, el país o el nombre del aeropuerto. La ciudad es la que se ve en la propaganda y la que se usa para buscar la foto.</p>
    <div class="table-wrap"><table class="rt"><thead><tr><th>IATA</th><th>Ciudad</th><th class="hide-sm">País</th><th class="hide-sm">Aeropuerto</th><th></th></tr></thead><tbody>
    ${list.map((c) => {
      const a = airport(c);
      if (editingApt === c) {
        return `<tr class="rt-detail"><td colspan="5"><form class="row aptedit" data-code="${c}">
          <label>Ciudad<input name="city" value="${esc(a.city)}" required autocomplete="off"></label>
          <label>País${countrySelect('cc', a.cc)}</label>
          <label>Nombre del aeropuerto<input name="name" value="${esc(a.name)}" autocomplete="off"></label>
          <span class="nowrap"><button class="btn btn-primary btn-sm">Guardar ${c}</button> <button type="button" class="btn btn-link btn-sm" data-cancel="1">Cancelar</button></span></form></td></tr>`;
      }
      return `<tr><td><strong>${c}</strong></td><td>${esc(a.city)}</td><td class="hide-sm">${esc(countryName(a.cc) || '—')}</td><td class="hide-sm muted">${esc(a.name || '—')}</td>
        <td class="nowrap"><button class="btn btn-outline btn-sm" data-edit="${c}">Editar</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Aún no hay aeropuertos: se añaden al crear rutas.</td></tr>'}
    </tbody></table></div></div>`;
  el.onclick = (e) => { // onclick (no addEventListener): no se acumulan al volver a pintar
    const ed = e.target.closest('[data-edit]');
    if (ed) { editingApt = ed.dataset.edit; airportsTab(el); }
    if (e.target.closest('[data-cancel]')) { editingApt = ''; airportsTab(el); }
  };
  $('.aptedit', el)?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target; const c = f.dataset.code;
    const city = f.city.value.trim();
    if (!city || !f.cc.value) { toast('Indica ciudad y país'); return; }
    s.customAirports ||= {};
    s.customAirports[c] = { iata: c, city, cc: f.cc.value, name: f.name.value.trim() };
    store.save(); editingApt = ''; toast(`${c} actualizado`); airportsTab(el);
  });
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
    <label>Imagen del destino (opcional)<input name="destimg" value="${esc(s.destImages?.[r.dest] || '')}" placeholder="Texto para buscar la foto (p. ej. Sagrada Familia) o una URL https://…"></label>
    <p class="muted small" style="margin-top:-6px">Por defecto se busca automáticamente una foto de paisaje de la ciudad de destino.</p>

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
    <div class="row">${CLS.map((c) => `<label>${c} · ${CLASS_NAMES[c]}<input type="number" min="0" name="p-${c}" value="${r.prices[c] || ''}" placeholder="0" inputmode="numeric"></label>`).join('')}</div>

    <h3>Programación semanal</h3>
    <p class="muted small">Cada fila es una rotación: escribe solo el nº de vuelo de ida (la vuelta es ida + 1) y la hora de salida. La vuelta sale tras T1 + R1. Marca los días de salida de la ida (L–D).</p>
    <div class="table-wrap"><table id="rot"><thead><tr><th>Nº vuelo ida</th><th>Vuelta (ida + 1)</th><th>Sale (ida)</th><th>Días</th><th></th></tr></thead><tbody></tbody></table></div>
    <div class="row"><button type="button" class="btn btn-outline btn-sm" id="addrot">+ Rotación</button>
      <details class="auto"><summary>Generar programación automática</summary>
        <div class="row"><div class="field"><span class="lbl">Primera salida</span>${todSelect('08:00', 'id="g-t"')}</div>
        <label>Primer nº de vuelo<input type="number" id="g-num" value="${nextNumber(s)}"></label>
        <button type="button" class="btn btn-outline btn-sm" id="gen">Generar con los tiempos y nº de aviones de arriba</button></div></details></div>
    <p class="muted small" id="err" role="alert"></p>
    <div class="row"><button class="btn btn-primary">Guardar ruta</button><a class="btn btn-link" href="#/admin/routes">Cancelar</a></div>
  </form>`;

  const f = $('#rf', el);
  const tbody = $('#rot tbody', el);
  const code = s.airline.code;
  let rows = r.rotations.map((x) => ({ ...x }));
  const drawRows = () => {
    tbody.innerHTML = rows.map((x, i) => `<tr data-i="${i}">
      <td><input class="num" type="number" data-k="outNo" value="${x.outNo}"></td>
      <td class="retno"><b data-ret>${esc(code)}${x.retNo}</b></td>
      <td>${todSelect(x.outDep, 'data-k="outDep"')}</td>
      <td class="days">${DAY_LABELS.map((l, d) => `<label class="day"><input type="checkbox" data-d="${d}" ${x.days.includes(d) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</td>
      <td><button type="button" class="btn btn-link btn-sm" data-rm="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin rotaciones.</td></tr>';
  };
  drawRows();
  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const x = rows[Number(tr.dataset.i)];
    const tod = e.target.closest('.tod');
    if (tod) { x[tod.dataset.k] = readTod(tod); return; }
    if (e.target.dataset.k) x[e.target.dataset.k] = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    if (e.target.dataset.k === 'outNo') { x.retNo = x.outNo + 1; tr.querySelector('[data-ret]').textContent = `${code}${x.retNo}`; } // la vuelta es siempre ida + 1
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
    const [h, m] = readTod($('#g-t', el)).split(':').map(Number);
    rows = autoSchedule({ mode: c.mode, perPeriod: c.perPeriod, aircraft: Math.max(1, Number(f.count.value) || 1), rt: c.rt, firstDep: h * 60 + m, startNumber: Number($('#g-num', el).value) || 100 })
      .map((x) => ({ id: store.uid(), ...x }));
    drawRows(); $('#err', el).textContent = '';
  };

  f.model.addEventListener('change', () => { $('#custom-wrap', el).hidden = f.model.value !== 'custom'; });

  // aeropuertos desconocidos: pedir ciudad, país y nombre. Lo ya escrito se conserva si cambia el otro código.
  const missingCodes = () => [f.o.value, f.d.value].map((v) => v.trim().toUpperCase())
    .filter((c, i, a) => c.length === 3 && !allAirports()[c] && a.indexOf(c) === i);
  const aptField = (fs, name) => fs.querySelector(`[name="${name}"]`);
  const ccOf = (c) => (allAirports()[c]?.cc) || '';
  const aptHtml = (c) => `<fieldset class="row newapt" data-code="${c}"><legend>Aeropuerto nuevo ${c}: solo ciudad y país</legend>
      <label>Ciudad<input name="city" autocomplete="off" placeholder="p. ej. Adelaida"></label>
      <label>País${countrySelect('cc', lastApt.cc || ccOf(f.o.value.trim().toUpperCase()) || ccOf(f.d.value.trim().toUpperCase()))}</label>
      <label>Nombre<select name="kind">
        <option value="intl" ${lastApt.kind === 'intl' ? 'selected' : ''}>Aeropuerto Internacional de «ciudad»</option>
        <option value="apt" ${lastApt.kind === 'apt' ? 'selected' : ''}>Aeropuerto de «ciudad»</option>
        <option value="custom" ${lastApt.kind === 'custom' ? 'selected' : ''}>Otro nombre…</option></select></label>
      <label class="custom-name" hidden>Nombre del aeropuerto<input name="name" autocomplete="off"></label></fieldset>`;
  // Solo añade o quita los aeropuertos que cambian: los que ya están (y lo escrito en ellos) no se tocan,
  // así no se pierde el foco ni el texto cuando el usuario pasa de un campo a otro.
  const checkApts = () => {
    const box = $('#newapts', el);
    const want = missingCodes();
    $$('.newapt', box).forEach((fs) => { if (!want.includes(fs.dataset.code)) fs.remove(); });
    want.forEach((c) => { if (!box.querySelector(`.newapt[data-code="${c}"]`)) box.insertAdjacentHTML('beforeend', aptHtml(c)); });
  };
  for (const input of [f.o, f.d]) for (const ev of ['input', 'change']) input.addEventListener(ev, checkApts);
  $('#newapts', el).addEventListener('change', (e) => {
    const fs = e.target.closest('.newapt'); if (!fs) return;
    if (e.target.name === 'kind') fs.querySelector('.custom-name').hidden = e.target.value !== 'custom';
  });
  checkApts();

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('#err', el);
    try { saveRoute(err); } catch (ex) { console.error(ex); err.textContent = `No se pudo guardar: ${ex.message}`; }
  });

  function saveRoute(err) {
    err.textContent = '';
    const o = f.o.value.trim().toUpperCase(); const d = f.d.value.trim().toUpperCase();
    if (o.length !== 3 || d.length !== 3 || o === d) { err.textContent = 'Indica dos códigos IATA distintos de 3 letras.'; return; }
    // aeropuertos que no están en la base: hacen falta ciudad y país
    checkApts();
    const newApts = {};
    for (const fs of $$('.newapt', el)) {
      const city = aptField(fs, 'city').value.trim();
      const cc = aptField(fs, 'cc').value;
      const kind = aptField(fs, 'kind').value;
      if (!city || !cc) {
        err.textContent = `Completa el aeropuerto ${fs.dataset.code}: ciudad y país.`;
        (city ? aptField(fs, 'cc') : aptField(fs, 'city')).focus();
        return;
      }
      const name = kind === 'custom' ? aptField(fs, 'name').value.trim() : autoAirportName(city, kind);
      if (!name) { err.textContent = `Escribe el nombre del aeropuerto ${fs.dataset.code}.`; aptField(fs, 'name').focus(); return; }
      lastApt = { cc, kind };
      newApts[fs.dataset.code] = { iata: fs.dataset.code, city, cc, name };
    }
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

    s.customAirports ||= {};
    Object.assign(s.customAirports, newApts);
    const next = {
      id: r.id, createdAt: existing ? existing.createdAt : Date.now(), origin: o, dest: d, aircraft, aircraftCount: Math.max(1, Number(f.count.value) || 1), t1, t2, r1: Number(f.r1.value),
      prices: Object.fromEntries(CLS.map((c) => [c, Math.max(0, Number(f[`p-${c}`].value) || 0)])),
      rotations: rows.map((x) => ({ id: x.id || store.uid(), outNo: x.outNo, retNo: x.retNo, outDep: x.outDep, days: x.days })),
    };
    const i = s.routes.findIndex((x) => x.id === r.id);
    if (i >= 0) s.routes[i] = next; else s.routes.push(next);
    s.destImages ||= {};
    const ov = f.destimg.value.trim();
    if (ov) s.destImages[d] = ov; else delete s.destImages[d];
    store.save();
    sessionStorage.removeItem('airsim.draft');
    toast(configured ? 'Ruta guardada' : 'Ruta guardada: falta la configuración de asientos para venderla');
    go('/admin/routes');
  }
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
