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

Tallene er vejledende — en prognose er en prognose, og din terrasse kender du bedre end modellen.

## Filer

```
index.html          markup og sektioner
assets/styles.css   design-tokens, lyst/mørkt tema, responsivt layout
assets/app.js       datahentning, scoring, rendering, demo-data
```
