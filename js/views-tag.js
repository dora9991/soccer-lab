/* サッカー分析ラボ - 「タグ付け」タブ */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;
  const esc = U.esc;
  const TG = SL.tagger;

  function pendingHtml() {
    const bits = [];
    if (TG.buf) bits.push(`<span class="pd-num">#${esc(TG.buf)}<i class="caret"></i></span>`);
    else if (TG.pending.num != null) bits.push(`<span class="pd-num">${esc(SL.store.playerLabel(TG.team, TG.pending.num))}</span>`);
    if (TG.pending.ev) bits.push(`<span class="pd-ev">${esc(C.EVENTS[TG.pending.ev].label)}</span>`);
    if (!bits.length) return `<span class="dim">背番号を押して → プレーのキー。例：<kbd>1</kbd><kbd>0</kbd> → <kbd>Q</kbd> ＝ #10 のゴール</span>`;
    let hint = '';
    if (TG.pending.ev && TG.pending.num == null && !TG.buf) hint = '選手（背番号）を選んでください';
    else if (TG.buf) hint = '確定は少し待つか Enter';
    else if (TG.pending.num != null && !TG.pending.ev) hint = 'プレーのキー／ボタンを押してください';
    return bits.join('<i class="pd-plus">＋</i>') + (hint ? `<span class="pd-hint">${hint}</span>` : '');
  }

  function followHtml() {
    const f = TG.follow;
    if (!f) return '';
    const st = SL.store.state;
    if (f.kind === 'pass') {
      const shot = SL.store.getEvent(f.shotId);
      const mates = st.teams[f.team].roster.filter((p) => !shot || p.num !== shot.num);
      return `<div class="followbar assist"><div class="fq"><b>${f.isGoal ? '🅰 アシスト（ラストパス）は？' : '🅰 キーパス（シュートの一つ前のパス）は？'}</b> <span class="dim">背番号を入力して Enter ／ なしなら Esc</span></div>
        <div class="fchips">${mates.map((p) => `<button class="pbtn sm" data-act="fpass" data-num="${p.num}"><b>${p.num}</b><span>${esc(p.name)}</span></button>`).join('')}<button class="btn sm" data-act="fskip">${f.isGoal ? 'アシストなし' : 'なし'}</button></div></div>`;
    }
    if (f.kind === 'victim') {
      const mates = st.teams[f.vsTeam].roster;
      return `<div class="followbar sub"><div class="fq"><b>⚠ ファウルを受けた相手の選手は？</b> <span class="dim">背番号を入力して Enter ／ 不明なら Esc</span></div>
        <div class="fchips">${mates.map((p) => `<button class="pbtn sm" data-act="fvictim" data-num="${p.num}" style="--tc:${st.teams[f.vsTeam].color}"><b>${p.num}</b><span>${esc(p.name)}</span></button>`).join('')}<button class="btn sm ghost" data-act="fskip">わからない</button></div></div>`;
    }
    return `<div class="followbar sub"><div class="fq"><b>⚠ ボールロストの種類は？</b> <span class="dim">数字キー（1〜）でも選べます</span></div>
      <div class="fchips">${C.TOV_TYPES.map((o, i) => `<button class="btn sm" data-act="fsub" data-id="${o.id}"><kbd>${i + 1}</kbd>${esc(o.label.replace(/（.*）/, ''))}</button>`).join('')}<button class="btn sm ghost" data-act="fskip">あとで</button></div></div>`;
  }

  function idNum(id) {
    return parseInt(String(id).slice(1), 10) || 0;
  }

  /** 1件のタグの補足（型・位置・xG など） */
  function extraOf(e) {
    const extra = [];
    if (e.type === 'tov') extra.push(C.tovLabel(e.sub || 'other').replace(/（.*）/, ''));
    if (e.type === 'foul') extra.push(C.foulLabel(e.sub || 'other').replace(/（.*）/, ''));
    if (C.isShot(e)) {
      if (e.scene && e.scene !== C.SCENE_DEFAULT && !(C.EVENTS[e.type] || {}).pk) extra.push(C.sceneShort(e.scene));
      if (e.body === 'head') extra.push('ヘディング');
      const pos = C.shotPos(e);
      if (pos) extra.push(C.zoneLabel(C.zoneFor(pos.sx, pos.sy)).replace(/（.*）/, '') + ' xG ' + SL.xg.of(e).toFixed(2));
    } else if (e.px != null) extra.push(C.fieldZoneShort(C.zoneOfEvent(e)));
    if (e.type === 'foul' && e.vs != null) extra.push('被 #' + e.vs);
    return extra;
  }

  function recentHtml() {
    const st = SL.store.state;
    const list = st.events.slice().sort((a, b) => idNum(b.id) - idNum(a.id)).slice(0, 7);
    if (!list.length) return '<div class="empty-note">まだタグがありません。</div>';
    return list
      .map((e) => {
        const meta = C.EVENTS[e.type] || { label: e.type };
        const team = st.teams[e.team] || st.teams.H;
        const who = e.num != null ? SL.store.playerLabel(e.team, e.num) : '';
        return `<div class="rrow" data-id="${e.id}">
          <button class="rt" data-act="seek" data-id="${e.id}" title="この場面へ移動">${U.fmtTime(e.t)}</button>
          <i class="rdot" style="background:${team.color}"></i>
          <span class="rwho">${esc(who || team.name)}</span>
          <span class="rev ev-${e.type}">${esc(meta.label.replace(/（.*）/, ''))}</span>
          <span class="rextra">${esc(extraOf(e).join(' ・ '))}</span>
          <button class="ricon" data-act="edit" data-id="${e.id}" title="編集">✎</button>
          <button class="ricon" data-act="del" data-id="${e.id}" title="削除">✕</button>
        </div>`;
      })
      .join('');
  }

  function locText() {
    const loc = TG.attrs.loc;
    if (!loc) return 'ピッチをクリックすると、次のタグ（シュート・ロスト・ファウルなど）にその位置が付きます（任意）。';
    const sp = C.toShot(loc.px, loc.py);
    const zone = C.zoneFor(sp.sx, sp.sy);
    const xg = SL.xg.at(sp.sx, sp.sy);
    return `位置を記録：${C.fieldZoneShort(C.fieldZone(loc.px, loc.py))}（シュートなら ${C.zoneLabel(zone).replace(/（.*）/, '')}・ゴールまで約${Math.hypot(sp.sx, sp.sy).toFixed(0)}m・xG目安 ${xg.toFixed(2)}）`;
  }

  function html() {
    const st = SL.store.state;
    const team = TG.team;
    const T = st.teams[team];
    const onboarding =
      !st.events.length && SL.player.kind === 'none'
        ? `<div class="card info onboard"><b>はじめかた</b>
          <ol><li>右上の「📂 動画を読み込む」で試合の動画を選びます（MP4推奨）。</li>
          <li>動画を見ながら、<kbd>背番号</kbd> → <kbd>Q</kbd>（ゴール）などでタグを付けます。マウスでもOK。</li>
          <li>「集計」「ショット」「アドバイス」「ハイライト」タブに結果が自動で出ます。</li></ol>
          <div class="row gap"><button class="btn sm" data-act="opensample">サンプル試合で試す</button><button class="btn sm ghost" data-act="rundemo">デモを見る</button></div></div>`
        : '';

    const teamSwitch = ['H', 'A']
      .map((t) => `<button class="team-btn ${t === team ? 'on' : ''}" data-act="team" data-team="${t}" style="--tc:${st.teams[t].color}"><i></i><span>${esc(st.teams[t].name)}</span>${t === 'H' ? '<em>自</em>' : '<em>相</em>'}</button>`)
      .join('');

    const rosterBtns = T.roster
      .map((p) => `<button class="pbtn ${TG.pending.num === p.num ? 'on' : ''}" data-act="player" data-team="${team}" data-num="${p.num}" style="--tc:${T.color}" title="${esc(p.name || '')} ${p.pos || ''}"><b>${p.num}</b><span>${esc(p.name)}</span>${p.pos === 'GK' ? '<em class="gkb">GK</em>' : ''}</button>`)
      .join('');
    const teamBtn = `<button class="pbtn team ${TG.pending.num === 0 ? 'on' : ''}" data-act="player" data-team="${team}" data-num="0" title="個人に付けないプレー（チーム全体のメモなど）"><b>0</b><span>チーム</span></button>`;

    const evGroups = C.EVENT_GROUPS.map((g) => {
      const btns = C.EVENT_ORDER.filter((k) => C.EVENTS[k].group === g.id)
        .map((k) => {
          const m = C.EVENTS[k];
          return `<button class="evbtn ev-${k} ${TG.pending.ev === k ? 'on' : ''}" data-act="event" data-type="${k}"><kbd>${m.kl}</kbd><span>${esc(m.label.replace(/（.*）/, ''))}</span></button>`;
        })
        .join('');
      return `<div class="evgroup"><div class="evg-title">${g.label}</div><div class="evrow g-${g.id}">${btns}</div></div>`;
    }).join('');

    const chip = (s) => `<button class="schip ${s.set ? 'set' : ''} ${TG.scene === s.id ? 'on' : ''}" data-act="scene" data-id="${s.id}" title="${esc(s.hint)}">${esc(s.short)}</button>`;
    const sceneOpen = C.SCENES.filter((s) => s.open).map(chip).join('');
    const sceneSet = C.SCENES.filter((s) => s.set && s.id !== 'pk').map(chip).join('');

    const loc = TG.attrs.loc;
    const pitchSvg = SL.pitch.full({ cls: 'pitch-svg full mini', marker: loc });

    const ps = st.periods.slice().sort((a, b) => a.start - b.start);
    const periodBtns = [1, 2, 3, 4]
      .map((q) => {
        const p = ps.find((x) => x.q === q);
        return `<button class="qbtn ${p ? 'set' : ''}" data-act="period" data-q="${q}" title="${p ? D.qLabel(q) + ' 開始：' + U.fmtTime(p.start, true) + '（クリックで現在位置に更新）' : '現在位置を' + D.qLabel(q) + 'の開始にする'}">${D.qLabel(q)}${p ? '<em>' + U.fmtTime(p.start) + '</em>' : ''}</button>`;
      })
      .join('');

    return `
      ${onboarding}
      <div class="team-switch" role="group" aria-label="チーム切り替え">${teamSwitch}<kbd class="vkey" title="V キーで切り替え">V</kbd></div>
      <div class="pending ${TG.pending.ev || TG.pending.num != null || TG.buf ? 'active' : ''}" aria-live="polite">${pendingHtml()}</div>
      ${followHtml()}
      <div class="sect">
        <h4>選手 <span class="dim">（背番号キー または クリック）</span></h4>
        <div class="roster">${rosterBtns}${teamBtn}
          <span class="addp"><input id="addNum" class="numinput" type="number" min="1" max="99" placeholder="背番号"><input id="addName" class="nameinput" type="text" placeholder="名前(任意)"><button class="btn sm" data-act="addplayer" data-team="${team}">＋追加</button></span>
        </div>
      </div>
      <div class="sect">
        <h4>プレー <span class="dim">（キー または クリック）</span></h4>
        ${evGroups}
      </div>
      <div class="sect">
        <h4>攻撃の型 <span class="dim">（シュートに付く。<kbd>,</kbd><kbd>.</kbd> で切替）</span> <button class="schip lock ${TG.lock ? 'on' : ''}" data-act="lock" title="次のシュートでも型を戻さない（L）">${TG.lock ? '🔒 固定中' : '🔓 シュートごとに戻す'}</button></h4>
        <div class="scenebar"><span class="sg-l">流れの中</span>${sceneOpen}</div>
        <div class="scenebar"><span class="sg-l">セットプレー</span>${sceneSet}</div>
      </div>
      <div class="sect attrs">
        <h4>ピッチ上の位置・ヘディング <span class="dim">（任意）</span></h4>
        <div class="attrs-row">
          <div class="minipitch">${pitchSvg}</div>
          <div class="attrs-side">
            <p class="dim loc-text">${locText()}</p>
            <div class="row gap wrap">
              <button class="btn sm ${loc ? '' : 'disabled'}" data-act="clearloc">位置をクリア</button>
              <button class="btn sm ${TG.attrs.head ? 'primary' : ''}" data-act="head" title="次のシュートをヘディングにする（H）">🗣 ヘディング（<kbd>H</kbd>）</button>
            </div>
            <p class="dim tiny">位置を入れたシュートは、xG（ゴール期待値）とショットマップに反映されます。この図は「選んでいるチームが右へ攻める」向きです。</p>
          </div>
        </div>
      </div>
      <div class="sect">
        <h4>最近のタグ <span class="grow"></span>
          <button class="btn sm" data-act="undo" ${SL.store.canUndo() ? '' : 'disabled'} title="Backspace / Ctrl+Z">↶ 取り消す</button>
          <button class="btn sm ghost" data-act="gotolog">すべて見る・編集</button></h4>
        <div class="recent">${recentHtml()}</div>
      </div>
      <div class="sect">
        <h4>前半・後半の区切り <span class="dim">（動画を該当位置で止めて押す。現在 ${U.fmtTime(SL.player.time, true)}）</span></h4>
        <div class="qrow">${periodBtns}</div>
      </div>`;
  }

  function onClick(e) {
    const svg = e.target.closest('svg.mini');
    if (svg) {
      const p = SL.pitch.fullPoint(svg, e);
      TG.setLoc({ px: p.px, py: p.py });
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    switch (act) {
      case 'team':
        TG.setTeam(b.dataset.team);
        break;
      case 'player':
        TG.pickPlayer(b.dataset.team, +b.dataset.num);
        break;
      case 'event':
        SL.ui.flashKey(C.EVENTS[b.dataset.type].kl);
        TG.pickEvent(b.dataset.type);
        break;
      case 'scene':
        TG.setScene(b.dataset.id);
        break;
      case 'lock':
        TG.toggleLock();
        break;
      case 'clearloc':
        TG.setLoc(null);
        break;
      case 'head':
        TG.toggleHead();
        break;
      case 'fpass':
        TG.applyPass(+b.dataset.num);
        break;
      case 'fvictim':
        TG.applyVictim(+b.dataset.num);
        break;
      case 'fsub':
        TG.applySub(b.dataset.id);
        break;
      case 'fskip':
        TG.skipFollow();
        break;
      case 'seek':
        SL.ui.selectEvent(b.dataset.id, { seek: true });
        break;
      case 'edit':
        SL.ui.openEdit(b.dataset.id);
        break;
      case 'del':
        SL.store.removeEvent(b.dataset.id);
        break;
      case 'undo':
        SL.store.undo();
        break;
      case 'gotolog':
        SL.ui.setTab('log');
        break;
      case 'period':
        TG.markPeriod(+b.dataset.q);
        break;
      case 'addplayer': {
        const numEl = U.$('#addNum');
        const nameEl = U.$('#addName');
        const num = parseInt(numEl.value, 10);
        if (!isFinite(num) || num < 0) {
          U.toast('背番号を入力してください');
          break;
        }
        const p = SL.store.ensurePlayer(b.dataset.team, num);
        if (nameEl.value.trim()) SL.store.patch(() => (p.name = nameEl.value.trim()));
        numEl.value = '';
        nameEl.value = '';
        SL.ui.renderActive(true);
        break;
      }
      case 'opensample':
        SL.app.openSample();
        break;
      case 'rundemo':
        SL.demo.start();
        break;
    }
    if (b.blur) b.blur();
  }

  SL.ui.register({
    id: 'tag',
    label: 'タグ付け',
    icon: '🏷',
    init(root) {
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.target.id === 'addNum' || e.target.id === 'addName')) {
          e.preventDefault();
          U.$('[data-act="addplayer"]', root).click();
        }
      });
      TG.onChange(() => {
        if (SL.ui.tab === 'tag') SL.ui.schedule();
      });
    },
    render(root) {
      root.innerHTML = html();
    },
  });
})();
