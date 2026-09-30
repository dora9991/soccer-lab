/* サッカー分析ラボ - タグ列から「得点推移」「試合時間」「アシストの対応」「押し込んだ時間帯」などを導く */
(function () {
  const SL = (window.SL = window.SL || {});
  const C = SL.C;
  const D = (SL.derive = {});

  const other = (t) => (t === 'H' ? 'A' : 'H');
  D.other = other;

  D.isShot = (e) => C.isShot(e);
  D.isGoal = (e) => e.type === 'goal' || e.type === 'pkg';
  /** 得点が入るイベント（オウンゴールを含む） */
  D.isScore = (e) => e.type === 'goal' || e.type === 'pkg' || e.type === 'og';
  /** 得点が付くチーム（オウンゴールは相手チームの得点） */
  D.creditTeam = (e) => (e.type === 'og' ? other(e.team) : D.isGoal(e) ? e.team : null);

  /* ---------- 前半・後半／試合時間 ---------- */
  D.periodAt = (periods, t) => {
    let q = 1;
    for (const p of periods) if (p.start <= t + 1e-6) q = p.q;
    return q;
  };
  D.qLabel = (q) => C.periodLabel(q);
  D.periodStart = (periods, q) => {
    const p = periods.find((x) => x.q === q);
    return p ? p.start : 0;
  };
  /** 試合時間の表示（前半12分 → "12'"、後半3分（20分ハーフ）→ "23'"、45分超 → "45+2'"） */
  D.clock = (state, t) => {
    const periods = state.periods || [{ q: 1, start: 0 }];
    const half = (state.cfg && state.cfg.halfMin) || 45;
    const q = D.periodAt(periods, t);
    const el = Math.max(0, t - D.periodStart(periods, q));
    const m = Math.floor(el / 60) + 1;
    const len = q <= 2 ? half : 15;
    const off = q === 1 ? 0 : q === 2 ? half : q === 3 ? half * 2 : half * 2 + 15;
    if (m > len) return { q, min: off + len, extra: m - len, label: `${off + len}+${m - len}'` };
    return { q, min: off + m, extra: 0, label: `${off + m}'` };
  };
  D.minuteLabel = (state, t) => D.clock(state, t).label;
  /** "前半 12'" */
  D.clockFull = (state, t) => {
    const c = D.clock(state, t);
    return C.periodLabel(c.q) + ' ' + c.label;
  };

  /* ---------- 得点推移 ---------- */
  D.scoreTimeline = (events) => {
    let H = 0;
    let A = 0;
    const tl = [{ t: 0, H: 0, A: 0 }];
    for (const e of events) {
      const team = D.creditTeam(e);
      if (!team) continue;
      if (team === 'H') H++;
      else A++;
      tl.push({ t: e.t, H, A, team, id: e.id, type: e.type });
    }
    return tl;
  };
  D.scoreAt = (tl, t) => {
    let lo = 0;
    let hi = tl.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tl[mid].t <= t + 1e-6) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return tl[ans];
  };
  D.flowSummary = (tl) => {
    let lead = 0;
    let changes = 0;
    let ties = 0;
    let maxH = 0;
    let maxA = 0;
    for (let i = 1; i < tl.length; i++) {
      const s = tl[i];
      const d = s.H - s.A;
      const l = d > 0 ? 1 : d < 0 ? -1 : 0;
      if (l === 0) ties++;
      if (l !== 0 && lead !== 0 && l !== lead) changes++;
      if (l !== 0) lead = l;
      maxH = Math.max(maxH, d);
      maxA = Math.max(maxA, -d);
    }
    return { changes, ties, maxLeadH: maxH, maxLeadA: maxA, first: tl.length > 1 ? tl[1] : null };
  };

  /* ---------- アシスト／キーパスとシュートの対応づけ ----------
   * ev.for（シュートのid）があればそれを使う。無ければ「同じチームの近い時刻のシュート」を探す。 */
  D.linkPasses = (events) => {
    const map = new Map();
    const used = new Set();
    const byId = new Map();
    events.forEach((e) => byId.set(e.id, e));
    const passes = events.filter((e) => e.type === 'ast' || e.type === 'kp');
    // 明示的な対応を先に確定
    for (const a of passes) {
      if (a.for && byId.has(a.for) && C.isShot(byId.get(a.for))) {
        map.set(a.id, byId.get(a.for));
        used.add(a.for);
      }
    }
    for (const a of passes) {
      if (map.has(a.id)) continue;
      let best = null;
      let bd = 1e9;
      for (const s of events) {
        if (!C.isShot(s) || s.team !== a.team || s.type === 'pkg' || s.type === 'pkx' || used.has(s.id)) continue;
        const dt = a.t - s.t; // 正: パスのタグがシュートより後
        if (dt > 20 || dt < -8) continue;
        if (a.type === 'ast' && !D.isGoal(s)) continue;
        const dist = dt >= 0 ? dt : -dt * 2; // パスが先に付いた場合は少し不利にする
        if (dist < bd) {
          bd = dist;
          best = s;
        }
      }
      if (best) {
        map.set(a.id, best);
        used.add(best.id);
      }
    }
    return map;
  };

  /* ---------- 押し込んだ時間帯（短い間にシュートが続いた区間） ---------- */
  D.spells = (events, minShots, windowSec) => {
    minShots = minShots || 3;
    windowSec = windowSec || 240;
    const out = [];
    for (const team of ['H', 'A']) {
      const shots = events.filter((e) => e.team === team && C.isShot(e));
      let i = 0;
      while (i < shots.length) {
        let j = i;
        while (j + 1 < shots.length && shots[j + 1].t - shots[j].t <= windowSec / 2) j++;
        if (shots[j].t - shots[i].t <= windowSec && j - i + 1 >= minShots) {
          out.push({ team, t0: shots[i].t, t1: shots[j].t, n: j - i + 1, goals: shots.slice(i, j + 1).filter(D.isGoal).length });
          i = j + 1;
        } else i++;
      }
    }
    return out.sort((a, b) => a.t0 - b.t0);
  };
})();
