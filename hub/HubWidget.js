// Finance Hub — home-screen widget for iOS (runs in the free "Scriptable" app).
// Data: data/widget.json on the hub's own site, written by the hub on the PC when it publishes (same engine, same numbers).
// Widget parameter (long-press the widget → Edit Widget → Parameter): priorities | signals | pulse   (default: priorities)
// Tap the widget → opens the hub's dashboard. No account data, positions or keys are read or stored.
const SITE = 'https://amir6990.github.io/Signal/hub/';
const MODE = ((typeof args !== 'undefined' && args.widgetParameter) || 'priorities').trim().toLowerCase();
const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), 'hub-widget.json');
const SEEN = fm.joinPath(fm.documentsDirectory(), 'hub-widget-seen.json');
const C = { bg: new Color('#11161c'), fg: new Color('#e6edf3'), mute: new Color('#8b98a5'), good: new Color('#3fb27f'), bad: new Color('#e5534b'), warn: new Color('#d29922'), acc: new Color('#d9a74a') };
const FA = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const num = v => (typeof v === 'number' && isFinite(v)) ? FA(Math.round(v).toLocaleString('en-US').replace(/,/g, '٬')) : '—';
const pc = v => (typeof v === 'number' && isFinite(v)) ? FA((v >= 0 ? '+' : '') + (v * 100).toFixed(1)).replace('.', '٫') + '٪' : '—';
const gdate = d => d ? FA(String(d).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1/$2/$3')) : '—';
function ago(iso) { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); if (!isFinite(m)) return '—'; if (m < 60) return FA(m) + ' دقیقه پیش'; if (m < 1440) return FA(Math.round(m / 60)) + ' ساعت پیش'; return FA(Math.round(m / 1440)) + ' روز پیش'; }

