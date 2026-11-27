// Imágenes automáticas (sin claves de API):
//  - Banderas:  flagcdn.com
//  - Destinos:  fotos de paisaje/ciudad de Wikimedia Commons (filtrando banderas, escudos y mapas)
//  - Aviones:   imagen principal del artículo de Wikipedia; si no sirve, búsqueda en Commons
//  - Último recurso: imagen generada con IA (Pollinations, sin clave); si todo falla, degradado de marca.
// Cada candidato se comprueba cargándolo de verdad antes de darlo por bueno, y el resultado se guarda en caché.

const CACHE_KEY = 'airsim.img.v4'; // v4: descarta fotos erróneas guardadas antes (p. ej. Sídney para Alice Springs)
let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { /* sin caché */ }
const pending = new Map();

export const flagUrl = (cc, w = 40) => `https://flagcdn.com/w${w}/${String(cc).toLowerCase()}.png`;

function persist() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* cuota llena */ }
}

// ---------- funciones puras (testeadas) ----------
/** Nombres de archivo que NO queremos como foto de un destino. */
export const UNWANTED = /flag|bandera|drapeau|escudo|coat[_ ]of|blason|wappen|\bseal\b|\blogo\b|locator|\bmap\b|mapa|\bplan\b|diagram|\bicon\b|symbol|emblem|poster|\.svg|\.gif|\.tif/i;

export const isLandscape = (w, h) => w > 0 && h > 0 && w / h >= 1.3 && w / h <= 2.4;

/**
 * Elige candidatos de una respuesta de la API de Commons (action=query&generator=search&prop=imageinfo).
 * Devuelve URLs de miniatura ordenadas por relevancia: JPEG apaisados, grandes y sin banderas/mapas.
 */
const norm = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * `require`: si se indica, el nombre del archivo DEBE mencionar alguno de esos nombres (la ciudad).
 * Evita fotos genéricas del país o de otra ciudad (p. ej. Sídney cuando se busca Alice Springs).
 */
export function pickCommons(json, { minWidth = 1600, prefer = '', require = [] } = {}) {
  const pages = Object.values(json?.query?.pages || {});
  const need = require.filter(Boolean).map(norm);
  const good = pages
    .map((p) => ({ title: String(p.title || ''), index: p.index ?? 99, info: p.imageinfo?.[0] }))
    .filter((p) => p.info && p.info.mime === 'image/jpeg' && p.info.width >= minWidth
      && isLandscape(p.info.width, p.info.height) && !UNWANTED.test(p.title) && p.info.thumburl
      && (!need.length || need.some((n) => norm(p.title).includes(n))));
  const key = String(prefer).toLowerCase();
  good.sort((a, b) => {
    const pa = key && a.title.toLowerCase().includes(key) ? 0 : 1;
    const pb = key && b.title.toLowerCase().includes(key) ? 0 : 1;
    return pa - pb || a.index - b.index;
  });
  return good.map((p) => p.info.thumburl);
}

/** URL de imagen de un resumen de Wikipedia, con un tamaño que Wikimedia SÍ sirve (nunca amplía fotos). */
export function pickWikiSummary(j) {
  const o = j?.originalimage;
  const t = j?.thumbnail;
  const src = o?.source || t?.source;
  if (!src || UNWANTED.test(decodeURIComponent(src))) return null;
  if (t?.source && o?.width >= 1200 && /\/\d+px-/.test(t.source)) return t.source.replace(/\/\d+px-/, '/1200px-');
  return o?.source || t.source;
}

export const aiUrl = (prompt) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true`;

// ---------- red ----------
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function commonsCandidates(query, names = []) {
  const q = encodeURIComponent(`${query} filetype:bitmap`);
  const j = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${q}&gsrlimit=25&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=1280&format=json&origin=*`);
  return pickCommons(j, { prefer: names[0] || '', require: names }).slice(0, 4);
}

async function wikiCandidate(title) {
  const j = await getJSON(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const u = pickWikiSummary(j);
  return u ? [u] : [];
}

/** Comprueba que la imagen carga de verdad (evita huecos y errores 400). */
function loads(url, ms) {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ''; resolve(false); }, ms);
    img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = url;
  });
}

/** Genera, de uno en uno y de forma perezosa, los candidatos de imagen por orden de preferencia. */
async function* candidates(kind, title, { override = '', country = '', alt = '' } = {}) {
  if (/^https?:\/\//i.test(override)) { yield [override, 12000]; return; }
  if (kind === 'dest') {
    const name = alt || title;
    const names = [...new Set([name, title])]; // la foto debe nombrar la ciudad (en inglés o como se escribió)
    // con un texto personalizado se busca ese texto tal cual; si no, se exige que el archivo nombre la ciudad
    const searches = override
      ? [[override, []], [`${name} ${override}`, []]]
      : [[`${name} skyline`, names], [`${name} panorama`, names], [`${name} city`, names], [name, names]];
    for (const [q, req] of searches) {
      try { for (const u of await commonsCandidates(q, req)) yield [u, 10000]; } catch { /* siguiente */ }
    }
    try { for (const u of await wikiCandidate(title)) yield [u, 10000]; } catch { /* siguiente */ }
    yield [aiUrl(`beautiful travel photograph of ${name}${country ? `, ${country}` : ''}, landscape, golden hour, no text, no flags`), 30000];
  } else {
    try { for (const u of await wikiCandidate(title)) yield [u, 10000]; } catch { /* siguiente */ }
    try { for (const u of await commonsCandidates(`${title} aircraft`, [])) yield [u, 10000]; } catch { /* siguiente */ }
    yield [aiUrl(`photo of an ${title} passenger airliner in flight, blue sky, no text`), 30000];
  }
}

/** Devuelve la URL de una imagen válida (o null). kind: 'dest' | 'aircraft'. */
export function getImage(kind, title, opts = {}) {
  const k = `${kind}:${title}:${opts.override || ''}`;
  if (cache[k]) return Promise.resolve(cache[k]);
  if (pending.has(k)) return pending.get(k);
  const p = (async () => {
    for await (const [url, ms] of candidates(kind, title, opts)) {
      if (await loads(url, ms)) { cache[k] = url; persist(); return url; }
    }
    return null;
  })();
  pending.set(k, p);
  p.finally(() => pending.delete(k));
  return p;
}

/** Rellena los elementos con data-img-kind / data-img-title (/data-img-ov, data-img-cc) dentro de `root`. */
export function hydrateImages(root = document) {
  root.querySelectorAll('[data-img-kind]').forEach(async (el) => {
    const url = await getImage(el.dataset.imgKind, el.dataset.imgTitle, { override: el.dataset.imgOv || '', country: el.dataset.imgCountry || '', alt: el.dataset.imgAlt || '' });
    if (!el.isConnected) return;
    if (!url) { el.classList.add('img-failed'); return; }
    if (el.tagName === 'IMG') el.src = url;
    else el.style.backgroundImage = `url("${url}")`;
    el.classList.add('img-ready');
  });
}
