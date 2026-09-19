# Sofia → Sandanski

A scroll-driven 3D journey over a holographic map of South-West Bulgaria. Click a glowing point to dive into Google Street View, where 3D cards with photos float in the scene.

## Run it

Easiest: double-click **`start.bat`**. It starts a local server and opens the site. Keep its window open while you use the site.

Or manually:

The site must be served over `http://`. Double-clicking `index.html` won't work because the browser blocks ES modules and image data on `file://` pages.

```bash
# in this folder, any one of these:
python -m http.server 5173
npx serve . -l 5173
```

Then open http://localhost:5173. In VS Code, the "Live Server" extension works too.

The site runs without a key: the map, the scroll animation and the cards all work, and Street View shows a holographic placeholder instead.

## Deploy (Docker / Render)

The `Dockerfile` packs the site into a tiny nginx image. It listens on `$PORT` (Render sets this automatically; default 10000).

Test locally (Docker Desktop must be running):

```bash
docker build -t sofia-sandanski .
docker run --rm -p 8080:10000 sofia-sandanski
# open http://localhost:8080
```

On Render:
1. Push this folder to a GitHub repository.
2. Render → **New → Web Service** → pick the repo. Render detects the `Dockerfile` automatically.
3. Choose the **Free** instance type → **Create**.
4. Add your Render address (e.g. `https://sofia-sandanski.onrender.com/*`) to the API key's **Website restrictions** in Google Cloud, or Street View won't load there.

Note: free Render web services go to sleep after ~15 min without visitors; the first visit after that takes ~30–60 s to wake up.

## Add Street View (Google, free tier)

1. Go to https://console.cloud.google.com/ and create a project.
2. Go to **APIs & Services → Library** and enable **Maps JavaScript API**. That's the only API this site needs.
3. Go to **APIs & Services → Credentials → Create credentials → API key**.
4. Restrict the key (important):
   - **Application restrictions → Websites**: add `http://localhost:5173/*`, and your real domain later (e.g. `https://yourname.github.io/*`).
   - **API restrictions**: allow only **Maps JavaScript API**.
5. Paste the key into `js/config.js`.

Google asks for a billing account (a card) even when you only use the free tier. To make sure you're never charged:

- Go to **Billing → Budgets & alerts** and create a small budget (e.g. 1 €) with email alerts.
- Go to **APIs & Services → Maps JavaScript API → Quotas & system limits** and lower the daily request limits. Then even if someone copies your key, usage stops before it costs anything.

### Why this stays inside the free tier

| What the site does | Cost |
|---|---|
| 3D map and terrain | **Free.** It's rendered with three.js from open elevation data, so there are no Google map loads. |
| Finding the nearest panorama (`StreetViewService.getPanorama`) | **Free.** Street View metadata requests have no charge. |
| Showing Street View | **1 "Dynamic Street View" event per visit.** One panorama is created on the first click and reused for every other place. |
| Loading the Google script | Only happens when you first hover or click a place. |
| Photos on the cards | **Free.** They come from the Wikipedia API, with no key. |

Google gives every Maps SKU a monthly number of free events. Check the current Dynamic Street View cap here: https://developers.google.com/maps/billing-and-pricing/pricing. A school project will use a tiny fraction of it.

## How it works

Every algorithm (projections, shaders, splines, camera math, Street View anchoring) is explained in [ALGORITHMS.md](ALGORITHMS.md).

## Customise

- **Places, texts, photos:** `js/data.js`. Each card has a `wiki` article for its photo. To use your own photo, add `img: "assets/photos/x.jpg"` instead.
- **Card position in Street View:** `dh` is degrees left/right of the landmark and `pitch` is degrees up/down.
- **Camera path while scrolling:** `CHAPTERS` in `js/data.js`. It must match the `<section data-chapter>` blocks in `index.html`.
- **Look of the hologram:** the fragment shader in `js/scene.js` (contour lines, grid, scan band) and the colours in `css/style.css`.

## Files

```
index.html          page structure and scroll chapters
css/style.css       all styling (neon 3D text, cards, pins)
js/config.js        your API key
js/data.js          places, route, river, camera chapters
js/geo.js           lat/lng → 3D coordinates, elevation sampling
js/scene.js         three.js holographic terrain
js/streetview.js    Street View + floating 3D cards
js/main.js          scroll animation, pins, dive transition
assets/elevation.bin  real elevation (SRTM): 1024×1024 heights in metres, Uint16
```

## Credits

- Elevation: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen / AWS Open Data, SRTM)
- Photos: Wikipedia / Wikimedia Commons
- Street View: Google Maps Platform
- Libraries: three.js, GSAP + ScrollTrigger, Lenis
