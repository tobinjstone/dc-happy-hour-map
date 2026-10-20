// Saves visitor edits to happy hours, wiki style: edits go live at once,
// every version is kept, and anyone can restore an earlier one.
import { validateEdit } from '../../js/edit-model.js';

const MAX_PHOTO = 8 * 1024 * 1024;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

const json = (data, headers, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function ipHash(req) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${day}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

async function overLimit(env, hash) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM edits WHERE ip_hash = ? AND created_at > ?').bind(hash, since).first();
  return (row?.n || 0) >= Number(env.DAILY_LIMIT || 30);
}

function toEdit(row, base) {
  const body = JSON.parse(row.body);
  return {
    ...body,
    id: row.id,
    venue_id: row.venue_id,
    created_at: row.created_at,
    photo_url: row.photo_key ? `${base}/photos/${row.photo_key}` : null,
    restored_from: row.restored_from,
    restored_original: !!row.restored_original
  };
}

async function insert(env, { venueId, body, photoKey = null, hash, restoredFrom = null, restoredOriginal = false }) {
  const createdAt = new Date().toISOString();
  const res = await env.DB.prepare(
    'INSERT INTO edits (venue_id, created_at, body, photo_key, ip_hash, restored_from, restored_original) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(venueId, createdAt, JSON.stringify(body), photoKey, hash, restoredFrom, restoredOriginal ? 1 : 0).first();
  return res;
}

async function createEdit(req, env, base, headers) {
  const form = await req.formData();
  const photo = form.get('photo');
  const hasPhoto = photo && typeof photo === 'object' && photo.size > 0;
  if (hasPhoto) {
    if (photo.size > MAX_PHOTO) return json({ error: 'That photo is too big. Try one under 8 MB.' }, headers, 400);
    if (!PHOTO_TYPES[photo.type]) return json({ error: 'The photo needs to be a JPEG, PNG, WebP or HEIC.' }, headers, 400);
  }
  let input;
  try { input = JSON.parse(form.get('edit') || '{}'); } catch { return json({ error: 'Something went wrong reading the form.' }, headers, 400); }
  const { edit, error } = validateEdit(input, { hasPhoto });
  if (error) return json({ error }, headers, 400);
  const hash = await ipHash(req);
  if (await overLimit(env, hash)) return json({ error: 'That\'s a lot of edits for one day. Try again tomorrow.' }, headers, 429);
  let photoKey = null;
  if (hasPhoto) {
    photoKey = `${edit.venue_id.replace(/[^\w-]/g, '_')}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${PHOTO_TYPES[photo.type]}`;
    await env.PHOTOS.put(photoKey, photo.stream(), { httpMetadata: { contentType: photo.type } });
  }
  const { venue_id: venueId, ...body } = edit;
  const row = await insert(env, { venueId, body, photoKey, hash });
  return json({ edit: toEdit(row, base) }, headers, 201);
}

// Restoring copies an older version forward as a new edit, so history only grows.
async function restore(req, env, base, headers) {
  const input = await req.json().catch(() => ({}));
  const hash = await ipHash(req);
  if (await overLimit(env, hash)) return json({ error: 'That\'s a lot of edits for one day. Try again tomorrow.' }, headers, 429);
  if (input.original && input.venue_id) {
    const row = await insert(env, { venueId: String(input.venue_id), body: {}, hash, restoredOriginal: true });
    return json({ edit: toEdit(row, base) }, headers, 201);
  }
  const old = await env.DB.prepare('SELECT * FROM edits WHERE id = ?').bind(Number(input.edit_id)).first();
  if (!old) return json({ error: 'Couldn\'t find that version.' }, headers, 404);
  const row = await insert(env, {
    venueId: old.venue_id, body: JSON.parse(old.body), photoKey: old.photo_key, hash,
    restoredFrom: old.id, restoredOriginal: !!old.restored_original
  });
  return json({ edit: toEdit(row, base) }, headers, 201);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const base = url.origin;
    const headers = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      if (req.method === 'GET' && url.pathname === '/edits') {
        // The newest edit for each bar.
        const { results } = await env.DB.prepare(
          'SELECT * FROM edits WHERE id IN (SELECT MAX(id) FROM edits GROUP BY venue_id)'
        ).all();
        return json({ edits: results.map((r) => toEdit(r, base)) }, { ...headers, 'Cache-Control': 'public, max-age=30' });
      }
      if (req.method === 'GET' && url.pathname === '/history') {
        const venue = url.searchParams.get('venue') || '';
        const { results } = await env.DB.prepare('SELECT * FROM edits WHERE venue_id = ? ORDER BY id DESC LIMIT 50').bind(venue).all();
        return json({ edits: results.map((r) => toEdit(r, base)) }, headers);
      }
      if (req.method === 'GET' && url.pathname.startsWith('/photos/')) {
        const obj = await env.PHOTOS.get(decodeURIComponent(url.pathname.slice('/photos/'.length)));
        if (!obj) return new Response('Not found', { status: 404, headers });
        return new Response(obj.body, {
          headers: { ...headers, 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }
        });
      }
      if (req.method === 'POST' && url.pathname === '/edits') return createEdit(req, env, base, headers);
      if (req.method === 'POST' && url.pathname === '/restore') return restore(req, env, base, headers);
      return json({ error: 'Not found' }, headers, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'Something went wrong saving that. Try again in a minute.' }, headers, 500);
    }
  }
};
