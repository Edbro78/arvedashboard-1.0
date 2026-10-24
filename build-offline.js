/* Lager arvekalkulator-offline.html med all CSS, JS og logo inlinet.
   Kjør: node build-offline.js  (etter endringer i index.html, css/ eller js/) */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

const logo = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(dir, 'assets/spwm-logo.svg')).toString('base64');

/* Boxicons-erstatning: inline SVG som CSS-maske på ::before */
const ICONS = {
  'download': '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'group': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14.3c2.1.8 3.5 2.9 3.5 5.7"/>',
  'building-house': '<path d="M3 21h18M5 21V10l7-6 7 6v11M10 21v-6h4v6"/>',
  'credit-card': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  'git-branch': '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-6 4-12 8"/>',
  'shield-quarter': '<path d="M12 3l8 3v6c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6zM12 3v18M4 12h16"/>',
  'slider-alt': '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  'lock-alt': '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  'info-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  'trash': '<path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'minus': '<path d="M5 12h14"/>',
  'reset': '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/>',
  'block': '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  'x': '<path d="M6 6l12 12M18 6L6 18"/>',
  'check': '<path d="M5 12.5l4.5 4.5L19 7"/>',
  'error-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  'error': '<path d="M12 3L2 20h20zM12 10v4M12 17v.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  'right-arrow-alt': '<path d="M5 12h14M13 6l6 6-6 6"/>'
};
const svgUri = body => 'url("data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`) + '")';
const iconCss = `
/* Offline-ikoner (erstatter Boxicons) */
.bx{display:inline-flex;align-items:center;justify-content:center;width:1em;height:1em;line-height:1;font-style:normal;vertical-align:-.125em;flex:none}
.bx::before{content:"";display:block;width:1em;height:1em;background-color:currentColor;-webkit-mask:var(--bx) center/contain no-repeat;mask:var(--bx) center/contain no-repeat}
${Object.entries(ICONS).map(([k, v]) => `.bx-${k}{--bx:${svgUri(v)}}`).join('\n')}
`;

let html = read('index.html');
html = html.replace(/\s*<link rel="preconnect"[^>]*>/g, '');
html = html.replace(/\s*<link rel="stylesheet" href="https:[^>]*data-online>/g, '');
html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${logo}" type="image/svg+xml">`);
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, f) => `<style>\n${read(f)}\n</style>`);
html = html.replace('</head>', `<style>${iconCss}</style>\n</head>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, f) => {
  const js = read(f).replace(/assets\/spwm-logo\.svg/g, logo).replace(/<\/script/gi, '<\\/script');
  return `<script>\n${js}\n</script>`;
});
html = html.replace('<title>', '<!-- Generert av build-offline.js. Ikke rediger direkte. -->\n  <title>');

fs.writeFileSync(path.join(dir, 'arvekalkulator-offline.html'), html);
console.log('Skrev arvekalkulator-offline.html (' + Math.round(html.length / 1024) + ' kB)');
