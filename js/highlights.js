/* サッカー分析ラボ - ハイライト（クリップ作成・連続プレビュー・動画書き出し）
 * 得点シーン（自チームのゴール）と失点シーン（相手のゴール）は、攻撃の始まりから得点までをまるごと切り出す。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;
  const X = SL.xg;
  const GL = SL.goals;

  const SHOTS = C.SHOT_TYPES;

  const HL = (SL.hl = {
    st: {
      presetId: 'score_us',
      filter: null, // 「自分で選ぶ」や、アドバイスから開いた条件
      filterLabel: '',
      num: null,
      q: null,
      causes: [], // 得点／失点シーンで絞り込む原因・型（空 = すべて）
      order: 'time', // 'time' | 'score' | 'manual' | 'cause'
      lower: true,
      scorebug: true,
      titleCard: true,
      edits: {}, // key → {dStart, dEnd, off}
      manual: [],
      playIdx: -1,
      playing: false,
    },
    clips: [],
    _l: new Set(),
    token: 0,
    exporting: null,
    result: null,
  });

  HL.on = (fn) => HL._l.add(fn);
  HL.emit = () => HL._l.forEach((f) => f());

  HL.PRESETS = [
    { id: 'score_us', label: '得点を決めた場面（得点シーン）', desc: '自チームのゴールを、攻撃の始まりから決めるまでまるごと切り出し。決め方（型）で分類', special: 'scored', feature: 'for' },
    { id: 'concede', label: '得点を決められた場面（失点シーン）', desc: '相手のゴールを、攻撃の始まりから切り出し、原因（セットプレー・ロスト後・カウンター…）で分類して見直す', special: 'concede', feature: 'against' },
    { id: 'best', label: 'ベストプレー（おすすめ）', desc: 'ゴール・アシスト・決定機・GKのセーブを自動でランキング', special: 'best' },
    { id: 'shots_us', label: '自チームのシュート全部', desc: 'ゴール・枠内・枠外・ブロックされたシュートを集めます', team: 'H', types: SHOTS },
    { id: 'big', label: '決定機（xG 0.3以上）', desc: '決めた・外した決定機を集めます（フィニッシュの見直し）', special: 'big' },
    { id: 'player', label: '選手ごとのハイライト', desc: '選んだ選手のゴール・アシスト・シュート・守備', team: 'H', types: ['goal', 'pkg', 'ast', 'kp', 'sot', 'soff', 'sblk', 'tkl', 'itc'], needsPlayer: true },
    { id: 'saves', label: 'GKのセーブ', desc: '自チームのGKが止めたシュート', special: 'saves' },
    { id: 'allowed', label: '相手のシュート（被シュート）', desc: '守備の振り返り用。相手が撃った場面をすべて集めます', team: 'A', types: SHOTS },
    { id: 'tov_pts', label: 'ボールロスト → ピンチ', desc: 'ボールを失った直後（12秒以内）に相手が打った場面', special: 'toAllowed' },
    { id: 'tov_us', label: 'ボールロストの場面', desc: '自チームのミスを一覧で見返します', team: 'H', types: ['tov'] },
    { id: 'foul_us', label: 'ファウル・カード', desc: '自チームのファウルとカードの場面', team: 'H', types: ['foul', 'yc', 'rc'] },
    { id: 'ck_us', label: 'コーナーキック（攻撃）', desc: '自チームのコーナーの場面', team: 'H', types: ['ck'] },
    { id: 'spells', label: '押し込んだ／押し込まれた時間帯', desc: '短い時間にシュートが続いた区間（両チーム分）', special: 'spells' },
    { id: 'custom', label: '自分で条件を選ぶ', desc: 'チーム・選手・プレーの種類・攻撃の型を自由に組み合わせます', custom: true },
  ];

  /* ---------- 表示用の文言 ---------- */
  const EV_TEXT = {
    goal: 'ゴール', pkg: 'PKを決めた', pkx: 'PKを外した', og: 'オウンゴール', sot: '枠内シュート', soff: '枠外シュート', sblk: 'ブロックされたシュート',
    ast: 'アシスト', kp: 'キーパス', tkl: 'タックル', itc: 'インターセプト', clr: 'クリア', ck: 'コーナーキック', tov: 'ボールロスト', foul: 'ファウル',
    off: 'オフサイド', yc: 'イエローカード', rc: 'レッドカード', note: 'メモ',
  };
  HL.eventText = (e) => {
    if (e.type === 'tov') return 'ボールロスト（' + C.tovLabel(e.sub || 'other').replace(/（.*）/, '') + '）';
    if (e.type === 'foul') return 'ファウル（' + C.foulLabel(e.sub || 'other').replace(/（.*）/, '') + '）';
    if (e.type === 'goal' && e.body === 'head') return 'ヘディングでゴール';
    return EV_TEXT[e.type] || e.type;
  };
  const PRI = { goal: 5, pkg: 4.5, og: 3, ast: 3, sot: 2.2, kp: 1.6, sblk: 1.2, soff: 1.1, pkx: 2.5, tkl: 1.2, itc: 1.2, clr: 0.8, ck: 0.8, tov: 1.3, foul: 0.9, off: 0.8, yc: 1.5, rc: 3, note: 1 };

  /* ---------- 条件に合うイベント ---------- */
  function matches(e, f, ctx) {
    if (f.team && e.team !== f.team) return false;
    if (f.num != null && e.num !== f.num) return false;
    if (f.types && !f.types.includes(e.type)) return false;
    if (f.sub && e.sub !== f.sub) return false;
    if (f.q && D.periodAt(ctx.periods, e.t) !== f.q) return false;
    if (f.zoneGrp || f.zone) {
      const pos = C.shotPos(e);
      const z = pos ? C.zoneFor(pos.sx, pos.sy) : e.zone;
      if (f.zone && z !== f.zone) return false;
      if (f.zoneGrp && C.zoneGroup(z) !== f.zoneGrp) return false;
    }
    if (f.fieldZones) {
      const z = C.zoneOfEvent(e);
      if (!z || !f.fieldZones.includes(z)) return false;
    }
    if (f.scene) {
      const sc = e.scene || (C.EVENTS[e.type] && C.EVENTS[e.type].pk ? 'pk' : C.SCENE_DEFAULT);
      if (sc !== f.scene) return false;
    }
    return true;
  }
  HL.matches = matches;

  /** その条件に合うクリップ範囲（生）を作る */
  function rawWindows(preset, S, state, dur) {
    const st = HL.st;
    const cfg = state.cfg;
    const pre = cfg.pre;
    const post = cfg.post;
    const ctx = { periods: state.periods };
    const win = [];
    const clampT = (t0, t1) => [Math.max(0, t0), Math.min(dur, t1)];
    const addAnchor = (e, extra) => {
      const [a, b] = clampT(e.t - pre, e.t + post);
      win.push(Object.assign({ start: a, end: b, t: e.t, events: [e], key: e.id, pri: HL.priority(e, S) }, extra || {}));
    };
    const common = (e) => (st.num == null || e.num === st.num) && (!st.q || D.periodAt(state.periods, e.t) === st.q);

    if (preset.needsPlayer && st.num == null) return [];
    let f = null;
    if (preset.custom) f = Object.assign({}, st.filter || {});
    else if (preset.types) f = { team: preset.team, types: preset.types };
    const special = preset.special || (f && f.special);

    if (special === 'concede' || special === 'scored') {
      const side = special === 'concede' ? 'against' : 'for';
      const items = GL.build(state, S, { side });
      const sel = st.causes && st.causes.length ? new Set(st.causes) : f && f.causes ? new Set(f.causes) : f && f.cause ? new Set([f.cause]) : null;
      for (const it of items) {
        if (sel && !it.causes.some((c) => sel.has(c))) continue;
        if (st.num != null && !it.scorers.some((s) => s.num === st.num)) continue;
        if (st.q && it.q !== st.q) continue;
        win.push({ start: it.start, end: Math.min(dur, it.end), t: it.t, events: it.events, key: it.key, pri: 3 + it.xg * 3, label: it.label, team: it.team, noMerge: true, gl: it, side });
      }
      return win;
    }
    if (special === 'toAllowed') {
      const team = (f && f.team) || 'H';
      for (const s of S.tov[team].seq) {
        const [a, b] = clampT(s.from - 5, s.to + 2.5);
        const evs = S.events.filter((e) => e.t >= s.from - 1.2 && e.t <= s.to + 1);
        win.push({ start: a, end: b, t: s.from, events: evs, key: 'toa' + s.from.toFixed(1), pri: s.goal ? 5 : 3, label: 'ボールロスト → ' + (s.goal ? '失点' : '相手のシュート'), team });
      }
      return win;
    }
    if (special === 'regainAtk') {
      const team = (f && f.team) || 'H';
      for (const s of S.regain[team].seq) {
        const [a, b] = clampT(s.from - 4, s.to + 3);
        const evs = S.events.filter((e) => e.t >= s.from - 1 && e.t <= s.to + 1);
        win.push({ start: a, end: b, t: s.from, events: evs, key: 'rg' + s.from.toFixed(1), pri: s.goal ? 5 : 3, label: 'ボール奪取 → ' + (s.goal ? '得点' : 'シュート'), team });
      }
      return win;
    }
    if (special === 'foulSet') {
      const team = (f && f.team) || 'H';
      for (const s of S.fouls[team].setSeq) {
        const [a, b] = clampT(s.from - 4, s.to + 3);
        const evs = S.events.filter((e) => e.t >= s.from - 1 && e.t <= s.to + 1);
        win.push({ start: a, end: b, t: s.from, events: evs, key: 'fs' + s.from.toFixed(1), pri: s.goal ? 5 : 3, label: 'ファウル → ' + (s.goal ? 'セットプレーで失点' : 'セットプレー'), team });
      }
      return win;
    }
    if (special === 'spells') {
      const list = f && f.team ? S.spells.filter((s) => s.team === f.team) : S.spells;
      for (const r of list) {
        const [a, b] = clampT(r.t0 - 6, r.t1 + 3);
        const evs = S.events.filter((e) => e.t >= r.t0 - 0.1 && e.t <= r.t1 + 0.1);
        win.push({ start: a, end: b, t: r.t0, events: evs, key: 'sp' + r.team + r.t0.toFixed(1), pri: 3 + r.n / 2, label: `${state.teams[r.team].name}が押し込んだ時間帯（シュート${r.n}本${r.goals ? '・' + r.goals + '得点' : ''}）`, team: r.team, noMerge: true });
      }
      return win;
    }
    if (special === 'saves') {
      const team = (f && f.team) || 'H'; // このチームのGKのセーブ
      for (const e of S.events) {
        if (e.team === D.other(team) && (e.type === 'sot' || (e.type === 'pkx' && e.sub === 'saved')) && common(e)) addAnchor(e, { label: 'GKのセーブ（' + SL.store.playerLabel(D.other(team), e.num) + 'のシュート）', team });
      }
      return win;
    }
    if (special === 'big') {
      const team = (f && f.team) || 'H';
      const missed = !!(f && f.missed);
      for (const e of S.events) {
        if (!C.isShot(e) || e.team !== team || e.type === 'pkg' || e.type === 'pkx' || !common(e)) continue;
        const xg = S.xgOf.get(e.id).xg;
        if (xg < X.BIG) continue;
        if (missed && D.isGoal(e)) continue;
        addAnchor(e, { pri: 3 + xg * 5, label: `決定機（xG ${xg.toFixed(2)}）${SL.store.playerLabel(e.team, e.num)} ${D.isGoal(e) ? 'ゴール' : e.type === 'sot' ? '枠内シュート' : e.type === 'soff' ? '枠外シュート' : 'ブロックされたシュート'}` });
      }
      return win;
    }
    if (special === 'best') {
      const types = ['goal', 'pkg', 'ast', 'sot', 'kp'];
      for (const e of S.events) {
        if (!common(e)) continue;
        if (e.team === 'H' && types.includes(e.type)) {
          if (e.type === 'sot' || e.type === 'kp') {
            const xg = e.type === 'sot' ? S.xgOf.get(e.id).xg : 0;
            if (e.type === 'sot' && xg < X.BIG) continue;
            if (e.type === 'kp') continue;
          }
          addAnchor(e);
        } else if (e.team === 'A' && e.type === 'sot' && S.gk.H != null) {
          addAnchor(e, { label: 'GKのセーブ（' + SL.store.playerLabel('H', S.gk.H) + '）', pri: 2.6 });
        }
      }
      return win;
    }
    if (f) {
      for (const e of S.events) {
        if (!matches(e, f, ctx) || !common(e)) continue;
        addAnchor(e);
      }
    }
    return win;
  }

  /** クリップの重要度（得点・種類・xG・リードチェンジ） */
  HL.priority = (e, S) => {
    let p = PRI[e.type] || 0;
    if (C.isShot(e) && S && S.xgOf && S.xgOf.has(e.id)) p += S.xgOf.get(e.id).xg * 4;
    if (D.isScore(e) && S && S.tl) {
      const i = S.tl.findIndex((x) => x.id === e.id);
      if (i > 0) {
        const a = S.tl[i - 1];
        const b = S.tl[i];
        const da = a.H - a.A;
        const db = b.H - b.A;
        if (Math.sign(da) !== Math.sign(db) && db !== 0) p += 1.5; // リードチェンジ
        else if (db === 0) p += 1; // 同点
      }
    }
    return p;
  };

  function labelOf(c) {
    if (c.label) return c.label;
    const evs = c.events.slice().sort((a, b) => (PRI[b.type] || 0) - (PRI[a.type] || 0));
    const top = evs[0];
    if (!top) return 'シーン';
    const who = top.num != null ? SL.store.playerLabel(top.team, top.num) : SL.store.teamName(top.team);
    let text = who + ' ' + HL.eventText(top);
    const helper = evs.find((e) => e !== top && (e.type === 'ast' || e.type === 'kp') && e.team === top.team);
    if (helper && helper.num != null) text += '（' + (helper.type === 'ast' ? 'アシスト ' : 'ラストパス ') + '#' + helper.num + '）';
    return text;
  }

  /** 状態からクリップ一覧を作り直す */
  HL.compute = () => {
    const state = SL.store.state;
    const st = HL.st;
    const preset = HL.PRESETS.find((p) => p.id === st.presetId) || HL.PRESETS[0];
    const dur = SL.player.duration || (state.events.length ? state.events[state.events.length - 1].t + 10 : 60);
    const S = SL.stats.compute(state);
    HL._S = S;
    const raw = rawWindows(preset, S, state, dur);
    raw.sort((a, b) => a.start - b.start);
    // 重なるクリップは1つにまとめる（得点／失点シーンは1本ずつ別のクリップ）
    const merged = [];
    for (const w of raw) {
      const last = merged[merged.length - 1];
      if (last && !w.noMerge && !last.noMerge && w.start <= last.end + 0.6) {
        last.end = Math.max(last.end, w.end);
        last.events = last.events.concat(w.events.filter((e) => !last.events.includes(e)));
        last.pri += w.pri;
        if (w.label && !last.label) last.label = w.label;
      } else {
        const nw = Object.assign({}, w);
        // 前のクリップと映像が重なる分は、後ろのクリップの頭を詰める
        if (nw.noMerge && last && nw.start < last.end) nw.start = Math.min(nw.t - 1, Math.max(nw.start, last.end));
        merged.push(nw);
      }
    }
    // 目標の長さ（おすすめ順に採用）
    const target = state.cfg.targetSec || (preset.special === 'best' ? 90 : 0);
    let picked = merged;
    if (target > 0) {
      const byPri = merged.slice().sort((a, b) => b.pri - a.pri);
      const chosen = [];
      let sum = 0;
      for (const c of byPri) {
        const len = c.end - c.start;
        if (sum + len > target * 1.12 && chosen.length) continue;
        chosen.push(c);
        sum += len;
        if (sum >= target) break;
      }
      picked = chosen;
    }
    if (st.order === 'cause') {
      const pi = (c) => (c.gl ? GL.priorityIndex(c.gl.primary) : 99);
      picked = picked.slice().sort((a, b) => pi(a) - pi(b) || a.start - b.start);
    } else if (st.order === 'score') picked = picked.slice().sort((a, b) => b.pri - a.pri);
    else if (st.order === 'manual') {
      const idx = (c) => {
        const i = st.manual.indexOf(c.key);
        return i < 0 ? 1e6 + c.start : i;
      };
      picked = picked.slice().sort((a, b) => idx(a) - idx(b));
    } else picked = picked.slice().sort((a, b) => a.start - b.start);

    const primary = (c) => c.events.slice().sort((a, b) => (PRI[b.type] || 0) - (PRI[a.type] || 0))[0];
    HL.clips = picked.map((c, i) => {
      const ed = st.edits[c.key] || {};
      const p = primary(c);
      const team = c.team || (p ? p.team : 'H');
      const q = D.periodAt(state.periods, c.t);
      const gl = c.gl || null;
      return {
        key: c.key,
        idx: i,
        start: Math.max(0, c.start + (ed.dStart || 0)),
        end: Math.min(dur, Math.max(c.start + (ed.dStart || 0) + 1, c.end + (ed.dEnd || 0))),
        t: c.t,
        ev: p,
        events: c.events,
        team,
        pri: c.pri,
        off: !!ed.off,
        label: labelOf(c),
        sub: D.clockFull(state, c.t),
        q,
        baseStart: c.start,
        baseEnd: c.end,
        gl,
        side: c.side || null,
        causes: gl ? gl.causes : [],
        causeText: gl ? gl.causeText : '',
        ptsAgainst: c.side === 'against' ? 1 : 0,
        ptsFor: c.side === 'for' ? 1 : 0,
        note: (state.notes && state.notes[c.key]) || '',
      };
    });
    if (st.order !== 'manual') st.manual = HL.clips.map((c) => c.key);
    return HL.clips;
  };

  HL.active = () => HL.clips.filter((c) => !c.off);
  HL.totalSec = () => HL.active().reduce((a, c) => a + (c.end - c.start), 0);

  /** クリップの編集 */
  HL.edit = (key, patch) => {
    const ed = HL.st.edits[key] || (HL.st.edits[key] = {});
    Object.assign(ed, patch);
  };
  HL.trim = (key, which, delta) => {
    const ed = HL.st.edits[key] || (HL.st.edits[key] = {});
    if (which === 'start') ed.dStart = (ed.dStart || 0) + delta;
    else ed.dEnd = (ed.dEnd || 0) + delta;
  };
  HL.move = (key, dir) => {
    const st = HL.st;
    if (st.order !== 'manual') {
      st.manual = HL.clips.map((c) => c.key);
      st.order = 'manual';
    }
    const i = st.manual.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= st.manual.length) return;
    [st.manual[i], st.manual[j]] = [st.manual[j], st.manual[i]];
  };

  /** 開始／終了を、いまの再生位置にそろえる（映像を見ながらのカット編集） */
  HL.setEdge = (key, which, t) => {
    const c = HL.clips.find((x) => x.key === key);
    if (!c) return false;
    const ed = HL.st.edits[key] || (HL.st.edits[key] = {});
    if (which === 'start') {
      if (t > c.end - 1) return false;
      ed.dStart = Math.round((t - c.baseStart) * 10) / 10;
    } else {
      if (t < c.start + 1) return false;
      ed.dEnd = Math.round((t - c.baseEnd) * 10) / 10;
    }
    return true;
  };
  /** クリップごとのコメント（書き出す動画のテロップにも入る） */
  HL.setNote = (key, text) => {
    SL.store.patch((s) => {
      s.notes = s.notes || {};
      if (text) s.notes[key] = text;
      else delete s.notes[key];
    }, 'meta');
    HL.compute(); // 入力中で画面が再描画されなくても、プレビュー／書き出しにすぐ反映する
  };
  HL.toggleCause = (id) => {
    const st = HL.st;
    const i = st.causes.indexOf(id);
    if (i >= 0) st.causes.splice(i, 1);
    else st.causes.push(id);
  };
  /** 失点シーン／得点シーンの見直しを開く（cause を渡すとその原因だけ） */
  HL.openGoals = (side, cause, opts) => HL.open({ special: side === 'for' ? 'scored' : 'concede', causes: cause ? [cause] : undefined }, '', opts);
  HL.openConcede = (cause, opts) => HL.openGoals('against', cause, opts);

  /** ハイライト画面を開く。filter は「自分で選ぶ」の条件 */
  HL.open = (filter, label, opts) => {
    const st = HL.st;
    if (filter) {
      if (filter.special === 'concede' || filter.special === 'scored') {
        st.presetId = filter.special === 'concede' ? 'concede' : 'score_us';
        st.causes = filter.causes ? filter.causes.slice() : filter.cause ? [filter.cause] : [];
        st.num = filter.num != null ? filter.num : null;
        st.q = filter.q || null;
        st.filter = null;
        st.filterLabel = '';
      } else {
        st.presetId = 'custom';
        st.filter = filter;
        st.filterLabel = label || '';
        st.causes = [];
        st.num = null;
        st.q = null;
      }
    }
    st.edits = {};
    st.manual = [];
    st.order = 'time';
    SL.ui.setTab('hl');
    HL.refresh();
    if (!opts || opts.play !== false) HL.play(0);
  };
  HL.refresh = () => {
    HL.compute();
    SL.timeline.setClips(HL.active(), HL.st.playing ? HL.st.playIdx : -1);
    HL.emit();
  };

  /* ---------- プレビュー再生 ---------- */
  HL.play = async (idx) => {
    const list = HL.active();
    if (!list.length) {
      U.toast('該当するシーンがありません');
      return;
    }
    idx = U.clamp(idx, 0, list.length - 1);
    const st = HL.st;
    const my = ++HL.token;
    st.playIdx = idx;
    st.playing = true;
    const c = list[idx];
    SL.ui.showClipTag(c, idx, list.length);
    SL.timeline.setClips(list, idx);
    HL.emit();
    await SL.player.seek(c.start);
    if (my !== HL.token) return;
    SL.player.play();
  };
  HL.next = () => {
    const list = HL.active();
    if (HL.st.playIdx + 1 < list.length) HL.play(HL.st.playIdx + 1);
    else HL.stop();
  };
  HL.prev = () => HL.play(Math.max(0, HL.st.playIdx - 1));
  HL.stop = () => {
    HL.token++;
    const was = HL.st.playing;
    HL.st.playing = false;
    HL.st.playIdx = -1;
    if (was) SL.player.pause();
    SL.ui.hideClipTag();
    SL.timeline.setClips(HL.active(), -1);
    HL.emit();
  };
  /** ユーザーが自分でシーク操作をしたら、連続プレビューは終了する */
  HL.userSeek = () => {
    if (HL.st.playing) {
      HL.token++;
      HL.st.playing = false;
      HL.st.playIdx = -1;
      SL.ui.hideClipTag();
      SL.timeline.setClips(HL.active(), -1);
      HL.emit();
    }
  };
  HL.onTime = (t) => {
    const st = HL.st;
    if (!st.playing || HL.exporting) return;
    const c = HL.active()[st.playIdx];
    if (!c) return;
    if (t >= c.end - 0.04) HL.next();
  };

  /* ---------- 動画の書き出し ---------- */
  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }
  HL.canExport = () => typeof MediaRecorder !== 'undefined' && !!document.createElement('canvas').captureStream;

  function fitRect(sw, sh, W, H) {
    const s = Math.min(W / sw, H / sh);
    return { x: (W - sw * s) / 2, y: (H - sh * s) / 2, w: sw * s, h: sh * s };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", sans-serif';

  function drawOverlay(ctx, W, H, c, i, n, t, tl, state) {
    const st = HL.st;
    if (st.scorebug) {
      const sc = D.scoreAt(tl, t);
      const hn = state.teams.H.name;
      const an = state.teams.A.name;
      const clock = D.clockFull(state, t);
      ctx.font = `700 26px ${FONT}`;
      const wH = ctx.measureText(hn).width;
      const wA = ctx.measureText(an).width;
      const bw = wH + wA + 190;
      const x0 = 32;
      const y0 = 28;
      ctx.fillStyle = 'rgba(8,12,24,0.78)';
      roundRect(ctx, x0, y0, bw, 50, 12);
      ctx.fill();
      ctx.fillStyle = state.teams.H.color;
      ctx.fillRect(x0, y0 + 8, 5, 34);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(hn, x0 + 16, y0 + 26);
      ctx.font = `800 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(sc.H), x0 + 16 + wH + 30, y0 + 26);
      ctx.fillText('-', x0 + 16 + wH + 62, y0 + 26);
      ctx.fillText(String(sc.A), x0 + 16 + wH + 94, y0 + 26);
      ctx.font = `700 26px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(an, x0 + 16 + wH + 118, y0 + 26);
      ctx.fillStyle = state.teams.A.color;
      ctx.fillRect(x0 + bw - 5, y0 + 8, 5, 34);
      ctx.font = `700 20px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'left';
      ctx.fillText(clock, x0 + bw + 14, y0 + 26);
    }
    if (st.lower) {
      // テロップ：1行目=内容、2行目=時刻（と失点の原因）、3行目=コメント
      const label = c.side === 'against' ? `失点｜${c.label}` : c.side === 'for' ? `得点｜${c.label}` : c.label;
      const sub = `${c.sub}　${c.causeText ? (c.side === 'against' ? '原因：' : '型：') + c.causeText + '　' : ''}（${i + 1} / ${n}）`;
      const lines = [
        { t: label, f: `800 34px ${FONT}`, c: '#fff', h: 46 },
        { t: sub, f: `600 20px ${FONT}`, c: '#b5c2de', h: 30 },
      ];
      if (c.note) lines.push({ t: '📝 ' + c.note, f: `700 24px ${FONT}`, c: '#ffd166', h: 36 });
      let wmax = 0;
      lines.forEach((l) => {
        ctx.font = l.f;
        wmax = Math.max(wmax, ctx.measureText(l.t).width);
      });
      const w = Math.min(W - 64, wmax + 70);
      const boxH = 22 + lines.reduce((a, l) => a + l.h, 0);
      const x0 = 32;
      const y0 = H - 40 - boxH;
      ctx.fillStyle = 'rgba(8,12,24,0.84)';
      roundRect(ctx, x0, y0, w, boxH, 14);
      ctx.fill();
      ctx.fillStyle = c.side === 'against' ? '#ff6b6b' : c.side === 'for' ? '#3ddc97' : state.teams[c.team] ? state.teams[c.team].color : '#2fd27f';
      ctx.fillRect(x0, y0 + 10, 7, boxH - 20);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let y = y0 + 11;
      lines.forEach((l) => {
        ctx.font = l.f;
        ctx.fillStyle = l.c;
        ctx.fillText(l.t, x0 + 24, y + l.h / 2, w - 40);
        y += l.h;
      });
    }
  }

  function drawCard(ctx, W, H, kind, k, state, extra) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0c1a14');
    g.addColorStop(1, '#14402c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const a = Math.min(1, k * 4, (1 - k) * 4);
    ctx.globalAlpha = Math.max(0, a);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (kind === 'title') {
      ctx.fillStyle = '#2fd27f';
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText('HIGHLIGHTS', W / 2, H / 2 - 92);
      ctx.fillStyle = '#fff';
      ctx.font = `800 64px ${FONT}`;
      ctx.fillText(state.title || (extra && extra.label) || 'ハイライト', W / 2, H / 2 - 20, W - 160);
      ctx.font = `600 34px ${FONT}`;
      ctx.fillStyle = '#c9f5dd';
      ctx.fillText(`${state.teams.H.name}  vs  ${state.teams.A.name}`, W / 2, H / 2 + 56);
      ctx.font = `500 24px ${FONT}`;
      ctx.fillStyle = '#8fc4a8';
      ctx.fillText(`${state.date || ''}　${(extra && extra.label) || ''}`, W / 2, H / 2 + 104);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = `800 52px ${FONT}`;
      ctx.fillText('おつかれさまでした！', W / 2, H / 2 - 24);
      ctx.font = `500 26px ${FONT}`;
      ctx.fillStyle = '#8fc4a8';
      ctx.fillText('サッカー分析ラボ で作成', W / 2, H / 2 + 40);
    }
    ctx.globalAlpha = 1;
  }

  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

  /** 選択中のクリップをつなげて 1 本の動画にする（ブラウザ内で録画するため、実時間かかります） */
  HL.export = async () => {
    const list = HL.active();
    if (!list.length) {
      U.toast('書き出すシーンがありません');
      return null;
    }
    if (!HL.canExport()) {
      U.toast('このブラウザは動画の書き出しに対応していません（Chrome / Edge をお使いください）', 'bad');
      return null;
    }
    if (HL.exporting) return null;
    const P = SL.player;
    const state = SL.store.state;
    const st = HL.st;
    HL.stop();
    const pos0 = P.time;
    const W = 1280;
    const H = 720;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const stream = cv.captureStream(30);
    let hasAudio = false;
    if (P.kind === 'file' && P.el.captureStream) {
      try {
        P.el
          .captureStream()
          .getAudioTracks()
          .forEach((t) => {
            stream.addTrack(t);
            hasAudio = true;
          });
      } catch (e) {}
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise((r) => (rec.onstop = r));
    const total = list.reduce((a, c) => a + (c.end - c.start), 0);
    const tl = D.scoreTimeline(state.events);
    const ex = (HL.exporting = { cancel: false, done: 0, total, clip: 0, n: list.length, started: performance.now() });
    HL.result = null;
    HL.emit();
    const preset = HL.PRESETS.find((p) => p.id === st.presetId) || {};
    const label = st.presetId === 'custom' ? st.filterLabel || preset.label : preset.label;

    rec.start(400);
    try {
      const cardMs = 2200;
      if (st.titleCard) {
        const t0 = performance.now();
        while (performance.now() - t0 < cardMs && !ex.cancel) {
          drawCard(ctx, W, H, 'title', (performance.now() - t0) / cardMs, state, { label });
          await nextFrame();
        }
      }
      for (let i = 0; i < list.length && !ex.cancel; i++) {
        const c = list[i];
        ex.clip = i + 1;
        await P.seek(c.start);
        const t0 = performance.now();
        if (P.kind === 'file') P.play();
        await new Promise((resolve) => {
          const tick = () => {
            if (ex.cancel) return resolve();
            const t = P.kind === 'file' ? P.el.currentTime : c.start + (performance.now() - t0) / 1000;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            if (P.kind === 'file') {
              const r = fitRect(P.el.videoWidth || W, P.el.videoHeight || H, W, H);
              ctx.drawImage(P.el, r.x, r.y, r.w, r.h);
            } else SL.sim.render(ctx, W, H, t, P.data);
            drawOverlay(ctx, W, H, c, i, list.length, t, tl, state);
            ex.done = Math.min(total, list.slice(0, i).reduce((a, x) => a + (x.end - x.start), 0) + Math.max(0, t - c.start));
            HL.emit();
            if (t >= c.end || (P.kind === 'file' && P.el.ended)) return resolve();
            requestAnimationFrame(tick);
          };
          tick();
        });
        if (P.kind === 'file') P.pause();
      }
      if (st.titleCard && !ex.cancel) {
        const t0 = performance.now();
        while (performance.now() - t0 < 1600 && !ex.cancel) {
          drawCard(ctx, W, H, 'end', (performance.now() - t0) / 1600, state);
          await nextFrame();
        }
      }
    } finally {
      try {
        rec.stop();
      } catch (e) {}
      await stopped;
      if (P.kind === 'file') P.pause();
    }
    const cancelled = ex.cancel;
    const secs = (performance.now() - ex.started) / 1000;
    HL.exporting = null;
    await P.seek(pos0);
    if (cancelled) {
      HL.emit();
      return null;
    }
    const type = (mime || 'video/webm').split(';')[0];
    const blob = new Blob(chunks, { type });
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const base = (state.title || 'highlight').replace(/[\\/:*?"<>|\s]+/g, '_');
    const name = `${base}_${(label || 'clips').replace(/[\\/:*?"<>|\s]+/g, '_')}.${ext}`;
    if (HL.result && HL.result.url) URL.revokeObjectURL(HL.result.url);
    HL.result = { blob, url: URL.createObjectURL(blob), name, size: blob.size, secs, clips: list.length, dur: total, type, hasAudio };
    HL.emit();
    return HL.result;
  };
  HL.cancelExport = () => {
    if (HL.exporting) HL.exporting.cancel = true;
  };

  /** ffmpeg を使える人向け：無劣化で切り出すスクリプト */
  HL.ffmpegScript = () => {
    const list = HL.active();
    const vname = SL.store.state.video.name || 'input.mp4';
    const lines = ['#!/bin/sh', '# サッカー分析ラボ: ハイライト切り出しスクリプト（ffmpeg が必要です）', `SRC="${vname.replace(/"/g, '')}"`, 'mkdir -p clips'];
    list.forEach((c, i) => {
      const n = String(i + 1).padStart(3, '0');
      lines.push(`ffmpeg -y -ss ${c.start.toFixed(2)} -to ${c.end.toFixed(2)} -i "$SRC" -c:v libx264 -c:a aac clips/clip_${n}.mp4  # ${c.label}`);
    });
    lines.push('ls clips/*.mp4 | sed "s/^/file /" > clips/list.txt');
    lines.push('ffmpeg -y -f concat -safe 0 -i clips/list.txt -c copy highlight.mp4');
    return lines.join('\n') + '\n';
  };
})();
