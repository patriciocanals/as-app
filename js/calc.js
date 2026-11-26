// Motor de cálculo de rutas — funciones puras, sin DOM (testeables con `npm test`).
//
// Reglas (según el documento del proyecto):
//   RT = T1 + T2 + R1 + R2
//   RT <= 24h  -> modo "diario":  rotaciones/día = floor(24h / RT)
//                 asientos por vuelo = ceil( (demanda/7) / rotaciones/día / N )
//   RT  > 24h  -> modo "semanal": rotaciones/semana = floor(168h / RT)
//                 asientos por vuelo = ceil( demanda / rotaciones/semana / N )

export const DAY = 24 * 60;
export const WEEK = 7 * DAY;
export const R2_MIN = 5; // constante del juego
export const REFUEL_OPTIONS = [60, 90, 120, 150];
export const CLASSES = ['Y', 'W', 'B', 'F'];
export const CLASS_NAMES = { Y: 'Economy', W: 'Premium Economy', B: 'Business', F: 'First' };

export function parseHM(s) {
  if (typeof s === 'number') return s;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(String(s).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function formatHM(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Hora del día "HH:MM" a partir de minutos (módulo 24h). */
export function clock(min) {
  const m = ((min % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Sugerencia de refuelling según lo observado en el juego (el algoritmo real es
 * desconocido, así que es solo orientativo):
 *  - ida+vuelta > 24h            -> 2:30
 *  - ida y vuelta <= 2h          -> 1:00
 *  - algún tramo > 6h            -> 2:00
 *  - resto                       -> 1:30 (confianza baja)
 */
export function suggestRefuel(t1, t2) {
  if (!(t1 > 0) || !(t2 > 0)) return { minutes: 60, confidence: 'baja' };
  if (t1 + t2 > DAY) return { minutes: 150, confidence: 'alta' };
  if (t1 <= 120 && t2 <= 120) return { minutes: 60, confidence: 'media' };
  if (t1 > 360 || t2 > 360) return { minutes: 120, confidence: 'media' };
  return { minutes: 90, confidence: 'baja' };
}

/**
 * @param {{t1:number,t2:number,r1:number,r2?:number,
 *          demand:{Y?:number,W?:number,B?:number,F?:number},maxAircraft?:number}} input  (tiempos en minutos)
 */
export function calculate({ t1, t2, r1, r2 = R2_MIN, demand = {}, maxAircraft = 6 }) {
  if (![t1, t2, r1, r2].every((v) => Number.isFinite(v) && v >= 0) || t1 <= 0 || t2 <= 0) {
    return { error: 'Introduce tiempos de ida y vuelta válidos.' };
  }
  const rt = t1 + t2 + r1 + r2;
  const mode = rt > DAY ? 'weekly' : 'daily';
  const perPeriod = Math.floor((mode === 'daily' ? DAY : WEEK) / rt);
  if (perPeriod < 1) return { error: 'El roundtrip supera las 168 h: no cabe ni una rotación por semana.' };

  const dem = {};
  for (const c of CLASSES) dem[c] = Math.max(0, Math.floor(Number(demand[c]) || 0));

  const scenarios = [];
  for (let n = 1; n <= maxAircraft; n++) {
    const seats = {};
    for (const c of CLASSES) {
      // una sola división de enteros: evita errores de coma flotante antes del ceil
      const divisor = (mode === 'daily' ? 7 : 1) * perPeriod * n;
      seats[c] = Math.ceil(dem[c] / divisor);
    }
    const rotationsPerWeek = mode === 'daily' ? perPeriod * 7 * n : perPeriod * n;
    scenarios.push({
      aircraft: n,
      rotationsPerDay: mode === 'daily' ? perPeriod * n : null,
      rotationsPerWeek,
      flightsPerWeek: rotationsPerWeek * 2,
      seats,
      totalSeats: CLASSES.reduce((a, c) => a + seats[c], 0),
    });
  }

  const usedPerAircraft = perPeriod * rt;
  return {
    rt, mode, perPeriod, demand: dem, scenarios,
    refuel: suggestRefuel(t1, t2),
    idleMinutes: (mode === 'daily' ? DAY : WEEK) - usedPerAircraft,
  };
}

/**
 * Genera una programación base (editable) para N aviones.
 * Devuelve rotaciones: { outNo, retNo, outDep:'HH:MM', days:[0..6] } (0 = lunes).
 * Numeración: ida = n, vuelta = n+1, siguiente rotación n+2…
 */
export function autoSchedule({ mode, perPeriod, aircraft = 1, rt, firstDep = 8 * 60, startNumber = 100 }) {
  const rotations = [];
  let num = startNumber;
  const push = (depMin, days) => {
    rotations.push({ outNo: num, retNo: num + 1, outDep: clock(depMin), days });
    num += 2;
  };
  if (mode === 'daily') {
    const all = [0, 1, 2, 3, 4, 5, 6];
    const deps = [];
    for (let a = 0; a < aircraft; a++) {
      const offset = Math.round((a * rt) / aircraft / 5) * 5; // escalonado, múltiplos de 5 min
      for (let j = 0; j < perPeriod; j++) deps.push(firstDep + offset + j * rt);
    }
    deps.sort((x, y) => (x % DAY) - (y % DAY));
    deps.forEach((d) => push(d, all));
  } else {
    const total = perPeriod * aircraft;
    for (let k = 0; k < total; k++) push(firstDep, [Math.floor((k * 7) / total)]);
  }
  return rotations;
}
