import * as THREE from "three";
import { loadElevation, toWorld } from "./geo.js";
import { createScene } from "./scene.js";
import { createStreetView } from "./streetview.js";
import { POIS, CHAPTERS } from "./data.js";

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);
const $ = (s) => document.querySelector(s);

// ── Smooth scrolling ─────────────────────────────────────────
const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
lenis.stop();

// ── Boot ─────────────────────────────────────────────────────
gsap.to("#loader .bar i", { scaleX: 0.6, duration: 1.2, ease: "power2.out" });
const elev = await loadElevation("assets/elevation.png");
const world = createScene($("#scene"), elev);
const { camera } = world;

const sv = createStreetView({
  panoEl: $("#sv-pano"), fallbackEl: $("#sv-fallback"), cardsEl: $("#sv-cards"),
  titleEl: $(".sv-title"), tagEl: $(".sv-tag"), bgEl: $(".sv-bg"), elev,
});
$("#sv-fallback").innerHTML = `<div class="fb-grid"></div><p class="fb-msg"></p>`;

// ── Camera keyframes for each scroll chapter ────────────────
function keyframe(ch) {
  if (ch.overview) return { px: -3.2, py: 5.2, pz: 8.4, tx: 0, ty: 0, tz: 0.6 };
  if (ch.top) return { px: 0.6, py: 11.5, pz: 2.9, tx: 0.6, ty: 0, tz: 0.35 };
  const w = toWorld(ch.lat, ch.lng), y = elev.height(ch.lat, ch.lng);
  return {
    px: w.x + Math.sin(ch.angle) * ch.dist, py: y + ch.height, pz: w.z + Math.cos(ch.angle) * ch.dist,
    tx: w.x, ty: y, tz: w.z,
  };
}
const frames = CHAPTERS.map(keyframe);
const routeAt = CHAPTERS.map((ch, i) =>
  ch.overview ? 0 : ch.top || i === CHAPTERS.length - 2 ? 1 : world.routeT(ch.lat, ch.lng));

const cam = { ...frames[0], route: 0 };     // driven by scroll
const view = { ...frames[0] };              // what the camera actually shows (scroll or dive)
let mode = "scroll";
const intro = { k: 1 };                     // 1 = camera far away (intro), 0 = normal

const tl = gsap.timeline({
  defaults: { ease: "power1.inOut", duration: 1 },
  scrollTrigger: { trigger: "#story", start: "top top", end: "bottom bottom", scrub: 1.2 },
});
frames.slice(1).forEach((f, i) => tl.to(cam, { ...f, route: routeAt[i + 1] }, i));

// ── HTML pins projected from 3D ─────────────────────────────
const pinsEl = $("#pins");
const pins = POIS.map((poi) => {
  const anchor = world.addPoi(poi);
  const el = document.createElement("button");
  el.className = "pin";
  el.type = "button";
  el.innerHTML = `<span class="dot"></span><span class="label"><b>${poi.name}</b><small>${poi.tag}</small></span>`;
  el.addEventListener("click", () => dive(poi, anchor));
  el.addEventListener("pointerenter", () => sv.warmUp());
  pinsEl.append(el);
  return { el, anchor, poi };
});
const v3 = new THREE.Vector3();

