// 複数シードでの平均的な数字を見る： node tests/probe-many.cjs <shotK> <n>
const { load } = require('./load.cjs');
const SL = load(['util.js', 'model.js', 'xg.js', 'derive.js', 'stats.js', 'goals.js', 'sim.js']);
const K = process.argv[2] ? +process.argv[2] : 1;
const N = process.argv[3] ? +process.argv[3] : 12;
const acc = {};
const add = (k, v) => (acc[k] = (acc[k] || 0) + v);
for (let seed = 1; seed <= N; seed++) {
  const data = SL.sim.build(seed, { shotK: K });
  const st = SL.sim.toState(data);
  const S = SL.stats.compute(st);
  for (const t of ['H', 'A']) {
    for (const k of ['shots', 'sot', 'goals', 'foul', 'yc', 'off', 'ck', 'tov', 'tkl', 'itc', 'clr', 'ast', 'kp']) add(t + '.' + k, S.team[t][k]);
    add(t + '.xg', S.team[t].xg);
  }
  add('dur', data.duration);
}
const f = (k) => (acc[k] / N).toFixed(1);
console.log(`shotK=${K} seeds=${N} 平均 duration ${(acc.dur / N / 60).toFixed(1)}分`);
for (const k of ['shots', 'sot', 'goals', 'xg', 'foul', 'yc', 'off', 'ck', 'tov', 'tkl', 'itc', 'clr', 'ast', 'kp']) console.log(k.padEnd(6), 'H', f('H.' + k).padStart(5), ' A', f('A.' + k).padStart(5));
