// Función de Netlify (v2) que expone la API en /api/*. Los datos viven en Netlify Blobs.
// Variable de entorno opcional INVITE_CODE: si existe, para registrarse hace falta ese código.
import { getStore } from '@netlify/blobs';
import { createApi } from '../lib/core.mjs';

let api;
function getApi() {
  if (!api) {
    const blobs = () => getStore({ name: 'airsim', consistency: 'strong' });
    const storage = {
      get: (k) => blobs().get(k, { type: 'json' }),
      set: (k, v) => blobs().setJSON(k, v),
      delete: (k) => blobs().delete(k),
    };
    api = createApi(storage, { inviteCode: process.env.INVITE_CODE || '' });
  }
  return api;
}

export default async (req) => {
  const url = new URL(req.url);
  let body = null;
  if (!['GET', 'HEAD'].includes(req.method)) {
    try { body = await req.json(); } catch { body = null; }
  }
  const r = await getApi()({ method: req.method, path: url.pathname, headers: Object.fromEntries(req.headers), body });
  return new Response(JSON.stringify(r.json), {
    status: r.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};

export const config = { path: '/api/*' };
