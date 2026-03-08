# CA Building Difficulty Index

Field intelligence report on regulatory friction across California's 58 counties and 130+ cities.
Built in the [Nuclear Barbarians](https://nuclearbarbarians.substack.com) design language — Frazetta × Ferriss × Pope.

**Live data sources:**
- HCD Annual Progress Reports (APR)
- SB 35 / Housing Element compliance status
- RHNA progress tracking
- City/county fee schedule scraper (480+ jurisdictions)

---

## Deploy in 60 seconds

### Vercel (recommended)
```bash
npm i -g vercel
npm install
vercel
```
Or: [vercel.com/new](https://vercel.com/new) → import this repo → Deploy.

### Netlify (drag & drop)
```bash
npm install && npm run build
```
Drag the `dist/` folder to [app.netlify.com/drop](https://app.netlify.com/drop).

### GitHub Pages (auto-deploy on push)
1. Push this repo to GitHub
2. **Settings → Pages → Source → GitHub Actions**
3. The `.github/workflows/deploy.yml` handles everything from there

---

## Local development
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle → dist/
npm run preview  # serve dist/ locally
```

---

## Loading fee scraper data

After deploying, click **"📂 Load Fee Data"** in the header to upload
`output/results.json` from the [CA Fee Scraper](https://github.com/YOUR_USERNAME/ca-fee-scraper).
Data is processed entirely in the browser — nothing leaves your machine.

---

## Project structure
```
├── index.html
├── vite.config.js
├── package.json
├── vercel.json
├── netlify.toml
├── .github/workflows/deploy.yml
└── src/
    ├── main.jsx
    └── App.jsx          ← full application (~1500 lines)
```

---

*For Crom and Country.*
