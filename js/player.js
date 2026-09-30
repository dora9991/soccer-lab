/* サッカー分析ラボ - 映像ソース（実動画 <video> / サンプル映像 canvas）を同じ操作で扱う */
(function () {
  const SL = (window.SL = window.SL || {});
  const U = SL.util;

  const P = (SL.player = {
    kind: 'none', // 'file' | 'sim' | 'none'
    el: null,
    cv: null,
    ctx: null,
    data: null,
    rate: 1,
    info: { name: '', w: 0, h: 0 },
    _t: 0,
    _playing: false,
    _dur: 0,
    _last: 0,
    _lastT: -1,
    _dirty: true,
    _l: {},
    _url: null,

    on(evt, fn) {
      (P._l[evt] = P._l[evt] || []).push(fn);
    },
    emit(evt, a) {
      (P._l[evt] || []).forEach((fn) => {
        try {
          fn(a);
        } catch (e) {
          console.error(e);
        }
      });
    },

    init() {
      P.el = document.getElementById('vid');
      P.cv = document.getElementById('simCanvas');
      P.ctx = P.cv.getContext('2d');
      ['play', 'pause', 'ended', 'ratechange', 'volumechange'].forEach((n) => P.el.addEventListener(n, () => P.emit('state')));
      requestAnimationFrame(P._loop);
    },

    _loop(now) {
      const dt = P._last ? Math.min(0.1, (now - P._last) / 1000) : 0;
      P._last = now;
      if (P.kind === 'sim') {
        if (P._playing) {
          P._t += dt * P.rate;
          if (P._t >= P._dur) {
            P._t = P._dur;
            P._playing = false;
            P.emit('state');
            P.emit('ended');
          }
          P._dirty = true;
        }
        if (P._dirty) {
          P._dirty = false;
          SL.sim.render(P.ctx, SL.sim.VW, SL.sim.VH, P._t, P.data);
          P.emit('time', P._t);
        }
      } else if (P.kind === 'file') {
        const t = P.el.currentTime;
        if (t !== P._lastT || !P.el.paused) {
          P._lastT = t;
          P.emit('time', t);
        }
      }
      requestAnimationFrame(P._loop);
    },

    get time() {
      return P.kind === 'file' ? P.el.currentTime : P._t;
    },
    get duration() {
      if (P.kind === 'file') return isFinite(P.el.duration) ? P.el.duration : P._dur;
      return P._dur;
    },
    get playing() {
      return P.kind === 'file' ? !P.el.paused && !P.el.ended : P._playing;
    },
    get ready() {
      return P.kind !== 'none';
    },

    _show(kind) {
      const stage = document.getElementById('stage');
      stage.dataset.kind = kind;
    },

    /** 実動画を読み込む。resolve({duration,w,h}) */
    loadFile(file) {
      return new Promise((resolve, reject) => {
        P.pause();
        if (P._url) URL.revokeObjectURL(P._url);
        const url = URL.createObjectURL(file);
        P._url = url;
        P.kind = 'file';
        P.data = null;
        P._show('file');
        const el = P.el;
        el.onerror = () => {
          P.kind = 'none';
          P._show('none');
          reject(new Error('この動画は再生できませんでした。MP4（H.264）などの形式に変換して、もう一度お試しください。'));
        };
        el.onloadedmetadata = async () => {
          try {
            if (!isFinite(el.duration)) {
              // MediaRecorder で作った WebM などは長さが未設定。一度末尾まで移動して長さを確定させる
              await new Promise((r) => {
                const on = () => {
                  el.removeEventListener('timeupdate', on);
                  r();
                };
                el.addEventListener('timeupdate', on);
                el.currentTime = 1e7;
              });
              P._dur = el.duration;
              el.currentTime = 0;
            }
            P._dur = el.duration;
            if (!el.videoWidth) {
              P.kind = 'none';
              P._show('none');
              throw new Error('映像を表示できない形式です（音声だけ読めた可能性があります）。H.264のMP4に変換してから読み込んでください。');
            }
            P.info = { name: file.name, w: el.videoWidth, h: el.videoHeight };
            el.playbackRate = P.rate;
            P._dirty = true;
            P.emit('loaded', P.info);
            P.emit('state');
            resolve({ duration: P.duration, w: el.videoWidth, h: el.videoHeight, name: file.name });
          } catch (e) {
            reject(e);
          }
        };
        el.src = url;
        el.load();
      });
    },

    loadSim(data) {
      P.pause();
      P.kind = 'sim';
      P.data = data;
      P._dur = data.duration;
      P._t = 0;
      P._playing = false;
      P._dirty = true;
      P.info = { name: 'サンプル映像', w: SL.sim.VW, h: SL.sim.VH };
      if (P.el) {
        P.el.removeAttribute('src');
        P.el.load();
      }
      P._show('sim');
      P.emit('loaded', P.info);
      P.emit('state');
    },

    unload() {
      P.pause();
      P.kind = 'none';
      P.data = null;
      P._dur = 0;
      P._t = 0;
      if (P.el) {
        P.el.removeAttribute('src');
        P.el.load();
      }
      P._show('none');
      P.emit('loaded', null);
      P.emit('state');
    },

    play() {
      if (P.kind === 'file') {
        if (P.el.ended) P.el.currentTime = 0;
        const pr = P.el.play();
        if (pr && pr.catch) pr.catch(() => {});
      } else if (P.kind === 'sim') {
        if (P._t >= P._dur - 0.05) P._t = 0;
        P._playing = true;
        P._dirty = true;
        P.emit('state');
      }
    },
    pause() {
      if (P.kind === 'file') {
        if (P.el && !P.el.paused) P.el.pause();
      } else if (P.kind === 'sim') {
        if (P._playing) {
          P._playing = false;
          P.emit('state');
        }
      }
    },
    toggle() {
      if (P.playing) P.pause();
      else P.play();
    },

    /** t 秒へ移動。実動画のときは移動が終わったら resolve */
    seek(t) {
      if (P.kind === 'none') return Promise.resolve();
      t = U.clamp(t, 0, P.duration || 0);
      if (P.kind === 'sim') {
        P._t = t;
        P._dirty = true;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const el = P.el;
        if (Math.abs(el.currentTime - t) < 0.02) return resolve();
        let done = false;
        const fin = () => {
          if (done) return;
          done = true;
          el.removeEventListener('seeked', fin);
          resolve();
        };
        el.addEventListener('seeked', fin);
        setTimeout(fin, 2500);
        el.currentTime = t;
      });
    },
    seekBy(dt) {
      return P.seek(P.time + dt);
    },
    setRate(r) {
      P.rate = r;
      if (P.el) P.el.playbackRate = r;
      P.emit('state');
    },
    setMuted(m) {
      if (P.el) P.el.muted = !!m;
      P.emit('state');
    },
    get muted() {
      return !!(P.el && P.el.muted);
    },
  });
})();
