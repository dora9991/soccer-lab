// 回帰テスト: node tests/run.cjs
// 集計・xG・得点/失点の分類・アドバイス・サンプル生成の不変条件を確認する（DOM 不要）
const assert = require('node:assert/strict');
const { load } = require('./load.cjs');
const SL = load(['util.js', 'model.js', 'xg.js', 'derive.js', 'stats.js', 'goals.js', 'advice.js', 'sim.js', 'simdraw.js']);
const D = SL.derive;
const C = SL.C;

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ✔', name); } catch (e) { console.error('  ✖', name, '\n     ', e.message); process.exitCode = 1; } };

const data = SL.sim.build();
const sample = SL.sim.toState(data);
const S = SL.stats.compute(sample);

console.log('サンプル試合');
test('同じシードなら同じ試合になる（決定的）', () => {
  const again = SL.sim.toState(SL.sim.build());
  assert.deepEqual(again.events, sample.events);
});
test('タグは時刻順で、選手は名簿にいる（アシストの対応先も存在する）', () => {
  for (let i = 1; i < sample.events.length; i++) assert.ok(sample.events[i].t >= sample.events[i - 1].t);
  const ids = new Set(sample.events.map((e) => e.id));
  for (const e of sample.events) {
    if (e.num) assert.ok(sample.teams[e.team].roster.some((p) => p.num === e.num), 'unknown ' + e.team + e.num);
    if (e.for) assert.ok(ids.has(e.for), 'dangling for');
    assert.ok(C.EVENTS[e.type], 'unknown type ' + e.type);
  }
});
test('映像が破綻しない：キーフレーム単調・ボール連続・選手の速さ・ピッチ内', () => {
  const inCut = (t) => data.cuts.some((c) => t >= c.t0 - 0.05 && t <= c.t1 + 0.05);
  data.kf.forEach((a) => {
    for (let k = 1; k < a.length; k++) {
      assert.ok(a[k].t > a[k - 1].t, 'monotonic');
      if (!inCut(a[k].t) && !inCut(a[k - 1].t)) assert.ok(Math.hypot(a[k].x - a[k - 1].x, a[k].y - a[k - 1].y) / (a[k].t - a[k - 1].t) < 9.8, 'speed');
      assert.ok(a[k].x > -1 && a[k].x < 106 && a[k].y > -1 && a[k].y < 69, 'in pitch');
    }
  });
  for (let i = 1; i < data.ball.length; i++) assert.ok(Math.abs(data.ball[i].t0 - data.ball[i - 1].t1) < 0.03, 'ball continuity at ' + data.ball[i].t0);
});
test('試合の規模：前後半で約20分、タグは150〜320件、両チームにシュートがある', () => {
  assert.ok(data.duration > 2300 && data.duration < 2700);
  assert.ok(sample.events.length >= 150 && sample.events.length <= 320, 'events ' + sample.events.length);
  assert.ok(S.team.H.shots >= 8 && S.team.A.shots >= 8);
  assert.equal(sample.periods.length, 2);
});

