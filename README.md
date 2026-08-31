# WeatherDash

Et statisk vejrdashboard til GitHub Pages, bygget til tre konkrete beslutninger:
**skal jeg køre nu, kan jeg være udenfor, og hvad har planterne på den sydvendte terrasse brug for i dag?**

Ingen build, ingen afhængigheder, ingen API-nøgle — tre filer og en `index.html`.

## Sådan lægger du det på GitHub Pages

**Enten** via Actions (workflowet ligger i `.github/workflows/pages.yml`):

1. Merge til `main`.
2. *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
3. Siden bliver deployet ved hvert push til `main`.

**Eller** direkte fra branchen uden Actions:

1. *Settings → Pages → Source: **Deploy from a branch***, vælg `main` og mappen `/ (root)`.
2. `.nojekyll` sørger for at filerne serveres som de er.

Siden lander på `https://<bruger>.github.io/WeatherDash/`.

Lokalt kan `index.html` åbnes direkte i browseren, eller serveres med `python3 -m http.server`.

## Data

Alt hentes i browseren fra [Open-Meteo](https://open-meteo.com/) — gratis, ingen nøgle, ingen sporing:

* `api.open-meteo.com` — time- og dagsprognose 7 dage frem (temperatur, føles-som, nedbør og sandsynlighed, vind og vindstød, sigtbarhed, UV, skydække, indstråling, ET₀-fordampning, sol op/ned).
* `geocoding-api.open-meteo.com` — bysøgning og opslag af koordinater fra browserens stedbestemmelse.
* `ensemble-api.open-meteo.com` — ECMWF's ensemble (`ecmwf_ifs025`): samme model kørt ~51 gange med små forstyrrelser i starttilstanden. Medlemmerne læses ud af svaret ved at scanne nøglerne (`temperature_2m_member01` osv.) frem for at antage et antal, og bruges til p10/p90-båndet.
* `air-quality-api.open-meteo.com` — luftkvalitet og pollental fra Copernicus' CAMS-model: europæisk luftkvalitetsindeks, PM2,5, PM10, ozon, kvælstofdioxid samt pollen fra el, birk, græs, bynke og ambrosia. Pollen og de europæiske indeks dækker kun Europa; uden for Europa udelades de felter, der mangler.

Valgt sted og tema gemmes i `localStorage`. Data genindlæses hvert 15. minut, når fanen er synlig.
Kan API'et ikke nås, viser dashboardet **demo-data** med en tydelig banner, så layoutet stadig kan ses.

## Sådan beregnes tallene

Alt sker i `assets/app.js` og er bevidst simpelt nok til at kunne justeres.

**Kørsel (0–10, gennemsnit af de næste 12 timer)** — træk fra for sne og isslag, regnmængde,
temperatur nær frysepunktet kombineret med fugt eller nedbør, vindstød, nedsat sigtbarhed og tåge,
samt lavtstående sol inden for en time af solop-/nedgang ved lavt skydække.

**Udendørs (0–10)** — føles-som-temperatur vægter tungest, derefter nedbørssandsynlighed og
-mængde, vindhastighed, torden og høj UV. Dashboardet finder også det længste sammenhængende
vindue med score ≥ 6,8 mellem kl. 06 og 22.

**Time for time** — én række pr. time i stedet for et vandret bånd. Temperaturen får en tone fra en rampe med rigtige farvetrin — mørkeblå → blå → lys blå → neutral → gul → orange → rød — forankret absolut i grader, så 20 ° altid har samme farve uanset hvilken dag man ser på. Trinnene ligger, hvor graderne opleves: fuld kulde ved -10 °, neutralt hele vejen fra 15 til 19 °, gult omkring 22 °, orange ved 26 ° og rødt ved 31 °. To andre skalaer blev prøvet først. En symmetrisk to-polet skala om 15 ° gjorde tallene orange allerede ved 18–19 °, hvilket ikke svarer til, hvordan en dag opleves; og en ren blanding mellem to poler bliver mudret midt på skalaen, netop hvor de fleste danske timer ligger, fordi vejen fra blå til rød går gennem grå. Rampen blandes i oklab frem for sRGB, så overgangen neutral → gul går udenom en olivengrå mellemvej. Tonens styrke følger de samme forankringer, og hele skalaen er målt efter i begge temaer: tallet mod sin tone er mindst 5,6:1, og selve kurven mindst 3,06:1 mod kortets flade (WCAG-kravet til grafik er 3:1). På lys bund er tonen en flade bag mørk tekst; på mørk bund bliver den samme flade brunlig, uanset styrke, så dér bærer tallet selv farven på en næsten neutral flade. Nedbøren deler sig i to kanaler, som ikke kan forveksles: **banen bærer kun regnrisikoen**, hvor fuld bane er 100 %, og **mængden står som tal** med farve og vægt efter intensitet. De to tal kommer fra hver sin beregning — risikoen fra ensemblet (andelen af kørsler med nedbør), mængden fra den deterministiske model — så en høj risiko kan følges af en meget lille mængde. Derfor skrives "< 0,1 mm" frem for ingenting, når risikoen er mindst 40 % og mængden runder til nul; ellers ville rækken vise "100 %" og intet andet og læses som en selvmodsigelse. To størrelser i samme bane blev prøvet først og forkastet — forskellige skalaer i samme form gav spørgsmålet "hvor mange procent af hvad?", som visningen ikke kunne besvare. Rækken rummer desuden vejrtypen i ord — ikoner alene er tvetydige — og vindstød, når de ligger mindst 3 m/s over middelvinden. Risikobanen er rækkens fleksible element og optager den overskydende bredde, så der ikke opstår et hul: en længere bane er lettere at aflæse. Tekstkolonnen har til gengæld fast bredde, så banen bliver præcis lige lang i alle rækker og længderne kan sammenlignes fra time til time — med `auto`-bredde skubbede en lang tekst banen kortere. Timer med nedbør får en blå kant, nattetimer en svag tone. Listen viser 12 timer med en knap til hele vinduet, og oversigtsgrafen øverst fylder bredden uden vandret scroll. Grafens kurve farves af samme rampe som rækkernes toner, blot i fuld styrke, så linjen skifter farve time for time i stedet for at være ensfarvet. Signaturen nederst viser hele rampen som ét bånd frem for løsrevne prikker — rækkefølgen er selve pointen. Midtpunktet er en mellemgrå frem for palettens næsten hvide, som ville forsvinde på en tynd streg. Natfelter skriver selv "Nat" og tidsrummet mellem solnedgang og solopgang, så den grå blok ikke skal gættes.

**Kvartersnedbør** — `minutely_15` viser de næste to timer i 15-minutters trin. Open-Meteo leverer kun ægte kvartersdata, hvor en højopløst model dækker; ellers er tallene interpoleret fra timeprognosen og siger intet nyt. Striben sammenligner derfor kvartersværdierne med timenedbøren fordelt jævnt, og vises kun når afvigelsen er reel (`shapeNowcast`).

**Prognosesikkerhed** — afsnittet svarer på to forskellige spørgsmål med hver sin visning. De fire farvede linjer er nationale centres deterministiske bud, og markeringen viser den time, hvor de er mest uenige — altså strukturel uenighed mellem uafhængige beregninger. Det tonede felt er derimod ECMWF's ensemble: p10–p90 af ~51 kørsler, så 80 % af dem ligger inden i feltet. Kun ensemblet giver en egentlig sandsynlighed, fordi medlemmerne er indbyrdes ombyttelige; "3 af 4 modeller" er ikke 75 %. Regnrækken viser derfor andelen af ensemble-kørsler med nedbør, når ensemblet kan hentes, og ellers antallet af de fire modeller.

**Nedbørssandsynligheden har én kilde.** Både Time for time og Prognosesikkerhed viser hovedprognosens `precipitation_probability`, slået op på tidsstemplet, så de to afsnit ikke kan vise forskellige tal for samme time. Det var de før: Prognosesikkerhed talte selv ensemble-medlemmer med mindst 0,2 mm, hvilket gav 0 % hvor hovedprognosen sagde 56 %. Ensemblet bruges nu kun til temperaturbåndet, hvor det er den eneste kilde. Falder hovedprognosens sandsynlighed bort, viser rækken i stedet antallet af de fire modeller med nedbør — og siger det.

Markøren bliver bevidst ved modellernes uenighed frem for ensemblets spredning: sidstnævnte vokser pr. definition med prognoselængden og ville derfor altid udpege den sidste time i vinduet.

Bemærk at `dmi_seamless` kun er DMI's egen Harmonie de første ~2,5 døgn; derefter syr Open-Meteo ECMWF IFS på. Sammenligningens vindue er 48 timer (`MODEL_HOURS`) netop for at blive inden for det, hvor DMI og ECMWF stadig er uafhængige kilder.

**Terrasse** — vandingsbehovet er `ET₀ × southFactor − nedbør × shelterFactor`:

| Antagelse | Standard | Betydning |
| --- | --- | --- |
| `southFactor` | 1,25 | Fuld sydsol fordamper mere end referencefladen i ET₀ |
| `shelterFactor` | 0,55 | Hvor stor en del af regnen der reelt rammer potterne i læ |
| `potArea` | 0,049 m² | En 25 cm potte — bruges til ml pr. potte |

Konstanterne står øverst i `assets/app.js` under `TERRACE` og bør justeres efter din terrasse:
står potterne under et halvtag, sænk `shelterFactor`; er terrassen delvist skygget om eftermiddagen,
sænk `southFactor`. "Sol på terrassen" tælles som timer mellem kl. 08 og 19 med indstråling over
120 W/m². Varslinger udløses ved frost (min. ≤ 2 °C), varme (maks. ≥ 28 °C eller UV ≥ 7),
vindstød ≥ 14 m/s og kraftig nedbør ≥ 15 mm.

**Luft og pollen** — luftkvalitetsindekset følger EEA-skalaen (god ≤ 20, rimelig ≤ 40, moderat ≤ 60, ringe ≤ 80, meget ringe ≤ 100, derover ekstremt ringe). Hvert enkelt stof vurderes på samme skala via EEA's del-indeks, så et tal som "88 µg/m³ ozon" kan læses uden at kende grænseværdierne. Rækkefølgen er: Open-Meteos egne del-indeks hentes i et separat kald og bruges, når de er tilgængelige; kan de ikke hentes, placeres stoffet efter denne tabel i `AQ_SUB`:

| Stof | God | Rimelig | Moderat | Ringe | Meget ringe |
| --- | --- | --- | --- | --- | --- |
| PM2,5 (24-t snit) | < 10 | < 20 | < 25 | < 50 | < 75 |
| PM10 (24-t snit) | < 20 | < 40 | < 50 | < 100 | < 150 |
| Ozon (time) | < 50 | < 100 | < 130 | < 240 | < 380 |
| NO₂ (time) | < 40 | < 90 | < 120 | < 230 | < 340 |

Det separate kald er bevidst adskilt fra hovedkaldet: et ukendt variabelnavn ville ellers give 400 på hele luftafsnittet i stedet for blot at falde tilbage på tabellen. Pollen måles i korn pr. m³ og inddeles i fire trin pr. art, fordi arterne har vidt forskellige niveauer: træpollen (el, birk) ved 1/10/50/500, græs ved 1/5/20/200 og urter (bynke, ambrosia) ved 1/5/20/100. Trinene er de gængse europæiske grænser og er omtrentlige — de er ikke en klinisk skala, og din egen tærskel kender du bedst. Arter uden for sæson nævnes samlet i stedet for at fylde med nuller. Er luften eller pollental forhøjet, nævnes det også direkte på udendørs-kortet.

Tallene er vejledende — en prognose er en prognose, og din terrasse kender du bedre end modellen.

## Filer

```
index.html          markup og sektioner
assets/styles.css   design-tokens, lyst/mørkt tema, responsivt layout
assets/app.js       datahentning, scoring, rendering, demo-data
```
