// Datos de ejemplo para que la web funcione desde el primer arranque.
// Se pueden borrar/editar desde Administración, o sustituir publicando data/seed.json.
import { calculate, autoSchedule, parseHM } from './calc.js';

function makeRoute(id, origin, dest, aircraftId, t1, t2, r1, demand, prices, aircraft, startNumber) {
  const c = calculate({ t1: parseHM(t1), t2: parseHM(t2), r1: parseHM(r1), demand });
  const rotations = autoSchedule({ mode: c.mode, perPeriod: c.perPeriod, aircraft, rt: c.rt, startNumber })
    .map((r, i) => ({ id: `${id}-${i}`, ...r }));
  return { id, origin, dest, aircraftId, t1: parseHM(t1), t2: parseHM(t2), r1: parseHM(r1), prices, rotations };
}

export function demoData() {
  return {
    airline: { name: 'Aurora Airways', code: 'AW', color: '#0a3d91', currency: '€', tagline: 'Tu próximo destino empieza aquí' },
    aircraft: [
      {
        id: 'ac-a320', name: 'Airbus A320', wiki: 'Airbus A320',
        config: [
          { cls: 'F', count: 2, layout: '1-1' }, { cls: 'B', count: 4, layout: '1-1' },
          { cls: 'W', count: 20, layout: '2-2' }, { cls: 'Y', count: 100, layout: '3-3' },
        ],
      },
      {
        id: 'ac-a380', name: 'Airbus A380', wiki: 'Airbus A380',
        config: [
          { cls: 'F', count: 14, layout: '1-2-1' }, { cls: 'B', count: 76, layout: '2-2-2' },
          { cls: 'W', count: 60, layout: '2-4-2' }, { cls: 'Y', count: 400, layout: '3-4-3' },
        ],
      },
    ],
    routes: [
      makeRoute('r-mad-lhr', 'MAD', 'LHR', 'ac-a320', '2:25', '2:10', '1:00', { Y: 3500, W: 1400, B: 700, F: 140 }, { Y: 119, W: 249, B: 499, F: 899 }, 1, 100),
      makeRoute('r-mad-jfk', 'MAD', 'JFK', 'ac-a380', '8:15', '7:30', '2:00', { Y: 2800, W: 700, B: 400, F: 70 }, { Y: 489, W: 899, B: 2190, F: 4200 }, 1, 200),
      makeRoute('r-mad-eze', 'MAD', 'EZE', 'ac-a380', '12:00', '13:40', '2:30', { Y: 6382, W: 967, B: 1324, F: 144 }, { Y: 699, W: 1199, B: 2890, F: 5400 }, 1, 300),
    ],
    customAirports: {},
    bookings: [],
  };
}
