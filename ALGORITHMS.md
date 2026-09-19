# How it works: every algorithm in the project

This document explains every algorithm the site uses, in the order the data flows: from raw elevation numbers, to the 3D hologram, to the scroll animation, to the dive into Street View.

---

## 1. Getting real elevation data

### 1.1 Web Mercator tile math (which tiles to download)
Online maps cut the world into square 256×256-pixel **tiles**. At zoom level `z` the world is `2^z × 2^z` tiles. To find the tile containing a point:

```
x_tile = (lng + 180) / 360 × 2^z
y_tile = (1 − ln(tan φ + 1/cos φ) / π) / 2 × 2^z        (φ = latitude in radians)
```

The `y` formula is the **Mercator projection**. It stretches the map vertically near the poles so that shapes stay correct. I used it once, while building the site, to see that zoom 9, tiles x = 287…290 and y = 188…191, covers South-West Bulgaria. Those 16 tiles were downloaded and stitched into one 1024×1024 image.

### 1.2 Terrarium decoding (colour → metres)
The tiles don't store a picture. They store **heights hidden in the colour channels**. Each pixel's red, green and blue values are one number split into three bytes:

```
height (m) = R × 256 + G + B / 256 − 32768
```

`R×256 + G` gives whole metres (0–65535), `B/256` adds fractions of a metre, and `−32768` allows heights below sea level.

This decoding is done **once, while building the site**, not in the browser. A small script reads the PNG's raw bytes itself: it unzips the pixel data (PNGs are compressed with *deflate*) and undoes PNG's per-row **filters**, where each byte is stored as a difference from its left or upper neighbour. It then applies the formula to every pixel and saves the million heights as plain numbers in `assets/elevation.bin` (2 bytes per height, *Uint16*, little-endian).

**Why not decode the PNG in the browser?** The first version did: it drew the PNG on a hidden `<canvas>` and read the pixels back. On phones the terrain came out full of spikes. The PNG carried colour-profile tags (`sRGB`, `gAMA`), so phone browsers colour-corrected it, and some privacy features add random noise to canvas reads. For a normal photo that's invisible, but here a change of just 1 in the red channel means **256 m** of height. A raw number file can't be colour-corrected, so every device gets identical heights.

In the browser, `loadElevation` in [js/geo.js](js/geo.js) downloads the file and reads it with a `DataView` (`getUint16(i × 2, true)`, where `true` means little-endian) into a `Float32Array`.

### 1.3 Latitude/longitude → pixel
The same Mercator formula from 1.1 turns any lat/lng into an exact (fractional) position inside that 1024×1024 grid (`toPixel` in [js/geo.js](js/geo.js)).

### 1.4 Bilinear interpolation (heights between pixels)
A coordinate usually lands *between* four pixels. Taking just the nearest one would make the terrain look like stairs. Bilinear interpolation blends the four neighbours by distance:

```
top    = a·(1−fx) + b·fx
bottom = c·(1−fx) + d·fx
height = top·(1−fy) + bottom·fy
```

`fx` and `fy` are the fractional parts (0…1) of the pixel position. This is `metres()` in [js/geo.js](js/geo.js).

---

## 2. Building the 3D world

### 2.1 Map projection: lat/lng → 3D coordinates
One degree of latitude is always ~111 km. One degree of longitude gets shorter as you go north, by a factor of `cos(latitude)`. At 42°N it's only ~82 km. So:

```
x = (lng − 23.25) × cos(42.1°) × K
z = −(lat − 42.1) × K                 (K = 6.667 units per degree, north = −z)
y = height_in_metres × 0.00024
```

This is an **equirectangular projection** corrected at the region's centre. It's accurate enough over 180 km. The height scale is about **4× vertical exaggeration**, so the mountains read clearly from above (`toWorld` in [js/geo.js](js/geo.js)).

### 2.2 Terrain mesh: grid triangulation
The terrain is a grid of 381 × 421 vertices (~160,000 points), each lifted to its real height. Every little square of the grid is split into **two triangles**. With corners `a b / c d`, the triangles are `(a, c, b)` and `(b, c, d)`. The vertex order is always counter-clockwise, so the GPU knows which side faces up. See `createScene` in [js/scene.js](js/scene.js).

### 2.3 Vertex normals
A **normal** is an arrow pointing straight out of the surface. It's needed for lighting. For each triangle, the normal is the **cross product** of two of its edges, `(B − A) × (C − A)`. Each vertex then averages the normals of all triangles touching it, which makes the shading smooth. three.js does this in `computeVertexNormals()`.

