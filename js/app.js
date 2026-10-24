/* Arvekalkulator – state, rendering og hendelser. All juridikk ligger i ArveEngine. */
(function () {
  const E = window.ArveEngine, F = window.Fmt, C = window.Charts;
  const { esc, kr, gen } = F;
  const STORE = 'arvekalkulator.v1';
  const TABS = [
    { id: 'forside', num: '', label: 'Forside' },
    { id: 'inndata', num: '', label: 'Familie og formue' },
    { id: 'lov', num: 1, label: 'Lovens fordeling' },
    { id: 'uskifte', num: 2, label: 'Uskifte' },
    { id: 'minimum', num: 3, label: 'Minimumsarv' },
    { id: 'testament', num: 4, label: 'Testament' },
    { id: 'sammenligning', num: '', label: 'Sammenligning' }
  ];
  const TAB_IDS = TABS.map(t => t.id);
  const ALT_IDX = { lov: 0, uskifte: 1, minimum: 2, testament: 3 };
  const TYPES = [['hus', 'Bolig'], ['fritid', 'Fritidsbolig'], ['bil', 'Bil/båt'], ['innbo', 'Innbo'], ['annet', 'Annen formue']];
  const BANNER_ICON = { error: 'bx-error-circle', warn: 'bx-error', info: 'bx-info-circle', success: 'bx-check-circle' };

  const root = document.getElementById('app');
  const tipEl = document.getElementById('tip');
  const ui = { tab: 'forside', open: {}, showCalc: true, modal: false };
  let input, R, VAL = null, timer = null;

  /* ================= State ================= */
  const fresh = () => E.clone(E.DEFAULT_INPUT);
  function normalize(inp) {
    const base = fresh();
    const o = Object.assign({}, base, inp || {});
    const n = (inp && inp.insNeed) || {};
    o.insNeed = { lov: Object.assign({}, base.insNeed.lov, n.lov || {}), uskifte: Object.assign({}, base.insNeed.uskifte, n.uskifte || {}) };
    if (!Array.isArray(o.assets)) o.assets = base.assets;
    o.consent = o.consent || {}; o.testament = o.testament || {};
    delete o.knew;
    return o;
  }
  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
    input = normalize(saved && saved.input);
    if (saved && TAB_IDS.includes(saved.tab)) ui.tab = saved.tab;
    if (saved && typeof saved.showCalc === 'boolean') ui.showCalc = saved.showCalc;
    const h = location.hash.slice(1);
    if (TAB_IDS.includes(h)) ui.tab = h;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ input, tab: ui.tab, showCalc: ui.showCalc })); } catch (e) { /* privat modus */ }
  }
  const getP = path => path.split('.').reduce((o, k) => o == null ? undefined : o[k], input);
  function setP(path, v) {
    const ks = path.split('.'); let o = input;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }
  function afterSet(path) {
    if (['civil', 'sambFelles', 'nFelles', 'nSkM', 'nSkK'].includes(path)) input.testament = {};
    if ((path === 'civil' || path === 'sambFelles') && input.civil === 'samboer' && input.sambFelles) input.nFelles = Math.max(1, input.nFelles | 0);
  }
  function setTestament(id, v) {
    const A = R.A;
    if (!input.testament[A]) {
      const t = R.testament;
      input.testament[A] = { spouse: t.spouse, other: t.other, kids: Object.assign({}, t.kids) };
    }
    const t = input.testament[A];
    if (id === 'S') t.spouse = v; else if (id === 'O') t.other = v; else { t.kids = t.kids || {}; t.kids[id] = v; }
  }

  /* ================= Morph (DOM-diff som bevarer fokus og CSS-overganger) ================= */
  const keyOf = n => n.nodeType === 1 ? n.getAttribute('data-key') : null;
  const same = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || a.nodeName === b.nodeName);
  function morphNode(a, b) {
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    const active = a === document.activeElement;
    for (const at of Array.from(b.attributes)) {
      if (active && at.name === 'value') continue;
      if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    }
    for (const at of Array.from(a.attributes)) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    const tag = a.nodeName;
    if (tag === 'INPUT') { const v = b.getAttribute('value') || ''; if (!active && a.value !== v) a.value = v; return; }
    if (tag === 'TEXTAREA') { if (!active && a.value !== b.textContent) a.value = b.textContent; return; }
    morphChildren(a, b);
    if (tag === 'SELECT' && !active) { const o = b.querySelector('option[selected]'); if (o && a.value !== o.value) a.value = o.value; }
  }
  function morphChildren(from, to) {
    const keyed = new Map();
    for (const c of Array.from(from.childNodes)) { const k = keyOf(c); if (k) keyed.set(k, c); }
    let cur = from.firstChild;
    for (const t of Array.from(to.childNodes)) {
      const k = keyOf(t);
      let m = null;
      if (k) { m = keyed.get(k) || null; if (m && !same(m, t)) m = null; if (m) keyed.delete(k); }
      else if (cur && !keyOf(cur) && same(cur, t)) m = cur;
      if (m) {
        if (m === cur) cur = cur.nextSibling; else from.insertBefore(m, cur);
        morphNode(m, t);
      } else from.insertBefore(t, cur);
    }
    while (cur) { const n = cur.nextSibling; from.removeChild(cur); cur = n; }
  }

  /* ================= Render ================= */
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(render, ms); }
  function render() {
    clearTimeout(timer);
    R = E.compute(input);
    const tpl = document.createElement('template');
    tpl.innerHTML = view();
    morphChildren(root, tpl.content);
    document.title = `Arvekalkulator – ${TABS.find(t => t.id === ui.tab).label}`;
    save();
  }

  /* ================= Små byggeklosser ================= */
  const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' og ' + a[a.length - 1];
  const banner = (lvl, text) => `<div class="banner ${lvl}" role="${lvl === 'error' ? 'alert' : 'status'}"><i class="bx ${BANNER_ICON[lvl] || BANNER_ICON.info}" aria-hidden="true"></i><div>${esc(text)}</div></div>`;
  const banners = (arr, key) => arr && arr.length ? `<div class="banners" data-key="${key || 'banners'}">${arr.map(w => banner(w.level, w.text)).join('')}</div>` : '';
  const sq = c => c === 'hatch' || c === 'ins' ? `<span class="sq hatch-ins"></span>` : c === 'fri' ? `<span class="sq hatch-fri"></span>` : `<span class="sq" style="background:${c}"></span>`;
  const dot = c => c === 'ins' ? `<span class="dot hatch-ins"></span>` : c === 'fri' ? `<span class="dot hatch-fri"></span>` : `<span class="dot" style="background:${c}"></span>`;
  function seg(bind, value, opts, cls = '', label = '') {
    return `<div class="seg ${cls}" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>${opts.map(o => {
      const on = o.v === value;
      return `<button type="button" role="radio" aria-checked="${on}" class="${on ? 'on' : ''}" data-action="set" data-bind="${bind}" data-value="${esc(JSON.stringify(o.v))}">${esc(o.l)}</button>`;
    }).join('')}</div>`;
  }
  function sw(bind, on, label, help, disabled) {
    return `<button type="button" class="swrow" role="switch" aria-checked="${!!on}"${disabled ? ' disabled' : ''}${bind ? ` data-action="toggle" data-bind="${bind}"` : ''}${bind ? ` data-key="sw-${esc(bind)}"` : ''}>
      <span class="swtxt"><span class="swl">${esc(label)}</span>${help ? `<span class="swh">${esc(help)}</span>` : ''}</span>
      <span class="sw ${on ? 'on' : ''}" aria-hidden="true"><span class="knob"></span></span></button>`;
  }
  const textField = (label, bind, val, help) => {
    const id = 'f-' + bind.replace(/\W/g, '-');
    return `<div class="field"><label class="flabel" for="${id}">${esc(label)}</label><input id="${id}" class="inp" type="text" data-bind="${bind}" data-type="text" value="${esc(val)}" autocomplete="off">${help ? `<span class="fhelp">${esc(help)}</span>` : ''}</div>`;
  };
  const moneyInput = (bind, val, label, cls = '') =>
    `<div class="fld ${cls}"><input class="inp" type="text" inputmode="numeric" data-bind="${bind}" data-type="money" value="${F.num(val)}" aria-label="${esc(label)}" autocomplete="off"><span class="suf" aria-hidden="true">kr</span></div>`;
  const moneyField = (label, bind, val, help) =>
    `<div class="field"><span class="flabel">${esc(label)}</span>${moneyInput(bind, val, label)}${help ? `<span class="fhelp">${esc(help)}</span>` : ''}</div>`;
  const recOrder = () => ['S', 'U', ...R.felles.map(h => h.id), ...R.skA.map(h => h.id), 'P', 'O', 'X'];
  const recName = id => id === 'S' ? R.nB : (R.nodes[id] || {}).name || id;

  /* ================= Visninger ================= */
  function view() {
    return header() + hero() + kpis() + '<div id="tabs-anchor" data-key="anchor"></div>' + tabbar()
      + `<main class="wrap main" id="main" data-key="main">${panel()}</main>` + footer() + (ui.modal ? modal() : '');
  }

  function header() {
    return `<header class="hdr" data-key="hdr"><div class="wrap hdr-in">
      <div class="brand"><img src="assets/spwm-logo.svg" alt="Söderberg &amp; Partners Wealth Management"><span class="vr"></span><span class="app-name">Arvekalkulator</span></div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="print"><i class="bx bx-download" aria-hidden="true"></i>Eksporter PDF-rapport</button>
    </div></header>`;
  }

  function hero() {
    const title = R.enslig ? `Arveoppgjør for ${R.nm.M}` : `Arveoppgjør for ${R.nm.M} og ${R.nm.K}`;
    const scen = R.enslig ? `Scenario: ${R.nm.M} dør. 1 G = ${kr(R.G)}.` : `Scenario: ${R.nA} dør først, ${R.nB} er gjenlevende. 1 G = ${kr(R.G)}.`;
    return `<section class="wrap hero" data-key="hero"><div><div class="eyebrow">ARVEOPPGJØR</div><h1 class="h1">${esc(title)}</h1><p class="lead">${esc(scen)}</p></div>
      ${R.enslig ? '' : `<div class="who"><span class="who-label" id="who-l">Hvem dør først</span>${seg('firstDies', input.firstDies, [{ v: 'M', l: R.nm.M }, { v: 'K', l: R.nm.K }], 'seg-dark', 'Hvem dør først')}</div>`}
    </section>`;
  }

  function kpis() {
    if (ui.tab === 'forside') return '';
    const e = R.est;
    const cells = [
      ['#264472', 'Nettoformue', e.netto, `Brutto ${kr(e.brutto)} − gjeld ${kr(e.debtTot)}`],
      ['#405A82', R.enslig ? 'Dødsbo' : `${gen(R.nA)} dødsbo`, R.bo, R.insolvent ? 'Boet er insolvent' : R.gift ? 'Halvdel felleseie + særeie' : R.samb ? 'Egne eierandeler fratrukket gjeld' : 'Hele nettoformuen']
    ];
    if (!R.enslig) cells.push(['#A0AEC4', `${R.nB} – egen formue`, R.bOwn, 'Ikke arv']);
    cells.push(['hatch', 'Livsforsikring', R.insA, `${F.nf(R.insGA, 1)} G · utenfor dødsboet`]);
    return `<section class="wrap" data-key="kpi" style="margin-bottom:24px"><div class="kpi">${cells.map(c => `
      <div class="kpi-c"><div class="kpi-l">${sq(c[0])}${esc(c[1])}</div><div class="kpi-v">${esc(kr(c[2]))}</div><div class="kpi-s">${esc(c[3])}</div></div>`).join('')}</div></section>`;
  }

  function tabSub(id) {
    if (id === 'forside') return 'Oversikt';
    if (id === 'inndata') return 'Inndata';
    if (id === 'sammenligning') return 'Alle fire side om side';
    const a = R.alts[ALT_IDX[id]];
    if (!a.available) return 'Ikke tilgjengelig';
    if (R.enslig) return `Fordelt ${F.short(R.bo)} kr`;
    return id === 'uskifte' ? `${R.nB} rår over ${F.short(a.survivor.total)} kr` : `${R.nB} totalt ${F.short(a.survivor.total)} kr`;
  }
  function tabbar() {
    return `<nav class="tabbar" data-key="tabbar" aria-label="Alternativer"><div class="wrap"><div class="tabs" role="tablist">${TABS.map(t => {
      const sel = t.id === ui.tab;
      const na = ALT_IDX[t.id] != null && !R.alts[ALT_IDX[t.id]].available;
      return `<button type="button" class="tab ${na ? 'na' : ''}" role="tab" id="tab-${t.id}" aria-controls="panel" aria-selected="${sel}" tabindex="${sel ? 0 : -1}" data-action="tab" data-tab="${t.id}">
        <span class="tab-l1">${t.num ? `<span class="tab-n">${t.num}</span>` : ''}${esc(t.label)}</span><span class="tab-l2">${esc(tabSub(t.id))}</span></button>`;
    }).join('')}</div></div></nav>`;
  }

  function panel() {
    let body;
    if (ui.tab === 'forside') body = frontTab();
    else if (ui.tab === 'inndata') body = inputTab();
    else if (ui.tab === 'sammenligning') body = compareTab();
    else body = altTab(ALT_IDX[ui.tab]);
    return `<section class="panel" id="panel" role="tabpanel" aria-labelledby="tab-${ui.tab}" data-key="panel-${ui.tab}">${body}</section>`;
  }

  /* ---------- Forside ---------- */
  const ALT_DESC = [
    'Boet skiftes nå etter arvelovens regler, uten testament.',
    'Gjenlevende overtar boet udelt. Arven etter førstavdøde fordeles når begge er døde.',
    'Barna begrenses til pliktdel og gjenlevende til minstearv. Resten er fri del.',
    'Fordeling etter avdødes ønske, kontrollert mot pliktdel og minstearv.'
  ];
  function frontTab() {
    const hero = `<section class="fp-hero" data-key="fp-hero">
      <div class="fp-hero-txt">
        <div class="eyebrow fp-eb">ARVEKALKULATOR</div>
        <h2 class="fp-title">Oversikt over arveoppgjøret – før det blir aktuelt</h2>
        <p class="fp-lead">Se hvordan formuen fordeles etter loven, ved uskifte, med minimumsarv og med testament. Beregningene følger arveloven av 2019 og oppdateres fortløpende når forutsetningene endres.</p>
        <div class="fp-cta">
          <button type="button" class="btn btn-md fp-btn-w" data-action="tab" data-tab="inndata">Start med familie og formue</button>
          <button type="button" class="btn btn-md fp-btn-ghost" data-action="tab" data-tab="sammenligning">Se sammenligningen</button>
        </div>
      </div>
      ${heroArt()}
    </section>`;

    const alts = `<section data-key="fp-alts"><div class="fp-sec-h"><div class="eyebrow">FIRE ALTERNATIVER</div><h3 class="h2-xs">Fire måter arven kan fordeles på</h3></div>
      <div class="fp-alts">${R.alts.map((a, i) => {
        return `<button type="button" class="fp-alt ${a.available ? '' : 'na'}" data-action="tab" data-tab="${a.id}" data-key="fa-${a.id}">
          <span class="fp-num">${a.num}</span>
          <span class="fp-alt-t">${esc(a.title)}</span>
          <span class="fp-alt-d">${esc(ALT_DESC[i])}</span>
          ${a.available ? '' : `<span class="fp-alt-f"><span class="l">Ikke tilgjengelig</span><span class="na-r">${esc(a.reason)}</span></span>`}
          <span class="go">Åpne alternativet →</span></button>`;
      }).join('')}</div></section>`;

    const steps = [
      ['Familie og formue', 'Legg inn sivilstand, barn, eiendeler, gjeld, særeie og livsforsikring.', 'inndata'],
      R.enslig ? ['Arvingene', 'Barna arver likt. Uten barn går arven til foreldre og søsken.', 'lov']
        : ['Hvem dør først', 'Velg rekkefølgen øverst til høyre. Hele modellen regnes om med en gang.', 'lov'],
      ['Sammenlign', 'Se hva hver arving sitter igjen med i de fire alternativene.', 'sammenligning']
    ];
    const how = `<section class="card fp-steps-card" data-key="fp-how"><div class="fp-sec-h" style="margin-bottom:24px"><div class="eyebrow">SLIK BRUKER DU KALKULATOREN</div><h3 class="h2-xs">Tre steg til et oversiktlig arveoppgjør</h3></div>
      <ol class="fp-steps">${steps.map((s, i) => `<li><button type="button" class="fp-step" data-action="tab" data-tab="${s[2]}"><span class="fp-step-n">${i + 1}</span>
        <span class="fp-step-t">${esc(s[0])}</span><span class="fp-step-d">${esc(s[1])}</span></button></li>`).join('')}</ol></section>`;

    const terms = [
      ['bx-building-house', 'Dødsbo', 'Avdødes nettoformue etter ekteskapsdeling. Det er dette som arves.', ''],
      ['bx-lock-alt', 'Pliktdelsarv', '⅔ av dødsboet fordeles likt på barna, og kan begrenses til 15 G per barn.', 'Inntil 15 G'],
      ['bx-shield-quarter', 'Minstearv', 'Ektefellen arver minst 4 G med barn og 6 G uten. Samboer med felles barn: 4 G.', '4 G / 6 G'],
      ['bx-git-branch', 'Uskifte', 'Gjenlevende overtar felleseiet udelt og rår over det så lenge hun eller han lever.', ''],
      ['bx-slider-alt', 'Fri kvote', 'Den delen av boet som kan testamenteres fritt når pliktdel og ektefellens arv er sikret.', ''],
      ['bx-group', 'Livsforsikring', 'Utbetales direkte til begunstiget og går utenom dødsboet.', '']
    ];
    const gloss = `<section class="card" data-key="fp-terms"><div class="fp-sec-h" style="margin-bottom:24px"><div class="eyebrow">BEGREPER</div><h3 class="h2-xs">Det viktigste å kjenne til</h3></div>
      <div class="fp-terms">${terms.map(t => `<div class="fp-term"><span class="icirc"><i class="bx ${t[0]}" aria-hidden="true"></i></span>
        <div><div class="fp-term-h"><span class="t">${esc(t[1])}</span><span class="v">${esc(t[3])}</span></div><p>${esc(t[2])}</p></div></div>`).join('')}</div></section>`;

    return hero + alts + `<div class="fp-two" data-key="fp-two">${how}${gloss}</div>`;
  }

  /* Illustrasjon av formuens vei, uten tall */
  function heroArt() {
    const bp = (x0, y0, x1, y1, w) => {
      const m = (x0 + x1) / 2;
      return `M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1} L${x1},${y1 + w} C${m},${y1 + w} ${m},${y0 + w} ${x0},${y0 + w} Z`;
    };
    const band = (d, fill, o, delay) => `<path class="fp-band" d="${d}" fill="${fill}" fill-opacity="${o}" style="--d:${delay}ms"></path>`;
    const node = (x, y, h, fill, delay) => `<rect class="fp-node" x="${x}" y="${y}" width="8" height="${h}" rx="2" fill="${fill}" style="--d:${delay}ms"></rect>`;
    const lbl = (x, y, t, anchor, cls = '') => `<text class="fp-lbl ${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(t)}</text>`;
    const survivor = R.enslig ? 'Arvinger' : 'Gjenlevende';
    return `<figure class="fp-art" aria-hidden="true">
      <svg viewBox="0 0 520 320" role="presentation">
        <defs><pattern id="fp-ins" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#D1FADF"></rect><rect width="2.5" height="6" fill="#079455"></rect></pattern></defs>
        ${band(bp(28, 70, 210, 30, 80), '#A0AEC4', .28, 0)}
        ${band(bp(28, 150, 210, 140, 100), '#84AEED', .32, 80)}
        ${band(bp(218, 30, 400, 14, 80), '#A0AEC4', .28, 200)}
        ${band(bp(218, 140, 400, 94, 25), '#FFFFFF', .22, 280)}
        ${band(bp(218, 262, 400, 119, 28), 'url(#fp-ins)', .8, 360)}
        ${band(bp(218, 165, 400, 165, 37.5), '#3B7EE3', .6, 440)}
        ${band(bp(218, 202.5, 400, 216, 37.5), '#84AEED', .5, 520)}
        ${node(20, 70, 180, '#FFFFFF', 0)}
        ${node(210, 30, 80, '#A0AEC4', 120)}${node(210, 140, 100, '#84AEED', 120)}${node(210, 262, 28, 'url(#fp-ins)', 120)}
        ${node(400, 14, 133, '#FFFFFF', 560)}${node(400, 165, 37.5, '#3B7EE3', 600)}${node(400, 216, 37.5, '#84AEED', 640)}
        ${lbl(20, 56, 'Formue', 'start', 'strong')}
        ${lbl(200, 74, 'Egen formue', 'end')}${lbl(200, 194, 'Dødsbo', 'end')}${lbl(200, 280, 'Livsforsikring', 'end')}
        ${lbl(416, 84, survivor, 'start', 'strong')}${lbl(416, 188, 'Barn', 'start', 'strong')}${lbl(416, 239, 'Barn', 'start', 'strong')}
      </svg>
      <figcaption class="fp-cap"><span>${sq('#A0AEC4')}Egen formue</span><span>${sq('#84AEED')}Arv fra dødsboet</span><span>${sq('hatch')}Livsforsikring</span></figcaption>
    </figure>`;
  }

  /* ---------- Inndata ---------- */
  function ccard(id, icon, title, summary, body, hatch) {
    const open = ui.open[id] !== false;
    return `<section class="ccard ${open ? 'is-open' : ''}" data-key="card-${id}">
      <button type="button" class="ccard-h" data-action="toggleCard" data-id="${id}" aria-expanded="${open}" aria-controls="cb-${id}">
        <span class="icirc ${hatch ? 'hatch-ins' : ''}"><i class="bx ${icon}" aria-hidden="true"></i></span>
        <span class="ccard-t"><span class="ccard-title">${esc(title)}</span><span class="ccard-sum">${esc(summary)}</span></span>
        <i class="bx bx-chevron-down chev" aria-hidden="true"></i></button>
      ${open ? `<div class="ccard-b" id="cb-${id}" data-key="body-${id}">${body}</div>` : ''}
    </section>`;
  }

  function inputTab() {
    return `<div class="panel-h" data-key="ih"><div><h2 class="h2-xs">Familie og formue</h2><p class="muted">Alle felt kan redigeres. Beregningen oppdateres fortløpende i de fire alternativene.</p></div>
      <button type="button" class="btn btn-tertiary btn-sm" data-action="reset"><i class="bx bx-reset" aria-hidden="true"></i>Tilbakestill til testcase</button></div>
      <div class="grid-in" data-key="grid">${familyCard()}${assetsCard()}${debtCard()}${saereieCard()}${insCard()}${paramCard()}</div>`;
  }

  function familyCard() {
    const i = input, nm = R.nm;
    const civilL = { gift: 'Gift', samboer: 'Samboer', enslig: 'Enslig' }[i.civil];
    const nSk = (i.nSkM | 0) + (i.nSkK | 0);
    const sum = R.enslig ? `${civilL} · ${R.felles.length} barn` : `${civilL} · ${R.felles.length} felles barn · ${nSk} særkullsbarn`;
    const stepRow = (bind, val, color, label, help, min = 0) => `<div class="st-row" data-key="st-${bind}">${dot(color)}
      <span class="st-t"><span class="st-l">${esc(label)}</span><span class="help">${esc(help)}</span></span>
      <span class="st-c"><button type="button" class="icon-btn" data-action="step" data-bind="${bind}" data-delta="-1" data-min="${min}" aria-label="Færre: ${esc(label)}"${val <= min ? ' disabled' : ''}><i class="bx bx-minus" aria-hidden="true"></i></button>
      <span class="st-v" aria-live="polite">${val}</span>
      <button type="button" class="icon-btn" data-action="step" data-bind="${bind}" data-delta="1" aria-label="Flere: ${esc(label)}"${val >= 8 ? ' disabled' : ''}><i class="bx bx-plus" aria-hidden="true"></i></button></span></div>`;
    const steps = [];
    if (R.enslig) steps.push(stepRow('nFelles', i.nFelles | 0, '#0A5EDC', 'Barn', `arver etter ${nm.M}`));
    else {
      if (!(R.samb && !i.sambFelles)) steps.push(stepRow('nFelles', i.nFelles | 0, '#0A5EDC', 'Felles barn', 'arver begge', R.samb ? 1 : 0));
      steps.push(stepRow('nSkM', i.nSkM | 0, '#9747FF', `Særkullsbarn – ${nm.M}`, `arver bare ${nm.M}`));
      steps.push(stepRow('nSkK', i.nSkK | 0, '#DC6803', `Særkullsbarn – ${nm.K}`, `arver bare ${nm.K}`));
    }
    const yn = [{ v: true, l: 'Ja' }, { v: false, l: 'Nei' }];
    const body = `
      <div class="field"><span class="flabel">Sivilstand</span>${seg('civil', i.civil, [{ v: 'gift', l: 'Gift' }, { v: 'samboer', l: 'Samboer' }, { v: 'enslig', l: 'Enslig' }], '', 'Sivilstand')}</div>
      <div class="row2">${R.enslig ? textField('Navn', 'nameM', i.nameM) : textField('Navn, mann', 'nameM', i.nameM) + textField('Navn, kvinne', 'nameK', i.nameK)}</div>
      ${R.samb ? `<div class="field"><span class="flabel">Har felles barn</span>${seg('sambFelles', !!i.sambFelles, yn, '', 'Har felles barn')}</div>
        ${!i.sambFelles ? banner('warn', 'Samboere uten felles barn har ingen lovbestemt arverett etter hverandre. Gjenlevende kan bare tilgodeses gjennom testament (alternativ 4).') : ''}` : ''}
      <div class="field"><span class="flabel">Foreldre, søsken eller deres barn lever</span>${seg('parentsAlive', i.parentsAlive !== false, yn, '', 'Foreldre, søsken eller deres barn lever')}
        <span class="fhelp">${R.gift ? 'Brukes når avdøde ikke har barn. Uten foreldrelinje arver ektefellen hele boet.' : 'Brukes når avdøde ikke har barn.'}</span></div>
      <div class="stepper">${steps.join('')}</div>`;
    return ccard('familie', 'bx-group', 'Familiestatus', sum, body);
  }

  function assetsCard() {
    const nm = R.nm;
    const rows = input.assets.map((a, ix) => {
      let meta = `<select class="sel sm" data-bind="assets.${ix}.type" aria-label="Type">${TYPES.map(t => `<option value="${t[0]}"${a.type === t[0] ? ' selected' : ''}>${t[1]}</option>`).join('')}</select>`;
      if (R.gift) {
        const own = [['felles', 'Felleseie'], ['sM', `Særeie ${nm.M}`], ['sK', `Særeie ${nm.K}`]];
        meta += `<select class="sel sm" data-bind="assets.${ix}.own" aria-label="Eierskap">${own.map(o => `<option value="${o[0]}"${(a.own || 'felles') === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
      } else if (R.samb) {
        const p = Math.min(100, Math.max(0, +a.pctM || 0));
        meta += `<span class="pctin">Eierandel ${esc(nm.M)} <input class="inp sm" type="text" inputmode="decimal" data-bind="assets.${ix}.pctM" data-type="dec" value="${F.dec(p, 1)}" aria-label="Eierandel ${esc(nm.M)} i prosent"> % · ${esc(nm.K)} ${F.pct(100 - p)}</span>`;
      }
      return `<div class="asset" data-key="asset-${esc(a.id)}">
        <div class="asset-top"><input class="inp" type="text" data-bind="assets.${ix}.name" data-type="text" value="${esc(a.name)}" aria-label="Navn på eiendel" autocomplete="off">
        ${moneyInput(`assets.${ix}.value`, a.value, `Verdi, ${a.name}`)}
        <button type="button" class="icon-btn ghost del" data-action="delAsset" data-id="${esc(a.id)}" aria-label="Slett ${esc(a.name)}"><i class="bx bx-trash" aria-hidden="true"></i></button></div>
        <div class="asset-meta">${meta}</div></div>`;
    }).join('');
    const body = `<div class="assets">${rows}</div>
      <div class="sumline"><button type="button" class="btn btn-tertiary btn-sm" data-action="addAsset"><i class="bx bx-plus" aria-hidden="true"></i>Legg til eiendel</button>
      <div class="tot"><span>Sum bruttoformue</span>${kr(R.est.brutto)}</div></div>`;
    return ccard('eiendeler', 'bx-building-house', 'Eiendeler', `Bruttoformue ${kr(R.est.brutto)}`, body);
  }

  function debtCard() {
    const e = R.est, nm = R.nm;
    const fields = R.enslig ? moneyField('Gjeld', 'debtF', input.debtF)
      : moneyField('Felles gjeld', 'debtF', input.debtF, R.samb ? 'Fordeles likt mellom samboerne.' : '') + moneyField(`Gjeld ${nm.M}`, 'debtM', input.debtM) + moneyField(`Gjeld ${nm.K}`, 'debtK', input.debtK);
    const body = `<div class="row2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${fields}</div>
      <div class="sumbox"><div class="r"><span>Bruttoformue</span><b>${kr(e.brutto)}</b></div><div class="r"><span>− Total gjeld</span><b>${kr(e.debtTot)}</b></div>
      <div class="r total"><span>Nettoformue</span><b>${kr(e.netto)}</b></div></div>`;
    return ccard('gjeld', 'bx-credit-card', 'Gjeld', `Nettoformue ${kr(e.netto)}`, body);
  }

  function saereieCard() {
    const nm = R.nm;
    let body;
    if (R.gift) {
      body = `<div class="row2">${moneyField(`Særeie ${nm.M}`, 'saereieM', input.saereieM, 'Avstemmes mot eiendeler merket særeie')}${moneyField(`Særeie ${nm.K}`, 'saereieK', input.saereieK, 'Avstemmes mot eiendeler merket særeie')}
        ${moneyField(`Skjevdeling ${nm.M}`, 'skjevM', input.skjevM, 'Innført i ekteskapet, arv eller gave')}${moneyField(`Skjevdeling ${nm.K}`, 'skjevK', input.skjevK, 'Innført i ekteskapet, arv eller gave')}</div>
        ${banners([...R.est.warnings, ...R.est.notes], 'est-notes')}`;
    } else {
      body = `<p class="help">Særeie og skjevdeling gjelder bare for ektefeller${R.samb ? '. Samboere eier hver sine eiendeler etter eierandel, og det er ingen ekteskapsdeling.' : '.'}</p>`;
    }
    return ccard('saereie', 'bx-git-branch', 'Særeie og skjevdeling', 'Ekteskapsloven § 59', body);
  }

  function insCard() {
    const people = R.enslig ? ['M'] : ['M', 'K'];
    const body = people.map(X => {
      const g = +input['insG' + X] || 0;
      let ben = input['ben' + X] || 'spouse';
      if (R.enslig && ben === 'spouse') ben = 'barn';
      const opts = [...(R.enslig ? [] : [{ v: 'spouse', l: R.samb ? 'Samboer' : 'Ektefelle' }]), { v: 'barn', l: 'Barn' }, { v: 'annen', l: 'Navngitt annen' }];
      if (!R.enslig) opts[0].l = 'Ektefelle/samboer';
      return `<div class="ins-person" data-key="ins-${X}"><span class="flabel">Livsforsikring på ${esc(R.nm[X])}</span>
        <div class="ins-row"><div class="fld"><input class="inp" type="text" inputmode="decimal" data-bind="insG${X}" data-type="dec" value="${F.dec(g, 2)}" aria-label="Livsforsikring ${esc(R.nm[X])} i G" autocomplete="off"><span class="suf" aria-hidden="true">G</span></div>
        <span class="ins-eq">= ${kr(g * R.G)}</span></div>
        <div class="field"><span class="flabel">Begunstiget</span>${seg('ben' + X, ben, opts, 'compact', 'Begunstiget')}</div>
        ${ben === 'annen' ? textField('Navn på begunstiget', 'benName' + X, input['benName' + X] || '') : ''}</div>`;
    }).join('');
    return ccard('forsikring', 'bx-shield-quarter', 'Livsforsikring', 'Utbetales utenom dødsboet · FAL kap. 15', body, true);
  }

  function paramCard() {
    const body = `${moneyField('Grunnbeløp (1 G)', 'G', input.G, 'Grunnbeløpet justeres 1. mai hvert år – sjekk gjeldende G på nav.no.')}
      <div class="locked">
        <div class="r"><i class="bx bx-lock-alt" aria-hidden="true"></i>Pliktdelsfaktor<b>15 G = ${kr(R.g15)}</b></div>
        <div class="r"><i class="bx bx-lock-alt" aria-hidden="true"></i>Ektefelles minstearv med livsarvinger<b>4 G = ${kr(R.g4)}</b></div>
        <div class="r"><i class="bx bx-lock-alt" aria-hidden="true"></i>Ektefelles minstearv uten livsarvinger<b>6 G = ${kr(R.g6)}</b></div>
        <div class="r"><i class="bx bx-lock-alt" aria-hidden="true"></i>Samboers minstearv (felles barn)<b>4 G = ${kr(R.g4)}</b></div>
      </div>`;
    return ccard('parametere', 'bx-slider-alt', 'Parametere', `1 G = ${kr(R.G)}`, body);
  }

  /* ---------- Alternativ 1–4 ---------- */
  function altTab(ix) {
    const a = R.alts[ix];
    let h = `<div class="alt-top" data-key="top"><div><div class="eyebrow">ALTERNATIV ${a.num}</div><h2 class="h2">${esc(a.title)}</h2><p class="lead">${esc(a.lead)}</p></div>
      ${a.available && !R.enslig ? survCard(a) : ''}</div>`;
    if (!a.available) return h + `<div class="card na-card" data-key="na"><span class="icirc"><i class="bx bx-block" aria-hidden="true"></i></span>
      <div><h3 class="h3">Alternativet er ikke tilgjengelig</h3><p class="muted">${esc(a.reason)}</p></div></div>`;
    h += banners([...R.est.warnings, ...R.est.notes, ...a.warnings], 'warn-' + a.id);
    if (a.id === 'uskifte') h += uskControls();
    if (a.id === 'minimum') h += minControls();
    if (a.id === 'testament') h += testamentEditor();
    h += sankeyCard(a);
    if (a.id === 'uskifte') h += timelineCard(a);
    if (a.need) h += needCard(a);
    h += `<div class="cols2" data-key="cols">${distTable(a)}${explainCard(a)}</div>`;
    h += waterfallCard(a);
    return h;
  }

  function survCard(a) {
    const s = a.survivor;
    const items = [];
    if (a.id === 'uskifte') items.push(['#264472', 'Uskiftebo (rådighet)', s.usk]);
    items.push(['#A0AEC4', 'Egen formue', s.own], ['#405A82', 'Arv', s.arv], ['hatch', 'Livsforsikring', s.ins]);
    return `<aside class="surv" aria-label="Gjenlevende"><div class="surv-l">${esc(a.id === 'uskifte' ? `${R.nB} rår over etter dødsfallet` : `${R.nB} totalt`)}</div>
      <div class="surv-v">${kr(s.total)}</div>
      <ul>${items.map(i => `<li>${sq(i[0])}${esc(i[1])}<b>${kr(i[2])}</b></li>`).join('')}</ul></aside>`;
  }

  function uskControls() {
    const rows = [];
    if (R.gift) rows.push(sw('uskSaereieInn', !!input.uskSaereieInn, 'Særeie inngår i uskifte', `Krever samtykke eller ektepakt. ${gen(R.nA)} særeie: ${kr(R.est.sA)}.`));
    if (R.skA.length) R.skA.forEach(h => {
      const on = !!(input.consent || {})[h.id];
      rows.push(sw('consent.' + h.id, on, `${h.name} samtykker til uskifte`, on ? 'Arven venter til begge er døde.' : 'Får lovbestemt arv utbetalt nå.'));
    });
    else rows.push(sw(null, false, 'Ingen samtykke nødvendig', `${R.nA} har ingen særkullsbarn, og felles barn kan ikke nekte uskifte.`, true));
    return `<section class="card" data-key="ctrl"><div class="card-h" style="margin-bottom:4px"><h3 class="h3">Forutsetninger for uskifte</h3></div><div class="swlist">${rows.join('')}</div></section>`;
  }

  function minControls() {
    const opts = [{ v: 'S', l: R.nB }, ...(R.heirs.length ? [{ v: 'barna', l: 'Barna likt' }] : []), { v: 'O', l: 'Annen' }];
    let v = input.friTo || 'O';
    if (v === 'barna' && !R.heirs.length) v = 'S';
    return `<section class="card" data-key="ctrl"><div class="ctrl-row">
      <div class="lockline"><i class="bx bx-lock-alt" aria-hidden="true"></i>Pliktdel og minstearv er låst til lovens minimum.</div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="flabel">Fri del til</span>${seg('friTo', v, opts, '', 'Fri del til')}</div>
    </div></section>`;
  }

  function testamentEditor() {
    const t4 = R.t4;
    const ids = [...t4.ids, ...(t4.eff.P > 0.5 ? ['P'] : [])];
    const name = id => id === 'S' ? `${R.nB} (gjenlevende)` : (R.nodes[id] || {}).name;
    const color = id => (R.nodes[id] || {}).color || '#405A82';
    let sW = 0, sM = 0, sF = 0;
    const rows = ids.map(id => {
      const want = t4.eff[id] || 0, min = t4.mins[id] || 0, fin = t4.fin[id] || 0;
      sW += want; sM += min; sF += fin;
      const viol = min - want > 0.5, red = !viol && fin < want - 0.5;
      const badge = viol ? `<span class="badge bad">${id === 'S' ? 'Under minstearv' : 'Krenker pliktdel'}</span>` : red ? '<span class="badge red">Redusert</span>' : '<span class="badge ok">I orden</span>';
      const sub = id === 'S' ? 'Gjenlevende' : id === 'O' ? 'Testamentarisk' : id === 'P' ? 'Etter loven' : R.nodes[id].kind === 'felles' ? 'Felles barn' : 'Særkullsbarn';
      const field = id === 'P' ? '<span class="help">etter loven</span>'
        : `<div class="fld pct tbl"><input class="inp" type="text" inputmode="decimal" data-bind="T:${id}" data-type="dec" value="${F.dec(t4.pctOf(id), 2)}" aria-label="Andel til ${esc(name(id))} i prosent" autocomplete="off"><span class="suf" aria-hidden="true">%</span></div>`;
      return `<tr class="${viol ? 'viol' : ''}" data-key="tr-${id}"><td><div class="who-cell">${dot(color(id))}<div><div class="who-name">${esc(name(id))}</div><div class="who-sub">${esc(sub)}</div></div></div></td>
        <td>${field}</td><td class="r">${kr(want)}</td><td class="r">${kr(min)}</td><td class="r amt">${kr(fin)}</td><td>${badge}</td></tr>`;
    }).join('');
    const off = Math.abs(t4.pSum - 100) > 0.001;
    return `<section class="card ted" data-key="ctrl">
      <div class="card-h"><div><h3 class="h3">Testamentets fordeling</h3><p class="muted">Oppgi andel av dødsboet. Ønsket fordeling vises ved siden av den rettslig gjennomførbare.</p></div>
        <button type="button" class="btn btn-tertiary btn-sm" data-action="resetTestament"><i class="bx bx-reset" aria-hidden="true"></i>Tilbakestill til lovlig fordeling</button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Mottaker</th><th style="width:130px">Andel</th><th class="r">Ønsket</th><th class="r">Vernet minimum</th><th class="r">Gjennomførbart</th><th>Status</th></tr></thead>
      <tbody>${rows}<tr class="sum"><td>Sum</td><td><span class="sumpct ${off ? 'off' : ''}">${F.pct(t4.pSum, 2)}</span></td><td class="r">${kr(sW)}</td><td class="r">${kr(sM)}</td><td class="r">${kr(sF)}</td><td></td></tr></tbody></table></div>
      <div class="field" style="margin-top:20px"><label class="flabel" for="f-tnote">Beskrivelse av testamentet (valgfritt)</label>
        <textarea id="f-tnote" class="ta" data-bind="testamentNote" data-type="text" rows="3">${esc(input.testamentNote || '')}</textarea>
        <span class="fhelp">Formkrav (arveloven § 42): skriftlig, underskrevet av arvelater, med to vitner til stede samtidig som vet at det er et testament. Vitnene kan ikke være tilgodesett selv eller være nærstående av noen som er tilgodesett.</span></div>
    </section>`;
  }

  function sankeyCard(a) {
    const hasFri = a.flows.some(f => f.hatch === 'fri');
    const hasIns = a.flows.some(f => f.from === 'I');
    const leg = [];
    if (!R.enslig) leg.push(`<span>${sq('#A0AEC4')}Egen formue (ikke arv)</span>`);
    leg.push(`<span>${sq('#405A82')}Arv fra dødsboet</span>`);
    if (hasIns) leg.push(`<span>${sq('hatch')}Livsforsikring (utenfor boet)</span>`);
    if (hasFri) leg.push(`<span>${sq('fri')}Fri del</span>`);
    return `<section class="card" data-key="sankey-card"><div class="card-h"><div><h3 class="h3">Formuens vei</h3><p class="muted">Hold over en strøm for å se beregningen bak tallet.</p></div>
      <div class="legend">${leg.join('')}</div></div><div class="scroll-x">${C.sankey(R, a)}</div></section>`;
  }

  function timelineCard(a) {
    const x = a.extra;
    const now = a.flows.filter(f => f.from === 'A' && f.to !== 'U');
    const nowList = now.length ? `<ul class="paylist">${now.map(f => `<li>${dot((R.nodes[f.to] || {}).color || '#405A82')}${esc(recName(f.to))}${f.sub ? ` <span class="help">· ${esc(f.sub)}</span>` : ''}<b>${kr(f.value)}</b></li>`).join('')}</ul>`
      : '<p class="help">Ingenting utbetales nå.</p>';
    const aPct = Math.max(0, Math.min(1, x.aFrac));
    let tA = 0, tB = 0, tT = 0;
    const rows = x.t2.map(r => { tA += r.fromA; tB += r.fromB; tT += r.total; return `<tr data-key="t2-${r.id}"><td><div class="who-cell">${dot(r.color || '#667085')}<span class="who-name">${esc(r.name)}</span></div></td><td class="r">${kr(r.fromA)}</td><td class="r">${kr(r.fromB)}</td><td class="r amt">${kr(r.total)}</td></tr>`; }).join('');
    return `<section class="card" data-key="timeline"><div class="tl">
      <div class="tl-col"><div class="eyebrow">TIDSPUNKT 1</div><div class="tl-h"><span class="tl-dot f">1</span><h3 class="h3">${esc(R.nA)} dør</h3></div>
        <span class="flabel">Utbetales nå</span>${nowList}
        <div class="uskbox"><div class="flabel">Uskiftebo – ${esc(R.nB)} rår</div><div class="v">${kr(x.usk)}</div></div></div>
      <div class="tl-col"><div class="eyebrow">TIDSPUNKT 2</div><div class="tl-h"><span class="tl-dot o">2</span><div><h3 class="h3">${esc(R.nB)} dør senere</h3><div class="help">Forutsetning: uendrede verdier.</div></div></div>
        <div class="splitbar" role="img" aria-label="${esc(`${gen(R.nA)} side ${F.share(aPct, 0)}, ${gen(R.nB)} side ${F.share(1 - aPct, 0)}`)}">
          <div style="flex:0 0 ${aPct * 100}%;background:#405A82">${esc(gen(R.nA))} side ${F.share(aPct, 0)}</div>
          <div style="flex:1 1 auto;background:#8091AC">${esc(gen(R.nB))} side ${F.share(1 - aPct, 0)}</div></div>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Arving</th><th class="r">Fra ${esc(gen(R.nA))} side</th><th class="r">Fra ${esc(gen(R.nB))} side</th><th class="r">Totalt</th></tr></thead>
        <tbody>${rows}<tr class="sum"><td>Sum uskiftebo</td><td class="r">${kr(tA)}</td><td class="r">${kr(tB)}</td><td class="r">${kr(tT)}</td></tr></tbody></table></div></div>
    </div></section>`;
  }

  function needCard(a) {
    const n = a.need, p = n.p, key = a.id, usk = key === 'uskifte';
    const homes = input.assets.filter(x => x.type === 'hus' || x.type === 'fritid');
    const chips = homes.length ? `<div class="chips">${homes.map(h => { const on = n.keepIds.includes(h.id); return `<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-action="keep" data-alt="${key}" data-id="${esc(h.id)}"><i class="bx ${on ? 'bx-check' : 'bx-plus'}" aria-hidden="true"></i>${esc(h.name)}</button>`; }).join('')}</div>`
      : '<p class="help">Ingen eiendeler av type bolig eller fritidsbolig.</p>';
    const slider = (bind, val, label, valTxt, help) => `<div class="slider"><div class="slider-h"><span class="flabel">${esc(label)}</span><span class="slider-v">${esc(valTxt)}</span></div>
      <input type="range" min="0" max="100" step="5" value="${val}" data-bind="${bind}" data-type="range" aria-label="${esc(label)}" aria-valuetext="${esc(valTxt)}"><span class="fhelp">${esc(help)}</span></div>`;
    const kidsLabel = usk ? 'Dekk arv som utbetales nå kontant' : 'Dekk barnas arv kontant';
    const left = `<div class="field"><span class="flabel">Bolig ${esc(R.nB)} skal beholde</span>${chips}</div>
      ${slider(`insNeed.${key}.debtPct`, p.debtPct, 'Innfri gjeld', `${F.pct(p.debtPct, 0)} · ${kr(n.D)}`, `Total gjeld ${kr(n.Dtot)}.`)}
      ${slider(`insNeed.${key}.kidsPct`, p.kidsPct, kidsLabel, `${F.pct(p.kidsPct, 0)} · ${kr(n.kidsCover)}`, usk ? `Arv som utbetales nå til barna: ${kr(n.kidsNow)}.` : `Barnas arv fra dødsboet: ${kr(n.kidsNow)}.`)}
      ${moneyField('Likviditetsbuffer', `insNeed.${key}.buffer`, p.buffer)}
      <div class="swlist">${sw(`insNeed.${key}.useExisting`, !!p.useExisting, 'Trekk fra eksisterende livsforsikring', `Livsforsikring til ${R.nB}: ${kr(a.survivor.ins)}.`)}</div>`;
    const exW = n.need > 0 ? Math.min(n.existing, n.need) / n.need * 100 : 0;
    const gapW = n.need > 0 ? n.gap / n.need * 100 : 0;
    const extra = Math.max(0, n.S - n.K);
    const names = list(n.keepNames);
    const status = !n.keepIds.length ? banner('info', 'Ingen bolig er valgt. Behovet beregnes ut fra kontantbehovet alene.')
      : n.canStay ? banner('success', `${R.nB} kan bli boende i ${names} (${kr(n.V)}). ${gen(R.nB)} formue etter oppgjøret er ${kr(n.W)}, mot nødvendig egenkapital ${kr(n.reqNet)}.`)
        : banner('error', `Uten forsikring mangler ${R.nB} ${kr(n.S)} for å bli boende i ${names} (${kr(n.V)}). ${gen(R.nB)} formue etter oppgjøret er ${kr(n.W)}, mot nødvendig egenkapital ${kr(n.reqNet)}.`);
    const right = `<div><span class="flabel">Udekket forsikringsbehov på ${esc(gen(R.nA))} liv</span><div class="need-big">${kr(n.gap)}</div>
        <div class="help">${esc(F.g(n.gapG))} · samlet behov ${kr(n.need)}</div></div>
      <div class="pillbar" role="img" aria-label="${esc(`Eksisterende forsikring ${kr(n.existing)}, udekket ${kr(n.gap)}`)}"><div class="hatch-ins" style="width:${exW}%"></div><div style="width:${gapW}%;background:#0A5EDC"></div></div>
      <div class="oppst">
        <div class="r"><span>Innfri gjeld (${F.pct(p.debtPct, 0)})</span><b>${kr(n.D)}</b></div>
        <div class="r"><span>${usk ? 'Arv som utbetales nå' : 'Barnas arv'} (${F.pct(p.kidsPct, 0)})</span><b>${kr(n.kidsCover)}</b></div>
        <div class="r"><span>Likviditetsbuffer</span><b>${kr(n.buf)}</b></div>
        <div class="r sub"><span>= Kontantbehov</span><b>${kr(n.K)}</b></div>
        ${extra > 0.5 ? `<div class="r neg"><span>+ Tillegg for å beholde bolig</span><b>${kr(extra)}</b></div>` : ''}
        <div class="r sub"><span>Anbefalt forsikringssum</span><b>${kr(n.need)}</b></div>
        <div class="r"><span>− Eksisterende forsikring</span><b>${kr(n.existing)}</b></div>
        <div class="r sub"><span>= Udekket behov</span><b>${kr(n.gap)}</b></div>
      </div>${status}`;
    return `<section class="card" data-key="need"><div class="card-h"><div style="display:flex;gap:14px;align-items:flex-start">
        <span class="icirc hatch-ins"><i class="bx bx-shield-quarter" aria-hidden="true"></i></span>
        <div><h3 class="h3">Forsikringsbehov ved ${esc(gen(R.nA))} død</h3><p class="muted" style="max-width:720px">Hvor stor livsforsikring på ${esc(R.nA)} som trengs for at ${esc(R.nB)} kan bli boende etter at barna har fått sitt. Forsikringen går utenom dødsboet og endrer ikke arven.</p></div></div></div>
      <div class="need"><div class="need-l">${left}</div><div class="need-r">${right}</div></div></section>`;
  }

  function defaultSub(a, r) {
    if (r.id === 'U') return 'rådighet, ikke arv';
    if (r.id === 'O') return 'Testamentarisk';
    if (r.id === 'X') return 'Begunstiget';
    if (a.id === 'lov' || r.id === 'P') return 'Lovbestemt arv';
    if (a.id === 'testament') return 'Testament';
    return 'Arv';
  }
  function distTable(a) {
    const ord = recOrder();
    const rows = a.rows.slice().sort((x, y) => ord.indexOf(x.id) - ord.indexOf(y.id) || (x.kind === 'fri') - (y.kind === 'fri'));
    const showCalc = ui.showCalc;
    const row = (key, color, name, sub, calc, amount, share) => `<tr data-key="${esc(key)}"${calc ? ` title="${esc(calc)}"` : ''}><td><div class="who-cell">${dot(color)}<div>
        <div class="who-name">${esc(name)}</div>${sub ? `<div class="who-sub">${esc(sub)}</div>` : ''}${showCalc && calc ? `<div class="who-calc">${esc(calc)}</div>` : ''}</div></div></td>
        <td class="r amt">${kr(amount)}</td><td class="r">${share}</td></tr>`;
    let body = rows.map(r => {
      let sub = r.kind === 'fri' ? 'Fri del' : (r.sub || defaultSub(a, r));
      if (r.id === 'U' && a.extra && a.extra.inUB > 0) sub = `rådighet, ikke arv · inkl. ${gen(R.nB)} halvdel ${kr(a.extra.inUB)}`;
      return row('r-' + r.key, r.kind === 'fri' ? 'fri' : r.color, recName(r.id), sub, r.calc, r.amount, r.share == null ? '–' : F.share(r.share));
    }).join('');
    body += `<tr class="sum" data-key="sum"><td>Sum dødsbo</td><td class="r">${kr(R.bo)}</td><td class="r">100&nbsp;%</td></tr>`;
    const own = a.flows.filter(f => f.from === 'B' && f.to === 'S').reduce((s, f) => s + f.value, 0);
    const outside = [];
    if (own > 0.5) outside.push(row('o-own', '#A0AEC4', `${R.nB} – egen formue`, 'Ikke arv', a.flows.find(f => f.from === 'B' && f.to === 'S').calc, own, '–'));
    a.insRows.forEach(r => outside.push(row('o-' + r.key, 'ins', recName(r.id), 'Livsforsikring', r.calc, r.amount, '–')));
    if (outside.length) body += `<tr class="sec" data-key="sec"><td colspan="3">Utenfor dødsboet – ikke arv</td></tr>` + outside.join('');
    return `<section class="card" data-key="dist"><div class="card-h"><h3 class="h3">Fordeling av dødsboet</h3>
      <button type="button" class="calc-toggle" role="switch" aria-checked="${showCalc}" data-action="toggleCalc"><span class="sw ${showCalc ? 'on' : ''}" aria-hidden="true"><span class="knob"></span></span>Vis beregning</button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Mottaker</th><th class="r" style="width:130px">Beløp</th><th class="r" style="width:80px">Andel</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
  }

  function explainCard(a) {
    return `<section class="card" data-key="explain"><div class="card-h"><h3 class="h3">Slik er det regnet</h3></div>
      <ol class="explain">${a.explain.map(x => `<li><div><div class="ex-law">${esc(x.law)}</div><div class="ex-text">${esc(x.text)}</div></div></li>`).join('')}</ol></section>`;
  }

  function waterfallCard(a) {
    const e = R.est, nB = R.nB;
    const cols = [{ key: 'brutto', label: 'Bruttoformue', value: e.brutto, kind: 'total', color: '#264472' }];
    if (e.debtTot) cols.push({ key: 'debt', label: '− Gjeld', value: e.debtTot, kind: 'step', neg: true, color: '#FDA29B' });
    if (R.gift) {
      if (Math.abs(e.share[R.B]) > 0.5) cols.push({ key: 'halfB', label: `− ${gen(nB)} halvdel`, value: e.share[R.B], kind: 'step', neg: true, color: '#A0AEC4' });
      if (e.sB > 0.5) cols.push({ key: 'sB', label: `− Særeie ${nB}`, value: e.sB, kind: 'step', neg: true, color: '#CCD3DE' });
    } else if (R.samb && Math.abs(R.bOwn) > 0.5) cols.push({ key: 'ownB', label: `− ${gen(nB)} eierandel`, value: R.bOwn, kind: 'step', neg: true, color: '#A0AEC4' });
    cols.push({ key: 'bo', label: '= Dødsbo', value: R.bo, kind: 'total', color: '#405A82' });
    const by = {};
    a.flows.filter(f => f.from === 'A').forEach(f => { by[f.to] = by[f.to] || { v: 0, fri: 0 }; by[f.to].v += f.value; if (f.hatch === 'fri') by[f.to].fri += f.value; });
    recOrder().filter(id => by[id]).forEach(id => cols.push({
      key: 'r-' + id, label: id === 'U' ? `Uskiftebo (fra ${R.nA})` : recName(id), value: by[id].v, kind: 'step',
      color: (R.nodes[id] || {}).color || '#405A82', hatch: by[id].fri >= by[id].v - 0.5 ? 'fri' : null
    }));
    return `<section class="card" data-key="wf"><div class="card-h"><h3 class="h3">Fra bruttoformue til fordeling</h3></div>
      ${C.waterfall(cols, `Fossefallsdiagram fra bruttoformue ${kr(e.brutto)} til fordelingen av dødsboet på ${kr(R.bo)}.`)}</section>`;
  }

  /* ---------- Sammenligning ---------- */
  function compareTab() {
    const cards = R.alts.map(a => `<button type="button" class="cmp-card" data-action="tab" data-tab="${a.id}" data-key="cc-${a.id}">
      <span class="eyebrow">ALTERNATIV ${a.num}</span><span class="t">${esc(a.title)}</span>
      <span class="l">${esc(R.enslig ? 'Dødsbo fordelt' : `${R.nB} totalt`)}</span>
      ${a.available ? `<span class="v">${kr(R.enslig ? R.bo : a.survivor.total)}</span>` : '<span class="v na">Ikke tilgjengelig</span>'}
      <span class="go">Se detaljer →</span></button>`).join('');
    const ids = [...(R.enslig ? [] : ['S']), ...R.heirs.map(h => h.id), 'P', 'O', 'X'];
    const subOf = id => id === 'S' ? 'Gjenlevende · inkl. egen formue og livsforsikring' : id === 'P' ? 'Foreldrelinjen' : id === 'O' ? 'Testamentarisk mottaker' : id === 'X' ? 'Begunstiget livsforsikring' : R.nodes[id].kind === 'felles' ? (R.enslig ? 'Barn' : 'Felles barn') : 'Særkullsbarn';
    const groups = ids.map(id => ({
      key: id, name: recName(id), sub: subOf(id), color: (R.nodes[id] || {}).color || '#405A82',
      values: R.alts.map(a => !a.available ? null : id === 'S' ? a.survivor.total : a.flows.filter(f => f.to === id && f.from !== 'B').reduce((s, f) => s + f.value, 0))
    })).filter(g => g.values.some(v => v != null && v > 0.5));
    const leg = ['1 Lov', '2 Uskifte', '3 Minimum', '4 Testament'].map((l, i) => `<span>${sq(C.CMP_COLORS[i])}${l}</span>`).join('');
    const usk = R.alts[1].available ? `<p class="help" style="margin-top:16px">I uskifte vises det som utbetales nå. Resten av arven etter ${esc(R.nA)} fordeles når ${esc(R.nB)} dør.</p>` : '';
    return `<div class="panel-h" data-key="ch"><div><h2 class="h2">Sammenligning</h2><p class="muted">Hva hver mottaker sitter igjen med i de fire alternativene. For gjenlevende inkluderes egen formue og livsforsikring.</p></div></div>
      <div class="cmp-cards" data-key="cards">${cards}</div>
      <section class="card" data-key="per"><div class="card-h"><h3 class="h3">Per mottaker</h3><div class="legend">${leg}</div></div>
      ${groups.length ? C.compare(groups) : '<p class="help">Ingen fordeling å vise.</p>'}${usk}</section>`;
  }

  /* ---------- Footer og modal ---------- */
  function footer() {
    return `<footer class="foot" data-key="foot"><div class="wrap foot-in"><p>Forenklet modell til illustrasjon. Ikke juridisk rådgivning. Arveoppgjør bør gjennomgås med advokat.</p>
      <button type="button" class="linkbtn" data-action="validate">Valider motor</button></div></footer>`;
  }
  function modal() {
    VAL = VAL || E.validate();
    const ok = VAL.filter(r => r.ok).length;
    return `<div class="scrim" data-action="closeModal" data-key="modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <div class="modal-h"><div><h3 class="h3" id="modal-t">Valider beregningsmotoren</h3><p>Testcase fra kravspesifikasjonen, uavhengig av gjeldende input. ${ok} av ${VAL.length} kontrolltall stemmer.</p></div>
      <button type="button" class="icon-btn ghost" data-action="closeModal" data-close="1" aria-label="Lukk" id="modal-close"><i class="bx bx-x" aria-hidden="true"></i></button></div>
      <div class="modal-b"><table class="t"><thead><tr><th>Kontrolltall</th><th class="r">Forventet</th><th class="r">Beregnet</th><th style="width:48px"><span class="sr-only">Status</span></th></tr></thead>
      <tbody>${VAL.map(r => `<tr><td>${esc(r.label)}</td><td class="r">${kr(r.exp)}</td><td class="r amt">${kr(r.act)}</td>
        <td>${r.ok ? '<i class="bx bx-check-circle ok-i" aria-label="Stemmer"></i>' : '<i class="bx bx-x-circle bad-i" aria-label="Avvik"></i>'}</td></tr>`).join('')}</tbody></table></div>
    </div></div>`;
  }

  /* ================= Hendelser ================= */
  function setTab(id, focus) {
    if (!TAB_IDS.includes(id)) return;
    ui.tab = id;
    try { history.replaceState(null, '', '#' + id); } catch (e) { location.hash = id; }
    render();
    scrollToPanel();
    if (focus) { const t = document.getElementById('tab-' + id); if (t) t.focus(); }
  }
  /* Fanelinjen er sticky, så innholdet legges rett under den */
  function scrollToPanel() {
    const panelEl = document.getElementById('panel');
    const bar = document.querySelector('.tabbar');
    if (!panelEl || !bar) return;
    const target = panelEl.querySelector('.grid-in') || panelEl;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 16);
    window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  const actions = {
    tab: el => setTab(el.dataset.tab),
    set: el => { setP(el.dataset.bind, JSON.parse(el.dataset.value)); afterSet(el.dataset.bind); render(); },
    toggle: el => { setP(el.dataset.bind, !getP(el.dataset.bind)); render(); },
    step: el => {
      const b = el.dataset.bind, min = +(el.dataset.min || 0);
      setP(b, Math.max(min, Math.min(8, (getP(b) | 0) + +el.dataset.delta)));
      afterSet(b); render();
    },
    toggleCard: el => { const id = el.dataset.id; ui.open[id] = ui.open[id] === false; render(); },
    addAsset: () => {
      const id = 'a' + Date.now().toString(36);
      input.assets.push({ id, name: 'Ny eiendel', type: 'annet', value: 0, own: 'felles', pctM: 50 });
      render();
      const el = root.querySelector(`[data-key="asset-${id}"] input`); if (el) { el.focus(); el.select(); }
    },
    delAsset: el => {
      const id = el.dataset.id;
      input.assets = input.assets.filter(a => a.id !== id);
      ['lov', 'uskifte'].forEach(k => { const p = input.insNeed[k]; if (p && Array.isArray(p.keep)) p.keep = p.keep.filter(x => x !== id); });
      render();
    },
    reset: () => { input = fresh(); render(); },
    print: () => window.print(),
    validate: () => { ui.modal = true; render(); const c = document.getElementById('modal-close'); if (c) c.focus(); },
    closeModal: (el, ev) => { if (ev.target === el || el.dataset.close) { ui.modal = false; render(); } },
    keep: el => {
      const k = el.dataset.alt, id = el.dataset.id;
      const cur = R.alts[ALT_IDX[k]].need.keepIds.slice();
      const ix = cur.indexOf(id);
      if (ix >= 0) cur.splice(ix, 1); else cur.push(id);
      input.insNeed[k].keep = cur; render();
    },
    resetTestament: () => { delete input.testament[R.A]; render(); },
    toggleCalc: () => { ui.showCalc = !ui.showCalc; render(); }
  };

  root.addEventListener('click', ev => {
    const el = ev.target.closest('[data-action]');
    if (!el || !root.contains(el) || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, ev);
  });

  function formatMoney(el) {
    const raw = el.value;
    const pos = el.selectionStart == null ? raw.length : el.selectionStart;
    const right = raw.slice(pos).replace(/\D/g, '').length;
    const digits = raw.replace(/\D/g, '');
    const neg = /^\s*[-\u2212]/.test(raw);
    const s = digits === '' ? (neg ? '−' : '') : (neg ? '−' : '') + F.num(+digits);
    if (s === raw) return;
    el.value = s;
    let i = s.length, cnt = 0;
    while (i > 0 && cnt < right) { i--; if (/\d/.test(s[i])) cnt++; }
    try { el.setSelectionRange(i, i); } catch (e) { /* ikke støttet */ }
  }
  function readValue(el) {
    const t = el.dataset.type || 'text';
    if (t === 'money') { formatMoney(el); return F.parseInt(el.value); }
    if (t === 'int') return F.parseInt(el.value);
    if (t === 'dec') return F.parseDec(el.value);
    if (t === 'range') return +el.value;
    return el.value;
  }
  root.addEventListener('input', ev => {
    const el = ev.target, bind = el.dataset && el.dataset.bind;
    if (!bind || el.tagName === 'SELECT') return;
    const v = readValue(el);
    if (bind.startsWith('T:')) setTestament(bind.slice(2), v); else setP(bind, v);
    if (el.type === 'range') render(); else schedule(120);
  });
  root.addEventListener('change', ev => {
    const el = ev.target, bind = el.dataset && el.dataset.bind;
    if (!bind || el.tagName !== 'SELECT') return;
    setP(bind, el.value); render();
  });
  root.addEventListener('focusout', ev => {
    if (ev.target.dataset && ev.target.dataset.bind && ev.target.tagName === 'INPUT') setTimeout(render, 0);
  });
  root.addEventListener('keydown', ev => {
    const tab = ev.target.closest && ev.target.closest('[role="tab"]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
      ev.preventDefault();
      let i = TAB_IDS.indexOf(tab.dataset.tab);
      if (ev.key === 'ArrowLeft') i = (i - 1 + TAB_IDS.length) % TAB_IDS.length;
      else if (ev.key === 'ArrowRight') i = (i + 1) % TAB_IDS.length;
      else if (ev.key === 'Home') i = 0; else i = TAB_IDS.length - 1;
      setTab(TAB_IDS[i], true);
    }
    if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') render();
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ui.modal) { ui.modal = false; render(); } });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TAB_IDS.includes(h) && h !== ui.tab) setTab(h); });

  /* Tooltip for Sankey */
  let curTip = null;
  function onPointer(ev) {
    const t = ev.target && ev.target.closest ? ev.target.closest('[data-tip-title]') : null;
    if (t !== curTip) {
      if (curTip) { curTip.classList.remove('hot'); const s = curTip.closest('.sankey'); if (s) s.classList.remove('hovering'); }
      curTip = t;
      if (t) {
        tipEl.innerHTML = `<div class="tip-t">${esc(t.getAttribute('data-tip-title'))}</div>${t.getAttribute('data-tip') ? `<div class="tip-b">${esc(t.getAttribute('data-tip'))}</div>` : ''}`;
        tipEl.hidden = false;
        if (t.classList.contains('band')) { t.classList.add('hot'); const s = t.closest('.sankey'); if (s) s.classList.add('hovering'); }
      } else tipEl.hidden = true;
    }
    if (t) {
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let x = ev.clientX + 16, y = ev.clientY + 16;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - 16;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - 16;
      tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
    }
  }
  document.addEventListener('pointermove', onPointer);
  document.addEventListener('pointerdown', onPointer);
  document.addEventListener('scroll', () => { if (curTip) { onPointer({ target: null }); } }, { passive: true });

  load();
  render();
})();
