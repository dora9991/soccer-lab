// デモ用のサンプル試合に向いたシードを探す： node tests/pick-seed.cjs [from] [to]
// 狙い：自チームが押しているのに、セットプレーとカウンターで決められて競り負ける試合。
const { load } = require('./load.cjs');
const SL = load(['util.js', 'model.js', 'xg.js', 'derive.js', 'stats.js', 'goals.js', 'sim.js']);
const from = +process.argv[2] || 1;
const to = +process.argv[3] || 200;
const rows = [];
for (let seed = from; seed <= to; seed++) {
  const data = SL.sim.build(seed);
  const st = SL.sim.toState(data);
  const S = SL.stats.compute(st);
  const H = S.team.H, A = S.team.A;
  const ga = SL.goals.build(st, S, { side: 'against' });
  const gf = SL.goals.build(st, S, { side: 'for' });
  const causesA = new Set(ga.map((g) => g.primary));
  let sc = 0;
  const note = [];
  const add = (v, why) => { sc += v; if (v) note.push(why + (v > 0 ? '+' : '') + v); };
  // 結果：2-3 の惜敗（自チームが先に点を取り、後半に逆転される形が理想）
  const diff = S.score.A - S.score.H;
  add(S.score.H === 2 && S.score.A === 3 ? 14 : diff === 1 && S.score.H >= 1 ? 6 : -12, 'score');
  const g1 = S.goals.filter((g) => g.q === 1), g2 = S.goals.filter((g) => g.q === 2);
  add(g1.length >= 1 && g2.length >= 1 ? 4 : -2, 'both halves');
  add(S.goals.length && S.goals[0].team === 'H' ? 5 : 0, 'H scores first');
  add(S.goals.length && S.goals[S.goals.length - 1].team === 'A' ? 3 : 0, 'A last');
  add(S.goals.every((g) => g.xg == null || g.xg >= 0.09 || g.scene === 'fk') ? 5 : -4, 'no silly xg');
  add(S.goals.filter((g) => g.team === 'A').length && Math.max(...S.goals.filter((g) => g.team === 'A').map((g) => g.scorer)) !== null && new Set(S.goals.filter((g) => g.team === 'A').map((g) => g.scorer)).size >= 2 ? 3 : 0, 'A scorers vary');
  add(new Set(S.goals.filter((g) => g.team === 'H').map((g) => g.scorer)).size >= 2 ? 3 : 0, 'H scorers vary');
  add(gf.some((g) => g.assist != null) ? 3 : 0, 'H goal with assist');
  add(ga.some((g) => g.assist != null) ? 1 : 0, 'A goal with assist');
  add(ga.filter((g) => ['corner', 'fk', 'throw', 'pk'].includes(g.primary)).length === 1 ? 4 : 0, 'one setpiece');
  add(ga.filter((g) => g.causes.includes('tov')).length === 1 ? 4 : 0, 'one tov');
  add(S.score.H + S.score.A >= 5 ? 4 : S.score.H + S.score.A === 4 ? 2 : -4, 'total');
  // 本数
  add(H.shots >= 15 && H.shots <= 22 ? 6 : H.shots >= 12 ? 2 : -6, 'Hshots');
  add(A.shots >= 8 && A.shots <= 15 ? 4 : -4, 'Ashots');
  add(H.shots > A.shots + 3 ? 4 : 0, 'dominate');
  // 内容
  add(H.xg > A.xg + 0.2 ? 5 : H.xg > A.xg - 0.2 ? 2 : -4, 'xg');
  add(H.xg - H.goals >= 0.4 ? 4 : 0, 'missed');
  add(H.bigMissed >= 2 ? 4 : H.bigMissed >= 1 ? 2 : 0, 'bigMissed');
  // 失点の原因
  add(ga.some((g) => ['corner', 'fk', 'pk', 'throw'].includes(g.primary)) ? 8 : -3, 'setpiece');
  add(ga.some((g) => g.causes.includes('tov')) ? 8 : 0, 'tov');
  add(causesA.size >= 3 ? 6 : causesA.size === 2 ? 3 : 0, 'variety');
  // 得点
  add(gf.length >= 2 ? 4 : 0, 'gf');
  add(H.ast >= 1 ? 3 : 0, 'H ast');
  add(H.kp >= 3 ? 2 : 0, 'H kp');
  // 規律・その他
  add(H.foul >= 8 && H.foul <= 13 ? 4 : 0, 'Hfoul');
  add(H.yc >= 2 ? 5 : H.yc === 1 ? 2 : 0, 'Hyc');
  add(A.yc >= 1 ? 2 : 0, 'Ayc');
  add(H.off >= 2 ? 3 : 0, 'Hoff');
  add(H.ck >= 4 ? 3 : H.ck >= 3 ? 1 : 0, 'Hck');
  add(A.ck >= 2 ? 1 : 0, 'Ack');
  add(S.tov.H.total >= 8 ? 3 : 0, 'Htov');
  add(S.tov.H.toShots >= 2 ? 4 : 0, 'toShots');
  add(S.regain.H.toShots >= 2 ? 2 : 0, 'regain');
  add(H.tkl + H.itc >= 8 ? 2 : 0, 'H def');
  add(H.kp >= 1 && A.kp >= 1 ? 1 : 0, 'kp both');
  add(S.setp.A.pk.taken + S.setp.H.pk.taken >= 1 ? 3 : 0, 'pk');
  add(S.events.length >= 190 && S.events.length <= 300 ? 3 : 0, 'events');
  add(H.big >= 1 ? 4 : -2, 'H big chance');
  add(H.bigMissed >= 1 ? 3 : 0, 'H big missed');
  add(A.big >= 1 ? 1 : 0, 'A big chance');
  rows.push({ seed, sc, note: note.join(' '), line: `${S.score.H}-${S.score.A} shots ${H.shots}-${A.shots} xg ${H.xg.toFixed(1)}-${A.xg.toFixed(1)} foul ${H.foul}-${A.foul} yc ${H.yc}-${A.yc} off ${H.off}-${A.off} ck ${H.ck}-${A.ck} tov ${H.tov}-${A.tov} ga[${ga.map((g) => g.primary).join(',')}] gf[${gf.map((g) => g.primary).join(',')}] ev ${S.events.length}` });
}
rows.sort((a, b) => b.sc - a.sc);
rows.slice(0, 12).forEach((r) => console.log(String(r.seed).padStart(4), String(r.sc).padStart(3), r.line));