---

## 3. The hologram shader (runs on the graphics card)

The terrain colour is computed per pixel by a small GPU program (the fragment shader in [js/scene.js](js/scene.js)). It runs for every pixel, 60 times a second, in parallel.

### 3.1 Height colouring
`t = smoothstep(0, 2600, height)` maps height to 0…1 with a soft S-curve. The colour is then mixed from deep navy (valleys) to teal (peaks) with `mix(low, high, t)`, which is **linear interpolation**.

### 3.2 Lambert (diffuse) lighting
`brightness = max(0, N · L)`, the **dot product** of the surface normal `N` and the light direction `L`. Slopes facing the light are bright and slopes facing away are dark. This is what makes the relief look 3D.

### 3.3 Contour lines: `fract` + `fwidth` anti-aliasing
To draw a line every 100 m:

```
v    = height / 100
dist = |fract(v − 0.5) − 0.5|         → 0 exactly on a multiple of 100 m
line = 1 − min(dist / fwidth(v), 1)
```

`fract` repeats the pattern forever. `fwidth(v)` measures how much `v` changes between neighbouring **screen pixels**. Dividing by it keeps the line **exactly ~1 pixel wide at any zoom**, with no flicker. This technique is called *screen-space derivative anti-aliasing*. The same trick draws the brighter 500 m lines and the pink ground grid (in x and z instead of height).

### 3.4 Scanning band: Gaussian function
`glow = exp(−((z − scanZ) × 4)²)` is a **Gaussian bell curve**: bright at `scanZ` and fading smoothly on both sides. `scanZ = mod(time × 0.9, 16) − 8` moves it from north to south and wraps around.

### 3.5 Click pulse: an expanding Gaussian ring
`r = distance(pixel, clickPoint)`. The ring is `exp(−((r − radius) × 18)²)` with `radius = time_since_click × 1.5`. It's a Gaussian around a growing circle, multiplied by `(1 − time)` so it fades out.

### 3.6 Edge fade and fog
The terrain fades into the background near its borders (`smoothstep` on the distance to the edge of the UV square) and with distance from the camera (**linear fog**). That hides the fact that the map is a finite rectangle.

---

## 4. Route and river lines

### 4.1 Densifying and draping
The route is ~30 hand-picked lat/lng points: Sofia → Blagoevgrad along the Struma motorway, through the Kresna Gorge, past Sandanski to Melnik, and back to Sandanski. Between every two points, 24 extra points are added by **linear interpolation**. Each one gets the terrain height + a small lift, so the line **hugs the mountains** instead of cutting through them (`drape` in [js/scene.js](js/scene.js)).

### 4.2 Catmull-Rom spline
The points are joined with a **Catmull-Rom spline**, a smooth curve that passes *through* every point. Each segment between `P1` and `P2` is a cubic polynomial shaped by the neighbours `P0` and `P3`:

```
P(t) = 0.5 × [ 2P1 + (−P0 + P2)t + (2P0 − 5P1 + 4P2 − P3)t² + (−P0 + 3P1 − 3P2 + P3)t³ ]
```

A **tube** (a thin 3D pipe) is then swept along the curve.

