// Lógica de horarios, búsqueda de vuelos y asientos — funciones puras.
import { parseHM, DAY } from './calc.js';

// ---------- fechas (siempre en UTC para evitar líos de zona horaria) ----------
export const toISO = (d) => d.toISOString().slice(0, 10);
export const fromISO = (iso) => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => toISO(new Date(fromISO(iso).getTime() + n * 86400000));
/** 0 = lunes … 6 = domingo */
export const weekday = (iso) => (fromISO(iso).getUTCDay() + 6) % 7;
export const todayISO = () => {
  const d = new Date();
  return toISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
};
export const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** ¿Tiene el avión de la ruta la configuración de asientos ya definida? */
export const isConfigured = (config) => Array.isArray(config) && config.some((c) => c.count > 0);

/** Hora de regreso y desplazamiento de día respecto a la salida de ida. */
export function returnTiming(route, rot) {
  const outDep = parseHM(rot.outDep);
  const base = outDep + route.t1; // llegada de la ida (min desde 00:00 del día de salida)
  const retDepMin = rot.retDep ? parseHM(rot.retDep) : (base + route.r1) % DAY;
  const dayShift = Math.ceil(Math.max(0, base - retDepMin) / DAY);
  return { retDepMin, dayShift };
}

/** Instancias de vuelo origen→destino que operan en la fecha dada. */
export function flightsOn(state, origin, dest, iso) {
  const out = [];
  const wd = weekday(iso);
  for (const route of state.routes) {
    const aircraft = route.aircraft;
    if (!aircraft || !isConfigured(aircraft.config)) continue; // pendiente de configurar: no se vende
    for (const rot of route.rotations) {
      const make = (number, depMin, duration, o, d) => {
        const arr = depMin + duration;
        return {
          key: `${state.airline.code}${number}|${iso}`, number: `${state.airline.code}${number}`, origin: o, dest: d, date: iso,
          depMin, arrMin: arr % DAY, arrDayOffset: Math.floor(arr / DAY), duration,
          routeId: route.id, rotationId: rot.id, aircraftId: aircraft.model, aircraftName: aircraft.name,
          prices: route.prices, config: aircraft.config,
        };
      };
      if (route.origin === origin && route.dest === dest && rot.days.includes(wd)) {
        out.push(make(rot.outNo, parseHM(rot.outDep), route.t1, route.origin, route.dest));
      }
      if (route.dest === origin && route.origin === dest) {
        const { retDepMin, dayShift } = returnTiming(route, rot);
        if (rot.days.includes((((wd - dayShift) % 7) + 7) % 7)) {
          out.push(make(rot.retNo, retDepMin, route.t2, route.dest, route.origin));
        }
      }
    }
  }
  return out.sort((a, b) => a.depMin - b.depMin);
}

/** Primera fecha (desde `from`, hasta 28 días) con vuelos para el par origen-destino. */
export function nextDateWithFlights(state, origin, dest, from) {
  for (let i = 0; i < 28; i++) {
    const d = addDays(from, i);
    if (flightsOn(state, origin, dest, d).length) return d;
  }
  return null;
}

// ---------- asientos ----------
const LETTERS = 'ABCDEFGHJK'; // sin la I, como en aviación real
export const CABIN_ORDER = ['F', 'B', 'W', 'Y'];

export const layoutGroups = (layout) => String(layout || '3-3').split('-').map((n) => Math.max(1, parseInt(n, 10) || 1));
export const abreast = (layout) => layoutGroups(layout).reduce((a, b) => a + b, 0);

/** Mapa de asientos completo: [{cls,row,seats:[{id,letter}],groups}], filas numeradas de 1 en adelante. */
export function seatMap(config) {
  const rows = [];
  let rowNo = 1;
  for (const cls of CABIN_ORDER) {
    const c = config.find((x) => x.cls === cls);
    if (!c || !c.count) continue;
    const groups = layoutGroups(c.layout);
    const width = abreast(c.layout);
    let left = c.count;
    while (left > 0) {
      const n = Math.min(width, left);
      const seats = [];
      for (let i = 0; i < n; i++) seats.push({ id: `${rowNo}${LETTERS[i]}`, letter: LETTERS[i] });
      rows.push({ cls, row: rowNo, seats, groups });
      left -= n;
      rowNo++;
    }
  }
  return rows;
}

export const cabinSeats = (config, cls) => seatMap(config).filter((r) => r.cls === cls).flatMap((r) => r.seats.map((s) => s.id));

/** Asientos ocupados de un vuelo-fecha (key = "AW100|2026-12-01"). */
export function takenSeats(state, key) {
  const taken = new Set();
  for (const b of state.bookings) for (const s of b.segments) if (s.key === key) s.seats.forEach((x) => taken.add(x));
  return taken;
}

export function availability(state, flight, cls) {
  const c = flight.config.find((x) => x.cls === cls);
  if (!c || !c.count) return 0;
  const taken = takenSeats(state, flight.key);
  return cabinSeats(flight.config, cls).filter((s) => !taken.has(s)).length;
}

export function seatSummary(config) {
  const order = ['F', 'B', 'W', 'Y'];
  return order.map((c) => `${c}${config.find((x) => x.cls === c)?.count || 0}`).join('');
}

export function makePNR(existing = new Set()) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s;
  do {
    s = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (existing.has(s));
  return s;
}

/** Aeropuertos a los que se puede volar desde `origin` (las rutas se venden en ambos sentidos; solo rutas configuradas). */
export function reachableFrom(state, origin) {
  const set = new Set();
  for (const r of state.routes) {
    if (!isConfigured(r.aircraft?.config)) continue;
    if (r.origin === origin) set.add(r.dest);
    if (r.dest === origin) set.add(r.origin);
  }
  set.delete(origin);
  return [...set].sort();
}