function placePins() {
  const W = innerWidth, H = innerHeight;
  for (const p of pins) {
    v3.copy(p.anchor).project(camera);
    const behind = v3.z > 1;
    const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
    const dist = camera.position.distanceTo(p.anchor);
    p.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${Math.max(0.6, Math.min(1.2, 3 / dist))})`;
    p.el.classList.toggle("hidden", behind || x < -50 || x > W + 50 || y < -50 || y > H + 50);
  }
}

// ── Mouse parallax ───────────────────────────────────────────
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener("pointermove", (e) => {
  mouse.x = e.clientX / innerWidth - 0.5;
  mouse.y = e.clientY / innerHeight - 0.5;
});

// ── Render loop ──────────────────────────────────────────────
const clock = new THREE.Clock();
gsap.ticker.add(() => {
  const t = clock.getElapsedTime();
  if (mode === "scroll") Object.assign(view, cam);
  mouse.sx += (mouse.x - mouse.sx) * 0.05;
  mouse.sy += (mouse.y - mouse.sy) * 0.05;
  const par = mode === "scroll" ? 0.35 : 0;
  camera.position.set(
    view.px + mouse.sx * par - 3 * intro.k,
    view.py - mouse.sy * par * 0.6 + 9 * intro.k,
    view.pz + 6 * intro.k);
  camera.lookAt(view.tx, view.ty, view.tz);
  world.routeProgress.value = cam.route;
  world.tick(t);
  placePins();
});

// ── Scroll-driven 3D text ────────────────────────────────────
function splitLetters(el) {
  // letters animate individually, words stay together when the line wraps
  el.innerHTML = el.textContent.split(" ")
    .map((w) => `<span class="word">${[...w].map((c) => `<span class="ch">${c}</span>`).join("")}</span>`)
    .join(" ");
  return el.querySelectorAll(".ch");
}
const heroLetters = splitLetters($(".hero .title3d"));

// Fly through the hero title as you scroll
gsap.to(".hero > *", {
  z: 600, rotateX: 25, opacity: 0, stagger: 0.05, ease: "power2.in",
  scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
});

document.querySelectorAll(".chapter .panel").forEach((panel) => {
  const fromRight = panel.closest(".right");
  gsap.timeline({
    scrollTrigger: { trigger: panel.parentElement, start: "top 85%", end: "bottom 15%", scrub: true },
  })
    .fromTo(panel, { rotateY: fromRight ? -55 : 55, z: -400, opacity: 0, filter: "blur(10px)" },
      { rotateY: 0, z: 0, opacity: 1, filter: "blur(0px)", ease: "power3.out", duration: 1 })
    .to(panel, { rotateY: fromRight ? 30 : -30, z: -300, opacity: 0, filter: "blur(8px)", ease: "power2.in", duration: 0.7 }, 1.6);
});

const exploreLetters = splitLetters($(".explore .title3d"));
gsap.fromTo(exploreLetters, { rotateX: -90, z: -300, opacity: 0 }, {
  rotateX: 0, z: 0, opacity: 1, stagger: 0.06, ease: "expo.out",
  scrollTrigger: { trigger: ".explore", start: "top 70%", end: "top 20%", scrub: 1 },
});
ScrollTrigger.create({
  trigger: ".explore", start: "top 60%",
  onToggle: (s) => document.body.classList.toggle("exploring", s.isActive),
});

// Highlight the pin that belongs to the current chapter
const chapterPoi = { 1: "sofia", 2: "blagoevgrad", 3: "kresna", 4: "melnik", 5: "sandanski" };
document.querySelectorAll(".chapter").forEach((sec) => {
  ScrollTrigger.create({
    trigger: sec, start: "top center", end: "bottom center",
    onToggle: (s) => {
      if (!s.isActive) return;
      const id = chapterPoi[sec.dataset.chapter];
      pins.forEach((p) => p.el.classList.toggle("focus", p.poi.id === id));
    },
  });
});

// ── Dive into Street View ────────────────────────────────────
const svEl = $("#sv"), flash = $("#flash");
let saved = null, busy = false;

async function dive(poi, anchor) {
  if (busy || mode !== "scroll") return;
  busy = true;
  mode = "dive";
  lenis.stop();
  saved = { ...view };
  document.body.classList.add("diving");
  world.pulseAt(anchor.x, anchor.z);

  const infoPromise = sv.prepare(poi);           // free metadata lookup, runs during the flight

  // 1. swoop down to the pin
  const tl = gsap.timeline();
  tl.to(view, { tx: anchor.x, ty: anchor.y - 0.05, tz: anchor.z, duration: 0.9, ease: "power2.inOut" })
    .to(view, { px: anchor.x + 0.9, py: anchor.y + 0.9, pz: anchor.z + 1.2, duration: 1.0, ease: "power2.inOut" }, 0)
    .to(view, { px: anchor.x + 0.02, py: anchor.y + 0.05, pz: anchor.z + 0.06, duration: 1.3, ease: "expo.in" })
    .to(camera, { fov: 95, duration: 1.3, ease: "expo.in", onUpdate: () => camera.updateProjectionMatrix() }, "<")
    .to(world.uniforms.uWarp, { value: 1, duration: 1.3, ease: "expo.in" }, "<")
    .to(flash, { opacity: 1, duration: 0.35, ease: "power2.in" }, "-=0.3");

  const [info] = await Promise.all([infoPromise, tl.then()]);

  // 2. reveal Street View from inside the flash
  svEl.classList.add("open");
  svEl.setAttribute("aria-hidden", "false");
  sv.show(poi, info);
  gsap.fromTo(svEl, { opacity: 0, scale: 1.35, filter: "blur(18px) brightness(2)" },
    { opacity: 1, scale: 1, filter: "blur(0px) brightness(1)", duration: 1.6, ease: "expo.out" });
  gsap.to(flash, { opacity: 0, duration: 1.2, ease: "power2.out", delay: 0.15 });
  busy = false;
}

async function surface() {
  if (busy || mode !== "dive") return;
  busy = true;
  await sv.hide();
  await gsap.timeline()
    .to(flash, { opacity: 1, duration: 0.3 })
    .to(svEl, { opacity: 0, scale: 1.2, filter: "blur(14px)", duration: 0.4 }, 0)
    .then();
  svEl.classList.remove("open");
  svEl.setAttribute("aria-hidden", "true");

  // fly back up to where we were
  camera.fov = 45;
  camera.updateProjectionMatrix();
  world.uniforms.uWarp.value = 0;
  const back = gsap.timeline();
  back.to(flash, { opacity: 0, duration: 0.8 })
    .to(view, { ...saved, duration: 1.8, ease: "expo.out" }, 0);
  await back.then();
  document.body.classList.remove("diving");
  mode = "scroll";
  lenis.start();
  busy = false;
}
$("#sv-back").addEventListener("click", surface);
addEventListener("keydown", (e) => { if (e.key === "Escape") surface(); });

// ── Intro ────────────────────────────────────────────────────
await gsap.to("#loader .bar i", { scaleX: 1, duration: 0.4 });
gsap.to("#loader", { opacity: 0, duration: 0.8, onComplete: () => $("#loader").remove() });
gsap.to(intro, { k: 0, duration: 3.2, ease: "expo.out" });
gsap.fromTo(heroLetters, { opacity: 0, rotateX: -100, z: -500, y: 60 },
  { opacity: 1, rotateX: 0, z: 0, y: 0, stagger: 0.035, duration: 1.4, ease: "expo.out", delay: 0.4 });
gsap.from(".hero .kicker, .hero .lead, .scroll-hint", { opacity: 0, y: 30, stagger: 0.15, delay: 1.2, duration: 1 });
lenis.start();
ScrollTrigger.refresh();