### 4.3 Drawing the route progressively + flowing light
Every point on the tube knows how far along the route it is (`u` from 0 to 1). The shader **discards** (doesn't draw) any pixel with `u > progress`, so the route "draws itself" as you scroll. The moving dashes are `0.55 + 0.45 × sin(2π(u × 60 − 2 × time))`, a **travelling sine wave**.

### 4.4 Nearest point on the route (linear search)
To know how much route to draw for each chapter, the curve is sampled at 400 evenly spaced points (**arc-length parameterisation**). For a place like Blagoevgrad, the code checks all 400 and keeps the closest one (**brute-force nearest neighbour**, using squared distance to skip the square root). Its index / 400 is the progress value (`routeT` in [js/scene.js](js/scene.js)).

---

## 5. Camera and scroll animation

### 5.1 Camera keyframes (polar coordinates)
Each chapter describes the camera as "look at this place, from this **distance**, **height** and **angle**":

```
camera.x = target.x + sin(angle) × dist
camera.z = target.z + cos(angle) × dist
camera.y = target.y + height
```

This converts **polar coordinates** to Cartesian ones, so the camera can orbit to any side of a place. `camera.lookAt(target)` builds the rotation that points the camera at it (`keyframe` in [js/main.js](js/main.js)).

### 5.2 Scroll → timeline (scrubbing)
The whole flight is one GSAP **timeline**: keyframe 0 → 1 → 2 → … → 6, one second each. ScrollTrigger maps scroll position to time:

```
progress = (scrollY − start) / (end − start)       → 0…1
time     = progress × timeline_duration
```

Inside each segment the camera moves with **easing**. `power1.inOut` is `t²`-shaped at both ends, so it accelerates and decelerates smoothly instead of moving at constant speed.

### 5.3 Exponential smoothing (smooth scroll, scrub, parallax)
Three different "smooth" effects use the same one-line algorithm, run every frame:

```
current = current + (target − current) × k        (k ≈ 0.05–0.1)
```

Each frame covers a fixed fraction of the remaining distance, so movement starts fast and eases in gently. This is a **low-pass filter** (exponential moving average). It's used for:
- **Lenis** smooth scrolling (the page glides instead of jumping),
- ScrollTrigger `scrub: 1.2` (the camera lags slightly behind the scroll),
- **mouse parallax** (the camera drifts a little toward your cursor).

### 5.4 Intro fly-in
The camera starts with an extra offset `(−3, +9, +6) × k`, and `k` animates from 1 to 0 with `expo.out` easing (fast, then very slow). It's done with an offset, not a separate position, so the intro and the scroll animation never fight each other.

---

## 6. HTML pins on a 3D map (3D → 2D projection)

The pins are normal HTML buttons (easy to click and style), so every frame each pin's 3D position must be converted to a screen position (`placePins` in [js/main.js](js/main.js)):

1. **Model-view-projection:** multiply the point by the camera's view matrix and projection matrix (`vector.project(camera)`). This gives **normalised device coordinates** from −1 to 1.
2. **Viewport transform:**
   ```
   screenX = (ndc.x × 0.5 + 0.5) × width
   screenY = (−ndc.y × 0.5 + 0.5) × height        (screen y points down)
   ```
3. **Culling:** if `ndc.z > 1` the point is behind the camera, and it's also hidden if it's off-screen.
4. **Perspective scale:** `scale = clamp(3 / distance, 0.6, 1.2)`, so closer pins are bigger.

---

## 7. The dive into Street View

### 7.1 Choreographed timeline
One timeline plays in sequence (`dive` in [js/main.js](js/main.js)):
1. Turn the camera toward the pin and swing around it (`power2.inOut`).
2. Plunge toward the ground with `expo.in` easing (slow, then extremely fast).
3. At the same time, widen the **field of view** from 45° to 95°. That gives the "warp speed" stretch you see in films.
4. Fade a white/cyan radial **flash** in over the last 0.3 s.

### 7.2 Running work in parallel
While the camera flies (~2.2 s), the free Street View lookup runs in the background. `Promise.all([lookup, animation])` waits for **both**, so the flight hides the network delay. Then Street View appears from inside the flash (scale 1.35 → 1, blur 18 px → 0).

The return trip (`surface`) plays the same steps backwards, back to the saved camera position.

---

## 8. Street View

### 8.1 Finding the best panorama (fallback search)
`getPanorama` looks for the nearest Street View photo to a location (`prepare` in [js/streetview.js](js/streetview.js)). The search tries, in order:

```
Google's own imagery within 100 m → 600 m → 2500 m → any imagery (incl. user photos) within 1000 m
```

It stops at the first success. Official Google imagery comes first because its image servers are reliable (user photo spheres caused the "429 Too Many Requests" black screen earlier). This kind of search is called **progressive widening with source priority**.

### 8.2 Direction to a landmark: initial bearing on a sphere
Every card knows the real coordinates of its landmark (taken from Wikipedia), and the camera knows where the panorama was photographed. The compass direction from the camera to the landmark is the **great-circle initial bearing** (`bearing` in [js/geo.js](js/geo.js)):

```
θ = atan2( sin Δλ · cos φ2 ,  cos φ1 · sin φ2 − sin φ1 · cos φ2 · cos Δλ )
```

`φ` is latitude and `λ` is longitude (both in radians) of the camera (1) and the landmark (2). The result, converted to 0…360°, is the compass direction (0° = north, 90° = east). The view also turns to face the first landmark this way when Street View opens.

The direction is shown on the card with an **8-point compass**: `index = round(θ / 45) mod 8` picks one of С, СИ, И, ЮИ, Ю, ЮЗ, З, СЗ.

### 8.3 Distance to a landmark: haversine formula
The distance shown on each card ("450 м", "15 км") uses the **haversine formula** (`distance` in [js/geo.js](js/geo.js)):

```
a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
d = 2R · asin(√a)                          (R = 6371 km, Earth's radius)
```

It measures the shortest path over the surface of a sphere, which is accurate to well under 1% for these distances.

### 8.4 Looking up or down: elevation angle
A landmark on a hillside should appear higher than one in a valley. The code reads both heights from the elevation data (section 1.4) and computes the angle above the horizon:

```
pitch = atan2( height_landmark − height_camera + 12 m ,  distance )
```

The extra 12 m lifts the point to roughly the middle of a building instead of its foundation. The result is clamped to −3°…+8° so the card, which hangs above the point, always stays on screen.

### 8.5 Following you as you walk
When you click Street View's arrows to move, Google fires a `position_changed` event. The code takes the new camera position and runs 8.2–8.4 again for every card, so directions and distances stay correct wherever you walk.

### 8.6 Anchoring the cards on screen (pinhole camera projection)
Every frame, each direction (heading + pitch) becomes a screen position (`loop` in [js/streetview.js](js/streetview.js)):

```
fov   = 180° / 2^zoom                 (Street View zoom 1 = 90° wide)
f     = (width / 2) / tan(fov / 2)    (focal length in pixels)
Δh    = wrap(heading − cameraHeading)
Δp    = pitch − cameraPitch
x     = width/2  + f · tan(Δh)
y     = height/2 − f · tan(Δp)
```

This is the **pinhole camera model**: a point at angle `α` from the centre of view appears `f·tan(α)` pixels from the screen centre. As you drag Street View, the cards slide exactly like objects in the scene. Each card is also tilted by `rotateY(Δh × 0.55°)`, so it turns slightly away as it moves to the edge. That's a depth cue that makes it feel 3D.

It's an approximation: Street View's own renderer is spherical, so at the very edges the cards can drift a few pixels from the scene.

### 8.7 Stopping cards from overlapping: clustering and fan-out
Several landmarks can lie in almost the same direction. In Melnik, the Kordopulov House and the Rozhen Monastery are both to the east. Drawn at their exact directions, their cards would cover each other. The layout algorithm (`placeCards` in [js/streetview.js](js/streetview.js)) works like this:
1. **Sort** the cards by heading.
2. **Cluster:** walk through the sorted list. A card less than 22° from the previous one joins its group; otherwise it starts a new group. Because headings go around a circle, a group at 350° and one at 5° are merged too.
3. **Fan out:** inside a group of `n` cards with average heading `m`, card `i` is drawn at `m + (i − (n−1)/2) × 22°`. That spreads them evenly, centred on the group.
4. **Leader lines:** each card draws a thin line from itself to a glowing dot at the landmark's *true* direction. The card may move a little sideways, but the dot is always exact.

The leader line's length and angle come from the two screen points: `length = √(dx² + dy²)`, `angle = atan2(dy, dx)`.

### 8.8 Off-screen landmarks: edge indicators
If a landmark is behind you or more than ~80° to the side, its card is hidden and a label appears at the left or right screen edge instead, e.g. "‹ Черни връх · 15 км". The side is the sign of `Δh`: negative means turn left, positive means turn right.

A card without coordinates ("Тук сте", "you are here") describes the place you're standing in, so it's placed 45° to the right of the main landmark.

### 8.9 Angle wrapping
Headings go around a circle, so 350° and 10° are only 20° apart, not 340°. `wrap(d)` maps any difference into −180…180:

```
wrap(d) = ((d mod 360) + 540) mod 360 − 180
```

The extra `+ 540` and second `mod` handle negative numbers, because in JavaScript `−30 % 360` is `−30`, not `330`.

### 8.10 The no-key fallback ("virtual panorama")
Without a key, the same projection code runs on a fake camera that you rotate by dragging. Heading changes by `−Δmouse.x × 0.15°`, and pitch is **clamped** to ±60°. The perspective grid floor is a CSS `rotateX(70deg)` plane.

---

## 9. Text and visual effects

### 9.1 Letter-by-letter 3D animation (staggering)
Each title is split into one `<span>` per letter, with the letters of each word wrapped together so words never break across lines. Each letter starts rotated −95° around X and pushed 300 px back in Z, then animates to flat. A **stagger** of 0.04 s gives letter *i* a start delay of `i × 0.04 s`, which produces the wave.

### 9.2 Extruded 3D text (stacked shadows)
The thick 3D look is **7 text-shadows**, each offset 1 px lower and a darker shade of cyan. Stacked, they read as the side of a solid block. Two big blurred shadows on top add the neon glow.

### 9.3 Scroll-driven panels
Each chapter panel has its own mini-timeline tied to scroll. It rotates in from ±55° with blur, holds, then rotates out. The CSS `perspective: 1200px` on the parent makes `rotateY` look 3D.

### 9.4 Looping beam rings
The ground rings under each pin use `s = 1 + ((time × 0.8 + i × 0.37) mod 1) × 1.6` for scale and `1 − (s − 1)/1.6` for opacity. `mod 1` makes it loop, and `i × 0.37` offsets each pin so they don't all pulse together.

### 9.5 Particles
1,800 points are placed at **uniformly random** positions in a box above the map (`Math.random()`). The whole cloud slowly rotates, and it bobs with `sin(time)`.

---

## 10. Loading, caching and staying free

### 10.1 Memoised photo lookups
Card photos come from the Wikipedia REST API. The `wikiCache` map stores the **promise** for each article, not just the result. If two cards request the same article at the same moment, only one network request is made (**memoisation**). The code asks for a 500 px version and falls back to the default thumbnail if that fails.

### 10.2 Lazy loading + a single panorama (keeps Google free)
- The Google script loads only when you first hover over or click a pin (**lazy loading**). A visitor who only scrolls costs nothing.
- Google bills each time a `StreetViewPanorama` object is **created**. The site creates it **once** and afterwards only calls `setPano()` to switch places. The panorama is a **singleton** (at most one exists).
- The panorama search (`getPanorama`) is a free metadata request.

So one visit costs at most one billable Street View event, however many places are opened.

---

## Summary table

| # | Algorithm | Where | Used for |
|---|---|---|---|
| 1.1 | Web Mercator tile math | build step | picking elevation tiles |
| 1.2 | Terrarium RGB decoding + PNG unfiltering | build step → `elevation.bin` | colour → metres, same on every device |
| 1.4 | Bilinear interpolation | `geo.js` | smooth heights |
| 2.1 | Equirectangular projection with cos(lat) | `geo.js` | lat/lng → 3D |
| 2.2 | Grid triangulation | `scene.js` | terrain mesh |
| 2.3 | Cross-product normals | three.js | lighting |
| 3.2 | Lambert lighting (dot product) | shader | relief shading |
| 3.3 | fract + fwidth anti-aliasing | shader | contour lines, grid |
| 3.4–3.5 | Gaussian functions | shader | scan band, click ring |
| 4.1 | Linear interpolation + draping | `scene.js` | route on terrain |
| 4.2 | Catmull-Rom spline | `scene.js` | smooth route |
| 4.3 | Travelling sine wave + discard | shader | animated route |
| 4.4 | Brute-force nearest neighbour | `scene.js` | route progress |
| 5.1 | Polar → Cartesian | `main.js` | camera placement |
| 5.2 | Timeline scrubbing + easing | `main.js` | scroll flight |
| 5.3 | Exponential smoothing | Lenis / GSAP / `main.js` | smooth scroll, parallax |
| 6 | MVP projection + viewport transform | `main.js` | HTML pins |
| 7.2 | Parallel promises | `main.js` | hide loading time |
| 8.1 | Progressive widening search | `streetview.js` | best panorama |
| 8.2 | Great-circle bearing + 8-point compass | `geo.js` | direction to each landmark |
| 8.3 | Haversine distance | `geo.js` | distance to each landmark |
| 8.4 | Elevation angle (atan2) | `streetview.js` | looking up at hillsides |
| 8.5 | Event-driven recompute | `streetview.js` | directions follow you as you walk |
| 8.6 | Pinhole camera projection | `streetview.js` | anchored 3D cards |
| 8.7 | Clustering + fan-out + leader lines | `streetview.js` | no overlapping cards |
| 8.8 | Edge indicators | `streetview.js` | landmarks behind you |
| 8.9 | Angle wrapping (modular arithmetic) | `streetview.js` | heading differences |
| 9.1 | Staggered animation | `main.js`, `streetview.js` | 3D letters |
| 10.1 | Memoisation | `streetview.js` | photo cache |
| 10.2 | Lazy loading + singleton | `streetview.js` | free-tier billing |
