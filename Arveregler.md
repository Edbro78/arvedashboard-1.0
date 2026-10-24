# Arveregler og beregningsmodell – Arvekalkulator

Dette dokumentet beskriver de juridiske reglene og beregningene arvekalkulatoren bygger på. Det er **eneste fasit** for beregningsmotoren (`arve-engine.js`). UI-prompten (`Cursor-prompt.md`) viser hit for alle regler.

Rettsgrunnlag:
- Arveloven av 14. juni 2019 nr. 21 (i kraft 1. januar 2021)
- Ekteskapsloven av 4. juli 1991 nr. 47, kap. 12 (skifte) og § 59 (skjevdeling)
- Forsikringsavtaleloven (FAL) kap. 15 (livsforsikring utenfor dødsboet)

> Forenklet modell til illustrasjon. Ikke juridisk rådgivning. Arveoppgjør bør gjennomgås med advokat.

---

## 0. Begreper og notasjon

| Symbol | Betydning |
|---|---|
| **A** | Førstavdøde (den som dør først) |
| **B** | Gjenlevende ektefelle/samboer |
| **G** | Folketrygdens grunnbeløp. Standard 124 028 kr. Justeres 1. mai hvert år. |
| **4 G** | Minstearv for ektefelle med livsarvinger, og for samboer med felles barn |
| **6 G** | Minstearv for ektefelle uten livsarvinger (når foreldrelinjen lever) |
| **15 G** | Øvre grense for pliktdelsarv per barn |
| **Dødsbo (bo)** | A's nettoformue etter ekteskapsdeling. Dette er det som arves. |
| **Livsarvinger (heirs)** | A's barn = felles barn + A's særkullsbarn. B's særkullsbarn arver **ikke** etter A. |
| **Egen formue B** | B's halvdel av felleseiet + B's særeie. **Ikke arv.** |

Avrunding: Regn med fulle desimaler internt. Avrund til hele kroner bare ved visning.
Formatering: `25 000 000 kr`. Ikke-brytende mellomrom som tusenskille, komma som desimaltegn, `kr` som suffiks. Prosent: `25 %`, `8,3 %`. Minustegn `−` (U+2212).

---

## 1. Steg 1 – Ekteskapsdeling (bare gift, ekteskapsloven kap. 12)

### 1.1 Inndata
- Eiendeler `{navn, type, verdi, eierskap}` der eierskap ∈ `felleseie | særeie mann | særeie kone`
- Gjeld: `felles`, `mann`, `kone` (kr)
- Særeie oppgitt som sum: `saereieM`, `saereieK`
- Skjevdelingskrav: `skjevM`, `skjevK` (ekteskapsloven § 59: verdier ført inn i ekteskapet, eller arvet/fått i gave)

### 1.2 Avstemming av særeie
For hver ektefelle X:
```
merket[X]   = sum verdier av eiendeler merket "særeie X"
særeie[X]   = max(oppgitt særeie X, merket[X])
fraFelles[X] = max(0, oppgitt særeie X − merket[X])
```
- Hvis `fraFelles[X] > 0` og `merket[X] == 0`: vis **info**: "Særeie for X (… kr) er oppgitt som sum og trukket forholdsmessig fra felleseie-eiendelene."
- Hvis `fraFelles[X] > 0` og `merket[X] > 0`: vis **advarsel**: "Særeie for X er oppgitt til … kr, men eiendeler merket særeie utgjør … kr. Differansen på … kr trekkes fra felleseiet."
- Hvis `fraFelles[M] + fraFelles[K] > brutto felleseie`: **advarsel** "Oppgitt særeie er større enn eiendelene som er merket felleseie. Kontroller eierskap."

### 1.3 Deling
```
fellesBrutto  = sum eiendeler merket felleseie
felleseieNetto = fellesBrutto − fraFelles[M] − fraFelles[K] − gjeld.felles
likedeling    = felleseieNetto − skjev[M] − skjev[K]
halvdel       = likedeling / 2
andel[X]      = halvdel + skjev[X] − gjeld[X]      // egen gjeld hefter ved egen andel
dødsbo        = andel[A] + særeie[A]
egenFormueB   = andel[B] + særeie[B]               // IKKE arv
```
Kontroll: `brutto − total gjeld − andel[B] − særeie[B] = dødsbo`.

