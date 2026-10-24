/* Arvekalkulator – ren beregningsmotor (ingen DOM). window.ArveEngine */
(function () {
  const PAL = {
    S: '#002359', U: '#264472', P: '#667085', O: '#405A82', X: '#405A82', own: '#A0AEC4', ins: '#079455',
    felles: ['#0A5EDC', '#3B7EE3', '#6096E8', '#84AEED', '#99BEF5', '#B5CFF5'],
    skM: ['#9747FF', '#AE70FF', '#C499FF', '#7B2FE0'],
    skK: ['#DC6803', '#F79009', '#FDB022', '#B54708']
  };
  const DEFAULT_INPUT = {
    civil: 'gift', sambFelles: true, nameM: 'Mann', nameK: 'Kone', nFelles: 2, nSkM: 1, nSkK: 0, firstDies: 'K',
    assets: [
      { id: 'a1', name: 'Hus', type: 'hus', value: 25000000, own: 'felles', pctM: 50 },
      { id: 'a2', name: 'Fritidseiendom', type: 'fritid', value: 5000000, own: 'felles', pctM: 50 },
      { id: 'a3', name: 'Bil/båt', type: 'bil', value: 3000000, own: 'felles', pctM: 50 },
      { id: 'a4', name: 'Investeringsselskap', type: 'annet', value: 36000000, own: 'felles', pctM: 50 },
      { id: 'a5', name: 'Aksjer/fond', type: 'annet', value: 14000000, own: 'felles', pctM: 50 },
      { id: 'a6', name: 'Bank', type: 'annet', value: 500000, own: 'felles', pctM: 50 }
    ],
    debtF: 19000000, debtM: 0, debtK: 0,
    saereieM: 0, saereieK: 3000000, skjevM: 0, skjevK: 0,
    insGM: 50, insGK: 20, benM: 'spouse', benK: 'spouse', benNameM: '', benNameK: '',
    G: 124028,
    uskSaereieInn: false, consent: {}, knew: false, friTo: 'O', parentsAlive: true,
    insNeed: { lov: { keep: null, debtPct: 100, kidsPct: 25, buffer: 500000, useExisting: true }, uskifte: { keep: null, debtPct: 100, kidsPct: 100, buffer: 500000, useExisting: true } },
    testament: {}, testamentNote: ''
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const sum = a => a.reduce((s, x) => s + (+x || 0), 0);
  const range = n => Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);
  const fmt = n => Math.round(n).toLocaleString('nb-NO');
  const kr = n => fmt(n) + '\u00a0kr';
  const pct = (x, d = 1) => (x * 100).toLocaleString('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: d }) + '\u00a0%';
  const gen = s => /[sxz]$/i.test(s) ? s + '\u2019' : s + 's';
  const r0 = v => Math.abs(v) < 0.5 ? 0 : v;

  /* ---------- STEG 1: ekteskapsdeling / eierandeler ---------- */
  function estate(inp, A, B, nm) {
    const assets = inp.assets || [];
    const brutto = sum(assets.map(a => a.value));
    const debt = { F: +inp.debtF || 0, M: +inp.debtM || 0, K: +inp.debtK || 0 };
    const debtTot = debt.F + debt.M + debt.K;
    const netto = brutto - debtTot;
    const notes = [], warnings = [];
    const e = { brutto, debt, debtTot, netto, notes, warnings, share: { M: 0, K: 0 }, s: { M: 0, K: 0 }, elig: { M: 0, K: 0 } };
    if (inp.civil === 'gift') {
      const marked = { M: 0, K: 0 }; let fellesGross = 0;
      assets.forEach(a => { if (a.own === 'sM') marked.M += +a.value || 0; else if (a.own === 'sK') marked.K += +a.value || 0; else fellesGross += +a.value || 0; });
      const fromF = { M: 0, K: 0 };
      ['M', 'K'].forEach(X => {
        const given = +inp['saereie' + X] || 0;
        e.s[X] = Math.max(given, marked[X]);
        fromF[X] = Math.max(0, given - marked[X]);
        if (fromF[X] > 0 && marked[X] > 0) warnings.push({ level: 'warn', text: `Særeie for ${nm[X]} er oppgitt til ${kr(given)}, men eiendeler merket særeie utgjør ${kr(marked[X])}. Differansen på ${kr(fromF[X])} trekkes fra felleseiet.` });
        else if (fromF[X] > 0) notes.push({ level: 'info', text: `Særeie for ${nm[X]} (${kr(given)}) er oppgitt som sum og trukket forholdsmessig fra felleseie-eiendelene.` });
      });
      if (fromF.M + fromF.K > fellesGross) warnings.push({ level: 'warn', text: `Oppgitt særeie er større enn eiendelene som er merket felleseie. Kontroller eierskap.` });
      const fellesNet = fellesGross - fromF.M - fromF.K - debt.F;
      const skj = { M: +inp.skjevM || 0, K: +inp.skjevK || 0 };
      const lik = fellesNet - skj.M - skj.K;
      const half = lik / 2;
      e.share = { M: half + skj.M - debt.M, K: half + skj.K - debt.K };
      Object.assign(e, { marked, fellesGross, fromF, fellesNet, skj, lik, half });
      e.bo = e.share[A] + e.s[A];
      e.bOwn = e.share[B] + e.s[B];
    } else if (inp.civil === 'samboer') {
      const own = { M: 0, K: 0 };
      assets.forEach(a => {
        const pm = Math.min(100, Math.max(0, +a.pctM || 0)) / 100;
        own.M += (+a.value || 0) * pm; own.K += (+a.value || 0) * (1 - pm);
        if (['hus', 'fritid', 'bil', 'innbo'].includes(a.type)) { e.elig.M += (+a.value || 0) * pm; e.elig.K += (+a.value || 0) * (1 - pm); }
      });
      e.share = { M: own.M - debt.F / 2 - debt.M, K: own.K - debt.F / 2 - debt.K };
      e.bo = e.share[A]; e.bOwn = e.share[B];
    } else {
      e.bo = netto; e.bOwn = 0;
    }
    e.sA = e.s[A] || 0; e.sB = e.s[B] || 0;
    return e;
  }

  /* ---------- STEG 3: lovbestemt arv ---------- */
  function lov(amount, c) {
    const { G, heirs } = c; const n = heirs.length;
    const r = { amount, spouse: 0, kids: {}, each: 0, parents: 0, rule: 'ingen' };
    if (amount <= 0) return r;
    if (c.gift) {
      if (n > 0) { const q = amount / 4; r.spouse = Math.min(amount, Math.max(q, 4 * G)); r.rule = amount <= 4 * G ? 'hele4' : (q >= 4 * G ? 'kvart' : 'minste4'); }
      else if (!c.parentsAlive) { r.spouse = amount; r.rule = 'heleSlekt'; }
      else { const q = amount / 2; r.spouse = Math.min(amount, Math.max(q, 6 * G)); r.rule = amount <= 6 * G ? 'hele6' : (q >= 6 * G ? 'halv' : 'minste6'); }
    } else if (c.sambF) { r.spouse = Math.min(amount, 4 * G); r.rule = amount <= 4 * G ? 'heleSamb' : 'samb4'; }
    else if (c.samb) r.rule = 'sambIngen';
    const rest = amount - r.spouse;
    if (n > 0) { r.each = rest / n; heirs.forEach(h => r.kids[h.id] = r.each); } else r.parents = rest;
    return r;
  }
  function lovText(L, c) {
    const { nB, nA, G } = c; const out = [];
    const T = {
      kvart: [`Arveloven § 8`, `${nB} arver ¼ av boet (${kr(L.spouse)}), som er over minstearven på 4 G (${kr(4 * G)}).`],
      minste4: [`Arveloven § 8`, `¼ av boet (${kr(L.amount / 4)}) er under minstearven, så ${nB} arver 4 G (${kr(4 * G)}).`],
      hele4: [`Arveloven § 8`, `Boet (${kr(L.amount)}) er mindre enn minstearven på 4 G (${kr(4 * G)}). ${nB} tar hele boet, og barna får 0 – ektefellens minstearv går foran livsarvingenes arv.`],
      halv: [`Arveloven § 9`, `${nA} etterlater ingen livsarvinger. ${nB} arver ½ av boet (${kr(L.spouse)}), som er over minstearven på 6 G (${kr(6 * G)}).`],
      minste6: [`Arveloven § 9`, `${nA} etterlater ingen livsarvinger. ½ av boet er under 6 G, så ${nB} arver 6 G (${kr(6 * G)}).`],
      hele6: [`Arveloven § 9`, `Boet er mindre enn 6 G (${kr(6 * G)}), så ${nB} arver hele boet.`],
      heleSlekt: [`Arveloven § 9`, `${nA} etterlater verken livsarvinger, foreldre eller søsken (eller deres etterkommere). ${nB} arver hele boet foran fjernere slekt.`],
      samb4: [`Arveloven § 10`, `${nB} arver 4 G (${kr(4 * G)}) som samboer med felles barn.`],
      heleSamb: [`Arveloven § 10`, `Boet er mindre enn 4 G, så ${nB} som samboer med felles barn tar hele boet.`],
      sambIngen: [`Arveloven § 10`, `Samboere uten felles barn har ingen lovbestemt arverett. ${nB} arver ikke etter loven.`]
    };
    if (T[L.rule]) out.push({ law: T[L.rule][0], text: T[L.rule][1] });
    if (c.heirs.length && L.each > 0) out.push({ law: 'Arveloven § 4', text: `Livsarvingene (${c.heirs.length}) deler resten likt: ${kr(L.each)} hver.` });
    if (!c.heirs.length && L.parents > 0) out.push({ law: c.parentsAlive ? 'Arveloven § 5' : 'Arveloven § 6', text: `${nA} har ingen livsarvinger. Resten, ${kr(L.parents)}, går til ${c.parentsAlive ? 'foreldre/søsken' : 'øvrig slekt (besteforeldrelinjen)'}.` });
    return out;
  }

  /* ---------- hovedfunksjon ---------- */
  function compute(inp) {
    const G = +inp.G || 0, g4 = 4 * G, g6 = 6 * G, g15 = 15 * G;
    const gift = inp.civil === 'gift', samb = inp.civil === 'samboer', enslig = inp.civil === 'enslig';
    const sambF = samb && !!inp.sambFelles;
    const A = enslig ? 'M' : inp.firstDies, B = A === 'M' ? 'K' : 'M';
    const nm = { M: inp.nameM || 'Mann', K: inp.nameK || 'Kone' };
    const nA = nm[A], nB = nm[B];
    const nF = (samb && !inp.sambFelles) ? 0 : (inp.nFelles | 0);
    const felles = range(nF).map(i => ({ id: 'F' + (i + 1), name: (enslig ? 'Barn ' : 'Felles barn ') + (i + 1), kind: 'felles', color: PAL.felles[i % 6] }));
    const sk = X => enslig ? [] : range(inp['nSk' + X]).map((i, _, arr) => ({ id: 'S' + X + (i + 1), name: 'Særkullsbarn ' + (arr.length > 1 ? (i + 1) + ' ' : '') + '(' + nm[X] + ')', kind: 'saerkull', parent: X, color: PAL['sk' + X][i % 4] }));
    const skA = sk(A), skB = sk(B);
    const heirs = [...felles, ...skA];
    const nodes = { S: { id: 'S', name: nB, color: PAL.S, kind: 'survivor' }, P: { id: 'P', name: inp.parentsAlive === false ? 'Øvrig slekt' : 'Foreldre/søsken', color: PAL.P, kind: 'other' }, O: { id: 'O', name: 'Andre/veldedighet', color: PAL.O, kind: 'other' }, X: { id: 'X', name: inp['benName' + A] || 'Navngitt annen', color: PAL.X, kind: 'other' }, U: { id: 'U', name: 'Uskiftebo', color: PAL.U, kind: 'uskifte' } };
    [...felles, ...skA, ...skB].forEach(h => nodes[h.id] = h);
    const est = estate(inp, A, B, nm);
    const bo = est.bo, bOwn = est.bOwn;
    const c = { G, gift, samb, sambF, heirs, nA, nB, parentsAlive: inp.parentsAlive !== false };
    const insA = (+inp['insG' + A] || 0) * G, insB = (+inp['insG' + B] || 0) * G;
    const insGA = +inp['insG' + A] || 0;
    const insolvent = bo <= 0 || est.netto <= 0;
    const minsteBase = gift ? (heirs.length ? g4 : g6) : (sambF ? g4 : 0);
    const L = lov(bo, c);
    const plRaw = heirs.length ? (2 / 3) * Math.max(0, bo) / heirs.length : 0;
    const pl = heirs.reduce((o, h) => (o[h.id] = Math.min(plRaw, g15), o), {});
    const ownCalc = gift ? `Halvdel av felleseie (${kr(est.share[B])}) + særeie (${kr(est.sB)}). Ikke arv.` : `Egne eierandeler fratrukket gjeld. Ikke arv.`;

    function insFlows() {
      if (insA <= 0) return [];
      let ben = inp['ben' + A] || 'spouse';
      if (ben === 'spouse' && enslig) ben = 'barn';
      if (ben === 'barn' && !heirs.length) ben = 'annen';
      const base = `${fmt(insGA)} G × ${kr(G)} = ${kr(insA)}. Utbetales direkte til begunstiget, utenfor dødsboet (FAL kap. 15).`;
      if (ben === 'spouse') return [{ from: 'I', to: 'S', value: insA, hatch: 'ins', calc: base }];
      if (ben === 'barn') return heirs.map(h => ({ from: 'I', to: h.id, value: insA / heirs.length, hatch: 'ins', calc: `${kr(insA)} / ${heirs.length} barn. ` + base }));
      return [{ from: 'I', to: 'X', value: insA, hatch: 'ins', calc: base }];
    }
    function baseExplain() {
      const ex = [];
      if (gift) {
        ex.push({ law: 'Ekteskapsloven kap. 12', text: `Felleseie netto utgjør ${kr(est.fellesNet)}${(est.skj.M + est.skj.K) ? `. Etter skjevdeling (${kr(est.skj.M + est.skj.K)})` : ''}, og likedelingsmassen på ${kr(est.lik)} deles likt: ${kr(est.half)} til hver.` });
        if (est.skj[A] > 0) ex.push({ law: 'Ekteskapsloven § 59', text: `${nA} skjevdeler ${kr(est.skj[A])} før likedeling.` });
        ex.push({ law: 'Dødsbo', text: `${gen(nA)} dødsbo er halvdelen av felleseiet (${kr(est.share[A])}) pluss særeie (${kr(est.sA)}) = ${kr(bo)}.` });
        ex.push({ law: 'Ikke arv', text: `${nB} beholder sin halvdel og sitt særeie, til sammen ${kr(bOwn)}. Dette er ${gen(nB)} egen formue.` });
      } else if (samb) {
        ex.push({ law: 'Samboere', text: `Samboere har ingen ekteskapsdeling. ${gen(nA)} dødsbo er ${gen(nA)} eierandeler fratrukket gjeld: ${kr(bo)}.` });
      } else ex.push({ law: 'Dødsbo', text: `Dødsboet er nettoformuen: ${kr(bo)}.` });
      if (skB.length) ex.push({ law: 'Arveloven § 4', text: `${gen(nB)} særkullsbarn arver ikke etter ${nA}.` });
      return ex;
    }
    function insExplain(alt) {
      if (insA <= 0) return;
      const to = alt.flows.filter(f => f.from === 'I');
      const who = to.length > 1 ? 'barna' : (nodes[to[0].to] || {}).name;
      alt.explain.push({ law: 'FAL kap. 15', text: `Livsforsikringen på ${fmt(insGA)} G (${kr(insA)}) utbetales direkte til ${who} og inngår ikke i dødsboet.` });
      alt.warnings.push({ level: 'info', text: 'Pliktdelsarvinger kan i særlige tilfeller angripe forsikringsutbetalinger som er urimelig store sett mot avdødes økonomi – vurder med advokat.' });
    }
    function finish(alt) {
      alt.flows = alt.flows.filter(f => f.value > 0.5);
      const by = {};
      alt.flows.forEach(f => {
        if (f.from === 'B' && f.to === 'S') return;
        const k = f.to + (f.hatch === 'fri' ? '_fri' : '') + (f.from === 'I' ? '_ins' : '') ;
        if (!by[k]) by[k] = { id: f.to, key: k, name: (nodes[f.to] || {}).name, color: (nodes[f.to] || {}).color, kind: f.from === 'I' ? 'ins' : (f.hatch === 'fri' ? 'fri' : (nodes[f.to] || {}).kind), amount: 0, calc: f.calc, sub: f.sub || '' };
        by[k].amount += f.value;
      });
      alt.rows = Object.values(by).filter(r => r.kind !== 'ins');
      alt.insRows = Object.values(by).filter(r => r.kind === 'ins');
      alt.rows.forEach(r => r.share = bo > 0 && r.id !== 'U' ? r.amount / bo : null);
      const sv = alt.survivor; sv.ins = sum(alt.flows.filter(f => f.from === 'I' && f.to === 'S').map(f => f.value));
      sv.total = sv.own + sv.arv + sv.ins + (sv.usk || 0);
      return alt;
    }
    const mk = (num, id, title, lead) => ({ num, id, title, lead, available: true, reason: '', flows: [], explain: [], warnings: [], survivor: { own: 0, arv: 0, ins: 0, usk: 0, total: 0 }, extra: {} });
    const unavailable = (alt, reason) => { alt.available = false; alt.reason = reason; return alt; };
    const insolventMsg = 'Boet er insolvent – arvinger arver ikke gjeld. Ingen fordeling.';

    /* ALT 1 */
    const a1 = mk(1, 'lov', 'Lovens fordeling', 'Boet skiftes nå, og arven fordeles etter arvelovens regler uten testament.');
    if (insolvent) unavailable(a1, insolventMsg); else {
      if (bOwn > 0) a1.flows.push({ from: 'B', to: 'S', value: bOwn, calc: ownCalc });
      if (L.spouse > 0) a1.flows.push({ from: 'A', to: 'S', value: L.spouse, calc: lovText(L, c)[0].text });
      heirs.forEach(h => a1.flows.push({ from: 'A', to: h.id, value: L.kids[h.id], calc: `(${kr(bo)} − ${kr(L.spouse)}) / ${heirs.length} = ${kr(L.each)}` }));
      if (L.parents > 0) a1.flows.push({ from: 'A', to: 'P', value: L.parents, calc: `Ingen livsarvinger: resten etter ektefellens arv.` });
      a1.flows.push(...insFlows());
      a1.survivor.own = bOwn; a1.survivor.arv = L.spouse;
      a1.explain = [...baseExplain(), ...lovText(L, c)];
      if (L.rule === 'hele4' || L.rule === 'hele6') a1.warnings.push({ level: 'warn', text: `Dødsboet er mindre enn minstearven. ${nB} tar hele boet, og barna får 0.` });
      insExplain(a1); finish(a1);
    }

    /* ALT 2 – uskifte */
    const a2 = mk(2, 'uskifte', 'Uskifte', `${nB} overtar boet uten å skifte, og arven etter ${nA} fordeles først når ${nB} dør.`);
    if (enslig) unavailable(a2, 'Uskifte forutsetter en gjenlevende ektefelle eller samboer.');
    else if (samb && !sambF) unavailable(a2, 'Samboere uten felles barn har ikke rett til å sitte i uskifte (arveloven kap. 4).');
    else if (insolvent) unavailable(a2, insolventMsg);
    else {
      const inn = gift && !!inp.uskSaereieInn;
      const inUA = gift ? est.share[A] + (inn ? est.sA : 0) : est.elig[A];
      const outA = Math.max(0, bo - inUA);
      const inUB = gift ? est.share[B] : est.elig[B];
      const ownRest = bOwn - inUB;
      const Lu = lov(inUA, c), Lo = lov(outA, c);
      const consent = inp.consent || {};
      const refusers = skA.filter(h => !consent[h.id]);
      const payouts = refusers.map(h => ({ h, v: Lu.kids[h.id] || 0 }));
      const paid = sum(payouts.map(p => p.v));
      const uA = inUA - paid;
      const usk = uA + inUB;
      if (inUB > 0) a2.flows.push({ from: 'B', to: 'U', value: inUB, calc: gift ? `${gen(nB)} halvdel av felleseiet går inn i uskifteboet.` : `${gen(nB)} andel av bolig, fritidsbolig og bil.` });
      if (ownRest > 0) a2.flows.push({ from: 'B', to: 'S', value: ownRest, calc: gift ? `${gen(nB)} særeie holdes utenfor uskiftet.` : `${gen(nB)} øvrige formue.` });
      if (uA > 0) a2.flows.push({ from: 'A', to: 'U', value: uA, calc: gift ? `${gen(nA)} halvdel av felleseiet${inn ? ' og særeie' : ''}${paid ? ', fratrukket utbetalt arv til særkullsbarn' : ''}.` : `${gen(nA)} andel av bolig, fritidsbolig og bil.` });
      payouts.forEach(p => a2.flows.push({ from: 'A', to: p.h.id, value: p.v, sub: 'Nekter uskifte', calc: `Samtykker ikke til uskifte og får sin lovbestemte arv utbetalt nå: ${kr(p.v)}.` }));
      if (outA > 0) {
        if (Lo.spouse > 0) a2.flows.push({ from: 'A', to: 'S', value: Lo.spouse, sub: gift ? 'Arv av særeie' : 'Arv utenfor uskiftet', calc: `${gift ? 'Særeiet' : 'Formue utenfor uskiftet'} (${kr(outA)}) skiftes etter loven. ${lovText(Lo, c)[0] ? lovText(Lo, c)[0].text : ''}` });
        heirs.forEach(h => { if (Lo.kids[h.id] > 0) a2.flows.push({ from: 'A', to: h.id, value: Lo.kids[h.id], sub: gift ? 'Arv av særeie' : 'Skiftes nå', calc: `(${kr(outA)} − ${kr(Lo.spouse)}) / ${heirs.length} = ${kr(Lo.each)}` }); });
        if (Lo.parents > 0) a2.flows.push({ from: 'A', to: 'P', value: Lo.parents, calc: 'Ingen livsarvinger.' });
      }
      a2.flows.push(...insFlows());
      a2.survivor.own = ownRest; a2.survivor.arv = Lo.spouse; a2.survivor.usk = usk;
      // tidspunkt 2
      const aFrac = paid > 0 ? (usk > 0 ? uA / usk : 0) : 0.5;
      const aSide = usk * aFrac, bSide = usk - aSide;
      const aHeirs = [...felles, ...skA.filter(h => consent[h.id])];
      const bHeirs = [...felles, ...skB];
      const t2 = {};
      const add = (id, k, v) => { t2[id] = t2[id] || { id, name: (nodes[id] || {}).name, color: (nodes[id] || {}).color, fromA: 0, fromB: 0 }; t2[id][k] += v; };
      if (aHeirs.length) aHeirs.forEach(h => add(h.id, 'fromA', aSide / aHeirs.length)); else { nodes.PA = { id: 'PA', name: `Arvinger etter ${nA}`, color: PAL.P }; add('PA', 'fromA', aSide); }
      if (bHeirs.length) bHeirs.forEach(h => add(h.id, 'fromB', bSide / bHeirs.length)); else { nodes.PB = { id: 'PB', name: `Arvinger etter ${nB}`, color: PAL.P }; add('PB', 'fromB', bSide); }
      Object.values(t2).forEach(r => { r.name = r.name || nodes[r.id].name; r.color = r.color || nodes[r.id].color; r.total = r.fromA + r.fromB; });
      a2.extra = { usk, inUA, inUB, outA, paid, payouts: payouts.map(p => ({ id: p.h.id, name: p.h.name, color: p.h.color, v: p.v })), inn, aSide, bSide, aFrac, t2: Object.values(t2), aHeirs, bHeirs, saereieSplit: outA > 0 ? Lo : null };
      a2.explain = [...baseExplain()];
      a2.explain.push({ law: 'Arveloven kap. 4', text: gift ? `${nB} kan sitte i uskifte med felleseiet. Uskifteboet utgjør ${kr(usk)}.` : `Som samboer med felles barn kan ${nB} bare ta felles bolig, fritidsbolig, bil og innbo i uskifte. Uskifteboet utgjør ${kr(usk)}.` });
      if (gift && est.sA > 0) a2.explain.push({ law: 'Arveloven kap. 4', text: inn ? `${gen(nA)} særeie (${kr(est.sA)}) inngår i uskiftet etter samtykke/ektepakt.` : `${gen(nA)} særeie (${kr(est.sA)}) går ikke inn i uskiftet og skiftes nå: ${nB} ${kr(Lo.spouse)}${heirs.length ? `, hvert barn ${kr(Lo.each)}` : ''}.` });
      if (felles.length) a2.explain.push({ law: 'Arveloven kap. 4', text: `Felles barn kan ikke nekte uskifte.` });
      payouts.forEach(p => a2.explain.push({ law: 'Arveloven kap. 4', text: `${p.h.name} samtykker ikke til uskifte og får ${kr(p.v)} utbetalt nå.` }));
      if (!skA.length && gift) a2.explain.push({ law: 'Arveloven kap. 4', text: `${nA} har ingen særkullsbarn, så uskifte krever ikke samtykke.` });
      a2.explain.push({ law: 'Når ' + nB + ' dør', text: paid > 0 ? `Uskifteboet deles forholdsmessig fordi deler av arven etter ${nA} allerede er utbetalt: ${pct(aFrac)} til ${gen(nA)} arvinger, resten til ${gen(nB)}.` : `Uskifteboet deles likt: halvparten til ${gen(nA)} arvinger og halvparten til ${gen(nB)} arvinger. Felles barn arver på begge sider.` });
      a2.warnings.push({ level: 'info', text: `${nB} overtar også ansvaret for gjelden, kan ikke gi bort fast eiendom eller uforholdsmessig store gaver fra uskifteboet, og kan ikke gi forskudd på arv til én arving uten at de andre får tilsvarende. Nytt ekteskap, samboerskap i mer enn 2 år eller barn med ny samboer krever skifte.` });
      insExplain(a2); finish(a2);
    }

    /* ALT 3 – minimumsarv */
    const a3 = mk(3, 'minimum', 'Minimumsarv', `Testament som begrenser barna til pliktdel og ${nB} til minstearv. Den frie delen går til andre, et formål eller etter eget valg.`);
    let pl3 = {}, sp3 = 0, fri = 0, factor = 1;
    if (enslig) unavailable(a3, 'Minimumsarv til gjenlevende forutsetter ektefelle eller samboer.');
    else if (samb && !sambF) unavailable(a3, 'Samboere uten felles barn har ingen lovbestemt minstearv. Bruk alternativ 4 (testament) for å tilgodese samboeren.');
    else if (insolvent) unavailable(a3, insolventMsg);
    else {
      const minste = minsteBase;
      sp3 = Math.min(bo, minste);
      const rem = bo - sp3;
      const sumPl = sum(Object.values(pl));
      factor = sumPl > rem && sumPl > 0 ? rem / sumPl : 1;
      heirs.forEach(h => pl3[h.id] = pl[h.id] * factor);
      fri = rem - sumPl * factor;
      if (bOwn > 0) a3.flows.push({ from: 'B', to: 'S', value: bOwn, calc: ownCalc });
      if (sp3 > 0) a3.flows.push({ from: 'A', to: 'S', value: sp3, sub: 'Minstearv', calc: `Minstearv ${heirs.length || !gift ? '4' : '6'} G = ${kr(minste)}. Lovens minimum.` });
      heirs.forEach(h => a3.flows.push({ from: 'A', to: h.id, value: pl3[h.id], sub: 'Pliktdel', calc: `min(⅔ × ${kr(bo)} / ${heirs.length}; 15 G = ${kr(g15)}) = ${kr(pl[h.id])}${factor < 1 ? ` × ${pct(factor)} (forholdsmessig redusert)` : ''}` }));
      const ft = inp.friTo || 'S';
      const friCalc = `Fri del = ${kr(bo)} − pliktdeler ${kr(sumPl * factor)} − minstearv ${kr(sp3)} = ${kr(fri)}`;
      if (ft === 'S') a3.flows.push({ from: 'A', to: 'S', value: fri, hatch: 'fri', sub: 'Fri del', calc: friCalc });
      else if (ft === 'barna' && heirs.length) heirs.forEach(h => a3.flows.push({ from: 'A', to: h.id, value: fri / heirs.length, hatch: 'fri', sub: 'Fri del', calc: friCalc + ` / ${heirs.length}` }));
      else if (!heirs.length && ft === 'barna') a3.flows.push({ from: 'A', to: 'S', value: fri, hatch: 'fri', sub: 'Fri del', calc: friCalc });
      else a3.flows.push({ from: 'A', to: 'O', value: fri, hatch: 'fri', sub: 'Fri del', calc: friCalc });
      a3.flows.push(...insFlows());
      a3.survivor.own = bOwn; a3.survivor.arv = sp3 + (ft === 'S' || (!heirs.length && ft === 'barna') ? fri : 0);
      a3.explain = [...baseExplain()];
      if (heirs.length) a3.explain.push({ law: 'Arveloven § 50', text: `Pliktdelsarven er ⅔ av formuen, fordelt likt på ${heirs.length} barn: ${kr(plRaw)} per barn${plRaw > g15 ? `, begrenset ved testament til 15 G = ${kr(g15)}` : ''}. Sum pliktdeler ${kr(sum(Object.values(pl3)))}.` });
      a3.explain.push({ law: 'Minstearv', text: `${nB} har minstearv på ${heirs.length || !gift ? '4' : '6'} G (${kr(minste)}). Minstearven går foran barnas pliktdel og legges alltid til grunn.` });
      if (factor < 1) a3.warnings.push({ level: 'warn', text: `Pliktdeler og minstearv overstiger dødsboet. Minstearven går foran, og pliktdelene er redusert forholdsmessig til ${pct(factor)}.` });
      a3.explain.push({ law: 'Fri del', text: `Fri del = ${kr(bo)} − ${kr(sum(Object.values(pl3)))} − ${kr(sp3)} = ${kr(fri)}, testamentert til ${ft === 'S' ? nB : ft === 'barna' ? 'barna likt' : 'andre'}.` });
      insExplain(a3); finish(a3);
    }

    /* ALT 4 – testament */
    const a4 = mk(4, 'testament', 'Testament', 'Alt utover minimumsarven fordeles etter avdødes ønske. Fordelingen kontrolleres mot pliktdelsarv og minstearv.');
    const t = (inp.testament || {})[A] || defaultTestament(heirs, enslig, bo, pl, enslig ? 0 : Math.min(Math.max(bo, 0), minsteBase));
    let t4 = null;
    if (insolvent) unavailable(a4, insolventMsg);
    else {
      const ids = [...(enslig ? [] : ['S']), ...heirs.map(h => h.id), 'O'];
      const num = x => parseFloat(String(x == null ? '' : x).replace(',', '.')) || 0;
      const pctOf = id => id === 'S' ? num(t.spouse) : id === 'O' ? num(t.other) : num((t.kids || {})[id]);
      const pSum = sum(ids.map(pctOf));
      const sc = pSum > 100 ? 100 / pSum : 1;
      const want = {}; ids.forEach(id => want[id] = bo * pctOf(id) / 100 * sc);
      const rem = bo - sum(Object.values(want));
      const Lr = rem > 0.5 ? lov(rem, c) : null;
      const eff = {}; ids.forEach(id => eff[id] = want[id] + (Lr ? (id === 'S' ? Lr.spouse : (Lr.kids[id] || 0)) : 0));
      if (Lr && Lr.parents > 0) eff.P = Lr.parents;
      if (pSum > 100.0001) a4.warnings.push({ level: 'warn', text: `Fordelingen summerer til ${pct(pSum / 100)}. Andelene er skalert ned til 100 %.` });
      if (rem > 0.5) a4.warnings.push({ level: 'warn', text: `Testamentet fordeler ${pct(1 - rem / bo)} av boet. Resten, ${kr(rem)}, fordeles etter loven.` });
      const minS = enslig ? 0 : Math.min(bo, minsteBase);
      const sumPl = sum(Object.values(pl)); const f4 = sumPl > bo - minS && sumPl > 0 ? (bo - minS) / sumPl : 1;
      const mins = {}; Object.keys(eff).forEach(id => mins[id] = id === 'S' ? minS : (pl[id] != null ? pl[id] * f4 : 0));
      const viol = [];
      heirs.forEach(h => { const d = mins[h.id] - eff[h.id]; if (d > 0.5) viol.push({ id: h.id, d }); a4.warnings.push && d > 0.5 && a4.warnings.push({ level: 'error', text: `Testamentet krenker pliktdelsarven til ${h.name} med ${kr(d)} – barnet kan kreve dette.` }); });
      if (!enslig && mins.S - eff.S > 0.5) { viol.push({ id: 'S', d: mins.S - eff.S }); a4.warnings.push({ level: 'error', text: `${nB} får ${kr(mins.S - eff.S)} mindre enn minstearven på ${kr(minS)}. Testamentet må justeres.` }); }
      const fin = {}; Object.keys(eff).forEach(id => fin[id] = Math.max(eff[id], mins[id]));
      const deficit = sum(viol.map(v => v.d));
      if (deficit > 0) {
        const exc = {}; Object.keys(fin).forEach(id => exc[id] = Math.max(0, eff[id] - mins[id]));
        const E = sum(Object.values(exc));
        Object.keys(fin).forEach(id => { if (exc[id] > 0) fin[id] -= deficit * exc[id] / E; });
      }
      if (bOwn > 0) a4.flows.push({ from: 'B', to: 'S', value: bOwn, calc: ownCalc });
      Object.keys(fin).forEach(id => a4.flows.push({ from: 'A', to: id, value: fin[id], calc: `Testamentet: ${pct(pctOf(id) / 100 * sc)} = ${kr(want[id] || 0)}${Lr && eff[id] - (want[id] || 0) > 0.5 ? ` + etter loven ${kr(eff[id] - (want[id] || 0))}` : ''}${Math.abs(fin[id] - eff[id]) > 0.5 ? `. Korrigert til ${kr(fin[id])}` : ''}.` }));
      a4.flows.push(...insFlows());
      a4.survivor.own = bOwn; a4.survivor.arv = fin.S || 0;
      a4.explain = [...baseExplain()];
      a4.explain.push({ law: 'Arveloven § 50', text: heirs.length ? `Hvert barn har krav på pliktdel: ${heirs.map(h => `${h.name} ${kr(mins[h.id])}`).join(', ')}.` : `${nA} har ingen livsarvinger, og det er ingen pliktdelsarv.` });
      if (!enslig) a4.explain.push({ law: 'Minstearv', text: minS > 0 ? `${nB} har minstearv på ${kr(minS)}, som legges til grunn.` : `${nB} har ingen lovbestemt minstearv.` });
      a4.explain.push({ law: 'Gjennomførbar fordeling', text: deficit > 0 ? `Krenkede krav (${kr(deficit)}) dekkes forholdsmessig av mottakere som får mer enn sitt vernede minimum.` : 'Testamentet respekterer pliktdelsarv og minstearv og kan gjennomføres som skrevet.' });
      const spLov = enslig ? 0 : L.spouse, sumPlF = sum(Object.values(pl));
      const friKvote = Math.max(0, bo - spLov - sumPlF);
      a4.explain.push({ law: 'Fri kvote', text: `Beholder ${enslig ? 'barna sin pliktdel' : `${nB} lovens andel (${kr(spLov)}) og barna sin pliktdel (${kr(sumPlF)})`}, er den frie kvoten ${kr(friKvote)} – ${pct(bo > 0 ? friKvote / bo : 0)} av boet${!enslig && heirs.length && sumPlF >= (2 / 3) * bo - 1 ? ' (normalt 1/12 med ektefelle og barn)' : ''}.` });
      t4 = { ids, want, eff, fin, mins, pctOf, pSum, rem, deficit, sc, friKvote };
      insExplain(a4); finish(a4);
    }

    /* Forsikringsbehov (alt. 1 og 2) */
    const heirIds = heirs.map(h => h.id);
    function needFor(alt) {
      if (!alt.available || enslig) return null;
      const p = Object.assign({ keep: null, debtPct: 100, kidsPct: alt.id === 'uskifte' ? 100 : 25, buffer: 0, useExisting: true }, ((inp.insNeed || {})[alt.id]) || {});
      const keepIds = p.keep || (inp.assets || []).filter(a => a.type === 'hus').map(a => a.id);
      const keepAssets = (inp.assets || []).filter(a => keepIds.includes(a.id));
      const V = sum(keepAssets.map(a => a.value));
      const Dtot = est.debtTot, D = Dtot * Math.min(100, Math.max(0, +p.debtPct || 0)) / 100;
      const kidsNow = sum(alt.flows.filter(f => f.from === 'A' && heirIds.includes(f.to)).map(f => f.value));
      const kidsCover = kidsNow * Math.min(100, Math.max(0, +p.kidsPct || 0)) / 100;
      const buf = Math.max(0, +p.buffer || 0);
      const K = D + kidsCover + buf;
      const sv = alt.survivor;
      const W = sv.own + sv.arv + (sv.usk || 0);
      const reqNet = V - (Dtot - D) + buf;
      const S = Math.max(0, reqNet - W);
      const need = Math.max(K, S);
      const existing = p.useExisting ? sv.ins : 0;
      const gap = Math.max(0, need - existing);
      return { p, keepIds, keepNames: keepAssets.map(a => a.name), V, Dtot, D, kidsNow, kidsCover, buf, K, W, reqNet, S, need, existing, gap, needG: G ? need / G : 0, gapG: G ? gap / G : 0, canStay: S <= 0.5 };
    }
    a1.need = needFor(a1); a2.need = needFor(a2);

    return { G, g4, g6, g15, A, B, nA, nB, nm, gift, samb, sambF, enslig, felles, skA, skB, heirs, nodes, est, bo, bOwn, insA, insB, insGA, insolvent, L, pl, alts: [a1, a2, a3, a4], t4, testament: t, PAL };
  }
  /* Standardtestament som alltid oppfyller pliktdelsarv og minstearv */
  function defaultTestament(heirs, enslig, bo, pl, minS) {
    const kids = {};
    if (!(bo > 0)) { heirs.forEach(h => kids[h.id] = 0); return { spouse: enslig ? 0 : 100, other: 0, kids }; }
    if (enslig) {
      if (!heirs.length) return { spouse: 0, other: 100, kids };
      const each = Math.floor(10000 / heirs.length) / 100;
      heirs.forEach(h => kids[h.id] = each);
      return { spouse: 0, other: Math.round((100 - each * heirs.length) * 100) / 100, kids };
    }
    let kidsSum = 0;
    heirs.forEach(h => { const p = Math.ceil(((pl && pl[h.id]) || 0) / bo * 10000) / 100; kids[h.id] = p; kidsSum += p; });
    const spouse = Math.max(0, Math.round((100 - kidsSum) * 100) / 100);
    return { spouse, other: 0, kids };
  }

  /* ---------- kontrolltall fra testcase ---------- */
  function validate() {
    const rows = [];
    const chk = (label, exp, act) => rows.push({ label, exp, act, ok: Math.abs(exp - act) < 1 });
    const K = compute(Object.assign(clone(DEFAULT_INPUT), { firstDies: 'K', friTo: 'S' }));
    const M = compute(Object.assign(clone(DEFAULT_INPUT), { firstDies: 'M', friTo: 'S' }));
    const flow = (r, alt, to, sub) => sum(r.alts[alt].flows.filter(f => f.from === 'A' && f.to === to && (sub === undefined || (f.sub || '') === sub || (sub === 'fri' && f.hatch === 'fri'))).map(f => f.value));
    chk('4 G', 496112, K.g4); chk('15 G', 1860420, K.g15);
    chk('Forsikring mann (50 G)', 6201400, M.insA); chk('Forsikring kone (20 G)', 2480560, K.insA);
    chk('Felleseie netto', 61500000, K.est.fellesNet); chk('Halvdel felleseie', 30750000, K.est.half);
    chk('Kone dør · dødsbo', 33750000, K.bo);
    chk('Kone dør · alt. 1 mann', 8437500, flow(K, 0, 'S'));
    chk('Kone dør · alt. 1 felles barn 1', 12656250, flow(K, 0, 'F1'));
    chk('Kone dør · alt. 1 særkullsbarn (Mann)', 0, flow(K, 0, 'SM1'));
    chk('Kone dør · forsikring til mann', 2480560, K.alts[0].survivor.ins);
    chk('Kone dør · alt. 2 særeie til mann', 750000, flow(K, 1, 'S'));
    chk('Kone dør · alt. 2 særeie per barn', 1125000, flow(K, 1, 'F1'));
    chk('Kone dør · alt. 2 uskiftebo', 61500000, K.alts[1].extra.usk);
    chk('Kone dør · alt. 3 pliktdel per barn', 1860420, flow(K, 2, 'F1'));
    chk('Kone dør · alt. 3 minstearv', 496112, flow(K, 2, 'S', 'Minstearv'));
    chk('Kone dør · alt. 3 fri del', 29533048, flow(K, 2, 'S', 'fri'));
    chk('Kone dør · alt. 3 mann arv totalt', 30029160, K.alts[2].survivor.arv);
    chk('Mann dør · dødsbo', 30750000, M.bo);
    chk('Mann dør · alt. 1 kone', 7687500, flow(M, 0, 'S'));
    chk('Mann dør · alt. 1 per barn (3)', 7687500, flow(M, 0, 'F1'));
    chk('Mann dør · alt. 1 særkullsbarn', 7687500, flow(M, 0, 'SM1'));
    chk('Mann dør · forsikring til kone', 6201400, M.alts[0].survivor.ins);
    chk('Mann dør · alt. 2 særkullsbarn utbetalt', 7687500, flow(M, 1, 'SM1'));
    chk('Mann dør · alt. 3 sum pliktdeler', 5581260, flow(M, 2, 'F1') + flow(M, 2, 'F2') + flow(M, 2, 'SM1'));
    chk('Mann dør · alt. 3 minstearv', 496112, flow(M, 2, 'S', 'Minstearv'));
    chk('Mann dør · alt. 3 fri del', 24672628, flow(M, 2, 'S', 'fri'));
    return rows;
  }

  window.ArveEngine = { DEFAULT_INPUT, compute, lov, estate, validate, defaultTestament, fmt, kr, pct, gen, clone, PAL };
})();
