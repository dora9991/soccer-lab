/* サッカー分析ラボ - 「ハイライト」タブ */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;
  const GL = SL.goals;
  const esc = U.esc;
  const HL = SL.hl;

  const TARGETS = [
    [0, 'すべて'],
    [30, '約30秒'],
    [60, '約1分'],
    [90, '約1分半'],
    [120, '約2分'],
    [180, '約3分'],
  ];
  const TYPE_CHIPS = ['goal', 'sot', 'soff', 'sblk', 'pkg', 'ast', 'kp', 'tkl', 'itc', 'clr', 'ck', 'tov', 'foul', 'off', 'yc', 'rc'];

  const EMPTY = {
    big: '決定機（xG 0.3以上のシュート）はありませんでした。ゴールに近い位置のシュートに位置を入れると、ここに出てきます。',
    saves: 'GKのセーブ（相手の枠内シュート）がまだありません。',
    tov_pts: 'ボールロストの直後（12秒以内）に相手が打った場面はありませんでした。',
    spells: '短い時間にシュートが続いた時間帯はありませんでした。',
    foul_us: 'ファウル・カードのタグがまだありません。（X / J / K キー）',
    ck_us: 'コーナーキックのタグがまだありません。（C キー）',
  };

  function rosterOpts(team, sel) {
    const st = SL.store.state;
    const list = st.teams[team].roster;
    return ['<option value="">全員</option>'].concat(list.map((p) => `<option value="${p.num}" ${sel === p.num ? 'selected' : ''}>#${p.num} ${esc(p.name)}</option>`)).join('');
  }

  function customBuilder() {
    const st = SL.store.state;
    const h = HL.st;
    const f = h.filter || {};
    if (f.special) return `<div class="callout">条件：<b>${esc(h.filterLabel || '特別な条件')}</b></div>`;
    const teamOpt = (v, l) => `<option value="${v}" ${(f.team || '') === v ? 'selected' : ''}>${l}</option>`;
    const roster = f.team ? rosterOpts(f.team, f.num) : '<option value="">（チームを選ぶと選べます）</option>';
    const sceneOpts = ['<option value="">すべて</option>'].concat(C.SCENES.map((s) => `<option value="${s.id}" ${f.scene === s.id ? 'selected' : ''}>${esc(s.short)}</option>`)).join('');
    const chips = TYPE_CHIPS.map((k) => `<label class="tchip ${(f.types || []).includes(k) ? 'on' : ''}"><input type="checkbox" data-act="cf-type" data-type="${k}" ${(f.types || []).includes(k) ? 'checked' : ''}>${esc(C.EVENTS[k].label.replace(/（.*）/, ''))}</label>`).join('');
    return `<div class="custom">
      ${h.filterLabel ? `<div class="callout">条件：<b>${esc(h.filterLabel)}</b></div>` : ''}
      <div class="cf-row">
        <label class="inl">チーム <select data-act="cf-team">${teamOpt('', '両方')}${teamOpt('H', esc(st.teams.H.name))}${teamOpt('A', esc(st.teams.A.name))}</select></label>
        <label class="inl">選手 <select data-act="cf-num">${roster}</select></label>
        <label class="inl">攻撃の型 <select data-act="cf-scene">${sceneOpts}</select></label>
      </div>
      <div class="cf-types">${chips}</div></div>`;
  }

  /** 得点／失点シーンの内訳（原因・型をクリックで絞り込み） */
  function goalsBlock(S, side) {
    const st = SL.store.state;
    const h = HL.st;
    const items = GL.build(st, S, { side });
    if (!items.length) {
      return side === 'against'
        ? `<div class="callout warn">相手のゴールのタグがまだありません。<kbd>V</kbd> で相手に切り替え → 背番号 → <kbd>Q</kbd>（ゴール）と付けると、失点につながった場面が原因つきで集まります。</div>`
        : `<div class="callout warn">ゴールのタグがまだありません。背番号 → <kbd>Q</kbd> で付けると、得点シーンが「決め方」つきで集まります。</div>`;
    }
    const sm = GL.summary(items);
    const sel = new Set(h.causes);
    const rows = sm.byPrimary
      .map((b) => {
        const c = GL.cause(b.id);
        const inv = sm.involved[b.id];
        return `<button class="cd-row ${sel.has(b.id) ? 'on' : ''}" data-act="cause" data-id="${b.id}" style="--cc:${c.color}" title="${esc(GL.causeHint(b.id, side))}">
          <span class="cd-l"><i></i>${esc(GL.causeLabel(b.id, side))}</span>
          <span class="cd-bar"><i style="width:${((b.pts / sm.total) * 100).toFixed(0)}%"></i></span>
          <b>${b.pts}点</b><small>${inv.n !== b.n ? `関与 ${inv.n}回` : `${b.n}回`}</small></button>`;
      })
      .join('');
    const name = side === 'against' ? '失点' : '得点';
    return `<div class="cd-summary ${side}">
      <div class="cd-head"><b>${name} ${sm.total}点の${side === 'against' ? '原因' : '型'}内訳</b><span class="dim">クリックして絞り込み（複数選択OK）</span><span class="grow"></span>
        <button class="btn sm ${sel.size ? '' : 'primary'}" data-act="cause-all">すべて</button></div>
      <div class="cd-rows">${rows}</div>
      <p class="dim tiny">1つのゴールを「主な${side === 'against' ? '原因' : '型'}」1つに振り分けた内訳です。各クリップには、関係した${side === 'against' ? '原因' : '型'}がすべてタグとして付きます。クリップは「攻撃の始まり」からゴールまでをまるごと切り出しています。</p></div>`;
  }

  function clipRow(c, i) {
    const h = HL.st;
    const st = SL.store.state;
    const now = h.playing && h.playIdx >= 0 && HL.active()[h.playIdx] === c;
    const team = st.teams[c.team] || st.teams.H;
    const dot = c.side === 'against' ? '#ff6b6b' : c.side === 'for' ? '#3ddc97' : team.color;
    const chips = (c.causes || [])
      .map((id) => {
        const cs = GL.cause(id);
        return `<span class="cchip" style="--cc:${cs.color}" title="${esc(GL.causeHint(id, c.side))}">${esc(cs.short)}</span>`;
      })
      .join('');
    const k = esc(c.key);
    const badge = c.side === 'against' ? '<span class="pts-badge">失点</span>' : c.side === 'for' ? '<span class="pts-badge for">得点</span>' : '';
    return `<div class="clip ${c.off ? 'off' : ''} ${now ? 'now' : ''}" data-key="${k}">
      <div class="crow1">
        <input type="checkbox" data-act="ctoggle" data-key="${k}" ${c.off ? '' : 'checked'} title="このシーンを含める">
        <span class="cn">${i + 1}</span>
        <i class="cdot" style="background:${dot}"></i>
        <div class="cmain"><div class="clabel">${badge}${esc(c.label)}</div>
          <div class="csub">${esc(c.sub)} ・ ${U.fmtTime(c.start)}–${U.fmtTime(c.end)}（${Math.round(c.end - c.start)}秒）${c.causeText ? ` ・ <span class="ctext">${esc(c.causeText)}</span>` : ''}</div></div>
        <div class="ctools">
          <button class="ricon" data-act="cplay" data-key="${k}" title="このシーンから連続再生">▶</button>
          <span class="trim" title="開始位置：1秒ずつ調整／⇤で「いまの再生位置」にそろえる"><button class="ricon" data-act="cedge" data-key="${k}" data-w="start" title="開始を、いまの再生位置にする">⇤</button><button class="ricon" data-act="ctrim" data-key="${k}" data-w="start" data-d="-1">◂</button><small>始</small><button class="ricon" data-act="ctrim" data-key="${k}" data-w="start" data-d="1">▸</button></span>
          <span class="trim" title="終了位置：1秒ずつ調整／⇥で「いまの再生位置」にそろえる"><button class="ricon" data-act="ctrim" data-key="${k}" data-w="end" data-d="-1">◂</button><small>終</small><button class="ricon" data-act="ctrim" data-key="${k}" data-w="end" data-d="1">▸</button><button class="ricon" data-act="cedge" data-key="${k}" data-w="end" title="終了を、いまの再生位置にする">⇥</button></span>
          <button class="ricon" data-act="cmove" data-key="${k}" data-d="-1" title="上へ">↑</button>
          <button class="ricon" data-act="cmove" data-key="${k}" data-d="1" title="下へ">↓</button>
        </div>
      </div>
      <div class="crow2">${chips}<input class="cnote" type="text" data-act="cnote" data-key="${k}" value="${esc(c.note || '')}" placeholder="📝 コメント（例：ヘルプが遅れた／書き出す動画のテロップにも入ります）" maxlength="80"></div></div>`;
  }

  function exportSection() {
    const ex = HL.exporting;
    const r = HL.result;
    let h = '';
    if (ex) {
      const pct = ex.total > 0 ? Math.min(100, (ex.done / ex.total) * 100) : 0;
      h += `<div class="card info exporting"><b>🎬 書き出し中… <span id="exClip">${ex.clip}</span>/${ex.n} 本目${ex.clip === 0 ? '（タイトル画面）' : ''}</b>
        <div class="progress"><i id="exBar" style="width:${pct.toFixed(1)}%"></i></div>
        <div class="row gap"><span class="dim" id="exTxt">${Math.round(ex.done)} / ${Math.round(ex.total)} 秒</span><span class="grow"></span><button class="btn sm danger" data-act="excancel">キャンセル</button></div>
        <p class="dim tiny">ブラウザ内で録画しているため、動画の長さと同じ時間がかかります。このタブを表示したままにしてください。</p></div>`;
    }
    if (r) {
      h += `<div class="card good result"><b>✔ 書き出しが完了しました</b>
        <div class="dim">${esc(r.name)}（${(r.size / 1048576).toFixed(1)} MB・${r.clips}シーン・${Math.round(r.dur)}秒${r.hasAudio ? '・音声あり' : '・音声なし'}）</div>
        <div class="row gap"><a class="btn primary" href="${r.url}" download="${esc(r.name)}">⬇ ダウンロード</a><span class="dim tiny">形式：${esc(r.type)}${r.type.includes('webm') ? '（iPhone等では再生できない場合があります。Chrome/Edge/VLCなどで再生できます）' : ''}</span></div>
        <video class="resvid" src="${r.url}" controls preload="metadata"></video></div>`;
    }
    return h;
  }

  function render(root) {
    HL.compute();
    const st = SL.store.state;
    const h = HL.st;
    const preset = HL.PRESETS.find((p) => p.id === h.presetId) || HL.PRESETS[0];
    const isGoals = preset.special === 'concede' || preset.special === 'scored';
    const side = preset.special === 'concede' ? 'against' : 'for';
    const list = HL.clips;
    const active = HL.active();
    const total = HL.totalSec();
    const S = HL._S;
    const rosterTeam = preset.special === 'concede' ? 'A' : preset.team || 'H';
    SL.timeline.setClips(active, h.playing ? h.playIdx : -1);
    const presetBtns = HL.PRESETS.map((p) => `<button class="preset ${p.id === h.presetId ? 'on' : ''} ${p.feature ? 'feature ' + p.feature : ''}" data-act="preset" data-id="${p.id}" title="${esc(p.desc)}"><b>${esc(p.label)}</b><small>${esc(p.desc)}</small></button>`).join('');
    const qOpts = ['<option value="">全体</option>'].concat(S.halves.map((r) => `<option value="${r.q}" ${h.q === r.q ? 'selected' : ''}>${D.qLabel(r.q)}</option>`)).join('');
    const tOpts = TARGETS.map(([v, l]) => `<option value="${v}" ${(st.cfg.targetSec || 0) === v ? 'selected' : ''}>${l}</option>`).join('');
    const showPlayer = !preset.custom && (preset.needsPlayer || (preset.types && !preset.special) || preset.special === 'best' || isGoals);
    const needPlayerMsg = preset.needsPlayer && h.num == null ? '<div class="callout warn">選手を選んでください。</div>' : '';
    const playing = h.playing;
    const canExport = HL.canExport();
    const orderOpts = `<option value="time" ${h.order === 'time' ? 'selected' : ''}>時系列</option>${isGoals ? `<option value="cause" ${h.order === 'cause' ? 'selected' : ''}>${side === 'against' ? '原因別' : '型別'}</option>` : ''}<option value="score" ${h.order === 'score' ? 'selected' : ''}>おすすめ順</option><option value="manual" ${h.order === 'manual' ? 'selected' : ''}>手動</option>`;

    root.innerHTML = `
      <div class="pane-head"><h3 class="ph">ハイライト作成・見直し</h3><span class="dim">条件に合うシーンを自動で切り出し、つなげて1本の動画にします</span></div>
      <div class="presets">${presetBtns}</div>
      ${preset.custom ? customBuilder() : ''}
      ${isGoals ? goalsBlock(S, side) : ''}
      <div class="hl-opts">
        ${showPlayer ? `<label class="inl">${isGoals ? (side === 'against' ? '決めた選手（相手）' : '決めた選手') : '選手'} <select data-act="hl-num">${rosterOpts(rosterTeam, h.num)}</select></label>` : ''}
        <label class="inl">区間 <select data-act="hl-q">${qOpts}</select></label>
        <label class="inl">長さ <select data-act="hl-target">${tOpts}</select></label>
        <label class="inl">並び順 <select data-act="hl-order">${orderOpts}</select></label>
      </div>
      <div class="hl-opts">
        <label class="inl">${isGoals ? '最低の前置き' : '前'} <input type="range" min="3" max="20" step="1" value="${st.cfg.pre}" data-act="hl-pre"><b>${st.cfg.pre}秒</b></label>
        <label class="inl">後 <input type="range" min="0" max="10" step="1" value="${st.cfg.post}" data-act="hl-post"><b>${st.cfg.post}秒</b></label>
        <label class="chk"><input type="checkbox" data-act="hl-lower" ${h.lower ? 'checked' : ''}>テロップ（選手名・原因・コメント）</label>
        <label class="chk"><input type="checkbox" data-act="hl-score" ${h.scorebug ? 'checked' : ''}>スコア表示</label>
        <label class="chk"><input type="checkbox" data-act="hl-title" ${h.titleCard ? 'checked' : ''}>タイトル／エンド画面</label>
      </div>
      ${needPlayerMsg}
      <div class="hl-bar">
        <div class="hl-sum"><b>${active.length}</b> シーン ・ 合計 <b>${U.fmtTime(total)}</b>${list.length !== active.length ? `<span class="dim">（${list.length - active.length}件は除外中）</span>` : ''}</div>
        <span class="grow"></span>
        ${playing ? '<button class="btn" data-act="hl-prev">⏮ 前</button><button class="btn" data-act="hl-next">⏭ 次</button><button class="btn danger" data-act="hl-stop">■ 停止</button>' : `<button class="btn primary" data-act="hl-play" ${active.length ? '' : 'disabled'}>▶ 連続再生（プレビュー）</button>`}
        <button class="btn ${canExport ? 'accent' : 'disabled'}" data-act="export" ${active.length && !HL.exporting ? '' : 'disabled'} title="ブラウザ内で録画して動画ファイルにします">🎬 動画に書き出す</button>
        <button class="btn ghost" data-act="ffmpeg" ${active.length ? '' : 'disabled'} title="ffmpeg をお持ちなら、高画質で切り出せるスクリプトを保存します">ffmpeg用</button>
      </div>
      <div id="exportArea">${exportSection()}</div>
      <div class="cliplist" data-n="${list.length}">${list.length ? list.map(clipRow).join('') : `<div class="empty-note">${st.events.length ? EMPTY[preset.id] || '該当するシーンがありません。条件を変えてみてください。' : 'タグがまだありません。タグを付けると、ここにシーンが並びます。'}</div>`}</div>
      <p class="dim tiny">カット編集：◂▸で開始・終了を1秒ずつ調整。映像を見ながら、⇤（開始）／⇥（終了）で<b>いまの再生位置</b>にそろえられます。📝コメントは書き出す動画のテロップにも入ります。${canExport ? '' : '<b>このブラウザは動画の書き出しに未対応です（Chrome/Edge推奨）。</b>'}</p>`;
  }

  function updateProgress() {
    const ex = HL.exporting;
    const bar = U.$('#exBar');
    if (!ex || !bar) return;
    bar.style.width = Math.min(100, (ex.done / Math.max(1, ex.total)) * 100).toFixed(1) + '%';
    const t = U.$('#exTxt');
    if (t) t.textContent = `${Math.round(ex.done)} / ${Math.round(ex.total)} 秒`;
    const c = U.$('#exClip');
    if (c) c.textContent = ex.clip;
  }

  SL.ui.register({
    id: 'hl',
    label: 'ハイライト',
    icon: '🎬',
    init(root) {
      let lastEx = false;
      HL.on(() => {
        if (SL.ui.tab !== 'hl') return;
        const exNow = !!HL.exporting;
        if (exNow && lastEx) updateProgress();
        else SL.ui.schedule();
        lastEx = exNow;
      });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
        const d = b.dataset;
        const h = HL.st;
        switch (d.act) {
          case 'preset':
            h.presetId = d.id;
            h.edits = {};
            h.manual = [];
            h.order = 'time';
            h.num = null;
            h.causes = [];
            if (d.id === 'custom' && (!h.filter || !Object.keys(h.filter).filter((k) => h.filter[k] !== undefined).length)) h.filter = { team: 'H', types: ['goal', 'sot'] };
            HL.stop();
            break;
          case 'cause':
            HL.toggleCause(d.id);
            HL.stop();
            break;
          case 'cause-all':
            h.causes = [];
            HL.stop();
            break;
          case 'hl-play':
            HL.play(0);
            return;
          case 'hl-stop':
            HL.stop();
            return;
          case 'hl-next':
            HL.next();
            return;
          case 'hl-prev':
            HL.prev();
            return;
          case 'cplay': {
            const i = HL.active().findIndex((c) => c.key === d.key);
            if (i >= 0) HL.play(i);
            return;
          }
          case 'ctrim':
            HL.trim(d.key, d.w, +d.d);
            break;
          case 'cedge':
            if (!SL.player.ready) return;
            if (!HL.setEdge(d.key, d.w, SL.player.time)) {
              U.toast(d.w === 'start' ? '開始位置は、終了より前（1秒以上）にしてください' : '終了位置は、開始より後（1秒以上）にしてください');
              return;
            }
            U.toast((d.w === 'start' ? '開始' : '終了') + 'を ' + U.fmtTime(SL.player.time, true) + ' にそろえました');
            break;
          case 'cmove':
            HL.move(d.key, +d.d);
            break;
          case 'export':
            HL.export();
            return;
          case 'excancel':
            HL.cancelExport();
            return;
          case 'ffmpeg':
            U.download(HL.ffmpegScript(), 'highlight_ffmpeg.sh', 'text/x-shellscript;charset=utf-8');
            return;
          default:
            return;
        }
        HL.refresh();
        SL.ui.renderActive(true);
      });
      root.addEventListener('change', (e) => {
        const el = e.target;
        const a = el.dataset && el.dataset.act;
        if (!a) return;
        const h = HL.st;
        const f = a.startsWith('cf-') ? h.filter || (h.filter = {}) : null;
        switch (a) {
          case 'ctoggle':
            HL.edit(el.dataset.key, { off: !el.checked });
            break;
          case 'cnote':
            HL.setNote(el.dataset.key, el.value.trim());
            return;
          case 'hl-num':
            h.num = el.value === '' ? null : +el.value;
            break;
          case 'hl-q':
            h.q = el.value === '' ? null : +el.value;
            break;
          case 'hl-target':
            SL.store.patch((s) => (s.cfg.targetSec = +el.value), 'meta');
            break;
          case 'hl-order':
            h.order = el.value;
            break;
          case 'hl-lower':
            h.lower = el.checked;
            return;
          case 'hl-score':
            h.scorebug = el.checked;
            return;
          case 'hl-title':
            h.titleCard = el.checked;
            return;
          case 'cf-team':
            f.team = el.value || undefined;
            f.num = undefined;
            break;
          case 'cf-num':
            f.num = el.value === '' ? undefined : +el.value;
            break;
          case 'cf-scene':
            f.scene = el.value || undefined;
            break;
          case 'cf-type': {
            const s = new Set(f.types || []);
            if (el.checked) s.add(el.dataset.type);
            else s.delete(el.dataset.type);
            f.types = Array.from(s);
            break;
          }
          case 'hl-pre':
          case 'hl-post':
            SL.store.patch((s) => (s.cfg[a === 'hl-pre' ? 'pre' : 'post'] = +el.value), 'meta');
            break;
          default:
            return;
        }
        if (a.startsWith('cf-')) h.filterLabel = '';
        HL.refresh();
        SL.ui.renderActive(true);
      });
      // スライダーは離した時に反映（ドラッグ中は表示だけ更新）
      root.addEventListener('input', (e) => {
        const el = e.target;
        if (el.dataset && (el.dataset.act === 'hl-pre' || el.dataset.act === 'hl-post')) {
          const b = el.parentElement.querySelector('b');
          if (b) b.textContent = el.value + '秒';
        }
      });
    },
    render,
  });

  // 再生位置に応じた連続プレビュー
  SL.player.on('time', (t) => HL.onTime(t));
  SL.player.on('ended', () => {
    if (HL.st.playing && !HL.exporting) HL.next();
  });
})();
