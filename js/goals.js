/* サッカー分析ラボ - 得点／失点の場面の分析
 * 「点が入った攻撃まるごと」を、攻撃の始まりから得点までのクリップ候補にして、
 * 失点（＝相手の得点）は「どうして決められたか（原因）」、
 * 得点（＝自分たちのゴール）は「どうやって決めたか（型）」で分類する。
 * プロの現場でも、失点はセットプレー／ボールロスト後／カウンター／クロス／ミドルなどに分けて振り返る。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const C = SL.C;
  const D = SL.derive;
  const X = SL.xg;
  const GL = (SL.goals = {});

  /* 主な原因を決める優先順（上ほど優先）。label: [失点側の言い方, 得点側の言い方] */
  GL.CAUSES = [
    { id: 'pk', label: ['PKを与えた', 'PKで得点'], short: 'PK', hint: ['ペナルティエリア内のファウルでPKを与えた', 'PKで決めた'], color: '#ff9f43' },
    { id: 'og', label: ['オウンゴール', '相手のオウンゴール'], short: 'OG', hint: ['自分たちの選手のオウンゴール', '相手のオウンゴール'], color: '#b0b8c9' },
    { id: 'corner', label: ['コーナーキックから', 'コーナーキックから'], short: 'CK', hint: ['コーナーキックからのシュート（こぼれ球含む）', 'コーナーキックから決めた'], color: '#e6c15a' },
    { id: 'fk', label: ['フリーキックから', 'フリーキックから'], short: 'FK', hint: ['直接・間接フリーキックからのシュート', 'フリーキックから決めた'], color: '#ffd166' },
    { id: 'throw', label: ['スローインから', 'スローインから'], short: 'スロー', hint: ['スローイン（ロングスロー）からのシュート', 'スローインから決めた'], color: '#f0b98a' },
    { id: 'tov', label: ['ボールを失った直後', '奪ってすぐの攻撃'], short: 'ロスト後', hint: ['自分たちのボールロスト／奪われた直後に決められた', '相手のボールを奪った直後に決めた'], color: '#ff6b6b' },
    { id: 'counter', label: ['カウンター（速攻）', 'カウンター（速攻）'], short: 'カウンター', hint: ['守備が整う前に走られて決められた', '相手が整う前に走って決めた'], color: '#ff8a5c' },
    { id: 'cross', label: ['サイドからのクロス', 'サイド攻撃・クロス'], short: 'クロス', hint: ['サイドからのクロスを合わされた', 'サイドからのクロスで決めた'], color: '#7ee0b0' },
    { id: 'through', label: ['中央突破・スルーパス', '中央突破・スルーパス'], short: '中央突破', hint: ['縦パス・スルーパス・ワンツーで崩された', '縦パス・スルーパスで崩して決めた'], color: '#5ad1ff' },
    { id: 'long', label: ['ロングボール・裏を取られた', 'ロングボール・裏抜け'], short: 'ロング', hint: ['DFラインの背後に出されて決められた', '背後へのボールで抜け出して決めた'], color: '#a78bfa' },
    { id: 'far', label: ['ミドル・ロングシュート', 'ミドルシュート'], short: 'ミドル', hint: ['ペナルティエリアの外から決められた', 'ペナルティエリアの外から決めた'], color: '#ffc46b' },
    { id: 'solo', label: ['個人技・1対1を破られた', '個人技・ドリブル突破'], short: '個人技', hint: ['ドリブル突破など個人技で決められた', 'ドリブル突破など個人技で決めた'], color: '#9be15d' },
    { id: 'build', label: ['組み立てで崩された', '組み立てて崩した'], short: '組み立て', hint: ['パスをつながれて組織的に崩された', 'パスをつないで崩して決めた'], color: '#9aa9c8' },
    { id: 'other', label: ['その他', 'その他'], short: 'その他', hint: ['上のどれにも当てはまらない', '上のどれにも当てはまらない'], color: '#8892a6' },
  ];
  GL.PRIORITY = GL.CAUSES.map((c) => c.id);
  GL.cause = (id) => GL.CAUSES.find((c) => c.id === id) || GL.CAUSES[GL.CAUSES.length - 1];
  GL.priorityIndex = (id) => {
    const i = GL.PRIORITY.indexOf(id);
    return i < 0 ? GL.PRIORITY.length : i;
  };
  /** 表示名（side: 'against'=失点 / 'for'=得点） */
  GL.causeLabel = (id, side) => GL.cause(id).label[side === 'for' ? 1 : 0];
  GL.causeHint = (id, side) => GL.cause(id).hint[side === 'for' ? 1 : 0];
  GL.SET_CAUSES = ['pk', 'corner', 'fk', 'throw'];

  const SCENE_TO_CAUSE = { corner: 'corner', fk: 'fk', throw: 'throw', pk: 'pk', counter: 'counter', press: 'counter', cross: 'cross', through: 'through', long: 'long', solo: 'solo', build: 'build' };

  function who(state, team, num) {
    if (num == null) return '';
    if (num === 0) return 'チーム';
    const p = state.teams[team].roster.find((x) => x.num === num);
    return '#' + num + (p && p.name ? ' ' + p.name : '');
  }

  /** ゴールの直前にある「攻撃の始まり」の目印（時刻が最も近いもの） */
  function attackMarker(evs, idx, scorer, def) {
    const g = evs[idx];
    for (let k = idx - 1; k >= 0; k--) {
      const e = evs[k];
      if (g.t - e.t > 25) break;
      if (e.team === def && e.type === 'tov') return { t: e.t, kind: 'tov', ev: e };
      if (e.team === scorer && (e.type === 'tkl' || e.type === 'itc')) return { t: e.t, kind: 'regain', ev: e };
      if (e.team === def && e.type === 'foul') return { t: e.t, kind: 'foul', ev: e };
      if (e.team === scorer && e.type === 'ck') return { t: e.t, kind: 'ck', ev: e };
      if (e.team === def && C.isShot(e) && !D.isGoal(e)) return { t: e.t, kind: 'defShot', ev: e };
    }
    return null;
  }

  /**
   * 得点（side='against' なら相手の得点＝失点、'for' なら自チームの得点）を、原因／型つきで一覧にする。
   * state: アプリの状態 / S: SL.stats.compute(state) の結果
   */
  GL.build = (state, S, opts) => {
    opts = opts || {};
    const side = opts.side === 'for' ? 'for' : 'against';
    const scorer = side === 'for' ? 'H' : 'A';
    const def = D.other(scorer);
    const cfg = state.cfg || {};
    const pre = cfg.pre != null ? cfg.pre : 8;
    const post = cfg.post != null ? cfg.post : 4;
    const evs = S.events;
    const periods = state.periods || [{ q: 1, start: 0 }];
    const out = [];

    for (let idx = 0; idx < evs.length; idx++) {
      const g = evs[idx];
      if (D.creditTeam(g) !== scorer) continue;
      const causes = new Set();
      const detail = {};
      const isOwn = g.type === 'og';
      const scene = g.scene || (g.type === 'pkg' ? 'pk' : C.SCENE_DEFAULT);
      const marker = isOwn ? null : attackMarker(evs, idx, scorer, def);
      const near = marker && g.t - marker.t <= 14;

      if (isOwn) causes.add('og');
      else {
        if (g.type === 'pkg' || scene === 'pk') causes.add('pk');
        causes.add(SCENE_TO_CAUSE[scene] || 'other');
        if (near && (marker.kind === 'tov' || marker.kind === 'regain') && !C.isSetPiece(scene)) {
          causes.add('tov');
          detail.tov = { kind: marker.kind, num: marker.ev.num, team: marker.ev.team, sub: marker.ev.sub || 'other', t: marker.t };
        }
        const pos = C.shotPos(g);
        const zone = pos ? C.zoneFor(pos.sx, pos.sy) : g.zone;
        if (zone === 'far' || ((zone === 'edgeC' || zone === 'edgeL' || zone === 'edgeR') && scene === 'solo')) causes.add('far');
        if (g.body === 'head') detail.head = true;
        if (zone === 'six') detail.close = true;
        if (marker && marker.kind === 'foul' && (scene === 'fk' || scene === 'pk')) detail.foul = { num: marker.ev.num, sub: marker.ev.sub || 'other', px: marker.ev.px, py: marker.ev.py };
        if (marker && marker.kind === 'ck') detail.corner = true;
      }
      if (!causes.size) causes.add('other');
      if (causes.size > 1) causes.delete('other');
      // 「その他」より組み立てを優先（scene 未指定 = build）
      const causeList = GL.PRIORITY.filter((id) => causes.has(id));
      const primary = causeList[0];

      // クリップ範囲：攻撃の始まり（目印の少し前）から、得点の少し後まで
      let start;
      if (marker) start = Math.min(g.t - pre, marker.t - (marker.kind === 'foul' || marker.kind === 'ck' ? 3 : 2.5));
      else start = g.t - pre - (isOwn ? 0 : 4);
      start = Math.max(0, start);
      const end = g.t + post;

      const pass = S.link ? Array.from(S.link.entries()).find(([, shot]) => shot.id === g.id) : null;
      const assistEv = pass ? evs.find((x) => x.id === pass[0]) : null;
      const assist = assistEv && assistEv.type === 'ast' ? assistEv.num : null;
      const scorerTeam = g.team;
      const scorerNum = g.num;
      const isPk = g.type === 'pkg';
      const desc = isOwn ? 'オウンゴール' : isPk ? 'PK' : detail.head ? 'ヘディングでゴール' : 'ゴール';
      const clock = D.minuteLabel(state, g.t);
      const label = `${clock} ${who(state, scorerTeam, scorerNum)} ${desc}${assist != null ? `（アシスト ${who(state, scorer, assist)}）` : ''}`.replace(/\s+/g, ' ');

      // 原因（型）の説明文
      const parts = causeList
        .filter((id) => id !== 'other' || causeList.length === 1)
        .map((id) => {
          switch (id) {
            case 'tov': {
              const t = detail.tov;
              if (!t) return GL.causeLabel(id, side);
              if (side === 'against') {
                return t.kind === 'tov' ? `自チームのボールロスト（${C.tovLabel(t.sub).replace(/（.*）/, '')}${t.num ? ' #' + t.num : ''}）` : '中盤などでボールを奪われた直後';
              }
              return t.kind === 'regain' ? `ボール奪取${t.num ? '（#' + t.num + '）' : ''}からすぐに決めた` : '相手のミスを突いて決めた';
            }
            case 'pk':
              return detail.foul ? `ファウル${detail.foul.num ? '（#' + detail.foul.num + '）' : ''}→PK` : GL.causeLabel(id, side);
            case 'fk':
              return detail.foul ? `ファウル${detail.foul.num ? '（#' + detail.foul.num + '）' : ''}→フリーキック` : GL.causeLabel(id, side);
            case 'corner':
              return 'コーナーキック' + (detail.head ? '（ヘディング）' : '');
            case 'cross':
              return 'クロス' + (detail.head ? '→ヘディング' : '');
            default:
              return GL.causeLabel(id, side);
          }
        });
      const causeText = parts.join(' ＋ ') + (detail.close && !C.isSetPiece(scene) ? '（ゴール前の至近距離）' : '');

      const win = evs.filter((e) => e.t >= start - 0.01 && e.t <= g.t + 1.5);
      out.push({
        key: (side === 'for' ? 'sf' : 'ga') + g.id,
        id: g.id,
        side,
        team: scorer,
        def,
        pts: 1,
        t: g.t,
        tEnd: g.t,
        start,
        end,
        q: D.periodAt(periods, g.t),
        clock,
        scene,
        causes: causeList,
        primary,
        detail,
        scorers: [{ num: scorerNum == null ? 0 : scorerNum, pts: 1 }],
        scorerTeam,
        assist,
        label,
        causeText,
        xg: X.of(g),
        events: win.length ? win : [g],
        goal: g,
      });
    }
    return out;
  };

  /** 原因別の内訳（主な原因ごとの点数／関係した原因ごとの点数） */
  GL.summary = (items) => {
    const total = items.reduce((a, it) => a + it.pts, 0);
    const primary = {};
    const involved = {};
    GL.CAUSES.forEach((c) => {
      primary[c.id] = { id: c.id, pts: 0, n: 0 };
      involved[c.id] = { id: c.id, pts: 0, n: 0 };
    });
    items.forEach((it) => {
      primary[it.primary].pts += it.pts;
      primary[it.primary].n++;
      it.causes.forEach((c) => {
        involved[c].pts += it.pts;
        involved[c].n++;
      });
    });
    const byPrimary = GL.CAUSES.map((c) => primary[c.id]).filter((x) => x.n > 0);
    const scorerMap = {};
    items.forEach((it) => it.scorers.forEach((s) => (scorerMap[s.num] = (scorerMap[s.num] || 0) + s.pts)));
    const scorers = Object.keys(scorerMap)
      .map((n) => ({ num: +n, pts: scorerMap[n] }))
      .sort((a, b) => b.pts - a.pts);
    const setN = items.filter((it) => it.causes.some((c) => GL.SET_CAUSES.includes(c))).length;
    return { total, n: items.length, byPrimary, involved, scorers, setN, setShare: items.length ? setN / items.length : 0 };
  };
})();
