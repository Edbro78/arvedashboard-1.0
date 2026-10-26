/* Arvekalkulator – diagrammer i ren SVG/DOM (strenger som morphes inn i DOM). window.Charts */
(function () {
  const F = window.Fmt;
  const { esc, kr } = F;
  const r2 = v => Math.round(v * 100) / 100;

  const patterns = pfx => `<defs>
    <pattern id="${pfx}pat-ins" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#D1FADF"></rect><rect width="2.5" height="6" fill="#079455"></rect></pattern>
    <pattern id="${pfx}pat-fri" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#CCD3DE"></rect><rect width="2.5" height="6" fill="#002359"></rect></pattern>
  </defs>`;

  const pathAttr = d => `d="${d}"`;
  const bandEl = (key, d, fill, o, title, tip) =>
    `<path class="band" data-key="${esc(key)}" d="${d}" fill="${fill}" fill-opacity="${o}" style="--o:${o}" data-tip-title="${esc(title)}" data-tip="${esc(tip)}"></path>`;
  const rectPath = (x, y, w, h) => `M${r2(x)},${r2(y)} h${r2(w)} v${r2(h)} h${r2(-w)} Z`;
  const bandPath = (x0, y0, x1, y1, w) => {
    const xm = r2((x0 + x1) / 2);
    [x0, y0, x1, y1, w] = [x0, y0, x1, y1, w].map(r2);
    return `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${r2(y1 + w)} C${xm},${r2(y1 + w)} ${xm},${r2(y0 + w)} ${x0},${r2(y0 + w)} Z`;
  };

  /**
   * Sankey: Nettoformue → (Livsforsikring | B egen formue | A dødsbo) → mottakere.
   * R = resultat fra compute(), alt = ett alternativ. Alt avledes fra alt.flows.
   */
  function sankey(R, alt, prefix) {
    const pfx = prefix ? String(prefix).replace(/[^\w-]/g, '') + '-' : '';
    const flows = alt.flows.filter(f => f.value > 0.5).map((f, i) => Object.assign({ i }, f));
    if (!flows.length) return '';
    const nodes = R.nodes;
    const recOrder = ['S', 'U', ...R.felles.map(h => h.id), ...R.skA.map(h => h.id), 'P', 'O', 'X'];
    const srcOrder = ['I', 'B', 'A'];
    const mid = { I: 0, B: 0, A: 0 }, recv = {};
    flows.forEach(f => { mid[f.from] += f.value; recv[f.to] = (recv[f.to] || 0) + f.value; });
    const midIds = srcOrder.filter(id => mid[id] > 0.5);
    const recIds = recOrder.filter(id => recv[id] > 0.5);
    const total = mid.I + mid.B + mid.A;
    const k = 300 / total;
    const SLOT = 40, GAP = 14, NW = 12, PAD = 28;
    const X = { N: 150, M: 450, R: 740 };
    const bh = v => Math.max(1.5, v * k);
    const colH = (ids, val) => ids.reduce((s, id) => s + Math.max(SLOT, bh(val[id])), 0) + GAP * Math.max(0, ids.length - 1);
    const nVal = mid.B + mid.A;
    const H = Math.ceil(Math.max(colH(midIds, mid), colH(recIds, recv), bh(nVal)) + PAD * 2);
    const place = (ids, val) => {
      const out = {}; let y = (H - colH(ids, val)) / 2;
      ids.forEach(id => { const h = bh(val[id]); const slot = Math.max(SLOT, h); out[id] = { y: y + (slot - h) / 2, h }; y += slot + GAP; });
      return out;
    };
    const pm = place(midIds, mid), pr = place(recIds, recv);
    // Nettoformue sentreres mot B- og A-nodene
    let pn = null;
    const nIds = ['B', 'A'].filter(id => pm[id]);
    if (nIds.length) {
      const top = pm[nIds[0]].y, bot = pm[nIds[nIds.length - 1]].y + pm[nIds[nIds.length - 1]].h;
      const h = bh(nVal);
      pn = { y: Math.max(4, Math.min(H - h - 4, (top + bot) / 2 - h / 2)), h };
    }

    const recName = id => id === 'S' ? `${R.nB} (gjenlevende)` : (nodes[id] || {}).name || id;
    const midInfo = {
      I: { name: 'Livsforsikring', sub: 'utenfor dødsboet', fill: `url(#${pfx}pat-ins)` },
      B: { name: `${R.nB} – egen formue`, sub: 'ikke arv', fill: '#A0AEC4' },
      A: { name: `${F.gen(R.nA)} dødsbo`, sub: 'arv', fill: '#405A82' }
    };
    if (R.enslig) midInfo.A.name = 'Dødsbo';
    const bandFill = f => f.hatch === 'ins' || f.from === 'I' ? [`url(#${pfx}pat-ins)`, .75] : f.hatch === 'fri' ? [`url(#${pfx}pat-fri)`, .75]
      : f.from === 'B' ? ['#A0AEC4', .45] : [(nodes[f.to] || {}).color || '#405A82', .28];

    const bands = [], nodeEls = [], labels = [], rows = [];
    // Nettoformue → B / A
    if (pn) {
      let off = 0;
      nIds.forEach(id => {
        const w = bh(mid[id]);
        const d = bandPath(X.N + NW, pn.y + off, X.M, pm[id].y, w);
        const tt = id === 'B' ? `${R.nB} – egen formue — ${kr(mid.B)}` : `${midInfo.A.name} — ${kr(mid.A)}`;
        const tb = id === 'B' ? 'Halvdel av felleseiet og eget særeie. Ikke arv.' : 'Avdødes nettoformue etter ekteskapsdeling. Det er dette som arves.';
        bands.push(bandEl('nb-' + id, d, id === 'B' ? '#A0AEC4' : '#405A82', id === 'B' ? .45 : .28, tt, tb));
        off += w;
      });
      const d = rectPath(X.N, pn.y, NW, pn.h);
      nodeEls.push(`<path class="node" data-key="node-N" ${pathAttr(d)} fill="#264472"></path>`);
      labels.push(`<g class="lbl" data-key="lbl-N" style="transform:translate(${X.N - 10}px,${r2(pn.y + pn.h / 2)}px)">
        <text class="t-name" text-anchor="end" y="-3">Nettoformue</text><text class="t-sub" text-anchor="end" y="15">${esc(kr(nVal))}</text></g>`);
    }
    // Ut fra mellomnodene, sortert etter mottakerrekkefølge
    const outOff = { I: 0, B: 0, A: 0 }, inOff = {};
    const ri = id => recOrder.indexOf(id);
    const byOut = flows.slice().sort((a, b) => srcOrder.indexOf(a.from) - srcOrder.indexOf(b.from) || ri(a.to) - ri(b.to) || a.i - b.i);
    const y0 = {};
    byOut.forEach(f => { y0[f.i] = pm[f.from].y + outOff[f.from]; outOff[f.from] += f.value * k; });
    // Inn til mottaker, sortert etter kilde
    const byIn = flows.slice().sort((a, b) => ri(a.to) - ri(b.to) || srcOrder.indexOf(a.from) - srcOrder.indexOf(b.from) || a.i - b.i);
    byIn.forEach(f => {
      inOff[f.to] = inOff[f.to] || 0;
      const w = f.value * k;
      const y1 = pr[f.to].y + inOff[f.to];
      inOff[f.to] += w;
      const [fill, o] = bandFill(f);
      const d = bandPath(X.M + NW, y0[f.i], X.R, y1, Math.max(w, .6));
      const title = `${recName(f.to)}${f.sub ? ' · ' + f.sub : ''} — ${kr(f.value)}`;
      bands.push(bandEl(`b-${f.from}-${f.to}-${f.hatch || ''}-${f.sub || ''}`, d, fill, o, title, f.calc || ''));
      rows.push(`<tr><td>${esc(midInfo[f.from].name)}</td><td>${esc(recName(f.to))}${f.sub ? ' (' + esc(f.sub) + ')' : ''}</td><td>${esc(kr(f.value))}</td></tr>`);
    });
    // Mellomnoder
    midIds.forEach(id => {
      const p = pm[id], info = midInfo[id];
      nodeEls.push(`<path class="node" data-key="node-${id}" ${pathAttr(rectPath(X.M, p.y, NW, p.h))} fill="${info.fill}"></path>`);
      labels.push(`<g class="lbl" data-key="lbl-${id}" style="transform:translate(${X.M - 10}px,${r2(p.y + p.h / 2)}px)">
        <text class="t-name halo" text-anchor="end" y="-3">${esc(info.name)}</text><text class="t-sub halo" text-anchor="end" y="15">${esc(kr(mid[id]))} · ${esc(info.sub)}</text></g>`);
    });
    // Mottakere
    recIds.forEach(id => {
      const p = pr[id], n = nodes[id] || {};
      const fromA = flows.filter(f => f.to === id && f.from === 'A').reduce((s, f) => s + f.value, 0);
      let sub = kr(recv[id]);
      if (id === 'U') sub += ' · rådighet, ikke arv';
      else if (fromA > 0.5 && R.bo > 0) sub += ` · ${F.share(fromA / R.bo)} av boet`;
      else if (flows.every(f => f.to !== id || f.from === 'I')) sub += ' · forsikring';
      nodeEls.push(`<path class="node" data-key="node-${id}" ${pathAttr(rectPath(X.R, p.y, NW, p.h))} fill="${n.color || '#405A82'}"></path>`);
      labels.push(`<g class="lbl" data-key="lbl-${id}" style="transform:translate(${X.R + NW + 10}px,${r2(p.y + p.h / 2)}px)">
        <text class="t-name" y="-3">${esc(recName(id))}</text><text class="t-sub" y="15">${esc(sub)}</text></g>`);
    });
    const label = `Sankey-diagram over formuens vei i alternativet ${alt.title}. Se tabellen under for tallene.`;
    return `<svg class="sankey" viewBox="0 0 1000 ${H}" role="img" aria-label="${esc(label)}" data-key="sankey">${patterns(pfx)}
      <g data-key="bands">${bands.join('')}</g><g data-key="nodes">${nodeEls.join('')}</g><g data-key="labels">${labels.join('')}</g></svg>
      <table class="sr-only"><caption>${esc(label)}</caption><thead><tr><th>Fra</th><th>Til</th><th>Beløp</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  /**
   * Waterfall. cols: [{key,label,value,kind:'total'|'step',color,hatch?}]
   */
  function waterfall(cols, ariaLabel) {
    let level = 0, max = 0;
    const segs = cols.map(c => {
      let lo, hi;
      if (c.kind === 'total') { lo = Math.min(0, c.value); hi = Math.max(0, c.value); level = c.value; }
      else { const nl = level - c.value; lo = Math.min(level, nl); hi = Math.max(level, nl); level = nl; }
      max = Math.max(max, hi);
      return Object.assign({ lo, hi }, c);
    });
    const INNER = 200, HEAD = 22;
    const k = max > 0 ? INNER / max : 0;
    const n = segs.length;
    return `<div class="scroll-x"><div class="wf-grid" role="img" aria-label="${esc(ariaLabel)}" style="grid-template-columns:repeat(${n},minmax(72px,1fr));min-width:${n * 72}px">
      ${segs.map(s => {
        const bg = s.hatch === 'fri' ? 'var(--hatch-fri)' : s.hatch === 'ins' ? 'var(--hatch-ins)' : s.color;
        const v = (s.kind === 'step' && s.neg ? '−' : '') + F.short(s.value);
        return `<div class="wf-col" data-key="wf-${esc(s.key)}" title="${esc(s.label + ': ' + kr(s.value))}">
          <div class="wf-plot" style="height:${INNER + HEAD}px"><div class="wf-bar" style="bottom:${r2(Math.max(0, s.lo) * k)}px;height:${r2(Math.max(1, (s.hi - Math.max(0, s.lo)) * k))}px;background:${bg}">
          <span class="wf-val">${esc(v)}</span></div></div>
          <div class="wf-lbl">${esc(s.label)}</div></div>`;
      }).join('')}
    </div></div>`;
  }

  /**
   * Sammenligning per mottaker. groups: [{key,name,sub,color,values:[v|null ×4]}]
   */
  const CMP_COLORS = ['#002359', '#405A82', '#0A5EDC', '#84AEED'];
  function compare(groups) {
    const max = Math.max(1, ...groups.flatMap(g => g.values.filter(v => v != null)));
    return `<div class="cmp-groups">${groups.map(g => `
      <div class="cmp-g" data-key="cg-${esc(g.key)}">
        <div class="cmp-g-h"><span class="dot" style="background:${g.color}"></span><span class="n">${esc(g.name)}</span><span class="s">${esc(g.sub || '')}</span></div>
        ${g.values.map((v, i) => `<div class="cmp-bar"><span class="i">${i + 1}</span>
          <div class="trk">${v == null ? '' : `<div class="fill" style="width:${r2(Math.max(0, v) / max * 100)}%;background:${CMP_COLORS[i]}"></div>`}</div>
          <span class="a ${v == null ? 'na' : ''}">${v == null ? 'Ikke tilgjengelig' : esc(kr(v))}</span></div>`).join('')}
      </div>`).join('')}</div>`;
  }

  const HOLD_COLOR = {
    hus: '#002359', fritid: '#264472', bil: '#405A82', innbo: '#667085',
    selskap: '#3B7EE3', fond: '#84AEED', bank: '#B5CFF5', pensjon: '#0E7090', annet: '#8091AC',
    ins: 'var(--hatch-ins)', debt: '#F04438', kids: '#9747FF'
  };
  function holdFill(type) { return HOLD_COLOR[type] || HOLD_COLOR.annet; }

  /**
   * Gjenlevendes balanse etter oppgjør. bal = alt.balance
   */
  function holdings(bal, ariaLabel) {
    if (!bal) return '';
    const max = Math.max(bal.gross, bal.owe, 1);
    const stack = (items, cls) => {
      if (!items.length) return `<div class="${cls} empty">Ingen</div>`;
      return `<div class="${cls}" role="img" aria-label="${esc(ariaLabel)}">${items.map(it => {
        const w = Math.max(1.2, it.value / max * 100);
        const fill = holdFill(it.type);
        return `<div class="hold-seg${it.type === 'ins' ? ' hatch-ins' : ''}" style="flex:${r2(it.value)} 1 0;min-width:${r2(w * 0.4)}%${it.type === 'ins' ? '' : `;background:${fill}`}" title="${esc(it.name + ': ' + kr(it.value))}"></div>`;
      }).join('')}</div>`;
    };
    return `<div class="hold">${stack(bal.keep, 'hold-bar keep')}${bal.liab.length ? stack(bal.liab, 'hold-bar out') : ''}</div>`;
  }

  window.Charts = { sankey, waterfall, compare, holdings, HOLD_COLOR, CMP_COLORS };
})();
