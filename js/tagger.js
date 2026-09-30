/* サッカー分析ラボ - タグ付けの入力（背番号 → プレー）とフォローアップ（ラストパス／ボールロストの種類／ファウルを受けた選手） */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;
  const C = SL.C;
  const D = SL.derive;

  // 攻撃の型（場面）を記録するプレー。PK は自動で「PK」になる
  const SCENE_TYPES = new Set(['goal', 'sot', 'soff', 'sblk']);
  // これが付くと攻撃が一区切りになるので、場面を初期値に戻す
  const TERMINAL = new Set(['goal', 'sot', 'soff', 'sblk', 'pkg', 'pkx', 'og', 'tov']);
  const r1 = (v) => Math.round(v * 10) / 10;

  const TG = (SL.tagger = {
    team: 'H',
    scene: C.SCENE_DEFAULT,
    lock: false,
    pending: { num: null, ev: null },
    buf: '',
    _bufTimer: null,
    _followTimer: null,
    follow: null,
    attrs: { head: false, loc: null },
    _l: new Set(),

    onChange(fn) {
      TG._l.add(fn);
    },
    changed() {
      TG._l.forEach((f) => f());
    },

    /** タグを付ける時刻。再生中は少し前（反応遅れ分）に置く */
    eventTime() {
      const P = SL.player;
      const cfg = SL.store.state.cfg;
      const t = P.time - (P.playing ? cfg.delay || 0 : 0);
      return Math.max(0, Math.round(t * 10) / 10);
    },

    setTeam(t) {
      if (TG.team === t) return;
      TG.team = t;
      TG.pending.num = null;
      TG._clearBuf();
      TG.follow = null;
      TG.changed();
    },
    toggleTeam() {
      TG.setTeam(TG.team === 'H' ? 'A' : 'H');
    },
    setScene(id) {
      TG.scene = id;
      TG.changed();
    },
    cycleScene(dir) {
      const ids = C.SCENES.map((s) => s.id);
      const i = ids.indexOf(TG.scene);
      TG.scene = ids[(i + dir + ids.length) % ids.length];
      TG.changed();
    },
    toggleLock() {
      TG.lock = !TG.lock;
      TG.changed();
    },
    setLoc(loc) {
      TG.attrs.loc = loc;
      TG.changed();
    },
    toggleHead() {
      TG.attrs.head = !TG.attrs.head;
      TG.changed();
    },

    /* ----- 背番号の入力（数字キー） ----- */
    _clearBuf() {
      TG.buf = '';
      clearTimeout(TG._bufTimer);
    },
    /** ラストパス／被ファウル／ロストの種類の入力待ち。しばらく何もしなければ自動で閉じる */
    setFollow(f) {
      TG.follow = f;
      clearTimeout(TG._followTimer);
      if (f) {
        TG._followTimer = setTimeout(() => {
          if (TG.follow === f && !TG.buf) {
            TG.follow = null;
            TG.changed();
          }
        }, 12000);
      }
    },
    digit(d) {
      const f = TG.follow;
      if (f && f.kind === 'sub') {
        const i = parseInt(d, 10) - 1;
        if (C.TOV_TYPES[i]) {
          TG.applySub(C.TOV_TYPES[i].id);
          return;
        }
        TG.follow = null; // 種類の番号ではない数字は、次の背番号として扱う
      }
      TG.buf = (TG.buf + d).slice(-2);
      clearTimeout(TG._bufTimer);
      TG._bufTimer = setTimeout(TG.resolveBuf, 900);
      TG.changed();
    },
    resolveBuf() {
      if (!TG.buf) return;
      const num = parseInt(TG.buf, 10);
      TG._clearBuf();
      TG.playerChosen(TG.team, num);
    },
    playerChosen(team, num) {
      if (!SL.player.ready) {
        U.toast('先に動画を読み込んでください（右上の「📂 動画を読み込む」）', 'bad');
        TG.pending = { num: null, ev: null };
        return;
      }
      const f = TG.follow;
      if (f && f.kind === 'pass') {
        if (f.team === team) TG.applyPass(num);
        return;
      }
      if (f && f.kind === 'victim') {
        TG.applyVictim(num);
        return;
      }
      if (num !== 0 && !SL.store.findPlayer(team, num)) {
        SL.store.ensurePlayer(team, num);
        U.toast(`${SL.store.teamName(team)} に背番号 ${num} を追加しました（名前は「設定」で入力できます）`);
      }
      if (team !== TG.team) TG.team = team;
      TG.pending.num = num;
      TG.tryCommit();
      TG.changed();
    },

    /* ----- マウス操作 ----- */
    pickPlayer(team, num) {
      TG._clearBuf();
      TG.playerChosen(team, num);
    },
    pickEvent(type) {
      if (TG.buf) TG.resolveBuf();
      const meta = C.EVENTS[type];
      if (!meta) return;
      TG.follow = null;
      TG.pending.ev = type;
      TG.tryCommit();
      TG.changed();
    },

    /** 選手と種類がそろったら記録する */
    tryCommit() {
      const ev = TG.pending.ev;
      if (!ev) return null;
      const meta = C.EVENTS[ev];
      if (!meta.noPlayer && TG.pending.num == null) return null;
      if (!SL.player.ready) {
        U.toast('先に動画を読み込んでください（右上の「📂 動画を読み込む」）', 'bad');
        TG.pending = { num: null, ev: null };
        return null;
      }
      const rec = { t: TG.eventTime(), type: ev, team: TG.team, num: meta.noPlayer ? null : TG.pending.num };
      if (SCENE_TYPES.has(ev)) rec.scene = TG.scene;
      if (meta.pk) rec.scene = 'pk';
      if (meta.loc && TG.attrs.loc) {
        rec.px = r1(TG.attrs.loc.px);
        rec.py = r1(TG.attrs.loc.py);
      }
      if (meta.shot && !meta.pk && TG.attrs.head) rec.body = 'head';
      const saved = SL.store.addEvent(rec);
      TG.pending = { num: null, ev: null };
      TG.attrs = { head: false, loc: null };
      if (!TG.lock && TERMINAL.has(ev)) TG.scene = C.SCENE_DEFAULT;
      TG.setFollow(null);
      if (meta.shot && !meta.pk) TG.setFollow({ kind: 'pass', team: saved.team, shotId: saved.id, t: saved.t, isGoal: ev === 'goal' });
      else if (ev === 'tov') TG.setFollow({ kind: 'sub', of: 'tov', id: saved.id, team: saved.team });
      else if (ev === 'foul') TG.setFollow({ kind: 'victim', id: saved.id, team: saved.team, vsTeam: D.other(saved.team) });
      SL.ui.onTagged(saved);
      if (ev === 'note') SL.ui.openEdit(saved.id);
      return saved;
    },

    applyPass(num) {
      const f = TG.follow;
      if (!f || f.kind !== 'pass') return;
      SL.store.ensurePlayer(f.team, num);
      const ev = SL.store.addEvent({ t: Math.round((f.t + 0.1) * 10) / 10, type: f.isGoal ? 'ast' : 'kp', team: f.team, num, for: f.shotId }, { noHist: true });
      TG.follow = null;
      SL.ui.onTagged(ev);
      TG.changed();
    },
    applyVictim(num) {
      const f = TG.follow;
      if (!f || f.kind !== 'victim') return;
      SL.store.ensurePlayer(f.vsTeam, num);
      SL.store.updateEvent(f.id, { vs: num }, { noHist: true });
      TG.follow = null;
      U.toast(`ファウルを受けた選手：${SL.store.playerLabel(f.vsTeam, num)}`);
      TG.changed();
    },
    applySub(id) {
      const f = TG.follow;
      if (!f || f.kind !== 'sub') return;
      SL.store.updateEvent(f.id, { sub: id }, { noHist: true });
      TG.follow = null;
      TG.changed();
    },
    skipFollow() {
      TG.follow = null;
      TG.changed();
    },

    enter() {
      if (TG.buf) TG.resolveBuf();
      else if (TG.follow) TG.skipFollow();
    },
    esc() {
      TG._clearBuf();
      TG.pending = { num: null, ev: null };
      TG.follow = null;
      TG.attrs = { head: false, loc: null };
      TG.changed();
    },

    markPeriod(q) {
      // 前半もキックオフの位置で区切れる（動画の頭にオープニングがある場合など）
      SL.store.setPeriodStart(q, SL.player.time);
      U.toast(`${D.qLabel(q)} の開始（キックオフ）を ${U.fmtTime(SL.player.time, true)} に設定しました`);
    },

    /** キー入力。処理したら true */
    handleKey(e) {
      const code = e.code;
      const m = /^Digit(\d)$/.exec(code) || /^Numpad(\d)$/.exec(code);
      if (m) {
        TG.digit(m[1]);
        SL.ui.flashKey(m[1]);
        return true;
      }
      if (C.KEY_TO_EVENT[code]) {
        SL.ui.flashKey(C.EVENTS[C.KEY_TO_EVENT[code]].kl);
        TG.pickEvent(C.KEY_TO_EVENT[code]);
        return true;
      }
      switch (code) {
        case 'KeyV':
          TG.toggleTeam();
          return true;
        case 'KeyL':
          TG.toggleLock();
          return true;
        case 'KeyH':
          TG.toggleHead();
          return true;
        case 'Enter':
        case 'NumpadEnter':
          TG.enter();
          return true;
        case 'Escape':
          TG.esc();
          return true;
        case 'Comma':
          TG.cycleScene(-1);
          return true;
        case 'Period':
          TG.cycleScene(1);
          return true;
      }
      return false;
    },
  });
})();
