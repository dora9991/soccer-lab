/* サッカー分析ラボ - 画面の共通部分（タブ・HUD・通知・ダイアログ・動画の読み込み） */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;
  const $ = U.$;

  const UI = (SL.ui = {
    tab: 'tag',
    views: {},
    order: [],
    tl: [{ t: 0, H: 0, A: 0 }],
    _hud: '',

    register(v) {
      UI.views[v.id] = v;
      UI.order.push(v.id);
    },

    /* ---------- タブ ---------- */
    initTabs() {
      const nav = $('#tabs');
      const panels = $('#panels');
      UI.order.forEach((id) => {
        const v = UI.views[id];
        nav.insertAdjacentHTML('beforeend', `<button class="tab" role="tab" data-tab="${id}" aria-selected="false" aria-label="${v.label}" title="${v.label}"><span class="ti">${v.icon || ''}</span><span class="tt">${v.label}</span></button>`);
        const p = document.createElement('section');
        p.className = 'panel';
        p.id = 'panel-' + id;
        p.setAttribute('role', 'tabpanel');
        panels.appendChild(p);
        if (v.init) v.init(p);
      });
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]');
        if (b) UI.setTab(b.dataset.tab);
      });
      UI.schedule = U.rafOnce(() => UI.renderActive());
    },
    setTab(id) {
      if (!UI.views[id]) return;
      UI.tab = id;
      U.$$('.tab').forEach((b) => {
        const on = b.dataset.tab === id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      U.$$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + id));
      UI.renderActive(true);
      if (SL.timeline && SL.timeline.redraw) SL.timeline.redraw();
      const el = $('#panel-' + id);
      if (el) el.scrollTop = 0;
      const box = $('#panels');
      if (box) box.scrollTop = 0;
    },
    renderActive(force) {
      const v = UI.views[UI.tab];
      const root = $('#panel-' + UI.tab);
      if (!v || !root) return;
      const ae = document.activeElement;
      if (!force && ae && root.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
      try {
        v.render(root);
      } catch (e) {
        console.error('render error in ' + UI.tab, e);
        root.innerHTML = `<div class="card bad"><b>表示エラー</b><p>${U.esc(e.message)}</p></div>`;
      }
    },

    /* ---------- HUD（スコア表示・トースト・キー表示） ---------- */
    updateScoreCache() {
      UI.tl = D.scoreTimeline(SL.store.state.events);
      UI._hud = '';
    },
    hudTime(t) {
      const st = SL.store.state;
      const sc = D.scoreAt(UI.tl, t);
      const clock = D.clockFull(st, t);
      const sig = sc.H + '-' + sc.A + clock + st.teams.H.name + st.teams.A.name + st.teams.H.color + st.teams.A.color + st.events.length;
      if (sig === UI._hud) return;
      UI._hud = sig;
      const showScore = st.events.length > 0;
      $('#scorebug').innerHTML = showScore
        ? `<span class="sb-team" style="--tc:${st.teams.H.color}">${U.esc(st.teams.H.name)}</span><b class="sb-pt">${sc.H}</b><i>–</i><b class="sb-pt">${sc.A}</b><span class="sb-team" style="--tc:${st.teams.A.color}">${U.esc(st.teams.A.name)}</span><em class="sb-q">${U.esc(clock)}</em>`
        : '';
      $('#scorebug').hidden = !showScore;
    },
    stageToast(html, ms) {
      const z = $('#stageToasts');
      const el = document.createElement('div');
      el.className = 'stoast';
      el.innerHTML = html;
      z.appendChild(el);
      while (z.children.length > 3) z.firstChild.remove();
      setTimeout(() => el.classList.add('out'), ms || 2300);
      setTimeout(() => el.remove(), (ms || 2300) + 500);
    },
    onTagged(ev) {
      const st = SL.store.state;
      const meta = C.EVENTS[ev.type] || { label: ev.type };
      const team = st.teams[ev.team] || st.teams.H;
      const who = ev.num != null ? SL.store.playerLabel(ev.team, ev.num) : '';
      UI.stageToast(`<i style="background:${team.color}"></i><b>${U.esc(who || team.name)}</b> ${U.esc(meta.label.replace(/（.*）/, ''))}<em>${U.esc(D.clockFull(st, ev.t))}</em>`);
      SL.timeline.setSelected(ev.id);
    },
    _keys: [],
    _keyTimer: null,
    flashKey(k, label) {
      UI._keys.push(String(k).toUpperCase());
      if (UI._keys.length > 6) UI._keys.shift();
      UI.renderKeys(label);
      clearTimeout(UI._keyTimer);
      UI._keyTimer = setTimeout(() => {
        UI._keys = [];
        UI.renderKeys();
      }, 1400);
    },
    setKeys(list, label, ms) {
      UI._keys = list.map((k) => String(k).toUpperCase());
      UI.renderKeys(label);
      clearTimeout(UI._keyTimer);
      UI._keyTimer = setTimeout(() => {
        UI._keys = [];
        UI.renderKeys();
      }, ms || 1500);
    },
    renderKeys(label) {
      const el = $('#keyFlash');
      if (!el) return;
      el.innerHTML = UI._keys.length ? UI._keys.map((k) => `<kbd>${U.esc(k)}</kbd>`).join('') + (label ? `<span>${U.esc(label)}</span>` : '') : '';
      el.classList.toggle('on', UI._keys.length > 0);
    },
    showClipTag(c, i, n) {
      const el = $('#clipTag');
      const st = SL.store.state;
      el.hidden = false;
      const color = c.side === 'against' ? '#ff6b6b' : c.side === 'for' ? '#3ddc97' : (st.teams[c.team] || st.teams.H).color;
      const lead = c.side === 'against' ? '失点｜' : c.side === 'for' ? '得点｜' : '';
      el.innerHTML = `<i style="background:${color}"></i><div class="ct-main"><b>${lead}${U.esc(c.label)}</b><em>${U.esc(c.sub)}${c.causeText ? '　' + (c.side === 'against' ? '原因：' : '型：') + U.esc(c.causeText) : ''}　${i + 1}/${n}</em>${c.note ? `<span class="ct-note">📝 ${U.esc(c.note)}</span>` : ''}</div>`;
    },
    hideClipTag() {
      const el = $('#clipTag');
      if (el) el.hidden = true;
    },
    userSeek() {
      if (SL.hl) SL.hl.userSeek();
    },

    /* ---------- イベントの選択・編集 ---------- */
    selectEvent(id, opts) {
      const e = SL.store.getEvent(id);
      if (!e) return;
      SL.timeline.setSelected(id);
      if (opts && opts.seek) {
        UI.userSeek();
        SL.player.seek(Math.max(0, e.t - 3));
      }
      UI._selected = id;
    },
    openEdit(id) {
      const e = SL.store.getEvent(id);
      if (!e) return;
      const st = SL.store.state;
      const dlg = $('#editDlg');
      const evOpts = C.EVENT_ORDER.map((k) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${C.EVENTS[k].label}</option>`).join('');
      const sceneOpts = ['<option value="">（なし）</option>'].concat(C.SCENES.map((s) => `<option value="${s.id}" ${e.scene === s.id ? 'selected' : ''}>${s.label}</option>`)).join('');
      const tovOpts = C.TOV_TYPES.map((s) => `<option value="${s.id}" ${e.sub === s.id ? 'selected' : ''}>${s.label}</option>`).join('');
      const foulOpts = C.FOUL_TYPES.map((s) => `<option value="${s.id}" ${e.sub === s.id ? 'selected' : ''}>${s.label}</option>`).join('');
      const pkOpts = `<option value="">外れた</option><option value="saved" ${e.sub === 'saved' ? 'selected' : ''}>GKに止められた</option>`;
      const roster = (t) => st.teams[t].roster.map((p) => `<option value="${p.num}" ${e.vs === p.num ? 'selected' : ''}>#${p.num} ${U.esc(p.name)}</option>`).join('');
      const hasLoc = e.px != null && e.py != null;
      const locTxt = hasLoc ? (C.isShot(e) ? `${C.zoneLabel(C.zoneFor(C.toShot(e.px, e.py).sx, C.toShot(e.px, e.py).sy))}（ゴールまで約${Math.hypot(C.toShot(e.px, e.py).sx, C.toShot(e.px, e.py).sy).toFixed(0)}m）` : C.fieldZoneLabel(C.zoneOfEvent(e))) : '（位置は未入力）';
      dlg.innerHTML = `
        <form method="dialog" class="dlg-body" id="editForm">
          <h3>タグの編集</h3>
          <div class="fgrid">
            <label>時刻<div class="row"><button type="button" class="btn sm" data-dt="-0.5">−0.5秒</button><input id="ed_t" value="${U.fmtTime(e.t, true)}" size="8"><button type="button" class="btn sm" data-dt="0.5">＋0.5秒</button></div></label>
            <label>チーム<select id="ed_team"><option value="H" ${e.team === 'H' ? 'selected' : ''}>${U.esc(st.teams.H.name)}</option><option value="A" ${e.team === 'A' ? 'selected' : ''}>${U.esc(st.teams.A.name)}</option></select></label>
            <label>背番号<input id="ed_num" type="number" min="0" max="99" value="${e.num == null ? '' : e.num}" placeholder="（チームは 0）"></label>
            <label>プレー<select id="ed_type">${evOpts}</select></label>
            <label id="ed_sub_wrap">種類<select id="ed_sub"></select></label>
            <label id="ed_vs_wrap">ファウルを受けた選手（相手）<select id="ed_vs"><option value="">（不明）</option></select></label>
            <label id="ed_scene_wrap">攻撃の型<select id="ed_scene">${sceneOpts}</select></label>
            <label id="ed_body_wrap">体の部位<select id="ed_body"><option value="">足</option><option value="head" ${e.body === 'head' ? 'selected' : ''}>ヘディング</option></select></label>
            <label class="wide">位置<span class="dim" id="ed_loc">${U.esc(locTxt)}</span>${hasLoc ? '<button type="button" class="btn sm" id="ed_clearloc">位置を消す</button>' : ''}</label>
            <label class="wide">メモ<input id="ed_note" type="text" value="${U.esc(e.note || '')}" placeholder="例：ここから流れが変わった"></label>
          </div>
          <div class="dlg-actions">
            <button type="button" class="btn danger" id="ed_del">削除</button>
            <span class="spacer"></span>
            <button type="button" class="btn" id="ed_go">▶ この場面を見る</button>
            <button type="button" class="btn" id="ed_cancel">キャンセル</button>
            <button type="submit" class="btn primary" id="ed_save" value="save">保存</button>
          </div>
        </form>`;
      let clearLoc = false;
      const subSel = $('#ed_sub', dlg);
      const refresh = () => {
        const ty = $('#ed_type', dlg).value;
        const team = $('#ed_team', dlg).value;
        const meta = C.EVENTS[ty];
        const wrap = $('#ed_sub_wrap', dlg);
        if (ty === 'tov') {
          subSel.innerHTML = tovOpts;
          wrap.hidden = false;
        } else if (ty === 'foul') {
          subSel.innerHTML = foulOpts;
          wrap.hidden = false;
        } else if (ty === 'pkx') {
          subSel.innerHTML = pkOpts;
          wrap.hidden = false;
        } else wrap.hidden = true;
        $('#ed_vs_wrap', dlg).hidden = ty !== 'foul';
        $('#ed_vs', dlg).innerHTML = '<option value="">（不明）</option>' + roster(D.other(team));
        $('#ed_scene_wrap', dlg).hidden = !(meta && meta.shot && !meta.pk && !meta.own);
        $('#ed_body_wrap', dlg).hidden = !(meta && meta.shot && !meta.pk && !meta.own);
      };
      refresh();
      $('#ed_type', dlg).addEventListener('change', refresh);
      $('#ed_team', dlg).addEventListener('change', refresh);
      dlg.querySelectorAll('[data-dt]').forEach((b) =>
        b.addEventListener('click', () => {
          const inp = $('#ed_t', dlg);
          const t = U.parseTime(inp.value);
          inp.value = U.fmtTime(Math.max(0, (isFinite(t) ? t : e.t) + parseFloat(b.dataset.dt)), true);
        })
      );
      const cl = $('#ed_clearloc', dlg);
      if (cl)
        cl.addEventListener('click', () => {
          clearLoc = true;
          $('#ed_loc', dlg).textContent = '（保存すると位置が消えます）';
        });
      $('#ed_cancel', dlg).addEventListener('click', () => dlg.close());
      $('#ed_go', dlg).addEventListener('click', () => {
        dlg.close();
        UI.selectEvent(e.id, { seek: true });
      });
      $('#ed_del', dlg).addEventListener('click', () => {
        SL.store.removeEvent(e.id);
        dlg.close();
      });
      $('#editForm', dlg).addEventListener('submit', (ev) => {
        ev.preventDefault();
        const t = U.parseTime($('#ed_t', dlg).value);
        const type = $('#ed_type', dlg).value;
        const meta = C.EVENTS[type];
        const numRaw = $('#ed_num', dlg).value;
        const patch = {
          t: isFinite(t) ? t : e.t,
          team: $('#ed_team', dlg).value,
          type,
          num: meta.noPlayer ? null : numRaw === '' ? 0 : parseInt(numRaw, 10),
          note: $('#ed_note', dlg).value || undefined,
        };
        patch.sub = type === 'tov' || type === 'foul' || type === 'pkx' ? subSel.value || undefined : undefined;
        patch.vs = type === 'foul' && $('#ed_vs', dlg).value !== '' ? parseInt($('#ed_vs', dlg).value, 10) : undefined;
        if (meta.shot && !meta.pk && !meta.own) {
          patch.scene = $('#ed_scene', dlg).value || undefined;
          patch.body = $('#ed_body', dlg).value || undefined;
        } else if (meta.pk) {
          patch.scene = 'pk';
          patch.body = undefined;
        } else {
          patch.scene = undefined;
          patch.body = undefined;
        }
        if (clearLoc || !meta.loc) {
          patch.px = undefined;
          patch.py = undefined;
        }
        if (patch.num != null && patch.num !== 0) SL.store.ensurePlayer(patch.team, patch.num);
        SL.store.updateEvent(e.id, patch);
        dlg.close();
      });
      dlg.showModal();
    },

    /* ---------- 確認ダイアログ（ブラウザ標準の confirm は使わない） ---------- */
    ask(title, message, buttons) {
      return new Promise((resolve) => {
        const dlg = $('#askDlg');
        dlg.innerHTML = `<div class="dlg-body"><h3>${U.esc(title)}</h3><p class="dlg-msg">${message}</p><div class="dlg-actions"><span class="spacer"></span>${buttons
          .map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-i="${i}">${U.esc(b.label)}</button>`)
          .join('')}</div></div>`;
        const done = (v) => {
          dlg.close();
          resolve(v);
        };
        dlg.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => done(+b.dataset.i)));
        dlg.addEventListener('cancel', () => resolve(-1), { once: true });
        dlg.showModal();
      });
    },

    openHelp() {
      const rows = [
        ['Space', '再生／一時停止'],
        ['← →', '5秒戻る／進む（Shift で1秒）'],
        ['↑ ↓', '前／次のタグへジャンプ'],
        ['[ ]', '再生速度を下げる／上げる'],
        ['0-9', '背番号を入力（2桁OK）'],
        ['Q', 'ゴール（このあとラストパスの背番号を入力 → アシスト）'],
        ['W E R', '枠内シュート（止められた）／枠外／ブロックされた'],
        ['T Y', 'PK 成功／失敗'],
        ['U', 'オウンゴール'],
        ['A S', 'アシスト／キーパス（シュートの一つ前のパス）'],
        ['D F G', 'タックル／インターセプト／クリア'],
        ['C', 'コーナーキック'],
        ['Z', 'ボールロスト（このあと 1〜6 で種類）'],
        ['X', 'ファウル（このあと、受けた選手の背番号）'],
        ['B', 'オフサイド'],
        ['J K', 'イエロー／レッドカード'],
        ['N', 'メモ（しおり）'],
        ['H', '次のシュートをヘディングにする'],
        ['V', '自チーム／相手チームの切り替え'],
        [', .', '攻撃の型（カウンター・クロス…）を前／次へ'],
        ['L', '攻撃の型を固定（次のシュートでも戻さない）'],
        ['Enter', '入力の確定／フォローアップをスキップ'],
        ['Esc', '入力の取り消し'],
        ['Backspace', '直前のタグを取り消す（Ctrl+Z も可）'],
        ['?', 'このヘルプ'],
      ];
      const dlg = $('#helpDlg');
      dlg.innerHTML = `<div class="dlg-body"><h3>キーボードショートカット</h3>
        <p class="dim">タグ付けは「背番号 → プレーのキー」（例：<kbd>1</kbd><kbd>0</kbd><kbd>Q</kbd> で #10 のゴール）。プレー → 背番号の順でもOKです。ピッチ図をクリックすると、次のタグにその位置が付きます。</p>
        <div class="help-grid">${rows.map(([k, d]) => `<div><span class="hk">${k.split(' ').map((x) => `<kbd>${U.esc(x)}</kbd>`).join('')}</span><span>${U.esc(d)}</span></div>`).join('')}</div>
        <div class="dlg-actions"><span class="spacer"></span><button class="btn primary" id="helpClose">閉じる</button></div></div>`;
      $('#helpClose', dlg).addEventListener('click', () => dlg.close());
      dlg.showModal();
    },

    /* ---------- ステージ・ヘッダー ---------- */
    updateStage() {
      const P = SL.player;
      $('#stage').classList.toggle('empty', P.kind === 'none');
    },
    updateMode() {
      const st = SL.store.state;
      const chip = $('#modeChip');
      if (SL.store.mode === 'sample') {
        chip.textContent = 'サンプル試合（保存されません）';
        chip.className = 'mode-chip sample';
      } else {
        chip.textContent = 'マイ分析' + (st.video.name ? '：' + st.video.name : '');
        chip.className = 'mode-chip user';
      }
      const ti = $('#gameTitle');
      if (document.activeElement !== ti) ti.value = st.title || '';
      const rb = $('#btnResume');
      if (rb) {
        const has = SL.store.mode === 'sample' && SL.store.hasUserWork();
        rb.hidden = !has;
        if (has) {
          const u = SL.store.readUser();
          rb.textContent = '📂 前回の分析を開く（' + u.events.length + '件）';
          rb.title = '前回の分析：' + (u.title || u.video.name || '無題');
        }
      }
    },

    /* ---------- 動画の読み込み ---------- */
    async loadVideoFile(file) {
      if (!file) return;
      if (SL.demo) SL.demo.stop('load');
      const store = SL.store;
      let info;
      try {
        U.toast('動画を読み込んでいます…');
        info = await SL.player.loadFile(file);
      } catch (e) {
        U.toast(e.message || '読み込みに失敗しました', 'bad');
        UI.updateStage();
        return;
      }
      const vinfo = { name: file.name, size: file.size, duration: info.duration };
      const saved = store.readUser();
      const sameVideo = (v) => v && v.name === vinfo.name && v.size === vinfo.size;
      if (store.mode === 'user') {
        const cur = store.state;
        if (sameVideo(cur.video) || !cur.video.name) {
          store.patch((s) => (s.video = vinfo), 'video');
        } else if (cur.events.length) {
          const r = await UI.ask('別の動画が読み込まれました', `現在の分析（${cur.events.length}件のタグ）は「${U.esc(cur.video.name)}」用です。<br>新しい動画用に、新規で分析を始めますか？（今の分析はバックアップされます）`, [
            { label: '今の分析を続ける（動画だけ差し替え）' },
            { label: '新規で始める', primary: true },
          ]);
          if (r === 1) {
            store.backupUser();
            store.newUserProject({ video: vinfo });
          } else store.patch((s) => (s.video = vinfo), 'video');
        } else store.patch((s) => (s.video = vinfo), 'video');
      } else {
        if (saved && sameVideo(saved.video)) {
          store.useUser();
          U.toast('前回の続きから開きました（' + saved.events.length + '件のタグ）');
        } else if (saved && saved.events.length) {
          const r = await UI.ask('前回の分析があります', `「${U.esc(saved.video.name || '無題')}」の分析（${saved.events.length}件のタグ）が保存されています。<br>この動画で新規に始めますか？`, [
            { label: '前回の分析に動画を割り当てる' },
            { label: '新規で始める（前回はバックアップ）', primary: true },
          ]);
          if (r === 1) {
            store.backupUser();
            store.newUserProject({ video: vinfo });
          } else {
            store.useUser();
            store.patch((s) => (s.video = vinfo), 'video');
          }
        } else store.newUserProject({ video: vinfo });
      }
      if (!store.state.title) store.patch((s) => (s.title = file.name.replace(/\.[^.]+$/, '')), 'meta');
      $('#demoDock').hidden = true;
      UI.afterLoad();
      UI.setTab('tag');
      U.toast('読み込みました。Space で再生 → 背番号とQ/W/Eなどのキーでタグ付けできます');
    },
    afterLoad() {
      UI.updateStage();
      UI.updateMode();
      UI.updateScoreCache();
      SL.timeline.setZoom(0);
      SL.timeline.redraw();
      UI.hudTime(SL.player.time);
    },
  });
})();
