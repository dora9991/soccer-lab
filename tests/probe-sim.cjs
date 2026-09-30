// サンプル試合の生成を試す（シードごとの数字を確認する）
const { load } = require('./load.cjs');
const SL = load(['util.js', 'model.js', 'xg.js', 'derive.js', 'stats.js', 'goals.js', 'sim.js']);
const seed = process.argv[2] ? +process.argv[2] : 1;
const t0 = Date.now();
const data = SL.sim.build(seed);
const ms = Date.now() - t0;
const st = SL.sim.toState(data);
const S = SL.stats.compute(st);
const n = (k) => `${S.team.H[k]}-${S.team.A[k]}`;
console.log(`seed ${seed}: ${ms}ms  duration ${data.duration.toFixed(0)}s  events ${st.events.length}  kfs ${data.kf.reduce((a, k) => a + k.length, 0)}  ball ${data.ball.length}`);
console.log(`score ${S.score.H}-${S.score.A}  shots ${n('shots')}  sot ${n('sot')}  xg ${S.team.H.xg.toFixed(2)}-${S.team.A.xg.toFixed(2)}  fouls ${n('foul')}  yc ${n('yc')}  off ${n('off')}  ck ${n('ck')}  tov ${n('tov')}  tkl ${n('tkl')}  itc ${n('itc')}  clr ${n('clr')}  ast ${n('ast')}  kp ${n('kp')}`);
console.log('periods', JSON.stringify(st.periods), 'end1', data.end1.toFixed(0), 'end2', data.end2.toFixed(0));
S.goals.forEach((g) => console.log('  GOAL', g.clock, g.team, '#' + g.scorer, g.scene, g.xg && g.xg.toFixed(2), g.body || ''));
