/* サッカー分析ラボ - 「一覧」「設定」タブ */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;
  const esc = U.esc;

  const lg = { team: '', type: '', q: 0, limit: 300 };

  function extraOf(e) {
    const extra = [];
    if (e.type === 'tov') extra.push(C.tovLabel(e.sub || 'other').replace(/（.*）/, ''));
    if (e.type === 'foul') extra.push(C.foulLabel(e.sub || 'other').replace(/（.*）/, ''));
    if (e.type === 'pkx' && e.sub === 'saved') extra.push('GKに止められた');
    if (C.isShot(e)) {
      if (e.scene) extra.push(C.sceneShort(e.scene));
      if (e.body === 'head') extra.push('ヘディング');
      const pos = C.shotPos(e);
      if (pos) extra.push(C.zoneLabel(C.zoneFor(pos.sx, pos.sy)) + ' xG ' + SL.xg.of(e).toFixed(2));
    } else if (e.px != null) extra.push(C.fieldZoneShort(C.zoneOfEvent(e)));
    if (e.type === 'foul' && e.vs != null) extra.push('被 #' + e.vs);
    return extra;
  }

  /* ---------- 一覧（ログ） ---------- */
  function renderLog(root) {
    const st = SL.store.state;
    let list = st.events.slice();
    if (lg.team) list = list.filter((e) => e.team === lg.team);
    if (lg.type) list = list.filter((e) => e.type === lg.type);
    if (lg.q) list = list.filter((e) => D.periodAt(st.periods, e.t) === lg.q);
    const shown = list.slice(0, lg.limit);
    const typeOpts = ['<option value="">すべて</option>'].concat(C.EVENT_ORDER.map((k) => `<option value="${k}" ${lg.type === k ? 'selected' : ''}>${esc(C.EVENTS[k].label)}</option>`)).join('');
    const qs = ['<option value="0">全体</option>'].concat(st.periods.map((p) => `<option value="${p.q}" ${lg.q === p.q ? 'selected' : ''}>${D.qLabel(p.q)}</option>`)).join('');
    const rows = shown
      .map((e) => {
        const meta = C.EVENTS[e.type] || { label: e.type };
        const team = st.teams[e.team] || st.teams.H;
        return `<tr data-id="${e.id}"><td class="num"><button class="rt" data-act="seek" data-id="${e.id}" title="この場面へ移動">${U.fmtTime(e.t, true)}</button></td><td>${esc(D.minuteLabel(st, e.t))}</td>
          <td><i class="rdot" style="background:${team.color}"></i>${esc(team.name)}</td><td>${esc(e.num != null ? SL.store.playerLabel(e.team, e.num) : '—')}</td>
          <td><span class="rev ev-${e.type}">${esc(meta.label.replace(/（.*）/, ''))}</span></td><td class="l">${esc(extraOf(e).join(' ・ '))}${e.note ? ` <span class="dim">📝 ${esc(e.note)}</span>` : ''}</td>
          <td class="act"><button class="ricon" data-act="edit" data-id="${e.id}" title="編集">✎</button><button class="ricon" data-act="del" data-id="${e.id}" title="削除">✕</button></td></tr>`;
      })
      .join('');
    root.innerHTML = `
      <div class="pane-head"><h3 class="ph">タグの一覧・編集</h3>
        <label class="inl">チーム <select data-act="lteam"><option value="">両方</option><option value="H" ${lg.team === 'H' ? 'selected' : ''}>${esc(st.teams.H.name)}</option><option value="A" ${lg.team === 'A' ? 'selected' : ''}>${esc(st.teams.A.name)}</option></select></label>
        <label class="inl">プレー <select data-act="ltype">${typeOpts}</select></label>
        <label class="inl">区間 <select data-act="lq">${qs}</select></label>
        <span class="grow"></span>
        <span class="dim">${list.length}件</span>
        <button class="btn sm" data-act="csvlog">CSV書き出し</button>
        <button class="btn sm danger" data-act="clearall" ${st.events.length ? '' : 'disabled'}>全部削除</button>
      </div>
      <div class="box-wrap"><table class="tbl logtbl"><thead><tr><th>時刻</th><th>試合時間</th><th class="l">チーム</th><th class="l">選手</th><th class="l">プレー</th><th class="l">詳細</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty-note">該当するタグがありません。</td></tr>'}</tbody></table></div>
      ${list.length > shown.length ? `<div class="row"><button class="btn sm" data-act="more">さらに表示（残り ${list.length - shown.length} 件）</button></div>` : ''}`;
  }

  function csvLog() {
    const st = SL.store.state;
    const head = ['時刻(秒)', '試合時間', '前半後半', 'チーム', '背番号', '名前', 'プレー', '攻撃の型', '種類', 'ピッチx(m)', 'ピッチy(m)', 'ゾーン', 'xG', '体', 'メモ'];
    const rows = [head].concat(
      st.events.map((e) => {
        const pos = C.isShot(e) ? C.shotPos(e) : null;
        return [
          e.t, D.minuteLabel(st, e.t), D.qLabel(D.periodAt(st.periods, e.t)), st.teams[e.team] ? st.teams[e.team].name : '', e.num == null ? '' : e.num, e.num ? SL.store.playerName(e.team, e.num) : '',
          (C.EVENTS[e.type] || {}).label || e.type, e.scene ? C.sceneLabel(e.scene) : '', e.sub ? (e.type === 'tov' ? C.tovLabel(e.sub) : e.type === 'foul' ? C.foulLabel(e.sub) : e.sub) : '',
          e.px == null ? '' : e.px, e.py == null ? '' : e.py, pos ? C.zoneLabel(C.zoneFor(pos.sx, pos.sy)) : '', C.isShot(e) ? SL.xg.of(e).toFixed(3) : '', e.body === 'head' ? 'ヘディング' : '', e.note || '',
        ];
      })
    );
    return '﻿' + rows.map((r) => r.map(U.csvCell).join(',')).join('\r\n');
  }

  SL.ui.register({
    id: 'log',
    label: '一覧',
    icon: '📋',
    init(root) {
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.tagName === 'SELECT') return;
        const d = b.dataset;
        switch (d.act) {
          case 'seek':
            SL.ui.selectEvent(d.id, { seek: true });
            return;
          case 'edit':
            SL.ui.openEdit(d.id);
            return;
          case 'del':
            SL.store.removeEvent(d.id);
            return;
          case 'more':
            lg.limit += 300;
            break;
          case 'csvlog':
            U.download(csvLog(), (SL.store.state.title || 'tags') + '_tags.csv', 'text/csv;charset=utf-8');
            return;
          case 'clearall': {
            const n = SL.store.state.events.length;
            const r = await SL.ui.ask('すべてのタグを削除しますか？', `${n}件のタグがすべて消えます。（取り消し操作 Ctrl+Z で戻せます）`, [{ label: 'キャンセル' }, { label: '削除する', danger: true }]);
            if (r === 1) SL.store.clearEvents();
            return;
          }
          default:
            return;
        }
        SL.ui.renderActive(true);
      });
      root.addEventListener('change', (e) => {
        const s = e.target.closest('select[data-act]');
        if (!s) return;
        if (s.dataset.act === 'lteam') lg.team = s.value;
        if (s.dataset.act === 'ltype') lg.type = s.value;
        if (s.dataset.act === 'lq') lg.q = +s.value;
        SL.ui.renderActive(true);
      });
    },
    render: renderLog,
  });

  /* ---------- 設定 ---------- */
  const POS = [['', '—'], ['GK', 'GK'], ['DF', 'DF'], ['MF', 'MF'], ['FW', 'FW']];
  function rosterTable(team) {
    const st = SL.store.state;
    const T = st.teams[team];
    const rows = T.roster
      .map((p) => `<tr><td><b>${p.num}</b></td><td><input type="text" class="nameinput" data-act="pname" data-team="${team}" data-num="${p.num}" value="${esc(p.name)}" placeholder="名前"></td>
        <td><select data-act="ppos" data-team="${team}" data-num="${p.num}">${POS.map(([v, l]) => `<option value="${v}" ${(p.pos || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><button class="ricon" data-act="pdel" data-team="${team}" data-num="${p.num}" title="削除">✕</button></td></tr>`)
      .join('');
    return `<table class="tbl rosterbl"><thead><tr><th>#</th><th class="l">名前</th><th class="l">位置</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty-note">まだ選手がいません。</td></tr>'}</tbody></table>
      <div class="addp row gap"><input type="number" class="numinput" min="0" max="99" placeholder="背番号" id="rn-${team}"><input type="text" class="nameinput" placeholder="名前" id="rname-${team}"><button class="btn sm" data-act="padd" data-team="${team}">＋追加</button></div>`;
  }

  function renderSetup(root) {
    const st = SL.store.state;
    const sample = SL.store.mode === 'sample';
    const periods = st.periods.slice().sort((a, b) => a.q - b.q);
    const levelOpts = Object.entries(C.LEVELS).map(([k, v]) => `<option value="${k}" ${st.cfg.level === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
    const halfOpts = [45, 40, 35, 30, 25, 20, 15, 10].map((m) => `<option value="${m}" ${st.cfg.halfMin === m ? 'selected' : ''}>${m}分</option>`).join('');
    root.innerHTML = `
      <div class="pane-head"><h3 class="ph">設定・保存</h3></div>
      ${sample ? `<div class="card info">いまは<b>サンプル試合</b>を表示しています（保存されません）。自分の分析を始めるには、右上の「📂 動画を読み込む」を押してください。
        <div class="row gap"><button class="btn sm" data-act="practice">サンプルのタグを消して、練習する</button><button class="btn sm" data-act="resample">サンプルを元に戻す</button></div></div>` : ''}
      <div class="sect"><h4>試合の情報</h4>
        <div class="fgrid">
          <label>試合名<input type="text" data-act="title" value="${esc(st.title)}" placeholder="例：秋季リーグ 第3節"></label>
          <label>日付<input type="date" data-act="date" value="${esc(st.date || '')}"></label>
          <label>動画<input type="text" value="${esc(st.video.name || '（未読み込み）')}" disabled></label>
          <label>目安のレベル<select data-act="level">${levelOpts}</select></label>
          <label>前後半の長さ<select data-act="half">${halfOpts}</select><span class="dim tiny">試合時間の表示（例：後半3分 → ${st.cfg.halfMin + 3}'）と、ファウル数などの目安の計算に使います。</span></label>
          <label>ボール支配率（自チーム・任意）<input type="number" min="0" max="100" data-act="poss" value="${st.cfg.possH == null ? '' : st.cfg.possH}" placeholder="例：58"><span class="dim tiny">支配率は映像から自動では測れないため、分かる場合だけ入力します（集計のチーム比較に出ます）。</span></label>
        </div></div>
      <div class="sect"><h4>チーム</h4>
        <div class="two">${['H', 'A']
          .map((t) => `<div class="teamcfg"><div class="row gap"><input type="color" data-act="tcolor" data-team="${t}" value="${st.teams[t].color}" title="チームカラー"><input type="text" data-act="tname" data-team="${t}" value="${esc(st.teams[t].name)}" class="tnameinput"><span class="dim">${t === 'H' ? '自チーム' : '相手'}</span></div>${rosterTable(t)}</div>`)
          .join('')}</div>
        <p class="dim tiny">位置を「GK」にした選手が、相手の枠内シュートを受けるGKとして集計されます（未設定なら背番号1）。</p></div>
      <div class="sect"><h4>前半・後半の区切り</h4>
        <div class="periods">${periods
          .map((p) => `<div class="prow"><b>${D.qLabel(p.q)}</b><input type="text" data-act="pstart" data-q="${p.q}" value="${U.fmtTime(p.start, true)}" size="8"><button class="btn sm" data-act="pnow" data-q="${p.q}" title="動画の現在位置を開始にする">現在位置（${U.fmtTime(SL.player.time, true)}）にする</button>${p.q > 1 ? `<button class="ricon" data-act="pdelq" data-q="${p.q}" title="削除">✕</button>` : ''}</div>`)
          .join('')}
          ${periods.length < 4 ? `<div class="row gap"><button class="btn sm" data-act="paddq">＋ ${D.qLabel(Math.max(...periods.map((p) => p.q)) + 1)} を追加（現在位置）</button></div>` : ''}</div>
        <p class="dim tiny">区切りを入れると、試合時間の表示（前半12'など）と、前半／後半の比較が使えます。</p></div>
      <div class="sect"><h4>タグ付けの調整</h4>
        <div class="fgrid">
          <label>反応の遅れ補正（秒）<input type="number" step="0.1" min="0" max="5" data-act="delay" value="${st.cfg.delay}"><span class="dim tiny">再生中にキーを押すと、その少し前の時刻でタグが付きます。一時停止中は補正しません。</span></label>
        </div></div>
      <div class="sect"><h4>データの保存・読み込み</h4>
        <div class="row gap wrap">
          <button class="btn" data-act="savejson">💾 分析データを保存（JSON）</button>
          <button class="btn" data-act="loadjson">📥 分析データを読み込む</button>
          <button class="btn" data-act="csvlog2">タグをCSVで書き出す</button>
          <button class="btn danger" data-act="newproj">新しい分析を始める</button>
          <input type="file" id="jsonInput" accept=".json,application/json" hidden>
        </div>
        <p class="dim tiny">自分の分析はこのブラウザに自動保存されます（動画ファイル自体は保存されません。次回は同じ動画を選ぶと続きから開けます）。別のパソコンに移すときはJSONで保存してください。</p></div>`;
  }

  SL.ui.register({
    id: 'setup',
    label: '設定',
    icon: '⚙',
    init(root) {
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
        const d = b.dataset;
        const S = SL.store;
        switch (d.act) {
          case 'practice':
            SL.app.openSample({ practice: true });
            return;
          case 'resample':
            SL.app.openSample();
            return;
          case 'pdel':
            S.patch((s) => (s.teams[d.team].roster = s.teams[d.team].roster.filter((p) => p.num !== +d.num)));
            break;
          case 'padd': {
            const n = parseInt(U.$('#rn-' + d.team).value, 10);
            if (!isFinite(n) || n < 0) {
              U.toast('背番号を入力してください');
              return;
            }
            const p = S.ensurePlayer(d.team, n);
            const nm = U.$('#rname-' + d.team).value.trim();
            if (nm) S.patch(() => (p.name = nm));
            break;
          }
          case 'pnow':
            S.setPeriodStart(+d.q, SL.player.time);
            break;
          case 'pdelq':
            S.removePeriod(+d.q);
            break;
          case 'paddq': {
            const nq = Math.max(...S.state.periods.map((p) => p.q)) + 1;
            S.setPeriodStart(nq, SL.player.time);
            break;
          }
          case 'savejson': {
            const name = (S.state.title || 'soccer-lab').replace(/[\\/:*?"<>|\s]+/g, '_');
            U.download(S.exportJSON(), name + '.json', 'application/json');
            return;
          }
          case 'loadjson':
            U.$('#jsonInput').click();
            return;
          case 'csvlog2':
            U.download(csvLog(), (S.state.title || 'tags') + '_tags.csv', 'text/csv;charset=utf-8');
            return;
          case 'newproj': {
            const n = S.state.events.length;
            const r = await SL.ui.ask('新しい分析を始めますか？', `現在の分析（${n}件のタグ）は消えます。念のため1つ前の状態は自動バックアップされます。<br>（先に「分析データを保存」しておくと安心です）`, [{ label: 'キャンセル' }, { label: '新しく始める', danger: true }]);
            if (r === 1) {
              if (S.mode === 'user') S.backupUser();
              S.newUserProject({});
              SL.ui.updateMode();
              SL.ui.updateScoreCache();
              U.toast('新しい分析を始めました');
            }
            return;
          }
          default:
            return;
        }
        SL.ui.renderActive(true);
      });
      root.addEventListener('change', (e) => {
        const el = e.target;
        const a = el.dataset && el.dataset.act;
        const S = SL.store;
        if (el.id === 'jsonInput') {
          const f = el.files && el.files[0];
          if (!f) return;
          f.text()
            .then((txt) => {
              S.importJSON(txt);
              SL.ui.updateMode();
              SL.ui.updateScoreCache();
              U.toast('読み込みました。動画（' + (S.state.video.name || '未設定') + '）を「動画を読み込む」で選んでください');
            })
            .catch((err) => U.toast('読み込めませんでした：' + err.message, 'bad'));
          el.value = '';
          return;
        }
        if (!a) return;
        switch (a) {
          case 'title':
            S.patch((s) => (s.title = el.value));
            SL.ui.updateMode();
            break;
          case 'date':
            S.patch((s) => (s.date = el.value));
            break;
          case 'level':
            S.patch((s) => (s.cfg.level = el.value));
            break;
          case 'half':
            S.patch((s) => (s.cfg.halfMin = +el.value));
            break;
          case 'poss': {
            const v = parseFloat(el.value);
            S.patch((s) => (s.cfg.possH = isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null));
            break;
          }
          case 'tname':
            S.patch((s) => (s.teams[el.dataset.team].name = el.value || (el.dataset.team === 'H' ? '自チーム' : '相手チーム')));
            break;
          case 'tcolor':
            S.patch((s) => (s.teams[el.dataset.team].color = el.value));
            break;
          case 'pname':
            S.patch((s) => {
              const p = s.teams[el.dataset.team].roster.find((x) => x.num === +el.dataset.num);
              if (p) p.name = el.value.trim();
            });
            break;
          case 'ppos':
            S.patch((s) => {
              const p = s.teams[el.dataset.team].roster.find((x) => x.num === +el.dataset.num);
              if (p) p.pos = el.value;
            });
            break;
          case 'pstart': {
            const t = U.parseTime(el.value);
            if (isFinite(t)) S.setPeriodStart(+el.dataset.q, t);
            else U.toast('時刻は 1:23.4 のように入力してください');
            break;
          }
          case 'delay':
            S.patch((s) => (s.cfg.delay = Math.max(0, Math.min(5, parseFloat(el.value) || 0))));
            break;
          default:
            return;
        }
        SL.ui.renderActive(true);
      });
    },
    render: renderSetup,
  });
})();
