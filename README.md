# c4a-custom-web-app

Demonstration web app built with **[ArcGIS Maps SDK for JavaScript 5.x](https://developers.arcgis.com/javascript/latest/)** (`<arcgis-map>`, `@arcgis/core`). It loads a configurable public Web Map and augments feature popups with data from **[Connect for ArcGIS](https://www.esri.com/arcgis-blog/products/product/announcements/connect-for-arcgis/)** anonymous layer-link queries.

- **REST integration** patterns and typed helpers: [`src/connectClient.ts`](src/connectClient.ts) (+ [`docs/CONNECT-FOR-ARCGIS-API.md`](docs/CONNECT-FOR-ARCGIS-API.md))
- **Optional** rich popup for one named layer link (“SA2 - Working Population”): [`src/connectSa2WorkingPopulationPopup.ts`](src/connectSa2WorkingPopulationPopup.ts)

## Requirements

- Node.js **20+** (CI uses 22)

## Setup

```bash
npm ci
cp .env.example .env   # optional; see Environment
```

### Environment

| Variable | Purpose |
|----------|---------|
| `VITE_ARCGIS_PORTAL` | ArcGIS Portal / ArcGIS Online host (default matches Connect doc: `https://esriau.maps.arcgis.com`) |
| `VITE_WEBMAP_ITEM_ID` | Web Map portal item ID |
| `VITE_CONNECT_BASE` | Connect API root URL (no trailing slash) |

At runtime, **`?portal=https://your.portal.com`** overrides `VITE_ARCGIS_PORTAL` once (see [`src/portal-config.ts`](src/portal-config.ts)).

## Scripts

```bash
npm run dev       # HTTPS dev server (@vitejs/plugin-basic-ssl)
npm run build     # Typecheck + production bundle to dist/
npm run preview   # Serve dist/ locally (HTTPS)
```

## ArcGIS HTTPS note

Maps SDK / portal origin rules often require **HTTPS**. Local dev serves over `https://localhost:5173` (or next free port).

## Deploy to GitHub Pages

This repo includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml). It builds with:

`VITE_BASE_PATH=/<repository-name>/`

so assets resolve under **`https://<user>.github.io/<repo>/`**.

### One-time repository settings

1. **GitHub → Settings → Pages**
2. **Build and deployment**: source **GitHub Actions**.
3. After the first successful workflow run, the site URL appears on the workflow run / Environments page.

### CI environment variables (Actions)

GitHub does **not** inject **Settings → Secrets and variables → Actions → Variables** into the shell automatically. This workflow passes them into the **Build** step under the same names as `.env` (`VITE_*`), and the **build** job uses **Environment** `github-pages` so variables defined on that environment are available as `${{ vars.* }}` too.

| Variable | Where to set | Notes |
|----------|----------------|------|
| `VITE_BASE_PATH` | Optional repo/env var | Defaults to `/<repository-name>/` if unset (project Pages). |
| `VITE_ARCGIS_PORTAL` | Variables | Empty → app uses built-in default portal. |
| `VITE_WEBMAP_ITEM_ID` | Variables | Empty → app uses built-in default Web Map id. |
| `VITE_CONNECT_BASE` | Variables | Empty → app uses built-in Connect AU base URL. |

Use **Variables** (not Secrets) for `VITE_*` values: they are compiled into client-side JavaScript.

### User or organization site (`username.github.io`)

If the repo **is** the special `*.github.io` repository, Pages is served from the domain root (`/`). Edit the workflow **Build** step: set `VITE_BASE_PATH=/` instead of `/${{ github.event.repository.name }}/` (remove the dynamic segment).

Alternatively run production build locally:

```bash
VITE_BASE_PATH=/ npm run build
```

## License

[Apache License 2.0](LICENSE)
