/* サッカー分析ラボ - 共通ユーティリティ */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = (SL.util = {});

  U.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  U.sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);

  /** 秒 → "m:ss" / "h:mm:ss"（tenth=true で 0.1 秒まで） */
  U.fmtTime = (sec, tenth) => {
    if (!isFinite(sec)) sec = 0;
    sec = Math.max(0, sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const base = (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
    return tenth ? base + '.' + Math.floor((sec % 1) * 10) : base;
  };

  /** "1:23.4" / "83.4" / "1:02:03" → 秒。読めなければ NaN */
  U.parseTime = (str) => {
    const s = String(str || '').trim();
    if (!s) return NaN;
    const parts = s.split(':').map(Number);
    if (parts.some((n) => !isFinite(n))) return NaN;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  };

  U.pct = (n, d, dp) => (d > 0 ? ((100 * n) / d).toFixed(dp == null ? 1 : dp) + '%' : '—');
  U.fix = (v, dp) => (v == null || !isFinite(v) ? '—' : v.toFixed(dp == null ? 1 : dp));
  U.ratio = (n, d) => (d > 0 ? n / d : null);

  /** シード付き乱数（mulberry32） */
  U.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.debounce = (fn, ms) => {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
    wrapped.flush = (...args) => {
      clearTimeout(timer);
      fn(...args);
    };
    return wrapped;
  };

  /** 次のアニメーションフレームで1回だけ実行する */
  U.rafOnce = (fn) => {
    let queued = false;
    return () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn();
      });
    };
  };

  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  U.download = (data, filename, mime) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  U.csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  U.today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /** 画面右下の小さな通知 */
  U.toast = (msg, kind) => {
    if (typeof document === 'undefined') return;
    let zone = document.getElementById('toastZone');
    if (!zone) {
      zone = document.createElement('div');
      zone.id = 'toastZone';
      zone.className = 'toast-zone';
      document.body.appendChild(zone);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    zone.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  };
})();
