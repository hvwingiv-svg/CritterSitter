/* Artifact adapter for CritterSitter.
 * Replaces the Express sitter-code API with the artifact's shared db
 * (falls back to this browser's localStorage when db is unavailable),
 * routes file saves through the downloads capability, and turns off
 * browser APIs the artifact frame refuses so the app's fallbacks run. */
(function () {
  var CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var LOCAL_KEY = 'crittersitter-artifact-cards';
  var origFetch = window.fetch.bind(window);

  function cap(name) {
    try {
      return window.claude && typeof window.claude.use === 'function'
        ? window.claude.use(name).catch(function () { return null; })
        : Promise.resolve(null);
    } catch (e) { return Promise.resolve(null); }
  }

  // ---- storage: shared db when granted, else this browser only ----
  function localAll() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function localPut(code, rec) {
    try { var all = localAll(); all[code] = rec; localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function getCard(code) {
    return cap('db').then(function (db) {
      if (!db) return localAll()[code] || null;
      return db.doc('cards/' + code).get().then(function (s) { return s.exists ? s.data() : null; });
    });
  }
  function putCard(code, rec) {
    return cap('db').then(function (db) {
      if (!db) { localPut(code, rec); return; }
      return db.doc('cards/' + code).set(rec);
    });
  }
  function delCard(code) {
    return cap('db').then(function (db) {
      if (!db) { var all = localAll(); delete all[code]; try { localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); } catch (e) {} return; }
      return db.doc('cards/' + code).delete();
    });
  }

  function randomCode() {
    var b = new Uint8Array(6), s = '';
    crypto.getRandomValues(b);
    for (var i = 0; i < 6; i++) s += CHARS[b[i] % CHARS.length];
    return s;
  }
  function randomToken() {
    var b = new Uint8Array(32), s = '';
    crypto.getRandomValues(b);
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return s;
  }
  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function reply(status, body) {
    return new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } });
  }
  function freshCode(tries) {
    var code = randomCode();
    return getCard(code).then(function (hit) {
      return hit && tries < 20 ? freshCode(tries + 1) : code;
    });
  }

  function postCard(body) {
    var snapshot = body && body.snapshot;
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.pets)) {
      return Promise.resolve(reply(400, { error: 'Invalid card snapshot' }));
    }
    var json = JSON.stringify(snapshot);
    if (json.length > 240000) {
      return Promise.resolve(reply(413, { error: 'This card is too large to share. Try fewer pets or smaller photos.' }));
    }
    var requested = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    var token = typeof body.editToken === 'string' ? body.editToken.trim() : '';
    var rotate = Boolean(body.rotate);

    var keep = Promise.resolve(null);
    if (/^[A-Z0-9]{6}$/.test(requested) && token) {
      keep = Promise.all([getCard(requested), sha256(token)]).then(function (r) {
        var existing = r[0], hash = r[1];
        if (!existing || existing.tokenHash !== hash) return null;
        if (rotate) return delCard(requested).then(function () { return null; });
        return requested;
      });
    }
    return keep.then(function (code) {
      var editToken = code ? token : randomToken();
      return (code ? Promise.resolve(code) : freshCode(0)).then(function (finalCode) {
        return sha256(editToken).then(function (hash) {
          return putCard(finalCode, { snapshot: json, tokenHash: hash, updatedAt: Date.now() }).then(function () {
            return reply(200, { code: finalCode, editToken: editToken });
          });
        });
      });
    });
  }

  function readCard(raw) {
    var code = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{6}$/.test(code)) return Promise.resolve(reply(400, { error: 'Invalid sitter code format' }));
    return getCard(code).then(function (rec) {
      if (!rec || !rec.snapshot) return reply(404, { error: 'Sitter code not found' });
      var snap;
      try { snap = typeof rec.snapshot === 'string' ? JSON.parse(rec.snapshot) : rec.snapshot; } catch (e) { snap = null; }
      if (!snap) return reply(404, { error: 'Sitter code not found' });
      return reply(200, { code: code, snapshot: snap });
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var path;
    try { path = new URL(url, location.href).pathname; } catch (e) { path = url; }
    var m = /\/api\/cards(?:\/([^/]+))?\/?$/.exec(path);
    if (!m) return origFetch(input, init);
    var method = ((init && init.method) || 'GET').toUpperCase();
    var run;
    if (method === 'POST' && !m[1]) {
      var body = {};
      try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}
      run = postCard(body);
    } else if (method === 'GET' && m[1]) {
      run = readCard(decodeURIComponent(m[1]));
    } else {
      run = Promise.resolve(reply(404, { error: 'Not found' }));
    }
    return run.catch(function () {
      return reply(503, { error: 'Sitter codes are unavailable right now. Try again in a moment.' });
    });
  };

  // ---- file saves: <a download>.click() -> downloads capability ----
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.hasAttribute('download')) return origClick.call(this);
    var name = this.getAttribute('download') || 'download';
    name = name.replace(/\.backup$/i, '.json');
    var href = this.href;
    origFetch(href).then(function (r) { return r.blob(); }).then(function (blob) {
      return cap('downloads').then(function (d) {
        if (d) return d.save({ filename: name, data: blob });
      });
    }).catch(function () {});
  };

  // ---- APIs the frame refuses: hide them so the app uses its fallbacks ----
  try { Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true }); } catch (e) {}
})();
