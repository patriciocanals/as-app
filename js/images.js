// Imágenes automáticas (sin claves de API):
//  - Banderas:      flagcdn.com
//  - Destinos/aviones: API REST de Wikipedia (imagen principal del artículo)
//  - Si Wikipedia no tiene imagen: generador de imágenes IA de Pollinations (sin clave)
//  - Si todo falla: degradado con el código IATA (se gestiona en CSS vía onerror)

const CACHE_KEY = 'airsim.img.v1';
let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { /* sin caché */ }
const pending = new Map();

export const flagUrl = (cc, w = 40) => `https://flagcdn.com/w${w}/${String(cc).toLowerCase()}.png`;

function persist() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* cuota llena */ }
}

const aiUrl = (prompt) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=600&nologo=true`;

async function wikiImage(title) {
  const r = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!r.ok) return null;
  const j = await r.json();
  const src = j.thumbnail?.source || j.originalimage?.source;
  if (!src) return null;
  return src.replace(/\/(\d+)px-/, '/1200px-'); // versión grande
}

/**
 * @param {'dest'|'aircraft'} kind
 * @param {string} title  título del artículo de Wikipedia (ciudad o modelo de avión)
 */
export function getImage(kind, title) {
  const k = `${kind}:${title}`;
  if (cache[k]) return Promise.resolve(cache[k]);
  if (pending.has(k)) return pending.get(k);
  const p = (async () => {
    let url = null;
    try { url = await wikiImage(title); } catch { /* sin red */ }
    if (!url) {
      url = aiUrl(kind === 'dest'
        ? `beautiful travel photograph of ${title}, city skyline, golden hour, no text`
        : `photo of an ${title} airliner in flight, blue sky, no text`);
    }
    cache[k] = url;
    persist();
    return url;
  })();
  pending.set(k, p);
  return p;
}

/** Rellena todos los <img data-img-kind data-img-title> / elementos con data-bg dentro de `root`. */
export function hydrateImages(root = document) {
  root.querySelectorAll('[data-img-kind]').forEach(async (el) => {
    const url = await getImage(el.dataset.imgKind, el.dataset.imgTitle);
    if (!el.isConnected) return;
    const probe = new Image();
    probe.onload = () => {
      if (el.tagName === 'IMG') el.src = url;
      else el.style.backgroundImage = `linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.55)),url("${url}")`;
      el.classList.add('img-ready');
    };
    probe.onerror = () => el.classList.add('img-failed');
    probe.src = url;
  });
}
