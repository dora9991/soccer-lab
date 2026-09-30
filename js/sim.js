/* サッカー分析ラボ - サンプル試合シミュレーター（生成部）
 * 実映像が無くてもデモが動くよう、ピッチ上の動きを決定的（シード固定）に作り、
 * 「映像で起きたこと」と「タグ（正解データ）」を同時に生成する。
 * 座標は m。ピッチ 105×68。前半は 自チーム(H)が右へ、後半は左へ攻める。
 * 攻撃の向きをそろえた座標 (u, v)：u = 自陣ゴール→敵ゴール(0〜105)、v = 攻める向きに対して左→右(0〜68)。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const X = SL.xg;
  const SIM = (SL.sim = SL.sim || {});

  const PL = 105;
  const PW = 68;
  const CY = 34;
  SIM.PL = PL;
  SIM.PW = PW;
  SIM.DEFAULT_SEED = 335;
  SIM.HALF_SEC = 20 * 60;
  SIM.HALF_MIN = 20;

  const other = (t) => (t === 'H' ? 'A' : 'H');
  const r1 = (v) => Math.round(v * 10) / 10;

  /* ---------- 選手 ---------- */
  const P = (num, name, pos, o) => Object.assign({ num, name, pos, fin: 1, cross: 1, pass: 1, tov: 1, foul: 1, aer: 1, drib: 1, gk: 1, fk: 1 }, o);
  const ROSTER = {
    H: {
      name: 'ジーニーズ',
      color: '#3d7bff',
      gkColor: '#f4c430',
      players: [
        P(1, '高橋', 'GK', { gk: 0.95 }),
        P(3, '鈴木', 'DF', { cross: 1.0 }),
        P(5, '伊藤', 'DF', { foul: 2.1, aer: 1.15 }),
        P(4, '田中', 'DF', { aer: 1.25, foul: 0.8 }),
        P(2, '佐藤', 'DF', { cross: 0.9 }),
        P(11, '吉田', 'MF', { cross: 1.9, drib: 1.4, tov: 1.5, fin: 0.9 }),
        P(8, '中村', 'MF', { pass: 1.3, fk: 1.5 }),
        P(6, '渡辺', 'MF', { tov: 2.2, foul: 1.5, pass: 0.9 }),
        P(7, '山本', 'MF', { cross: 1.2, drib: 1.1 }),
        P(9, '小林', 'FW', { fin: 0.82, aer: 1.15, foul: 0.8 }),
        P(10, '加藤', 'FW', { pass: 1.9, fin: 1.05, drib: 1.2 }),
        P(12, '松下', 'GK', {}),
        P(14, '山田', 'MF', { tov: 0.9 }),
        P(15, '松本', 'FW', { fin: 1.1, drib: 1.2 }),
        P(16, '井上', 'DF', {}),
      ],
      lineup: [[1, 3, 5, 4, 2, 11, 8, 6, 7, 9, 10], [1, 3, 5, 4, 2, 11, 8, 14, 7, 15, 10]],
    },
    A: {
      name: 'ライジング',
      color: '#ff5a5a',
      gkColor: '#3ee0c5',
      players: [
        P(1, '清水', 'GK', { gk: 1.1 }),
        P(3, '林', 'DF', {}),
        P(5, '森', 'DF', { aer: 1.3, foul: 1.1 }),
        P(4, '斎藤', 'DF', { aer: 1.3 }),
        P(2, '木村', 'DF', { cross: 1.0 }),
        P(6, '阿部', 'MF', { foul: 1.3, tov: 0.8 }),
        P(8, '橋本', 'MF', { pass: 1.1, fk: 1.2 }),
        P(10, '前田', 'MF', { pass: 1.7, fin: 1.1 }),
        P(11, '藤田', 'FW', { drib: 1.5, cross: 1.4 }),
        P(9, '石川', 'FW', { fin: 1.25, aer: 1.3 }),
        P(7, '池田', 'FW', { drib: 1.3, fin: 1.05 }),
        P(12, '福田', 'GK', {}),
        P(14, '岡田', 'MF', {}),
        P(15, '後藤', 'FW', { fin: 1.1 }),
        P(16, '長谷川', 'DF', {}),
      ],
      lineup: [[1, 3, 5, 4, 2, 6, 8, 10, 11, 9, 7], [1, 3, 5, 4, 2, 14, 8, 10, 11, 9, 15]],
    },
  };
  SIM.ROSTER = ROSTER;

  // 隊形（攻撃の向きをそろえた u, v）。r=役割（G/D/M/F）、w=サイド
  const R = (u, v, r, w) => ({ u, v, r, w: !!w });
  const FORM = {
    H: [R(4, 34, 'G'), R(26, 8, 'D', 1), R(23, 25, 'D'), R(23, 43, 'D'), R(26, 60, 'D', 1), R(48, 8, 'M', 1), R(44, 26, 'M'), R(44, 42, 'M'), R(48, 60, 'M', 1), R(66, 27, 'F'), R(64, 41, 'F')],
    A: [R(4, 34, 'G'), R(26, 8, 'D', 1), R(23, 25, 'D'), R(23, 43, 'D'), R(26, 60, 'D', 1), R(40, 34, 'M'), R(52, 22, 'M'), R(52, 46, 'M'), R(66, 9, 'F', 1), R(73, 34, 'F'), R(66, 59, 'F', 1)],
  };
  SIM.FORM = FORM;

  // チームの特徴（自チームは組み立てとサイド攻撃が多いがミスとファウルも多い／相手はカウンターと個の力が強い）
  const STYLE = {
    H: { counter: 0.22, long: 0.14, loss: 1.15, foul: 1.25, wing: 1.35, through: 0.95, solo: 0.85, combo: 1.0, far: 1.35, shotMul: 1.25 },
    A: { counter: 0.42, long: 0.26, loss: 0.9, foul: 0.8, wing: 0.7, through: 1.15, solo: 1.0, combo: 0.8, far: 0.7, shotMul: 0.8 },
  };
  // 人がタグを付ける割合（全部は付けない。目立つプレーが中心）
  const TAGR = { tov: 0.2, tkl: 0.3, itc: 0.26, clr: 0.5, kp: 0.55 };

  /* ---------- 試合の生成 ---------- */
  SIM.build = function (seed, opts) {
    opts = opts || {};
    const rand = U.rng(seed == null ? SIM.DEFAULT_SEED : seed);
    const clamp = U.clamp;
    const range = (a, b) => a + (b - a) * rand();
    const chance = (p) => rand() < p;
    const halfSec = opts.halfSec || SIM.HALF_SEC;
    const shotK = opts.shotK == null ? 0.36 : opts.shotK; // 攻撃がシュートまで進む確率の全体倍率
    const setK = opts.setK == null ? 0.62 : opts.setK; // セットプレーが競り合いに勝つ確率の倍率
    const wpick = (items, wf) => {
      let tot = 0;
      const ws = items.map((it) => {
        const w = Math.max(0, wf(it));
        tot += w;
        return w;
      });
      if (tot <= 0) return items[Math.floor(rand() * items.length)];
      let r = rand() * tot;
      for (let i = 0; i < items.length; i++) {
        r -= ws[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    };

    const kf = Array.from({ length: 22 }, () => []);
    const ball = [];
    const fx = [];
    const events = [];
    const lineups = [];
    const periods = [];
    const cuts = [];
    const oncourt = { H: ROSTER.H.lineup[0].slice(), A: ROSTER.A.lineup[0].slice() };
    const PLAYERS = { H: {}, A: {} };
    ['H', 'A'].forEach((t) => ROSTER[t].players.forEach((p) => (PLAYERS[t][p.num] = p)));
    const carded = { H: new Set(), A: new Set() };
    const counts = { H: { shots: 0, goals: 0 }, A: { shots: 0, goals: 0 } };

    let T = 0;
    let half = 1;
    let holder = 0;
    let prevHolder = null;
    const B = { t: 0, x: PL / 2, y: CY, holder: null };

    /* --- スロット／向き --- */
    const slotOf = (team, i) => (team === 'H' ? 0 : 11) + i;
    const teamOfSlot = (s) => (s < 11 ? 'H' : 'A');
    const idxOfSlot = (s) => (s < 11 ? s : s - 11);
    const dirOf = (team) => (team === 'H' ? (half === 1 ? 1 : -1) : half === 1 ? -1 : 1);
    const toW = (team, u, v) => (dirOf(team) > 0 ? { x: u, y: v } : { x: PL - u, y: PW - v });
    const fromW = (team, x, y) => (dirOf(team) > 0 ? { u: x, v: y } : { u: PL - x, v: PW - y });
    const playerOf = (team, i) => PLAYERS[team][oncourt[team][i]];
    const playerOfSlot = (s) => playerOf(teamOfSlot(s), idxOfSlot(s));
    const roleOf = (s) => FORM[teamOfSlot(s)][idxOfSlot(s)].r;

    /* --- キーフレーム --- */
    const last = (s) => kf[s][kf[s].length - 1];
    const push = (s, t, x, y) => {
      const a = kf[s];
      const l = a[a.length - 1];
      if (l && t <= l.t + 0.02) t = l.t + 0.02;
      a.push({ t, x, y });
    };
    const nudge = (s, t, tx, ty, vmax, free) => {
      const l = last(s);
      const dt = Math.max(0.02, t - l.t);
      let dx = tx - l.x;
      let dy = ty - l.y;
      const d = Math.hypot(dx, dy);
      const md = vmax * dt;
      if (d > md) {
        dx *= md / d;
        dy *= md / d;
      }
      let x = l.x + dx;
      let y = l.y + dy;
      if (!free) {
        x = clamp(x, 0.8, PL - 0.8);
        y = clamp(y, 0.8, PW - 0.8);
      }
      push(s, t, x, y);
    };

    /* --- 隊形（ボールの位置に合わせて全体が動く） --- */
    function shapeTarget(s, ctx) {
      const team = teamOfSlot(s);
      const F = FORM[team][idxOfSlot(s)];
      const dir = dirOf(team);
      const bu = dir > 0 ? ctx.ball.x : PL - ctx.ball.x;
      const bv = dir > 0 ? ctx.ball.y : PW - ctx.ball.y;
      const has = ctx.poss === team;
      const neutral = ctx.poss == null;
      let u;
      let v;
      if (F.r === 'G') {
        u = has || neutral ? 4 + clamp((bu - 38) * 0.24, 0, 14) : 3.5 + clamp((bu - 8) * 0.05, 0, 2.6);
        v = CY + clamp((bv - CY) * (has ? 0.05 : 0.2), -7, 7);
      } else if (has || neutral) {
        const k = F.r === 'D' ? 0.55 : F.r === 'M' ? 0.62 : 0.38;
        u = F.u + (bu - 52) * k + (has ? (F.r === 'F' ? 8 : F.r === 'M' ? 3 : 0) : 0);
        const lo = F.r === 'D' ? 13 : F.r === 'M' ? 24 : 36;
        const hi = F.r === 'D' ? 62 : F.r === 'M' ? 84 : 98;
        u = clamp(u, lo, hi);
        v = F.v + (bv - F.v) * (has ? 0.28 : 0.2);
      } else {
        const k = F.r === 'D' ? 0.42 : F.r === 'M' ? 0.46 : 0.3;
        u = F.u + (bu - 52) * k - (F.r === 'F' ? 10 : F.r === 'M' ? 2 : 0);
        const lo = F.r === 'D' ? 12 : F.r === 'M' ? 22 : 34;
        const hi = F.r === 'D' ? 70 : F.r === 'M' ? 86 : 98;
        u = clamp(u, lo, hi);
        v = F.v + (bv - F.v) * 0.38;
      }
      if (ctx.kick && F.r !== 'G') u = Math.min(u, 48.5);
      return toW(team, u, clamp(v, 3, PW - 3));
    }

    /** t 秒までに全員を動かす。ctx: {ball, poss, force:{slot:{x,y,v,free}}, spd:{H,A}, kick, nPress, press} */
    function advance(t, ctx) {
      const force = ctx.force || {};
      const spd = ctx.spd || {};
      const tg = new Array(22);
      const pressers = new Set();
      if (ctx.poss && ctx.press !== false) {
        const def = other(ctx.poss);
        const cand = [];
        for (let i = 1; i < 11; i++) {
          const s = slotOf(def, i);
          if (force[s]) continue;
          const l = last(s);
          const d = Math.hypot(l.x - ctx.ball.x, l.y - ctx.ball.y);
          if (d < 28) cand.push({ s, d });
        }
        cand.sort((a, b) => a.d - b.d);
        cand.slice(0, ctx.nPress == null ? 2 : ctx.nPress).forEach((c) => pressers.add(c.s));
      }
      for (let s = 0; s < 22; s++) {
        if (force[s]) {
          tg[s] = force[s];
          continue;
        }
        if (pressers.has(s)) {
          const dir = dirOf(teamOfSlot(s));
          const l = last(s);
          tg[s] = { x: ctx.ball.x - dir * 2.4, y: ctx.ball.y + (l.y >= ctx.ball.y ? 1 : -1) * 0.9, v: 7.4 };
          continue;
        }
        tg[s] = shapeTarget(s, ctx);
      }
      // 重なりすぎないように少し離す
      for (let a = 0; a < 22; a++) {
        if (force[a]) continue;
        for (let b = a + 1; b < 22; b++) {
          if (force[b]) continue;
          const dx = tg[b].x - tg[a].x;
          const dy = tg[b].y - tg[a].y;
          const d = Math.hypot(dx, dy);
          if (d < 2.6) {
            const push2 = (2.6 - d) / 2 + 0.05;
            const ux = d > 0.01 ? dx / d : 1;
            const uy = d > 0.01 ? dy / d : 0;
            tg[a] = Object.assign({}, tg[a], { x: tg[a].x - ux * push2, y: tg[a].y - uy * push2 });
            tg[b] = Object.assign({}, tg[b], { x: tg[b].x + ux * push2, y: tg[b].y + uy * push2 });
          }
        }
      }
      for (let s = 0; s < 22; s++) {
        const f = tg[s];
        const team = teamOfSlot(s);
        const v = f.v || (idxOfSlot(s) === 0 ? 5 : spd[team] || 6.4);
        nudge(s, t, f.x, f.y, v, f.free);
      }
    }

    /* --- ボール --- */
    function bHold(t1, s) {
      if (t1 > B.t + 1e-3) ball.push({ kind: 'hold', t0: B.t, t1, slot: s });
      B.t = Math.max(B.t, t1);
      B.holder = s;
      const p = last(s);
      B.x = p.x;
      B.y = p.y;
    }
    function bFly(t1, x1, y1, arc) {
      ball.push({ kind: 'fly', t0: B.t, t1, x0: B.x, y0: B.y, x1, y1, arc: arc || 0 });
      B.t = t1;
      B.x = x1;
      B.y = y1;
      B.holder = null;
    }
    function bRest(t1) {
      if (t1 > B.t + 1e-3) ball.push({ kind: 'rest', t0: B.t, t1, x: B.x, y: B.y });
      B.t = Math.max(B.t, t1);
      B.holder = null;
    }

    /** コーナーへ出ていくボール */
    function ballOutForCorner(team, cv) {
      const cw = toW(team, PL - 0.3, cv);
      const t1 = T + clamp(Math.hypot(cw.x - B.x, cw.y - B.y) / 19, 0.9, 2.4);
      bFly(t1, cw.x, cw.y, 0.5);
      advance(t1, ctxFor(null, cw, { press: false }));
      T = t1;
      bRest(T + 0.4);
    }

    /** ボールを（拾いに行って）指定の場所へ置く。時間もその分進める */
    function placeBall(x, y) {
      const d = Math.hypot(B.x - x, B.y - y);
      if (d <= 1.2) {
        B.x = x;
        B.y = y;
        return;
      }
      const dur = clamp(d / 22, 0.5, 1.8);
      bFly(T + dur, x, y, 0.25);
      advance(T + dur, ctxFor(null, { x, y }, { press: false, spd: { H: 6, A: 6 } }));
      T += dur;
    }

    function ctxFor(team, ballPos, extra) {
      return Object.assign({ ball: ballPos, poss: team, force: {}, spd: {} }, extra || {});
    }
    const posOf = (s) => {
      const l = last(s);
      return { x: l.x, y: l.y };
    };

    /* --- タグ／演出 --- */
    const emit = (t, type, team, slot, extra) => {
      const p = slot == null ? null : playerOfSlot(slot);
      const e = Object.assign({ t, type, team, num: p ? p.num : null }, extra || {});
      events.push(e);
      return e;
    };
    const locOf = (team, x, y) => {
      const f = fromW(team, x, y);
      return { px: r1(clamp(f.u, 0, PL)), py: r1(clamp(f.v, 0, PW)) };
    };
    const addFx = (t, kind, x, y, text, team) => fx.push({ t, kind, x, y, text, team });

    /* --- 基本のプレー --- */
    function settle(team, dur) {
      const t1 = T + dur;
      const p = posOf(holder);
      advance(t1, ctxFor(team, p, { force: { [holder]: { x: p.x, y: p.y, v: 2.5 } } }));
      bHold(t1, holder);
      T = t1;
    }
    function passSpeedTime(dist, speed, arc) {
      if (arc) return clamp(dist / (arc > 1.4 ? 16 : 18), 1.1, 3.2);
      return Math.max(0.35, dist / speed);
    }
    /** recv へ dest めがけてパス。届くように dest を調整する */
    function passTo(team, recv, dest, speed, arc, extraForce) {
      const from = holder;
      const p0 = posOf(from);
      const l = last(recv);
      let fl = passSpeedTime(Math.hypot(dest.x - p0.x, dest.y - p0.y), speed, arc);
      const reach = 8.4 * fl * 0.9;
      const dx = dest.x - l.x;
      const dy = dest.y - l.y;
      const dd = Math.hypot(dx, dy);
      let d2 = dest;
      if (dd > reach) {
        d2 = { x: l.x + (dx * reach) / dd, y: l.y + (dy * reach) / dd };
        fl = passSpeedTime(Math.hypot(d2.x - p0.x, d2.y - p0.y), speed, arc);
      }
      d2 = { x: clamp(d2.x, 1, PL - 1), y: clamp(d2.y, 1, PW - 1) };
      const t1 = T + fl;
      bFly(t1, d2.x, d2.y, arc || 0);
      const force = Object.assign({ [recv]: { x: d2.x, y: d2.y, v: 8.6 } }, extraForce || {});
      advance(t1, ctxFor(team, d2, { force }));
      prevHolder = from;
      holder = recv;
      T = t1;
      return d2;
    }
    function carryTo(team, dest, speed, extraForce) {
      const p0 = posOf(holder);
      const d = Math.hypot(dest.x - p0.x, dest.y - p0.y);
      const t1 = T + Math.max(0.5, d / speed);
      const force = Object.assign({ [holder]: { x: dest.x, y: dest.y, v: speed + 0.6 } }, extraForce || {});
      advance(t1, ctxFor(team, dest, { force }));
      bHold(t1, holder);
      T = t1;
    }
    function pickRecv(team, target, excl, roles, gkOk) {
      let best = null;
      let bd = 1e9;
      for (let i = gkOk ? 0 : 1; i < 11; i++) {
        const s = slotOf(team, i);
        if (s === holder || (excl && excl.includes(s))) continue;
        if (roles && !roles.includes(FORM[team][i].r)) continue;
        const l = last(s);
        const d = Math.hypot(l.x - target.x, l.y - target.y) + rand() * 3.5;
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    }
    const attackPoint = (team, u, v) => toW(team, u, v);

    /** 相手に最も近い（ボールの進行方向にいる）守備の選手 */
    function nearestDef(team, at, exceptGk) {
      const def = other(team);
      let w = null;
      let bd = 1e9;
      for (let i = exceptGk ? 1 : 0; i < 11; i++) {
        const s = slotOf(def, i);
        const l = last(s);
        const d = Math.hypot(l.x - at.x, l.y - at.y) + rand() * 1.5;
        if (d < bd) {
          bd = d;
          w = s;
        }
      }
      return w;
    }

    /* --- ボールを奪われる --- */
    function loseBall(team, how) {
      const def = other(team);
      const dir = dirOf(team);
      const from = holder;
      const p0 = posOf(from);
      const fu = fromW(team, p0.x, p0.y).u;
      const aim = { x: p0.x + dir * (how === 'dribble' ? 1.6 : range(5, 13)), y: clamp(p0.y + range(-6, 6), 2, PW - 2) };
      const w = nearestDef(team, aim, true);
      let tLoss;
      if (how === 'dribble') {
        const t1 = T + 0.75;
        advance(t1, ctxFor(team, p0, { force: { [from]: { x: p0.x, y: p0.y, v: 2 }, [w]: { x: p0.x + dir * 0.9, y: p0.y + 0.3, v: 8.6 } } }));
        bHold(t1, from);
        T = t1;
        tLoss = T;
        const t2 = T + 0.45;
        advance(t2, ctxFor(def, posOf(w), { force: { [w]: { x: p0.x + dir * 0.9 - dir * 0.3, y: p0.y + 0.3, v: 3 } } }));
        bHold(t2, w);
        T = t2;
      } else {
        const wl = posOf(w);
        const tgt = { x: clamp(wl.x + (aim.x - wl.x) * 0.5, 1, PL - 1), y: clamp(wl.y + (aim.y - wl.y) * 0.5, 1, PW - 1) };
        const fl = passSpeedTime(Math.hypot(tgt.x - p0.x, tgt.y - p0.y), how === 'long' ? 20 : 14, how === 'long' ? 1.6 : 0);
        const t1 = T + fl;
        bFly(t1, tgt.x, tgt.y, how === 'long' ? 1.6 : 0);
        advance(t1, ctxFor(team, tgt, { force: { [w]: { x: tgt.x, y: tgt.y, v: 8.8 } } }));
        T = t1;
        tLoss = T - 0.2;
        const t2 = T + 0.4;
        advance(t2, ctxFor(def, tgt, { force: { [w]: { x: tgt.x, y: tgt.y, v: 2 } } }));
        bHold(t2, w);
        T = t2;
      }
      const loc = locOf(team, p0.x, p0.y);
      const tagRate = fu < 35 ? 0.4 : fu < 70 ? TAGR.tov : 0.15;
      if (chance(tagRate)) emit(tLoss, 'tov', team, from, Object.assign({ sub: how }, loc));
      const wp = posOf(w);
      if (chance(how === 'dribble' ? TAGR.tkl : TAGR.itc)) {
        const wtype = how === 'dribble' ? 'tkl' : 'itc';
        emit(T - 0.1, wtype, def, w, locOf(def, wp.x, wp.y));
        if (chance(0.45)) addFx(T - 0.1, 'win', wp.x, wp.y - 1.5, wtype === 'tkl' ? 'タックル' : 'カット', def);
      }
      const nf = fromW(def, wp.x, wp.y);
      holder = w;
      prevHolder = null;
      return { next: { team: def, kind: 'regain', u: nf.u, v: nf.v, holder: w, t: T } };
    }

    /* --- ファウル --- */
    function pInBox(defTeam, x, y) {
      const f = fromW(defTeam, x, y);
      return f.u <= 16.5 && Math.abs(f.v - CY) <= 20.16;
    }
    function foulOn(team) {
      const def = other(team);
      const victim = holder;
      const p = posOf(victim);
      const cands = [];
      for (let i = 1; i < 11; i++) {
        const s = slotOf(def, i);
        const l = last(s);
        cands.push({ s, d: Math.hypot(l.x - p.x, l.y - p.y) });
      }
      cands.sort((a, b) => a.d - b.d);
      const fs = wpick(cands.slice(0, 3), (c) => playerOfSlot(c.s).foul / (c.d + 2)).s;
      const dir = dirOf(team);
      const t1 = T + 0.65;
      advance(t1, ctxFor(team, p, { force: { [victim]: { x: p.x, y: p.y, v: 2 }, [fs]: { x: p.x + dir * 0.9, y: p.y - 0.4, v: 8.6 } } }));
      bHold(t1, victim);
      T = t1;
      const fp = playerOfSlot(fs);
      const vp = playerOfSlot(victim);
      const sub = wpick(['contact', 'hold', 'trip', 'danger', 'other'], (k) => ({ contact: 4, hold: 2.4, trip: 2.6, danger: 0.5, other: 0.6 }[k]));
      const inBox = pInBox(def, p.x, p.y);
      const ev = emit(T + 0.35, 'foul', def, fs, Object.assign({ sub: inBox && chance(0.2) ? 'hand' : sub, vs: vp.num }, locOf(def, p.x, p.y)));
      addFx(T + 0.2, 'whistle', p.x, p.y - 1.6, 'ファウル', def);
      // カード
      const upfield = fromW(team, p.x, p.y).u;
      const pCard = (inBox ? 0.3 : 0.13) + (upfield > 70 ? 0.04 : 0) + (fp.foul > 1.6 ? 0.08 : 0);
      if (!carded[def].has(fp.num) && chance(pCard)) {
        carded[def].add(fp.num);
        emit(T + 1.2, 'yc', def, fs, {});
        addFx(T + 1.0, 'yellow', p.x, p.y - 1.8, 'イエロー', def);
      }
      // 笛のあとは、その場で止まる
      const tStop = T + 3.4;
      bRest(T + 0.3);
      advance(tStop, ctxFor(null, p, { force: { [victim]: { x: p.x, y: p.y, v: 2 } }, press: false, spd: { H: 5, A: 5 } }));
      B.x = p.x;
      B.y = p.y;
      bRest(tStop);
      T = tStop;
      const f = fromW(team, p.x, p.y);
      return { foul: true, ev, inBox, spot: { team, u: f.u, v: f.v }, fouler: fs };
    }

    /* --- ゴール前の共通：シュートの決着 --- */
    function shotLoc(team, s) {
      const p = posOf(s);
      const f = fromW(team, p.x, p.y);
      return { u: f.u, v: f.v, sx: f.v - CY, sy: PL - f.u };
    }
    function goalTarget(team, spread) {
      const dir = dirOf(team);
      return { x: dir > 0 ? PL : 0, y: CY + range(-spread, spread) };
    }
    const goalX = (team) => (dirOf(team) > 0 ? PL : 0);

    /**
     * 打つ。holder=shooter が既にボールを持っている前提。
     * info: {scene, body, passer(slot|null), gkFactor}
     * 戻り値: {kind:'goal'|'saved'|'wide'|'blocked', next, ...}
     */
    function takeShot(team, shooter, info) {
      const def = other(team);
      const sp = shotLoc(team, shooter);
      const pl = playerOfSlot(shooter);
      const evLoc = { px: r1(sp.u), py: r1(sp.v) };
      const probe = { px: sp.u, py: sp.v, body: info.body, scene: info.scene };
      const xg = X.detail(probe).xg;
      const gkS = slotOf(def, 0);
      const gkp = playerOfSlot(gkS);
      let pGoal = clamp(xg * pl.fin * (1 / gkp.gk) * (info.boost || 1), 0.005, 0.92);
      if (info.pk) pGoal = 0.76;
      const wSaved = 0.22 + 0.9 * xg;
      const wBlk = info.pk ? 0 : Math.max(0.05, 0.34 - 0.5 * xg) * (info.body === 'head' ? 0.5 : 1);
      const wOff = Math.max(0.1, 0.44 - 0.3 * xg) * (info.pk ? 0.5 : 1);
      let kind;
      if (chance(pGoal)) kind = 'goal';
      else kind = wpick(['saved', 'blocked', 'wide'], (k) => ({ saved: wSaved, blocked: wBlk, wide: wOff }[k]));

      const p0 = posOf(shooter);
      const gx = goalX(team);
      const dir = dirOf(team);
      const tRel = T + 0.15;
      // 打つ直前の一瞬（助走）
      advance(tRel, ctxFor(team, p0, { force: { [shooter]: { x: p0.x, y: p0.y, v: 2 } } }));
      bHold(tRel, shooter);
      T = tRel;
      counts[team].shots++;
      let tRes;
      let evType;
      const extra = Object.assign({ scene: info.scene }, evLoc);
      if (info.body === 'head') extra.body = 'head';
      let ret;
      if (kind === 'goal') {
        const tgt = goalTarget(team, 3.1);
        const fl = clamp(Math.hypot(tgt.x - p0.x, tgt.y - p0.y) / 23, 0.3, 1.2);
        tRes = T + fl;
        bFly(tRes, tgt.x, tgt.y, info.body === 'head' ? 0.4 : 0.5);
        const gkTo = { x: gx - dir * 1.5, y: clamp(tgt.y + (tgt.y > CY ? -3.4 : 3.4) * range(0.6, 1.3), CY - 4.5, CY + 4.5), v: 6.5 };
        advance(tRes, ctxFor(team, tgt, { force: { [gkS]: gkTo, [shooter]: { x: p0.x + dir * 1.6, y: p0.y, v: 6 } } }));
        T = tRes;
        evType = info.pk ? 'pkg' : 'goal';
        counts[team].goals++;
        addFx(tRes, 'goal', gx, tgt.y, 'ゴール!', team);
        ret = { kind: 'goal', tgt };
      } else if (kind === 'saved') {
        const tgt = goalTarget(team, info.pk ? 3 : 2.6);
        const fl = clamp(Math.hypot(tgt.x - p0.x, tgt.y - p0.y) / 21, 0.3, 1.2);
        tRes = T + fl;
        bFly(tRes, tgt.x - dir * 0.6, tgt.y, 0.4);
        const gkTo = { x: gx - dir * 1.6, y: clamp(tgt.y, CY - 4.6, CY + 4.6), v: 8 };
        advance(tRes, ctxFor(team, tgt, { force: { [gkS]: gkTo, [shooter]: { x: p0.x + dir * 1.2, y: p0.y, v: 5 } } }));
        T = tRes;
        evType = info.pk ? 'pkx' : 'sot';
        if (info.pk) extra.sub = 'saved';
        addFx(tRes, 'save', gx - dir * 2, tgt.y, 'セーブ!', def);
        ret = { kind: 'saved', tgt, gkS };
      } else if (kind === 'wide') {
        const side = chance(0.5) ? 1 : -1;
        const tgt = { x: gx + dir * range(1.5, 7), y: CY + side * range(4.3, 10.5) };
        const fl = clamp(Math.hypot(tgt.x - p0.x, tgt.y - p0.y) / 22, 0.3, 1.3);
        tRes = T + fl;
        const over = chance(0.4);
        bFly(tRes, tgt.x, tgt.y, over ? 2.6 : 0.4);
        advance(tRes, ctxFor(team, tgt, { force: { [gkS]: { x: gx - dir * 2, y: CY + side * 1.5, v: 4.5 }, [shooter]: { x: p0.x + dir * 1, y: p0.y, v: 5 } } }));
        T = tRes;
        evType = info.pk ? 'pkx' : 'soff';
        addFx(tRes, 'wide', clamp(gx - dir * 3, 3, PL - 3), CY + side * 6, over ? '枠の上' : '枠外', team);
        ret = { kind: 'wide', tgt };
      } else {
        // ブロック：近くの守備の選手に当たる
        const bl = nearestDef(team, { x: p0.x + dir * 3.5, y: p0.y + range(-1, 1) }, true);
        const bp = { x: clamp(p0.x + dir * range(2.4, 5), 1, PL - 1), y: clamp(p0.y + range(-1.6, 1.6), 1, PW - 1) };
        tRes = T + 0.28;
        bFly(tRes, bp.x, bp.y, 0.3);
        advance(tRes, ctxFor(team, bp, { force: { [bl]: { x: bp.x, y: bp.y, v: 8.8 }, [shooter]: { x: p0.x + dir * 0.5, y: p0.y, v: 4 } } }));
        T = tRes;
        evType = 'sblk';
        addFx(tRes, 'block', bp.x, bp.y - 1.6, 'ブロック!', def);
        ret = { kind: 'blocked', bp, blocker: bl };
      }
      const tagT = tRes + 0.45;
      const shotEv = emit(tagT, evType, team, shooter, extra);
      // アシスト／キーパス
      if (info.passer != null && info.passer !== shooter) {
        if (kind === 'goal' && !info.pk) {
          emit(tagT + 0.1, 'ast', team, info.passer, { forRef: shotEv });
        } else if (kind !== 'goal' && chance(TAGR.kp)) {
          emit(tagT + 0.1, 'kp', team, info.passer, { forRef: shotEv });
        }
      }
      ret.ev = shotEv;
      ret.xg = xg;
      return ret;
    }

    /** ゴールのあと：喜び → 中央に戻って再開 */
    function afterGoal(team, scorer, tgt) {
      const def = other(team);
      const gx = goalX(team);
      const dir = dirOf(team);
      const t0 = T;
      bFly(t0 + 0.5, gx + dir * 1.1, tgt.y, 0.1);
      T = t0 + 0.5;
      bRest(t0 + 1.4);
      // 喜ぶ：得点者がコーナー方向へ走り、味方が集まる
      const cornerV = chance(0.5) ? 5 : PW - 5;
      const run = { x: gx - dir * range(10, 16), y: cornerV };
      const force = { [scorer]: { x: run.x, y: run.y, v: 7.5 } };
      const mates = [];
      for (let i = 1; i < 11; i++) {
        const s = slotOf(team, i);
        if (s !== scorer) mates.push(s);
      }
      mates
        .map((s) => ({ s, d: Math.hypot(last(s).x - run.x, last(s).y - run.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5)
        .forEach((m, k) => {
          const a = (k / 5) * Math.PI * 2 + 0.6;
          force[m.s] = { x: run.x + Math.cos(a) * 2.6, y: run.y + Math.sin(a) * 2.6, v: 7.2 };
        });
      advance(T + 2.2, ctxFor(null, { x: gx, y: CY }, { force, press: false, spd: { H: 4.5, A: 4.5 } }));
      T += 2.2;
      bRest(T);
      advance(T + 1.6, ctxFor(null, { x: gx, y: CY }, { force, press: false, spd: { H: 5, A: 5 } }));
      T += 1.6;
      bRest(T);
      return kickoffReset(def);
    }

    /** センターサークルに全員が戻る。次のキックオフの準備 */
    function kickoffReset(kickTeam) {
      const dir = dirOf(kickTeam);
      const c = { x: PL / 2, y: CY };
      const force = {
        [slotOf(kickTeam, 9)]: { x: c.x - dir * 0.5, y: CY, v: 6 },
        [slotOf(kickTeam, 10)]: { x: c.x - dir * 2.2, y: CY + 3, v: 6 },
      };
      placeBall(c.x, c.y);
      for (let k = 0; k < 3; k++) {
        advance(T + 2.5, ctxFor(null, c, { force, kick: true, press: false, spd: { H: 7.4, A: 7.4 } }));
        T += 2.5;
        bRest(T);
      }
      return { next: { team: kickTeam, kind: 'kickoff', u: 52.5, v: CY, t: T } };
    }

    /* --- 次の攻撃の準備（再開の形） --- */
    function prepareStart(team, st) {
      const def = other(team);
      switch (st.kind) {
        case 'kickoff': {
          const s9 = slotOf(team, 9);
          const c = { x: PL / 2, y: CY };
          holder = s9;
          const dir = dirOf(team);
          const t1 = T + 0.9;
          advance(t1, ctxFor(team, c, { force: { [s9]: { x: c.x - dir * 0.5, y: CY, v: 3 } }, kick: true, spd: { H: 5.5, A: 5.5 } }));
          bHold(t1, s9);
          T = t1;
          break;
        }
        case 'gk': {
          const g = slotOf(team, 0);
          const at = toW(team, st.u == null ? 5.5 : st.u, st.v == null ? CY : st.v);
          holder = g;
          placeBall(at.x, at.y);
          const t1 = T + range(1.6, 3.0);
          advance(t1, ctxFor(team, at, { force: { [g]: { x: at.x, y: at.y, v: 6 } }, spd: { H: 6.6, A: 6.6 } }));
          bHold(t1, g);
          T = t1;
          break;
        }
        case 'regain': {
          // 奪った選手がボールを持っている
          const p = posOf(holder);
          const t1 = T + 0.35;
          advance(t1, ctxFor(team, p, { force: { [holder]: { x: p.x, y: p.y, v: 3 } } }));
          bHold(t1, holder);
          T = t1;
          break;
        }
        case 'fk': {
          const at = toW(team, st.u, st.v);
          const s = pickRecv(team, at, null, ['D', 'M'], false);
          holder = s;
          placeBall(at.x, at.y);
          const t1 = T + range(1.2, 2.4);
          advance(t1, ctxFor(team, at, { force: { [s]: { x: at.x, y: at.y, v: 7.5 } }, spd: { H: 6.6, A: 6.6 } }));
          bHold(t1, s);
          T = t1;
          break;
        }
        case 'throw': {
          const edgeV = st.v < CY ? 0.2 : PW - 0.2;
          const at = toW(team, st.u, edgeV);
          const s = pickRecv(team, at, null, ['D', 'M'], false);
          holder = s;
          placeBall(at.x, at.y);
          const t1 = T + range(1.6, 2.8);
          advance(t1, ctxFor(team, at, { force: { [s]: { x: at.x, y: at.y, v: 7.2, free: true } }, spd: { H: 6.6, A: 6.6 } }));
          bHold(t1, s);
          T = t1;
          break;
        }
        default:
          break;
      }
      prevHolder = null;
    }

    /* --- 組み立て --- */
    function buildUp(team, st, n) {
      const style = STYLE[team];
      let uCur = fromW(team, posOf(holder).x, posOf(holder).y).u;
      const uEnd = range(58, 72);
      for (let k = 1; k <= n; k++) {
        const target = uCur + (uEnd - uCur) * (k / n) + range(-3, 5);
        const cur = fromW(team, posOf(holder).x, posOf(holder).y);
        const swing = chance(0.32);
        let vT = swing ? (cur.v < CY ? range(38, 60) : range(8, 30)) : clamp(cur.v + range(-14, 14), 7, 61);
        const recvTarget = toW(team, clamp(target, 8, 78), vT);
        const roles = target < 22 ? ['D', 'M'] : target < 58 ? ['D', 'M', 'F'] : ['M', 'F', 'D'];
        const recv = pickRecv(team, recvTarget, prevHolder != null ? [prevHolder] : [], roles, uCur < 12 && k === 1);
        if (recv == null) break;
        const rp = playerOfSlot(holder);
        const uNow = clamp(target, 8, 78);
        const pLoss = 0.04 * style.loss * playerOfSlot(holder).tov * (uNow > 55 ? 1.5 : 1) * (k === n ? 1.15 : 1);
        if (chance(pLoss)) {
          return loseBall(team, chance(0.85) ? 'pass' : 'control');
        }
        passTo(team, recv, recvTarget, 13.5);
        settle(team, range(0.4, 0.95));
        uCur = fromW(team, posOf(holder).x, posOf(holder).y).u;
        // 途中のファウル
        if (uNow > 35 && chance(0.02 * STYLE[other(team)].foul)) return foulOn(team);
      }
      return null;
    }

    /* --- 奪ってすぐの攻撃 --- */
    function quickBreak(team, st) {
      const uNow = fromW(team, posOf(holder).x, posOf(holder).y).u;
      const steps = uNow > 62 ? 1 : uNow > 40 ? 2 : 3;
      for (let k = 0; k < steps; k++) {
        const cur = fromW(team, posOf(holder).x, posOf(holder).y);
        const tu = clamp(cur.u + range(16, 26), 40, 80);
        const tv = clamp(cur.v + range(-16, 16), 8, 60);
        if (chance(0.17 * STYLE[team].loss)) return loseBall(team, chance(0.5) ? 'dribble' : 'pass');
        const recv = pickRecv(team, toW(team, tu, tv), prevHolder != null ? [prevHolder] : [], ['M', 'F']);
        if (recv == null) break;
        passTo(team, recv, toW(team, tu, tv), 17);
        // 走りながら受けて、そのまま運ぶ
        carryTo(team, toW(team, clamp(tu + range(3, 8), 40, 84), clamp(tv + range(-6, 6), 8, 60)), 7.6);
        if (chance(0.03 * STYLE[other(team)].foul)) return foulOn(team);
      }
      return null;
    }

    /* --- ロングボール --- */
    function directBall(team, st) {
      const fTarget = toW(team, range(70, 84), clamp(CY + range(-16, 16), 10, 58));
      const recv = pickRecv(team, fTarget, [holder], ['F', 'M']);
      settle(team, 0.5);
      passTo(team, recv, fTarget, 20, 1.7);
      if (chance(0.11)) {
        const sp = posOf(recv);
        emit(T + 0.4, 'off', team, recv, locOf(team, sp.x, sp.y));
        addFx(T + 0.3, 'whistle', sp.x, sp.y - 1.8, 'オフサイド', team);
        return offsideRestart(team, recv);
      }
      if (chance(0.42)) {
        // 競り負けて奪われる
        return loseBall(team, 'long');
      }
      if (chance(0.03)) return foulOn(team);
      settle(team, range(0.5, 0.9));
      return null;
    }

    /* --- 崩し方（仕上げ） --- */
    function pickFinisher(team, target, excl, roles) {
      let best = null;
      let bw = -1;
      for (let i = 1; i < 11; i++) {
        const s = slotOf(team, i);
        if (excl && excl.includes(s)) continue;
        const F = FORM[team][i];
        if (roles && !roles.includes(F.r)) continue;
        const l = last(s);
        const d = Math.hypot(l.x - target.x, l.y - target.y);
        const w = (F.r === 'F' ? 3 : F.r === 'M' ? 1.1 : 0.2) * playerOfSlot(s).fin * Math.exp(-d / 26) * (0.6 + rand() * 0.8);
        if (w > bw) {
          bw = w;
          best = s;
        }
      }
      return best;
    }

    function finish(team, kindF, phase, st, depth) {
      const dir = dirOf(team);
      const sceneFast = phase === 'quick' ? (st.kind === 'regain' && st.u >= 66 ? 'press' : 'counter') : phase === 'direct' ? 'long' : null;
      let scene;
      switch (kindF) {
        case 'wing': {
          scene = sceneFast || 'cross';
          const cur = fromW(team, posOf(holder).x, posOf(holder).y);
          const flank = cur.v < CY ? 0 : PW;
          const sgn = flank === 0 ? 1 : -1;
          const wTarget = toW(team, range(70, 80), flank + sgn * range(6, 10));
          const wing = pickRecv(team, wTarget, prevHolder != null ? [prevHolder] : [], ['M', 'F', 'D']);
          if (chance(0.05 * STYLE[team].loss)) return loseBall(team, 'pass');
          passTo(team, wing, wTarget, 15);
          settle(team, range(0.4, 0.8));
          if (chance(0.09 * STYLE[team].loss * playerOfSlot(holder).tov)) return loseBall(team, 'dribble');
          if (chance(0.025 * STYLE[other(team)].foul)) return foulOn(team);
          const cross = toW(team, range(93, 98), flank + sgn * range(6, 12));
          carryTo(team, cross, 6.6);
          if (chance(0.07 * STYLE[team].loss)) return loseBall(team, 'dribble');
          settle(team, range(0.3, 0.6));
          const crosser = holder;
          const cutback = chance(0.3);
          if (cutback) {
            const eTarget = toW(team, range(89, 93), CY + range(-6, 6));
            const rcv = pickFinisher(team, eTarget, [crosser], ['F', 'M']);
            passTo(team, rcv, eTarget, 13);
            return finishShot(team, rcv, { scene, body: 'foot', passer: crosser }, 0.3);
          }
          // 高いクロス
          if (chance(0.34)) {
            // 守備にはね返される
            const bl = nearestDef(team, toW(team, 95, CY), true);
            const bp = toW(team, range(90, 96), CY + range(-8, 8));
            const t1 = T + 1.5;
            bFly(t1, bp.x, bp.y, 1.7);
            advance(t1, ctxFor(team, bp, { force: { [bl]: { x: bp.x, y: bp.y, v: 8.6 } } }));
            T = t1;
            holder = null;
            prevHolder = null;
            if (chance(TAGR.clr)) emit(T + 0.3, 'clr', other(team), bl, locOf(other(team), bp.x, bp.y));
            if (chance(0.6)) {
              const cv = flank === 0 ? 0.4 : PW - 0.4;
              ballOutForCorner(team, cv);
              return { next: { team, kind: 'corner', u: PL, v: cv, t: T + 1.0 } };
            }
            return afterClear(team, bl, bp);
          }
          const bodyHead = chance(0.72);
          const hTarget = toW(team, range(94.5, 100.5), CY + range(-6.5, 6.5));
          const rcv = pickFinisher(team, hTarget, [crosser], ['F', 'M']);
          passTo(team, rcv, hTarget, 15, 1.7);
          return finishShot(team, rcv, { scene, body: bodyHead ? 'head' : 'foot', passer: crosser }, 0.15);
        }
        case 'through': {
          scene = sceneFast || 'through';
          const cur = fromW(team, posOf(holder).x, posOf(holder).y);
          if (cur.u < 58) {
            const aTarget = toW(team, range(64, 72), CY + range(-10, 10));
            const am = pickRecv(team, aTarget, prevHolder != null ? [prevHolder] : [], ['M', 'F']);
            if (chance(0.06 * STYLE[team].loss)) return loseBall(team, 'pass');
            passTo(team, am, aTarget, 15);
            settle(team, range(0.4, 0.8));
          }
          if (chance(0.09 * STYLE[team].loss)) return loseBall(team, chance(0.5) ? 'pass' : 'dribble');
          const passer = holder;
          const fTarget = toW(team, range(91, 96), CY + range(-8, 8));
          const striker = pickFinisher(team, fTarget, [passer], ['F']);
          const off = chance(0.14);
          const t1 = T + 0.35;
          advance(t1, ctxFor(team, posOf(holder), { force: { [holder]: { x: posOf(holder).x, y: posOf(holder).y, v: 2 } } }));
          bHold(t1, holder);
          T = t1;
          passTo(team, striker, off ? toW(team, range(92, 96), CY + range(-8, 8)) : fTarget, 17.5);
          if (off) {
            const sp = posOf(striker);
            emit(T + 0.4, 'off', team, striker, locOf(team, sp.x, sp.y));
            addFx(T + 0.3, 'whistle', sp.x, sp.y - 1.8, 'オフサイド', team);
            return offsideRestart(team, striker);
          }
          settle(team, range(0.25, 0.5));
          carryTo(team, toW(team, clamp(fromW(team, posOf(holder).x, posOf(holder).y).u + range(1, 3), 92, 97), clamp(fromW(team, posOf(holder).x, posOf(holder).y).v + range(-2, 2), 25, 43)), 6.8);
          return finishShot(team, striker, { scene, body: 'foot', passer, boost: 1.05 }, 0.1);
        }
        case 'solo': {
          scene = sceneFast || 'solo';
          const cur = fromW(team, posOf(holder).x, posOf(holder).y);
          let dr = holder;
          if (cur.u < 55 || chance(0.4)) {
            const mTarget = toW(team, range(60, 68), clamp(CY + range(-18, 18), 10, 58));
            dr = pickFinisher(team, mTarget, prevHolder != null ? [prevHolder] : [], ['M', 'F']);
            if (chance(0.05 * STYLE[team].loss)) return loseBall(team, 'pass');
            passTo(team, dr, mTarget, 14);
            settle(team, range(0.3, 0.7));
          }
          const cv = fromW(team, posOf(holder).x, posOf(holder).y).v;
          const sideSgn = cv < CY ? 1 : -1;
          const dest = toW(team, range(79, 87), clamp(CY + sideSgn * range(-3, 14), 14, 54));
          carryTo(team, dest, 6.8);
          const drb = playerOfSlot(holder).drib;
          if (chance(0.2 * STYLE[team].loss / drb)) return loseBall(team, 'dribble');
          if (chance(0.05 * STYLE[other(team)].foul)) return foulOn(team);
          settle(team, 0.2);
          return finishShot(team, holder, { scene, body: 'foot', passer: null }, 0.05);
        }
        case 'combo': {
          scene = sceneFast || 'build';
          const fTarget = toW(team, range(78, 84), CY + range(-9, 9));
          const f = pickFinisher(team, fTarget, prevHolder != null ? [prevHolder] : [], ['F']);
          if (chance(0.07 * STYLE[team].loss)) return loseBall(team, 'pass');
          passTo(team, f, fTarget, 15);
          settle(team, range(0.4, 0.8));
          if (chance(0.1 * STYLE[team].loss)) return loseBall(team, chance(0.5) ? 'control' : 'dribble');
          const passer = holder;
          const mTarget = toW(team, range(84, 89), clamp(CY + range(-11, 11), 14, 54));
          const m = pickFinisher(team, mTarget, [passer], ['M', 'F']);
          passTo(team, m, mTarget, 14);
          return finishShot(team, m, { scene, body: 'foot', passer }, 0.05);
        }
        default: {
          // 遠目から
          scene = chance(0.55) ? 'solo' : 'build';
          if (sceneFast) scene = sceneFast;
          const mTarget = toW(team, range(69, 74), CY + range(-13, 13));
          const m = pickFinisher(team, mTarget, prevHolder != null ? [prevHolder] : [], ['M', 'F']);
          if (chance(0.05 * STYLE[team].loss)) return loseBall(team, 'pass');
          passTo(team, m, mTarget, 15);
          settle(team, range(0.3, 0.6));
          const dest = toW(team, range(76, 80), clamp(fromW(team, posOf(holder).x, posOf(holder).y).v + range(-5, 5), 14, 54));
          carryTo(team, dest, 6.5);
          return finishShot(team, holder, { scene, body: 'foot', passer: null }, 0.05);
        }
      }
    }

    /** シュートを打って、その後の展開まで決める */
    function finishShot(team, shooter, info, reboundP) {
      const def = other(team);
      // shooter が受け取るまでの間にボールを持たせる
      if (holder !== shooter) holder = shooter;
      settle(team, range(0.2, 0.45));
      if (chance(0.05 * STYLE[def].foul)) {
        const r = foulOn(team);
        if (r.foul) return r;
      }
      const passer = info.passer == null ? null : info.passer;
      const res = takeShot(team, shooter, Object.assign({}, info, { passer }));
      return afterShot(team, shooter, info, res, reboundP);
    }

    function afterShot(team, shooter, info, res, reboundP) {
      const def = other(team);
      const dir = dirOf(team);
      const gx = goalX(team);
      if (res.kind === 'goal') {
        return Object.assign({ goal: true }, afterGoal(team, shooter, res.tgt));
      }
      if (res.kind === 'wide') {
        const tgt = res.tgt;
        bRest(T + 0.5);
        T += 0.5;
        return { next: { team: def, kind: 'gk', u: 5.5, v: CY + range(-9, 9), t: T + 1.0 } };
      }
      if (res.kind === 'saved') {
        const gkS = res.gkS;
        const r = rand();
        const g = posOf(gkS);
        if (r < 0.62) {
          // キャッチ
          holder = gkS;
          bHold(T + 0.6, gkS);
          advance(T + 0.6, ctxFor(def, g, { force: { [gkS]: { x: g.x, y: g.y, v: 2 } } }));
          T += 0.6;
          const nf = fromW(def, g.x, g.y);
          return { next: { team: def, kind: 'regain', u: nf.u, v: nf.v, holder: gkS, t: T, gkHold: true } };
        }
        if (r < 0.62 + 0.18) {
          // はじいてコーナー
          const cv = chance(0.5) ? 0.4 : PW - 0.4;
          ballOutForCorner(team, cv);
          return { next: { team, kind: 'corner', u: PL, v: cv, t: T + 1.0 }, corner: true };
        }
        // こぼれ球
        const land = { x: clamp(g.x - dir * range(5, 9), 2, PL - 2), y: clamp(g.y + range(-8, 8), 3, PW - 3) };
        const t1 = T + 0.8;
        bFly(t1, land.x, land.y, 0.6);
        // 近くの選手（攻撃60%）
        const attacker = chance(0.5);
        const wS = attacker ? pickRecv(team, land, [], ['F', 'M']) : nearestDef(team, land, true);
        advance(t1, ctxFor(null, land, { force: { [wS]: { x: land.x, y: land.y, v: 8.6 } }, press: false }));
        T = t1;
        if (attacker && reboundP > 0 && chance(0.55)) {
          holder = wS;
          const t2 = T + 0.3;
          advance(t2, ctxFor(team, land, { force: { [wS]: { x: land.x, y: land.y, v: 2 } } }));
          bHold(t2, wS);
          T = t2;
          const res2 = takeShot(team, wS, { scene: info.scene, body: 'foot', passer: null, boost: 1.1 });
          return afterShot(team, wS, info, res2, 0);
        }
        holder = wS;
        bHold(T + 0.35, wS);
        advance(T + 0.35, ctxFor(attacker ? team : def, land, { force: { [wS]: { x: land.x, y: land.y, v: 2 } } }));
        T += 0.35;
        if (attacker) return { next: { team: def, kind: 'gk', u: 5.5, v: CY, t: T + 1.5 } };
        const nf = fromW(def, land.x, land.y);
        return { next: { team: def, kind: 'regain', u: nf.u, v: nf.v, holder: wS, t: T } };
      }
      // ブロック
      const bp = res.bp;
      const r = rand();
      if (r < 0.32) {
        const cv = bp.y < CY ? 0.4 : PW - 0.4;
        ballOutForCorner(team, cv);
        return { next: { team, kind: 'corner', u: PL, v: cv, t: T + 1.0 }, corner: true };
      }
      const land = { x: clamp(bp.x - dir * range(3, 8), 2, PL - 2), y: clamp(bp.y + range(-7, 7), 3, PW - 3) };
      const t1 = T + 0.7;
      bFly(t1, land.x, land.y, 0.5);
      const w = nearestDef(team, land, true);
      advance(t1, ctxFor(null, land, { force: { [w]: { x: land.x, y: land.y, v: 8.6 } }, press: false }));
      T = t1;
      holder = w;
      bHold(T + 0.3, w);
      advance(T + 0.3, ctxFor(def, land, { force: { [w]: { x: land.x, y: land.y, v: 2 } } }));
      T += 0.3;
      const nf = fromW(def, land.x, land.y);
      return { next: { team: def, kind: 'regain', u: nf.u, v: nf.v, holder: w, t: T } };
    }

    /** クリアされたあと */
    function afterClear(team, clearer, at) {
      const def = other(team);
      const dir = dirOf(team);
      const land = { x: clamp(at.x - dir * range(16, 26), 4, PL - 4), y: clamp(at.y + range(-14, 14), 4, PW - 4) };
      const t1 = T + 1.1;
      bFly(t1, land.x, land.y, 1.8);
      const dw = pickRecv(def, land, [], ['D', 'M']);
      const aw = pickRecv(team, land, [], ['M']);
      const defWins = chance(0.55);
      const w = defWins ? dw : aw;
      advance(t1, ctxFor(null, land, { force: { [w]: { x: land.x, y: land.y, v: 8.4 } }, press: false }));
      T = t1;
      holder = w;
      bHold(T + 0.35, w);
      advance(T + 0.35, ctxFor(defWins ? def : team, land, { force: { [w]: { x: land.x, y: land.y, v: 2 } } }));
      T += 0.35;
      if (defWins) {
        const nf = fromW(def, land.x, land.y);
        return { next: { team: def, kind: 'regain', u: nf.u, v: nf.v, holder: w, t: T } };
      }
      const nf = fromW(team, land.x, land.y);
      return { next: { team, kind: 'regain', u: nf.u, v: nf.v, holder: w, t: T, second: true } };
    }

    function offsideRestart(team, striker) {
      const def = other(team);
      const sp = posOf(striker);
      const t1 = T + 3.0;
      advance(t1, ctxFor(null, sp, { press: false, spd: { H: 5, A: 5 } }));
      B.x = sp.x;
      B.y = sp.y;
      bRest(t1);
      T = t1;
      const f = fromW(def, sp.x, sp.y);
      return { next: { team: def, kind: 'fk', u: clamp(f.u, 6, 99), v: clamp(f.v, 6, 62), t: T } };
    }

    /* --- セットプレー --- */
    function boxPositions(team, side) {
      // 攻撃側がゴール前に入る位置（u, v）
      const nearV = side === 0 ? 27 : 41; // コーナー側
      return [
        [99, nearV],
        [95, 34],
        [98.5, 34 + (side === 0 ? 5 : -5)],
        [93.5, 27],
        [93.5, 41],
        [88, 34],
      ];
    }
    function setPieceShape(team, kickSlot, kickAt, kind, sideV) {
      const def = other(team);
      const force = {};
      const dir = dirOf(team);
      // キッカー
      force[kickSlot] = { x: kickAt.x, y: kickAt.y, v: 8, free: true };
      // 攻撃：CB2人・FW2人・MF1〜2人がゴール前
      const pool = [];
      for (let i = 1; i < 11; i++) {
        const s = slotOf(team, i);
        if (s === kickSlot) continue;
        const R = FORM[team][i];
        const w = R.r === 'F' ? 5 : R.r === 'M' ? 2 : i === 2 || i === 3 ? 3.2 : 0.7;
        pool.push({ s, w: w * playerOfSlot(s).aer * (0.7 + rand() * 0.6) });
      }
      pool.sort((a, b) => b.w - a.w);
      const boxes = boxPositions(team, sideV < CY ? 0 : 1);
      const atk = pool.slice(0, boxes.length);
      atk.forEach((a, k) => {
        const bp = boxes[k];
        force[a.s] = Object.assign(toW(team, bp[0] + range(-0.8, 0.8), bp[1] + range(-1, 1)), { v: 7.4 });
      });
      // 守備：マーク＋ゴールキーパー
      const defs = [];
      for (let i = 1; i < 11; i++) defs.push(slotOf(def, i));
      const rank = { D: 0, M: 1, F: 2, G: 3 };
      defs.sort((a, b) => rank[FORM[teamOfSlot(a)][idxOfSlot(a)].r] - rank[FORM[teamOfSlot(b)][idxOfSlot(b)].r]);
      atk.forEach((a, k) => {
        const ds = defs[k];
        if (ds == null) return;
        const p = force[a.s];
        force[ds] = { x: p.x + dir * 1.1, y: p.y + range(-0.4, 0.4), v: 7.4 };
      });
      force[slotOf(def, 0)] = Object.assign(toW(team, PL - 3.2, CY + (kickAt.y < CY ? -1.2 : 1.2)), { v: 5 });
      // 残り2人の守備は、ペナルティエリアの外で構える
      return { force, atk };
    }

    /** クロスのボールがゴール前に入り、競り合う（コーナー／FK／スローイン共通） */
    function deliverAndContest(team, kicker, tgtLoc, shape, scene, flight, winP) {
      const def = other(team);
      const dir = dirOf(team);
      const near = shape.atk.map((a) => a.s);
      const hs = wpick(near, (s) => playerOfSlot(s).aer * (playerOfSlot(s).fin * 0.7 + 0.5) * Math.exp(-Math.hypot(last(s).x - tgtLoc.x, last(s).y - tgtLoc.y) / 12));
      const dm = nearestDef(team, tgtLoc, true);
      const t1 = T + flight;
      bFly(t1, tgtLoc.x, tgtLoc.y, 1.8);
      const force = Object.assign({}, shape.force, { [hs]: { x: tgtLoc.x, y: tgtLoc.y, v: 6 }, [dm]: { x: tgtLoc.x + dir * 0.8, y: tgtLoc.y + 0.5, v: 6.5 } });
      advance(t1, ctxFor(null, tgtLoc, { force, press: false }));
      T = t1;
      holder = hs;
      const aWin = (playerOfSlot(hs).aer * (team === 'A' ? 1.2 : 0.85)) / (playerOfSlot(dm).aer * 1.05 + 0.001);
      if (chance(clamp(winP * aWin * setK, 0.08, 0.62))) {
        bHold(T + 0.05, hs);
        return finishHeader(team, hs, kicker, scene);
      }
      // 守備がクリア
      if (chance(TAGR.clr)) emit(T + 0.3, 'clr', def, dm, locOf(def, tgtLoc.x, tgtLoc.y));
      addFx(T + 0.2, 'win', tgtLoc.x, tgtLoc.y - 1.8, 'クリア', def);
      holder = null;
      return afterClear(team, dm, tgtLoc);
    }

    function gatherForSetPiece(spot, force, times, dur) {
      for (let k = 0; k < times; k++) {
        advance(T + dur, ctxFor(null, spot, { force, press: false, spd: { H: 7.4, A: 7.4 } }));
        T += dur;
        bRest(T);
      }
    }

    function corner(team, st) {
      const cornerV = st.v < CY ? 0.5 : PW - 0.5;
      const spot = toW(team, PL - 0.4, cornerV);
      const crosserCands = [];
      for (let i = 1; i < 11; i++) {
        const R = FORM[team][i];
        if (R.r === 'M' || R.r === 'F') crosserCands.push(slotOf(team, i));
      }
      const kicker = wpick(crosserCands, (s) => playerOfSlot(s).cross * (FORM[team][idxOfSlot(s)].w ? 1.6 : 0.6));
      const shape = setPieceShape(team, kicker, spot, 'corner', cornerV);
      placeBall(spot.x, spot.y);
      gatherForSetPiece(spot, shape.force, 2, 2.6);
      holder = kicker;
      bHold(T + 0.5, kicker);
      T += 0.5;
      emit(T + 0.6, 'ck', team, kicker, {});
      addFx(T, 'flag', spot.x, spot.y + (cornerV < CY ? 2.5 : -2.5), 'コーナー', team);
      const tgtLoc = toW(team, range(94.5, 100), CY + range(-7, 7));
      return deliverAndContest(team, kicker, tgtLoc, shape, 'corner', 1.75, 0.28);
    }

    function finishHeader(team, hs, passer, scene) {
      const res = takeShot(team, hs, { scene, body: 'head', passer });
      return afterShot(team, hs, { scene }, res, 0.1);
    }

    function freeKickAttack(team, st) {
      const def = other(team);
      const spot = toW(team, st.u, st.v);
      const dist = Math.hypot(PL - st.u, st.v - CY);
      const direct = dist <= 27 && Math.abs(st.v - CY) <= 18 && chance(0.6);
      const cands = [];
      for (let i = 1; i < 11; i++) if (FORM[team][i].r !== 'D') cands.push(slotOf(team, i));
      const kicker = wpick(cands, (s) => playerOfSlot(s).fk);
      placeBall(spot.x, spot.y);
      if (direct) {
        const goalC = toW(team, PL, CY);
        const len = Math.hypot(goalC.x - spot.x, goalC.y - spot.y) || 1;
        const ux = (goalC.x - spot.x) / len;
        const uy = (goalC.y - spot.y) / len;
        const force = { [kicker]: { x: spot.x, y: spot.y, v: 7 } };
        const wall = [];
        for (let i = 1; i < 11 && wall.length < 4; i++) {
          const s = slotOf(def, i);
          if (FORM[def][i].r !== 'F') wall.push(s);
        }
        wall.forEach((s, k) => {
          force[s] = { x: spot.x + ux * 9.2 - uy * (k - 1.5) * 0.75, y: spot.y + uy * 9.2 + ux * (k - 1.5) * 0.75, v: 7.2 };
        });
        force[slotOf(def, 0)] = Object.assign(toW(team, PL - 2, CY + (spot.y < CY ? 1.6 : -1.6) * 0.6), { v: 5 });
        gatherForSetPiece(spot, force, 2, 2.2);
        holder = kicker;
        bHold(T + 0.7, kicker);
        advance(T + 0.7, ctxFor(null, spot, { force, press: false }));
        T += 0.7;
        addFx(T, 'whistle', spot.x, spot.y - 1.8, 'フリーキック', team);
        const res = takeShot(team, kicker, { scene: 'fk', body: 'foot', passer: null });
        return afterShot(team, kicker, { scene: 'fk' }, res, 0);
      }
      const shape = setPieceShape(team, kicker, spot, 'fk', spot.y);
      gatherForSetPiece(spot, shape.force, 2, 2.4);
      holder = kicker;
      bHold(T + 0.5, kicker);
      T += 0.5;
      const tgtLoc = toW(team, range(94.5, 99.5), CY + range(-7, 7));
      return deliverAndContest(team, kicker, tgtLoc, shape, 'fk', 1.6, 0.3);
    }

    function penalty(team) {
      const def = other(team);
      const dir = dirOf(team);
      const spot = toW(team, PL - 11, CY);
      const cands = [];
      for (let i = 1; i < 11; i++) if (FORM[team][i].r !== 'D') cands.push(slotOf(team, i));
      const kicker = wpick(cands, (s) => playerOfSlot(s).fin);
      const gk = slotOf(def, 0);
      const force = {};
      force[kicker] = { x: spot.x - dir * 0.6, y: spot.y, v: 6 };
      force[gk] = Object.assign(toW(team, PL - 0.6, CY), { v: 5 });
      let ka = 0;
      let kb = 0;
      for (let s = 0; s < 22; s++) {
        if (s === kicker || s === gk) continue;
        // ペナルティエリアとアークの外側に、2列で立つ（重ならないように間隔をあける）
        if (teamOfSlot(s) === team) {
          force[s] = Object.assign(toW(team, 75.5 + (ka % 2) * 1.6, CY + (ka - 4) * 3.7), { v: 7 });
          ka++;
        } else {
          force[s] = Object.assign(toW(team, 80.5 + (kb % 2) * 1.6, CY + (kb - 4.5) * 3.4), { v: 7 });
          kb++;
        }
      }
      placeBall(spot.x, spot.y);
      gatherForSetPiece(spot, force, 2, 2.6);
      holder = kicker;
      addFx(T, 'pk', spot.x, spot.y - 3, 'PK!', team);
      bHold(T + 0.5, kicker);
      T += 0.5;
      const res = takeShot(team, kicker, { scene: 'pk', body: 'foot', passer: null, pk: true });
      return afterShot(team, kicker, { scene: 'pk' }, res, 0);
    }

    function throwIn(team, st) {
      const dir = dirOf(team);
      // スローインの位置から、そのまま組み立て
      prepareStart(team, st);
      const cur = fromW(team, posOf(holder).x, posOf(holder).y);
      if (cur.u >= 84 && chance(0.4)) {
        // 大きなスロー→ゴール前
        const tgtLoc = toW(team, range(95, 100), CY + range(-6, 6));
        const near = [];
        for (let i = 1; i < 11; i++) if (FORM[team][i].r !== 'D' || i === 2 || i === 3) near.push(slotOf(team, i));
        const hs = wpick(near, (s) => playerOfSlot(s).aer * Math.exp(-Math.hypot(last(s).x - tgtLoc.x, last(s).y - tgtLoc.y) / 15));
        const dm = nearestDef(team, tgtLoc, true);
        const t1 = T + 1.4;
        const thrower = holder;
        bFly(t1, tgtLoc.x, tgtLoc.y, 1.5);
        advance(t1, ctxFor(null, tgtLoc, { force: { [hs]: { x: tgtLoc.x, y: tgtLoc.y, v: 6.4 }, [dm]: { x: tgtLoc.x + dir * 0.7, y: tgtLoc.y, v: 6.4 } }, press: false }));
        T = t1;
        holder = hs;
        if (chance(clamp(0.3 * setK, 0.1, 0.55))) {
          bHold(T + 0.05, hs);
          return finishHeader(team, hs, thrower, 'throw');
        }
        return afterClear(team, dm, tgtLoc);
      }
      return null; // 通常の組み立てへ
    }

    /* --- 1回の攻撃 --- */
    function possession(team, st) {
      const def = other(team);
      T = Math.max(T, st.t || T);
      if (st.kind === 'corner') return corner(team, st);
      if (st.kind === 'pkick') return penalty(team);
      if (st.kind === 'fkAtt') return freeKickAttack(team, st);
      if (st.kind === 'throw') {
        const r = throwIn(team, st);
        if (r) return r;
        st = Object.assign({}, st, { kind: 'built' });
      } else if (st.kind === 'fk' && st.u >= 70) {
        return freeKickAttack(team, Object.assign({}, st, { kind: 'fkAtt' }));
      } else prepareStart(team, st);

      // 攻め方
      const style = STYLE[team];
      const cur = fromW(team, posOf(holder).x, posOf(holder).y);
      let phase = 'build';
      if (st.kind === 'regain') {
        if (st.gkHold) phase = chance(style.long) ? 'direct' : 'build';
        else if (st.second) phase = 'build';
        else phase = st.u >= 66 ? 'quick' : st.u >= 38 ? (chance(style.counter * 1.5) ? 'quick' : 'build') : chance(style.counter) ? 'quick' : chance(style.long) ? 'direct' : 'build';
      } else if (st.kind === 'gk') phase = chance(style.long * 1.4) ? 'direct' : 'build';
      else if (st.kind === 'fk' && cur.u < 45) phase = chance(style.long) ? 'direct' : 'build';

      let res = null;
      if (phase === 'build') res = buildUp(team, st, Math.round(range(3, 6.6)));
      else if (phase === 'quick') res = quickBreak(team, st);
      else res = directBall(team, st);
      if (res) return res;

      // 仕上げ
      const w =
        phase === 'quick'
          ? { wing: 0.15 * style.wing, through: 0.35 * style.through, solo: 0.3 * style.solo, combo: 0.15, far: 0.05 * style.far }
          : phase === 'direct'
            ? { wing: 0, through: 0.25 * style.through, solo: 0.2, combo: 0.55, far: 0.05 }
            : { wing: 0.34 * style.wing, through: 0.2 * style.through, solo: 0.2 * style.solo, combo: 0.16 * style.combo, far: 0.1 * style.far };
      // 中途半端な位置で終わらないように、まだ低いならもう少しつなぐ
      const kindF = wpick(Object.keys(w), (k) => w[k]);
      // シュートに至らず終わる（前進の途中で潰される）確率
      const cutP = phase === 'quick' ? 0.22 : phase === 'direct' ? 0.3 : 0.4;
      if (!chance(Math.min(0.95, (1 - cutP) * shotK * style.shotMul))) {
        return loseBall(team, wpick(['pass', 'dribble', 'control', 'clear'], (k) => ({ pass: 4, dribble: 3, control: 1.4, clear: 0.8 }[k])));
      }
      return finish(team, kindF, phase, st, 0);
    }

    /* --- 反則を受けた後の再開 --- */
    function afterFoul(r) {
      const team = r.spot.team;
      // 反則を受けた側の再開
      if (r.inBox) return { next: { team, kind: 'pkick', u: 0, v: 0, t: T, foulEv: r.ev } };
      if (r.spot.u >= 66) return { next: { team, kind: 'fkAtt', u: r.spot.u, v: r.spot.v, t: T } };
      return { next: { team, kind: 'fk', u: r.spot.u, v: r.spot.v, t: T } };
    }

    /* --- 試合全体 --- */
    // 初期配置（キックオフ）
    {
      const c = { x: PL / 2, y: CY };
      for (let s = 0; s < 22; s++) {
        const tg = shapeTarget(s, { ball: c, poss: null, kick: true });
        kf[s].push({ t: 0, x: tg.x, y: tg.y });
      }
      T = 3.5;
      advance(T, ctxFor(null, c, { kick: true, press: false }));
      ball.push({ kind: 'rest', t0: 0, t1: T, x: c.x, y: c.y });
      B.t = T;
      lineups.push({ t: 0, H: oncourt.H.slice(), A: oncourt.A.slice() });
      periods.push({ q: 1, start: T });
    }

    function runHalf(startTeam, endT) {
      let st = { team: startTeam, kind: 'kickoff', u: 52.5, v: CY, t: T };
      let guard = 0;
      while (guard++ < 400) {
        if (T >= endT && st.kind !== 'pkick' && st.kind !== 'corner') break;
        const team = st.team;
        const before = T;
        let r = possession(team, st);
        if (r && r.foul) r = afterFoul(r);
        if (!r || !r.next) r = { next: { team: other(team), kind: 'gk', u: 5.5, v: CY, t: T + 2 } };
        st = r.next;
        if (T < before + 1) T = before + 1;
        // 攻撃の間の小休止（笛・プレーの切れ目）
        if (st.kind === 'gk' || st.kind === 'fk' || st.kind === 'throw') T += range(0.5, 2.0);
      }
    }

    runHalf('H', 3.5 + halfSec);
    const end1 = T;
    // ハーフタイム（映像はここで一度切れる想定：暗転のあいだに入れ替わる）
    {
      const c = { x: PL / 2, y: CY };
      bRest(T + 1.0);
      advance(T + 1.0, ctxFor(null, c, { press: false, spd: { H: 3, A: 3 } }));
      T += 1.0;
      cuts.push({ t0: T, t1: T + 9, label: '前半終了', h: null });
      const t0 = T;
      half = 2;
      oncourt.H = ROSTER.H.lineup[1].slice();
      oncourt.A = ROSTER.A.lineup[1].slice();
      const tNew = t0 + 9;
      for (let s = 0; s < 22; s++) {
        const l = last(s);
        push(s, t0 + 0.4, l.x, l.y);
        const tg = shapeTarget(s, { ball: c, poss: null, kick: true });
        push(s, t0 + 4.5, tg.x, tg.y);
        push(s, tNew, tg.x, tg.y);
      }
      B.x = c.x;
      B.y = c.y;
      bRest(tNew);
      T = tNew;
      lineups.push({ t: t0 + 4.5, H: oncourt.H.slice(), A: oncourt.A.slice() });
      periods.push({ q: 2, start: T });
    }
    runHalf('A', T + halfSec);
    const end2 = T;
    // 試合終了
    {
      bRest(T + 3);
      advance(T + 3, ctxFor(null, { x: B.x, y: B.y }, { press: false, spd: { H: 3, A: 3 } }));
      T += 3;
    }
    const duration = T + 4;
    kf.forEach((a, s) => {
      if (last(s).t < duration) push(s, duration, last(s).x, last(s).y);
    });
    bRest(duration);

    events.sort((a, b) => a.t - b.t);
    fx.sort((a, b) => a.t - b.t);
    return { seed, duration, kf, ball, fx, lineups, periods, cuts, events, roster: ROSTER, halfSec, end1, end2, counts };
  };

  /** アプリの state 形式に変換 */
  SIM.toState = function (data) {
    const s = SL.defaultState();
    s.title = 'サンプル試合（シミュレーション）';
    s.video = { name: 'サンプル試合（シミュレーション映像）', size: 0, duration: data.duration, sim: true };
    for (const t of ['H', 'A']) {
      s.teams[t].name = ROSTER[t].name;
      s.teams[t].color = ROSTER[t].color;
      s.teams[t].roster = ROSTER[t].players.map((p) => ({ num: p.num, name: p.name, pos: p.pos })).sort((a, b) => a.num - b.num);
    }
    s.periods = data.periods.map((p) => ({ q: p.q, start: Math.round(p.start * 10) / 10 }));
    s.events = data.events.map((e, i) => {
      const o = Object.assign({ id: 'e' + (i + 1) }, e, { t: Math.round(e.t * 10) / 10 });
      return o;
    });
    const byRef = new Map();
    data.events.forEach((e, i) => byRef.set(e, s.events[i]));
    s.events.forEach((e, i) => {
      const src = data.events[i];
      if (src.forRef) e.for = byRef.get(src.forRef).id;
      delete e.forRef;
    });
    s.nextId = s.events.length + 1;
    s.cfg.level = 'club';
    s.cfg.halfMin = SIM.HALF_MIN;
    s.cfg.pre = 8;
    s.cfg.post = 4;
    return s;
  };
})();