### 1.4 Samboere (ingen ekteskapsdeling)
Hver eiendel har `eierandel mann %` (resten kone).
```
eie[M] = Σ verdi × pctM/100 − gjeld.felles/2 − gjeld.mann
eie[K] = Σ verdi × (1−pctM/100) − gjeld.felles/2 − gjeld.kone
dødsbo = eie[A];  egenFormueB = eie[B]
```
Uskiftbare eiendeler for samboer: type `bolig`, `fritidsbolig`, `bil/båt`, `innbo`:
`uskiftbar[X] = Σ verdi × eierandel X` for disse typene.

### 1.5 Enslig
`dødsbo = nettoformue`, `egenFormueB = 0`. Ingen B.

### 1.6 Insolvens
Hvis `dødsbo ≤ 0` eller `nettoformue ≤ 0`: vis "Boet er insolvent – arvinger arver ikke gjeld. Ingen fordeling." i alle fire alternativer. Ingen diagrammer.

---

## 2. Steg 2 – Arvinger

- **Felles barn:** arver etter både A og B.
- **A's særkullsbarn:** arver bare etter A.
- **B's særkullsbarn:** arver bare etter B. Får ingenting av A's dødsbo. Vises bare i uskifte, tidspunkt 2.
- **Representasjon:** Barnebarn trer inn i et avdødt barns sted (valgfritt å støtte i UI).
- **Foreldrelinjen (2. arvegangsklasse):** foreldre, søsken og deres etterkommere. Én samlepost: "Foreldre/søsken". Input: "Foreldre, søsken eller deres barn lever" (ja/nei, standard ja).
- **3. arvegangsklasse** (besteforeldre, onkler, tanter): Ektefellen arver foran denne klassen.

---

## 3. Steg 3 – Lovbestemt arv (`lov(beløp)`)

Funksjonen tar et beløp (hele boet, eller en del av det) og returnerer `{ektefelle, perBarn, foreldre, regel}`.

### 3.1 Gift, A har livsarvinger (arveloven § 8)
```
ektefelle = min(beløp, max(beløp/4, 4G))
rest      = beløp − ektefelle
perBarn   = rest / antall livsarvinger
```
- regel `kvart` hvis ¼ ≥ 4G: "B arver ¼ av boet (X kr), som er over minstearven på 4 G (Y kr)."
- regel `minste4` hvis ¼ < 4G < beløp: "¼ av boet (…) er under minstearven, så B arver 4 G (…)."
- regel `hele4` hvis beløp ≤ 4G: "Boet (…) er mindre enn minstearven på 4 G (…). B tar hele boet, og barna får 0 – ektefellens minstearv går foran livsarvingenes arv." Vis også **advarsel**.

### 3.2 Gift, A har ingen livsarvinger (arveloven § 9)
- Foreldrelinjen lever: `ektefelle = min(beløp, max(beløp/2, 6G))`, rest til "Foreldre/søsken" (§ 5). Regler `halv`, `minste6`, `hele6`.
- Foreldrelinjen lever ikke: `ektefelle = beløp` (100 %). Regel `heleSlekt`: "A etterlater verken livsarvinger, foreldre eller søsken (eller deres etterkommere). B arver hele boet foran fjernere slekt."

### 3.3 Samboer med felles barn (arveloven § 10)
`samboer = min(beløp, 4G)`. Resten fordeles likt på A's livsarvinger (felles barn + A's særkullsbarn).
Regler: `samb4`, `heleSamb` (beløp ≤ 4G).

### 3.4 Samboer uten felles barn (arveloven § 10)
Samboer = 0 (regel `sambIngen`). Alt til A's livsarvinger, eller til foreldre/søsken hvis det ikke er livsarvinger. Infotekst: "Samboere uten felles barn har ingen lovbestemt arverett. Gjenlevende kan bare tilgodeses gjennom testament (alternativ 4)."

