/* =====================================================================
 * AI — one entry point for every "ask Claude" feature (Strategy Studio,
 * Strict Auditor, Financing Solutions, PDF reading).
 *   1. Inside the claude.ai artifact: the artifact's own sample capability.
 *   2. Anywhere else (the standalone HTML opened from disk or a website):
 *      the Anthropic Messages API called from the browser with the user's own
 *      API key (stored only in this browser's localStorage). A custom base URL
 *      lets you route through your own gateway or proxy.
 *   3. Neither: null — the tools fall back to Copy prompt / Import answer.
 * The returned object mimics the artifact's sample namespace:
 *   sample(input) → {text}, sample.json(prompt, {images, modelTier, signal}) → value,
 *   sample.limits() → {images:{maxCount}}.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var STORE = 'hub.ai.v1';
  function U() { return Hub.util; }
  function settings() {
    var d = { provider: 'anthropic', apiKey: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', complexModel: 'claude-opus-5-5', maxTokens: 16000, mode: 'off' };
    // independence: no AI by default. Every engine (signals, back-test, validation, auditor, financing, reports) runs without it; an AI model —
    // Claude, an OpenAI-compatible service or a local model (Ollama, LM Studio) — is only used after the user switches it on and only for the
    // optional «AI review» buttons. Older saved settings with the automatic mode and no key are read as off.
    try { var o = Object.assign(d, U().store.get(STORE, {}) || {}); if (o.mode === 'auto' && !o.apiKey && o.provider !== 'openai') o.mode = 'off'; return o; } catch (e) { return d; }
  }
  function save(s) { U().store.set(STORE, s); P = null; }
  function blobB64(b) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(b); }); }
  function parseJSON(t) {
    t = String(t || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    var i = t.indexOf('{'), j = t.lastIndexOf('}'), a = t.indexOf('['), b = t.lastIndexOf(']');
    if (i >= 0 && j > i && (a < 0 || i < a)) return JSON.parse(t.slice(i, j + 1));
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('Claude did not return JSON.');
  }
  function apiClient(s) {
    function call(content, opts) {
      opts = opts || {};
      var model = opts.modelTier === 'complex' ? s.complexModel || s.model : s.model;
      return fetch(String(s.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '') + '/v1/messages', {
        method: 'POST', signal: opts.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: model, max_tokens: Number(s.maxTokens) || 16000, messages: [{ role: 'user', content: content }] })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error('Anthropic API ' + r.status + ': ' + ((j.error && j.error.message) || r.statusText)); e.code = r.status === 401 ? 'not_granted' : r.status === 429 ? 'rate_limited' : 'api_error'; e.status = r.status; throw e; }
          return { text: (j.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join(''), truncated: j.stop_reason === 'max_tokens', model: j.model };
        });
      }, function (e) { if (e && e.name === 'AbortError') throw e; var x = new Error('Could not reach the Anthropic API (' + (e && e.message || e) + '). Check the network, or set a gateway base URL.'); x.code = 'network'; throw x; });
    }
    function build(input, opts) {
      var imgs = (opts && opts.images) || [];
      return Promise.all(imgs.map(function (b) { return blobB64(b).then(function (d) { return { type: 'image', source: { type: 'base64', media_type: b.type || 'image/jpeg', data: d } }; }); }))
        .then(function (blocks) { return blocks.concat([{ type: 'text', text: typeof input === 'string' ? input : JSON.stringify(input) }]); });
    }
    var sample = function (input, opts) { return build(input, opts).then(function (c) { return call(c, opts); }); };
    sample.json = function (prompt, opts) {
      return build(prompt + '\n\nReply with the JSON only, no prose and no code fences.', opts).then(function (c) { return call(c, opts); }).then(function (r) {
        try { return parseJSON(r.text); } catch (e) { if (r.truncated) throw new Error('The answer was cut off (max tokens). Raise “Max output tokens” on Data sources & keys.'); throw e; }
      });
    };
    sample.limits = function () { return Promise.resolve({ images: { maxCount: 20 } }); };
    return sample;
  }
  // any OpenAI-compatible chat API: OpenRouter, a local model (Ollama, LM Studio) or a regional gateway
  function openaiClient(s) {
    function call(content, opts) {
      opts = opts || {};
      var model = opts.modelTier === 'complex' ? s.complexModel || s.model : s.model, hd = { 'content-type': 'application/json' };
      if (s.apiKey) hd.authorization = 'Bearer ' + s.apiKey;
      return fetch(String(s.baseUrl || '').replace(/\/+$/, '') + '/chat/completions', { method: 'POST', signal: opts.signal, headers: hd,
        body: JSON.stringify({ model: model, max_tokens: Number(s.maxTokens) || 16000, messages: [{ role: 'user', content: content }] }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error('AI API ' + r.status + ': ' + ((j.error && (j.error.message || j.error)) || r.statusText)); e.code = r.status === 401 ? 'not_granted' : r.status === 429 ? 'rate_limited' : 'api_error'; e.status = r.status; throw e; }
          var c = j.choices && j.choices[0] || {}; return { text: (c.message && c.message.content) || '', truncated: c.finish_reason === 'length', model: j.model };
        }); }, function (e) { if (e && e.name === 'AbortError') throw e; var x = new Error('Could not reach ' + s.baseUrl + ' (' + (e && e.message || e) + '). Check the address, the network, or CORS on that server.'); x.code = 'network'; throw x; });
    }
    function build(input, opts) {
      var imgs = (opts && opts.images) || [];
      return Promise.all(imgs.map(function (b) { return blobB64(b).then(function (d) { return { type: 'image_url', image_url: { url: 'data:' + (b.type || 'image/jpeg') + ';base64,' + d } }; }); }))
        .then(function (blocks) { var txt = typeof input === 'string' ? input : JSON.stringify(input); return blocks.length ? blocks.concat([{ type: 'text', text: txt }]) : txt; });
    }
    var sample = function (input, opts) { return build(input, opts).then(function (c) { return call(c, opts); }); };
    sample.json = function (prompt, opts) { return build(prompt + '\n\nReply with the JSON only, no prose and no code fences.', opts).then(function (c) { return call(c, opts); }).then(function (r) { try { return parseJSON(r.text); } catch (e) { if (r.truncated) throw new Error('The answer was cut off (max tokens).'); throw e; } }); };
    sample.limits = function () { return Promise.resolve({ images: { maxCount: s.vision === false ? 0 : 8 } }); };
    return sample;
  }
  /* Bridge: no key, no network. The page shows the full prompt; the person copies it into a Claude chat
   * (app or claude.ai, on their own subscription), then pastes the answer back. Text only: images are not carried. */
  function bridgeClient() {
    function ask(prompt, opts, wantJSON) {
      opts = opts || {};
      return new Promise(function (resolve, reject) {
        var d = root.document; if (!d || !d.body) { var e0 = new Error('No AI connection.'); e0.code = 'no_key'; return reject(e0); }
        var full = String(prompt) + (wantJSON ? '\n\nReply with the JSON only, no prose and no code fences.' : '');
        var ov = d.createElement('div'); ov.className = 'ai-bridge'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('data-notr', '1'); ov.dir = 'rtl';
        ov.innerHTML = '<div class="ai-bridge-box"><h3>پاسخ از Claude (بدون کلید)</h3>' +
          '<ol class="ai-bridge-steps"><li>«کپی درخواست» را بزنید.</li><li>«باز کردن Claude» را بزنید، در یک گفت‌وگوی تازه بچسبانید و بفرستید.</li><li>کل پاسخ Claude را کپی کنید، این‌جا بچسبانید و «ثبت پاسخ» را بزنید.</li></ol>' +
          '<div class="row-ctl"><button type="button" class="btn primary" data-a="copy">۱. کپی درخواست</button><a class="btn" data-a="open" href="https://claude.ai/new" target="_blank" rel="noopener">۲. باز کردن Claude</a>' +
          '<span class="muted ai-bridge-n"></span></div>' +
          '<details><summary class="muted">دیدن متن درخواست</summary><textarea class="f-area" rows="5" readonly dir="auto"></textarea></details>' +
          '<label class="f-lbl">۳. پاسخ Claude را این‌جا بچسبانید</label><textarea class="f-area ai-bridge-ans" rows="7" dir="auto" placeholder="پاسخ Claude…"></textarea>' +
          '<p class="ai-bridge-msg muted" aria-live="polite"></p>' +
          '<div class="row-ctl"><button type="button" class="btn primary" data-a="ok">ثبت پاسخ</button><button type="button" class="btn ghost" data-a="paste">چسباندن از کلیپ‌بورد</button><button type="button" class="btn ghost" data-a="cancel">لغو</button></div></div>';
        var q = function (sel) { return ov.querySelector(sel); }, pt = q('details textarea'), ans = q('.ai-bridge-ans'), msg = q('.ai-bridge-msg');
        pt.value = full; q('.ai-bridge-n').textContent = full.length.toLocaleString('fa-IR') + ' نویسه' + (opts.images && opts.images.length ? ' · تصویرها منتقل نمی‌شوند' : '');
        function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); d.removeEventListener('keydown', key); }
        function fail(code, m) { close(); var e = new Error(m); e.code = code; reject(e); }
        function key(e) { if (e.key === 'Escape') fail('aborted', 'لغو شد.'); }
        d.addEventListener('keydown', key);
        if (opts.signal) { if (opts.signal.aborted) return fail('aborted', 'Stopped.'); opts.signal.addEventListener('abort', function () { fail('aborted', 'Stopped.'); }); }
        function copyText() {
          var done = function () { msg.textContent = 'کپی شد. حالا Claude را باز کنید و بچسبانید.'; };
          if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(full).then(done, function () { q('details').open = true; pt.focus(); pt.select(); msg.textContent = 'کلیپ‌بورد اجازه نداد؛ متن را از کادر بالا انتخاب و کپی کنید.'; });
          else { q('details').open = true; pt.focus(); pt.select(); try { d.execCommand('copy'); done(); } catch (e) { msg.textContent = 'متن را از کادر بالا کپی کنید.'; } }
        }
        ov.addEventListener('click', function (e) {
          var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return;
          if (a === 'copy') copyText();
          else if (a === 'paste') { if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { ans.value = t; }, function () { msg.textContent = 'مرورگر اجازهٔ خواندن کلیپ‌بورد نداد؛ با نگه‌داشتن انگشت در کادر «Paste» را بزنید.'; }); }
          else if (a === 'cancel') fail('aborted', 'لغو شد.');
          else if (a === 'ok') {
            var t = ans.value.trim(); if (!t) { msg.textContent = 'کادر پاسخ خالی است.'; return; }
            if (wantJSON) { try { var j = parseJSON(t); close(); resolve(j); } catch (er) { msg.textContent = 'پاسخ ساختار JSON کامل ندارد (احتمالاً ناقص کپی شده). کل پاسخ را از ابتدا تا انتها کپی کنید، یا در Claude بنویسید «فقط JSON کامل را دوباره بده».'; } }
            else { close(); resolve({ text: t, truncated: false, model: 'claude (chat)' }); }
          }
        });
        d.body.appendChild(ov); setTimeout(function () { q('[data-a=copy]').focus(); }, 0);
      });
    }
    var sample = function (input, opts) { return ask(typeof input === 'string' ? input : JSON.stringify(input), opts, false); };
    sample.json = function (prompt, opts) { return ask(prompt, opts, true); };
    sample.limits = function () { return Promise.resolve({ images: { maxCount: 0 } }); };
    sample.manual = true;
    return sample;
  }
  var P = null, via = 'none';
  // the claude.ai runtime can attach window.claude after this script runs: wait briefly for it
  function waitClaude(ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function poll() { if (root.claude && typeof root.claude.use === 'function') return res(root.claude); if (Date.now() - t0 > ms) return res(null); setTimeout(poll, 150); })();
    });
  }
  // resolves to a sample-like object or null; a null result is never cached, so a later call can still connect
  function sampler() {
    if (P) return P;
    var s = settings();
    if (s.mode === 'off') { via = 'off'; return Promise.resolve(null); }
    if (s.mode === 'bridge' && root.document) { via = 'bridge'; return (P = Promise.resolve(bridgeClient())); }
    var artifact = s.mode === 'api' ? Promise.resolve(null) : waitClaude(root.location && /^file:/.test(root.location.protocol) ? 0 : 3000)
      .then(function (c) { return c ? c.use('sample').catch(function () { return null; }) : null; });
    // the artifact's namespace is frozen: never write to it; remember the route separately
    var p = artifact.then(function (a) { if (a) { via = 'artifact'; return a; } if (s.provider === 'openai' && s.baseUrl && !/api\.anthropic\.com/.test(s.baseUrl)) { via = 'openai'; return openaiClient(s); } if (s.apiKey) { via = 'api'; return apiClient(s); } if (s.mode !== 'api' && s.mode !== 'off' && root.document) { via = 'bridge'; return bridgeClient(); } via = 'none'; return null; });
    P = p; p.then(function (x) { if (!x && P === p) P = null; });
    return p;
  }
  function status() { return sampler().then(function () { return via; }); }
  // why a connection cannot even be attempted, before any request is sent
  function precheck() {
    var s = settings(), op = s.provider === 'openai' && s.baseUrl && !/api\.anthropic\.com/.test(s.baseUrl);
    var https = root.location && root.location.protocol === 'https:';
    if (op && https && /^http:\/\//i.test(s.baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)([:\/]|$)/i.test(s.baseUrl)) return 'mixed';
    if (!op && !s.apiKey) return 'no_key';
    return '';
  }
  function models() {
    var s = settings(), hd = {}; if (s.apiKey) hd.authorization = 'Bearer ' + s.apiKey;
    return fetch(String(s.baseUrl || '').replace(/\/+$/, '') + '/models', { headers: hd }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { return ((j && j.data) || []).map(function (m) { return m && m.id; }).filter(Boolean); }).catch(function () { return []; });
  }
  function test() { P = null; return sampler().then(function (x) { if (x && x.manual) return { ok: true, mode: 'bridge' }; if (!x) { var e = new Error('No AI connection: add an API key (or a local model address).'); e.code = precheck() || 'no_key'; throw e; } return x.json('Return {"ok":true,"model":"<your model name>"}', { modelTier: 'default' }); }); }
  /* Live web search: the Anthropic Messages API with its server-side web search tool (web_search_20250305), called with the user's own key.
   * The search runs on Anthropic's servers, so the browser's cross-site limits do not apply. Returns the answer text together with every page the
   * search actually returned ({url, title, page_age}) and every citation ({url, title, cited_text}); callers must show only links that are in those lists.
   * Not available inside the claude.ai artifact (no key there) or with a non-Anthropic provider. Billed per search by Anthropic. */
  function search(prompt, opts) {
    opts = opts || {}; var s = settings();
    if (!s.apiKey || (s.provider === 'openai' && !/api\.anthropic\.com/.test(s.baseUrl || ''))) { var e0 = new Error('no_key'); e0.code = 'no_key'; return Promise.reject(e0); }
    var url = String(s.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '') + '/v1/messages', tool = { type: 'web_search_20250305', name: 'web_search', max_uses: opts.maxUses || 6 };
    if (opts.allowed && opts.allowed.length) tool.allowed_domains = opts.allowed; else if (opts.blocked && opts.blocked.length) tool.blocked_domains = opts.blocked;
    var msgs = [{ role: 'user', content: prompt }], out = { text: '', results: [], cites: [], searches: 0, errors: [] };
    var step = function (n) {
      return fetch(url, { method: 'POST', signal: opts.signal, headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: opts.modelTier === 'complex' ? s.complexModel || s.model : s.model, max_tokens: Number(s.maxTokens) || 16000, messages: msgs, tools: [tool] }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error('Anthropic API ' + r.status + ': ' + ((j.error && j.error.message) || r.statusText)); e.code = r.status === 401 ? 'not_granted' : r.status === 429 ? 'rate_limited' : 'api_error'; e.status = r.status; throw e; }
          (j.content || []).forEach(function (c) {
            if (c.type === 'text') { out.text += c.text; (c.citations || []).forEach(function (q) { if (q.url) out.cites.push({ url: q.url, title: q.title || '', cited_text: q.cited_text || '' }); }); }
            else if (c.type === 'web_search_tool_result') { if (Array.isArray(c.content)) c.content.forEach(function (q) { if (q.type === 'web_search_result' && q.url) out.results.push({ url: q.url, title: q.title || '', page_age: q.page_age || '' }); }); else if (c.content && c.content.error_code) out.errors.push(c.content.error_code); } });
          out.searches += (j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests) || 0;
          if (j.stop_reason === 'pause_turn' && n < 4) { msgs.push({ role: 'assistant', content: j.content }); return step(n + 1); }   // a long search turn is resumed by sending it back unchanged
          out.truncated = j.stop_reason === 'max_tokens'; out.model = j.model; return out; }); },
        function (e) { if (e && e.name === 'AbortError') throw e; var x = new Error('Could not reach the Anthropic API (' + (e && e.message || e) + ').'); x.code = 'network'; throw x; });
    };
    return step(0);
  }
  Hub.ai = { settings: settings, save: save, sampler: sampler, status: status, test: test, precheck: precheck, models: models, parseJSON: parseJSON, search: search };
})(typeof window !== 'undefined' ? window : globalThis);
