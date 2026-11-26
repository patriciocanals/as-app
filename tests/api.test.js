import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../netlify/lib/core.mjs';

const mem = () => { const m = new Map(); return { get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null), set: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async (k) => { m.delete(k); }, _m: m }; };
const call = (api, method, path, body, token) => api({ method, path, body, headers: token ? { authorization: `Bearer ${token}` } : {} });
const reg = async (api, u = 'patricio', p = 'clave-segura-1') => (await call(api, 'POST', '/api/register', { username: u, password: p })).json;

test('ping indica nube e invitación', async () => {
  assert.deepEqual((await call(createApi(mem()), 'GET', '/api/ping')).json, { ok: true, cloud: true, invite: false });
  assert.equal((await call(createApi(mem(), { inviteCode: 'x' }), 'GET', '/api/ping')).json.invite, true);
});

test('registro valida usuario y contraseña; no guarda la contraseña en claro', async () => {
  const st = mem(); const api = createApi(st);
  assert.equal((await call(api, 'POST', '/api/register', { username: 'a', password: 'clave-segura-1' })).status, 400);
  assert.equal((await call(api, 'POST', '/api/register', { username: 'patricio', password: 'corta' })).status, 400);
  const r = await call(api, 'POST', '/api/register', { username: 'Patricio', password: 'clave-segura-1' });
  assert.equal(r.status, 201); assert.equal(r.json.user, 'patricio'); assert.match(r.json.token, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify([...st._m.values()]).includes('clave-segura-1'));
  assert.ok(![...st._m.keys()].some((k) => k.includes(r.json.token)), 'el token no se guarda en claro');
  assert.equal((await call(api, 'POST', '/api/register', { username: 'patricio', password: 'otra-clave-123' })).status, 409);
});

test('código de invitación', async () => {
  const api = createApi(mem(), { inviteCode: 'sala-secreta' });
  assert.equal((await call(api, 'POST', '/api/register', { username: 'patricio', password: 'clave-segura-1' })).status, 403);
  assert.equal((await call(api, 'POST', '/api/register', { username: 'patricio', password: 'clave-segura-1', invite: 'mala' })).status, 403);
  assert.equal((await call(api, 'POST', '/api/register', { username: 'patricio', password: 'clave-segura-1', invite: 'sala-secreta' })).status, 201);
});

test('login correcto/incorrecto y bloqueo tras 5 fallos', async () => {
  let t = 1_000_000; const api = createApi(mem(), { now: () => t });
  await reg(api);
  assert.equal((await call(api, 'POST', '/api/login', { username: 'patricio', password: 'clave-segura-1' })).status, 200);
  assert.equal((await call(api, 'POST', '/api/login', { username: 'nadie', password: 'clave-segura-1' })).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await call(api, 'POST', '/api/login', { username: 'patricio', password: 'mala-clave-1' })).status, 401);
  assert.equal((await call(api, 'POST', '/api/login', { username: 'patricio', password: 'clave-segura-1' })).status, 429, 'bloqueado aunque ahora acierte');
  t += 61_000;
  assert.equal((await call(api, 'POST', '/api/login', { username: 'patricio', password: 'clave-segura-1' })).status, 200);
});

test('sesión: sin token 401, logout invalida, caduca', async () => {
  let t = 0; const api = createApi(mem(), { now: () => t });
  const { token } = await reg(api);
  assert.equal((await call(api, 'GET', '/api/data')).status, 401);
  assert.equal((await call(api, 'GET', '/api/data', null, 'f'.repeat(64))).status, 401);
  assert.equal((await call(api, 'GET', '/api/data', null, token)).status, 200);
  assert.equal((await call(api, 'POST', '/api/logout', null, token)).status, 200);
  assert.equal((await call(api, 'GET', '/api/data', null, token)).status, 401);
  const { token: t2 } = (await call(api, 'POST', '/api/login', { username: 'patricio', password: 'clave-segura-1' })).json;
  t += 91 * 24 * 3600 * 1000;
  assert.equal((await call(api, 'GET', '/api/data', null, t2)).status, 401, 'caducada a los 90 días');
});

test('datos: crear, leer desde otro dispositivo, revisiones y conflicto', async () => {
  const api = createApi(mem());
  const { token: dev1 } = await reg(api);
  const dev2 = (await call(api, 'POST', '/api/login', { username: 'patricio', password: 'clave-segura-1' })).json.token;
  let r = await call(api, 'PUT', '/api/airline/abc12345', { rev: 0, data: { airline: { name: 'CS' } } }, dev1);
  assert.deepEqual([r.status, r.json.rev], [200, 1]);
  const seen = (await call(api, 'GET', '/api/data', null, dev2)).json;
  assert.equal(seen.airlines.abc12345.data.airline.name, 'CS'); assert.equal(seen.airlines.abc12345.rev, 1);
  r = await call(api, 'PUT', '/api/airline/abc12345', { rev: 1, data: { airline: { name: 'CS2' } } }, dev2);
  assert.equal(r.json.rev, 2);
  r = await call(api, 'PUT', '/api/airline/abc12345', { rev: 1, data: { airline: { name: 'viejo' } } }, dev1);
  assert.deepEqual([r.status, r.json.rev], [409, 2], 'dev1 tenía una revisión vieja');
  assert.equal((await call(api, 'GET', '/api/data', null, dev1)).json.airlines.abc12345.data.airline.name, 'CS2');
  assert.equal((await call(api, 'PUT', '/api/airline/abc12345', { rev: 'x', data: {} }, dev1)).status, 400);
  assert.equal((await call(api, 'PUT', '/api/airline/NO-VALIDO', { rev: 0, data: {} }, dev1)).status, 404);
});

test('máximo 6 aerolíneas, borrado, y aislamiento entre usuarios', async () => {
  const api = createApi(mem());
  const { token } = await reg(api);
  for (let i = 0; i < 6; i++) assert.equal((await call(api, 'PUT', `/api/airline/air${i}aaaa`, { rev: 0, data: { n: i } }, token)).status, 200);
  assert.equal((await call(api, 'PUT', '/api/airline/air9aaaa', { rev: 0, data: {} }, token)).status, 400);
  assert.equal((await call(api, 'DELETE', '/api/airline/air0aaaa', null, token)).status, 200);
  assert.equal(Object.keys((await call(api, 'GET', '/api/data', null, token)).json.airlines).length, 5);
  assert.equal((await call(api, 'PUT', '/api/airline/air9aaaa', { rev: 0, data: {} }, token)).status, 200);
  const other = (await reg(api, 'otra.persona', 'otra-clave-123')).token;
  assert.deepEqual((await call(api, 'GET', '/api/data', null, other)).json.airlines, {});
});
