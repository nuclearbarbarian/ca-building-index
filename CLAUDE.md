# CA Building Difficulty Index

## What This Is
A regulatory analysis tool tracking construction friction across California's
58 counties and 120+ cities. Built to make permitting and fee data legible
to policymakers, journalists, and researchers. The thesis: building in California
is unreasonably difficult, and the data should make that visible.

## Architecture
- React 18 + Vite, deployed on GitHub Pages
- Core app logic in `src/App.jsx` (~1500 lines, single-file)
- Fee data scraped by `scraper/scrape.js` -> bundled in `src/data/feeData.json`
- Live data from HCD API (`data.ca.gov`) — APR, SB 35, RHNA datasets
- County GeoJSON fetched at runtime from `gis.data.ca.gov` (EPSG:3857 Web Mercator)
- City dots use WGS84 lat/lon hardcoded in `CITY_GEO` array
- All data processing is client-side — nothing leaves the user's machine
- Fee data also persisted to localStorage so it survives page refresh

## Visual Design: Penney Design System
1940s trade journal aesthetic — period-accurate revival. Design tokens live in the
`NB` object at the top of App.jsx. Key rules:
- No modern UI chrome (no rounded corners, no gradients, no shadows)
- Typography: Source Serif 4 (body), IBM Plex Mono (data/labels)
- Palette: newsprint backgrounds, ink-black text, industrial red for danger, utility blue for live data
- Keep the vintage aesthetic consistent across all new components

## Data Sources
- **HCD Annual Progress Reports (APR):** housing permits by jurisdiction and year
- **SB 35 / Housing Element compliance:** streamlining eligibility status
- **RHNA progress:** Regional Housing Needs Allocation tracking
- **Fee scraper:** construction fees for 480+ jurisdictions (121 cities with detailed data)

## Data Integrity Rules
- Every data point must be traceable to a source
- Never interpolate or estimate missing data without flagging it visually
- When scraping, log which jurisdictions returned errors or missing data
- Display "last updated" dates on all data-dependent visualizations
- Add source and date metadata to every data file
- If a data point seems like an outlier, flag it — don't silently smooth it away

## Conventions
- Keep code simple: fewer lines > more lines. Strip anything non-essential.
- When adding a new data source, follow the fee scraper pattern: standalone script -> JSON output with metadata
- Don't add dependencies unless absolutely necessary (currently only react + react-dom)
- New features should serve the analytical narrative: making regulatory friction visible
- Prefer clarity over cleverness in data presentation

## Known Issues
- **EPSG:3857 bug:** CA GIS endpoint returns Web Mercator meters, not WGS84 degrees.
  `merc2ll()` converter in `ringToPath` fixes county map alignment with city dots.
  Do not remove this converter.
- **Legend position:** Gradient legend is at `translate(10,595)` (bottom-left).
  If it looks wrong after deploy, it's a stale GitHub Pages cache — hard refresh fixes it.
- **Fee data persistence:** localStorage init/save/clear keeps scraper data across page refresh.
  The app also bundles default fee data from `src/data/feeData.json`.
- **Single-file complexity:** App.jsx is ~1500 lines. When it needs to be split,
  plan the component split first and get approval before refactoring.

## When Reviewing for Publication
Use the three-pass adversarial review:
1. **The Critic:** What are the weakest claims? Where is the data ambiguous?
2. **The Defender:** Which objections are legitimate vs. nitpicking?
3. **The Judge:** What must be fixed before publishing, and what's an acknowledged limitation?
