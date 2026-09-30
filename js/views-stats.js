/* サッカー分析ラボ - 「集計」「場面別」タブ */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;
  const ST = SL.stats;
  const GL = SL.goals;
  const esc = U.esc;
  const pct = ST.fmtPct;
  const num = ST.fmtNum;
  const SHOTS = C.SHOT_TYPES;

  const vs = { team: 'H', q: 0, sort: 'num', dir: 1 };
  const vsc = { team: 'H' };

  const HELP = {
    xg: 'xG（ゴール期待値）＝ そのシュートが決まる確率を、位置（距離・角度）とヘディング・攻撃の型から概算した値。合計すると「そのチームが取れるはずだった得点」の目安になります。',
    xa: 'xA ＝ アシスト／キーパスの相手が打ったシュートの xG の合計。パスの質を見る指標です。',
    big: '決定機 ＝ xG が 0.3 以上のシュート（PKを除く）。決めるべきチャンスの数です。',
    conv: 'シュート決定率 ＝ ゴール ÷ シュート。プロの目安は約10%。',
    acc: '枠内率 ＝ 枠内シュート ÷ シュート。',
    gxg: 'ゴール − xG。プラスなら期待以上に決めた（または相手GKが不調）、マイナスなら決め切れていない。',
    ga: 'G+A ＝ ゴール＋アシスト。',
    lost: 'ボールロスト ＝ ボールを失った回数（人が付けた分のみ）。',
    fouled: '受けたファウル ＝ 相手に止められた回数。',
  };
  const tip = (k) => `<span class="q" title="${esc(HELP[k])}">?</span>`;

  function scoreHeader(S, st) {
    return `<div class="scoreline"><span class="sl-team" style="--tc:${st.teams.H.color}">${esc(st.teams.H.name)}</span><b>${S.score.H}</b><i>–</i><b>${S.score.A}</b><span class="sl-team" style="--tc:${st.teams.A.color}">${esc(st.teams.A.name)}</span></div>`;
  }

  /* ---------- 得点経過 ---------- */
  function goalsList(S, st) {
    if (!S.goals.length) return '<div class="empty-note">ゴール（Q）のタグが付くと、得点経過がここに並びます。</div>';
    const rows = S.goals
      .map((g) => {
        const t = st.teams[g.team];
        const scorerTeam = g.scorerTeam;
        const kind = g.own ? 'オウンゴール' : g.pk ? 'PK' : g.body === 'head' ? 'ヘディング' : '';
        const sc = g.own ? '' : C.sceneShort(g.scene);
        return `<button class="goal-row" data-act="goalseek" data-id="${g.id}" title="このゴールの場面へ">
          <span class="gr-clock">${esc(g.clock)}</span>
          <i class="rdot" style="background:${t.color}"></i>
          <span class="gr-main"><b>${esc(SL.store.playerLabel(scorerTeam, g.scorer) || t.name)}</b>${g.assister != null ? `<small>アシスト ${esc(SL.store.playerLabel(g.team, g.assister))}</small>` : ''}</span>
          <span class="gr-tags">${kind ? `<span class="chip">${esc(kind)}</span>` : ''}${sc && !g.pk ? `<span class="chip alt">${esc(sc)}</span>` : ''}${g.xg != null ? `<span class="chip dimchip">xG ${g.xg.toFixed(2)}</span>` : ''}</span>
        </button>`;
      })
      .join('');
    return `<div class="goal-list">${rows}</div>`;
  }

  /* ---------- チーム比較 ---------- */
  function compare(S, st) {
    const H = S.team.H;
    const A = S.team.A;
    const rows = [
      { l: 'ゴール', h: S.score.H, a: S.score.A, better: 'high', fmt: (v) => v },
      { l: 'シュート', h: H.shots, a: A.shots, better: 'high' },
      { l: '枠内シュート', h: H.sot, a: A.sot, better: 'high' },
      { l: 'xG（ゴール期待値）', h: H.xg, a: A.xg, better: 'high', fmt: (v) => v.toFixed(2), help: 'xg' },
      { l: '決定機（xG 0.3以上）', h: H.big, a: A.big, better: 'high', help: 'big' },
      { l: 'コーナーキック', h: H.ck, a: A.ck, better: 'high' },
      { l: 'キーパス＋アシスト', h: H.kp + H.ast, a: A.kp + A.ast, better: 'high' },
      { l: 'タックル＋インターセプト', h: H.tkl + H.itc, a: A.tkl + A.itc, better: 'high' },
      { l: 'ボールロスト', h: H.tov, a: A.tov, better: 'low', help: 'lost' },
      { l: 'ファウル', h: H.foul, a: A.foul, better: 'low' },
      { l: 'イエローカード', h: H.yc, a: A.yc, better: 'low' },
      { l: 'レッドカード', h: H.rc, a: A.rc, better: 'low' },
      { l: 'オフサイド', h: H.off, a: A.off, better: 'low' },
      { l: 'GKのセーブ', h: H.saves, a: A.saves, better: 'high' },
    ];
    const poss = SL.store.state.cfg.possH;
    if (poss != null) rows.splice(1, 0, { l: 'ボール支配率（入力値）', h: poss, a: 100 - poss, better: 'high', fmt: (v) => v + '%' });
    return `<div class="cmp">${rows
      .map((r) => {
        const fmt = r.fmt || ((v) => String(v));
        const mx = Math.max(r.h, r.a, 0.0001);
        let cls = '';
        if (r.h !== r.a) {
          const hBetter = r.better === 'high' ? r.h > r.a : r.h < r.a;
          cls = hBetter ? 'h-win' : 'a-win';
        }
        return `<div class="cmp-row ${cls}">
          <div class="cmp-v l"><b>${fmt(r.h)}</b></div>
          <div class="cmp-bar l"><i style="width:${((r.h / mx) * 100).toFixed(0)}%;background:${st.teams.H.color}"></i></div>
          <div class="cmp-c">${esc(r.l)}${r.help ? ' ' + tip(r.help) : ''}</div>
          <div class="cmp-bar r"><i style="width:${((r.a / mx) * 100).toFixed(0)}%;background:${st.teams.A.color}"></i></div>
          <div class="cmp-v r"><b>${fmt(r.a)}</b></div>
        </div>`;
      })
      .join('')}<p class="dim tiny">左が ${esc(st.teams.H.name)}、右が ${esc(st.teams.A.name)}。緑の数字がその項目で優勢（ボールロスト・ファウル・カード・オフサイドは少ない方が優勢）です。xG は位置未入力のシュートを平均値で概算しています。</p></div>`;
  }

  /* ---------- 個人成績 ---------- */
  function playerTable(S, st, team) {
    const lines = S.players[team];
    const tot = S.team[team];
    const cols = [
      ['pos', '位置', (p) => esc(p.pos || ''), (p) => (p.pos === 'GK' ? 0 : p.pos === 'DF' ? 1 : p.pos === 'MF' ? 2 : p.pos === 'FW' ? 3 : 4), 'txt'],
      ['goals', 'G', (p) => p.goals],
      ['ast', 'A', (p) => p.ast],
      ['shots', 'SH', (p) => p.shots],
      ['sot', '枠内', (p) => p.sot],
      ['xg', 'xG', (p) => num(p.xg, 2), (p) => p.xg],
      ['xa', 'xA', (p) => num(p.xa, 2), (p) => p.xa],
      ['kp', 'KP', (p) => p.kp],
      ['tkl', 'TKL', (p) => p.tkl],
      ['itc', 'INT', (p) => p.itc],
      ['clr', 'CLR', (p) => p.clr],
      ['tov', 'LOST', (p) => p.tov],
      ['foul', 'FOUL', (p) => p.foul],
      ['fouled', '被F', (p) => p.fouled],
      ['yc', 'Y', (p) => p.yc],
      ['rc', 'R', (p) => p.rc],
      ['off', 'OFF', (p) => p.off],
    ];
    const sortCol = cols.find((c) => c[0] === vs.sort);
    const rows = lines
      .filter((p) => p.num !== 0)
      .slice()
      .sort((a, b) => {
        if (vs.sort === 'num' || !sortCol) return a.num - b.num;
        const f = sortCol[3] || sortCol[2];
        const va = f(a);
        const vb = f(b);
        return sortCol[4] === 'txt' ? (va - vb) * vs.dir : (vb - va) * vs.dir || a.num - b.num;
      });
    const teamLine = lines.find((p) => p.num === 0);
    const tops = {};
    ['goals', 'ast', 'shots', 'sot', 'xg', 'xa', 'kp', 'tkl', 'itc', 'clr'].forEach((k) => {
      const m = Math.max(0, ...rows.map((p) => p[k]));
      if (m > 0) tops[k] = m;
    });
    const th = cols.map((c) => `<th class="${c[0] === vs.sort ? 'sorted' : ''}" data-act="sort" data-key="${c[0]}" title="クリックで並べ替え">${c[1]}${c[0] === vs.sort ? '▾' : ''}</th>`).join('');
    const body = rows
      .map((p) => {
        const name = SL.store.playerName(team, p.num);
        const tds = cols
          .map((c) => {
            const key = c[0];
            const cls = ['num', 'tdnum'];
            if (tops[key] && p[key] === tops[key]) cls.push('top');
            const warnAt = { foul: 3, tov: 4, rc: 1 };
            if (warnAt[key] && p[key] >= warnAt[key]) cls.push('warn');
            return `<td class="${cls.join(' ')}">${c[2](p) === 0 && key !== 'goals' ? '<span class="zero">0</span>' : c[2](p)}</td>`;
          })
          .join('');
        return `<tr class="${p.isGK ? 'gkrow' : ''}"><td class="pnum"><b>${p.num}</b></td><td class="pname">${esc(name)}</td>${tds}<td class="act"><button class="ricon" data-act="hlplayer" data-num="${p.num}" title="${esc(SL.store.playerLabel(team, p.num))} のハイライトを見る">▶</button></td></tr>`;
      })
      .join('');
    const totCells = cols
      .map((c) => {
        const key = c[0];
        if (key === 'pos') return '<td></td>';
        const v = key === 'xg' || key === 'xa' ? num(tot[key], 2) : tot[key];
        return `<td class="num">${v}</td>`;
      })
      .join('');
    const teamRow = teamLine
      ? `<tr class="teamrow"><td class="pnum">—</td><td class="pname">チーム（個人に付かないタグ）</td><td></td><td class="num">${teamLine.goals}</td><td></td><td class="num">${teamLine.shots}</td>${'<td></td>'.repeat(cols.length - 4)}<td></td></tr>`
      : '';
    return `<div class="box-wrap"><table class="tbl box"><thead><tr><th class="${vs.sort === 'num' ? 'sorted' : ''}" data-act="sort" data-key="num" title="背番号順">#</th><th class="l">選手</th>${th}<th></th></tr></thead><tbody>${body}${teamRow}<tr class="totrow"><td class="pnum">計</td><td class="pname">${esc(st.teams[team].name)}</td>${totCells}<td></td></tr></tbody></table></div>`;
  }

  function gkBox(S, st, team) {
    const g = S.players[team].find((p) => p.isGK);
    if (!g || (!g.faced && !g.saves)) return '';
    return `<div class="gkbox"><b>🧤 GK ${esc(SL.store.playerLabel(team, g.num))}</b>
      <span>セーブ <b>${g.saves}</b> / 被枠内シュート <b>${g.faced}</b></span>
      <span>失点 <b>${g.ga}</b></span>
      <span>セーブ率 <b>${pct(g.savePct, 0)}</b></span>
      <span class="dim tiny">相手の枠内シュートから自動で数えています</span></div>`;
  }

  /* ---------- xG の推移 ---------- */
  function xgChart(S, st) {
    const tl = S.xgTl;
    if (tl.length < 2) return '<div class="empty-note">シュートのタグが付くと、xGの推移グラフが出ます。</div>';
    const dur = Math.max(SL.player.duration || 0, tl[tl.length - 1].t + 10);
    const W = 640;
    const H = 170;
    const padL = 34;
    const padR = 10;
    const padT = 12;
    const padB = 20;
    const maxV = Math.max(1, Math.ceil(Math.max(...tl.map((p) => Math.max(p.H, p.A))) * 2) / 2);
    const X = (t) => padL + (t / dur) * (W - padL - padR);
    const Y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
    const line = (k) => {
      let d = `M ${X(0).toFixed(1)} ${Y(0).toFixed(1)}`;
      let last = 0;
      for (const p of tl.slice(1)) {
        d += ` L ${X(p.t).toFixed(1)} ${Y(last).toFixed(1)} L ${X(p.t).toFixed(1)} ${Y(p[k]).toFixed(1)}`;
        last = p[k];
      }
      d += ` L ${X(dur).toFixed(1)} ${Y(last).toFixed(1)}`;
      return d;
    };
    const ticks = [];
    for (let v = 0; v <= maxV + 1e-6; v += maxV > 3 ? 1 : 0.5) ticks.push(v);
    const grid = ticks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="xgrid"/><text x="${padL - 4}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" class="fax">${v}</text>`).join('');
    const halfLines = st.periods
      .filter((p) => p.q > 1)
      .map((p) => `<line x1="${X(p.start).toFixed(1)}" x2="${X(p.start).toFixed(1)}" y1="${padT}" y2="${H - padB}" class="fq"/><text x="${(X(p.start) + 3).toFixed(1)}" y="${padT + 9}" class="fqt">${D.qLabel(p.q)}</text>`)
      .join('');
    const goals = tl
      .filter((p) => p.goal)
      .map((p) => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p[p.team]).toFixed(1)}" r="4.6" fill="${st.teams[p.team].color}" class="xgoal"><title>${esc(D.minuteLabel(st, p.t))} ゴール（xG ${p.xg.toFixed(2)}）</title></circle>`)
      .join('');
    const last = tl[tl.length - 1];
    return `<svg class="flow-svg xg-svg" viewBox="0 0 ${W} ${H}" data-dur="${dur}" data-pad="${padL},${padR}" role="img" aria-label="xGの推移">
      ${grid}${halfLines}
      <path d="${line('H')}" fill="none" stroke="${st.teams.H.color}" stroke-width="2.4"/>
      <path d="${line('A')}" fill="none" stroke="${st.teams.A.color}" stroke-width="2.4"/>
      ${goals}
      <text x="${W - padR}" y="${(Y(last.H) - 5).toFixed(1)}" text-anchor="end" class="xgl" fill="${st.teams.H.color}">${esc(st.teams.H.name)} ${last.H.toFixed(2)}</text>
      <text x="${W - padR}" y="${(Y(last.A) + 13).toFixed(1)}" text-anchor="end" class="xgl" fill="${st.teams.A.color}">${esc(st.teams.A.name)} ${last.A.toFixed(2)}</text>
      <line class="fplay" x1="0" x2="0" y1="${padT}" y2="${H - padB}"/>
    </svg><p class="dim tiny">線は「その時点までに積み上がったxG」。●はゴール。グラフをクリックすると、その時点の映像へ移動します。線がゴールより上にあるほど「決め切れていない」、下なら「期待以上に決めた」ことになります。</p>`;
  }

  function halvesTable(S, st) {
    if (S.halves.length < 1 || !S.meta.periodsSet) return '<div class="empty-note">設定タブで後半の開始位置を入れると、前半と後半の比較が出ます。</div>';
    const rows = S.halves
      .map((r) => {
        const cell = (a) => `${a.gf == null ? a.goals : a.gf}<small>${a.shots}本 / xG ${a.xg.toFixed(1)}</small>`;
        return `<tr><td class="l"><b>${esc(D.qLabel(r.q))}</b></td><td class="num">${cell(r.H)}</td><td class="num">${cell(r.A)}</td><td class="num">${r.H.foul}<small>相手 ${r.A.foul}</small></td><td class="num">${r.H.tov}<small>相手 ${r.A.tov}</small></td></tr>`;
      })
      .join('');
    return `<div class="box-wrap"><table class="tbl qtbl"><thead><tr><th class="l"></th><th>${esc(st.teams.H.name)}<small>得点</small></th><th>${esc(st.teams.A.name)}<small>得点</small></th><th>ファウル<small>自</small></th><th>ロスト<small>自</small></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function assistMatrix(S, st, team) {
    const pairs = S.assists[team].pairs;
    const keys = Object.keys(pairs);
    if (!keys.length) return '<div class="empty-note">ゴールの後にラストパスの背番号を入力すると、「誰から誰へ」の組み合わせが出ます。</div>';
    const givers = [...new Set(keys.map((k) => +k.split('>')[0]))].sort((a, b) => a - b);
    const takers = [...new Set(keys.map((k) => +k.split('>')[1]))].sort((a, b) => a - b);
    const mx = Math.max(...keys.map((k) => pairs[k]));
    const head = takers.map((n) => `<th>${n}<small>${esc(SL.store.playerName(team, n))}</small></th>`).join('');
    const rows = givers
      .map((g) => `<tr><th class="l">${g} ${esc(SL.store.playerName(team, g))}</th>${takers.map((t) => { const v = pairs[g + '>' + t] || 0; return `<td class="num" style="${v ? `background:rgba(90,209,255,${(0.15 + (0.5 * v) / mx).toFixed(2)})` : ''}">${v || ''}</td>`; }).join('')}</tr>`)
      .join('');
    return `<div class="box-wrap"><table class="tbl matrix"><thead><tr><th class="l">パスを出す↓／決める→</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderStats(root) {
    const st = SL.store.state;
    const S = ST.compute(st, { q: vs.q || null });
    const all = ST.compute(st);
    const team = vs.team;
    const qBtns = ['<button class="seg ' + (!vs.q ? 'on' : '') + '" data-act="q" data-q="0">全体</button>'].concat(all.halves.map((r) => `<button class="seg ${vs.q === r.q ? 'on' : ''}" data-act="q" data-q="${r.q}">${D.qLabel(r.q)}</button>`)).join('');
    const empty = !all.events.length;
    root.innerHTML = `
      <div class="pane-head">${scoreHeader(all, st)}
        <div class="seggroup">${['H', 'A'].map((t) => `<button class="seg team ${team === t ? 'on' : ''}" data-act="steam" data-team="${t}" style="--tc:${st.teams[t].color}">${esc(st.teams[t].name)}</button>`).join('')}</div>
        <div class="seggroup">${qBtns}</div>
        <span class="grow"></span>
        <button class="btn sm" data-act="csv">CSV書き出し</button>
      </div>
      ${empty ? '<div class="card info">まだタグがありません。「タグ付け」タブで付けるか、「サンプル試合」を開いて集計の見え方を確認できます。</div>' : ''}
      <div class="sect"><h4>得点経過 <span class="dim">（クリックでその場面へ）</span></h4>${goalsList(all, st)}</div>
      <div class="sect"><h4>チーム比較${vs.q ? ' <span class="dim">— ' + D.qLabel(vs.q) + '</span>' : ''}</h4>${compare(S, st)}</div>
      <div class="sect"><h4>個人成績 <span class="dim">（見出しをクリックで並べ替え${vs.q ? '・' + D.qLabel(vs.q) : ''}）</span></h4>${playerTable(S, st, team)}${gkBox(S, st, team)}
        <p class="dim tiny">G=ゴール A=アシスト SH=シュート 枠内=枠内シュート xG=ゴール期待値 xA=アシストの期待値 KP=キーパス TKL=タックル INT=インターセプト CLR=クリア LOST=ボールロスト FOUL=ファウル 被F=受けたファウル Y/R=カード OFF=オフサイド</p></div>
      <div class="sect"><h4>xGの推移 <span class="dim">（チャンスの質と量の積み上がり）</span></h4>${xgChart(all, st)}</div>
      <div class="sect"><h4>前半・後半別</h4>${halvesTable(all, st)}</div>
      <div class="sect"><h4>アシストのつながり（${esc(st.teams[team].name)}）</h4>${assistMatrix(all, st, team)}</div>`;
  }

  function csvBox() {
    const st = SL.store.state;
    const S = ST.compute(st);
    const head = ['チーム', '背番号', '名前', '位置', 'ゴール', 'アシスト', 'シュート', '枠内', 'xG', 'xA', 'キーパス', 'タックル', 'インターセプト', 'クリア', 'ロスト', 'ファウル', '受けたファウル', 'イエロー', 'レッド', 'オフサイド', 'セーブ'];
    const rows = [head];
    for (const t of ['H', 'A']) {
      for (const p of S.players[t]) {
        rows.push([st.teams[t].name, p.num, SL.store.playerName(t, p.num), p.pos || '', p.goals, p.ast, p.shots, p.sot, p.xg.toFixed(2), p.xa.toFixed(2), p.kp, p.tkl, p.itc, p.clr, p.tov, p.foul, p.fouled, p.yc, p.rc, p.off, p.saves]);
      }
    }
    return '﻿' + rows.map((r) => r.map(U.csvCell).join(',')).join('\r\n');
  }

  SL.ui.register({
    id: 'stats',
    label: '集計',
    icon: '📊',
    init(root) {
      root.addEventListener('click', (e) => {
        const svg = e.target.closest('.xg-svg');
        if (svg) {
          const r = svg.getBoundingClientRect();
          const vb = svg.viewBox.baseVal;
          const [pl, pr] = svg.dataset.pad.split(',').map(Number);
          const x = ((e.clientX - r.left) / r.width) * vb.width;
          const t = ((x - pl) / (vb.width - pl - pr)) * +svg.dataset.dur;
          SL.ui.userSeek();
          SL.player.seek(U.clamp(t, 0, SL.player.duration || t));
          return;
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        switch (b.dataset.act) {
          case 'steam':
            vs.team = b.dataset.team;
            break;
          case 'q':
            vs.q = +b.dataset.q;
            break;
          case 'sort':
            if (vs.sort === b.dataset.key) vs.dir = -vs.dir;
            else {
              vs.sort = b.dataset.key;
              vs.dir = 1;
            }
            break;
          case 'goalseek':
            SL.ui.selectEvent(b.dataset.id, { seek: true });
            return;
          case 'hlplayer': {
            const n = +b.dataset.num;
            SL.hl.st.presetId = 'player';
            SL.hl.st.num = n;
            SL.hl.st.filter = null;
            SL.hl.st.edits = {};
            SL.ui.setTab('hl');
            SL.hl.refresh();
            SL.hl.play(0);
            return;
          }
          case 'csv':
            U.download(csvBox(), (SL.store.state.title || 'boxscore') + '_players.csv', 'text/csv;charset=utf-8');
            return;
        }
        SL.ui.renderActive(true);
      });
      SL.player.on('time', (t) => {
        const el = root.querySelector('.fplay');
        if (!el || SL.ui.tab !== 'stats') return;
        const svg = el.ownerSVGElement;
        const [pl, pr] = svg.dataset.pad.split(',').map(Number);
        const vb = svg.viewBox.baseVal;
        const x = pl + (t / +svg.dataset.dur) * (vb.width - pl - pr);
        el.setAttribute('x1', x);
        el.setAttribute('x2', x);
      });
    },
    render: renderStats,
  });

  /* ---------- 場面別タブ ---------- */
  function breakdown(title, entries, total, labelFn, onclickAttr) {
    if (!entries.length) return '';
    const mx = Math.max(...entries.map((e) => e[1]));
    return `<div class="bd"><div class="bd-title">${title}</div>${entries
      .map(
        ([k, v]) => `<div class="bd-row"><span class="bd-l">${esc(labelFn(k))}</span><div class="bar"><i style="width:${((v / mx) * 100).toFixed(0)}%"></i></div><b>${v}</b><small>${pct(v / total, 0)}</small>${onclickAttr ? `<button class="ricon" ${onclickAttr(k)}>▶</button>` : ''}</div>`
      )
      .join('')}</div>`;
  }

  /** 得点の内訳（失点は原因、得点は型） */
  function goalsBreakdown(S, st, side) {
    const items = GL.build(st, S, { side });
    const title = side === 'against' ? `失点の原因 <span class="dim">— ${esc(st.teams.H.name)}が決められた ${items.length}点</span>` : `得点の型 <span class="dim">— ${esc(st.teams.H.name)}が決めた ${items.length}点</span>`;
    if (!items.length) {
      return `<div class="gb"><h5>${title}</h5><div class="empty-note">${side === 'against' ? '相手のゴールのタグがまだありません（V で相手に切り替え → Q）。' : 'ゴールのタグがまだありません。'}</div></div>`;
    }
    const sm = GL.summary(items);
    const rows = sm.byPrimary
      .map((b) => {
        const c = GL.cause(b.id);
        return `<div class="cd-line" style="--cc:${c.color}" title="${esc(GL.causeHint(b.id, side))}"><span class="cd-l"><i></i>${esc(GL.causeLabel(b.id, side))}</span><div class="bar"><i style="width:${((b.pts / sm.total) * 100).toFixed(0)}%"></i></div><b>${b.pts}点</b><small>${pct(b.pts / sm.total, 0)}</small><button class="ricon" data-act="glcause" data-side="${side}" data-id="${b.id}" title="この場面を映像で見る">▶</button></div>`;
      })
      .join('');
    return `<div class="gb ${side}"><h5>${title}<span class="grow"></span><button class="btn sm ${side === 'against' ? 'primary' : ''}" data-act="glopen" data-side="${side}">▶ 映像で見る</button></h5><div class="cd-lines">${rows}</div>
      ${sm.setN ? `<p class="dim tiny">セットプレー（CK・FK・スローイン・PK）が絡んだ点：${sm.setN}点（${pct(sm.setShare, 0)}）</p>` : ''}</div>`;
  }

  function sceneTable(S, st, team) {
    const rows = S.scenes[team];
    if (!rows.length) return '<div class="empty-note">シュートのタグが付くと、攻撃の型ごとの効率が出ます。</div>';
    const T = S.team[team];
    const maxX = Math.max(0.3, ...rows.map((r) => r.xgShot || 0));
    const body = rows
      .map((r) => {
        const sc = C.sceneOf(r.scene);
        const cls = r.shots < 3 ? '' : r.xgShot >= 0.16 ? 'good' : r.xgShot <= 0.06 ? 'bad' : '';
        return `<tr>
          <td class="l"><b>${esc(sc.short)}</b>${sc.set ? ' <span class="chip alt">セットプレー</span>' : ''}<small>${esc(sc.hint)}</small></td>
          <td class="num">${r.shots}<small>${pct(r.freq, 0)}</small></td>
          <td class="num">${r.sot}</td>
          <td class="num"><b>${r.goals}</b></td>
          <td class="ppp ${cls}"><div class="bar"><i style="width:${(((r.xgShot || 0) / maxX) * 100).toFixed(0)}%"></i></div><b>${num(r.xgShot, 2)}</b>${r.shots < 3 ? '<small>少数</small>' : ''}</td>
          <td class="num">${num(r.xg, 2)}</td>
          <td class="num">${pct(r.conv, 0)}</td>
          <td class="act"><button class="ricon" data-act="scenehl" data-team="${team}" data-scene="${r.scene}" title="この型のシュートを見る">▶</button></td></tr>`;
      })
      .join('');
    const o = S.play[team].open;
    const s = S.play[team].set;
    return `<div class="box-wrap"><table class="tbl scenes"><thead><tr><th class="l">攻撃の型</th><th>シュート</th><th>枠内</th><th>ゴール</th><th>xG/本 ${tip('xg')}</th><th>xG合計</th><th>決定率</th><th></th></tr></thead>
      <tbody>${body}<tr class="totrow"><td class="l">全体</td><td class="num">${T.shots}</td><td class="num">${T.sot}</td><td class="num">${T.goals}</td><td class="ppp"><b>${num(T.xgShot, 2)}</b></td><td class="num">${num(T.xg, 2)}</td><td class="num">${pct(T.conv, 0)}</td><td></td></tr></tbody></table></div>
      <p class="dim tiny">緑＝1本あたりのxGが高い（質の高いチャンスを作れている）／赤＝低い。3本未満は「少数」で参考値です。流れの中：${o.shots}本・${o.goals}点／セットプレー：${s.shots}本・${s.goals}点。</p>`;
  }

  function fieldZoneName(k) {
    return k === 'unknown' ? '場所未入力' : C.fieldZoneLabel(k).replace(/（.*）/, '');
  }

  function setpTable(S, st) {
    const row = (t) => {
      const p = S.setp[t];
      return `<tr><td class="l"><i class="rdot" style="background:${st.teams[t].color}"></i><b>${esc(st.teams[t].name)}</b></td>
        <td class="num">${p.corners}</td><td class="num">${p.corner.shots}<small>${p.corner.goals}点</small></td>
        <td class="num">${p.fk.shots}<small>${p.fk.goals}点</small></td><td class="num">${p.throw.shots}<small>${p.throw.goals}点</small></td>
        <td class="num">${p.pk.goals}/${p.pk.taken}</td></tr>`;
    };
    return `<div class="box-wrap"><table class="tbl"><thead><tr><th class="l">チーム</th><th>コーナー</th><th>CKからのシュート</th><th>FKからのシュート</th><th>スローインから</th><th>PK 成功/本数</th></tr></thead><tbody>${row('H')}${row('A')}</tbody></table></div>`;
  }

  function bucketsTable(S, st) {
    const rows = S.buckets
      .map((b) => {
        const cell = (a) => `${a.goals}<small>${a.shots}本 / xG ${a.xg.toFixed(1)}</small>`;
        return `<tr><td class="l">${esc(b.label)}</td><td class="num">${cell(b.H)}</td><td class="num">${cell(b.A)}</td></tr>`;
      })
      .join('');
    return `<div class="box-wrap"><table class="tbl qtbl"><thead><tr><th class="l">時間帯</th><th>${esc(st.teams.H.name)}<small>ゴール</small></th><th>${esc(st.teams.A.name)}<small>ゴール</small></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="dim tiny">前半・後半をそれぞれ3分割しています（ゴールは得点したチーム側に数えます）。</p>`;
  }

  function renderScenes(root) {
    const st = SL.store.state;
    const S = ST.compute(st);
    const team = vsc.team;
    const tv = S.tov[team];
    const fl = S.fouls[team];
    const other = D.other(team);
    const tvTypes = Object.entries(tv.byType).sort((a, b) => b[1] - a[1]);
    const tvZones = Object.entries(tv.byZone).sort((a, b) => b[1] - a[1]);
    const tvPlayers = Object.entries(tv.byPlayer).sort((a, b) => b[1] - a[1]);
    const flPl = Object.entries(fl.byPlayer).sort((a, b) => b[1] - a[1]);
    const flHalf = Object.entries(fl.byHalf).sort((a, b) => a[0] - b[0]);
    const flZone = Object.entries(fl.byZone).sort((a, b) => b[1] - a[1]);
    const flType = Object.entries(fl.byType).sort((a, b) => b[1] - a[1]);
    const fouledPl = S.players[team].filter((p) => p.fouled > 0).sort((a, b) => b.fouled - a.fouled);
    const cards = fl.yc.concat(fl.rc).sort((a, b) => a.t - b.t);
    root.innerHTML = `
      <div class="pane-head">${scoreHeader(S, st)}
        <div class="seggroup">${[['H', '自チーム'], ['A', '相手']].map(([t, l]) => `<button class="seg team ${team === t ? 'on' : ''}" data-act="steam" data-team="${t}" style="--tc:${st.teams[t].color}">${l}のプレー</button>`).join('')}</div>
      </div>
      <div class="sect"><h4>得点と失点の内訳 <span class="dim">— 攻撃の始まりから分類</span></h4>
        <div class="gb-grid">${goalsBreakdown(S, st, 'against')}${goalsBreakdown(S, st, 'for')}</div>
        <p class="dim tiny">1つのゴールは「主な原因（型）」1つに振り分けます（優先順：PK ＞ オウンゴール ＞ CK ＞ FK ＞ スロー ＞ ボールロスト直後 ＞ カウンター ＞ クロス ＞ 縦パス ＞ ロング ＞ ミドル ＞ 個人技 ＞ 組み立て）。映像で見ると、原因がひと目で分かります。</p></div>
      <div class="sect"><h4>攻撃の型別のシュート <span class="dim">— ${esc(st.teams[team].name)}が撃った場面</span></h4>${sceneTable(S, st, team)}
        ${team === 'A' ? '<p class="dim tiny">相手の攻撃なので、これは「自チームの守備」の成績です。xG/本が高い型ほど、守りにくかった攻め方です。</p>' : ''}</div>
      <div class="sect"><h4>ボールロストの分析 <span class="dim">— ${esc(st.teams[team].name)}のロスト ${tv.total}回</span></h4>
        ${tv.total ? `<div class="bd-grid">
          ${breakdown('種類別', tvTypes, tv.total, (k) => C.tovLabel(k).replace(/（.*）/, ''), (k) => `data-act="tovhl" data-sub="${k}" data-team="${team}" title="この種類のシーンを見る"`)}
          ${breakdown('場所別', tvZones, tv.total, fieldZoneName, (k) => (k === 'unknown' ? '' : `data-act="tovzone" data-zone="${k}" data-team="${team}" title="この場所のロストを見る"`))}
          ${breakdown('選手別', tvPlayers, tv.total, (k) => (+k ? SL.store.playerLabel(team, +k) : 'チーム'), (k) => `data-act="tovplayer" data-num="${k}" data-team="${team}" title="この選手のロストを見る"`)}
        </div>
        <div class="callout ${tv.toShots ? 'bad' : ''}">ロスト直後（12秒以内）に${esc(st.teams[other].name)}が打ったシュート：<b>${tv.toShots}本</b>（うち得点 ${tv.toGoals}点）
          ${tv.toShots ? `<button class="btn sm" data-act="toallowed" data-team="${team}">▶ ロスト → ピンチの場面を見る</button>` : ''}
          <span class="dim tiny">ボールを失った直後の切り替えの質を表します。${tv.own3 ? `自陣でのロスト：${tv.own3}回。` : ''}</span></div>` : '<div class="empty-note">ボールロストのタグがありません。（Z キー）</div>'}
      </div>
      <div class="sect"><h4>ファウル・カードの分析 <span class="dim">— ${esc(st.teams[team].name)}のファウル ${fl.total}回</span></h4>
        ${fl.total ? `<div class="bd-grid">
          ${breakdown('選手別（犯した）', flPl, fl.total, (k) => SL.store.playerLabel(team, +k), (k) => `data-act="foulplayer" data-num="${k}" data-team="${team}"`)}
          ${breakdown('場所別', flZone, fl.total, fieldZoneName, (k) => (k === 'unknown' ? '' : `data-act="foulzone" data-zone="${k}" data-team="${team}"`))}
          ${breakdown('前半・後半別', flHalf.map(([q, n]) => [D.qLabel(+q), n]), fl.total, (k) => k)}
          ${breakdown('種類別', flType, fl.total, (k) => C.foulLabel(k).replace(/（.*）/, ''))}
        </div>
        <div class="callout ${fl.setShots ? 'bad' : ''}">自陣付近でのファウル：<b>${fl.own3}回</b>／ファウルの後に${esc(st.teams[other].name)}が撃ったFK・PK：<b>${fl.setShots}本</b>（うち得点 ${fl.setGoals}点）${fl.pkConceded ? `／PKを与えた：<b>${fl.pkConceded}回</b>` : ''}
          ${fl.setShots ? `<button class="btn sm" data-act="foulset" data-team="${team}">▶ ファウル → FK/PKの場面を見る</button>` : ''}</div>
        <div class="cardline">${cards.length ? cards.map((e) => `<span class="cardchip ${e.type === 'rc' ? 'red' : 'yellow'}" title="${esc(D.clockFull(st, e.t))}"><i></i>${esc(SL.store.playerLabel(team, e.num))} <small>${esc(D.minuteLabel(st, e.t))}</small></span>`).join('') : '<span class="dim">カード：なし</span>'}</div>
        ${fouledPl.length ? `<div class="bd-grid">${breakdown('受けたファウル（相手に止められた回数）', fouledPl.map((p) => [p.num, p.fouled]), fouledPl.reduce((a, p) => a + p.fouled, 0), (k) => SL.store.playerLabel(team, +k))}</div>` : ''}` : '<div class="empty-note">ファウルのタグがありません。（X キー）</div>'}
      </div>
      <div class="sect"><h4>セットプレー</h4>${setpTable(S, st)}</div>
      <div class="sect"><h4>時間帯別</h4>${bucketsTable(S, st)}</div>
      <div class="sect note-card"><h4>プロの見方：この画面の使い方</h4>
        <p><b>失点は「どう決められたか」で分類</b>します。セットプレー・ボールを失った直後・カウンター・クロス・ミドルなど、原因が違えば直す練習も違います。得点側も同じ分類で「自分たちの武器」を確認します。</p>
        <p><b>xG（ゴール期待値）</b>は、プロが「運」と「実力」を切り分けるために使う指標です。撃った位置から見た“決まりやすさ”の合計なので、結果（得点）とのずれが大きいときは、決定力か運かを疑います。</p>
        <p>相手のプレー（右上のボタン）を見ると、「自チームがどこで守れていないか」が分かります。</p></div>`;
  }

  SL.ui.register({
    id: 'scenes',
    label: '場面別',
    icon: '🎯',
    init(root) {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const d = b.dataset;
        const name = (t) => SL.store.state.teams[t].name;
        switch (d.act) {
          case 'steam':
            vsc.team = d.team;
            SL.ui.renderActive(true);
            break;
          case 'glopen':
            SL.hl.openGoals(d.side);
            break;
          case 'glcause':
            SL.hl.openGoals(d.side, d.id);
            break;
          case 'scenehl':
            SL.hl.open({ team: d.team, scene: d.scene, types: SHOTS }, `${name(d.team)}の${C.sceneShort(d.scene)}`);
            break;
          case 'tovhl':
            SL.hl.open({ team: d.team, types: ['tov'], sub: d.sub }, `${C.tovLabel(d.sub).replace(/（.*）/, '')}`);
            break;
          case 'tovzone':
            SL.hl.open({ team: d.team, types: ['tov'], fieldZones: [d.zone] }, `${C.fieldZoneShort(d.zone)}でのボールロスト`);
            break;
          case 'tovplayer':
            SL.hl.open({ team: d.team, types: ['tov'], num: +d.num }, `${SL.store.playerLabel(d.team, +d.num)}のボールロスト`);
            break;
          case 'toallowed':
            SL.hl.open({ special: 'toAllowed', team: d.team }, 'ボールロスト → ピンチ');
            break;
          case 'foulplayer':
            SL.hl.open({ team: d.team, types: ['foul', 'yc', 'rc'], num: +d.num }, `${SL.store.playerLabel(d.team, +d.num)}のファウル`);
            break;
          case 'foulzone':
            SL.hl.open({ team: d.team, types: ['foul'], fieldZones: [d.zone] }, `${C.fieldZoneShort(d.zone)}でのファウル`);
            break;
          case 'foulset':
            SL.hl.open({ special: 'foulSet', team: d.team }, 'ファウル → FK/PK');
            break;
        }
      });
    },
    render: renderScenes,
  });
})();
