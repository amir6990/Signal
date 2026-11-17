/* Scheduled push job for the hub (approved by the owner on 2026-11-17).
 * Reads the published central verdict (hub/data/tse.json → hub.central.v1, without the owner's positions) and TGJU's live board,
 * runs the hub's own alert rules (alerts.js, copied from js/core/alerts.js) and sends encrypted Web Push notifications to the
 * subscriptions in hub/push/subs.json. State (baseline + sent ids, no alert text) is kept in hub/push/state.json.
 * TSETMC does not answer GitHub's servers: stock alerts come only from published snapshots. */
import fs from 'node:fs';
import vm from 'node:vm';
import webpush from 'web-push';

const rd = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const priv = process.env.VAPID_PRIVATE_KEY, vapid = rd('hub/push/vapid.json', null), subs = (rd('hub/push/subs.json', { subs: [] }).subs || []);
if (!priv || !vapid || !vapid.publicKey) { console.log('push not configured (secret VAPID_PRIVATE_KEY or hub/push/vapid.json missing) — nothing to do'); process.exit(0); }
if (!subs.length) { console.log('no subscriptions — nothing to do'); process.exit(0); }
webpush.setVapidDetails('https://amir6990.github.io/Signal/hub/', vapid.publicKey, priv);

// the published central verdict
const tse = rd('hub/data/tse.json', null), C = tse && tse.stores && tse.stores['hub.central.v1'];
const state = rd('hub/push/state.json', { snap: {}, sent: {}, centralAt: 0 });

// a minimal host for alerts.js: an in-memory store; no DOM, no toasts, no system notifications
const mem = { 'hub.alerts.v1': { set: {}, log: [], sent: state.sent || {}, snap: state.snap || {}, stats: {} }, 'hub.central.v1': C || null };
const ctx = { console, Date, Math, JSON, Promise, Object, Array, String, Number, isFinite, setTimeout };
ctx.window = ctx; ctx.globalThis = ctx;
ctx.Hub = { util: { store: { get: (k, d) => (k in mem && mem[k] != null ? mem[k] : d), set: (k, v) => { mem[k] = v; return true; } } } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync('scripts/push/alerts.js', 'utf8'), ctx);
const A = ctx.Hub.alerts;

let events = [];
// 1 · a newer central verdict was published: compare with the last one seen here
if (C && C.by && C.at && C.at !== state.centralAt) { events = events.concat(A.evaluateCentral(C)); state.centralAt = C.at; console.log('central', new Date(C.at).toISOString(), Object.keys(C.by).length, 'assets'); }
// 2 · gold, coins and FX: TGJU live board against the published levels (today's prices only, Tehran date)
const teh = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
for (const host of ['call.tgju.org', 'call1.tgju.org', 'call2.tgju.org']) {
  try { const r = await fetch(`https://${host}/ajax.json`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), cur = (j && j.current) || {}, map = {};
    for (const k of Object.keys(cur)) { const c = cur[k] || {}, m = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.ts || ''), p = parseFloat(String(c.p || '').replace(/[^0-9.]/g, ''));
      if (m && m[1] + m[2] + m[3] === teh && p > 0) map['g:' + k] = { px: p, at: Date.now(), src: 'TGJU' }; }
    const res = A.evaluatePrices(map); events = events.concat(res.events); console.log('tgju', host, Object.keys(map).length, 'prices,', res.events.length, 'events'); break;
  } catch (e) { console.log('tgju', host, 'failed:', e.message); }
}
// dedup and rules exactly as on the device; then quiet hours (urgent and critical always go)
const fresh = await A.deliver(events);
const fa = (x) => (typeof x === 'number' && isFinite(x) ? Math.round(x).toLocaleString('en-US').replace(/[0-9]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[c]).replace(/,/g, '٬') : '—');
let sent = 0, dead = [];
for (const e of fresh) {
  if (A.quiet(e)) continue;
  const body = [e.mk + ' · ' + (e.act || e.tier || ''), 'قیمت ' + fa(e.px) + (e.zone ? ' · ورود ' + fa(e.zone[0]) + '–' + fa(e.zone[1]) : '') + (isFinite(e.stop) ? ' · حد ضرر ' + fa(e.stop) : '') + (isFinite(e.tp1) ? ' · هدف ۱ ' + fa(e.tp1) : ''), e.next].filter(Boolean).join('\n');
  const payload = JSON.stringify({ title: e.lvlFa + ' · ' + e.title + ' — ' + e.sym, body, tag: e.id, urgent: e.lvl === 'urgent' || e.lvl === 'critical', url: './#trade-center' });
  for (const s of subs) { try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 6 * 3600, urgency: e.lvl === 'urgent' || e.lvl === 'critical' ? 'high' : 'normal' }); sent++; }
    catch (err) { console.log('push failed', err.statusCode || '', String(err.body || err.message).slice(0, 120)); if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.endpoint); } }
}
console.log('events', events.length, 'new', fresh.length, 'pushes sent', sent, 'expired subscriptions', dead.length);
// state: baseline and sent ids only (no alert text in the public repo)
const S = mem['hub.alerts.v1']; const out = { snap: S.snap, sent: S.sent, centralAt: state.centralAt, at: new Date().toISOString() };
fs.mkdirSync('hub/push', { recursive: true }); fs.writeFileSync('hub/push/state.json', JSON.stringify(out));
if (dead.length) { const F = rd('hub/push/subs.json', { subs: [] }); F.subs = (F.subs || []).filter((s) => !dead.includes(s.endpoint)); fs.writeFileSync('hub/push/subs.json', JSON.stringify(F, null, 1)); }