test('映像とタグが一致：ゴールはその時刻の少し前にボールがゴールへ入り、コーナーはコーナーから蹴られている', () => {
  const goalX = (team, t) => {
    const second = SL.sim.halfAt(data, t) === 2;
    const rightGoal = (team === 'H') === !second; // 前半は自チームが右へ攻める
    return rightGoal ? 105 : 0;
  };
  let checked = 0;
  for (const e of data.events) {
    if (e.type === 'goal' || e.type === 'pkg') {
      // シュートの結果はタグ時刻の0.45秒前
      const b = SL.sim.ballAt(data, e.t - 0.5);
      assert.ok(Math.abs(b.x - goalX(e.team, e.t)) < 3.5, `goal at ${e.t.toFixed(1)}: ball x=${b.x.toFixed(1)}`);
      assert.ok(Math.abs(b.y - 34) < 6, 'goal mouth');
      checked++;
    }
    if (e.type === 'ck') {
      const b = SL.sim.ballAt(data, e.t - 0.7);
      assert.ok(Math.min(b.x, 105 - b.x) < 3 && Math.min(b.y, 68 - b.y) < 3, `corner at ${e.t.toFixed(1)}: ball ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
      checked++;
    }
    if (e.type === 'foul' || e.type === 'off') {
      // 笛の演出が近くにある
      assert.ok(data.fx.some((f) => f.kind === 'whistle' && Math.abs(f.t - e.t) < 1.2), `${e.type} at ${e.t.toFixed(1)} has whistle fx`);
      checked++;
    }
  }
  assert.ok(checked >= 15, 'checked ' + checked);
});
test('タグの位置がピッチの内側で、シュートの位置はゴール側の半分にある', () => {
  for (const e of sample.events) {
    if (e.px == null) continue;
    assert.ok(e.px >= 0 && e.px <= 105 && e.py >= 0 && e.py <= 68, 'in pitch');
    if (C.isShot(e)) assert.ok(e.px >= 70, `shot too far from goal: px=${e.px}`);
  }
});

console.log('xG');
test('xG：ゴールに近いほど高く、角度がないと下がる。PKは0.76', () => {
  const X = SL.xg;
  assert.ok(X.at(0, 5.5) > X.at(0, 11) && X.at(0, 11) > X.at(0, 20) && X.at(0, 20) > X.at(0, 30));
  assert.ok(X.at(0, 8) > X.at(14, 8), '角度');
  assert.ok(X.at(0, 5.5) > 0.4 && X.at(0, 5.5) < 0.6);
  assert.ok(X.at(0, 25) < 0.06 && X.at(0, 25) > 0.02);
  assert.equal(X.of({ type: 'pkg', scene: 'pk' }), 0.76);
  const p = C.fromShot(0, 8);
  assert.ok(X.of({ type: 'sot', px: p.px, py: p.py, body: 'head' }) < X.of({ type: 'sot', px: p.px, py: p.py }), 'ヘディングは低い');
  assert.ok(X.of({ type: 'sot' }) > 0 && X.detail({ type: 'sot' }).est === true, '位置なしは概算');
});
test('座標変換：ピッチ座標⇔シュート座標、ゾーン判定', () => {
  const a = C.fromShot(3, 10);
  const b = C.toShot(a.px, a.py);
  assert.ok(Math.abs(b.sx - 3) < 1e-9 && Math.abs(b.sy - 10) < 1e-9);
  assert.equal(C.zoneFor(0, 3), 'six');
  assert.equal(C.zoneFor(0, 10), 'boxC');
  assert.equal(C.zoneFor(-12, 8), 'boxL');
  assert.equal(C.zoneFor(12, 8), 'boxR');
  assert.equal(C.zoneFor(0, 20), 'edgeC');
  assert.equal(C.zoneFor(15, 20), 'edgeR');
  assert.equal(C.zoneFor(25, 6), 'wideR');
  assert.equal(C.zoneFor(0, 30), 'far');
  assert.equal(C.fieldZone(5, 34), 'ownBox');
  assert.equal(C.fieldZone(100, 34), 'oppBox');
  assert.equal(C.fieldZone(60, 5), 'mid3');
  assert.equal(C.fieldZone(80, 5), 'att3');
});

console.log('集計');
test('個人の合計 = チーム合計、得点 = 得点推移の最終値', () => {
  for (const t of ['H', 'A']) {
    const sum = (k) => S.players[t].reduce((a, p) => a + p[k], 0);
    for (const k of ['goals', 'shots', 'sot', 'soff', 'blk', 'ast', 'kp', 'tkl', 'itc', 'clr', 'ck', 'tov', 'foul', 'yc', 'rc', 'off', 'og', 'fouled']) assert.equal(sum(k), S.team[t][k], t + '.' + k);
    assert.ok(Math.abs(S.players[t].reduce((a, p) => a + p.xg, 0) - S.team[t].xg) < 1e-9);
  }
  const last = S.tl[S.tl.length - 1];
  assert.equal(last.H, S.score.H);
  assert.equal(last.A, S.score.A);
  assert.equal(S.goals.length, S.score.H + S.score.A);
});
test('シュート内訳：枠内+枠外+ブロック=シュート、枠内>=得点', () => {
  for (const t of ['H', 'A']) {
    const T = S.team[t];
    assert.equal(T.sot + T.soff + T.blk, T.shots, t);
    assert.ok(T.sot >= T.goals);
  }
});
test('GK：セーブ+被弾 = 被枠内シュート、チームのセーブ数と一致', () => {
  for (const t of ['H', 'A']) {
    const gk = S.players[t].find((p) => p.isGK);
    assert.ok(gk, 'GK がいる');
    assert.equal(gk.saves, S.team[t].saves);
    assert.equal(gk.saves + gk.ga, gk.faced);
    assert.equal(gk.faced, S.team[D.other(t)].sot);
  }
});
test('攻撃の型別：シュート・ゴール・xG の合計が一致', () => {
  for (const t of ['H', 'A']) {
    assert.equal(S.scenes[t].reduce((a, r) => a + r.shots, 0), S.team[t].shots);
    assert.equal(S.scenes[t].reduce((a, r) => a + r.goals, 0), S.team[t].goals);
    assert.ok(Math.abs(S.scenes[t].reduce((a, r) => a + r.xg, 0) - S.team[t].xg) < 1e-9);
    assert.equal(S.play[t].open.shots + S.play[t].set.shots, S.team[t].shots);
  }
});
test('ボールロスト・ファウル：種類別の合計 = 総数', () => {
  for (const t of ['H', 'A']) {
    assert.equal(Object.values(S.tov[t].byType).reduce((a, n) => a + n, 0), S.tov[t].total);
    assert.equal(Object.values(S.fouls[t].byType).reduce((a, n) => a + n, 0), S.fouls[t].total);
    assert.equal(Object.values(S.fouls[t].byHalf).reduce((a, n) => a + n, 0), S.fouls[t].total);
  }
  assert.equal(S.fouls.H.total, S.team.H.foul);
});
test('被ファウル：相手のファウル（vs 付き）の数と一致', () => {
  const vsCount = (t) => sample.events.filter((e) => e.type === 'foul' && e.team === D.other(t) && e.vs != null).length;
  for (const t of ['H', 'A']) assert.equal(S.team[t].fouled, vsCount(t));
});
test('ゾーン集計：位置あり+なし = 総シュート数', () => {
  const z = SL.stats.zoneTable(S.events, (e) => e.team === 'H');
  assert.equal(z.total, S.team.H.shots);
  assert.equal(z.located + z.rows.unknown.shots, z.total);
  assert.equal(Object.values(z.groups).reduce((a, g) => a + g.shots, 0), z.located);
});
test('時間帯別・前後半別：ゴール合計が得点と一致', () => {
  for (const t of ['H', 'A']) {
    assert.equal(S.buckets.reduce((a, b) => a + b[t].goals, 0), S.score[t]);
    assert.equal(S.halves.reduce((a, h) => a + h[t].gf, 0), S.score[t]);
  }
  const first = SL.stats.compute(sample, { q: 1 });
  const second = SL.stats.compute(sample, { q: 2 });
  assert.equal(first.team.H.shots + second.team.H.shots, S.team.H.shots);
});
test('オウンゴールは相手の得点になり、アシストは対応するシュートに結びつく', () => {
  const evs = [{ id: 'e1', t: 10, type: 'og', team: 'H', num: 5 }, { id: 'e2', t: 20, type: 'goal', team: 'A', num: 9 }, { id: 'e3', t: 20.1, type: 'ast', team: 'A', num: 8 }];
  const tl = D.scoreTimeline(evs);
  assert.deepEqual([tl[1].A, tl[2].A, tl[2].H], [1, 2, 0]);
  const m = D.linkPasses(evs);
  assert.equal(m.get('e3').id, 'e2');
  assert.equal(D.linkPasses([{ id: 'a', t: 3, type: 'goal', team: 'H' }, { id: 'b', t: 1, type: 'kp', team: 'H', for: 'a' }]).get('b').id, 'a');
});
test('試合時間の表示：20分ハーフ、後半、アディショナルタイム', () => {
  const st = { periods: [{ q: 1, start: 4 }, { q: 2, start: 1300 }], cfg: { halfMin: 20 } };
  assert.equal(D.minuteLabel(st, 4 + 0.5), "1'");
  assert.equal(D.minuteLabel(st, 4 + 12 * 60), "13'");
  assert.equal(D.minuteLabel(st, 1300 + 3 * 60), "24'");
  assert.equal(D.minuteLabel(st, 4 + 21 * 60 + 5), "20+2'");
});

console.log('得点・失点の場面');
test('失点の合計 = 相手の得点、主な原因の合計 = 失点、得点側も同様', () => {
  for (const side of ['against', 'for']) {
    const items = SL.goals.build(sample, S, { side });
    const sm = SL.goals.summary(items);
    assert.equal(sm.total, side === 'against' ? S.score.A : S.score.H);
    assert.equal(sm.byPrimary.reduce((a, b) => a + b.pts, 0), sm.total);
    assert.ok(items.every((it) => it.causes.includes(it.primary)));
  }
});
test('クリップ範囲：攻撃の始まりから得点まで、前置き>=8秒（設定値）', () => {
  const items = SL.goals.build(sample, S, { side: 'against' }).concat(SL.goals.build(sample, S, { side: 'for' }));
  assert.ok(items.length > 0);
  for (const it of items) {
    assert.ok(it.start >= 0 && it.end > it.start);
    assert.ok(it.start <= it.t && it.end >= it.tEnd);
    assert.ok(it.t - it.start >= Math.min(8, it.t) - 1e-9, 'lead ' + (it.t - it.start));
    assert.ok(it.label && it.causeText);
  }
});
test('原因の判定：セットプレー・ロスト直後・PK・オウンゴール', () => {
  const st = JSON.parse(JSON.stringify(sample));
  st.events = [
    { id: 'e1', t: 100, type: 'tov', team: 'H', num: 6, sub: 'pass' },
    { id: 'e2', t: 108, type: 'goal', team: 'A', num: 9, scene: 'counter', px: 95, py: 34 },
    { id: 'e3', t: 300, type: 'ck', team: 'A', num: 8 },
    { id: 'e4', t: 306, type: 'goal', team: 'A', num: 5, scene: 'corner', body: 'head', px: 100, py: 30 },
    { id: 'e5', t: 400, type: 'foul', team: 'H', num: 5, px: 5, py: 34 },
    { id: 'e6', t: 410, type: 'pkg', team: 'A', num: 9 },
    { id: 'e7', t: 500, type: 'og', team: 'H', num: 4 },
  ];
  const s = SL.stats.compute(st);
  const items = SL.goals.build(st, s, { side: 'against' });
  assert.deepEqual(items.map((i) => i.primary), ['tov', 'corner', 'pk', 'og']);
  assert.ok(items[0].causes.includes('counter'));
  assert.ok(items[1].detail.head);
  assert.ok(items[2].start <= 400, 'PKは、ファウルを含む');
});
test('タグが少ない・相手のタグが無いときも落ちない', () => {
  for (const events of [[], sample.events.filter((e) => e.team === 'H'), sample.events.filter((e) => e.team === 'A' && e.type === 'goal')]) {
    const st = JSON.parse(JSON.stringify(sample)); st.events = events;
    const s = SL.stats.compute(st);
    for (const side of ['against', 'for']) SL.goals.summary(SL.goals.build(st, s, { side }));
    SL.advice.generate(st, s);
  }
});

console.log('アドバイス');
test('サンプル試合：総括と、失点の原因・規律・攻撃の指摘が出る', () => {
  const R = SL.advice.generate(sample, S);
  assert.ok(R.summary.headline.includes('ジーニーズ'));
  assert.ok(R.issues.length >= 3 && R.strengths.length >= 1 && R.players.length >= 2);
  assert.ok(R.plan.length > 0 && R.plan.every((d) => d.title && d.how));
  R.issues.concat(R.strengths, R.players).forEach((i) => assert.ok(i.title && i.body, i.id));
  assert.ok(R.issues.some((i) => i.id.startsWith('cd_')), '失点の原因の指摘がある');
  assert.ok(R.quality.total === 10);
});
test('空・少量・片方のチームだけ・位置なしのデータでも落ちない', () => {
  const variants = [
    [],
    sample.events.slice(0, 3),
    sample.events.filter((e) => e.team === 'H'),
    sample.events.filter((e) => e.type === 'goal'),
    sample.events.map((e) => { const c = Object.assign({}, e); delete c.px; delete c.py; delete c.scene; delete c.zone; return c; }),
  ];
  for (const events of variants) {
    const st = JSON.parse(JSON.stringify(sample)); st.events = events;
    const s = SL.stats.compute(st);
    const r = SL.advice.generate(st, s);
    assert.ok(r.summary && Array.isArray(r.issues));
    for (const lv of ['pro', 'univ', 'club']) SL.advice.generate(st, s, { level: lv });
  }
});

console.log(`\n${passed} 件のテストが成功しました${process.exitCode ? '（失敗あり）' : ''}`);