async function load() {
  try { const r = new Request(SITE + 'data/widget.json?t=' + Date.now()); r.timeoutInterval = 15; const j = await r.loadJSON(); if (!j || !j.v) throw new Error('bad file'); fm.writeString(CACHE, JSON.stringify(j)); return { j, live: true }; }
  catch (e) { if (fm.fileExists(CACHE)) return { j: JSON.parse(fm.readString(CACHE)), live: false, err: String(e) }; return { j: null, live: false, err: String(e) }; }
}
function line(w, text, font, color, max) { const t = w.addText(text); t.font = font; t.textColor = color || C.fg; t.rightAlignText(); if (max) t.lineLimit = max; t.minimumScaleFactor = 0.7; return t; }
function build(D, fam) {
  const w = new ListWidget(); w.backgroundColor = C.bg; w.setPadding(12, 12, 12, 12); w.url = SITE + '#dash'; w.refreshAfterDate = new Date(Date.now() + 30 * 60000);
  const big = fam === 'large', small = fam === 'small';
  if (!D.j) { line(w, 'هاب مالی', Font.boldSystemFont(14), C.acc); line(w, 'داده‌ای دریافت نشد', Font.systemFont(12), C.bad); line(w, D.err || '', Font.systemFont(9), C.mute, 3); return w; }
  const j = D.j, title = { priorities: 'اولویت‌های امروز', signals: 'سیگنال‌های فعال', pulse: 'نبض بازار' }[MODE] || 'اولویت‌های امروز';
  line(w, title, Font.boldSystemFont(small ? 12 : 14), C.acc); w.addSpacer(4);
  const n = small ? 2 : big ? 6 : 3;
  if (MODE === 'signals') {
    const s = j.signals || []; if (!s.length) line(w, 'سیگنال تأییدشده‌ای نیست', Font.systemFont(12), C.mute);
    s.slice(0, n).forEach(x => { line(w, x.asset + ' · ' + x.action + ' · درجه ' + x.grade, Font.semiboldSystemFont(12), C.good, 1);
      if (!small) line(w, 'ورود ' + (x.entry ? num(x.entry[0]) + '–' + num(x.entry[1]) : '—') + ' · ضرر ' + num(x.stop) + ' · هدف ' + (x.tp ? num(x.tp[x.tp.length > 1 ? 1 : 0]) : '—'), Font.systemFont(10), C.mute, 1); });
    (j.alerts || []).slice(0, big ? 3 : 1).forEach(a => line(w, '⚠︎ ' + a, Font.systemFont(10), C.warn, 1));
  } else if (MODE === 'pulse') {
    (j.pulse || []).filter(x => !x.none).slice(0, small ? 3 : big ? 8 : 5).forEach(x => line(w, x.name + ': ' + num(x.v) + '  ' + pc(x.c1) + (x.stale ? '  (قدیمی)' : ''), Font.systemFont(small ? 10 : 11), x.stale ? C.warn : (x.c1 >= 0 ? C.good : C.bad), 1));
  } else {
    (j.priorities || []).slice(0, n).forEach(p => { line(w, FA(p.rank) + '. ' + p.asset + ' — ' + p.action, Font.semiboldSystemFont(small ? 11 : 12), p.kind === 'none' || p.kind === 'wait' ? C.mute : p.kind === 'urgent' ? C.bad : C.good, 1);
      if (!small) line(w, 'درجه ' + p.grade + ' · ' + p.horizon + ' · ریسک ' + p.risk, Font.systemFont(10), C.mute, 1); });
    if (big && j.forecast && j.forecast.length) { w.addSpacer(4); j.forecast.forEach(f => line(w, 'شاخص تا ' + FA(f.h) + ' جلسه: ' + FA(Math.round(f.p * 100)) + '٪ احتمال مثبت' + (f.skill ? '' : ' (نرخ پایه)'), Font.systemFont(10), C.mute, 1)); }
  }
  w.addSpacer();
  const old = (Date.now() - new Date(j.at).getTime()) > 36 * 3600e3;
  line(w, (D.live ? '' : 'آفلاین — آخرین دادهٔ معتبر · ') + ago(j.at) + (j.asOfFa ? ' · داده تا ' + FA(j.asOfFa) : j.asOf ? ' · داده تا ' + gdate(j.asOf) : ''), Font.systemFont(9), !D.live || old ? C.warn : C.mute, 2);
  if (j.val && j.val !== 'ok') line(w, 'اعتبارسنجی معتبر نیست', Font.systemFont(9), C.bad, 1);
  return w;
}
// local notification only for what is new since the last refresh: a new confirmed signal, a changed grade, a new stop warning
async function notifyNew(D) {
  try { if (!D.live || !D.j) return; const prev = fm.fileExists(SEEN) ? JSON.parse(fm.readString(SEEN)) : null, now = { g: {}, a: D.j.alerts || [] }, msg = [];
    (D.j.signals || []).forEach(s => { now.g[s.asset] = s.grade; });
    if (prev) { Object.keys(now.g).forEach(k => { if (!(k in prev.g)) msg.push('سیگنال تازه: ' + k + ' (درجه ' + now.g[k] + ')'); else if (prev.g[k] !== now.g[k]) msg.push(k + ': درجه از ' + prev.g[k] + ' به ' + now.g[k]); });
      Object.keys(prev.g).forEach(k => { if (!(k in now.g)) msg.push(k + ': دیگر سیگنال تأییدشده نیست'); }); now.a.forEach(a => { if (prev.a.indexOf(a) < 0) msg.push(a); }); }
    fm.writeString(SEEN, JSON.stringify(now)); if (!msg.length) return;
    const n = new Notification(); n.title = 'هاب مالی'; n.body = msg.slice(0, 6).join('\n'); n.openURL = SITE + '#dash'; await n.schedule(); } catch (e) { /* notifications are optional */ }
}
const D = await load();
await notifyNew(D);
const W = build(D, config.widgetFamily || 'medium');
if (config.runsInWidget) Script.setWidget(W); else await W.presentMedium();
Script.complete();
