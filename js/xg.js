/* サッカー分析ラボ - xG（ゴール期待値）
 * プロの分析（Opta / StatsBomb など）が使う「そのシュートが決まる確率」を、
 * 位置（ゴールまでの距離と、ゴールが見える角度）・ヘディング・攻撃の型だけで概算する簡易モデル。
 * 守備者やGKの位置までは見られないので、あくまで目安です（本物のxGとは数値がずれます）。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const X = (SL.xg = {});

  const GH = 3.66; // ゴール幅の半分（m）
  // 距離・見込み角・log(距離) のロジスティック（代表的な位置のxG目安に当てはめた係数）
  const W = [-3.993, -0.1468, 2.5523, 1.0955];

  X.PK = 0.76;
  X.BIG = 0.3; // これ以上を「決定機」とみなす
  X.HEAD = 0.6;
  X.SCENE_MULT = { build: 1, counter: 1.1, press: 1.1, cross: 0.9, through: 1.15, long: 1.05, solo: 1, corner: 0.8, fk: 1, throw: 0.8, pk: 1 };
  // 位置が入っていないシュートに使う、ゾーンごとの平均的なxG
  X.ZONE_DEFAULT = { six: 0.42, boxC: 0.2, boxL: 0.09, boxR: 0.09, edgeC: 0.06, edgeL: 0.05, edgeR: 0.05, wideL: 0.03, wideR: 0.03, far: 0.03 };
  X.UNKNOWN = 0.09;

  const sig = (z) => 1 / (1 + Math.exp(-z));

  /** 足で打った場合の xG（sx=ゴール中央からの横ずれ, sy=ゴールラインからの距離） */
  X.at = (sx, sy) => {
    const y = Math.max(0.6, sy);
    const d = Math.hypot(sx, y);
    const theta = Math.abs(Math.atan2(GH - sx, y) - Math.atan2(-GH - sx, y));
    return sig(W[0] + W[1] * d + W[2] * theta + W[3] * Math.log(d));
  };

  /** シュートイベントの xG。{ xg, est } （est=true は位置が無く平均値で概算） */
  X.detail = (e) => {
    if (e.type === 'pkg' || e.type === 'pkx' || e.scene === 'pk') return { xg: X.PK, est: false };
    const mult = X.SCENE_MULT[e.scene] || 1;
    const head = e.body === 'head' ? X.HEAD : 1;
    let base;
    let est = false;
    if (e.px != null && e.py != null) {
      const p = SL.C.toShot(e.px, e.py);
      base = X.at(p.sx, p.sy);
    } else if (e.zone && X.ZONE_DEFAULT[e.zone] != null) {
      base = X.ZONE_DEFAULT[e.zone];
      est = true;
    } else {
      base = X.UNKNOWN;
      est = true;
    }
    return { xg: Math.min(0.95, Math.max(0.005, base * mult * head)), est };
  };
  X.of = (e) => X.detail(e).xg;
})();
