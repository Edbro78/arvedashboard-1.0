/* Arvekalkulator – nb-NO-formattering. window.Fmt */
(function () {
  const NB = 'nb-NO';
  const nf = (n, d = 0) => Number(n || 0).toLocaleString(NB, { minimumFractionDigits: 0, maximumFractionDigits: d });
  const num = n => Math.round(+n || 0).toLocaleString(NB);
  const kr = n => num(n) + '\u00a0kr';
  /* Kort beløp: 39,2 mill. / 850 k */
  const short = n => {
    const a = Math.abs(+n || 0);
    if (a >= 1e6) return nf(n / 1e6, 1) + '\u00a0mill.';
    if (a >= 1e3) return nf(n / 1e3, 0) + '\u00a0k';
    return nf(n, 0);
  };
  /* Prosent av et tall som allerede er i prosent (25 → "25 %") */
  const pct = (p, d = 1) => nf(p, d) + '\u00a0%';
  /* Andel 0–1 → prosent */
  const share = (f, d = 1) => pct((+f || 0) * 100, d);
  const g = n => '≈\u00a0' + nf(n, 1) + '\u00a0G';
  const gen = s => /[sxz]$/i.test(s) ? s + '\u2019' : s + 's';
  const parseInt = s => {
    const v = String(s == null ? '' : s).replace(/\u2212/g, '-').replace(/[^\d-]/g, '');
    return v === '' || v === '-' ? 0 : +v;
  };
  const parseDec = s => {
    const v = parseFloat(String(s == null ? '' : s).replace(/\s|\u00a0/g, '').replace(',', '.'));
    return isFinite(v) ? v : 0;
  };
  const dec = (n, d = 2) => nf(n, d);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, one, many) => n === 1 ? one : many;

  window.Fmt = { nf, num, kr, short, pct, share, g, gen, parseInt, parseDec, dec, esc, plural };
})();
