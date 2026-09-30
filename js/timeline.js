/* サッカー分析ラボ - タイムライン（タグの分布・前半後半・ハイライト範囲・再生位置） */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const D = SL.derive;
  const C = SL.C;

  const PAD_L = 34;
  const PAD_R = 10;
  const Y_RULER = 0;
  const Y_PER = 19;
  const Y_LANE = { H: 38, A: 74 };
  const LANE_H = 34;
  const Y_CLIP = 111;
  const H_TOTAL = 122;

  const TL = (SL.timeline = {
    cv: null,
    ctx: null,
    tip: null,
    zoomSec: 0, // 0 = 全体
    vs: 0,
    hits: [],
    dragging: false,
    clips: [],
    selectedId: null,
    activeClip: -1,

    init() {
      TL.cv = document.getElementById('timeline');
      TL.ctx = TL.cv.getContext('2d');
      TL.tip = document.getElementById('tlTip');
      TL.redraw = U.rafOnce(TL.draw);
      new ResizeObserver(() => TL.redraw()).observe(TL.cv);
      TL.cv.addEventListener('pointerdown', TL._down);
      TL.cv.addEventListener('pointermove', TL._move);
      TL.cv.addEventListener('pointerup', TL._up);
      TL.cv.addEventListener('pointercancel', TL._up);
      TL.cv.addEventListener('pointerleave', () => {
        if (!TL.dragging) TL._hideTip();
      });
      TL.cv.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          TL.zoomBy(e.deltaY > 0 ? 1.35 : 1 / 1.35, TL._timeAt(e));
        },
        { passive: false }
      );
      document.querySelectorAll('[data-zoom]').forEach((b) =>
        b.addEventListener('click', () => {
          TL.setZoom(+b.dataset.zoom);
        })
      );
      SL.player.on('time', TL.redraw);
      SL.player.on('loaded', TL.redraw);
      SL.store.on(TL.redraw);
    },

    setZoom(sec) {
      TL.zoomSec = sec;
      const t = SL.player.time;
      TL.vs = Math.max(0, t - sec * 0.3);
      document.querySelectorAll('[data-zoom]').forEach((b) => b.classList.toggle('on', +b.dataset.zoom === sec));
      TL.redraw();
    },
    zoomBy(f, aroundT) {
      const dur = TL._duration();
      const cur = TL.zoomSec || dur;
      let next = U.clamp(cur * f, 15, dur);
      if (next >= dur * 0.98) next = 0;
      const a = aroundT == null ? SL.player.time : aroundT;
      const frac = (a - TL.vs) / cur;
      TL.zoomSec = next;
      if (next) TL.vs = a - frac * next;
      document.querySelectorAll('[data-zoom]').forEach((b) => b.classList.toggle('on', +b.dataset.zoom === next));
      TL.redraw();
    },
    setClips(list, activeIdx) {
      TL.clips = list || [];
      TL.activeClip = activeIdx == null ? -1 : activeIdx;
      TL.redraw();
    },
    setSelected(id) {
      TL.selectedId = id;
      TL.redraw();
    },

    _duration() {
      const ev = SL.store.state.events;
      const last = ev.length ? ev[ev.length - 1].t + 15 : 60;
      return Math.max(30, SL.player.duration || last);
    },
    _view() {
      const dur = TL._duration();
      if (!TL.zoomSec || TL.zoomSec >= dur) return [0, dur];
      const z = TL.zoomSec;
      const t = SL.player.time;
      if (!TL.dragging && (t < TL.vs + z * 0.08 || t > TL.vs + z * 0.92)) TL.vs = t - z * 0.3;
      TL.vs = U.clamp(TL.vs, 0, Math.max(0, dur - z));
      return [TL.vs, TL.vs + z];
    },
    _timeAt(e) {
      const r = TL.cv.getBoundingClientRect();
      const [vs, ve] = TL._view();
      const x = U.clamp(e.clientX - r.left, PAD_L, r.width - PAD_R);
      return vs + ((x - PAD_L) / (r.width - PAD_L - PAD_R)) * (ve - vs);
    },

    _near(e) {
      const r = TL.cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let best = null;
      let bd = 11;
      for (const h of TL.hits) {
        const d = Math.hypot(h.x - x, (h.y - y) * 0.7);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      return best;
    },
    _down(e) {
      TL.cv.setPointerCapture(e.pointerId);
      const hit = TL._near(e);
      if (hit) {
        SL.ui.selectEvent(hit.ev.id, { seek: true });
        return;
      }
      TL.dragging = true;
      SL.ui.userSeek();
      SL.player.seek(TL._timeAt(e));
    },
    _move(e) {
      if (TL.dragging) {
        SL.player.seek(TL._timeAt(e));
        return;
      }
      const hit = TL._near(e);
      if (hit) TL._showTip(hit, e);
      else TL._hideTip();
      TL.cv.style.cursor = hit ? 'pointer' : 'crosshair';
    },
    _up(e) {
      TL.dragging = false;
      try {
        TL.cv.releasePointerCapture(e.pointerId);
      } catch (err) {}
    },
    _showTip(hit, e) {
      const ev = hit.ev;
      const st = SL.store.state;
      const meta = C.EVENTS[ev.type];
      const who = ev.num != null ? SL.store.playerLabel(ev.team, ev.num) : '';
      const extra = [];
      if (ev.type === 'tov') extra.push(C.tovLabel(ev.sub || 'other').replace(/（.*）/, ''));
      if (ev.type === 'foul') extra.push(C.foulLabel(ev.sub || 'other').replace(/（.*）/, ''));
      if (ev.scene && C.isShot(ev)) extra.push(C.sceneShort(ev.scene));
      if (C.isShot(ev)) {
        const pos = C.shotPos(ev);
        if (pos) extra.push(C.zoneLabel(C.zoneFor(pos.sx, pos.sy)) + '（xG ' + SL.xg.of(ev).toFixed(2) + '）');
      } else if (ev.px != null) extra.push(C.fieldZoneShort(C.zoneOfEvent(ev)));
      if (ev.body === 'head') extra.push('ヘディング');
      if (ev.note) extra.push(ev.note);
      TL.tip.innerHTML = `<b>${U.esc(st.teams[ev.team] ? st.teams[ev.team].name : '')}</b> ${U.esc(who)}<br>${U.esc(meta ? meta.label : ev.type)} <span class="dim">${U.fmtTime(ev.t, true)} ${U.esc(D.clockFull(st, ev.t))}</span>${extra.length ? '<br><span class="dim">' + U.esc(extra.join(' ・ ')) + '</span>' : ''}`;
      const box = TL.tip.parentElement.getBoundingClientRect();
      TL.tip.hidden = false;
      const w = TL.tip.offsetWidth;
      let left = e.clientX - box.left + 12;
      if (left + w > box.width - 6) left = e.clientX - box.left - w - 12;
      TL.tip.style.left = Math.max(4, left) + 'px';
      TL.tip.style.top = Math.max(2, e.clientY - box.top - 58) + 'px';
    },
    _hideTip() {
      if (TL.tip) TL.tip.hidden = true;
    },

    draw() {
      const cv = TL.cv;
      if (!cv) return;
      const W = cv.clientWidth;
      const H = H_TOTAL;
      if (!W) return;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        cv.style.height = H + 'px';
      }
      const c = TL.ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const st = SL.store.state;
      const dur = TL._duration();
      const [vs, ve] = TL._view();
      const span = ve - vs;
      const X = (t) => PAD_L + ((t - vs) / span) * (W - PAD_L - PAD_R);
      const css = getComputedStyle(document.documentElement);
      const col = (n, d) => css.getPropertyValue(n).trim() || d;
      const cText = col('--muted', '#95a3c0');
      const cLine = col('--line', '#2a3653');
      const cAccent = col('--accent', '#2fd27f');

      // レーンの背景
      for (const t of ['H', 'A']) {
        c.fillStyle = 'rgba(255,255,255,0.03)';
        c.fillRect(PAD_L, Y_LANE[t], W - PAD_L - PAD_R, LANE_H);
        c.fillStyle = st.teams[t].color;
        c.globalAlpha = 0.85;
        c.fillRect(0, Y_LANE[t], 3, LANE_H);
        c.globalAlpha = 1;
        c.fillStyle = cText;
        c.font = '600 11px system-ui, sans-serif';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(t === 'H' ? '自' : '相', 8, Y_LANE[t] + LANE_H / 2);
      }

      // 目盛り
      const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
      const step = steps.find((s) => (s / span) * (W - PAD_L - PAD_R) >= 64) || 3600;
      c.strokeStyle = cLine;
      c.fillStyle = cText;
      c.font = '10px system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.lineWidth = 1;
      for (let t = Math.ceil(vs / step) * step; t <= ve + 1e-6; t += step) {
        const x = Math.round(X(t)) + 0.5;
        c.beginPath();
        c.moveTo(x, Y_RULER + 12);
        c.lineTo(x, H - 14);
        c.globalAlpha = 0.35;
        c.stroke();
        c.globalAlpha = 1;
        c.fillText(U.fmtTime(t), x + 3, Y_RULER + 1);
      }

      // 前半・後半の帯
      const ps = st.periods.slice().sort((a, b) => a.start - b.start);
      ps.forEach((p, i) => {
        const s0 = p.start;
        const e0 = i + 1 < ps.length ? ps[i + 1].start : dur;
        const x0 = X(Math.max(s0, vs));
        const x1 = X(Math.min(e0, ve));
        if (x1 <= x0) return;
        c.fillStyle = i % 2 ? 'rgba(90,130,255,0.10)' : 'rgba(255,255,255,0.05)';
        c.fillRect(x0, Y_PER, x1 - x0, 14);
        if (s0 >= vs - 1e-6) {
          c.fillStyle = '#c8d3ee';
          c.font = '700 10px system-ui, sans-serif';
          c.textBaseline = 'middle';
          c.fillText(D.qLabel(p.q), x0 + 4, Y_PER + 7.5);
          c.strokeStyle = 'rgba(200,215,255,0.5)';
          c.beginPath();
          c.moveTo(Math.round(x0) + 0.5, Y_PER);
          c.lineTo(Math.round(x0) + 0.5, Y_LANE.A + LANE_H);
          c.stroke();
        }
      });

      // ハイライト範囲（ハイライトタブを開いている間だけ表示）
      if (TL.clips.length && (SL.ui.tab === 'hl' || (SL.hl && SL.hl.st.playing))) {
        TL.clips.forEach((cl, i) => {
          if (cl.end < vs || cl.start > ve) return;
          const x0 = X(Math.max(cl.start, vs));
          const x1 = X(Math.min(cl.end, ve));
          c.fillStyle = i === TL.activeClip ? '#ffd166' : cl.ptsAgainst ? 'rgba(255,107,107,0.8)' : 'rgba(61,220,151,0.75)';
          c.fillRect(x0, Y_CLIP, Math.max(2, x1 - x0), 7);
        });
      }

      // タグのマーカー
      TL.hits = [];
      const many = span / (W - PAD_L - PAD_R) > 2.5; // 1px が 2.5 秒超なら小さめ
      for (const e of st.events) {
        if (e.t < vs - 1 || e.t > ve + 1) continue;
        const team = e.team === 'A' ? 'A' : 'H';
        const x = X(e.t);
        const y = Y_LANE[team] + LANE_H / 2;
        const meta = C.EVENTS[e.type] || {};
        const tc = st.teams[team].color;
        const r = many ? 3.2 : 4.6;
        c.lineWidth = 1.6;
        switch (e.type) {
          case 'goal':
          case 'pkg':
            c.fillStyle = tc;
            c.beginPath();
            c.arc(x, y, r + 2.6, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = '#fff';
            c.lineWidth = 1.8;
            c.stroke();
            if (!many) {
              c.fillStyle = '#fff';
              c.font = '800 8px system-ui, sans-serif';
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillText(e.type === 'pkg' ? 'P' : 'G', x, y + 0.5);
            }
            break;
          case 'og':
            c.fillStyle = '#ff9f43';
            c.beginPath();
            c.arc(x, y, r + 1.6, 0, Math.PI * 2);
            c.fill();
            break;
          case 'sot':
            c.strokeStyle = tc;
            c.lineWidth = 2.2;
            c.beginPath();
            c.arc(x, y, r + 0.4, 0, Math.PI * 2);
            c.stroke();
            c.fillStyle = tc;
            c.globalAlpha = 0.4;
            c.fill();
            c.globalAlpha = 1;
            break;
          case 'soff':
            c.strokeStyle = tc;
            c.lineWidth = 1.4;
            c.beginPath();
            c.arc(x, y, r - 1, 0, Math.PI * 2);
            c.stroke();
            break;
          case 'sblk':
            c.strokeStyle = tc;
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(x - 3.4, y - 3.4);
            c.lineTo(x + 3.4, y + 3.4);
            c.moveTo(x + 3.4, y - 3.4);
            c.lineTo(x - 3.4, y + 3.4);
            c.stroke();
            break;
          case 'pkx':
            c.strokeStyle = tc;
            c.lineWidth = 1.6;
            c.strokeRect(x - 3.4, y - 3.4, 6.8, 6.8);
            break;
          case 'ast':
          case 'kp':
            c.fillStyle = meta.color;
            c.beginPath();
            c.moveTo(x, y - 12);
            c.lineTo(x - 3.6, y - 5.6);
            c.lineTo(x + 3.6, y - 5.6);
            c.closePath();
            c.fill();
            break;
          case 'tkl':
          case 'itc':
            c.fillStyle = meta.color;
            c.beginPath();
            c.moveTo(x, y + 6);
            c.lineTo(x + 4, y + 11);
            c.lineTo(x, y + 16);
            c.lineTo(x - 4, y + 11);
            c.closePath();
            c.fill();
            break;
          case 'clr':
            c.fillStyle = meta.color;
            c.fillRect(x - 2, y + 6.5, 4, 4.5);
            break;
          case 'ck':
            c.fillStyle = meta.color;
            c.beginPath();
            c.moveTo(x - 1, y - 12);
            c.lineTo(x + 5, y - 9);
            c.lineTo(x - 1, y - 6);
            c.closePath();
            c.fill();
            c.fillRect(x - 2, y - 12, 1.4, 8);
            break;
          case 'tov':
            c.strokeStyle = meta.color;
            c.lineWidth = 2;
            c.beginPath();
            c.moveTo(x - 4, y - 4);
            c.lineTo(x + 4, y + 4);
            c.moveTo(x + 4, y - 4);
            c.lineTo(x - 4, y + 4);
            c.stroke();
            break;
          case 'foul':
            c.fillStyle = meta.color;
            c.fillRect(x - 1.6, y - 9, 3.2, 8);
            break;
          case 'off':
            c.fillStyle = meta.color;
            c.beginPath();
            c.moveTo(x - 3, y + 6);
            c.lineTo(x + 4, y + 9);
            c.lineTo(x - 3, y + 12);
            c.closePath();
            c.fill();
            break;
          case 'yc':
          case 'rc':
            c.fillStyle = meta.color;
            c.fillRect(x - 3, y - 6, 6, 9);
            c.strokeStyle = 'rgba(0,0,0,0.4)';
            c.lineWidth = 1;
            c.strokeRect(x - 3, y - 6, 6, 9);
            break;
          case 'note':
            c.fillStyle = '#fff';
            c.beginPath();
            c.arc(x, Y_LANE.H - 4, 3.4, 0, Math.PI * 2);
            c.fill();
            break;
        }
        if (e.id === TL.selectedId) {
          c.strokeStyle = '#fff';
          c.lineWidth = 2;
          c.beginPath();
          c.arc(x, y, 10, 0, Math.PI * 2);
          c.stroke();
        }
        TL.hits.push({ x, y: e.type === 'note' ? Y_LANE.H - 4 : y, ev: e });
      }

      // 再生位置
      const px = X(SL.player.time);
      if (px >= PAD_L - 1 && px <= W - PAD_R + 1) {
        c.strokeStyle = cAccent;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(px, 12);
        c.lineTo(px, H - 12);
        c.stroke();
        c.fillStyle = cAccent;
        c.beginPath();
        c.moveTo(px - 5, 6);
        c.lineTo(px + 5, 6);
        c.lineTo(px, 14);
        c.closePath();
        c.fill();
      }
    },
  });
})();
