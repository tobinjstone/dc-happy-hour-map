// Fizz reports for Fountain Cig, the fountain Diet Coke map (fountain/): anyone can say
// they had one somewhere, how fizzy it was, or that it was out. Reports show
// up for everyone straight away. People can also add a spot the chain data
// doesn't have, like an independent pizza place.
import { validateReport, validatePlace } from '../../fountain/js/report-model.js';
import { json, ipHash } from './util.js';

const RECENT_DAYS = 365;
const MAX_RECENT = 5000;

async function overLimit(env, hash) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const row = await env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM fountain_reports WHERE ip_hash = ?1 AND created_at > ?2) + (SELECT COUNT(*) FROM fountain_places WHERE ip_hash = ?1 AND created_at > ?2) AS n'
  ).bind(hash, since).first();
  return (row?.n || 0) >= Number(env.FOUNTAIN_DAILY_LIMIT || 40);
}

function toReport(row) {
  const body = JSON.parse(row.body || '{}');
  return { id: row.id, place_id: row.place_id, created_at: row.created_at, status: row.status, fizz: row.fizz, ...body };
}

const toPlace = (row) => ({ id: row.id, created_at: row.created_at, name: row.name, address: row.address, lat: row.lat, lng: row.lng });

async function insertReport(env, report, hash) {
  const { place_id: placeId, status, fizz, ...body } = report;
  const row = await env.DB.prepare(
    'INSERT INTO fountain_reports (place_id, created_at, status, fizz, body, ip_hash) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(placeId, new Date().toISOString(), status, fizz, JSON.stringify(body), hash).first();
  return toReport(row);
}

async function readBody(req) {
  try { return await req.json(); } catch { return null; }
}

export async function handleFountain(req, env, url, headers) {
  const path = url.pathname.slice('/fountain'.length);

  if (req.method === 'GET' && path === '/reports') {
    const place = url.searchParams.get('place');
    if (place) {
      const { results } = await env.DB.prepare('SELECT * FROM fountain_reports WHERE place_id = ? ORDER BY id DESC LIMIT 50').bind(place).all();
      return json({ reports: results.map(toReport) }, headers);
    }
    const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
    const [reports, places] = await Promise.all([
      env.DB.prepare('SELECT * FROM fountain_reports WHERE created_at > ? ORDER BY id DESC LIMIT ?').bind(since, MAX_RECENT).all(),
      env.DB.prepare('SELECT * FROM fountain_places ORDER BY created_at').all()
    ]);
    return json({ reports: reports.results.map(toReport), places: places.results.map(toPlace) }, { ...headers, 'Cache-Control': 'public, max-age=30' });
  }

  if (req.method === 'POST' && path === '/reports') {
    const { report, error } = validateReport(await readBody(req));
    if (error) return json({ error }, headers, 400);
    const hash = await ipHash(req);
    if (await overLimit(env, hash)) return json({ error: 'That\'s a lot of Diet Cokes for one day. Try again tomorrow.' }, headers, 429);
    return json({ report: await insertReport(env, report, hash) }, headers, 201);
  }

  // A new spot comes with its first report, so nothing lands on the map unvouched for.
  if (req.method === 'POST' && path === '/places') {
    const input = await readBody(req);
    const { place, error } = validatePlace(input?.place);
    if (error) return json({ error }, headers, 400);
    const id = `spot-${crypto.randomUUID().slice(0, 8)}`;
    const checked = validateReport({ ...input?.report, place_id: id });
    if (checked.error) return json({ error: checked.error }, headers, 400);
    const hash = await ipHash(req);
    if (await overLimit(env, hash)) return json({ error: 'That\'s a lot of Diet Cokes for one day. Try again tomorrow.' }, headers, 429);
    const row = await env.DB.prepare(
      'INSERT INTO fountain_places (id, created_at, name, address, lat, lng, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
    ).bind(id, new Date().toISOString(), place.name, place.address, place.lat, place.lng, hash).first();
    const report = await insertReport(env, checked.report, hash);
    return json({ place: toPlace(row), report }, headers, 201);
  }

  return json({ error: 'Not found' }, headers, 404);
}
