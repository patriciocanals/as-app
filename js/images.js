// Imágenes automáticas (sin claves de API):
//  - Banderas:  flagcdn.com
//  - Destinos:  fotos de paisaje/ciudad de Wikimedia Commons (filtrando banderas, escudos y mapas)
//  - Aviones:   imagen principal del artículo de Wikipedia; si no sirve, búsqueda en Commons
//  - Último recurso: imagen generada con IA (Pollinations, sin clave); si todo falla, degradado de marca.
// Cada candidato se comprueba cargándolo de verdad antes de darlo por bueno, y el resultado se guarda en caché.

const CACHE_KEY = 'airsim.img.v5'; // v5: fotos de aviones por modelo concreto (antes varios modelos compartían la misma)
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
const words = (t) => ` ${norm(t).replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * ¿El título del archivo menciona `term`? Coincide por palabras completas (así "Nice" no encaja en "Venice").
 * Con `squash` también ignora espacios y guiones (CRJ-1000 = CRJ 1000 = CRJ1000), útil para modelos de avión.
 */
export function mentions(title, term, squash = false) {
  const a = words(title);
  const b = words(term);
  if (b.trim() === '') return false;
  if (a.includes(b)) return true;
  if (!squash) return false;
  const sb = b.replace(/ /g, '');
  const sa = a.replace(/ /g, '');
  const i = sa.indexOf(sb);
  if (i < 0) return false;
  // evita que "a3501000" case dentro de "a350100..." por un prefijo: el siguiente carácter no puede ser un dígito
  return !/\d/.test(sa[i + sb.length] || '');
}

/**
 * `require`: si se indica, el nombre del archivo DEBE mencionar alguno de esos nombres (la ciudad o el modelo).
 * Evita fotos genéricas del país o de otra ciudad (p. ej. Sídney cuando se busca Alice Springs).
 */
export function pickCommons(json, { minWidth = 1600, prefer = '', require = [], squash = false } = {}) {
  const pages = Object.values(json?.query?.pages || {});
  const need = require.filter(Boolean);
  const good = pages
    .map((p) => ({ title: String(p.title || ''), index: p.index ?? 99, info: p.imageinfo?.[0] }))
    .filter((p) => p.info && p.info.mime === 'image/jpeg' && p.info.width >= minWidth
      && isLandscape(p.info.width, p.info.height) && !UNWANTED.test(p.title) && p.info.thumburl
      && (!need.length || need.some((n) => mentions(p.title, n, squash))));
  const key = String(prefer).toLowerCase();
  good.sort((a, b) => {
    const pa = key && a.title.toLowerCase().includes(key) ? 0 : 1;
    const pb = key && b.title.toLowerCase().includes(key) ? 0 : 1;
    return pa - pb || a.index - b.index;
  });
  return good.map((p) => p.info.thumburl);
}

// Términos con los que aparece cada modelo en los títulos de Commons (cuando difieren del nombre del juego).
const AC_TERMS = {
  q100: ['DHC-8-100', 'Dash 8-100', 'Q100'], q200: ['DHC-8-200', 'Dash 8-200', 'Q200'],
  q300: ['DHC-8-300', 'Dash 8-300', 'Q300'], q400: ['DHC-8-400', 'DHC-8-402', 'Dash 8-400', 'Q400'],
  'a220-100': ['A220-100', 'CS100', 'BD-500-1A10'], 'a220-300': ['A220-300', 'CS300', 'BD-500-1A11'],
};
/** Términos que identifican un modelo concreto de avión (para que CRJ900 y CRJ1000 no compartan foto). */
export function aircraftTerms(model, name) {
  if (AC_TERMS[model]) return AC_TERMS[model];
  const base = String(name).replace(/^(airbus|embraer|de havilland canada|de havilland|comac|bombardier|sukhoi)\s+/i, '').trim();
  const stripped = base.replace(/\s*(ulr|lr|xr|std|er)$/i, '').trim();
  return [...new Set([base, stripped].filter(Boolean))];
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

async function commonsCandidates(query, names = [], squash = false) {
  const q = encodeURIComponent(`${query} filetype:bitmap`);
  const j = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${q}&gsrlimit=25&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=1280&format=json&origin=*`);
  return pickCommons(j, { prefer: names[0] || '', require: names, squash }).slice(0, 4);
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
async function* candidates(kind, title, { override = '', country = '', alt = '', model = '' } = {}) {
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
    // 1) foto cuyo nombre de archivo menciona ESTE modelo; 2) artículo de Wikipedia (compartido entre variantes);
    // 3) cualquier foto del avión; 4) imagen generada.
    const terms = aircraftTerms(model, alt || title);
    for (const q of [`${alt || title} aircraft`, `${terms[0]} airliner`]) {
      try { for (const u of await commonsCandidates(q, terms, true)) yield [u, 10000]; } catch { /* siguiente */ }
    }
    try { for (const u of await wikiCandidate(title)) yield [u, 10000]; } catch { /* siguiente */ }
    try { for (const u of await commonsCandidates(`${title} aircraft`, [])) yield [u, 10000]; } catch { /* siguiente */ }
    yield [aiUrl(`photo of an ${alt || title} passenger airliner in flight, blue sky, no text`), 30000];
  }
}

/**
 * Devuelve la URL de una imagen válida (o null). kind: 'dest' | 'aircraft'.
 * `avoid`: conjunto de URLs ya usadas en la página; se saltan para que dos tarjetas no muestren la misma foto.
 */
export function getImage(kind, title, opts = {}) {
  const { avoid } = opts;
  const k = `${kind}:${title}:${opts.override || ''}`;
  if (cache[k] && !avoid?.has(cache[k])) return Promise.resolve(cache[k]);
  if (!avoid && pending.has(k)) return pending.get(k);
  const p = (async () => {
    for await (const [url, ms] of candidates(kind, title, opts)) {
      if (avoid?.has(url)) continue;
      if (await loads(url, ms)) { cache[k] = url; persist(); return url; }
    }
    return null;
  })();
  if (!avoid) { pending.set(k, p); p.finally(() => pending.delete(k)); }
  return p;
}

const optsOf = (el) => ({ override: el.dataset.imgOv || '', country: el.dataset.imgCountry || '', alt: el.dataset.imgAlt || '', model: el.dataset.imgModel || '' });
function paint(el, url) {
  if (!el.isConnected) return;
  if (!url) { el.classList.add('img-failed'); return; }
  if (el.tagName === 'IMG') el.src = url;
  else el.style.backgroundImage = `url("${url}")`;
  el.classList.add('img-ready');
}

/** Rellena los elementos con data-img-kind / data-img-title (/data-img-ov, data-img-cc) dentro de `root`. */
export function hydrateImages(root = document) {
  const planes = [];
  root.querySelectorAll('[data-img-kind]').forEach((el) => {
    const job = getImage(el.dataset.imgKind, el.dataset.imgTitle, optsOf(el)).then((url) => { paint(el, url); return [el, url]; });
    if (el.dataset.imgKind === 'aircraft') planes.push(job);
  });
  // los aviones comparten artículos de Wikipedia: si dos modelos acabaron con la misma foto, el segundo busca otra
  Promise.all(planes).then(async (list) => {
    const used = new Set();
    for (const [el, url] of list) {
      if (!url || !used.has(url)) { if (url) used.add(url); continue; }
      const other = await getImage('aircraft', el.dataset.imgTitle, { ...optsOf(el), avoid: used });
      if (other) { used.add(other); paint(el, other); }
    }
  });
}