### 3.5 Enslig
Alt til livsarvingene likt (§ 4). Uten barn: til foreldre/søsken (§ 5), eller øvrig slekt (§ 6).

### 3.6 Oppsummering
| Sivilstand | Arvinger | Ektefelle/samboer | Barn samlet |
|---|---|---|---|
| Gift | Ektefelle + barn | ¼ (minst 4 G) | Resten (¾) |
| Gift | Ektefelle + foreldre/søsken | ½ (minst 6 G) | – (slekt får ½) |
| Gift | Ektefelle, ingen foreldrelinje | 100 % | – |
| Samboer | Samboer + felles barn | 4 G | Resten |
| Samboer | Samboer + bare særkullsbarn | 0 kr | 100 % |

---

## 4. Steg 4 – Pliktdelsarv (arveloven § 50)

Pliktdelsarven er **⅔ av formuen (dødsboet)**, fordelt likt på livsarvingene. Testamentet kan begrense den til **15 G per barn**.
```
pliktdelRå = (2/3 × dødsbo) / antall livsarvinger
pliktdel   = min(pliktdelRå, 15G)          // per barn, også særkullsbarn
```
Forklaringstekst: "Pliktdelsarven er ⅔ av formuen, fordelt likt på n barn: X kr per barn, begrenset ved testament til 15 G = Y kr."

**Minstearv vs. pliktdel:** Ektefellens/samboerens minstearv (4 G, eller 6 G uten livsarvinger) går **foran** pliktdelen. Hvis `Σ pliktdel + minstearv > dødsbo`:
```
faktor = (dødsbo − minstearv) / Σ pliktdel
pliktdel_justert = pliktdel × faktor
```
Vis advarsel: "Pliktdeler og minstearv overstiger dødsboet. Minstearven går foran, og pliktdelene er redusert forholdsmessig til X %."

**Låst regel i dette verktøyet:** Minstearven legges **alltid** til grunn. Verktøyet skal ikke foreslå eller åpne for fordelinger under lovens minimum, f.eks. ved at ektefellen "kjente testamentet". Det finnes ingen bryter for dette.

---

## 5. Steg 5 – Livsforsikring (FAL kap. 15)

```
forsikring[X] = antall G[X] × G
```
- Det er A's forsikring som utbetales når A dør.
- Utbetalingen går **utenom dødsboet** og endrer ikke arvefordelingen.
- Begunstiget: `ektefelle/samboer` (standard) | `barn` (fordeles likt på A's livsarvinger) | `navngitt annen`.
  - Ektefelle valgt, men enslig → behandles som `barn`.
  - `barn` valgt, men ingen livsarvinger → behandles som `navngitt annen`.
- Vis alltid info når forsikring > 0: "Pliktdelsarvinger kan i særlige tilfeller angripe forsikringsutbetalinger som er urimelig store sett mot avdødes økonomi – vurder med advokat."

---

## 6. Alternativ 1 – Lovens fordeling (skifte nå, uten testament)

Tilgjengelig: alltid (unntatt ved insolvens).

```
L = lov(dødsbo)
B får:        L.ektefelle   (arv)
Hvert barn:   L.perBarn
Foreldre:     L.foreldre    (kun uten livsarvinger)
Forsikring:   til begunstiget, utenfor boet
Gjenlevende totalt = egenFormueB + L.ektefelle + forsikring til B
```

---

## 7. Alternativ 2 – Uskifte (arveloven kap. 4)

### 7.1 Hvem kan sitte i uskifte
- **Ektefelle:** ja. Uskiftet omfatter **felleseiet**.
- **Samboer med felles barn:** ja, men bare for felles bolig med innbo, fritidsbolig og bil/båt til felles bruk. Resten av A's bo skiftes nå etter loven.
- **Samboer uten felles barn:** nei. Alternativet er deaktivert: "Samboere uten felles barn har ikke rett til å sitte i uskifte (arveloven kap. 4)."
- **Enslig:** nei: "Uskifte forutsetter en gjenlevende ektefelle eller samboer."

### 7.2 Særeie
Bryter "Særeie inngår i uskifte (krever samtykke/ektepakt)", standard **AV**.
- AV: A's særeie skiftes nå etter `lov(særeie A)`: ektefellen ¼ (minst 4 G), barna resten.
- PÅ: A's særeie går inn i uskifteboet.
- B's særeie holdes alltid utenfor uskiftet (B's egen formue).

