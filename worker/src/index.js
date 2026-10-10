// 주차되는 카페 — 데이터 조회 API (Cloudflare Worker)
// 데이터(data.json)는 Worker 안에만 들어 있고, 화면에는 요청한 동네의 매장만 최대 30곳씩 내려준다.
import DATA from './data.json';

const STORES = DATA.stores;
const TIER = { '무료': 0, '조건부무료': 1, '유료': 2, '가능미상': 3 };
const PAGE_MAX = 30;          // 한 번에 내려주는 최대 매장 수
const DEPTH_MAX = 300;        // 한 검색에서 볼 수 있는 최대 깊이(offset+limit)
const RADIUS_MAX = 10;        // km
const RATE = { windowMs: 60_000, max: 45 };   // IP당 분당 요청 수(Worker 인스턴스 단위, 보조 장치)

const BY_AREA = {};
for (const s of STORES) (BY_AREA[s.g + '|' + s.d] = BY_AREA[s.g + '|' + s.d] || []).push(s);
for (const a of Object.values(BY_AREA)) a.sort((x, y) => (TIER[x.t] ?? 4) - (TIER[y.t] ?? 4) || (x.r || 999) - (y.r || 999) || x.n.localeCompare(y.n, 'ko'));

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now - h.t > RATE.windowMs) { h = { t: now, n: 0 }; hits.set(ip, h); }
  h.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > RATE.windowMs) hits.delete(k);
  return h.n > RATE.max;
}

function hav(la1, lo1, la2, lo2) {
  const R = 6371000, p = Math.PI / 180;
  const a = Math.sin((la2 - la1) * p / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin((lo2 - lo1) * p / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function kstNow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g('weekday')];
  return { dow, min: (parseInt(g('hour'), 10) % 24) * 60 + parseInt(g('minute'), 10) };
}
function hoursToday(s, NOW) {
  const dow = NOW.dow;
  let raw = dow === 6 ? s.h2 : dow === 0 ? s.h3 : s.h1;
  if (raw && raw.includes('|')) { const p = raw.split('|'); raw = dow === 2 ? p[0] : dow === 4 ? p[2] : p[1]; }
  if (!raw || raw === '-') return { text: '시간 정보 없음', st: 'unknown' };
  if (raw === '휴점') return { text: '오늘 휴점', st: 'closed' };
  const m = raw.match(/(\d\d):(\d\d)~(\d\d):(\d\d)/);
  if (!m) return { text: raw, st: 'unknown' };
  const o = +m[1] * 60 + +m[2], c = +m[3] * 60 + +m[4];
  const open = c <= o ? (NOW.min >= o || NOW.min < c) : (NOW.min >= o && NOW.min < c);
  return { text: '오늘 ' + raw.replace('~', ' ~ '), st: open ? 'open' : 'closed' };
}

function json(body, status, cors, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...cors, ...extra } });
}

function numParam(u, k, lo, hi, dflt) {
  const v = parseFloat(u.searchParams.get(k));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}

