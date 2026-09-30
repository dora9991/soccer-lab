/* サッカー分析ラボ - 「ショット」タブ（ショットマップ） */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;
  const ST = SL.stats;
  const X = SL.xg;
  const esc = U.esc;
  const pct = ST.fmtPct;

  const vs = { team: 'H', num: 'all', res: 'all', q: 0, mode: 'both', metric: 'shots' };
  const SHOTS = C.SHOT_TYPES;

  /** 0〜1 を色にする（低い=青緑 / 高い=黄〜赤） */
  function heat(v) {
    const stops = [
      [0, [70, 130, 200]],
      [0.5, [240, 190, 70]],
      [1, [235, 80, 70]],
    ];
    const x = Math.max(0, Math.min(1, v));
    const a = x < 0.5 ? stops[0] : stops[1];
    const b = x < 0.5 ? stops[1] : stops[2];
    const k = (x - a[0]) / (b[0] - a[0]);
    const c = a[1].map((n, i) => Math.round(n + (b[1][i] - n) * k));
    return `rgba(${c[0]},${c[1]},${c[2]},${(0.28 + 0.4 * x).toFixed(2)})`;
  }

  function render(root) {
    const st = SL.store.state;
    const S = ST.compute(st);
    const inScope = (e) => C.isShot(e) && e.team === vs.team && (vs.num === 'all' || e.num === +vs.num) && (!vs.q || D.periodAt(st.periods, e.t) === vs.q);
    const base = S.events.filter(inScope);
    const zt = ST.zoneTable(base);
    const resOk = (e) => {
      if (vs.res === 'goal') return D.isGoal(e);
      if (vs.res === 'sot') return e.type === 'sot';
      if (vs.res === 'miss') return e.type === 'soff' || e.type === 'sblk' || e.type === 'pkx';
      return true;
    };
    const metricOf = (r) => (vs.metric === 'xg' ? r.xg : vs.metric === 'goals' ? r.goals : r.shots);
    const mx = Math.max(0.0001, ...C.ZONES.map((z) => metricOf(zt.rows[z.id])));
    const fills = {};
    const labels = {};
    C.ZONES.forEach((z) => {
      const r = zt.rows[z.id];
      if (r.shots > 0 && (vs.mode === 'zone' || vs.mode === 'both')) {
        fills[z.id] = heat(metricOf(r) / mx);
        labels[z.id] = [`${r.shots}本`, `${r.goals}点 xG${r.xg.toFixed(1)}`];
      }
    });
    const dots =
      vs.mode === 'zone'
        ? []
        : base
            .filter((e) => e.px != null && resOk(e))
            .map((e) => {
              const pos = C.shotPos(e);
              return { sx: pos.sx, sy: pos.sy, goal: D.isGoal(e), on: C.isOnTarget(e), blk: e.type === 'sblk', xg: X.of(e), color: st.teams[vs.team].color, tip: esc(`${D.minuteLabel(st, e.t)} ${SL.store.playerLabel(e.team, e.num)} ${C.EVENTS[e.type].label.replace(/（.*）/, '')} xG ${X.of(e).toFixed(2)}`) };
            });
    const svg = SL.pitch.half({ cls: 'pitch-svg half shotchart', fills, labels: vs.mode === 'dots' ? null : labels, dots });

    const roster = st.teams[vs.team].roster;
    const playerOpts = ['<option value="all">全員</option>'].concat(roster.map((p) => `<option value="${p.num}" ${String(vs.num) === String(p.num) ? 'selected' : ''}>#${p.num} ${esc(p.name)}</option>`)).join('');
    const qs = ['<option value="0">全体</option>'].concat(S.halves.map((r) => `<option value="${r.q}" ${vs.q === r.q ? 'selected' : ''}>${D.qLabel(r.q)}</option>`)).join('');

    const g = zt.groups;
    const T = zt.total;
    let insight = '';
    if (zt.located >= 4) {
      const box = g.box;
      const far = g.far;
      insight = `<div class="callout">位置あり ${zt.located}本のうち、ペナルティエリア内 <b>${pct(box.share, 0)}</b>（xG/本 ${box.xgShot == null ? '—' : box.xgShot.toFixed(2)}）／ロングシュート <b>${pct(far.share, 0)}</b>（xG/本 ${far.xgShot == null ? '—' : far.xgShot.toFixed(2)}）。${vs.team === 'H' ? '' : '相手の場合は「守備で打たせている場所」です。'}</div>`;
    }
    const groupRows = C.ZONE_GROUPS.map((gr) => {
      const r = g[gr.id];
      return `<tr class="grp"><td class="l"><b>${esc(gr.label)}</b></td><td class="num">${r.shots}</td><td class="num">${r.sot}</td><td class="num">${r.goals}</td><td class="num">${r.xg.toFixed(2)}</td><td class="num"><b>${r.xgShot == null ? '—' : r.xgShot.toFixed(2)}</b></td><td class="num">${pct(r.share, 0)}</td></tr>`;
    }).join('');
    const zoneRows = C.ZONES.map((z) => zt.rows[z.id])
      .filter((r) => r.shots > 0)
      .sort((a, b) => b.shots - a.shots)
      .map((r) => `<tr><td class="l"><span class="swatch" style="background:${heat(metricOf(r) / mx)}"></span>${esc(C.zoneLabel(r.zone))}</td><td class="num">${r.shots}</td><td class="num">${r.sot}</td><td class="num">${r.goals}</td><td class="num">${r.xg.toFixed(2)}</td><td class="num">${r.xgShot.toFixed(2)}</td><td class="act"><button class="ricon" data-act="zonehl" data-zone="${r.zone}" title="このゾーンのシュートを見る">▶</button></td></tr>`)
      .join('');
    const unknown = zt.rows.unknown.shots;
    const tot = T ? `<p class="dim tiny">合計 ${T}本・ゴール ${base.filter(D.isGoal).length}点・xG ${base.reduce((a, e) => a + X.of(e), 0).toFixed(2)}。</p>` : '';

    root.innerHTML = `
      <div class="pane-head">
        <div class="seggroup">${['H', 'A'].map((t) => `<button class="seg team ${vs.team === t ? 'on' : ''}" data-act="team" data-team="${t}" style="--tc:${st.teams[t].color}">${esc(st.teams[t].name)}${t === 'A' ? '（被シュート）' : ''}</button>`).join('')}</div>
        <label class="inl">選手 <select data-act="num">${playerOpts}</select></label>
        <label class="inl">区間 <select data-act="q">${qs}</select></label>
        <div class="seggroup">${[['zone', 'ゾーン'], ['dots', '点'], ['both', '両方']].map(([k, l]) => `<button class="seg ${vs.mode === k ? 'on' : ''}" data-act="mode" data-mode="${k}">${l}</button>`).join('')}</div>
        <div class="seggroup" title="ゾーンの色の基準">${[['shots', '本数'], ['xg', 'xG'], ['goals', '得点']].map(([k, l]) => `<button class="seg ${vs.metric === k ? 'on' : ''}" data-act="metric" data-metric="${k}">${l}</button>`).join('')}</div>
        <div class="seggroup" title="点表示の絞り込み">${[['all', 'すべて'], ['goal', 'ゴール'], ['sot', '枠内'], ['miss', '枠外・ブロック']].map(([k, l]) => `<button class="seg ${vs.res === k ? 'on' : ''}" data-act="res" data-res="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="shot-layout">
        <div class="shot-court">${svg}
          <div class="legend"><span>色：${vs.metric === 'xg' ? 'xGの合計' : vs.metric === 'goals' ? '得点' : 'シュート本数'}</span><i class="grad heatgrad"></i><span class="lg">少</span><span class="lg">多</span></div>
          <div class="dim tiny dotlegend"><i class="dl goal"></i>ゴール <i class="dl on"></i>枠内 <i class="dl off"></i>枠外 <i class="dl blk"></i>ブロック　大きさ＝xG（決まりやすさ）。ゴールは上。位置を記録していないシュートは点に出ません。</div>
        </div>
        <div class="shot-side">
          ${insight}
          <div class="box-wrap"><table class="tbl zt"><thead><tr><th class="l">エリア</th><th>本数</th><th>枠内</th><th>ゴール</th><th>xG</th><th title="1本あたりのxG">xG/本</th><th>割合</th></tr></thead><tbody>${groupRows}</tbody></table></div>
          ${zoneRows ? `<div class="box-wrap"><table class="tbl zt"><thead><tr><th class="l">ゾーン別</th><th>本数</th><th>枠内</th><th>ゴール</th><th>xG</th><th>xG/本</th><th></th></tr></thead><tbody>${zoneRows}</tbody></table></div>` : '<div class="empty-note">シュートのタグと位置（ピッチ図のクリック）が付くと、ここにゾーン別の表が出ます。</div>'}
          ${unknown ? `<p class="dim tiny">位置が未入力のシュート：${unknown}本（ゾーン別の表には含まれず、xGは平均値で概算しています）。タグ付け時にピッチ図をクリックすると入ります。</p>` : ''}
          ${tot}
          <div class="note-card"><b>プロの見方</b><p>プロの分析では、ショットマップ（撃った位置と結果）とxG（ゴール期待値）を並べて、「良い位置で撃てているか」「決め切れているか」を確認します。ペナルティエリア内の中央・ゴールエリア付近が最も決まりやすく、遠目やサイドの浅い角度からのシュートは1本あたりの期待値が低くなります。</p></div>
        </div>
      </div>`;
  }

  SL.ui.register({
    id: 'shots',
    label: 'ショット',
    icon: '⚽',
    init(root) {
      root.addEventListener('click', (e) => {
        const z = e.target.closest('[data-zone]');
        const b = e.target.closest('[data-act]');
        if (z && z.closest('svg.shotchart')) {
          const st = SL.store.state;
          SL.hl.open({ team: vs.team, zone: z.dataset.zone, types: SHOTS, num: vs.num === 'all' ? undefined : +vs.num, q: vs.q || undefined }, `${st.teams[vs.team].name} ${C.zoneLabel(z.dataset.zone)}のシュート`);
          return;
        }
        if (!b) return;
        const d = b.dataset;
        if (d.act === 'team') {
          vs.team = d.team;
          vs.num = 'all';
        } else if (d.act === 'mode') vs.mode = d.mode;
        else if (d.act === 'metric') vs.metric = d.metric;
        else if (d.act === 'res') vs.res = d.res;
        else if (d.act === 'zonehl') {
          const st = SL.store.state;
          SL.hl.open({ team: vs.team, zone: d.zone, types: SHOTS, num: vs.num === 'all' ? undefined : +vs.num, q: vs.q || undefined }, `${st.teams[vs.team].name} ${C.zoneLabel(d.zone)}のシュート`);
          return;
        } else return;
        SL.ui.renderActive(true);
      });
      root.addEventListener('change', (e) => {
        const s = e.target.closest('select[data-act]');
        if (!s) return;
        if (s.dataset.act === 'num') vs.num = s.value;
        if (s.dataset.act === 'q') vs.q = +s.value;
        SL.ui.renderActive(true);
      });
    },
    render,
  });
})();
