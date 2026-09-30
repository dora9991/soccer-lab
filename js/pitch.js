/* サッカー分析ラボ - ピッチの SVG
 * full()：全面（横向き・右へ攻める向きにそろえる）。タグ付けの位置入力に使う。座標 (px, py)。
 * half()：敵ゴール側の半面（ゴールが上）。ショットマップに使う。座標 (sx, sy)。 */
(function () {
  const SL = (window.SL = window.SL || {});
  const C = SL.C;
  const K = (SL.pitch = {});

  const P = C.PITCH;
  // ペナルティアークの端（PAの外側）
  const ARC_DY = Math.sqrt(P.arcR * P.arcR - (P.boxD - P.spot) * (P.boxD - P.spot));

  /* ---------- 全面 ---------- */
  /**
   * opts: cls, marker:{px,py}, dots:[{px,py,goal,on,blk,color,r}], zonesGrid:true（3分の1の線）
   */
  K.full = (opts) => {
    opts = opts || {};
    const L = P.L;
    const W = P.W;
    let s = `<svg class="${opts.cls || 'pitch-svg full'}" viewBox="-1.5 -1.5 ${L + 3} ${W + 3}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ピッチ（右へ攻める向き）">`;
    s += `<rect x="-1.5" y="-1.5" width="${L + 3}" height="${W + 3}" class="p-out"/>`;
    s += `<rect x="0" y="0" width="${L}" height="${W}" class="p-grass"/>`;
    for (let i = 0; i < 7; i++) s += `<rect x="${(i * L) / 7}" y="0" width="${L / 7}" height="${W}" class="p-stripe${i % 2 ? ' b' : ''}"/>`;
    s += `<g class="p-third"><line x1="35" y1="0" x2="35" y2="${W}"/><line x1="70" y1="0" x2="70" y2="${W}"/></g>`;
    s += `<g class="p-lines" fill="none">
      <rect x="0" y="0" width="${L}" height="${W}"/>
      <line x1="${L / 2}" y1="0" x2="${L / 2}" y2="${W}"/>
      <circle cx="${L / 2}" cy="${W / 2}" r="${P.arcR}"/>
      <rect x="0" y="${W / 2 - P.boxHalf}" width="${P.boxD}" height="${P.boxHalf * 2}"/>
      <rect x="0" y="${W / 2 - P.sixHalf}" width="${P.sixD}" height="${P.sixHalf * 2}"/>
      <rect x="${L - P.boxD}" y="${W / 2 - P.boxHalf}" width="${P.boxD}" height="${P.boxHalf * 2}"/>
      <rect x="${L - P.sixD}" y="${W / 2 - P.sixHalf}" width="${P.sixD}" height="${P.sixHalf * 2}"/>
      <path d="M ${P.boxD} ${W / 2 - ARC_DY} A ${P.arcR} ${P.arcR} 0 0 1 ${P.boxD} ${W / 2 + ARC_DY}"/>
      <path d="M ${L - P.boxD} ${W / 2 - ARC_DY} A ${P.arcR} ${P.arcR} 0 0 0 ${L - P.boxD} ${W / 2 + ARC_DY}"/>
      <rect x="-2" y="${W / 2 - P.goalHalf}" width="2" height="${P.goalHalf * 2}" class="p-goal"/>
      <rect x="${L}" y="${W / 2 - P.goalHalf}" width="2" height="${P.goalHalf * 2}" class="p-goal"/>
    </g>`;
    s += `<g class="p-spots"><circle cx="${L / 2}" cy="${W / 2}" r="0.5"/><circle cx="${P.spot}" cy="${W / 2}" r="0.45"/><circle cx="${L - P.spot}" cy="${W / 2}" r="0.45"/></g>`;
    s += `<g class="p-hint"><text x="17.5" y="${W + 0.2}" text-anchor="middle">自陣</text><text x="52.5" y="${W + 0.2}" text-anchor="middle">中盤</text><text x="87.5" y="${W + 0.2}" text-anchor="middle">敵陣</text></g>`;
    s += `<g class="p-arrow"><path d="M 38 3.4 L 67 3.4 M 63.6 1.4 L 67 3.4 L 63.6 5.4"/><text x="52.5" y="8.2" text-anchor="middle">攻める向き</text></g>`;
    if (opts.dots && opts.dots.length) {
      s += '<g class="dots">';
      for (const d of opts.dots) {
        const cls = d.goal ? 'goal' : d.blk ? 'blk' : d.on ? 'on' : 'off';
        s += `<circle cx="${d.px.toFixed(1)}" cy="${d.py.toFixed(1)}" r="${(d.r || 1.1).toFixed(2)}" class="dot ${cls}" ${d.color ? `style="--dc:${d.color}"` : ''}/>`;
      }
      s += '</g>';
    }
    if (opts.marker) {
      const m = opts.marker;
      s += `<g class="marker"><circle cx="${m.px.toFixed(1)}" cy="${m.py.toFixed(1)}" r="2.4"/><circle cx="${m.px.toFixed(1)}" cy="${m.py.toFixed(1)}" r="0.7" class="core"/></g>`;
    }
    s += '</svg>';
    return s;
  };

  /* ---------- 敵ゴール側の半面（ゴールが上） ---------- */
  K.LABEL = {
    six: [0, 3.2],
    boxC: [0, 11.6],
    boxL: [-14.6, 8.6],
    boxR: [14.6, 8.6],
    edgeC: [0, 21.2],
    edgeL: [-14.6, 21.2],
    edgeR: [14.6, 21.2],
    wideL: [-27.2, 12],
    wideR: [27.2, 12],
    far: [0, 37],
  };
  const HALF_Y = 52.5;

  /**
   * opts: cls, fills:{zone:color}, labels:{zone:[l1,l2]}, dots:[{sx,sy,goal,on,blk,xg,color}], marker:{sx,sy}
   */
  K.half = (opts) => {
    opts = opts || {};
    const fills = opts.fills || {};
    const fill = (z) => fills[z] || 'transparent';
    const bh = P.boxHalf;
    const sh = P.sixHalf;
    let s = `<svg class="${opts.cls || 'pitch-svg half'}" viewBox="-36 -4.2 72 ${HALF_Y + 6}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ゴール側のピッチ">`;
    s += `<rect x="-36" y="-4.2" width="72" height="${HALF_Y + 6}" class="p-out"/>`;
    s += `<rect x="-34" y="0" width="68" height="${HALF_Y}" class="p-grass"/>`;
    for (let i = 0; i < 7; i++) s += `<rect x="-34" y="${(i * HALF_Y) / 7}" width="68" height="${HALF_Y / 7}" class="p-stripe${i % 2 ? ' b' : ''}"/>`;
    // ゾーン（塗り）
    const z = (id, x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill(id)}" data-zone="${id}" class="zone"/>`;
    s += z('far', -34, 25, 68, HALF_Y - 25);
    s += z('wideL', -34, 0, 34 - bh, 25);
    s += z('wideR', bh, 0, 34 - bh, 25);
    s += z('edgeL', -bh, P.boxD, bh - sh, 25 - P.boxD);
    s += z('edgeR', sh, P.boxD, bh - sh, 25 - P.boxD);
    s += z('edgeC', -sh, P.boxD, sh * 2, 25 - P.boxD);
    s += z('boxL', -bh, 0, bh - sh, P.boxD);
    s += z('boxR', sh, 0, bh - sh, P.boxD);
    s += z('boxC', -sh, P.sixD, sh * 2, P.boxD - P.sixD);
    s += z('six', -sh, 0, sh * 2, P.sixD);
    s += `<g class="p-lines" fill="none">
      <rect x="-34" y="0" width="68" height="${HALF_Y}"/>
      <rect x="${-bh}" y="0" width="${bh * 2}" height="${P.boxD}"/>
      <rect x="${-sh}" y="0" width="${sh * 2}" height="${P.sixD}"/>
      <path d="M ${-ARC_DY} ${P.boxD} A ${P.arcR} ${P.arcR} 0 0 0 ${ARC_DY} ${P.boxD}"/>
      <path d="M ${-P.arcR} ${HALF_Y} A ${P.arcR} ${P.arcR} 0 0 1 ${P.arcR} ${HALF_Y}"/>
      <rect x="${-P.goalHalf}" y="-2.2" width="${P.goalHalf * 2}" height="2.2" class="p-goal"/>
    </g>`;
    s += `<g class="p-spots"><circle cx="0" cy="${P.spot}" r="0.45"/></g>`;
    if (opts.labels) {
      s += '<g class="zone-labels">';
      for (const id of Object.keys(opts.labels)) {
        const p = K.LABEL[id];
        const t = opts.labels[id];
        if (!p || !t) continue;
        s += `<text x="${p[0]}" y="${p[1]}" text-anchor="middle" class="zl1">${t[0]}</text>`;
        if (t[1]) s += `<text x="${p[0]}" y="${p[1] + 2.3}" text-anchor="middle" class="zl2">${t[1]}</text>`;
      }
      s += '</g>';
    }
    if (opts.dots && opts.dots.length) {
      s += '<g class="dots">';
      for (const d of opts.dots) {
        const r = 0.9 + Math.sqrt(Math.max(0, d.xg || 0.05)) * 2.9;
        const cls = d.goal ? 'goal' : d.blk ? 'blk' : d.on ? 'on' : 'off';
        const cx = Math.max(-33.3, Math.min(33.3, d.sx)).toFixed(1);
        const cy = Math.max(0.6, Math.min(HALF_Y - 0.6, d.sy)).toFixed(1);
        s += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" class="dot ${cls}" ${d.color ? `style="--dc:${d.color}"` : ''}>${d.tip ? `<title>${d.tip}</title>` : ''}</circle>`;
      }
      s += '</g>';
    }
    if (opts.marker) s += `<g class="marker"><circle cx="${opts.marker.sx}" cy="${opts.marker.sy}" r="1.8"/><circle cx="${opts.marker.sx}" cy="${opts.marker.sy}" r="0.6" class="core"/></g>`;
    s += '</svg>';
    return s;
  };

  /** マウス位置 → SVG の座標（viewBox 内） */
  K.svgPoint = (svgEl, ev) => {
    const r = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const scale = Math.min(r.width / vb.width, r.height / vb.height);
    const offX = (r.width - vb.width * scale) / 2;
    const offY = (r.height - vb.height * scale) / 2;
    return { x: vb.x + (ev.clientX - r.left - offX) / scale, y: vb.y + (ev.clientY - r.top - offY) / scale };
  };
  /** 全面のクリック位置 → {px, py}（ピッチ内に収める） */
  K.fullPoint = (svgEl, ev) => {
    const p = K.svgPoint(svgEl, ev);
    return { px: Math.max(0, Math.min(P.L, p.x)), py: Math.max(0, Math.min(P.W, p.y)) };
  };
})();
