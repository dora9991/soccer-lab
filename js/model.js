/* サッカー分析ラボ - 定数とデータストア */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = (SL.C = {});

  /* ---------- イベント（タグ）の種類 ----------
   * shot=シュート / goal=得点 / on=枠内 / blocked=ブロックされた
   * loc=ピッチ上の位置を付けられる / noPlayer=選手なし */
  C.EVENTS = {
    goal: { label: 'ゴール', short: 'GOAL', key: 'KeyQ', kl: 'Q', group: 'shot', shot: true, goal: true, on: true, loc: true, color: '#3ddc97' },
    sot: { label: '枠内シュート（止められた）', short: '枠内', key: 'KeyW', kl: 'W', group: 'shot', shot: true, on: true, loc: true, color: '#5ad1ff' },
    soff: { label: '枠外シュート', short: '枠外', key: 'KeyE', kl: 'E', group: 'shot', shot: true, loc: true, color: '#8892a6' },
    sblk: { label: 'ブロックされたシュート', short: 'ブロック', key: 'KeyR', kl: 'R', group: 'shot', shot: true, blocked: true, loc: true, color: '#c792ea' },
    pkg: { label: 'PK成功', short: 'PK○', key: 'KeyT', kl: 'T', group: 'shot', shot: true, goal: true, on: true, pk: true, color: '#3ddc97' },
    pkx: { label: 'PK失敗', short: 'PK×', key: 'KeyY', kl: 'Y', group: 'shot', shot: true, pk: true, color: '#8892a6' },
    og: { label: 'オウンゴール', short: 'OG', key: 'KeyU', kl: 'U', group: 'shot', own: true, color: '#ff9f43' },
    ast: { label: 'アシスト', short: 'AST', key: 'KeyA', kl: 'A', group: 'play', color: '#5ad1ff' },
    kp: { label: 'キーパス（シュートの一つ前）', short: 'KP', key: 'KeyS', kl: 'S', group: 'play', color: '#7fdcff' },
    tkl: { label: 'タックル成功（ボール奪取）', short: 'TKL', key: 'KeyD', kl: 'D', group: 'play', loc: true, color: '#52d681' },
    itc: { label: 'インターセプト', short: 'INT', key: 'KeyF', kl: 'F', group: 'play', loc: true, color: '#a8e05a' },
    clr: { label: 'クリア', short: 'CLR', key: 'KeyG', kl: 'G', group: 'play', loc: true, color: '#a8b3c7' },
    ck: { label: 'コーナーキック', short: 'CK', key: 'KeyC', kl: 'C', group: 'play', color: '#e6c15a' },
    tov: { label: 'ボールロスト', short: 'LOST', key: 'KeyZ', kl: 'Z', group: 'bad', loc: true, color: '#ff6b6b' },
    foul: { label: 'ファウル（犯した）', short: 'FOUL', key: 'KeyX', kl: 'X', group: 'bad', loc: true, color: '#ffd166' },
    off: { label: 'オフサイド', short: 'OFF', key: 'KeyB', kl: 'B', group: 'bad', loc: true, color: '#f0a35e' },
    yc: { label: 'イエローカード', short: 'Y', key: 'KeyJ', kl: 'J', group: 'bad', color: '#ffd400' },
    rc: { label: 'レッドカード', short: 'R', key: 'KeyK', kl: 'K', group: 'bad', color: '#ff3b3b' },
    note: { label: 'メモ（しおり）', short: 'メモ', key: 'KeyN', kl: 'N', group: 'bad', noPlayer: true, color: '#ffffff' },
  };
  C.EVENT_ORDER = ['goal', 'sot', 'soff', 'sblk', 'pkg', 'pkx', 'og', 'ast', 'kp', 'tkl', 'itc', 'clr', 'ck', 'tov', 'foul', 'off', 'yc', 'rc', 'note'];
  C.EVENT_GROUPS = [
    { id: 'shot', label: 'シュート・得点' },
    { id: 'play', label: 'チャンスメイク・守備・セットプレー' },
    { id: 'bad', label: 'ミス・反則・カード・メモ' },
  ];
  C.KEY_TO_EVENT = {};
  Object.keys(C.EVENTS).forEach((k) => (C.KEY_TO_EVENT[C.EVENTS[k].key] = k));
  C.isShot = (e) => !!(C.EVENTS[e.type] && C.EVENTS[e.type].shot);
  C.isGoal = (e) => e.type === 'goal' || e.type === 'pkg';
  C.isOnTarget = (e) => !!(C.EVENTS[e.type] && C.EVENTS[e.type].on);
  C.SHOT_TYPES = ['goal', 'sot', 'soff', 'sblk', 'pkg', 'pkx'];
  C.GOAL_TYPES = ['goal', 'pkg', 'og'];

  /* ---------- 攻撃のきっかけ・型（タグの「場面」） ---------- */
  C.SCENES = [
    { id: 'build', label: '組み立て（遅攻）', short: '組み立て', hint: 'パスをつないで組み立てた攻め', open: true },
    { id: 'counter', label: 'カウンター（速攻）', short: 'カウンター', hint: '奪ってから素早く攻めた（相手の陣形が整う前）', open: true },
    { id: 'press', label: 'ハイプレス→ショートカウンター', short: 'ハイプレス', hint: '高い位置で奪ってすぐにゴールを狙った', open: true },
    { id: 'cross', label: 'サイド攻撃・クロス', short: 'クロス', hint: 'サイドからのクロスで作った', open: true },
    { id: 'through', label: '中央突破・スルーパス', short: 'スルーパス', hint: '縦パス・ワンツー・スルーパスで崩した', open: true },
    { id: 'long', label: 'ロングボール・裏抜け', short: 'ロングボール', hint: '背後へのボールで抜け出した', open: true },
    { id: 'solo', label: 'ドリブル・個人技', short: '個人技', hint: '1対1の突破や、ミドルシュートなど個人で決めた', open: true },
    { id: 'corner', label: 'コーナーキック', short: 'CK', hint: 'コーナーキックから（こぼれ球含む）', set: true },
    { id: 'fk', label: 'フリーキック', short: 'FK', hint: '直接・間接フリーキックから', set: true },
    { id: 'throw', label: 'スローイン', short: 'スロー', hint: 'スローイン（ロングスロー含む）から', set: true },
    { id: 'pk', label: 'ペナルティキック', short: 'PK', hint: 'ペナルティキック', set: true },
  ];
  C.SCENE_DEFAULT = 'build';
  C.sceneOf = (id) => C.SCENES.find((s) => s.id === id) || C.SCENES[0];
  C.sceneLabel = (id) => C.sceneOf(id).label;
  C.sceneShort = (id) => C.sceneOf(id).short;
  C.isSetPiece = (id) => !!C.sceneOf(id).set;

  /* ---------- ボールロスト／ファウル／体の部位 ---------- */
  C.TOV_TYPES = [
    { id: 'pass', label: 'パスミス（受け手に届かない）', drill: 'passing' },
    { id: 'dribble', label: 'ドリブルで奪われた', drill: 'dribble' },
    { id: 'control', label: 'トラップミス・ボールが足につかない', drill: 'passing' },
    { id: 'long', label: 'ロングボールが通らない', drill: 'buildup' },
    { id: 'clear', label: '苦し紛れのクリア・キックミス', drill: 'buildup' },
    { id: 'other', label: 'その他・不明', drill: 'buildup' },
  ];
  C.tovLabel = (id) => (C.TOV_TYPES.find((t) => t.id === id) || C.TOV_TYPES[C.TOV_TYPES.length - 1]).label;
  C.FOUL_TYPES = [
    { id: 'contact', label: '接触・タックル', drill: 'discipline' },
    { id: 'hold', label: '押す・引っ張る', drill: 'discipline' },
    { id: 'trip', label: '足をかける・遅れて入る', drill: 'oneonone' },
    { id: 'hand', label: 'ハンド', drill: 'boxdef' },
    { id: 'danger', label: '危険なプレー', drill: 'discipline' },
    { id: 'other', label: 'その他・不明', drill: 'discipline' },
  ];
  C.foulLabel = (id) => (C.FOUL_TYPES.find((t) => t.id === id) || C.FOUL_TYPES[C.FOUL_TYPES.length - 1]).label;
  C.BODY = [
    { id: 'foot', label: '足' },
    { id: 'head', label: 'ヘディング' },
  ];

  /* ---------- ピッチと座標 ----------
   * ピッチ座標 (px, py)：m。px = 自陣ゴールライン→敵ゴールライン (0〜105)、
   * py = 攻める向きに対して左端→右端 (0〜68)。どちらのチームも「右へ攻める」向きにそろえる。
   * シュート座標 (sx, sy)：sx = ゴール中央からの横ずれ (負=左)、sy = ゴールラインからの距離。 */
  C.PITCH = { L: 105, W: 68, boxD: 16.5, boxHalf: 20.16, sixD: 5.5, sixHalf: 9.16, spot: 11, goalHalf: 3.66, arcR: 9.15 };
  C.toShot = (px, py) => ({ sx: py - C.PITCH.W / 2, sy: C.PITCH.L - px });
  C.fromShot = (sx, sy) => ({ px: C.PITCH.L - sy, py: sx + C.PITCH.W / 2 });
  /** イベントのシュート位置 {sx, sy}（無ければ null） */
  C.shotPos = (e) => {
    if (e.px != null && e.py != null) return C.toShot(e.px, e.py);
    return null;
  };

  /* ---------- シュートゾーン ---------- */
  C.ZONES = [
    { id: 'six', label: 'ゴールエリア内', grp: 'box' },
    { id: 'boxC', label: 'PA内・正面', grp: 'box' },
    { id: 'boxL', label: 'PA内・左', grp: 'box' },
    { id: 'boxR', label: 'PA内・右', grp: 'box' },
    { id: 'edgeC', label: 'PA外・正面（〜25m）', grp: 'edge' },
    { id: 'edgeL', label: 'PA外・左', grp: 'edge' },
    { id: 'edgeR', label: 'PA外・右', grp: 'edge' },
    { id: 'wideL', label: 'サイド・左（角度なし）', grp: 'wide' },
    { id: 'wideR', label: 'サイド・右（角度なし）', grp: 'wide' },
    { id: 'far', label: 'ロングシュート（25m〜）', grp: 'far' },
  ];
  C.ZONE_GROUPS = [
    { id: 'box', label: 'ペナルティエリア内' },
    { id: 'edge', label: 'PAの外〜25m' },
    { id: 'wide', label: 'サイドの深い位置（角度が狭い）' },
    { id: 'far', label: 'ロングシュート（25m以遠）' },
  ];
  C.zoneLabel = (id) => (C.ZONES.find((z) => z.id === id) || { label: '位置未入力' }).label;
  C.zoneGroup = (id) => (C.ZONES.find((z) => z.id === id) || {}).grp || null;
  C.zoneFor = (sx, sy) => {
    const P = C.PITCH;
    const ax = Math.abs(sx);
    if (sy > 25) return 'far';
    if (ax > P.boxHalf) return sx < 0 ? 'wideL' : 'wideR';
    if (sy <= P.boxD) {
      if (ax <= P.sixHalf) return sy <= P.sixD ? 'six' : 'boxC';
      return sx < 0 ? 'boxL' : 'boxR';
    }
    if (ax <= P.sixHalf) return 'edgeC';
    return sx < 0 ? 'edgeL' : 'edgeR';
  };

  /* ---------- 場所（ボールロスト・ファウルなど） ---------- */
  C.FIELD_ZONES = [
    { id: 'ownBox', label: '自陣ペナルティエリア内', short: '自陣PA内' },
    { id: 'def3', label: '自陣ゴール前（〜3分の1）', short: '自陣' },
    { id: 'mid3', label: '中盤', short: '中盤' },
    { id: 'att3', label: '敵陣（最終ライン付近まで）', short: '敵陣' },
    { id: 'oppBox', label: '敵ペナルティエリア内', short: '敵PA内' },
  ];
  C.fieldZoneLabel = (id) => (C.FIELD_ZONES.find((z) => z.id === id) || { label: '場所未入力' }).label;
  C.fieldZoneShort = (id) => (C.FIELD_ZONES.find((z) => z.id === id) || { short: '—' }).short;
  C.fieldZone = (px, py) => {
    const P = C.PITCH;
    const inLat = Math.abs(py - P.W / 2) <= P.boxHalf;
    if (px >= P.L - P.boxD && inLat) return 'oppBox';
    if (px <= P.boxD && inLat) return 'ownBox';
    if (px < 35) return 'def3';
    if (px < 70) return 'mid3';
    return 'att3';
  };
  C.zoneOfEvent = (e) => (e.px != null && e.py != null ? C.fieldZone(e.px, e.py) : null);

  /* ---------- 前半・後半 ---------- */
  C.PERIODS = { 1: '前半', 2: '後半', 3: '延長前半', 4: '延長後半' };
  C.periodLabel = (q) => C.PERIODS[q] || 'P' + q;

  /* ---------- レベル別の目安（参考値・1チーム90分あたり） ---------- */
  C.LEVELS = {
    pro: { name: 'プロ・社会人トップ級', shotAcc: 0.34, conv: 0.1, xgShot: 0.11, fouls90: 12, yc90: 1.9, off90: 2.2, corner90: 5, farMax: 0.35, setGoal: 0.28 },
    univ: { name: '大学・高校（強豪〜標準）', shotAcc: 0.32, conv: 0.11, xgShot: 0.11, fouls90: 13, yc90: 1.8, off90: 2.5, corner90: 5, farMax: 0.36, setGoal: 0.3 },
    club: { name: '中学・部活・少年サッカー', shotAcc: 0.28, conv: 0.12, xgShot: 0.11, fouls90: 14, yc90: 1.5, off90: 3, corner90: 5, farMax: 0.38, setGoal: 0.3 },
  };

  /* ---------- 初期状態 ---------- */
  SL.defaultState = () => ({
    v: 1,
    title: '',
    date: U.today(),
    video: { name: '', size: 0, duration: 0 },
    teams: {
      H: { name: '自チーム', color: '#3d7bff', roster: [] },
      A: { name: '相手チーム', color: '#ff5a5a', roster: [] },
    },
    periods: [{ q: 1, start: 0 }],
    events: [],
    notes: {}, // ハイライトのクリップごとのコメント（key → 文字）
    nextId: 1,
    cfg: { level: 'club', pre: 8, post: 4, delay: 1.0, targetSec: 0, halfMin: 45, possH: null },
  });
  const CFG_DEFAULT = () => SL.defaultState().cfg;

  /* ---------- ストア ---------- */
  const KEY_USER = 'sll.user.v1';
  const KEY_BACKUP = 'sll.backup.v1';
  const idNum = (id) => parseInt(String(id).slice(1), 10) || 0;

  const store = (SL.store = {
    state: null,
    mode: 'user', // 'user' | 'sample'
    hist: [],
    fut: [],
    _l: new Set(),
    _saveTimer: null,

    on(fn) {
      this._l.add(fn);
      return () => this._l.delete(fn);
    },
    emit(kind) {
      this._l.forEach((fn) => {
        try {
          fn(kind || 'all');
        } catch (e) {
          console.error(e);
        }
      });
    },

    /* --- 永続化 --- */
    readUser() {
      try {
        const raw = typeof localStorage !== 'undefined' && localStorage.getItem(KEY_USER);
        if (!raw) return null;
        return store.normalize(JSON.parse(raw));
      } catch (e) {
        return null;
      }
    },
    hasUserWork() {
      const s = store.readUser();
      return !!(s && (s.events.length || s.teams.H.roster.length || s.video.name));
    },
    save() {
      if (store.mode !== 'user') return;
      clearTimeout(store._saveTimer);
      store._saveTimer = setTimeout(store.saveNow, 250);
    },
    saveNow() {
      if (store.mode !== 'user') return;
      try {
        localStorage.setItem(KEY_USER, JSON.stringify(store.state));
      } catch (e) {
        console.warn('保存できませんでした', e);
        if (!store._warnedSave && typeof document !== 'undefined') {
          store._warnedSave = true;
          U.toast('このブラウザの設定では自動保存ができません。「設定」タブの「分析データを保存（JSON）」で保存してください', 'bad');
        }
      }
    },
    backupUser() {
      try {
        const raw = localStorage.getItem(KEY_USER);
        if (raw) localStorage.setItem(KEY_BACKUP, raw);
      } catch (e) {}
    },
    normalize(s) {
      const d = SL.defaultState();
      const out = Object.assign(d, s || {});
      out.teams = {
        H: Object.assign(d.teams.H, (s && s.teams && s.teams.H) || {}),
        A: Object.assign(d.teams.A, (s && s.teams && s.teams.A) || {}),
      };
      out.teams.H.roster = out.teams.H.roster || [];
      out.teams.A.roster = out.teams.A.roster || [];
      out.video = Object.assign({ name: '', size: 0, duration: 0 }, (s && s.video) || {});
      out.cfg = Object.assign(CFG_DEFAULT(), (s && s.cfg) || {});
      out.periods = Array.isArray(out.periods) && out.periods.length ? out.periods : [{ q: 1, start: 0 }];
      out.events = Array.isArray(out.events) ? out.events : [];
      out.notes = out.notes && typeof out.notes === 'object' && !Array.isArray(out.notes) ? out.notes : {};
      out.events.sort((a, b) => a.t - b.t || idNum(a.id) - idNum(b.id));
      let max = 0;
      out.events.forEach((e) => (max = Math.max(max, idNum(e.id))));
      out.nextId = Math.max(out.nextId || 1, max + 1);
      return out;
    },

    /* --- 状態の入れ替え --- */
    useUser() {
      store.mode = 'user';
      store.state = store.readUser() || SL.defaultState();
      store.hist = [];
      store.fut = [];
      store.emit('all');
    },
    useSample(sampleState) {
      store.mode = 'sample';
      store.state = store.normalize(JSON.parse(JSON.stringify(sampleState)));
      store.hist = [];
      store.fut = [];
      store.emit('all');
    },
    /** 新しい自分の分析を始める（名簿は引き継ぐ） */
    newUserProject(opts) {
      const prev = store.mode === 'user' ? store.state : store.readUser();
      const s = SL.defaultState();
      if (prev) {
        s.teams.H = JSON.parse(JSON.stringify(prev.teams.H));
        s.teams.A = { name: prev.teams.A.name, color: prev.teams.A.color, roster: [] };
        s.cfg = Object.assign({}, prev.cfg, { possH: null });
      }
      Object.assign(s, opts || {});
      store.mode = 'user';
      store.state = s;
      store.hist = [];
      store.fut = [];
      store.saveNow();
      store.emit('all');
    },
    exportJSON() {
      return JSON.stringify({ app: 'soccer-lab', ...store.state }, null, 1);
    },
    importJSON(text) {
      const obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.events)) throw new Error('この形式のファイルではありません');
      store.mode = 'user';
      store.state = store.normalize(obj);
      store.hist = [];
      store.fut = [];
      store.saveNow();
      store.emit('all');
    },

    /* --- 取り消し／やり直し --- */
    _snap() {
      const s = store.state;
      return JSON.stringify({ events: s.events, periods: s.periods, teams: s.teams, nextId: s.nextId });
    },
    _restore(str) {
      const o = JSON.parse(str);
      Object.assign(store.state, o);
    },
    pushHist() {
      store.hist.push(store._snap());
      if (store.hist.length > 150) store.hist.shift();
      store.fut = [];
    },
    canUndo() {
      return store.hist.length > 0;
    },
    undo() {
      if (!store.hist.length) return false;
      store.fut.push(store._snap());
      store._restore(store.hist.pop());
      store.save();
      store.emit('events');
      return true;
    },
    redo() {
      if (!store.fut.length) return false;
      store.hist.push(store._snap());
      store._restore(store.fut.pop());
      store.save();
      store.emit('events');
      return true;
    },

    /* --- イベント操作 --- */
    _insert(ev) {
      const list = store.state.events;
      let lo = 0,
        hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].t <= ev.t) lo = mid + 1;
        else hi = mid;
      }
      list.splice(lo, 0, ev);
    },
    addEvent(ev, opts) {
      if (!(opts && opts.noHist)) store.pushHist();
      ev = Object.assign({}, ev);
      ev.id = 'e' + store.state.nextId++;
      ev.t = Math.round(ev.t * 10) / 10;
      store._insert(ev);
      store.save();
      store.emit('events');
      return ev;
    },
    getEvent(id) {
      return store.state.events.find((e) => e.id === id);
    },
    updateEvent(id, patch, opts) {
      const e = store.getEvent(id);
      if (!e) return null;
      if (!(opts && opts.noHist)) store.pushHist();
      Object.assign(e, patch);
      Object.keys(patch).forEach((k) => {
        if (patch[k] === undefined) delete e[k];
      });
      if (patch.t != null) {
        e.t = Math.round(e.t * 10) / 10;
        const list = store.state.events;
        list.splice(list.indexOf(e), 1);
        store._insert(e);
      }
      store.save();
      store.emit('events');
      return e;
    },
    removeEvent(id) {
      const list = store.state.events;
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) return false;
      store.pushHist();
      list.splice(i, 1);
      store.save();
      store.emit('events');
      return true;
    },
    replaceEvents(list, opts) {
      if (!(opts && opts.noHist)) store.pushHist();
      store.state.events = list.slice();
      store.state.events.sort((a, b) => a.t - b.t || idNum(a.id) - idNum(b.id));
      let max = 0;
      list.forEach((e) => (max = Math.max(max, idNum(e.id))));
      store.state.nextId = Math.max(store.state.nextId, max + 1);
      store.save();
      store.emit('events');
    },
    clearEvents() {
      store.pushHist();
      store.state.events = [];
      store.save();
      store.emit('events');
    },

    /* --- メタ情報（チーム名・名簿・ハーフなど） --- */
    patch(patchFn, kind) {
      patchFn(store.state);
      store.save();
      store.emit(kind || 'meta');
    },
    roster(team) {
      return store.state.teams[team].roster;
    },
    findPlayer(team, num) {
      return store.state.teams[team].roster.find((p) => p.num === num) || null;
    },
    ensurePlayer(team, num) {
      let p = store.findPlayer(team, num);
      if (!p) {
        p = { num, name: '', pos: num === 1 ? 'GK' : '' };
        store.state.teams[team].roster.push(p);
        store.state.teams[team].roster.sort((a, b) => a.num - b.num);
        store.save();
        store.emit('meta');
      }
      return p;
    },
    playerName(team, num) {
      if (num === 0) return 'チーム';
      const p = store.findPlayer(team, num);
      return p && p.name ? p.name : '';
    },
    playerLabel(team, num) {
      if (num == null) return '';
      if (num === 0) return 'チーム';
      const n = store.playerName(team, num);
      return '#' + num + (n ? ' ' + n : '');
    },
    teamName(team) {
      return store.state.teams[team].name || (team === 'H' ? '自チーム' : '相手');
    },
    /** そのチームのGKの背番号（名簿の役割がGKの選手。なければ #1） */
    gkNum(team) {
      const r = store.state.teams[team].roster;
      const g = r.find((p) => p.pos === 'GK');
      if (g) return g.num;
      return r.some((p) => p.num === 1) ? 1 : null;
    },
    setPeriodStart(q, start) {
      store.pushHist();
      const ps = store.state.periods.filter((p) => p.q !== q);
      ps.push({ q, start: Math.max(0, Math.round(start * 10) / 10) });
      ps.sort((a, b) => a.q - b.q);
      store.state.periods = ps;
      store.save();
      store.emit('meta');
    },
    removePeriod(q) {
      if (q === 1) return;
      store.pushHist();
      store.state.periods = store.state.periods.filter((p) => p.q !== q);
      store.save();
      store.emit('meta');
    },
  });

  store.state = SL.defaultState();
})();
