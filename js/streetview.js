// Google Street View + floating 3D cards placed at the real direction of each landmark.
//
// FREE-TIER NOTES
//  • Only the Maps JavaScript API is used. No Map object is created, so there are no "Dynamic Maps" charges.
//  • Street View *metadata* lookups (StreetViewService.getPanorama) are free.
//  • Google bills "Dynamic Street View" per StreetViewPanorama *instantiation*. We create ONE panorama the
//    first time you click a place and reuse it with setPano() for every other place, so one visit to the
//    site = one billable event, however many places you open.
//  • The API script is only loaded when you first hover/click a place, not on page load.

import { bearing, distance, compass, formatDistance } from "./geo.js";

const gsap = window.gsap;
const wikiCache = new Map();
const DEG = Math.PI / 180;

export function createStreetView({ panoEl, fallbackEl, cardsEl, titleEl, tagEl, bgEl, elev }) {
  const key = (window.APP_CONFIG?.GOOGLE_MAPS_API_KEY || "").trim();
  let apiPromise = null;
  let lib = null;
  let panorama = null;
  let active = false;
  let cards = [];
  let currentPoi = null;
  let cam = null;            // where the Street View camera stands: { lat, lng }
  let baseHeading = 0;       // direction the view first turns to
  let authFailed = false;

  // Used when there's no Street View (no key, or no coverage): drag to look around a holographic void
  const virtual = { heading: 0, pitch: 0, zoom: 1 };
  let usingVirtual = false;

  window.gm_authFailure = () => { authFailed = true; };

  function loadApi() {
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      window.__gmReady = resolve;
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=bg&region=BG&loading=async&callback=__gmReady`;
      s.async = true;
      s.onerror = reject;
      document.head.append(s);
    }).then(async () => {
      lib = await google.maps.importLibrary("streetView");
    });
    return apiPromise;
  }

  // Find the nearest panorama (free metadata request).
  async function prepare(poi) {
    if (!key) return { ok: false, reason: "Добави своя Google Maps API ключ в js/config.js, за да видиш Street View тук." };
    try {
      await loadApi();
      const service = new lib.StreetViewService();
      const location = poi.sv || { lat: poi.lat, lng: poi.lng };
      // Prefer official Google Street View imagery (fast, reliable tiles). Only fall back to
      // user-uploaded photo spheres if there's no official coverage nearby.
      let data = null;
      const attempts = [
        [lib.StreetViewSource.GOOGLE, 100], [lib.StreetViewSource.GOOGLE, 600], [lib.StreetViewSource.GOOGLE, 2500],
        [lib.StreetViewSource.DEFAULT, 1000],
      ];
      for (const [source, radius] of attempts) {
        try {
          ({ data } = await service.getPanorama({
            location, radius,
            preference: lib.StreetViewPreference.NEAREST,
            sources: [source],
          }));
          break;
        } catch { /* try the next option */ }
      }
      if (!data) return { ok: false, reason: "Все още няма Street View близо до това място." };
      const ll = data.location.latLng;
      return { ok: true, pano: data.location.pano, cam: { lat: ll.lat(), lng: ll.lng() } };
    } catch (e) {
      console.warn(e);
      return { ok: false, reason: "Google Street View не можа да се зареди. Провери API ключа и ограниченията му." };
    }
  }

  function show(poi, info) {
    active = true;
    currentPoi = poi;
    cam = info.ok ? info.cam : { lat: poi.lat, lng: poi.lng };

    // Turn to face the main landmark: an explicit heading, the `look` point, or the first card with coordinates.
    const target = poi.look || poi.cards.find((c) => c.lat != null);
    baseHeading = poi.heading ?? (target ? bearing(cam, target) : 0);

    const startPov = { heading: baseHeading - 55, pitch: -14 };
    const endPov = { heading: baseHeading, pitch: 4 };

    usingVirtual = !info.ok || authFailed;
    fallbackEl.hidden = !usingVirtual;
    panoEl.style.visibility = usingVirtual ? "hidden" : "visible";

    if (usingVirtual) {
      fallbackEl.querySelector(".fb-msg").textContent = info.reason || "Street View не е наличен.";
      Object.assign(virtual, startPov, { zoom: 1 });
      gsap.to(virtual, { ...endPov, duration: 2.4, ease: "power3.out" });
    } else {
      if (!panorama) {
        panorama = new lib.StreetViewPanorama(panoEl, {
          pano: info.pano, pov: startPov, zoom: 1,
          addressControl: false, fullscreenControl: false, motionTracking: false, motionTrackingControl: false,
          showRoadLabels: false, zoomControl: false, panControl: false, enableCloseButton: false,
        });
        // When you walk to another spot (click the arrows), recompute every card's direction and distance.
        panorama.addListener("position_changed", () => {
          const p = panorama.getPosition();
          if (!active || !p) return;
          cam = { lat: p.lat(), lng: p.lng() };
          placeCards();
        });
      } else {
        panorama.setPano(info.pano);
        panorama.setPov(startPov);
        panorama.setZoom(1);
      }
      const p = { ...startPov };
      // pass a clean object: GSAP adds a hidden "_gsap" field that Google rejects
      gsap.to(p, { ...endPov, duration: 2.6, ease: "power3.out", onUpdate: () => panorama.setPov({ heading: p.heading, pitch: p.pitch }) });
    }

    // HUD: huge 3D title
    bgEl.textContent = poi.bg;
    tagEl.textContent = poi.tag;
    titleEl.innerHTML = poi.name.split(" ")
      .map((w) => `<span class="word">${[...w].map((ch) => `<span class="ch">${ch}</span>`).join("")}</span>`)
      .join(" ");
    gsap.fromTo(titleEl.querySelectorAll(".ch"),
      { opacity: 0, rotateX: -95, z: -300, y: 40 },
      { opacity: 1, rotateX: 0, z: 0, y: 0, duration: 1.2, ease: "expo.out", stagger: 0.04, delay: 0.5 });
    gsap.fromTo(bgEl, { opacity: 0, scale: 1.4, z: -400 }, { opacity: 1, scale: 1, z: 0, duration: 2, ease: "expo.out", delay: 0.3 });
    gsap.fromTo(tagEl, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, delay: 1 });

    buildCards(poi);
    placeCards();
    requestAnimationFrame(loop);
  }

  function buildCards(poi) {
    cardsEl.innerHTML = "";
    cards = poi.cards.map((c, i) => {
      const el = document.createElement("article");
      el.className = "card";
      el.innerHTML = `
        <div class="card-inner">
          <div class="card-img"><img alt="" /></div>
          <div class="card-body">
            <div class="card-meta"><span class="card-idx">${String(i + 1).padStart(2, "0")}</span><span class="card-dir"></span></div>
            <h3>${c.title}</h3><p>${c.text}</p></div>
        </div>`;
      const edge = document.createElement("div");
      edge.className = "edge";
      const lead = document.createElement("div");
      lead.className = "leader";
      cardsEl.append(lead, el, edge);

      const img = el.querySelector("img");
      const setImg = (src, fallback) => {
        if (!src) return;
        img.onload = () => el.classList.add("has-img");
        img.onerror = () => { if (fallback && img.src !== fallback) img.src = fallback; };
        img.src = src;
      };
      if (c.img) setImg(c.img); else wikiImage(c.wiki).then((w) => w && setImg(w.big, w.small));
      gsap.fromTo(el.querySelector(".card-inner"),
        { opacity: 0, rotateY: i % 2 ? 70 : -70, z: -500, filter: "blur(12px)" },
        { opacity: 1, rotateY: 0, z: 0, filter: "blur(0px)", duration: 1.4, ease: "expo.out", delay: 1.1 + i * 0.18 });
      return { data: c, el, edge, lead, dirEl: el.querySelector(".card-dir"), heading: 0, shown: 0, pitch: 0 };
    });
  }

  // Work out where each card belongs in the 360° view, from the landmark's real coordinates.
  function placeCards() {
    const camH = elev.metres(cam.lat, cam.lng);
    for (const c of cards) {
      const d = c.data;
      if (d.lat != null) {
        const dist = distance(cam, d);
        c.heading = bearing(cam, d);
        // Look up at the landmark: height difference (+ ~12 m so buildings sit above the horizon) over distance.
        const rise = elev.metres(d.lat, d.lng) - camH + 12;
        c.pitch = Math.min(8, Math.max(-3, Math.atan2(rise, dist) / DEG));
        c.dirEl.textContent = `${formatDistance(dist)} · ${compass(c.heading)}`;
        c.edgeLabel = `${d.title} · ${formatDistance(dist)}`;
      } else {
        // "You are here" card: no coordinates; by default 45° right of the main landmark
        c.heading = (baseHeading + (d.dh ?? 45) + 720) % 360;
        c.pitch = d.pitch ?? 2;
        c.dirEl.textContent = "Тук сте";
        c.edgeLabel = d.title;
      }
    }
    // Cards pointing (almost) the same way would overlap. Group neighbours closer than 22° into
    // clusters and fan each cluster out side by side around its average direction. Every card keeps a
    // leader line down to the landmark's true direction (c.heading), so the directions stay exact.
    const GAP = 22;
    const sorted = [...cards].sort((a, b) => a.heading - b.heading);
    const clusters = [];
    for (const c of sorted) {
      const last = clusters.at(-1);
      if (last && c.heading - last.at(-1).heading < GAP) last.push(c);
      else clusters.push([c]);
    }
    // the circle wraps around: merge the last cluster into the first if they touch across 0°/360°
    if (clusters.length > 1 && clusters[0][0].heading + 360 - clusters.at(-1).at(-1).heading < GAP) {
      const tail = clusters.pop();
      tail.forEach((c) => (c.heading -= 360));
      clusters[0].unshift(...tail);
    }
    for (const group of clusters) {
      const mean = group.reduce((sum, c) => sum + c.heading, 0) / group.length;
      group.forEach((c, i) => (c.shown = mean + (i - (group.length - 1) / 2) * GAP));
    }
  }

  // Project each card's heading/pitch onto the screen using the current Street View camera.
  function loop() {
    if (!active) return;
    const pov = usingVirtual ? virtual : { ...panorama.getPov(), zoom: panorama.getZoom() };
    const W = innerWidth, H = innerHeight;
    const fov = (180 / 2 ** (pov.zoom ?? 1)) * DEG;
    const f = W / 2 / Math.tan(fov / 2);
    const f1 = W / 2;  // focal length at zoom 1 (90°)
    const scale = Math.min(1.7, Math.max(0.55, f / f1)) * (W < 700 ? 0.7 : 1);

    const px = (dh) => W / 2 + f * Math.tan(dh * DEG);          // heading difference → screen x
    const py = (dp) => H / 2 - f * Math.tan(dp * DEG);          // pitch difference → screen y

    for (const c of cards) {
      const dh = wrap(c.shown - pov.heading);                    // where the card is drawn
      const dt = wrap(c.heading - pov.heading);                  // where the landmark really is
      const dp = c.pitch - pov.pitch;
      const x = px(dh);
      const onScreen = Math.abs(dh) < 80 && Math.abs(dt) < 85 && Math.abs(dp) < 70 && x > -150 && x < W + 150;
      c.el.style.opacity = onScreen ? 1 : 0;
      c.lead.style.opacity = onScreen ? 1 : 0;
      c.edge.classList.toggle("show", !onScreen);
      if (onScreen) {
        // landmark point, and the bottom of the card 80px above it
        const tx = px(dt), ty = py(dp);
        const y = ty - 80 * scale;
        c.el.style.transform =
          `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%) rotateY(${dh * 0.55}deg) scale(${scale})`;
        // leader line from the card to the landmark
        const len = Math.hypot(tx - x, ty - y), ang = Math.atan2(ty - y, tx - x);
        c.lead.style.width = `${len}px`;
        c.lead.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${ang}rad)`;
      } else {
        // Off-screen landmark: show a direction arrow on the nearest screen edge.
        const left = dh < 0;
        const y = Math.min(H - 120, Math.max(160, H / 2 - dp * 6 + cards.indexOf(c) * 46));
        c.edge.textContent = left ? `‹ ${c.edgeLabel}` : `${c.edgeLabel} ›`;
        c.edge.style.transform = `translate3d(${left ? 16 : W - 16}px, ${y}px, 0) translate(${left ? 0 : -100}%, -50%)`;
      }
    }
    // slight parallax on the big title
    bgEl.style.translate = `${wrap(baseHeading - pov.heading) * 4}px 0`;
    requestAnimationFrame(loop);
  }

  // Drag-to-look for the virtual (no Street View) mode
  let drag = null;
  fallbackEl.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, h: virtual.heading, p: virtual.pitch }; });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    virtual.heading = drag.h - (e.clientX - drag.x) * 0.15;
    virtual.pitch = Math.max(-60, Math.min(60, drag.p + (e.clientY - drag.y) * 0.12));
    fallbackEl.style.setProperty("--h", virtual.heading);
    fallbackEl.style.setProperty("--p", virtual.pitch);
  });
  addEventListener("pointerup", () => { drag = null; });

  function hide() {
    gsap.to(cardsEl.querySelectorAll(".card-inner"), { opacity: 0, z: -400, duration: 0.5, stagger: 0.05, ease: "power2.in" });
    gsap.to(cardsEl.querySelectorAll(".edge, .leader"), { opacity: 0, duration: 0.3 });
    gsap.to(titleEl.querySelectorAll(".ch"), { opacity: 0, rotateX: 90, duration: 0.5, stagger: 0.02 });
    return new Promise((r) => setTimeout(() => { active = false; r(); }, 600));
  }

  return { prepare, show, hide, warmUp: () => key && loadApi().catch(() => {}) };
}

async function wikiImage(title) {
  if (!title) return null;
  if (wikiCache.has(title)) return wikiCache.get(title);
  const p = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const small = j?.thumbnail?.source;
      return small ? { small, big: small.replace(/\/\d+px-/, "/500px-") } : null;
    })
    .catch(() => null);
  wikiCache.set(title, p);
  return p;
}

// Angle difference into -180..180
function wrap(d) {
  return ((((d % 360) + 540) % 360) - 180);
}
