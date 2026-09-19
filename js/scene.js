// Holographic 3D terrain: real elevation, glowing contour lines, route + river, POI beams.
import * as THREE from "three";
import { BBOX, HSCALE, toWorld } from "./geo.js";
import { ROUTE, RIVER } from "./data.js";

const BG = new THREE.Color("#02050b");

export function createScene(canvas, elev) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = BG;
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);

  const uniforms = {
    uTime: { value: 0 },
    uBg: { value: BG },
    uHScale: { value: HSCALE },
    uPulse: { value: new THREE.Vector2(9999, 9999) },
    uPulseT: { value: 10 },
    uWarp: { value: 0 },
  };

  // ── Terrain mesh ───────────────────────────────────────────
  const SX = 380, SZ = 420;
  const pos = new Float32Array((SX + 1) * (SZ + 1) * 3);
  const uv = new Float32Array((SX + 1) * (SZ + 1) * 2);
  let p = 0, q = 0;
  for (let j = 0; j <= SZ; j++) {
    for (let i = 0; i <= SX; i++) {
      const lat = BBOX.n - (j / SZ) * (BBOX.n - BBOX.s);
      const lng = BBOX.w + (i / SX) * (BBOX.e - BBOX.w);
      const w = toWorld(lat, lng);
      pos[p++] = w.x; pos[p++] = elev.height(lat, lng); pos[p++] = w.z;
      uv[q++] = i / SX; uv[q++] = j / SZ;
    }
  }
  const idx = [];
  for (let j = 0; j < SZ; j++) for (let i = 0; i < SX; i++) {
    const a = j * (SX + 1) + i, b = a + 1, c = a + SX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const terrainMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vPos; varying vec3 vN; varying vec2 vUv;
      void main() {
        vPos = position; vN = normal; vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uHScale, uPulseT, uWarp;
      uniform vec3 uBg; uniform vec2 uPulse;
      varying vec3 vPos; varying vec3 vN; varying vec2 vUv;
      float lineOf(float v) { return 1.0 - min(abs(fract(v - 0.5) - 0.5) / fwidth(v), 1.0); }
      void main() {
        float h = vPos.y / uHScale;
        float t = smoothstep(0.0, 2600.0, h);
        vec3 col = mix(vec3(0.01, 0.04, 0.09), vec3(0.03, 0.22, 0.32), t);
        float l = clamp(dot(normalize(vN), normalize(vec3(-0.6, 0.7, 0.35))), 0.0, 1.0);
        col *= 0.35 + 1.1 * l;

        // contour lines: every 100 m, brighter every 500 m
        col += vec3(0.10, 0.75, 1.00) * lineOf(h / 100.0) * (0.12 + 0.4 * t);
        col += vec3(0.35, 0.95, 1.00) * lineOf(h / 500.0) * (0.35 + 0.5 * t);
        // snow-glow on the highest peaks
        col += vec3(0.6, 0.9, 1.0) * smoothstep(2200.0, 2900.0, h) * 0.35;

        // holographic grid
        vec2 g = vPos.xz / 0.25;
        vec2 gf = abs(fract(g - 0.5) - 0.5) / fwidth(g);
        col += vec3(1.0, 0.25, 0.65) * (1.0 - min(min(gf.x, gf.y), 1.0)) * 0.07;

        // scanning band sweeping north → south
        float scanZ = mod(uTime * 0.9, 16.0) - 8.0;
        col += vec3(0.2, 0.9, 1.0) * exp(-pow((vPos.z - scanZ) * 4.0, 2.0)) * 0.22;

        // click pulse ring
        float r = length(vPos.xz - uPulse);
        col += vec3(0.4, 1.0, 1.0) * exp(-pow((r - uPulseT * 1.5) * 18.0, 2.0)) * max(0.0, 1.0 - uPulseT) * 1.5;

        col += vec3(0.2, 0.8, 1.0) * uWarp * 0.25;

        // fade to background at the edges and far away
        vec2 e = min(vUv, 1.0 - vUv);
        float edge = smoothstep(0.0, 0.14, min(e.x, e.y));
        col = mix(uBg, col, edge);
        float fog = smoothstep(7.0, 18.0, length(cameraPosition - vPos));
        col = mix(col, uBg, fog * 0.85);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, terrainMat));

  // Infinite-looking floor grid below the terrain
  const grid = new THREE.GridHelper(60, 120, 0x0b3a4a, 0x071a26);
  grid.position.y = -0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  // scene.add(grid);

  // ── Glowing lines (route + river) draped on the terrain ─────
  function drape(points, lift) {
    const out = [];
    for (let k = 0; k < points.length - 1; k++) {
      const [la1, ln1] = points[k], [la2, ln2] = points[k + 1];
      for (let s = 0; s < 24; s++) {
        const f = s / 24, lat = la1 + (la2 - la1) * f, lng = ln1 + (ln2 - ln1) * f;
        const w = toWorld(lat, lng);
        out.push(new THREE.Vector3(w.x, elev.height(lat, lng) + lift, w.z));
      }
    }
    const [la, ln] = points[points.length - 1];
    const w = toWorld(la, ln);
    out.push(new THREE.Vector3(w.x, elev.height(la, ln) + lift, w.z));
    return new THREE.CatmullRomCurve3(out, false, "catmullrom", 0.5);   // standard (uniform) Catmull-Rom
  }

  const lineShader = (color, dash) => new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uProgress: { value: 1 }, uColor: { value: new THREE.Color(color) }, uDash: { value: dash } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime, uProgress, uDash; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        if (vUv.x > uProgress) discard;
        float flow = 0.55 + 0.45 * sin((vUv.x * uDash - uTime * 2.0) * 6.2831);
        float head = smoothstep(uProgress - 0.02, uProgress, vUv.x) * 2.0;
        gl_FragColor = vec4(uColor * (flow + head), 1.0);
      }`,
  });

  const routeCurve = drape(ROUTE, 0.012);
  const routeMat = lineShader("#ff4fb0", 60);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(routeCurve, 900, 0.009, 6), routeMat));
  const routeHalo = lineShader("#ff2f8f", 60);
  routeHalo.uniforms.uProgress = routeMat.uniforms.uProgress;
  const halo = new THREE.Mesh(new THREE.TubeGeometry(routeCurve, 900, 0.028, 6), routeHalo);
  halo.material.uniforms.uColor.value.multiplyScalar(0.25);
  scene.add(halo);

  // const riverCurve = drape(RIVER, 0.006);
  // scene.add(new THREE.Mesh(new THREE.TubeGeometry(riverCurve, 700, 0.006, 5), lineShader("#2d8cff", 40)));

  // ── POI beams & ground rings ────────────────────────────────
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: uniforms.uTime },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 2.0) * (0.7 + 0.3 * sin(uTime * 3.0 + vUv.y * 20.0));
      gl_FragColor = vec4(vec3(0.3, 0.95, 1.0) * a, 1.0); }`,
  });
  const beamGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.9, 8, 1, true).translate(0, 0.45, 0);
  const ringGeo = new THREE.RingGeometry(0.035, 0.05, 40).rotateX(-Math.PI / 2);
  const poiAnchors = [];
  function addPoi(poi) {
    const w = toWorld(poi.lat, poi.lng);
    const y = elev.height(poi.lat, poi.lng);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(w.x, y, w.z);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x5ff6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.set(w.x, y + 0.004, w.z);
    scene.add(beam, ring);
    const anchor = new THREE.Vector3(w.x, y + 0.06, w.z);
    poiAnchors.push({ poi, anchor, ring });
    return anchor;
  }

  // ── Floating particles ──────────────────────────────────────
  const N = 1800, pp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pp[i * 3] = (Math.random() - 0.5) * 12;
    pp[i * 3 + 1] = Math.random() * 3;
    pp[i * 3 + 2] = (Math.random() - 0.5) * 14;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: 0x6ff3ff, size: 0.012, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(particles);

  // Route parameter (0..1) closest to a lat/lng — used to sync the drawn route with scroll
  const routeSamples = routeCurve.getSpacedPoints(400);
  function routeT(lat, lng) {
    const w = toWorld(lat, lng);
    let best = 0, bd = Infinity;
    routeSamples.forEach((v, i) => {
      const d = (v.x - w.x) ** 2 + (v.z - w.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best / (routeSamples.length - 1);
  }

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  function tick(t) {
    uniforms.uTime.value = t;
    uniforms.uPulseT.value += 0.012;
    particles.rotation.y = t * 0.01;
    particles.position.y = Math.sin(t * 0.3) * 0.05;
    poiAnchors.forEach(({ ring }, i) => {
      const s = 1 + ((t * 0.8 + i * 0.37) % 1) * 1.6;
      ring.scale.setScalar(s);
      ring.material.opacity = 1 - (s - 1) / 1.6;
    });
    renderer.render(scene, camera);
  }

  function pulseAt(x, z) {
    uniforms.uPulse.value.set(x, z);
    uniforms.uPulseT.value = 0;
  }

  return { renderer, scene, camera, uniforms, tick, addPoi, routeT, routeProgress: routeMat.uniforms.uProgress, pulseAt };
}

