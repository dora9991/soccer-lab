/* サッカー分析ラボ - 自動デモ（開いた瞬間に「何ができるか」を実際の画面で見せる）
 * デモ中でも、マウス・キーボード・スクロールの操作をした瞬間に、あなたへ操作が移ります。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const $ = U.$;

  class Cancel extends Error {}
  class Skip extends Error {}

  const DM = (SL.demo = {
    running: false,
    token: 0,
    step: 0,
    _w: new Set(),
    _fin: null,
  });

  const STEPS_TOTAL = 7;

  /* ---------- 待機（中断できる） ---------- */
  DM.wait = (ms) =>
    new Promise((res, rej) => {
      const rec = { rej };
      rec.id = setTimeout(() => {
        DM._w.delete(rec);
        res();
      }, ms);
      DM._w.add(rec);
    });
  DM._cancelWaits = (err) => {
    const list = Array.from(DM._w);
    DM._w.clear();
    list.forEach((r) => {
      clearTimeout(r.id);
      r.rej(err);
    });
  };
  DM.until = async (fn, maxMs) => {
    const t0 = performance.now();
    while (!fn()) {
      await DM.wait(60);
      if (performance.now() - t0 > (maxMs || 20000)) break;
    }
  };

  /* ---------- 表示部品 ---------- */
  const layer = () => $('#demoLayer');
  function setCaption(step, title, html) {
    const cap = $('#demoCap');
    cap.hidden = false;
    cap.classList.remove('pop');
    void cap.offsetWidth;
    cap.classList.add('pop');
    $('#dcStep').textContent = step ? `デモ ${step}/${STEPS_TOTAL}` : 'デモ';
    $('#dcTitle').innerHTML = title;
    $('#dcText').innerHTML = html;
    $('#dcDots').innerHTML = Array.from({ length: STEPS_TOTAL }, (_, i) => `<i class="${i < step ? 'done' : ''} ${i + 1 === step ? 'cur' : ''}"></i>`).join('');
  }
  function ripple(x, y) {
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    layer().appendChild(r);
    setTimeout(() => r.remove(), 700);
  }
  async function glide(target, opts) {
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return null;
    const scroller = el.closest('.panels');
    if (scroller && (opts || {}).scroll !== false) {
      const r = el.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      if (scroller.scrollHeight <= scroller.clientHeight + 2) {
        // 縦に並ぶ表示（狭い画面）では、ページ全体をスクロールする
        if (r.top < 70 || r.bottom > window.innerHeight - 190) {
          window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.22, behavior: 'smooth' });
          await DM.wait(650);
        }
      } else if (r.top < s.top + 40 || r.bottom > s.bottom - 40) {
        scroller.scrollTo({ top: scroller.scrollTop + (r.top - s.top) - s.height * 0.3, behavior: 'smooth' });
        await DM.wait(550);
      }
    }
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(r.width * 0.5, 60) + ((opts || {}).dx || 0);
    const y = r.top + r.height * 0.55 + ((opts || {}).dy || 0);
    const g = $('#ghost');
    g.classList.add('on');
    g.style.left = x + 'px';
    g.style.top = y + 'px';
    await DM.wait(760);
    return { el, x, y };
  }
  async function tap(target, opts) {
    const p = await glide(target, opts);
    if (!p) return null;
    ripple(p.x, p.y);
    const g = $('#ghost');
    g.classList.add('press');
    setTimeout(() => g.classList.remove('press'), 180);
    await DM.wait(140);
    // 途中で画面が描き直されて要素が差し替わっていたら、探し直してからクリックする
    let el = p.el;
    if (!el.isConnected && typeof target === 'string') el = $(target) || el;
    el.click();
    return p;
  }
  const tapTab = async (id) => {
    const p = await tap(`.tab[data-tab="${id}"]`);
    // 狭い画面では、タブの位置までページを移動して内容が見えるようにする
    const sc = $('#panels');
    if (sc && sc.scrollHeight <= sc.clientHeight + 2) {
      const r = $('#tabs').getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top - 8, behavior: 'smooth' });
      await DM.wait(500);
    }
    return p;
  };
  const scrollPanel = async (sel, block) => {
    const el = $(sel);
    const sc = $('#panels');
    if (!el || !sc) return;
    const r = el.getBoundingClientRect();
    const s = sc.getBoundingClientRect();
    if (sc.scrollHeight <= sc.clientHeight + 2) window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.22, behavior: 'smooth' });
    else sc.scrollTo({ top: sc.scrollTop + (r.top - s.top) - (block || 12), behavior: 'smooth' });
    await DM.wait(700);
  };
  const glow = (el, ms) => {
    if (!el) return;
    el.classList.add('demo-glow');
    setTimeout(() => el.classList.remove('demo-glow'), ms || 2600);
  };

  /* ---------- 実況タグ付け（サンプルの正解タグを、人が押すように入力する） ---------- */
  const idMap = new Map();
  async function liveTag(ev) {
    const TG = SL.tagger;
    const meta = C.EVENTS[ev.type];
    const digits = ev.num == null ? [] : String(ev.num).split('');
    TG.team = ev.team;
    TG.pending = { num: null, ev: null };
    TG.changed();
    SL.ui.setKeys(digits.concat([meta.kl]), (ev.num != null ? SL.store.playerLabel(ev.team, ev.num) + ' → ' : '') + meta.label.replace(/（.*）/, ''), 1700);
    TG.pending.num = ev.num;
    TG.changed();
    await DM.wait(260);
    TG.pending.ev = ev.type;
    TG.changed();
    await DM.wait(260);
    TG.pending = { num: null, ev: null };
    const rec = Object.assign({}, ev);
    if (rec.for && idMap.has(rec.for)) rec.for = idMap.get(rec.for);
    else delete rec.for;
    const saved = SL.store.addEvent(rec);
    idMap.set(ev.id, saved.id);
    SL.ui.onTagged(saved);
    TG.changed();
  }

  /** タグ付けの実演に向いた区間（ゴール・アシスト・ファウル・ロストなどがそろう約26秒）を選ぶ */
  function pickWindow(all) {
    const evs = all.filter((e) => e.type !== 'note');
    let best = null;
    for (const e of evs) {
      if (e.t > 1100) break;
      const s = Math.max(0, e.t - 3);
      const inWin = evs.filter((x) => x.t >= s && x.t <= s + 26);
      const types = new Set(inWin.map((x) => x.type));
      const score =
        Math.min(inWin.length, 9) +
        types.size * 2 +
        (types.has('goal') || types.has('pkg') ? 6 : 0) +
        (types.has('ast') ? 4 : 0) +
        (types.has('foul') ? 2 : 0) +
        (types.has('tov') || types.has('tkl') || types.has('itc') ? 2 : 0) +
        (types.has('ck') ? 1 : 0);
      if (!best || score > best.score) best = { s, score };
    }
    return best ? { t0: best.s, t1: best.s + 26 } : { t0: 0, t1: 26 };
  }

  /** 各ステップの後始末（スキップされた場合でも、再生・入力途中の状態を戻す） */
  function afterStep() {
    SL.player.pause();
    SL.player.setRate(1);
    if (SL.hl.st.playing) SL.hl.stop();
    SL.tagger.esc();
  }

  /* ---------- シナリオ ---------- */
  function scenario() {
    const P = SL.player;
    const S = SL.store;
    const all = SL.app.sampleState.events;
    const finishTagging = () => {
      if (S.state.events.length !== all.length) S.replaceEvents(all.map((e) => Object.assign({}, e)), { noHist: true });
    };

    const steps = [];

    // 0. タイトル
    steps.push(async () => {
      setCaption(0, '⚽ サッカー分析ラボ', '試合の動画に<b>タグ</b>を付けるだけで、<b>個人成績・xG・ショットマップ・ハイライト・アドバイス</b>が自動でできます。<br><span class="dim">これから約2分のデモを見せます。いつでもクリックやキー入力で、あなたが操作できます。</span>');
      SL.ui.setTab('tag');
      P.seek(0);
      await DM.wait(4200);
    });

    // 1. 実況タグ付け
    steps.push(async () => {
      setCaption(1, '① 見ながらタグ付け', '動画を見ながら <kbd>背番号</kbd> → <kbd>プレーのキー</kbd>。例：<kbd>1</kbd><kbd>0</kbd> → <kbd>Q</kbd> で「#10 のゴール」。ゴールのあとにラストパスの背番号を入れるとアシストにもなります。マウスのボタンでも入力できます。');
      SL.ui.setTab('tag');
      idMap.clear();
      const win = pickWindow(all);
      const t0 = win.t0;
      const window_ = all.filter((e) => e.t >= t0 && e.t <= win.t1 + 2);
      const tEnd = win.t1 + 1.5;
      await P.seek(t0);
      P.setRate(1.5);
      P.play();
      await glide('#stage', { dx: 60, dy: 30, scroll: false });
      let i = 0;
      while (P.time < tEnd && i < window_.length) {
        while (i < window_.length && window_[i].t + 0.9 <= P.time) {
          await liveTag(window_[i]);
          i++;
        }
        await DM.wait(70);
      }
      P.pause();
      P.setRate(1);
    });

    // 2. 集計
    steps.push(async () => {
      finishTagging();
      setCaption(2, '② 個人成績とチーム比較を自動集計', 'ゴール・アシスト・シュート・<b>xG（ゴール期待値）</b>・タックル・ファウル・カードを自動で集計。チーム比較と、<b>xGの推移</b>で「内容」と「結果」のずれも見えます。<span class="dim">見出しクリックで並べ替え。</span>');
      await tapTab('stats');
      await DM.wait(900);
      const rows = U.$$('#panel-stats .box tbody tr:not(.teamrow):not(.totrow)');
      let top = null;
      rows.forEach((r) => {
        const goals = +(r.children[3] || {}).textContent;
        const sh = +(r.children[5] || {}).textContent;
        const v = goals * 10 + sh;
        if (!top || v > top.v) top = { r, v };
      });
      if (top) {
        await glide(top.r);
        glow(top.r, 2600);
      }
      await DM.wait(1200);
      await scrollPanel('#panel-stats .cmp', 8);
      await DM.wait(2400);
      await scrollPanel('#panel-stats .xg-svg', 8);
      await DM.wait(2200);
    });

    // 3. 場面別
    steps.push(async () => {
      setCaption(3, '③ 失点は「原因」、得点は「型」で見る', 'プロの現場のように、失点を<b>セットプレー／ボールロスト直後／カウンター／クロス／ミドル…</b>に分類。得点も「どう決めたか」で分け、ボールロスト・ファウルの傾向も分解します。');
      await tapTab('scenes');
      await DM.wait(1800);
      await scrollPanel('#panel-scenes .gb-grid', 8);
      await DM.wait(2200);
      const line = $('#panel-scenes .gb.against .cd-line');
      if (line) {
        await glide(line);
        glow(line, 2200);
      }
      await DM.wait(1400);
      const call = $('#panel-scenes .callout');
      if (call) {
        await glide(call);
        glow(call, 2200);
      }
      await DM.wait(1600);
    });

    // 4. ショットマップ
    steps.push(async () => {
      setCaption(4, '④ ショットマップ（xG）', 'どこから撃って、何点取れたかを<b>ピッチ上に表示</b>。円の大きさが「決まりやすさ（xG）」。遠目ばかり／角度のない位置ばかり、といった<b>シュート選択の良し悪し</b>が一目で分かります。');
      await tapTab('shots');
      await DM.wait(2200);
      const zones = U.$$('#panel-shots .zone').filter((n) => n.getAttribute('fill') && n.getAttribute('fill') !== 'transparent');
      const pick = zones.find((n) => /^(boxC|six)$/.test(n.dataset.zone)) || zones[0];
      if (pick) {
        await glide(pick, { scroll: false });
        glow(pick, 2000);
      }
      await DM.wait(2400);
    });

    // 5. アドバイス
    steps.push(async () => {
      setCaption(5, '⑤ 自動アドバイス', '数字から「原因の仮説 → 練習メニュー」まで提案。<b>▶ボタンで、その問題の場面を映像で確認</b>できます。');
      await tapTab('advice');
      await DM.wait(2600);
      await scrollPanel('#panel-advice .advice-cols', 6);
      await DM.wait(2400);
      if ($('#panel-advice .acol .clipbtn')) {
        await tap('#panel-advice .acol .clipbtn');
        await DM.wait(400);
        SL.ui.setTab('hl');
        await DM.until(() => SL.player.playing, 4000);
        await DM.wait(4200);
        SL.hl.stop();
      }
    });

    // 6. ハイライト（得点シーン → 失点シーンの見直し）
    steps.push(async () => {
      setCaption(6, '⑥ 得点シーン・失点シーンを、映像でカット編集', '<b>得点を決めた場面</b>と<b>決められた場面</b>を、攻撃の始まりからゴールまでまるごと自動で切り出し。原因（型）で絞り込み、開始・終了の調整とコメントを入れて、テロップ付きの動画に書き出せます。');
      SL.hl.stop();
      await tapTab('hl');
      await DM.wait(500);
      await tap('#panel-hl [data-act="preset"][data-id="score_us"]');
      await DM.wait(900);
      const play = $('#panel-hl [data-act="hl-play"]');
      if (play && !play.disabled) {
        await tap('#panel-hl [data-act="hl-play"]');
        await DM.until(() => SL.hl.st.playing && SL.player.playing, 4000);
        await DM.wait(4200);
        SL.hl.stop();
        await DM.wait(250);
      }
      await tap('#panel-hl [data-act="preset"][data-id="concede"]');
      await DM.wait(1300);
      const sum = $('#panel-hl .cd-summary');
      if (sum) {
        await glide(sum);
        glow(sum, 2600);
      }
      await DM.wait(1800);
      if ($('#panel-hl .cd-row')) {
        await tap('#panel-hl .cd-row');
        await DM.wait(1300);
      }
      const play2 = $('#panel-hl [data-act="hl-play"]');
      if (play2 && !play2.disabled) {
        await tap('#panel-hl [data-act="hl-play"]');
        await DM.until(() => SL.hl.st.playing && SL.player.playing, 4000);
        await DM.wait(6000);
        SL.hl.stop();
      }
      const ex = $('#panel-hl [data-act="export"]');
      if (ex) {
        await glide(ex);
        glow(ex, 3000);
        await DM.wait(2000);
      }
    });

    // 7. まとめ
    steps.push(async () => {
      setCaption(7, '⑦ さあ、あなたの試合で', '右上の「<b>📂 動画を読み込む</b>」で動画を選び、背番号とキーでタグ付けを始めましょう。<br><span class="dim">いまはサンプル試合です。自由に触って試せます（保存はされません）。</span>');
      SL.ui.setTab('tag');
      const btn = $('#btnLoad');
      await glide(btn, { scroll: false });
      btn.classList.add('pulse');
      await DM.wait(4800);
      btn.classList.remove('pulse');
    });
    return steps;
  }

  /* ---------- 開始・停止 ---------- */
  DM.start = async () => {
    if (DM.running) DM.stop('restart', { quiet: true });
    DM.running = true;
    document.body.classList.add('demoing');
    const tok = ++DM.token;
    DM._w = new Set();
    SL.app.openSample({ empty: true, keepDemo: true });
    $('#demoDock').hidden = true;
    layer().hidden = false;
    $('#ghost').classList.remove('on');
    const g = $('#ghost');
    g.style.left = window.innerWidth - 120 + 'px';
    g.style.top = window.innerHeight - 140 + 'px';
    const steps = scenario();
    try {
      for (let i = 0; i < steps.length; i++) {
        if (DM.token !== tok) return;
        DM.step = i;
        try {
          await steps[i]();
        } catch (e) {
          if (!(e instanceof Skip)) throw e;
        }
        if (DM.token === tok) afterStep();
      }
      if (DM.token === tok) DM.finish('done');
    } catch (e) {
      if (!(e instanceof Cancel)) console.error('demo error', e);
    }
  };

  DM._finalize = () => {
    const all = SL.app.sampleState.events;
    if (SL.store.mode === 'sample' && SL.store.state.events.length !== all.length && !DM._practice) {
      SL.store.replaceEvents(all.map((e) => Object.assign({}, e)), { noHist: true });
    }
  };

  DM.finish = (reason) => {
    DM.running = false;
    DM.token++;
    DM._w.clear();
    layer().hidden = true;
    $('#demoCap').hidden = true;
    $('#ghost').classList.remove('on');
    SL.player.pause();
    SL.player.setRate(1);
    SL.hl.stop();
    SL.tagger.esc();
    SL.tagger.team = 'H';
    SL.tagger.scene = C.SCENE_DEFAULT;
    SL.tagger.changed();
    DM._finalize();
    document.body.classList.remove('demoing');
    SL.timeline.setZoom(0);
    const dock = $('#demoDock');
    dock.hidden = false;
    dock.querySelector('.dk-msg').innerHTML = reason === 'done' ? '✅ デモは以上です。<b>サンプル試合を自由に操作</b>できます。' : '✋ <b>操作を引き継ぎました。</b>サンプル試合を自由に操作できます。';
  };

  DM.stop = (reason, opts) => {
    if (!DM.running) return;
    opts = opts || {};
    DM.running = false;
    DM.token++;
    DM._cancelWaits(new Cancel());
    document.body.classList.remove('demoing');
    layer().hidden = true;
    $('#demoCap').hidden = true;
    $('#ghost').classList.remove('on');
    SL.ui.setKeys([], '', 1);
    if (opts.quiet || reason === 'load') return;
    // 押された操作（クリックなど）が先に処理されるよう、少し待ってから状態を整える
    setTimeout(() => {
      if (SL.hl.st.playing) SL.hl.stop();
      DM.finish(reason);
    }, 120);
  };

  DM.skip = () => {
    if (DM.running) DM._cancelWaits(new Skip());
  };

  DM.init = () => {
    // 人の操作（isTrusted）が来たらデモを止める
    const onUser = (e) => {
      if (!DM.running || !e.isTrusted) return;
      if (e.target && e.target.closest && e.target.closest('#demoCap')) return;
      DM.stop('user');
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((n) => window.addEventListener(n, onUser, true));
    $('#dcSkip').addEventListener('click', () => {
      if (DM.running) DM.stop('user');
    });
    $('#dcNext').addEventListener('click', () => DM.skip());
    $('#dkReplay').addEventListener('click', () => DM.start());
    $('#dkLoad').addEventListener('click', () => $('#fileInput').click());
    $('#dkClose').addEventListener('click', () => ($('#demoDock').hidden = true));
  };
})();