function query(u) {
  const NOW = kstNow();
  const brands = new Set((u.searchParams.get('brands') || 'SB,CB,TW').split(',').filter((b) => ['SB', 'CB', 'TW'].includes(b)));
  const tags = new Set((u.searchParams.get('tags') || '무료,조건부무료,유료,가능미상').split(',').filter((t) => ['무료', '조건부무료', '유료', '가능미상', '불가', '확인필요'].includes(t)));
  const q = (u.searchParams.get('q') || '').trim().toLowerCase().slice(0, 40);
  const gu = u.searchParams.get('gu') || '', dong = u.searchParams.get('dong') || '';
  const mode = u.searchParams.get('mode') || 'area';
  const lat = numParam(u, 'lat', 36.8, 38.4, 37.5), lng = numParam(u, 'lng', 126.3, 127.9, 127.0);
  const radius = numParam(u, 'radius', 1, RADIUS_MAX, 3);
  const sort = u.searchParams.get('sort') === 'dist' ? 'dist' : 'cost';
  const openOnly = u.searchParams.get('open') === '1';
  const offset = Math.floor(numParam(u, 'offset', 0, DEPTH_MAX, 0));
  const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(numParam(u, 'limit', 1, PAGE_MAX, PAGE_MAX))));
  if (q && q.length < 2) return { error: '검색어는 2글자 이상 입력해 주세요.' };
  if (!q && !gu && mode === 'area') return { error: '지역(구)을 선택해 주세요.' };

  const arr = [];
  for (const s of STORES) {
    if (!brands.has(s.b)) continue;
    if (!tags.has(s.t)) continue;
    if (q) { if (!(s.n + ' ' + s.ad + ' ' + s.d).toLowerCase().includes(q)) continue; }
    else if (mode === 'area' && !dong) { if (s.g !== gu) continue; }
    const dist = hav(lat, lng, s.la, s.lo);
    if (!q && !(mode === 'area' && !dong) && dist > radius * 1000) continue;
    const h = hoursToday(s, NOW);
    if (openOnly && h.st !== 'open') continue;
    arr.push({ s, dist, h });
  }
  if (sort === 'cost') {
    arr.sort((a, b) => {
      const ta = TIER[a.s.t] ?? 4, tb = TIER[b.s.t] ?? 4;
      const ca = a.s.c == null ? 1e9 : a.s.c, cb = b.s.c == null ? 1e9 : b.s.c;
      return ta - tb || ca - cb || (b.s.fe - a.s.fe) || a.dist - b.dist;
    });
  } else arr.sort((a, b) => a.dist - b.dist);

  const counts = { '무료': 0, '조건부무료': 0, '유료': 0, '가능미상': 0 };
  for (const x of arr) if (counts[x.s.t] != null) counts[x.s.t]++;
  const end = Math.min(offset + limit, DEPTH_MAX, arr.length);
  const items = arr.slice(offset, Math.max(offset, end)).map(({ s, dist, h }) => {
    const sibAll = (BY_AREA[s.g + '|' + s.d] || []).filter((v) => v.i !== s.i);
    const { raw, ...pub } = s;   // 원문은 목록에 싣지 않는다(상세 요청 /api/raw 로만)
    return { ...pub, hasRaw: !!raw, dist: Math.round(dist), h,
      sibn: sibAll.length,
      sib: sibAll.slice(0, 14).map((v) => ({ i: v.i, n: v.n, b: v.b, t: v.t, s: v.s, r: v.r })) };
  });
  return { total: arr.length, counts, items, next: end < arr.length && end < DEPTH_MAX ? end : null, capped: arr.length > DEPTH_MAX };
}

export default {
  async fetch(request, env) {
    const allow = (env && env.ALLOWED_ORIGIN) || '';
    const origin = request.headers.get('Origin') || '';
    const cors = allow ? { 'access-control-allow-origin': allow, vary: 'Origin' } : { 'access-control-allow-origin': '*' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);
    if (allow && origin && origin !== allow) return json({ error: 'forbidden' }, 403, {});
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (limited(ip)) return json({ error: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }, 429, cors, { 'retry-after': '60' });
    const u = new URL(request.url);
    if (u.pathname === '/api/meta') {
      return json({ built: DATA.built, gus: DATA.gus, dongs: DATA.dongs }, 200, cors, { 'cache-control': 'public, max-age=3600' });
    }
    if (u.pathname === '/api/raw') {
      const b = u.searchParams.get('b') || '', i = u.searchParams.get('i') || '';
      const s = STORES.find((v) => v.b === b && v.i === i);
      if (!s) return json({ error: '매장을 찾을 수 없어요.' }, 404, cors);
      return json({ raw: s.raw || '' }, 200, cors, { 'cache-control': 'public, max-age=300' });
    }
    if (u.pathname === '/api/stores') {
      const r = query(u);
      if (r.error) return json(r, 400, cors);
      return json(r, 200, cors, { 'cache-control': 'public, max-age=60' });
    }
    return json({ error: 'not found' }, 404, cors);
  },
};
