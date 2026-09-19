// Converts lat/lng to 3D world units and samples real elevation.
// assets/elevation.png = 4×4 Terrarium tiles (zoom 9, x 287–290, y 188–191) stitched together.
// Terrarium encoding: metres = R*256 + G + B/256 - 32768

export const BBOX = { w: 22.45, e: 24.05, s: 41.35, n: 42.85 };
const LATC = 42.1, LNGC = 23.25;
const K = 6.6667;                               // world units per degree of latitude
const COS = Math.cos((LATC * Math.PI) / 180);
export const HSCALE = 0.00024;                  // metres → world units (≈4× exaggerated)

const Z = 9, TX0 = 287, TY0 = 188, SIZE = 1024;

export function toWorld(lat, lng) {
  return { x: (lng - LNGC) * COS * K, z: -(lat - LATC) * K };
}

function toPixel(lat, lng) {
  const n = 2 ** Z, r = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n - TX0;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - TY0;
  return [x * 256, y * 256];
}

export async function loadElevation(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const h = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < h.length; i++) {
    h[i] = Math.max(0, d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768);
  }
  const at = (x, y) =>
    h[Math.min(SIZE - 1, Math.max(0, y)) * SIZE + Math.min(SIZE - 1, Math.max(0, x))];

  // Bilinear sample, in metres
  function metres(lat, lng) {
    const [px, py] = toPixel(lat, lng);
    if (px < 0 || py < 0 || px > SIZE - 1 || py > SIZE - 1) return 0;   // outside the data (e.g. the Aegean Sea)
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    const a = at(x0, y0), b = at(x0 + 1, y0), c2 = at(x0, y0 + 1), d2 = at(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c2 * (1 - fx) + d2 * fx) * fy;
  }
  return { metres, height: (lat, lng) => metres(lat, lng) * HSCALE };
}

// ── Directions on the globe ─────────────────────────────────
const R = 6371000; // Earth radius in metres
const rad = (d) => (d * Math.PI) / 180;

// Initial great-circle bearing from a to b, in degrees (0 = north, 90 = east)
export function bearing(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Haversine distance from a to b, in metres
export function distance(a, b) {
  const Δφ = rad(b.lat - a.lat), Δλ = rad(b.lng - a.lng);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 8-point compass in Bulgarian: С, СИ, И, ЮИ, Ю, ЮЗ, З, СЗ
export function compass(deg) {
  return ["С", "СИ", "И", "ЮИ", "Ю", "ЮЗ", "З", "СЗ"][Math.round(deg / 45) % 8];
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} м`;
  return `${(m / 1000).toLocaleString("bg-BG", { maximumFractionDigits: m < 10000 ? 1 : 0 })} км`;
}