### 7.3 Særkullsbarn
- Felles barn kan **ikke** nekte uskifte.
- A's særkullsbarn må samtykke skriftlig. Én bryter per særkullsbarn: "Særkullsbarn (Mann) samtykker til uskifte", standard **NEI**.
- Nekter: barnet får sin lovbestemte andel av den delen som ellers ville gått inn i uskiftet, utbetalt nå: `lov(innIUskifteA).perBarn`.
- Ingen særkullsbarn: vis "Ingen samtykke nødvendig – A har ingen særkullsbarn, og felles barn kan ikke nekte uskifte."

### 7.4 Beregning, tidspunkt 1 (A dør)
```
innA     = gift ? andel[A] + (særeieInn ? særeie[A] : 0) : uskiftbar[A]
utA      = dødsbo − innA                       // skiftes nå etter lov(utA)
innB     = gift ? andel[B] : uskiftbar[B]
egenRest = egenFormueB − innB                  // B's særeie / øvrig formue
utbetalt = Σ lov(innA).perBarn for hvert særkullsbarn som nekter
uskiftebo = innA − utbetalt + innB
```
B rår over: `uskiftebo + egenRest + lov(utA).ektefelle + forsikring til B`.

### 7.5 Tidspunkt 2 (B dør senere, uendrede verdier)
- Hovedregel: uskifteboet deles **50/50** mellom A's arvinger og B's arvinger.
- Har noen av A's arvinger fått arv utbetalt: del forholdsmessig. `A-side = uskiftebo × (innA − utbetalt) / uskiftebo`.
- A-siden fordeles likt på felles barn + A's særkullsbarn som samtykket. Ingen → "Arvinger etter A".
- B-siden fordeles likt på felles barn + B's særkullsbarn. Ingen → "Arvinger etter B".
- Felles barn arver på begge sider.

### 7.6 Råderett og opphør (infoboks)
"B overtar også ansvaret for gjelden, kan ikke gi bort fast eiendom eller uforholdsmessig store gaver fra uskifteboet, og kan ikke gi forskudd på arv til én arving uten at de andre får tilsvarende. Nytt ekteskap, samboerskap i mer enn 2 år eller barn med ny samboer krever skifte."
Uskiftet opphører også når B velger å skifte, helt eller delvis.

---

## 8. Alternativ 3 – Minimumsarv (testament med maksimal begrensning)

Formål: barna begrenses til pliktdel, gjenlevende til minstearv. Resten (fri del) frigjøres til andre, et formål eller et eget valg.

Tilgjengelig: gift, eller samboer med felles barn. Deaktivert for samboer uten felles barn ("… Bruk alternativ 4 (testament) for å tilgodese samboeren.") og for enslig.

```
minstearv = gift ? (livsarvinger ? 4G : 6G) : 4G   // alltid beskyttet
ektefelle = min(dødsbo, minstearv)
pliktdeler = se § 4 (med eventuell forholdsmessig reduksjon)
friDel    = dødsbo − ektefelle − Σ pliktdeler
```
Mottaker av fri del (valg): `Andre/veldedighet` (**standard**) | `Gjenlevende` | `Barna likt`.
Fri del vises som eget skravert segment.

---

## 9. Alternativ 4 – Testament (fri kvote etter eget ønske)

Brukeren fordeler dødsboet i % til: gjenlevende, hvert barn individuelt og "Andre/veldedighet".

### 9.1 Standardfordeling (må alltid være lovlig)
- Gift/samboer: hvert barn = pliktdel / dødsbo (rundet **opp** til 2 desimaler), gjenlevende = resten, andre = 0.
- Enslig med barn: likt mellom barna (rundet ned), rest til andre.
- Enslig uten barn: 100 % til andre.
- Knapp: "Tilbakestill til lovlig fordeling".

