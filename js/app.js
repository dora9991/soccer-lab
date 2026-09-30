/* サッカー分析ラボ - 起動・キーボード・再生コントロール・サンプル試合 */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;
  const $ = U.$;

  const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

  // e.code が空の環境でも動くよう、e.key から物理キーの名前を補う
  const KEY_FALLBACK = { '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma', '.': 'Period', ' ': 'Space', '/': 'Slash', '?': 'Slash', Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown' };
  function keyCode(e) {
    if (e.code) return e.code;
    const k = e.key || '';
    if (KEY_FALLBACK[k]) return KEY_FALLBACK[k];
    if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
    if (/^[0-9]$/.test(k)) return 'Digit' + k;
    return '';
  }

  const App = (SL.app = {
    simData: null,
    sampleState: null,

    ensureSample() {
      if (!App.simData) {
        App.simData = SL.sim.build();
        App.sampleState = SL.sim.toState(App.simData);
      }
    },

    /** サンプル試合を開く。empty=タグなし（デモ用）／practice=練習用 */
    openSample(opts) {
      opts = opts || {};
      App.ensureSample();
      if (SL.demo.running && !opts.keepDemo) SL.demo.stop('sample', { quiet: true });
      SL.hl.stop();
      const st = JSON.parse(JSON.stringify(App.sampleState));
      if (opts.empty || opts.practice) {
        st.events = [];
        st.nextId = 1;
      }
      SL.store.useSample(st);
      SL.player.loadSim(App.simData);
      SL.player.seek(0);
      SL.tagger.esc();
      SL.tagger.team = 'H';
      SL.tagger.scene = C.SCENE_DEFAULT;
      const h = SL.hl.st;
      h.presetId = 'score_us';
      h.filter = null;
      h.num = null;
      h.q = null;
      h.causes = [];
      h.edits = {};
      h.manual = [];
      h.order = 'time';
      SL.ui.afterLoad();
      SL.ui.renderActive(true);
      if (opts.practice) {
        SL.ui.setTab('tag');
        U.toast('サンプル映像でタグ付けを練習できます。Space で再生 → 背番号 → Q（ゴール）/W/E…');
      }
    },

    /** 保存してある自分の分析を開く（動画は未読み込み） */
    openUser() {
      if (SL.demo.running) SL.demo.stop('user', { quiet: true });
      SL.hl.stop();
      SL.store.useUser();
      SL.player.unload();
      $('#demoDock').hidden = true;
      SL.ui.afterLoad();
      SL.ui.setTab('stats');
      const v = SL.store.state.video.name;
      U.toast('前回の分析を開きました。動画' + (v ? '（' + v + '）' : '') + 'を読み込むと続きから再生できます');
    },

    jumpEvent(dir) {
      const P = SL.player;
      const evs = SL.store.state.events;
      const t = P.time;
      const lead = 2.5;
      let target = null;
      if (dir > 0) {
        const e = evs.find((x) => x.t - lead > t + 0.05);
        if (e) target = e;
      } else {
        for (let i = evs.length - 1; i >= 0; i--) {
          if (evs[i].t - lead < t - 0.6) {
            target = evs[i];
            break;
          }
        }
      }
      if (!target) {
        U.toast(dir > 0 ? 'これより先のタグはありません' : 'これより前のタグはありません');
        return;
      }
      SL.ui.selectEvent(target.id, { seek: true });
    },

    onKey(e) {
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('dialog[open]')) return;
      const P = SL.player;
      const code = keyCode(e);
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        if (code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) SL.store.redo();
          else if (SL.store.undo()) U.toast('取り消しました（Ctrl+Shift+Z でやり直し）');
        } else if (code === 'KeyY') {
          e.preventDefault();
          SL.store.redo();
        }
        return;
      }
      if (e.altKey) return;
      if (e.repeat && code !== 'ArrowLeft' && code !== 'ArrowRight') {
        e.preventDefault();
        return;
      }
      switch (code) {
        case 'Space':
          e.preventDefault();
          if (P.ready) P.toggle();
          return;
        case 'ArrowLeft':
          e.preventDefault();
          SL.ui.userSeek();
          P.seekBy(e.shiftKey ? -1 : -5);
          return;
        case 'ArrowRight':
          e.preventDefault();
          SL.ui.userSeek();
          P.seekBy(e.shiftKey ? 1 : 5);
          return;
        case 'ArrowUp':
          e.preventDefault();
          App.jumpEvent(-1);
          return;
        case 'ArrowDown':
          e.preventDefault();
          App.jumpEvent(1);
          return;
        case 'BracketLeft':
        case 'BracketRight': {
          e.preventDefault();
          const i = RATES.indexOf(P.rate);
          const j = U.clamp((i < 0 ? 3 : i) + (code === 'BracketRight' ? 1 : -1), 0, RATES.length - 1);
          P.setRate(RATES[j]);
          U.toast('再生速度 ×' + RATES[j]);
          return;
        }
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          if (SL.store.undo()) U.toast('直前のタグを取り消しました');
          return;
      }
      if (e.key === '?' || (code === 'Slash' && e.shiftKey)) {
        e.preventDefault();
        SL.ui.openHelp();
        return;
      }
      if (SL.tagger.handleKey({ code })) e.preventDefault();
    },

    bindTransport() {
      const P = SL.player;
      const play = $('#tpPlay');
      const time = $('#tpTime');
      const speed = $('#tpSpeed');
      const mute = $('#tpMute');
      speed.innerHTML = RATES.map((r) => `<option value="${r}" ${r === 1 ? 'selected' : ''}>×${r}</option>`).join('');
      play.addEventListener('click', () => P.ready && P.toggle());
      $('#tpBack').addEventListener('click', () => {
        SL.ui.userSeek();
        P.seekBy(-5);
      });
      $('#tpFwd').addEventListener('click', () => {
        SL.ui.userSeek();
        P.seekBy(5);
      });
      $('#tpPrev').addEventListener('click', () => App.jumpEvent(-1));
      $('#tpNext').addEventListener('click', () => App.jumpEvent(1));
      speed.addEventListener('change', () => P.setRate(+speed.value));
      mute.addEventListener('click', () => P.setMuted(!P.muted));
      let lastTxt = '';
      const updTime = (t) => {
        const txt = U.fmtTime(t, true) + ' / ' + U.fmtTime(P.duration);
        if (txt !== lastTxt) {
          lastTxt = txt;
          time.textContent = txt;
        }
        SL.ui.hudTime(t);
      };
      P.on('time', updTime);
      P.on('loaded', () => updTime(P.time));
      P.on('state', () => {
        play.textContent = P.playing ? '⏸' : '▶';
        play.title = P.playing ? '一時停止（Space）' : '再生（Space）';
        mute.textContent = P.muted ? '🔇' : '🔊';
        if (!RATES.includes(P.rate) && ![...speed.options].some((o) => +o.value === P.rate)) speed.insertAdjacentHTML('beforeend', `<option value="${P.rate}">×${P.rate}</option>`);
        speed.value = String(P.rate);
        $('#stage').classList.toggle('playing', P.playing);
      });
      // ステージのクリックで再生／停止
      $('#stage').addEventListener('click', (e) => {
        if (e.target.closest('.stage-empty')) return;
        if (P.ready) P.toggle();
      });
      $('#stage').addEventListener('dblclick', (e) => {
        if (e.target.closest('.stage-empty')) return;
        const el = $('#stage');
        if (document.fullscreenElement) document.exitFullscreen();
        else if (el.requestFullscreen) el.requestFullscreen();
      });
    },

    init() {
      SL.player.init();
      SL.timeline.init();
      SL.ui.initTabs();
      SL.demo.init();
      App.bindTransport();

      // ヘッダー
      $('#btnLoad').addEventListener('click', () => $('#fileInput').click());
      $('#fileInput').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) SL.ui.loadVideoFile(f);
        e.target.value = '';
      });
      $('#btnSample').addEventListener('click', () => App.openSample());
      $('#btnDemo').addEventListener('click', () => SL.demo.start());
      $('#btnHelp').addEventListener('click', () => SL.ui.openHelp());
      $('#btnResume').addEventListener('click', () => App.openUser());
      $('#gameTitle').addEventListener('change', (e) => SL.store.patch((s) => (s.title = e.target.value.trim()), 'meta'));
      document.querySelectorAll('[data-act="stage-load"]').forEach((b) => b.addEventListener('click', () => $('#fileInput').click()));
      document.querySelectorAll('[data-act="stage-sample"]').forEach((b) => b.addEventListener('click', () => App.openSample()));

      // ドラッグ＆ドロップ
      const stage = $('#stage');
      window.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          stage.classList.add('drag');
        }
      });
      window.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget) stage.classList.remove('drag');
      });
      window.addEventListener('drop', (e) => {
        stage.classList.remove('drag');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        e.preventDefault();
        if (/^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name)) SL.ui.loadVideoFile(f);
        else if (/\.json$/i.test(f.name)) {
          f.text()
            .then((txt) => {
              SL.store.importJSON(txt);
              SL.ui.afterLoad();
              U.toast('分析データを読み込みました。動画を選んでください');
            })
            .catch((err) => U.toast('読み込めませんでした：' + err.message, 'bad'));
        } else U.toast('動画ファイル（MP4など）をドロップしてください');
      });

      // データの変更 → 画面更新
      SL.store.on(() => {
        SL.ui.updateScoreCache();
        SL.ui.hudTime(SL.player.time);
        SL.ui.updateMode();
        SL.ui.schedule();
      });
      SL.player.on('loaded', () => SL.ui.updateStage());

      // キーボード
      document.addEventListener('keydown', App.onKey);
      document.addEventListener('keyup', (e) => {
        const t = e.target;
        if (e.code === 'Space' && !(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))) e.preventDefault();
      });
      // セレクト・チェックボックス・スライダーは、操作後にフォーカスを外す（Space やタグ付けキーが効かなくなるのを防ぐ）
      document.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || !t.tagName) return;
        if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'range'))) setTimeout(() => t.blur(), 0);
      });
      // ボタンにフォーカスが残ると Space/Enter が誤作動するので外す
      document.addEventListener('mouseup', (e) => {
        const b = e.target.closest && e.target.closest('button');
        if (b) setTimeout(() => b.blur(), 0);
      });
      window.addEventListener('beforeunload', () => SL.store.saveNow());
      window.addEventListener('resize', () => SL.timeline.redraw());

      // 起動：サンプルを読み込み、自動デモを開始
      SL.ui.setTab('tag');
      App.ensureSample();
      SL.demo.start();
    },
  });

  window.addEventListener('DOMContentLoaded', () => {
    try {
      App.init();
    } catch (e) {
      console.error(e);
      document.body.insertAdjacentHTML('afterbegin', `<div style="padding:12px;background:#7f1d1d;color:#fff">起動エラー：${U.esc(e.message)}</div>`);
    }
  });
})();
