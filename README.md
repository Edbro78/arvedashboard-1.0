# arvedashboard-1.0

Interaktiv arvekalkulator på norsk bokmål i designsystemet til Söderberg & Partners Wealth Management. Kjører direkte i nettleseren, uten byggesteg eller server.

- **Start:** åpne `index.html` (dobbeltklikk).
- **Offline:** `arvekalkulator-offline.html` har alt inlinet. Lages på nytt med `node build-offline.js`.
- **Kontrolltall:** `tests.html` sjekker beregningsmotoren mot de 27 kontrolltallene i `docs/Arveregler.md` § 12.

| Mappe/fil | Innhold |
|---|---|
| `js/engine.js` | Beregningsmotor (`window.ArveEngine`), ingen DOM |
| `js/format.js` | nb-NO-formattering |
| `js/charts.js` | Sankey, waterfall og sammenligningssøyler i SVG/DOM |
| `js/app.js` | State, rendering og hendelser |
| `css/tokens.css`, `css/app.css` | Designtokens og komponenter |
| `docs/Arveregler.md` | Juridiske regler og fasit |
| `SPWM mal/` | Designsystemet (uten lisensierte fonter) |

Forenklet modell til illustrasjon. Ikke juridisk rådgivning. Arveoppgjør bør gjennomgås med advokat.
