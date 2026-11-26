// Estado del proceso de reserva (se conserva al recargar la página dentro de la pestaña).
const KEY = 'airsim.flow';

export function getFlow() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function setFlow(f) {
  try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch { /* ignorar */ }
}
export const clearFlow = () => setFlow({});
