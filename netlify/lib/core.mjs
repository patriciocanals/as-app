// API de cuentas y datos. Pura: recibe un "storage" (get/set/delete de valores JSON), así se usa
// igual en Netlify Blobs (producción) que en memoria o en un archivo (tests y servidor local).
//
//   POST   /api/register       { username, password, invite? }  -> { token, user }
//   POST   /api/login          { username, password }           -> { token, user }
//   POST   /api/logout
//   GET    /api/data                                            -> { user, airlines: { id: { rev, data } } }
//   PUT    /api/airline/:id    { rev, data }                    -> { rev }       (409 si otro dispositivo cambió antes)
//   DELETE /api/airline/:id
//   GET    /api/ping                                            -> { ok, cloud, invite }
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const MAX_AIRLINES = 6;
const SESSION_MS = 90 * 24 * 3600 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;
const MAX_BYTES = 4 * 1024 * 1024; // por aerolínea

const USER_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const ID_RE = /^[a-z0-9]{4,20}$/;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const same = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const hash = async (pw, salt) => (await scryptAsync(pw, salt, 64)).toString('hex');

export function createApi(storage, { inviteCode = '', now = () => Date.now() } = {}) {
  const out = (status, json) => ({ status, json });
  const err = (status, message) => out(status, { error: message });

  async function newSession(user) {
    const token = randomBytes(32).toString('hex');
    await storage.set(`s:${sha(token)}`, { user, exp: now() + SESSION_MS });
    return token;
  }

  async function auth(headers) {
    const h = headers.authorization || headers.Authorization || '';
    const m = /^Bearer ([a-f0-9]{64})$/.exec(h);
    if (!m) return null;
    const s = await storage.get(`s:${sha(m[1])}`);
    if (!s || s.exp < now()) return null;
    return { user: s.user, token: m[1] };
  }

  return async function handle({ method, path, headers = {}, body = null }) {
    const segs = path.replace(/^\/+api\/?/, '').split('/').filter(Boolean);
    const [a, b] = segs;

    if (a === 'ping' && method === 'GET') return out(200, { ok: true, cloud: true, invite: !!inviteCode });

    if (a === 'register' && method === 'POST') {
      const username = String(body?.username || '').trim().toLowerCase();
      const password = String(body?.password || '');
      if (!USER_RE.test(username)) return err(400, 'Usuario: 3–32 caracteres (letras, números, punto, guion).');
      if (password.length < 8 || password.length > 200) return err(400, 'La contraseña debe tener al menos 8 caracteres.');
      if (inviteCode && !same(body?.invite || '', inviteCode)) return err(403, 'Código de invitación incorrecto.');
      if (await storage.get(`u:${username}`)) return err(409, 'Ese usuario ya existe.');
      const salt = randomBytes(16).toString('hex');
      await storage.set(`u:${username}`, { salt, hash: await hash(password, salt), createdAt: now(), fails: 0, lockUntil: 0 });
      await storage.set(`idx:${username}`, { ids: [] });
      return out(201, { token: await newSession(username), user: username });
    }

    if (a === 'login' && method === 'POST') {
      const username = String(body?.username || '').trim().toLowerCase();
      const password = String(body?.password || '');
      const u = USER_RE.test(username) ? await storage.get(`u:${username}`) : null;
      if (u && u.lockUntil > now()) return err(429, 'Demasiados intentos. Espera un minuto.');
      const salt = u?.salt || '00'.repeat(16); // mismo coste si el usuario no existe
      const h = await hash(password, salt);
      if (!u || !same(h, u.hash)) {
        if (u) {
          u.fails = (u.fails || 0) + 1;
          if (u.fails >= MAX_FAILS) { u.lockUntil = now() + LOCK_MS; u.fails = 0; }
          await storage.set(`u:${username}`, u);
        }
        return err(401, 'Usuario o contraseña incorrectos.');
      }
      u.fails = 0; u.lockUntil = 0;
      await storage.set(`u:${username}`, u);
      return out(200, { token: await newSession(username), user: username });
    }

    const session = await auth(headers);
    if (!session) return err(401, 'Sesión no válida.');
    const { user } = session;

    if (a === 'logout' && method === 'POST') {
      await storage.delete(`s:${sha(session.token)}`);
      return out(200, { ok: true });
    }

    if (a === 'data' && method === 'GET') {
      const idx = (await storage.get(`idx:${user}`)) || { ids: [] };
      const airlines = {};
      for (const id of idx.ids) {
        const rec = await storage.get(`a:${user}:${id}`);
        if (rec) airlines[id] = rec;
      }
      return out(200, { user, airlines });
    }

    if (a === 'airline' && ID_RE.test(b || '')) {
      if (method === 'PUT') {
        const rev = Number(body?.rev);
        const data = body?.data;
        if (!Number.isInteger(rev) || rev < 0 || !data || typeof data !== 'object') return err(400, 'Datos no válidos.');
        if (JSON.stringify(data).length > MAX_BYTES) return err(413, 'La aerolínea es demasiado grande.');
        const idx = (await storage.get(`idx:${user}`)) || { ids: [] };
        const cur = await storage.get(`a:${user}:${b}`);
        if ((cur?.rev || 0) !== rev) return out(409, { error: 'Conflicto: otro dispositivo guardó antes.', rev: cur?.rev ?? null });
        if (!cur && idx.ids.length >= MAX_AIRLINES) return err(400, `Máximo ${MAX_AIRLINES} aerolíneas.`);
        const next = { rev: rev + 1, data, updatedAt: now() };
        await storage.set(`a:${user}:${b}`, next);
        if (!idx.ids.includes(b)) { idx.ids.push(b); await storage.set(`idx:${user}`, idx); }
        return out(200, { rev: next.rev });
      }
      if (method === 'DELETE') {
        const idx = (await storage.get(`idx:${user}`)) || { ids: [] };
        await storage.delete(`a:${user}:${b}`);
        idx.ids = idx.ids.filter((x) => x !== b);
        await storage.set(`idx:${user}`, idx);
        return out(200, { ok: true });
      }
    }
    return err(404, 'No encontrado.');
  };
}
