// 映像の破綻チェック： node tests/probe-motion.cjs <seed>
const { load } = require('./load.cjs');
const SL = load(['util.js', 'model.js', 'xg.js', 'derive.js', 'stats.js', 'goals.js', 'sim.js']);
const seed = process.argv[2] ? +process.argv[2] : 1;
const data = SL.sim.build(seed);
const cuts = data.cuts;
const inCut = (t) => cuts.some((c) => t >= c.t0 - 0.05 && t <= c.t1 + 0.05);
let maxV = 0, maxWhere = null, over = 0, segs = 0;
const hist = new Array(12).fill(0);
data.kf.forEach((a, s) => {
  for (let i = 1; i < a.length; i++) {
    const dt = a[i].t - a[i - 1].t;
    if (dt <= 0) { console.log('non-monotonic', s, i); continue; }
    if (inCut(a[i].t) || inCut(a[i - 1].t)) continue;
    const v = Math.hypot(a[i].x - a[i - 1].x, a[i].y - a[i - 1].y) / dt;
    segs++;
    hist[Math.min(11, Math.floor(v))]++;
    if (v > 9.6) over++;
    if (v > maxV) { maxV = v; maxWhere = { s, t: a[i].t, dt, x: a[i].x, y: a[i].y }; }
  }
});
console.log('選手の最高速度', maxV.toFixed(1), 'm/s', JSON.stringify(maxWhere), ' 9.6超え', over, '/', segs);
console.log('速度の分布(m/s)', hist.map((n, i) => `${i}:${n}`).join(' '));
let oob = 0;
data.kf.forEach((a) => a.forEach((k) => { if (k.x < -1 || k.x > 106 || k.y < -1 || k.y > 69) oob++; }));
console.log('ピッチ外のキーフレーム', oob);
// ボールの連続性
let gaps = 0, overl = 0, maxBall = 0;
for (let i = 1; i < data.ball.length; i++) {
  const d = data.ball[i].t0 - data.ball[i - 1].t1;
  if (d > 0.03) { gaps++; if (gaps <= 5) console.log('ball gap', d.toFixed(2), 'at', data.ball[i].t0.toFixed(1), data.ball[i - 1].kind, '→', data.ball[i].kind); }
  if (d < -0.03) { overl++; if (overl <= 5) console.log('ball overlap', d.toFixed(2), 'at', data.ball[i].t0.toFixed(1), data.ball[i - 1].kind, '→', data.ball[i].kind); }
}
data.ball.forEach((b) => { if (b.kind === 'fly') { const v = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / (b.t1 - b.t0); if (v > maxBall) maxBall = v; } });
console.log('ボールの隙間', gaps, '重なり', overl, '最高球速', maxBall.toFixed(1), 'm/s');
console.log('イベント数', data.events.length, ' 時刻順', data.events.every((e, i) => i === 0 || e.t >= data.events[i - 1].t));
console.log('終了 T', data.duration.toFixed(1), 'ball last t1', data.ball[data.ball.length - 1].t1.toFixed(1));
