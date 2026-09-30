/* サッカー分析ラボ - アドバイス生成（ルールベース）
 * 数字 → 原因の仮説 → 練習メニュー → 該当シーン、の順に出す。
 * 数値の目安は C.LEVELS（あくまで参考値）。サンプル数が少ないときは断定しない。
 * 考え方：プロの現場でも、xG（チャンスの質）と結果のずれ、失点の分類（セットプレー／ロスト後／カウンター／クロス…）、
 * ファウル・カードの規律、セットプレーの効率、時間帯の偏りを見て、試合を振り返る。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const C = SL.C;
  const D = SL.derive;
  const ST = SL.stats;
  const GL = SL.goals;
  const X = SL.xg;
  const A = (SL.advice = {});

  const pc = (v, dp) => (v == null ? '—' : (v * 100).toFixed(dp == null ? 0 : dp) + '%');
  const f1 = (v) => (v == null || !isFinite(v) ? '—' : v.toFixed(1));
  const f2 = (v) => (v == null || !isFinite(v) ? '—' : v.toFixed(2));
  const SHOTS = C.SHOT_TYPES;

  /* ---------- 練習メニュー ---------- */
  A.DRILLS = {
    finishing: { title: 'フィニッシュ（PA内で決め切る）', how: 'ペナルティエリア内にコーンを置き、パスを受けて2タッチ以内で打つ。コースは「GKの逆」か「ニア上」を毎回声に出して決める。走った直後の疲れた状態で10本×3セット行う。' },
    shotsel: { title: 'シュート選択の約束', how: 'ゲーム形式で「PA内・中央を優先。ロングシュートは“完全に空いた時だけ”」と約束する。撃つ前にGKと味方の位置を確認する声かけを入れ、打った本数とコースを毎回記録する。' },
    crossfin: { title: 'クロス＆フィニッシュ', how: 'サイドからニア・ファー・マイナス（後ろ）の3種類のクロスを上げ、2〜3人が別々のコースに入って合わせる。クロッサーは顔を上げて狙いを決めてから蹴る。' },
    wing: { title: 'サイドの崩し（オーバーラップ／インナーラップ）', how: 'サイドバックとウイングに外側のもう1人を加えた3人で、縦・内側の走り込みを使い分ける。クロスの前に「中に何人いるか」を必ず確認する。' },
    centre: { title: '中央の崩し（ワンツー・3人目の動き）', how: 'ライン間の選手へ縦パス→ワンツー→3人目が走り込む。ゴール前でのタッチ数を減らし、ワンタッチで外す動きを繰り返す。' },
    longball: { title: '背後へのボール（ロングボール）', how: 'ボランチやCBが顔を上げてからDFラインの裏へ。FWは斜めに走って受け、セカンドボールを拾う役を近くに置く。' },
    setatt: { title: 'コーナーキックの型づくり', how: 'ニア・ファー・ショートの3パターンを決めて合図で使い分ける。キッカーは「誰にどこへ」を決め、こぼれ球を拾う役を2人置く。' },
    setdef: { title: 'セットプレー守備（マークの決め方）', how: 'ニアにゾーン2人＋他はマンツーマン、を基本に、競り合いの後のセカンドボールを拾う役を決める。GKの守備範囲とセットで確認し、毎回同じ約束で守る。' },
    restdef: { title: 'リスク管理（ボールを失った時の配置）', how: '攻撃時に「最低3人は後ろに残る」と約束する。失った瞬間に、カウンターの先頭の前に立つ選手を決めておく。6対6＋GKで、失った瞬間の5秒ルールを練習する。' },
    counterpress: { title: '切り替えの5秒（ボールを失った直後の対応）', how: 'ボールを失った直後の5秒間、近くの3人で囲んで奪い返す（無理なら一斉に戻る）。4対4＋フリーマンで、奪われた瞬間に全員が反応する約束を作る。' },
    transition: { title: '攻守の切り替えゲーム', how: 'ゴール2つの5対5。奪ったら10秒以内にシュートで1点加算、奪われたら5秒以内に奪い返すか戻る。攻→守、守→攻の反応の速さを鍛える。' },
    buildup: { title: 'ビルドアップ（自陣から安全に運ぶ）', how: 'GK＋DF4人＋MF2人 対 相手2〜3人のプレスで、ライン間の選手を使って前進する。出せなければGKに戻してやり直す。自陣ゴール前では“つなぐより蹴る”のルールも決めておく。' },
    passing: { title: 'パスの質と首振り', how: 'ロンド（4対2・5対2）で、受ける前に2回首を振る。強さ・足元かスペースかを声で伝える。トラップは“次のプレーの方向”へ置く。' },
    press: { title: 'プレッシングのスイッチ', how: '「バックパス」「浮き球」「相手のトラップが大きい」をスイッチにして、全員で一斉に寄せる。ボールサイドに圧縮し、逆サイドは捨てる約束をする。' },
    linecontrol: { title: 'ラインコントロール（裏のケア・オフサイド）', how: 'DFラインを4人で揃える練習。ボールに圧力がかかっている時は上げ、かかっていない時は下げる。声をかける役（センターバック）を決める。' },
    oneonone: { title: '1対1の守備', how: '間合い（一歩半）、体の向き（縦を切って外へ）、飛び込まない、を約束する。1対1→2対2で、抜かれたらカバーが入る形まで練習する。' },
    closeout: { title: 'ミドルシュート対応（寄せとブロック）', how: 'PA外でボールを持たれたら、最初の1人が素早く寄せ、もう1人がコースを切る。シュートブロックの体の向き（正面で足を出す）を確認する。' },
    boxdef: { title: 'ペナルティエリア内の守備', how: 'クロスが入る時の立ち位置（ボールと自分のマークを同時に見る）、ヘディングの競り合い、GKとの声かけを練習する。手を使わない約束を全員で確認する。' },
    heading: { title: 'ヘディングの競り合い', how: '助走からのジャンプヘディング。体を先に入れて、相手の背中を押さない。守備は「クリアの方向はサイドへ」を約束する。' },
    discipline: { title: 'ファウルしない守り方', how: 'ボールにだけ足を出す。後ろからのタックルはしない。体を先に入れて守る。危ない時は“遅らせる”（飛び込まず、間合いを保つ）。' },
    gk: { title: 'GKのポジショニングと声かけ', how: 'ボールの位置に合わせた立ち位置（ゴールからの距離）と、クロス・1対1でのタイミングを確認する。DFラインとの声かけもセットで練習する。' },
    timing: { title: '抜け出しのタイミング（オフサイド対策）', how: 'パスの出し手の足がボールに触れた瞬間に動き出す練習。斜めに走り、ラインの外から入る。オフサイドを取られたら、次は1歩遅らせる。' },
    fitness: { title: '後半に落ちないための運動量', how: 'インターバル走（30秒走→30秒歩き）と、交代のタイミングを決める。前半から飛ばす選手を把握して、後半の入りの約束も作る。' },
    mental: { title: '得点直後・失点直後の集中', how: '得点後の5分間は「守備の約束を声に出す」ルール。ベンチからも合図を出し、リスタートの前に全員で位置を確認する。' },
    pkroutine: { title: 'PKのルーティン', how: '蹴る選手と順番を決めておき、疲れた状態で練習する。コースを決めたら変えない。GKは相手のクセを事前に把握する。' },
    dribble: { title: 'ドリブル（仕掛けの判断）', how: '1対1で、抜いた後の“次の一手”（シュートかパスか）まで決める。奪われると危ない場所（自陣ゴール前）では仕掛けない約束をする。' },
    possession: { title: 'ポゼッションで相手を動かす', how: '6対4・7対5のポジショナルプレー。ボールを回すだけでなく、ライン間の選手にパスを通すことを目的にする。' },
  };

  /* ---------- ユーティリティ ---------- */
  function add(list, ins) {
    ins.weight = ins.weight == null ? 1 : ins.weight;
    list.push(ins);
  }
  const who = (state, team, num) => (num == null ? '' : num === 0 ? 'チーム' : '#' + num + ((state.teams[team].roster.find((p) => p.num === num) || {}).name ? ' ' + state.teams[team].roster.find((p) => p.num === num).name : ''));

  /** データの充実度（何を付けると何が分かるか） */
  A.quality = (state, S) => {
    const m = S.meta;
    const items = [
      { ok: m.shotsH >= 8, label: '自チームのシュート', hint: '8本以上あると、効率やパターンの判断ができます' },
      { ok: m.hasA && m.shotsA >= 5, label: '相手チームのシュート', hint: '<V>で相手に切り替えて付けると、失点シーン（原因つき）・守備の分析・xG差が使えます' },
      { ok: m.locH >= Math.max(1, Math.round(m.shotsH * 0.6)), label: 'シュートの位置', hint: '位置を入れると、xG（ゴール期待値）とゾーン別の効率が正確になります（ピッチ図をクリック）' },
      { ok: m.hasAst, label: 'アシスト・キーパス', hint: 'ゴールの後にラストパスの背番号を入れると、チャンスメイクの評価（xA）が出ます' },
      { ok: m.hasScene, label: '攻撃の型（カウンター・クロス等）', hint: '型を切り替えて付けると、どの攻め方が効いているかが分かります（, . で切替）' },
      { ok: m.hasTov, label: 'ボールロスト', hint: 'Z キーで付けると、ロスト直後のピンチ・場所別の傾向が出ます' },
      { ok: m.hasFoul, label: 'ファウル・カード', hint: 'X キーでファウル、J/K でカード。場所別の傾向とPK・FKの危険が出ます' },
      { ok: m.hasCk, label: 'コーナーキック', hint: 'C キーで付けると、コーナーがシュートにつながっているかが出ます' },
      { ok: m.hasDef, label: 'タックル・インターセプト', hint: 'D / F / G キーで付けると、守備アクションと奪ってからの攻撃が出ます' },
      { ok: m.periodsSet, label: '前半・後半の区切り', hint: '設定で後半の開始位置を入れると、前半／後半の比較が出ます' },
    ];
    const done = items.filter((i) => i.ok).length;
    return { items, done, total: items.length };
  };

  /* ---------- メイン ---------- */
  A.generate = (state, S, opts) => {
    opts = opts || {};
    const level = opts.level || (state.cfg && state.cfg.level) || 'club';
    const B = C.LEVELS[level] || C.LEVELS.club;
    const H = S.team.H;
    const O = S.team.A;
    const strengths = [];
    const issues = [];
    const players = [];
    const hName = state.teams.H.name;
    const oName = state.teams.A.name;
    const hasOpp = S.meta.hasA && O.shots >= 3;
    const enough = H.shots >= 5;
    const half = S.half || 45;
    const scale = (half * 2) / 90;
    const zH = ST.zoneTable(S.events, (e) => e.team === 'H');
    const zA = ST.zoneTable(S.events, (e) => e.team === 'A');
    const gaItems = GL.build(state, S, { side: 'against' });
    const gfItems = GL.build(state, S, { side: 'for' });
    const ga = GL.summary(gaItems);
    const gf = GL.summary(gfItems);
    const hasScore = S.score.H + S.score.A > 0;

    /* ===== 総括 ===== */
    const summary = { headline: '', result: null, bullets: [], factors: [] };
    if (hasScore) {
      const diff = S.score.H - S.score.A;
      summary.result = diff > 0 ? 'win' : diff < 0 ? 'lose' : 'draw';
      const word = diff > 0 ? '勝ち' : diff < 0 ? '負け' : '引き分け';
      summary.headline = `${hName} ${S.score.H} − ${S.score.A} ${oName}（${word}${diff ? '・' + Math.abs(diff) + '点差' : ''}）`;
    } else {
      summary.headline = 'まだ得点のタグがありません。まず得点シーン（Q キー）からタグを付けてみましょう。';
    }
    if (enough && hasOpp) {
      const dx = H.xg - O.xg;
      const r = summary.result;
      if (r === 'lose' && dx > 0.5) summary.bullets.push(`内容（xG）は ${f2(H.xg)} 対 ${f2(O.xg)} と上回っていました。チャンスは作れていたので、決め切る力と失点の防ぎ方が勝敗を分けています。`);
      else if (r === 'lose' && dx < -0.5) summary.bullets.push(`内容（xG）でも ${f2(H.xg)} 対 ${f2(O.xg)} と下回りました。チャンスの量・質と守備の両方に課題があります。`);
      else if (r === 'win' && dx < -0.4) summary.bullets.push(`勝ちましたが、xGでは ${f2(H.xg)} 対 ${f2(O.xg)} と相手が上回っていました。GKや決定力に助けられた面があるので、内容の改善点も確認しましょう。`);
      else if (r === 'win' && dx > 0.4) summary.bullets.push(`勝因は内容の差です。xGでも ${f2(H.xg)} 対 ${f2(O.xg)} と上回りました。この形を再現しましょう。`);
      else if (r === 'draw' && Math.abs(dx) > 0.5) summary.bullets.push(`引き分けですが、xGでは ${f2(H.xg)} 対 ${f2(O.xg)}（${dx > 0 ? '上回り' : '下回り'}）でした。`);
    }
    if (H.shots + O.shots > 0) summary.bullets.push(`シュート ${H.shots}本（枠内 ${H.sot}）対 ${O.shots}本（枠内 ${O.sot}）${hasOpp ? '、xG ' + f2(H.xg) + ' 対 ' + f2(O.xg) : ''}。`);
    if (gaItems.length) {
      const parts = ga.byPrimary.map((b) => `${GL.causeLabel(b.id, 'against')} ${b.n}`).join('／');
      summary.bullets.push(`失点 ${gaItems.length}点の内訳：${parts}。`);
    }
    if (S.tl.length > 2) summary.bullets.push(`リードチェンジ ${S.flow.changes} 回、同点 ${S.flow.ties} 回。最大点差は ${hName} +${S.flow.maxLeadH} / ${oName} +${S.flow.maxLeadA}。`);

    if (enough && hasOpp) {
      const F = [
        { key: 'xg', label: 'チャンスの質と量（xG）', w: 0.4, sd: 0.6, h: H.xg, o: O.xg, better: 'high', fmt: f2 },
        { key: 'fin', label: '決定力（得点 − xG）', w: 0.3, sd: 0.9, h: H.goals - H.xg, o: O.goals - O.xg, better: 'high', fmt: (v) => (v > 0 ? '+' : '') + f2(v) },
        { key: 'sot', label: '枠内シュート数', w: 0.15, sd: 2.5, h: H.sot, o: O.sot, better: 'high', fmt: (v) => String(v) },
        { key: 'disc', label: '規律（ファウル＋カード）', w: 0.15, sd: 4, h: H.foul + 2 * H.yc + 5 * H.rc, o: O.foul + 2 * O.yc + 5 * O.rc, better: 'low', fmt: (v) => String(v) },
      ];
      for (const f of F) {
        const raw = f.better === 'high' ? f.h - f.o : f.o - f.h;
        f.impact = (raw / f.sd) * f.w;
        f.verdict = f.impact > 0.12 ? 'good' : f.impact < -0.12 ? 'bad' : 'even';
        summary.factors.push(f);
      }
    }

    /* ===== 攻撃：決定力・チャンスの質 ===== */
    if (enough) {
      if (H.xg >= 1.0 && H.goals <= H.xg - 0.9) {
        add(issues, {
          id: 'finish_low', kind: 'bad',
          title: `決定力に課題（xG ${f2(H.xg)} に対して ${H.goals}点）`,
          body: `チャンスの量・質は十分でしたが、期待される得点より ${f1(H.xg - H.goals)}点 少ない結果でした。決定機（xG 0.3以上）は ${H.big}本のうち ${H.bigGoals}本しか決まっていません。運の要素もありますが、コース・体の向き・GKを見る余裕のどれかを映像で確認しましょう。`,
          evidence: [{ label: 'xG', value: f2(H.xg) }, { label: '得点', value: H.goals }, { label: '決定機を外した数', value: H.bigMissed }],
          clips: [{ label: '決められなかった決定機', filter: { special: 'big', team: 'H', missed: true } }],
          drills: ['finishing', 'shotsel'], weight: 6,
        });
      } else if (H.goals >= H.xg + 0.9 && H.goals >= 2) {
        add(strengths, {
          id: 'finish_good', kind: 'good',
          title: `決定力が高い（xG ${f2(H.xg)} に対して ${H.goals}点）`,
          body: `期待値を上回る得点を決めています。強みですが、決定力は試合ごとにぶれやすい面もあるので、次も“同じ質のチャンス”を作れるかを確認しましょう。`,
          evidence: [{ label: 'xG', value: f2(H.xg) }, { label: '得点', value: H.goals }],
          clips: [{ label: '得点シーン', filter: { special: 'scored' } }],
          weight: 3,
        });
      }
      const nLoc = zH.located;
      if (nLoc >= 8) {
        const far = zH.groups.far;
        const box = zH.groups.box;
        if (far.share >= B.farMax + 0.1 && far.shots >= 4) {
          add(issues, {
            id: 'far_many', kind: 'warn',
            title: `ロングシュートが多い（${far.shots}本・${pc(far.share)}）`,
            body: `25m以遠のシュートは、1本あたりのxGが ${f2(far.xgShot)} と低く、${box.shots >= 3 ? `PA内の ${f2(box.xgShot)} の約 ${f1(far.xgShot / Math.max(0.001, box.xgShot))} 倍にも届きません` : 'なかなか入りません'}。打てるときは打つべきですが、崩す前に打つ癖がないかを映像で確認しましょう（目安：全体の ${pc(B.farMax)} 以内）。`,
            evidence: [{ label: 'ロング', value: `${far.shots}本 / ${far.goals}点` }, { label: 'ロングのxG/本', value: f2(far.xgShot) }, { label: 'PA内のxG/本', value: f2(box.xgShot) }],
            clips: [{ label: 'ロングシュートの場面', filter: { team: 'H', zoneGrp: 'far', types: SHOTS } }],
            drills: ['shotsel', 'centre'], weight: 4,
          });
        }
        if (box.share >= 0.62 && box.shots >= 6) {
          add(strengths, {
            id: 'box_shots', kind: 'good',
            title: `ペナルティエリア内で打てている（${box.shots}本・${pc(box.share)}）`,
            body: `シュートの ${pc(box.share)} がPA内から。1本あたりのxGは ${f2(box.xgShot)} と質の高い形を作れています。この“ゴール前に入っていく”意識を続けましょう。`,
            evidence: [{ label: 'PA内', value: `${box.shots}本 / ${box.goals}点` }, { label: 'xG/本', value: f2(box.xgShot) }],
            clips: [{ label: 'PA内のシュート', filter: { team: 'H', zoneGrp: 'box', types: SHOTS } }],
            weight: 2,
          });
        }
      }
      if (H.shots >= 8 && H.shotAcc != null && H.shotAcc <= B.shotAcc - 0.1) {
        add(issues, {
          id: 'acc_low', kind: 'warn',
          title: `枠内シュートが少ない（枠内率 ${pc(H.shotAcc)}）`,
          body: `シュート ${H.shots}本のうち枠内は ${H.sot}本（目安 ${pc(B.shotAcc)}）。${H.blk >= 3 ? `ブロックされたシュートが ${H.blk}本ある（寄せられる前に打つ／コースをずらす工夫が必要）。` : ''}枠に飛ばせないとGKに仕事をさせられません。`,
          evidence: [{ label: '枠内率', value: pc(H.shotAcc) }, { label: '目安', value: pc(B.shotAcc) }, { label: 'ブロックされた', value: H.blk + '本' }],
          clips: [{ label: '枠外・ブロックされたシュート', filter: { team: 'H', types: ['soff', 'sblk', 'pkx'] } }],
          drills: ['finishing'], weight: 3,
        });
      } else if (H.shots >= 8 && H.shotAcc != null && H.shotAcc >= B.shotAcc + 0.08) {
        add(strengths, {
          id: 'acc_good', kind: 'good',
          title: `シュートを枠に飛ばせている（枠内率 ${pc(H.shotAcc)}）`,
          body: `目安（${pc(B.shotAcc)}）を上回っています。あとは“質の高い場所（PA内・正面）”で打つ回数を増やすと得点が増えます。`,
          evidence: [{ label: '枠内率', value: pc(H.shotAcc) }, { label: '目安', value: pc(B.shotAcc) }],
          weight: 2,
        });
      }
      // 攻撃の型の偏り・効果
      const rows = S.scenes.H;
      if (rows.length && H.shots >= 8) {
        const top = rows.slice().sort((a, b) => b.shots - a.shots)[0];
        if (top.freq >= 0.55 && rows.length >= 2) {
          add(issues, {
            id: 'scene_lean', kind: 'warn',
            title: `攻め方が偏っている（「${C.sceneShort(top.scene)}」が${pc(top.freq)}）`,
            body: `シュートの ${pc(top.freq)} が同じ型から生まれています。相手に読まれやすいので、別の崩し（中央突破・サイド・セットプレー）も1つ増やせると得点の幅が広がります。`,
            evidence: rows.slice(0, 4).map((r) => ({ label: C.sceneShort(r.scene), value: `${r.shots}本 / ${r.goals}点` })),
            clips: [{ label: `${C.sceneShort(top.scene)}のシュート`, filter: { team: 'H', scene: top.scene, types: SHOTS } }],
            drills: top.scene === 'cross' ? ['centre', 'longball'] : ['wing', 'centre'], weight: 3,
          });
        }
        const weak = rows.find((r) => r.shots >= 4 && r.goals === 0 && r.xgShot != null && r.xgShot < 0.07);
        if (weak) {
          add(issues, {
            id: 'scene_weak', kind: 'warn',
            title: `「${C.sceneShort(weak.scene)}」は打っても脅威になっていない（${weak.shots}本・0点）`,
            body: `この型のシュートは1本あたりのxGが ${f2(weak.xgShot)} と低く、質の高いチャンスにつながっていません。最後の場面（誰が・どこで受けるか）の約束を作り直しましょう。`,
            evidence: [{ label: C.sceneShort(weak.scene), value: `${weak.shots}本 / 0点` }, { label: 'xG/本', value: f2(weak.xgShot) }],
            clips: [{ label: `${C.sceneShort(weak.scene)}のシュート`, filter: { team: 'H', scene: weak.scene, types: SHOTS } }],
            drills: weak.scene === 'cross' ? ['crossfin'] : ['centre'], weight: 3,
          });
        }
        const good = rows.find((r) => r.goals >= 1 && r.shots >= 2 && r.xgShot != null && r.xgShot >= 0.12 && !C.isSetPiece(r.scene));
        if (good) {
          add(strengths, {
            id: 'scene_good', kind: 'good',
            title: `「${C.sceneShort(good.scene)}」が得点源になっている（${good.shots}本・${good.goals}点）`,
            body: `この型は1本あたりのxGが ${f2(good.xgShot)} と質が高く、実際に得点も生まれています。回数を増やせるように、狙いを共有しましょう。`,
            evidence: [{ label: C.sceneShort(good.scene), value: `${good.shots}本 / ${good.goals}点` }, { label: 'xG/本', value: f2(good.xgShot) }],
            clips: [{ label: `${C.sceneShort(good.scene)}のシュート`, filter: { team: 'H', scene: good.scene, types: SHOTS } }],
            weight: 3,
          });
        }
      }
    }

    /* ===== 失点の原因（相手の得点を、攻撃の始まりから分類） ===== */
    if (gaItems.length) {
      const ids = (id) => gaItems.filter((it) => it.primary === id || (id === 'tov' && it.causes.includes('tov')));
      const setItems = gaItems.filter((it) => it.causes.some((c) => GL.SET_CAUSES.includes(c)));
      if (setItems.length >= 1 && (setItems.length >= 2 || setItems.length / gaItems.length >= 0.34)) {
        const kinds = ['corner', 'fk', 'throw', 'pk'].map((k) => [k, setItems.filter((it) => it.causes.includes(k)).length]).filter((x) => x[1]);
        add(issues, {
          id: 'cd_set', kind: 'bad',
          title: `セットプレーからの失点 ${setItems.length}点（失点の${pc(setItems.length / gaItems.length)}）`,
          body: `${kinds.map(([k, n]) => `${GL.causeLabel(k, 'against')} ${n}点`).join('・')}。セットプレーはプロでも得点の約3割を占める“準備で防げる”失点です。マークの決め方（ゾーン＋マンツーマン）と、競り合いの後の2つ目のボールの拾い方を整理しましょう。`,
          evidence: kinds.map(([k, n]) => ({ label: GL.causeLabel(k, 'against'), value: n + '点' })),
          clips: [{ label: 'セットプレーで決められた場面（攻撃の始まりから）', filter: { special: 'concede', causes: ['corner', 'fk', 'throw', 'pk'] } }],
          drills: ['setdef', 'boxdef', 'heading'], weight: 6,
        });
      }
      const tovItems = ids('tov');
      if (tovItems.length) {
        add(issues, {
          id: 'cd_tov', kind: 'bad',
          title: `ボールを失った直後の失点 ${tovItems.length}点`,
          body: `自分たちのミス（ロスト）や、奪われた直後に決められた失点です。ボールを失う場所と、その瞬間の周りの配置（誰が前に立つか、何人が後ろに残っているか）が原因になりやすい形です。攻撃時のリスク管理（レストディフェンス）と、失った直後の5秒の対応を決めておきましょう。`,
          evidence: [{ label: 'ロスト直後の失点', value: tovItems.length + '点' }, { label: 'ロスト後12秒以内の被シュート', value: S.tov.H.toShots + '本' }],
          clips: [{ label: 'ボールを失った直後に決められた場面', filter: { special: 'concede', causes: ['tov'] } }],
          drills: ['restdef', 'counterpress', 'buildup'], weight: 6,
        });
      } else if (S.tov.H.toShots >= 2) {
        add(issues, {
          id: 'tov_pinch', kind: 'warn',
          title: `ボールロストの直後に打たれている（${S.tov.H.toShots}本）`,
          body: `ロストから12秒以内に相手がシュートまで行った回数です（うち得点 ${S.tov.H.toGoals}点）。失った瞬間の切り替え（すぐ奪い返す／すぐ戻る）を徹底しましょう。`,
          evidence: [{ label: 'ロスト後の被シュート', value: S.tov.H.toShots + '本' }, { label: 'うち失点', value: S.tov.H.toGoals + '点' }],
          clips: [{ label: 'ロスト → ピンチの場面', filter: { special: 'toAllowed' } }],
          drills: ['restdef', 'counterpress'], weight: 4,
        });
      }
      const counterItems = gaItems.filter((it) => it.causes.includes('counter') && !it.causes.includes('tov'));
      if (counterItems.length) {
        add(issues, {
          id: 'cd_counter', kind: 'bad',
          title: `カウンターで決められた失点 ${counterItems.length}点`,
          body: `守備が整う前に走られて決められています。攻撃から守備への切り替えが遅いか、攻めている間に後ろに残る人数が足りていない可能性があります。“攻めている時に何人残すか”を先に決めておきましょう。`,
          evidence: [{ label: 'カウンター失点', value: counterItems.length + '点' }],
          clips: [{ label: 'カウンターで決められた場面', filter: { special: 'concede', causes: ['counter'] } }],
          drills: ['transition', 'restdef'], weight: 5,
        });
      }
      const crossItems = gaItems.filter((it) => it.causes.includes('cross'));
      if (crossItems.length) {
        add(issues, {
          id: 'cd_cross', kind: 'bad',
          title: `クロスから決められた失点 ${crossItems.length}点`,
          body: `サイドからのクロスを合わされています${crossItems.some((it) => it.detail.head) ? '（ヘディング）' : ''}。ゴール前のマーク（ボールと自分のマークを同時に見る）、ニア・ファーの守り方、クロスを上げさせない寄せ（サイドでの1対1）のどれが崩れたかを映像で確認しましょう。`,
          evidence: [{ label: 'クロス失点', value: crossItems.length + '点' }],
          clips: [{ label: 'クロスから決められた場面', filter: { special: 'concede', causes: ['cross'] } }],
          drills: ['boxdef', 'heading', 'oneonone'], weight: 5,
        });
      }
      const throughItems = gaItems.filter((it) => it.causes.includes('through') || it.causes.includes('long'));
      if (throughItems.length) {
        add(issues, {
          id: 'cd_through', kind: 'bad',
          title: `縦パス・裏への抜け出しで決められた失点 ${throughItems.length}点`,
          body: `DFラインの背後・ライン間を使われています。ラインの高さの統一（誰が声を出すか）、ボールにプレッシャーがかかっているかの判断、GKとの距離感を見直しましょう。`,
          evidence: [{ label: '縦パス・裏抜けの失点', value: throughItems.length + '点' }],
          clips: [{ label: '縦パス・裏抜けで決められた場面', filter: { special: 'concede', causes: ['through', 'long'] } }],
          drills: ['linecontrol', 'gk'], weight: 4,
        });
      }
      const farItems = gaItems.filter((it) => it.causes.includes('far'));
      if (farItems.length) {
        add(issues, {
          id: 'cd_far', kind: 'warn',
          title: `ミドルシュートで決められた失点 ${farItems.length}点`,
          body: `PAの外から打たせています。最初の寄せが遅い／シュートコースを切れていない可能性があります。GKのポジションも合わせて確認しましょう。`,
          evidence: [{ label: 'ミドル失点', value: farItems.length + '点' }],
          clips: [{ label: 'ミドルで決められた場面', filter: { special: 'concede', causes: ['far'] } }],
          drills: ['closeout', 'gk'], weight: 3,
        });
      }
      const pkItems = gaItems.filter((it) => it.causes.includes('pk'));
      if (pkItems.length) {
        add(issues, {
          id: 'cd_pk', kind: 'bad',
          title: `PKを与えて失点（${pkItems.length}点）`,
          body: `ペナルティエリア内のファウルは1回で約0.76点の失点になります。ファウルの種類（${pkItems.map((it) => (it.detail.foul ? C.foulLabel(it.detail.foul.sub).replace(/（.*）/, '') : '不明')).join('・')}）を確認し、“手を使わない・後ろから行かない・飛び込まない”を徹底しましょう。`,
          evidence: [{ label: 'PK失点', value: pkItems.length + '点' }],
          clips: [{ label: 'PKを与えた場面', filter: { special: 'concede', causes: ['pk'] } }],
          drills: ['discipline', 'boxdef'], weight: 6,
        });
      }
      // 同じ選手に何点も決められている
      const top = ga.scorers.filter((s) => s.num).sort((a, b) => b.pts - a.pts)[0];
      if (top && top.pts >= 2) {
        add(issues, {
          id: 'opp_scorer', kind: 'warn',
          title: `相手の ${who(state, 'A', top.num)} に ${top.pts}点 決められている`,
          body: `同じ選手に複数得点を許しています。誰がマークしていたか（担当が曖昧でなかったか）、その選手の得意な形（抜け出し・ヘディング・カウンター）を共有して、対策を決めましょう。`,
          evidence: [{ label: '得点者', value: who(state, 'A', top.num) }, { label: '得点', value: top.pts + '点' }],
          clips: [{ label: `${who(state, 'A', top.num)}に決められた場面`, filter: { special: 'concede', num: top.num } }],
          drills: ['oneonone', 'linecontrol'], weight: 4,
        });
      }
      // 得点直後の失点
      let after = 0;
      gaItems.forEach((it) => {
        const prev = gfItems.filter((g) => g.t < it.t && it.t - g.t <= 240);
        if (prev.length) after++;
      });
      if (after >= 1 && gaItems.length >= 2) {
        add(issues, {
          id: 'after_score', kind: 'warn',
          title: `自分たちの得点の直後（4分以内）に失点 ${after}回`,
          body: `得点の直後は気持ちが緩みやすく、相手にとってはチャンスの時間です。得点後のリスタートで守備の約束（ライン・マーク）を全員で声に出す習慣を作りましょう。`,
          evidence: [{ label: '得点直後の失点', value: after + '回' }],
          drills: ['mental'], weight: 3,
        });
      }
    }

    /* ===== 相手にチャンスを作らせている（被シュートの質） ===== */
    if (hasOpp && O.shots >= 6) {
      const boxA = zA.groups.box;
      if (zA.located >= 5 && boxA.share >= 0.55 && boxA.shots >= 5) {
        add(issues, {
          id: 'opp_box', kind: 'warn',
          title: `ペナルティエリア内で打たれすぎている（${boxA.shots}本・${pc(boxA.share)}）`,
          body: `相手のシュートの ${pc(boxA.share)} がPA内からで、1本あたりのxGは ${f2(boxA.xgShot)}。中を固める（ボランチの位置・ライン間の管理）ことで、質の高いチャンスを減らせます。`,
          evidence: [{ label: 'PA内の被シュート', value: `${boxA.shots}本 / ${boxA.goals}点` }, { label: 'xG/本', value: f2(boxA.xgShot) }],
          clips: [{ label: 'PA内で打たれた場面', filter: { team: 'A', zoneGrp: 'box', types: SHOTS } }],
          drills: ['boxdef', 'linecontrol'], weight: 3,
        });
      } else if (O.xg <= 1.0 && O.shots >= 6) {
        add(strengths, {
          id: 'def_solid', kind: 'good',
          title: `守備の質は高い（被xG ${f2(O.xg)}）`,
          body: `相手のシュートは ${O.shots}本ありましたが、質の高いチャンスは多く作らせていません。失点${gaItems.length ? '（' + gaItems.length + '点）' : ''}は少ないチャンスから決められたものが中心で、防ぎ方の再確認で取り戻せる部分です。`,
          evidence: [{ label: '被xG', value: f2(O.xg) }, { label: '被シュート', value: O.shots + '本' }],
          weight: 3,
        });
      }
    }

    /* ===== ボールロスト ===== */
    const T = S.tov.H;
    if (T.total >= 3) {
      if (T.own3 >= 3 && T.own3 / T.total >= 0.4) {
        add(issues, {
          id: 'tov_own', kind: 'bad',
          title: `自陣ゴール前でのボールロストが多い（${T.own3}回・${pc(T.own3 / T.total)}）`,
          body: `自陣でのミスは、そのまま大きなピンチになります。ビルドアップでは“出せないなら蹴る”“サイドへ逃がす”などの約束を決め、GK・CB・ボランチの受ける位置と首振りを確認しましょう。`,
          evidence: [{ label: '自陣でのロスト', value: T.own3 + '回' }, { label: '全ロスト', value: T.total + '回' }],
          clips: [{ label: '自陣でのボールロスト', filter: { team: 'H', types: ['tov'], fieldZones: ['ownBox', 'def3'] } }],
          drills: ['buildup', 'passing'], weight: 5,
        });
      }
      const types = Object.entries(T.byType).sort((a, b) => b[1] - a[1]);
      const topT = types[0];
      if (topT && topT[1] >= 3 && topT[1] / T.total >= 0.4) {
        const tips = {
          pass: 'パスミスは、出す前に相手を見ていない／受け手の準備ができていない、のどちらかが多いです。映像で“出す前の視線と受け手の体の向き”を確認しましょう。',
          dribble: 'ドリブルで奪われる場面は、ボールが体から離れる／顔が下がることが典型です。仕掛ける場所（自陣では仕掛けない）の約束も大切です。',
          control: 'トラップミスは、次のプレーの方向にボールを置けていないことが原因です。ボールが来る前に周りを見る習慣を付けましょう。',
          long: 'ロングボールが通らない場合、出し手と受け手のタイミングが合っていないか、競り合う枚数が足りない可能性があります。',
          clear: '苦し紛れのクリアは、受け手を探す時間が足りていないサインです。周りの選手が早めにパスコースを作りましょう。',
          other: '',
        };
        add(issues, {
          id: 'tov_type', kind: 'warn',
          title: `ボールロストの型：「${C.tovLabel(topT[0]).replace(/（.*）/, '')}」が${topT[1]}回（${pc(topT[1] / T.total)}）`,
          body: tips[topT[0]] || '型が偏っています。映像で共通点を探しましょう。',
          evidence: types.slice(0, 3).map(([k, v]) => ({ label: C.tovLabel(k).replace(/（.*）/, ''), value: v + '回' })),
          clips: [{ label: `${C.tovLabel(topT[0]).replace(/（.*）/, '')}の場面`, filter: { team: 'H', types: ['tov'], sub: topT[0] } }],
          drills: [(C.TOV_TYPES.find((x) => x.id === topT[0]) || {}).drill || 'passing'], weight: 3,
        });
      }
    }
    if (S.regain.H.toShots >= 2) {
      add(strengths, {
        id: 'regain_good', kind: 'good',
        title: `奪ってすぐに攻められている（${S.regain.H.toShots}回シュートまで）`,
        body: `ボール奪取（タックル／インターセプト）から12秒以内にシュートへ持ち込んだ回数です（うち得点 ${S.regain.H.toGoals}点）。奪った瞬間の“縦への意識”が高いチームです。`,
        evidence: [{ label: '奪取からのシュート', value: S.regain.H.toShots + '回' }, { label: 'うち得点', value: S.regain.H.toGoals + '点' }],
        clips: [{ label: '奪ってからの攻撃', filter: { special: 'regainAtk' } }],
        weight: 3,
      });
    }

    /* ===== ファウル・カード・オフサイド ===== */
    const Fh = S.fouls.H;
    const foulLimit = B.fouls90 * scale * 1.3;
    if (Fh.total >= 5 && Fh.total > Math.max(foulLimit, 5)) {
      add(issues, {
        id: 'foul_many', kind: 'warn',
        title: `ファウルが多い（${Fh.total}回${hasOpp ? '・相手 ' + S.fouls.A.total + '回' : ''}）`,
        body: `目安（${f1(B.fouls90 * scale)}回程度）を上回っています。ファウルは相手のフリーキックとカードにつながります。${Fh.own3 >= 3 ? `特に自陣ゴール前・ペナルティエリア付近で ${Fh.own3}回。危険な位置でのファウルは失点に直結します。` : '場所や種類に偏りがないか、下の分析で確認しましょう。'}`,
        evidence: [{ label: 'ファウル', value: Fh.total + '回' }, { label: '目安', value: '〜' + f1(B.fouls90 * scale) }, { label: '自陣でのファウル', value: Fh.own3 + '回' }],
        clips: [{ label: 'ファウルの場面', filter: { team: 'H', types: ['foul'] } }],
        drills: ['discipline', 'oneonone'], weight: 4,
      });
    }
    if (Fh.setShots >= 1 && Fh.setGoals >= 1) {
      add(issues, {
        id: 'foul_setp', kind: 'bad',
        title: `ファウルからのセットプレーで失点（${Fh.setGoals}点）`,
        body: `自分たちのファウルの後にFK／PKで決められました。危険な位置でのファウルを減らすこと、そしてファウル後のセットプレー守備の準備（壁・マーク）を確認しましょう。`,
        evidence: [{ label: 'ファウル後のセットプレー', value: Fh.setShots + '本' }, { label: 'うち失点', value: Fh.setGoals + '点' }],
        clips: [{ label: 'ファウル → セットプレーの場面', filter: { special: 'foulSet' } }],
        drills: ['discipline', 'setdef'], weight: 4,
      });
    }
    const cards = Fh.yc.length + Fh.rc.length * 2;
    if (Fh.rc.length >= 1 || Fh.yc.length >= 3) {
      add(issues, {
        id: 'cards', kind: Fh.rc.length ? 'bad' : 'warn',
        title: Fh.rc.length ? `退場者が出た（レッド ${Fh.rc.length}）` : `イエローカードが多い（${Fh.yc.length}枚）`,
        body: `${Fh.rc.length ? '退場は数的不利になり、試合の流れを大きく変えます。' : 'カードをもらった選手は次のプレーで慎重になり、守備が緩くなります。'}カードの理由（遅れたタックル／反スポーツ的行為／異議）を確認し、チーム全体で“ボールに行く守り方”を共有しましょう。`,
        evidence: [{ label: 'イエロー', value: Fh.yc.length + '枚' }, { label: 'レッド', value: Fh.rc.length + '枚' }],
        clips: [{ label: 'カード・ファウルの場面', filter: { team: 'H', types: ['foul', 'yc', 'rc'] } }],
        drills: ['discipline'], weight: Fh.rc.length ? 6 : 3,
      });
    } else if (cards === 0 && Fh.total >= 1 && Fh.total <= Math.max(B.fouls90 * scale * 0.8, 2) && S.meta.hasFoul) {
      add(strengths, {
        id: 'clean', kind: 'good',
        title: `クリーンに戦えている（ファウル ${Fh.total}回・カードなし）`,
        body: `目安より少ないファウルで、カードもありません。守備の規律が保てています。`,
        evidence: [{ label: 'ファウル', value: Fh.total + '回' }],
        weight: 1,
      });
    }
    if (H.off >= 3 && H.off > Math.max(B.off90 * scale * 1.5, 2)) {
      add(issues, {
        id: 'offside', kind: 'warn',
        title: `オフサイドが多い（${H.off}回）`,
        body: `攻撃のチャンスを自分で止めています。パスの出し手を見ながら“足が離れた瞬間”に動き出すこと、相手のラインの高さを確認することを意識しましょう。`,
        evidence: [{ label: 'オフサイド', value: H.off + '回' }, { label: '目安', value: '〜' + f1(B.off90 * scale * 1.5) }],
        clips: [{ label: 'オフサイドの場面', filter: { team: 'H', types: ['off'] } }],
        drills: ['timing', 'longball'], weight: 3,
      });
    }
    if (O.off >= 4) {
      add(strengths, {
        id: 'trap_good', kind: 'good',
        title: `相手のオフサイドを${O.off}回とれている`,
        body: `DFラインの統一がうまく機能しています。ラインを上げるタイミングと声かけの成果です。ただし、ラインの裏を取られた失点があれば同時に確認しましょう。`,
        evidence: [{ label: '相手のオフサイド', value: O.off + '回' }],
        clips: [{ label: '相手のオフサイド', filter: { team: 'A', types: ['off'] } }],
        weight: 2,
      });
    }

    /* ===== セットプレー（攻撃） ===== */
    const sp = S.setp.H;
    if (sp.corners >= 3 && sp.corner.shots <= 1) {
      add(issues, {
        id: 'corner_low', kind: 'warn',
        title: `コーナー ${sp.corners}本がシュートにつながっていない（${sp.corner.shots}本）`,
        body: `セットプレーは準備した形が結果に出やすい場面です。ニア・ファー・ショートの型と、跳ぶ人・こぼれ球を拾う人の役割を決め直しましょう。`,
        evidence: [{ label: 'コーナー', value: sp.corners + '本' }, { label: 'そこからのシュート', value: sp.corner.shots + '本' }],
        clips: [{ label: 'コーナーキックの場面', filter: { team: 'H', types: ['ck'] } }],
        drills: ['setatt', 'heading'], weight: 3,
      });
    }
    const setGoals = gfItems.filter((it) => it.causes.some((c) => GL.SET_CAUSES.includes(c)));
    if (setGoals.length >= 1 && gfItems.length >= 2 && setGoals.length / gfItems.length >= 0.4) {
      add(strengths, {
        id: 'set_good', kind: 'good',
        title: `セットプレーが武器になっている（得点${gfItems.length}点中 ${setGoals.length}点）`,
        body: `${setGoals.map((it) => GL.causeLabel(it.primary, 'for')).join('・')}から決めています。準備した形が実を結んでいます。コーナー・FKのパターンを増やすと相手は守りにくくなります。`,
        evidence: [{ label: 'セットプレー得点', value: setGoals.length + '点' }],
        clips: [{ label: 'セットプレーで決めた場面', filter: { special: 'scored', causes: ['corner', 'fk', 'throw', 'pk'] } }],
        weight: 3,
      });
    }
    if (sp.pk.taken && sp.pk.goals < sp.pk.taken) {
      add(issues, {
        id: 'pk_miss', kind: 'warn',
        title: `PKを外した（${sp.pk.goals}/${sp.pk.taken}）`,
        body: `PKは約76%決まる大きなチャンスです。蹴る選手と順番を決めて、プレッシャーのかかる状況（疲れた後・試合終盤）で練習しておきましょう。`,
        evidence: [{ label: 'PK', value: `${sp.pk.goals}/${sp.pk.taken}` }],
        clips: [{ label: 'PKの場面', filter: { team: 'H', types: ['pkg', 'pkx'] } }],
        drills: ['pkroutine'], weight: 3,
      });
    }

    /* ===== 前半と後半・時間帯 ===== */
    if (S.halves.length >= 2 && S.meta.periodsSet) {
      const h1 = S.halves.find((r) => r.q === 1);
      const h2 = S.halves.find((r) => r.q === 2);
      if (h1 && h2) {
        const drop = h2.A.xg - h1.A.xg;
        if (h2.A.goals + h2.H.og >= 2 && h2.A.goals + h2.H.og >= 2 * Math.max(1, h1.A.goals + h1.H.og)) {
          add(issues, {
            id: 'second_half', kind: 'warn',
            title: `後半に失点が集中している（前半 ${h1.A.goals + h1.H.og}点 → 後半 ${h2.A.goals + h2.H.og}点）`,
            body: `後半の入り・運動量の低下・交代のタイミングが原因になりやすい形です。ハーフタイムに“後半の最初の5分の約束”を決めることと、交代の準備を確認しましょう。${drop > 0.5 ? `後半は相手のxGも ${f2(h1.A.xg)} → ${f2(h2.A.xg)} と増えています。` : ''}`,
            evidence: [{ label: '前半の失点', value: h1.A.goals + h1.H.og }, { label: '後半の失点', value: h2.A.goals + h2.H.og }],
            clips: [{ label: '後半に決められた場面', filter: { special: 'concede', q: 2 } }],
            drills: ['fitness', 'mental'], weight: 4,
          });
        }
      }
    }
    const spellsA = S.spells.filter((s) => s.team === 'A');
    if (spellsA.length) {
      add(issues, {
        id: 'opp_spell', kind: 'warn',
        title: `相手に押し込まれた時間帯がある（${spellsA.length}回）`,
        body: `短い時間に相手がシュートを続けた区間です。この間に何が起きたか（ロスト・セカンドボール・交代）を映像で確認し、“押し込まれた時の逃げ道”を決めておきましょう。`,
        evidence: spellsA.slice(0, 3).map((s) => ({ label: D.minuteLabel(state, s.t0) + '〜', value: s.n + '本' })),
        clips: [{ label: '押し込まれた時間帯', filter: { special: 'spells', team: 'A' } }],
        drills: ['possession', 'press'], weight: 2,
      });
    }

    /* ===== GK ===== */
    {
      const gkNum = S.gk.H;
      const g = gkNum != null ? S.players.H.find((p) => p.num === gkNum) : null;
      if (g && g.faced >= 3) {
        if (g.savePct != null && g.savePct >= 0.65) {
          add(strengths, {
            id: 'gk_good', kind: 'good',
            title: `GKが好セーブ（${g.saves}/${g.faced} セーブ・${pc(g.savePct)}）`,
            body: `枠内シュートの ${pc(g.savePct)} を止めています。GKのセーブがなければ、失点はもっと増えていました。`,
            evidence: [{ label: 'セーブ', value: `${g.saves}/${g.faced}` }],
            clips: [{ label: 'GKのセーブ', filter: { special: 'saves', team: 'H' } }],
            weight: 2,
          });
        } else if (g.savePct != null && g.savePct <= 0.4 && g.faced >= 4) {
          add(issues, {
            id: 'gk_low', kind: 'warn',
            title: `枠内シュートを止められていない（${g.saves}/${g.faced} セーブ）`,
            body: `決められた${g.ga}点のシュートを、xG（打たれた場所の難しさ）と合わせて確認しましょう。防げたかどうかは、ポジション・反応・コースのどれかで分かれます。`,
            evidence: [{ label: 'セーブ', value: `${g.saves}/${g.faced}` }],
            clips: [{ label: '決められた場面', filter: { special: 'concede' } }],
            drills: ['gk'], weight: 3,
          });
        }
      }
    }

    /* ===== 選手ごとのポイント ===== */
    for (const p of S.players.H) {
      if (!p.num) continue;
      const label = who(state, 'H', p.num);
      if (p.goals >= 2) {
        add(players, {
          id: 'goals_' + p.num, kind: 'good', player: p.num, metric: p.goals,
          title: `${label}：${p.goals}ゴール（xG ${f2(p.xg)}）`,
          body: `得点源です。${p.xg < p.goals - 0.8 ? '期待値を大きく上回っているので、この決定力を再現するために、決めた形（誰のパスで・どこから）を共有しましょう。' : 'チャンスをしっかり決めています。'}`,
          evidence: [{ label: 'ゴール', value: p.goals }, { label: 'シュート', value: p.shots }, { label: 'xG', value: f2(p.xg) }],
          clips: [{ label: `${label}のゴール`, filter: { team: 'H', num: p.num, types: ['goal', 'pkg'] } }],
          weight: 2,
        });
      } else if (p.shots >= 3 && p.xg >= 0.8 && p.goals === 0) {
        add(players, {
          id: 'unlucky_' + p.num, kind: 'warn', player: p.num, metric: p.xg,
          title: `${label}：決定機を決め切れなかった（xG ${f2(p.xg)} → 0点）`,
          body: `質の高いチャンスに絡んでいますが、得点に届いていません。撃ったコース・体の向き・GKの動きを映像で確認し、フィニッシュの癖を確認しましょう。`,
          evidence: [{ label: 'シュート', value: p.shots }, { label: 'xG', value: f2(p.xg) }],
          clips: [{ label: `${label}のシュート`, filter: { team: 'H', num: p.num, types: SHOTS } }],
          drills: ['finishing'], weight: 3,
        });
      } else if (p.shots >= 4 && p.xgShot != null && p.xgShot < 0.07) {
        add(players, {
          id: 'lowq_' + p.num, kind: 'warn', player: p.num, metric: p.shots,
          title: `${label}：質の低い位置からのシュートが多い（${p.shots}本・xG/本 ${f2(p.xgShot)}）`,
          body: `遠目や角度のない位置からの回数が多い可能性があります。“もう一つ持ち出す／パスを選ぶ”で、より良い位置から打てないかを確認しましょう。`,
          evidence: [{ label: 'シュート', value: p.shots }, { label: 'xG/本', value: f2(p.xgShot) }],
          clips: [{ label: `${label}のシュート`, filter: { team: 'H', num: p.num, types: SHOTS } }],
          drills: ['shotsel'], weight: 2,
        });
      }
      if (p.ast + p.kp >= 3) {
        add(players, {
          id: 'creator_' + p.num, kind: 'good', player: p.num, metric: p.ast * 2 + p.kp,
          title: `${label}：チャンスメイク（アシスト ${p.ast}・キーパス ${p.kp}）`,
          body: `最後のパスでチームのチャンスを作っています（xA ${f2(p.xa)}）。この選手にボールが入る回数を増やし、周りが動き出しやすい形を作りましょう。`,
          evidence: [{ label: 'アシスト', value: p.ast }, { label: 'キーパス', value: p.kp }, { label: 'xA', value: f2(p.xa) }],
          clips: [{ label: `${label}のアシスト・キーパス`, filter: { team: 'H', num: p.num, types: ['ast', 'kp'] } }],
          weight: 2,
        });
      }
      if (p.tov >= 3) {
        const mine = S.events.filter((e) => e.type === 'tov' && e.team === 'H' && e.num === p.num);
        const cnt = {};
        mine.forEach((e) => (cnt[e.sub || 'other'] = (cnt[e.sub || 'other'] || 0) + 1));
        const t = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
        add(players, {
          id: 'tov_' + p.num, kind: 'warn', player: p.num, metric: p.tov,
          title: `${label}：ボールロスト ${p.tov}回`,
          body: `${t ? `最多は「${C.tovLabel(t[0]).replace(/（.*）/, '')}」。` : ''}どの場所・どんな状況で起きたか（自陣か、プレッシャーを受けていたか）を映像で確認しましょう。ボールを持つ時間が長い選手ほど増えます。`,
          evidence: [{ label: 'ロスト', value: p.tov + '回' }],
          clips: [{ label: `${label}のボールロスト`, filter: { team: 'H', num: p.num, types: ['tov'] } }],
          drills: [t ? (C.TOV_TYPES.find((x) => x.id === t[0]) || {}).drill || 'passing' : 'passing'], weight: 3,
        });
      }
      if (p.foul >= 3 || (p.yc >= 1 && p.foul >= 2)) {
        add(players, {
          id: 'foul_' + p.num, kind: 'warn', player: p.num, metric: p.foul + p.yc * 2,
          title: `${label}：ファウル ${p.foul}回${p.yc ? '・イエロー' + p.yc : ''}`,
          body: `この選手のファウルが集中しています。遅れて入る／後ろから行く／手を使う、のどれが多いかを確認し、警告を受けた後の守り方（間合いを保つ）を決めておきましょう。`,
          evidence: [{ label: 'ファウル', value: p.foul }, { label: 'イエロー', value: p.yc }],
          clips: [{ label: `${label}のファウル`, filter: { team: 'H', num: p.num, types: ['foul', 'yc', 'rc'] } }],
          drills: ['discipline'], weight: 3,
        });
      }
      if (p.fouled >= 3) {
        add(players, {
          id: 'fouled_' + p.num, kind: 'good', player: p.num, metric: p.fouled,
          title: `${label}：ファウルを${p.fouled}回受けている`,
          body: `相手が止めるためにファウルをしてしまう、つまり“止めにくい”選手です。この選手が受ける位置でのセットプレーを、得点のチャンスにつなげましょう。`,
          evidence: [{ label: '受けたファウル', value: p.fouled }],
          weight: 1,
        });
      }
      if (p.tkl + p.itc >= 4) {
        add(players, {
          id: 'def_' + p.num, kind: 'good', player: p.num, metric: p.tkl + p.itc + p.clr * 0.5,
          title: `${label}：守備で貢献（タックル ${p.tkl}・インターセプト ${p.itc}${p.clr ? '・クリア ' + p.clr : ''}）`,
          body: `ボール奪取の起点になっています。奪った後に素早く前へ運べているかを、映像で確認しましょう。`,
          evidence: [{ label: 'タックル', value: p.tkl }, { label: 'インターセプト', value: p.itc }],
          clips: [{ label: `${label}のボール奪取`, filter: { team: 'H', num: p.num, types: ['tkl', 'itc', 'clr'] } }],
          weight: 1,
        });
      }
      if (p.off >= 2) {
        add(players, {
          id: 'off_' + p.num, kind: 'warn', player: p.num, metric: p.off,
          title: `${label}：オフサイド ${p.off}回`,
          body: `動き出しが早い（ラインを見ていない）可能性があります。出し手の足が離れる瞬間まで待ち、斜めに動いて外から入ると防げます。`,
          evidence: [{ label: 'オフサイド', value: p.off }],
          clips: [{ label: `${label}のオフサイド`, filter: { team: 'H', num: p.num, types: ['off'] } }],
          drills: ['timing'], weight: 2,
        });
      }
    }

    if (!enough) {
      add(issues, {
        id: 'few_data', kind: 'info',
        title: 'まだデータが少ないため、詳しい分析はこれからです',
        body: 'シュートのタグが5本以上たまると、効率やパターンの分析が出てきます。まずはシュートとゴール（Q W E R）、そして相手のシュート（V で切り替え）から付けてみましょう。',
        evidence: [{ label: '自チームのシュート', value: H.shots + '本' }],
        weight: 9,
      });
    }

    const byWeight = (a, b) => b.weight - a.weight;
    strengths.sort(byWeight);
    issues.sort(byWeight);
    players.sort((a, b) => b.weight - a.weight || (b.metric || 0) - (a.metric || 0));
    // 選手コメントが多くなりすぎないよう、種類ごとに上限を設ける
    const LIMIT = { goals: 3, unlucky: 2, lowq: 2, creator: 2, tov: 3, foul: 3, fouled: 1, def: 2, off: 2 };
    const seen = {};
    const limited = players.filter((p) => {
      const cat = p.id.split('_')[0];
      seen[cat] = (seen[cat] || 0) + 1;
      return seen[cat] <= (LIMIT[cat] || 2);
    });
    players.length = 0;
    limited.forEach((p) => players.push(p));

    // 練習メニュー（改善点に紐づくものを重要度順に集約）
    const drillScore = {};
    [...issues, ...players.filter((p) => p.kind !== 'good')].forEach((ins) => {
      (ins.drills || []).forEach((d) => {
        drillScore[d] = (drillScore[d] || 0) + ins.weight;
      });
    });
    const plan = Object.entries(drillScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => Object.assign({ id }, A.DRILLS[id]));

    return { level, bench: B, summary, strengths, issues, players, plan, quality: A.quality(state, S), ga, gf };
  };
})();
