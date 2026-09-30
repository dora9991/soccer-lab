/* サッカー分析ラボ - 集計（個人成績・チーム比較・攻撃の型別・ボールロスト・ファウル・セットプレー・xG）
 * 指標の考え方：Opta / StatsBomb / Wyscout などが公開している基本指標（シュート、枠内、xG、xA、
 * キーパス、タックル、インターセプト、ファウル、カード）と、Hudl Sportscode のタグ付け分析（場面別に見る）に倣っています。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const D = SL.derive;
  const C = SL.C;
  const X = SL.xg;
  const S = (SL.stats = {});

  const TEAMS = ['H', 'A'];
  const div = (n, d) => (d > 0 ? n / d : null);
  const other = D.other;

  function newLine(team, num) {
    return {
      team, num,
      goals: 0, pkGoals: 0, pkTaken: 0, shots: 0, sot: 0, soff: 0, blk: 0, xg: 0, npxg: 0, big: 0, bigGoals: 0,
      ast: 0, kp: 0, xa: 0, tkl: 0, itc: 0, clr: 0, ck: 0, tov: 0, foul: 0, fouled: 0, yc: 0, rc: 0, off: 0, og: 0,
      saves: 0, faced: 0, ga: 0,
    };
  }
  const KEYS = ['goals', 'pkGoals', 'pkTaken', 'shots', 'sot', 'soff', 'blk', 'xg', 'npxg', 'big', 'bigGoals', 'ast', 'kp', 'xa', 'tkl', 'itc', 'clr', 'ck', 'tov', 'foul', 'fouled', 'yc', 'rc', 'off', 'og', 'saves', 'faced', 'ga'];

  function decorate(L) {
    L.shotAcc = div(L.sot, L.shots);
    L.conv = div(L.goals, L.shots);
    L.xgShot = div(L.xg, L.shots);
    L.xgDiff = L.goals - L.xg; // + なら期待以上に決めた
    L.ga2 = L.goals + L.ast; // G+A
    L.xgi = L.xg + L.xa; // xG+xA
    L.def = L.tkl + L.itc + L.clr; // 守備アクション
    L.savePct = div(L.saves, L.faced);
    return L;
  }

  /** そのチームのGK（役割がGKの選手。いなければ #1） */
  S.gkOf = (state, team) => {
    const r = state.teams[team].roster || [];
    const g = r.find((p) => p.pos === 'GK');
    if (g) return g.num;
    return r.some((p) => p.num === 1) ? 1 : null;
  };

  /* ---------- メイン ---------- */
  /** state.events を集計する。opts.q を渡すとその前半／後半だけ */
  S.compute = (state, opts) => {
    opts = opts || {};
    const periods = state.periods || [{ q: 1, start: 0 }];
    let events = state.events.filter((e) => e.type !== 'note' && (e.team === 'H' || e.team === 'A'));
    if (opts.q) events = events.filter((e) => D.periodAt(periods, e.t) === opts.q);
    const half = (state.cfg && state.cfg.halfMin) || 45;

    const maps = { H: new Map(), A: new Map() };
    const get = (team, num) => {
      const k = num == null ? 0 : num;
      if (!maps[team].has(k)) maps[team].set(k, newLine(team, k));
      return maps[team].get(k);
    };
    const link = D.linkPasses(events);
    const xgOf = new Map();
    events.forEach((e) => {
      if (C.isShot(e)) xgOf.set(e.id, X.detail(e));
    });

    for (const e of events) {
      const L = get(e.team, e.num);
      switch (e.type) {
        case 'goal':
        case 'pkg':
        case 'sot':
        case 'soff':
        case 'sblk':
        case 'pkx': {
          const d = xgOf.get(e.id);
          const isPk = e.type === 'pkg' || e.type === 'pkx';
          L.shots++;
          L.xg += d.xg;
          if (!isPk) L.npxg += d.xg;
          if (d.xg >= X.BIG && !isPk) L.big++;
          if (isPk) L.pkTaken++;
          if (D.isGoal(e)) {
            L.goals++;
            L.sot++;
            if (e.type === 'pkg') L.pkGoals++;
            else if (d.xg >= X.BIG) L.bigGoals++;
          } else if (e.type === 'sot') L.sot++;
          else if (e.type === 'sblk') L.blk++;
          else if (e.type === 'pkx' && e.sub === 'saved') L.sot++;
          else L.soff++;
          break;
        }
        case 'og': L.og++; break;
        case 'ast':
        case 'kp': {
          L[e.type]++;
          const s = link.get(e.id);
          if (s && xgOf.has(s.id)) L.xa += xgOf.get(s.id).xg;
          break;
        }
        case 'tkl': L.tkl++; break;
        case 'itc': L.itc++; break;
        case 'clr': L.clr++; break;
        case 'ck': L.ck++; break;
        case 'tov': L.tov++; break;
        case 'foul':
          L.foul++;
          if (e.vs != null) get(other(e.team), e.vs).fouled++;
          break;
        case 'off': L.off++; break;
        case 'yc': L.yc++; break;
        case 'rc': L.rc++; break;
      }
    }

    // GK：相手の枠内シュート（止めた／決められた）から、セーブ数と被シュート数を数える
    const gk = { H: S.gkOf(state, 'H'), A: S.gkOf(state, 'A') };
    const saved = { H: 0, A: 0 }; // そのチームのGKが止めた本数
    for (const e of events) {
      if (!C.isShot(e)) continue;
      const def = other(e.team);
      const isSave = e.type === 'sot' || (e.type === 'pkx' && e.sub === 'saved');
      const isGoal = D.isGoal(e);
      if (!isSave && !isGoal) continue;
      if (isSave) saved[def]++;
      const g = e.gk != null ? e.gk : gk[def];
      if (g == null) continue;
      const L = get(def, g);
      L.faced++;
      if (isSave) L.saves++;
      else L.ga++;
    }

    // 選手行とチーム合計
    const team = {};
    for (const t of TEAMS) {
      const tot = newLine(t, -1);
      for (const L of maps[t].values()) for (const k of KEYS) tot[k] += L[k];
      team[t] = tot;
    }
    const players = {};
    for (const t of TEAMS) {
      for (const p of state.teams[t].roster) get(t, p.num);
      players[t] = Array.from(maps[t].values())
        .map((L) => {
          const r = state.teams[t].roster.find((p) => p.num === L.num);
          L.pos = r ? r.pos || '' : '';
          L.isGK = L.num === gk[t] && gk[t] != null;
          return decorate(L);
        })
        .sort((a, b) => (a.num === 0) - (b.num === 0) || a.num - b.num);
      team[t].nameOf = state.teams[t].name;
    }
    for (const t of TEAMS) {
      const T = team[t];
      const O = team[other(t)];
      T.gf = T.goals + O.og; // 相手のオウンゴールも得点
      T.ga = O.goals + T.og;
      T.saves = saved[t];
      T.oppSot = O.sot;
      T.bigMissed = T.big - T.bigGoals;
      decorate(T);
    }
    const score = { H: team.H.gf, A: team.A.gf };

    // 得点の一覧（時系列）
    const goals = [];
    for (const e of events) {
      const ct = D.creditTeam(e);
      if (!ct) continue;
      let pass = null;
      link.forEach((shot, pid) => {
        if (shot.id === e.id) pass = events.find((x) => x.id === pid) || null;
      });
      goals.push({
        t: e.t, id: e.id, team: ct, type: e.type, own: e.type === 'og', pk: e.type === 'pkg',
        scorer: e.num, scorerTeam: e.team, assister: pass && pass.type === 'ast' ? pass.num : null,
        scene: e.scene || (e.type === 'pkg' ? 'pk' : C.SCENE_DEFAULT), xg: xgOf.has(e.id) ? xgOf.get(e.id).xg : null,
        q: D.periodAt(periods, e.t), clock: D.minuteLabel(state, e.t), body: e.body,
      });
    }

    // 攻撃の型別（シュートに付けた「場面」ごと）
    const scenes = { H: [], A: [] };
    const play = { H: { open: null, set: null }, A: { open: null, set: null } };
    for (const t of TEAMS) {
      const mine = events.filter((e) => e.team === t && C.isShot(e));
      const by = new Map();
      const mk = (id) => ({ scene: id, shots: 0, sot: 0, goals: 0, xg: 0, big: 0 });
      const grp = { open: mk('open'), set: mk('set') };
      for (const e of mine) {
        const sc = e.scene || (e.type === 'pkg' || e.type === 'pkx' ? 'pk' : C.SCENE_DEFAULT);
        if (!by.has(sc)) by.set(sc, mk(sc));
        const d = xgOf.get(e.id);
        for (const r of [by.get(sc), C.isSetPiece(sc) ? grp.set : grp.open]) {
          r.shots++;
          r.xg += d.xg;
          if (C.isOnTarget(e)) r.sot++;
          if (D.isGoal(e)) r.goals++;
          if (d.xg >= X.BIG && e.type !== 'pkg' && e.type !== 'pkx') r.big++;
        }
      }
      const rows = C.SCENES.map((sc) => by.get(sc.id)).filter(Boolean);
      for (const r of rows) {
        r.freq = div(r.shots, mine.length);
        r.conv = div(r.goals, r.shots);
        r.sotPct = div(r.sot, r.shots);
        r.xgShot = div(r.xg, r.shots);
      }
      scenes[t] = rows;
      for (const k of ['open', 'set']) {
        const r = grp[k];
        r.freq = div(r.shots, mine.length);
        r.conv = div(r.goals, r.shots);
        r.xgShot = div(r.xg, r.shots);
      }
      play[t] = grp;
    }

    // ボールロスト：種類・場所・選手別と、ロスト直後のピンチ
    const tov = {};
    const regain = {};
    for (const t of TEAMS) {
      const o = other(t);
      const list = events.filter((e) => e.type === 'tov' && e.team === t);
      const byType = {};
      const byZone = {};
      const byPlayer = {};
      const byHalf = {};
      let toShots = 0;
      let toGoals = 0;
      let toXg = 0;
      const seq = [];
      for (const e of list) {
        const ty = e.sub || 'other';
        byType[ty] = (byType[ty] || 0) + 1;
        const z = C.zoneOfEvent(e) || 'unknown';
        byZone[z] = (byZone[z] || 0) + 1;
        byPlayer[e.num || 0] = (byPlayer[e.num || 0] || 0) + 1;
        const q = D.periodAt(periods, e.t);
        byHalf[q] = (byHalf[q] || 0) + 1;
        const s = events.find((x) => x.team === o && C.isShot(x) && x.t > e.t && x.t - e.t <= 12);
        if (s) {
          toShots++;
          toXg += xgOf.get(s.id).xg;
          const g = D.isGoal(s);
          if (g) toGoals++;
          seq.push({ from: e.t, to: s.t, goal: g, xg: xgOf.get(s.id).xg, shotId: s.id });
        }
      }
      tov[t] = { total: list.length, list, byType, byZone, byPlayer, byHalf, toShots, toGoals, toXg, seq, own3: (byZone.ownBox || 0) + (byZone.def3 || 0) };
      // 奪ってからの攻撃（タックル／インターセプト → 12秒以内の自チームのシュート）
      const rl = events.filter((e) => (e.type === 'tkl' || e.type === 'itc') && e.team === t);
      let rShots = 0;
      let rGoals = 0;
      const rseq = [];
      for (const e of rl) {
        const s = events.find((x) => x.team === t && C.isShot(x) && x.t > e.t && x.t - e.t <= 12);
        if (s) {
          rShots++;
          const g = D.isGoal(s);
          if (g) rGoals++;
          rseq.push({ from: e.t, to: s.t, goal: g });
        }
      }
      regain[t] = { total: rl.length, toShots: rShots, toGoals: rGoals, seq: rseq };
    }

    // ファウル・カード
    const fouls = {};
    for (const t of TEAMS) {
      const o = other(t);
      const list = events.filter((e) => e.type === 'foul' && e.team === t);
      const byHalf = {};
      const byZone = {};
      const byType = {};
      const byPlayer = {};
      for (const e of list) {
        const q = D.periodAt(periods, e.t);
        byHalf[q] = (byHalf[q] || 0) + 1;
        const z = C.zoneOfEvent(e) || 'unknown';
        byZone[z] = (byZone[z] || 0) + 1;
        const ty = e.sub || 'other';
        byType[ty] = (byType[ty] || 0) + 1;
        byPlayer[e.num || 0] = (byPlayer[e.num || 0] || 0) + 1;
      }
      // 自分たちのファウルの後、相手がFK／PKで撃った回数
      let setShots = 0;
      let setGoals = 0;
      const setSeq = [];
      for (const e of list) {
        const s = events.find((x) => x.team === o && C.isShot(x) && x.t > e.t && x.t - e.t <= 20 && (x.scene === 'fk' || x.scene === 'pk' || x.type === 'pkg' || x.type === 'pkx'));
        if (s) {
          setShots++;
          const g = D.isGoal(s);
          if (g) setGoals++;
          setSeq.push({ from: e.t, to: s.t, goal: g });
        }
      }
      fouls[t] = {
        total: list.length, list, byHalf, byZone, byType, byPlayer,
        yc: events.filter((e) => e.type === 'yc' && e.team === t),
        rc: events.filter((e) => e.type === 'rc' && e.team === t),
        pkConceded: events.filter((e) => (e.type === 'pkg' || e.type === 'pkx') && e.team === o).length,
        own3: (byZone.ownBox || 0) + (byZone.def3 || 0),
        setShots, setGoals, setSeq,
      };
    }

    // セットプレー
    const setp = {};
    for (const t of TEAMS) {
      const mine = events.filter((e) => e.team === t && C.isShot(e));
      const sc = (id) => mine.filter((e) => (e.scene || '') === id);
      const row = (arr) => ({ shots: arr.length, goals: arr.filter(D.isGoal).length, xg: arr.reduce((a, e) => a + xgOf.get(e.id).xg, 0) });
      setp[t] = {
        corners: events.filter((e) => e.type === 'ck' && e.team === t).length,
        corner: row(sc('corner')),
        fk: row(sc('fk')),
        throw: row(sc('throw')),
        pk: { taken: mine.filter((e) => e.type === 'pkg' || e.type === 'pkx').length, goals: mine.filter((e) => e.type === 'pkg').length },
      };
    }

    // 時間帯別（前半・後半を3分割）
    const qs = Array.from(new Set([1, 2].concat(periods.map((p) => p.q), events.map((e) => D.periodAt(periods, e.t))))).sort((a, b) => a - b);
    const buckets = [];
    for (const q of qs) {
      const len = (q <= 2 ? half : 15) * 60;
      const off = q === 1 ? 0 : q === 2 ? half : q === 3 ? half * 2 : half * 2 + 15;
      const size = len / 3;
      for (let i = 0; i < 3; i++) {
        const m0 = off + Math.round(((i * len) / 3) / 60);
        const m1 = off + Math.round((((i + 1) * len) / 3) / 60);
        buckets.push({ q, i, label: `${C.periodLabel(q)} ${m0}〜${m1}分`, m0, m1, H: { goals: 0, shots: 0, xg: 0 }, A: { goals: 0, shots: 0, xg: 0 } });
      }
      const st0 = D.periodStart(periods, q);
      for (const e of events) {
        if (D.periodAt(periods, e.t) !== q) continue;
        const bi = Math.min(2, Math.floor((e.t - st0) / size));
        const b = buckets.find((x) => x.q === q && x.i === bi);
        if (!b) continue;
        const ct = D.creditTeam(e);
        if (ct) b[ct].goals++;
        if (C.isShot(e)) {
          b[e.team].shots++;
          b[e.team].xg += xgOf.get(e.id).xg;
        }
      }
    }
    const halves = qs.map((q) => {
      const row = { q, H: newLine('H', -1), A: newLine('A', -1) };
      const evs = events.filter((e) => D.periodAt(periods, e.t) === q);
      for (const e of evs) {
        const L = row[e.team];
        if (C.isShot(e)) {
          L.shots++;
          L.xg += xgOf.get(e.id).xg;
          if (D.isGoal(e)) L.goals++;
          if (C.isOnTarget(e)) L.sot++;
        }
        if (e.type === 'foul') L.foul++;
        if (e.type === 'tov') L.tov++;
        if (e.type === 'yc') L.yc++;
        if (e.type === 'og') L.og++;
      }
      row.H.gf = row.H.goals + row.A.og;
      row.A.gf = row.A.goals + row.H.og;
      return row;
    });

    // xGの推移
    const xgTl = [{ t: 0, H: 0, A: 0 }];
    {
      let h = 0;
      let a = 0;
      for (const e of events) {
        if (!C.isShot(e)) continue;
        const d = xgOf.get(e.id);
        if (e.team === 'H') h += d.xg;
        else a += d.xg;
        xgTl.push({ t: e.t, H: h, A: a, team: e.team, xg: d.xg, goal: D.isGoal(e), id: e.id });
      }
    }

    // アシストの組み合わせ（得点のみ）
    const assists = { H: { pairs: {}, n: 0 }, A: { pairs: {}, n: 0 } };
    link.forEach((shot, pid) => {
      const a = events.find((x) => x.id === pid);
      if (!a || a.type !== 'ast' || !D.isGoal(shot)) return;
      const key = (a.num || 0) + '>' + (shot.num || 0);
      assists[a.team].pairs[key] = (assists[a.team].pairs[key] || 0) + 1;
      assists[a.team].n++;
    });

    const tl = D.scoreTimeline(events);
    const flow = D.flowSummary(tl);
    const spells = D.spells(events, 3, 240);

    // データの充実度
    const cnt = (t, f) => events.filter((e) => e.team === t && f(e)).length;
    const shotLoc = (t) => cnt(t, (e) => C.isShot(e) && e.px != null);
    const meta = {
      total: events.length,
      hasA: events.some((e) => e.team === 'A'),
      hasH: events.some((e) => e.team === 'H'),
      hasAst: events.some((e) => e.type === 'ast' || e.type === 'kp'),
      hasTov: events.some((e) => e.type === 'tov'),
      hasFoul: events.some((e) => e.type === 'foul'),
      hasCk: events.some((e) => e.type === 'ck'),
      hasDef: events.some((e) => e.type === 'tkl' || e.type === 'itc' || e.type === 'clr'),
      hasCard: events.some((e) => e.type === 'yc' || e.type === 'rc'),
      hasScene: events.some((e) => C.isShot(e) && e.scene && e.scene !== C.SCENE_DEFAULT),
      shotsH: team.H.shots,
      shotsA: team.A.shots,
      locH: shotLoc('H'),
      locA: shotLoc('A'),
      tovLoc: cnt('H', (e) => e.type === 'tov' && e.px != null),
      foulLoc: cnt('H', (e) => e.type === 'foul' && e.px != null),
      periodsSet: periods.length > 1,
      estXg: events.filter((e) => C.isShot(e) && xgOf.get(e.id).est).length,
    };

    return { events, periods, half, players, team, score, goals, link, xgOf, scenes, play, tov, regain, fouls, setp, buckets, halves, xgTl, tl, flow, spells, assists, meta, gk, saved };
  };

  /* ---------- ショットゾーン別 ---------- */
  /** filterFn(e) を満たすシュートをゾーン別に集計（xGも） */
  S.zoneTable = (events, filterFn) => {
    const rows = {};
    C.ZONES.forEach((z) => (rows[z.id] = { zone: z.id, shots: 0, goals: 0, sot: 0, xg: 0 }));
    rows.unknown = { zone: 'unknown', shots: 0, goals: 0, sot: 0, xg: 0 };
    let total = 0;
    for (const e of events) {
      if (!C.isShot(e)) continue;
      if (filterFn && !filterFn(e)) continue;
      const pos = C.shotPos(e);
      const zone = pos ? C.zoneFor(pos.sx, pos.sy) : e.zone || null;
      const r = rows[zone] || rows.unknown;
      r.shots++;
      total++;
      r.xg += X.of(e);
      if (C.isOnTarget(e)) r.sot++;
      if (D.isGoal(e)) r.goals++;
    }
    Object.values(rows).forEach((r) => {
      r.conv = div(r.goals, r.shots);
      r.xgShot = div(r.xg, r.shots);
      r.share = div(r.shots, total);
    });
    const groups = {};
    C.ZONE_GROUPS.forEach((g) => (groups[g.id] = { grp: g.id, shots: 0, goals: 0, sot: 0, xg: 0 }));
    C.ZONES.forEach((z) => {
      const r = rows[z.id];
      const g = groups[z.grp];
      g.shots += r.shots;
      g.goals += r.goals;
      g.sot += r.sot;
      g.xg += r.xg;
    });
    const located = total - rows.unknown.shots;
    Object.values(groups).forEach((g) => {
      g.conv = div(g.goals, g.shots);
      g.xgShot = div(g.xg, g.shots);
      g.share = div(g.shots, located);
    });
    return { rows, groups, total, located };
  };

  /** 表示用フォーマット */
  S.fmtPct = (v, dp) => (v == null ? '—' : (v * 100).toFixed(dp == null ? 1 : dp) + '%');
  S.fmtNum = (v, dp) => (v == null || !isFinite(v) ? '—' : v.toFixed(dp == null ? 1 : dp));
})();
