// サンプル試合のアドバイス内容を見る： node tests/advice-probe.cjs [seed]
const { load } = require('./load.cjs');
const SL = load(['util.js', 'model.js', 'xg.js', 'derive.js', 'stats.js', 'goals.js', 'advice.js', 'sim.js']);
const seed = process.argv[2] ? +process.argv[2] : undefined;
const st = SL.sim.toState(SL.sim.build(seed));
const S = SL.stats.compute(st);
const R = SL.advice.generate(st, S);
console.log(R.summary.headline);
R.summary.bullets.forEach((b) => console.log('  ・' + b));
console.log('  factors:', R.summary.factors.map((f) => f.key + ':' + f.verdict).join(' '));
console.log('--- 強み'); R.strengths.forEach((i) => console.log('  [' + i.id + ']', i.title));
console.log('--- 課題'); R.issues.forEach((i) => console.log('  [' + i.id + ']', i.weight, i.title));
console.log('--- 選手'); R.players.forEach((i) => console.log('  [' + i.id + ']', i.title));
console.log('--- 練習'); R.plan.forEach((d) => console.log('  ' + d.title));
console.log('--- 失点');
SL.goals.build(st, S, { side: 'against' }).forEach((g) => console.log('  ', g.label, '|', g.causeText, '|', g.causes.join(','), '|', g.start.toFixed(0) + '-' + g.end.toFixed(0)));
console.log('--- 得点');
SL.goals.build(st, S, { side: 'for' }).forEach((g) => console.log('  ', g.label, '|', g.causeText, '|', g.causes.join(','), '|', g.start.toFixed(0) + '-' + g.end.toFixed(0)));