### 9.2 Validering i sanntid
1. Sum ≠ 100 %:
   - < 100 %: **gul**. "Testamentet fordeler X % av boet. Resten, Y kr, fordeles etter loven." Resten fordeles med `lov(rest)`.
   - > 100 %: **gul**. Andelene skaleres ned til 100 %.
2. Barn under pliktdel: **rød**. "Testamentet krenker pliktdelsarven til [navn] med X kr – barnet kan kreve dette."
3. Gjenlevende under minstearv: **rød**. "B får X kr mindre enn minstearven på Y kr. Testamentet må justeres."

### 9.3 Gjennomførbar fordeling
```
ønsket[i]  = dødsbo × pct[i]/100 (+ lovens andel av udisponert rest)
minimum[i] = pliktdel (barn) | minstearv (gjenlevende) | 0 (andre)
endelig[i] = max(ønsket[i], minimum[i])
underskudd = Σ max(0, minimum[i] − ønsket[i])
overskudd[i] = max(0, ønsket[i] − minimum[i])
endelig[i] −= underskudd × overskudd[i] / Σ overskudd
```
Vis ønsket og gjennomførbart side om side. Status per rad: `I orden` (grønn), `Redusert` (gul), `Krenker pliktdel` / `Under minstearv` (rød).

### 9.4 Fri kvote (forklaring)
`friKvote = dødsbo − lovens ektefelleandel − Σ pliktdel`
- Ektefelle + barn, normal formue: ca. **1/12 (8,33 %)**. Er formuen stor nok til at 15 G-taket slår inn, blir den frie kvoten større.
- Samboer + felles barn: resten etter 4 G og pliktdeler.
- Bare barn: **⅓** (ved normal formue).
- Ingen barn: slekten har ingen pliktdel. Gift: ektefellens del (½ / 6 G) må ivaretas. Ugift: 100 % fritt.

### 9.5 Formkrav (arveloven § 42), infotekst
Skriftlig, underskrevet av arvelater, to vitner til stede samtidig som vet at det er et testament. Vitnene kan ikke være inhabile (tilgodesett selv, eller deres nærstående).

---

## 10. Forsikringsbehov (alternativ 1 og 2)

Formål: Hvor stor livsforsikring på A trengs for at B kan bli boende etter at barna har fått sitt?

### 10.1 Parametere (separat sett for alt. 1 og alt. 2)
| Parameter | Alt. 1 standard | Alt. 2 standard |
|---|---|---|
| Bolig som skal beholdes (eiendeler av type bolig/fritidsbolig) | alle av type bolig | alle av type bolig |
| Innfri gjeld (0–100 %, steg 5) | 100 % | 100 % |
| Dekk barnas arv / arv som utbetales nå kontant (0–100 %) | 25 % | 100 % |
| Likviditetsbuffer (kr) | 500 000 | 500 000 |
| Trekk fra eksisterende livsforsikring | på | på |

### 10.2 Beregning
```
V        = Σ verdi av valgte boliger
Dtot     = total gjeld;   D = Dtot × innfri%
barnNå   = Σ arv fra A's dødsbo til A's livsarvinger i alternativet (alt. 2: bare det som utbetales nå)
barnDekk = barnNå × dekk%
K        = D + barnDekk + buffer                          // kontantbehov
W        = B's formue etter oppgjøret = egen formue + arv (+ uskiftebo i alt. 2)
reqNet   = V − (Dtot − D) + buffer                        // nødvendig egenkapital for å beholde boligen
S        = max(0, reqNet − W)                             // boligunderskudd
behov    = max(K, S)                                      // anbefalt forsikringssum
eksist   = (trekk fra) ? forsikring til B : 0
udekket  = max(0, behov − eksist)
```
Vises i kr og i G (`behov / G`, én desimal).
Status: `S = 0` → grønn "B kan bli boende i [bolig] (V kr). B's formue etter oppgjøret er W, mot nødvendig egenkapital reqNet." Ellers rød "Uten forsikring mangler B S kr …".

