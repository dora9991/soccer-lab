/* サッカー分析ラボ - サンプル映像の描画（ピッチ・選手・ボール・演出）
 * SL.sim.render(ctx, W, H, t, data) が 1 フレームを描く。実動画と同じ操作で扱えるよう、プレイヤーとハイライト書き出しから呼ばれる。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const SIM = (SL.sim = SL.sim || {});
  const PL = 105;
  const PW = 68;

  const VW = 1280;
  const VH = 720;
  SIM.VW = VW;
  SIM.VH = VH;
  const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", sans-serif';

  /* ---------- 補間（滑らかな動き：Catmull-Rom） ---------- */
  function evalKF(a, t) {
    const n = a.length;
    if (t <= a[0].t) return a[0];
    if (t >= a[n - 1].t) return a[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const p1 = a[lo];
    const p2 = a[hi];
    const dt = p2.t - p1.t;
    if (dt <= 1e-6) return p2;
    const p0 = lo > 0 ? a[lo - 1] : p1;
    const p3 = hi < n - 1 ? a[hi + 1] : p2;
    const u = (t - p1.t) / dt;
    // 端の速度（時間あたり）を近傍から求め、暴れないように上限をかける
    const vel = (pa, pb) => {
      const d = pb.t - pa.t;
      if (d <= 1e-6) return [0, 0];
      let vx = (pb.x - pa.x) / d;
      let vy = (pb.y - pa.y) / d;
      const sp = Math.hypot(vx, vy);
      if (sp > 9.5) {
        vx *= 9.5 / sp;
        vy *= 9.5 / sp;
      }
      return [vx, vy];
    };
    const m1 = vel(p0, p2);
    const m2 = vel(p1, p3);
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    return {
      x: h00 * p1.x + h10 * dt * m1[0] + h01 * p2.x + h11 * dt * m2[0],
      y: h00 * p1.y + h10 * dt * m1[1] + h01 * p2.y + h11 * dt * m2[1],
    };
  }
  SIM.posAt = (data, slot, t) => evalKF(data.kf[slot], t);

  SIM.slotNum = (data, slot, t) => {
    let L = data.lineups[0];
    for (const l of data.lineups) {
      if (l.t <= t) L = l;
      else break;
    }
    return L[slot < 11 ? 'H' : 'A'][slot < 11 ? slot : slot - 11];
  };
  const isGK = (slot) => slot === 0 || slot === 11;

  /** 今どちらが右へ攻めているか（前半: 自チームが右） */
  SIM.halfAt = (data, t) => {
    const p2 = data.periods.find((p) => p.q === 2);
    return p2 && t >= p2.start - 6 ? 2 : 1;
  };

  function ballAt(data, t) {
    const segs = data.ball;
    let lo = 0;
    let hi = segs.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].t0 <= t) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (idx < 0) return { x: PL / 2, y: PW / 2, h: 0, held: -1 };
    const s = segs[idx];
    if (s.kind === 'rest') return { x: s.x, y: s.y, h: 0, held: -1 };
    if (s.kind === 'hold') {
      const p = SIM.posAt(data, s.slot, t);
      const p2 = SIM.posAt(data, s.slot, t + 0.15);
      let dx = p2.x - p.x;
      let dy = p2.y - p.y;
      const sp = Math.hypot(dx, dy);
      const dir = (s.slot < 11) === (SIM.halfAt(data, t) === 1) ? 1 : -1;
      if (sp > 0.05) {
        dx /= sp;
        dy /= sp;
      } else {
        dx = dir;
        dy = 0;
      }
      // 受け取り／放す瞬間はボールを選手の足元へ寄せる（ぴょんと跳ばないように）
      const edge = Math.min(1, (t - s.t0) / 0.18, (s.t1 - t) / 0.18);
      const off = 0.75 * Math.max(0, edge);
      const bob = Math.abs(Math.sin(t * 9)) * 0.25 * Math.min(1, sp / 3);
      return { x: p.x + dx * off, y: p.y + dy * off, h: bob, held: s.slot };
    }
    const k = Math.min(1, Math.max(0, (t - s.t0) / Math.max(0.01, s.t1 - s.t0)));
    return { x: s.x0 + (s.x1 - s.x0) * k, y: s.y0 + (s.y1 - s.y0) * k, h: Math.sin(k * Math.PI) * (s.arc || 0) * 1.6, held: -1 };
  }
  SIM.ballAt = ballAt;

  /* ---------- ピッチ ---------- */
  let pitchCache = null;
  function drawPitch(W, H) {
    if (pitchCache && pitchCache.w === W && pitchCache.h === H) return pitchCache;
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const c = cv.getContext('2d');
    const sc = Math.min((W - 90) / PL, (H - 30) / PW);
    const ox = (W - PL * sc) / 2;
    const oy = (H - PW * sc) / 2;
    c.fillStyle = '#0c1a12';
    c.fillRect(0, 0, W, H);
    // 芝（縞）
    const stripes = 15;
    for (let i = 0; i < stripes; i++) {
      c.fillStyle = i % 2 ? '#2f8a4a' : '#2a8144';
      c.fillRect(ox + (PL / stripes) * i * sc, oy, (PL / stripes) * sc + 1, PW * sc);
    }
    const M = (x, y) => [ox + x * sc, oy + y * sc];
    c.strokeStyle = 'rgba(245,250,245,0.92)';
    c.lineWidth = Math.max(2, sc * 0.16);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const rect = (x0, y0, x1, y1) => {
      const [a, b] = M(x0, y0);
      c.strokeRect(a, b, (x1 - x0) * sc, (y1 - y0) * sc);
    };
    rect(0, 0, PL, PW);
    c.beginPath();
    c.moveTo(...M(PL / 2, 0));
    c.lineTo(...M(PL / 2, PW));
    c.stroke();
    c.beginPath();
    c.arc(...M(PL / 2, PW / 2), 9.15 * sc, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(245,250,245,0.92)';
    c.beginPath();
    c.arc(...M(PL / 2, PW / 2), sc * 0.28, 0, Math.PI * 2);
    c.fill();
    for (const side of [0, 1]) {
      const sgn = side === 0 ? 1 : -1;
      const gx = side === 0 ? 0 : PL;
      const X = (d) => gx + sgn * d;
      // ペナルティエリア／ゴールエリア
      const pa = [X(0), 34 - 20.16, X(16.5), 34 + 20.16];
      const ga = [X(0), 34 - 9.16, X(5.5), 34 + 9.16];
      const r = (q) => rect(Math.min(q[0], q[2]), q[1], Math.max(q[0], q[2]), q[3]);
      r(pa);
      r(ga);
      // ペナルティスポットとアーク
      c.fillStyle = 'rgba(245,250,245,0.92)';
      c.beginPath();
      c.arc(...M(X(11), 34), sc * 0.26, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      const a0 = Math.acos((16.5 - 11) / 9.15);
      const [spx, spy] = M(X(11), 34);
      if (side === 0) c.arc(spx, spy, 9.15 * sc, -a0, a0);
      else c.arc(spx, spy, 9.15 * sc, Math.PI - a0, Math.PI + a0);
      c.stroke();
      // ゴール
      c.save();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = Math.max(2, sc * 0.2);
      const gxA = side === 0 ? gx - 2.2 : gx;
      const [ga0, ga1] = M(gxA, 34 - 3.66);
      c.fillRect(ga0, ga1, 2.2 * sc, 7.32 * sc);
      c.strokeRect(ga0, ga1, 2.2 * sc, 7.32 * sc);
      c.restore();
    }
    // コーナーアーク
    for (const [cx, cy, a1, a2] of [
      [0, 0, 0, Math.PI / 2],
      [PL, 0, Math.PI / 2, Math.PI],
      [PL, PW, Math.PI, Math.PI * 1.5],
      [0, PW, Math.PI * 1.5, Math.PI * 2],
    ]) {
      c.beginPath();
      c.arc(...M(cx, cy), sc * 1.0, a1, a2);
      c.stroke();
    }
    pitchCache = { w: W, h: H, cv, sc, ox, oy };
    return pitchCache;
  }

  /** 1 フレームを描く（ctx は W×H のキャンバス） */
  SIM.render = (ctx, W, H, t, data) => {
    const pc = drawPitch(W, H);
    ctx.drawImage(pc.cv, 0, 0);
    const { sc, ox, oy } = pc;
    const px = (x) => ox + x * sc;
    const py = (y) => oy + y * sc;
    const teamColor = { H: data.roster.H.color, A: data.roster.A.color };
    const gkColor = { H: data.roster.H.gkColor, A: data.roster.A.gkColor };
    const ball = ballAt(data, t);

    // 選手（奥から手前の順に描く）
    const items = [];
    for (let s = 0; s < 22; s++) {
      const p = SIM.posAt(data, s, t);
      items.push({ s, x: p.x + Math.sin(t * 1.9 + s * 1.7) * 0.08, y: p.y + Math.cos(t * 1.4 + s * 2.3) * 0.08 });
    }
    items.sort((a, b) => a.y - b.y);
    const R = 1.75 * sc * 0.62 + 4;
    for (const it of items) {
      const team = it.s < 11 ? 'H' : 'A';
      const x = px(it.x);
      const y = py(it.y);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(x + R * 0.16, y + R * 0.3, R * 1.02, R * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isGK(it.s) ? gkColor[team] : teamColor[team];
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(2, R * 0.16);
      ctx.strokeStyle = ball.held === it.s ? '#ffe066' : 'rgba(255,255,255,0.92)';
      ctx.stroke();
      ctx.fillStyle = isGK(it.s) ? '#1b1b1b' : '#fff';
      ctx.font = `800 ${Math.round(R * 1.05)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(SIM.slotNum(data, it.s, t)), x, y + R * 0.06);
    }

    // ボール
    {
      const bx = px(ball.x);
      const by = py(ball.y);
      const br = 0.62 * sc * 0.62 + 3 + ball.h * 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(bx, by + br * 0.6, br * 0.95, br * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const by2 = by - ball.h * sc * 0.42;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx, by2, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1b1f2a';
      ctx.lineWidth = Math.max(1.4, br * 0.2);
      ctx.stroke();
      ctx.fillStyle = '#1b1f2a';
      ctx.beginPath();
      ctx.arc(bx, by2, br * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }

    // 演出（ゴール・セーブ・ファウルなど）
    const fxs = data.fx;
    let lo = 0;
    let hi = fxs.length - 1;
    let start = fxs.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fxs[mid].t >= t - 1.9) {
        start = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    for (let i = start; i < fxs.length && fxs[i].t <= t; i++) {
      const f = fxs[i];
      const age = t - f.t;
      const dur = f.kind === 'goal' ? 3.2 : 1.9;
      if (age > dur) continue;
      const a = Math.max(0, 1 - age / dur);
      const x = px(f.x);
      const y = py(f.y) - age * sc * 0.5;
      ctx.globalAlpha = Math.min(1, a * 1.7);
      if (f.kind === 'goal') {
        ctx.strokeStyle = '#3ddc97';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(px(f.x), py(f.y), (0.6 + age * 5) * sc * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (f.kind === 'yellow' || f.kind === 'red') {
        ctx.fillStyle = f.kind === 'yellow' ? '#ffd400' : '#ff3b3b';
        ctx.fillRect(x - 9, y - 40, 18, 26);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 9, y - 40, 18, 26);
      }
      const label = f.text;
      const big = f.kind === 'goal';
      ctx.font = `800 ${big ? 46 : 22}px ${FONT}`;
      const tw = ctx.measureText(label).width;
      const padX = big ? 22 : 12;
      const hgt = big ? 68 : 34;
      const fill =
        { goal: '#12b981', save: '#3b82f6', wide: '#64748b', block: '#f59e0b', whistle: '#d97706', yellow: '#b8860b', red: '#dc2626', win: '#22c55e', flag: '#a16207', pk: '#dc2626' }[f.kind] || '#475569';
      ctx.fillStyle = fill;
      const bx0 = x - tw / 2 - padX;
      const by0 = y - hgt / 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx0, by0, tw + padX * 2, hgt, hgt / 2);
      else ctx.rect(bx0, by0, tw + padX * 2, hgt);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 1);
      ctx.globalAlpha = 1;
    }

    // ハーフタイムの暗転
    for (const cut of data.cuts || []) {
      if (t < cut.t0 - 0.05 || t > cut.t1 + 0.05) continue;
      const fadeIn = Math.min(1, (t - cut.t0) / 0.5);
      const fadeOut = Math.min(1, (cut.t1 - t) / 0.5);
      const a = Math.max(0, Math.min(fadeIn, fadeOut));
      ctx.fillStyle = `rgba(6,10,20,${(0.96 * a).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 64px ${FONT}`;
      ctx.fillText(cut.label || 'ハーフタイム', W / 2, H / 2 - 20);
      ctx.font = `600 28px ${FONT}`;
      ctx.fillStyle = '#9fb0d8';
      ctx.fillText('ハーフタイム — 攻める向きが入れ替わります', W / 2, H / 2 + 44);
      ctx.globalAlpha = 1;
    }

    // 透かし
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `600 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('サンプル映像（シミュレーション）', 18, H - 12);
  };
})();
