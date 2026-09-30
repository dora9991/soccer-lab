/* サッカー分析ラボ - 「アドバイス」タブ */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const esc = U.esc;

  let registry = [];

  function evid(list) {
    if (!list || !list.length) return '';
    return `<div class="evid">${list.map((e) => `<span class="ev"><em>${esc(e.label)}</em><b>${esc(e.value)}</b></span>`).join('')}</div>`;
  }
  function clipBtns(ins) {
    if (!ins.clips || !ins.clips.length) return '';
    return `<div class="clips">${ins.clips
      .map((c) => {
        registry.push(c);
        return `<button class="btn sm clipbtn" data-act="clip" data-i="${registry.length - 1}">▶ ${esc(c.label)}</button>`;
      })
      .join('')}</div>`;
  }
  function drillTags(ins) {
    if (!ins.drills || !ins.drills.length) return '';
    return `<div class="dtags">${ins.drills
      .filter((d, i, a) => a.indexOf(d) === i)
      .map((d) => `<span class="dtag" title="${esc(SL.advice.DRILLS[d].how)}">🏋 ${esc(SL.advice.DRILLS[d].title)}</span>`)
      .join('')}</div>`;
  }
  function card(ins) {
    const icon = ins.kind === 'good' ? '🔥' : ins.kind === 'bad' ? '⚠' : ins.kind === 'warn' ? '🔎' : 'ℹ';
    return `<article class="acard ${ins.kind}"><h5><span class="ai">${icon}</span>${esc(ins.title)}</h5><p>${esc(ins.body)}</p>${evid(ins.evidence)}${clipBtns(ins)}${drillTags(ins)}</article>`;
  }

  function render(root) {
    registry = [];
    const st = SL.store.state;
    const S = SL.stats.compute(st);
    const R = SL.advice.generate(st, S);
    const sum = R.summary;
    const levelOpts = Object.entries(C.LEVELS).map(([k, v]) => `<option value="${k}" ${st.cfg.level === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
    const factors = sum.factors.length
      ? `<div class="fchips2">${sum.factors
          .map((f) => `<span class="fchip ${f.verdict}" title="${esc(f.label)}：${esc(f.fmt(f.h))} 対 ${esc(f.fmt(f.o))}"><em>${esc(f.label.replace(/（.*）/, ''))}</em><b>${f.verdict === 'good' ? '優勢' : f.verdict === 'bad' ? '劣勢' : f.verdict === 'even' ? '互角' : '—'}</b></span>`)
          .join('')}</div>`
      : '';
    const q = R.quality;
    const quality = `<details class="qual" ${q.done < q.total ? 'open' : ''}><summary>データの充実度 <b>${q.done} / ${q.total}</b> <span class="dim">— タグを足すほど分析が増えます</span></summary>
      <ul>${q.items.map((i) => `<li class="${i.ok ? 'ok' : 'ng'}"><b>${i.ok ? '✔' : '＋'} ${esc(i.label)}</b>${i.ok ? '' : `<span class="dim"> ${esc(i.hint.replace('<V>', 'V'))}</span>`}</li>`).join('')}</ul></details>`;

    const empty = !S.events.length;
    root.innerHTML = `
      <div class="pane-head">
        <h3 class="ph">コーチからのアドバイス</h3>
        <span class="grow"></span>
        <label class="inl">目安のレベル <select data-act="level">${levelOpts}</select></label>
      </div>
      ${empty ? '<div class="card info">タグが付くと、数字から原因と練習メニューを自動で提案します。「サンプル試合」で見え方を確認できます。</div>' : ''}
      <article class="card summary ${sum.result || ''}">
        <div class="sum-head">${esc(sum.headline)}</div>
        ${sum.bullets.length ? `<ul class="sum-list">${sum.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        ${factors}
      </article>
      ${quality}
      <div class="advice-cols">
        <section class="acol"><h4 class="col-title good">🔥 伸ばしたい強み <em>${R.strengths.length}</em></h4>${R.strengths.length ? R.strengths.map(card).join('') : '<div class="empty-note">十分なデータがたまると、強みが出ます。</div>'}</section>
        <section class="acol"><h4 class="col-title bad">🛠 改善したいポイント <em>${R.issues.length}</em></h4>${R.issues.length ? R.issues.map(card).join('') : '<div class="empty-note">大きな課題は見つかりませんでした。</div>'}</section>
      </div>
      ${R.players.length ? `<section class="sect"><h4>選手ごとのポイント</h4><div class="pgrid">${R.players.map(card).join('')}</div></section>` : ''}
      ${R.plan.length ? `<section class="sect plan"><h4>🏋 次の練習メニュー（改善点から自動で選んでいます）</h4><ol class="drills">${R.plan.map((d) => `<li><b>${esc(d.title)}</b><span>${esc(d.how)}</span></li>`).join('')}</ol></section>` : ''}
      <p class="dim tiny foot">※ xG（ゴール期待値）は位置・角度・攻撃の型から概算した簡易モデルです。目安の数値は一般的な傾向をもとにした参考値です（レベル：${esc(R.bench.name)}）。サンプルが少ない場合は断定せず、必ず映像で確認してください。「▶」ボタンで該当シーンを再生できます。</p>`;
  }

  SL.ui.register({
    id: 'advice',
    label: 'アドバイス',
    icon: '💡',
    init(root) {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act="clip"]');
        if (!b) return;
        const c = registry[+b.dataset.i];
        if (c) SL.hl.open(c.filter, c.label);
      });
      root.addEventListener('change', (e) => {
        const s = e.target.closest('select[data-act="level"]');
        if (!s) return;
        SL.store.patch((state) => (state.cfg.level = s.value), 'meta');
      });
    },
    render,
  });
})();