---

## 11. Kanttilfeller

| Tilfelle | Håndtering |
|---|---|
| Negativt dødsbo / negativ netto | Insolvent – ingen fordeling i noen alternativer |
| Dødsbo < 4 G (gift med barn) | Ektefellen tar hele boet, barna 0, med forklaring |
| Σ pliktdel + minstearv > dødsbo | Minstearv først, pliktdeler reduseres forholdsmessig |
| Ingen barn | Skjul barnekolonner. 6 G-regelen + "Foreldre/søsken" (eller 100 % til ektefelle uten foreldrelinje) |
| 0 særkullsbarn hos A | Skjul samtykkebrytere i alt. 2 |
| Samboer uten felles barn | Alt. 2 og 3 deaktivert med forklaring |
| Særeie oppgitt > merket særeie | Advarsel (§ 1.2) |
| Testament < pliktdel/minstearv | Rød markering + korrigert fordeling. Aldri som standardforslag |

---

## 12. Testcase og kontrolltall (skal reproduseres eksakt)

**Input:** Gift. 2 felles barn. Mann 1 særkullsbarn, kone 0.
Hus 25 000 000 · Fritidseiendom 5 000 000 · Bil/båt 3 000 000 · Investeringsselskap 36 000 000 · Aksjer/fond 14 000 000 · Bank 500 000 → brutto 83 500 000.
Gjeld 19 000 000 (felles). Netto 64 500 000. Særeie kone 3 000 000 (oppgitt som sum), mann 0. Skjevdeling 0.
Livsforsikring mann 50 G, kone 20 G, begunstiget ektefelle. G = 124 028. Alt. 3 med fri del → gjenlevende.

| # | Kontroll | Forventet |
|---|---|---|
| 1 | 4 G | 496 112 |
| 2 | 15 G | 1 860 420 |
| 3 | Forsikring mann (50 G) | 6 201 400 |
| 4 | Forsikring kone (20 G) | 2 480 560 |
| 5 | Felleseie netto | 61 500 000 |
| 6 | Halvdel felleseie | 30 750 000 |
| **Kone dør først** | | |
| 7 | Dødsbo | 33 750 000 |
| 8 | Alt. 1 – mann (¼) | 8 437 500 |
| 9 | Alt. 1 – hvert felles barn | 12 656 250 |
| 10 | Alt. 1 – mannens særkullsbarn | 0 |
| 11 | Forsikring til mann | 2 480 560 |
| 12 | Alt. 2 – særeie til mann | 750 000 |
| 13 | Alt. 2 – særeie per barn | 1 125 000 |
| 14 | Alt. 2 – uskiftebo | 61 500 000 |
| 15 | Alt. 3 – pliktdel per barn | 1 860 420 |
| 16 | Alt. 3 – minstearv | 496 112 |
| 17 | Alt. 3 – fri del | 29 533 048 |
| 18 | Alt. 3 – mann arv totalt | 30 029 160 |
| **Mann dør først** | | |
| 19 | Dødsbo | 30 750 000 |
| 20 | Alt. 1 – kone | 7 687 500 |
| 21 | Alt. 1 – per barn (3) | 7 687 500 |
| 22 | Alt. 1 – særkullsbarn | 7 687 500 |
| 23 | Forsikring til kone | 6 201 400 |
| 24 | Alt. 2 – særkullsbarn utbetalt (nekter) | 7 687 500 |
| 25 | Alt. 3 – sum pliktdeler (3 × 1 860 420) | 5 581 260 |
| 26 | Alt. 3 – minstearv | 496 112 |
| 27 | Alt. 3 – fri del | 24 672 628 |

Forsikringsbehov, kone dør, alt. 1, standard: K = 19 000 000 + 25 % × 25 312 500 + 500 000 = **25 828 125**. Eksisterende 2 480 560 → udekket **23 347 565** (≈ 188,2 G).
Alt. 2: K = 19 000 000 + 100 % × 2 250 000 + 500 000 = **21 750 000** → udekket **19 269 440**.

Toleranse: |forventet − beregnet| < 1 kr.
