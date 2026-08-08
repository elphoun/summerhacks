// Procedural "photographs" for the seed data.
//
// Each landmark gets a hero silhouette and each individual shot gets its own
// seeded time of day, framing and weather, so a cluster of five photos of the
// Eiffel Tower looks like five people who stood there on five different
// evenings rather than one image pasted five times.

import { Raster, clamp01, mix } from './png.js';

/** mulberry32 — small, fast, and identical across runs for a given seed. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashString = (value) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const PALETTES = {
  night: {
    skyTop: [7, 10, 28],
    skyHorizon: [38, 32, 72],
    light: [236, 240, 255],
    lightGlow: [120, 140, 220],
    haze: [46, 44, 84],
    ground: [10, 10, 22],
    windows: [255, 206, 130],
    stars: true,
    lightHeight: 0.2,
  },
  dawn: {
    skyTop: [46, 62, 116],
    skyHorizon: [255, 176, 138],
    light: [255, 232, 198],
    lightGlow: [255, 168, 120],
    haze: [186, 152, 152],
    ground: [40, 32, 44],
    windows: [255, 224, 168],
    stars: false,
    lightHeight: 0.62,
  },
  golden: {
    skyTop: [84, 140, 198],
    skyHorizon: [255, 198, 122],
    light: [255, 242, 202],
    lightGlow: [255, 190, 110],
    haze: [206, 176, 144],
    ground: [46, 38, 38],
    windows: [255, 232, 180],
    stars: false,
    lightHeight: 0.58,
  },
  day: {
    skyTop: [54, 122, 200],
    skyHorizon: [190, 216, 240],
    light: [255, 255, 246],
    lightGlow: [220, 235, 255],
    haze: [190, 206, 222],
    ground: [58, 60, 62],
    windows: [226, 236, 248],
    stars: false,
    lightHeight: 0.22,
  },
  dusk: {
    skyTop: [26, 30, 80],
    skyHorizon: [238, 118, 108],
    light: [255, 196, 160],
    lightGlow: [246, 120, 110],
    haze: [126, 92, 112],
    ground: [22, 18, 32],
    windows: [255, 214, 150],
    stars: true,
    lightHeight: 0.5,
  },
};

const PALETTE_NAMES = Object.keys(PALETTES);

export const WIDTH = 640;
export const HEIGHT = 800;

export function renderPhoto({ hero, seed, water = false }) {
  const rng = makeRng(seed);
  const palette = PALETTES[PALETTE_NAMES[Math.floor(rng() * PALETTE_NAMES.length)]];
  const canvas = new Raster(WIDTH, HEIGHT);

  const horizon = HEIGHT * (0.66 + rng() * 0.1);
  const silhouette = mix(palette.skyHorizon, [8, 8, 16], 0.9);

  canvas.verticalGradient(0, horizon, palette.skyTop, palette.skyHorizon);
  if (palette.stars) drawStars(canvas, horizon, rng);

  const lightX = WIDTH * (0.15 + rng() * 0.7);
  const lightY = horizon * palette.lightHeight;
  canvas.disc(lightX, lightY, HEIGHT * 0.16, palette.lightGlow, 0.3, HEIGHT * 0.18);
  canvas.disc(lightX, lightY, HEIGHT * (palette.stars ? 0.022 : 0.034), palette.light, 0.95, 3);

  drawClouds(canvas, horizon, palette, rng);

  // A hazier ridge behind the subject gives the frame some depth.
  drawFarRidge(canvas, horizon, mix(palette.haze, palette.skyHorizon, 0.35), rng);

  const hero_ = HERO_SHAPES[hero] ?? HERO_SHAPES.skyline;
  hero_(canvas, {
    cx: WIDTH * (0.36 + rng() * 0.28),
    baseY: horizon + 2,
    size: HEIGHT * (0.34 + rng() * 0.12),
    color: silhouette,
    palette,
    rng,
  });

  if (water) drawWater(canvas, horizon, palette, rng);
  else canvas.verticalGradient(horizon, HEIGHT, mix(palette.ground, palette.haze, 0.25), palette.ground);

  canvas.vignette(0.42);
  canvas.grain(11, rng);
  return canvas.toPNG();
}

function drawStars(canvas, horizon, rng) {
  const count = 140;
  for (let i = 0; i < count; i++) {
    const y = rng() * horizon * 0.85;
    const brightness = 0.25 + rng() * 0.75;
    // Fewer stars near the horizon glow, as in a real sky.
    if (rng() < y / horizon) continue;
    canvas.disc(rng() * WIDTH, y, rng() * 0.9 + 0.3, [255, 255, 250], brightness, 0.8);
  }
}

function drawClouds(canvas, horizon, palette, rng) {
  const bands = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < bands; i++) {
    const y = horizon * (0.18 + rng() * 0.62);
    const x = rng() * WIDTH;
    const rx = WIDTH * (0.12 + rng() * 0.24);
    const ry = rx * (0.1 + rng() * 0.12);
    const tint = mix(palette.skyHorizon, palette.light, 0.35 + rng() * 0.4);
    const alpha = 0.1 + rng() * 0.2;
    for (let puff = 0; puff < 4; puff++) {
      canvas.ellipse(
        x + (rng() - 0.5) * rx,
        y + (rng() - 0.5) * ry,
        rx * (0.4 + rng() * 0.5),
        ry * (0.7 + rng() * 0.7),
        tint,
        alpha,
        18,
      );
    }
  }
}

function drawFarRidge(canvas, horizon, color, rng) {
  const points = [[0, HEIGHT]];
  const base = horizon - 6;
  let x = 0;
  while (x <= WIDTH) {
    points.push([x, base - Math.sin(x * 0.006 + rng() * 0.4) * 16 - rng() * 12]);
    x += 40;
  }
  points.push([WIDTH, HEIGHT]);
  canvas.polygon(points, color, 0.55);
}

function drawWater(canvas, horizon, palette, rng) {
  canvas.verticalGradient(horizon, HEIGHT, mix(palette.skyHorizon, palette.ground, 0.55), palette.ground);
  // Broken horizontal streaks read as reflected light on moving water.
  for (let i = 0; i < 90; i++) {
    const y = horizon + rng() * (HEIGHT - horizon);
    const depth = clamp01((y - horizon) / (HEIGHT - horizon));
    const width = 12 + rng() * 90 * (0.4 + depth);
    const x = rng() * WIDTH;
    canvas.span(x, x + width, y, mix(palette.light, palette.skyHorizon, 0.4), 0.05 + rng() * 0.12);
  }
}

// ---------------------------------------------------------------------------
// Hero silhouettes
// ---------------------------------------------------------------------------

const HERO_SHAPES = {
  /** Eiffel: splayed legs under a spanning arch, two platforms, a tapering spire. */
  tower(canvas, { cx, baseY, size, color, palette }) {
    // Profile of the whole tower: wide and curving in fast at the bottom.
    const halfAt = (t) => size * (0.23 * Math.pow(1 - t, 1.75) + 0.011);
    const yAt = (t) => baseY - size * t;
    const platform1 = 0.3;
    const platform2 = 0.62;

    // Legs: thick at the ground, following the outer profile up to platform 1.
    for (const side of [-1, 1]) {
      const outer = [];
      const inner = [];
      for (let t = 0; t <= platform1 + 1e-6; t += 0.03) {
        const half = halfAt(t);
        outer.push([cx + side * half, yAt(t)]);
        inner.push([cx + side * half * (1 - 0.42 * (1 - t / platform1) - 0.18), yAt(t)]);
      }
      canvas.polygon([...outer, ...inner.reverse()], color);
    }

    // The arch between the legs — an outer curve and a concentric inner one.
    const archBase = 0.055;
    const archApex = 0.2;
    const archOuter = [];
    const archInner = [];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = cx + (t * 2 - 1) * halfAt(archBase) * 0.86;
      const lift = Math.sin(Math.PI * t);
      archOuter.push([x, yAt(archBase + (archApex - archBase) * lift)]);
      archInner.push([x * 1 + (cx - x) * 0.12, yAt(archBase + (archApex - archBase - 0.052) * lift)]);
    }
    canvas.polygon([...archOuter, ...archInner.reverse()], color);

    // Platforms, then the two upper sections following the same profile.
    const section = (t0, t1) =>
      canvas.polygon(
        [
          [cx - halfAt(t0), yAt(t0)],
          [cx + halfAt(t0), yAt(t0)],
          [cx + halfAt(t1), yAt(t1)],
          [cx - halfAt(t1), yAt(t1)],
        ],
        color,
      );

    canvas.rect(cx - halfAt(platform1) * 1.3, yAt(platform1), halfAt(platform1) * 2.6, size * 0.026, color);
    section(platform1, platform2);
    canvas.rect(cx - halfAt(platform2) * 1.7, yAt(platform2), halfAt(platform2) * 3.4, size * 0.02, color);
    section(platform2, 0.93);

    // Lattice: faint cross-bracing so the upper shaft is not a solid slab.
    for (let t = platform1 + 0.03; t < 0.9; t += 0.045) {
      canvas.rect(cx - halfAt(t), yAt(t), halfAt(t) * 2, size * 0.005, mix(color, palette.skyHorizon, 0.35), 0.5);
    }

    canvas.rect(cx - size * 0.028, yAt(0.93), size * 0.056, size * 0.03, color);
    canvas.line(cx, yAt(0.95), cx, yAt(1.02), size * 0.011, color);
    canvas.disc(cx, yAt(1.03), size * 0.013, palette.windows, 0.9, 2);
  },

  /** Suspension bridge: two towers, a catenary, hangers, a deck. */
  bridge(canvas, { cx, baseY, size, color, palette, rng }) {
    const span = size * 1.5;
    const deckY = baseY - size * 0.28;
    const towerTop = baseY - size * 1.02;
    const towers = [cx - span / 2, cx + span / 2];

    canvas.rect(cx - span * 0.85, deckY, span * 1.7, size * 0.035, color);

    for (const tx of towers) {
      const w = size * 0.075;
      canvas.polygon(
        [
          [tx - w, baseY],
          [tx + w, baseY],
          [tx + w * 0.62, towerTop],
          [tx - w * 0.62, towerTop],
        ],
        color,
      );
      for (const barY of [towerTop + size * 0.1, deckY - size * 0.16]) {
        canvas.rect(tx - w * 1.15, barY, w * 2.3, size * 0.022, color);
      }
    }

    // Main cable: a sag between the towers, rising away to the anchorages.
    const cable = [];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = towers[0] + (towers[1] - towers[0]) * t;
      cable.push([x, towerTop + Math.sin(Math.PI * t) * size * 0.46]);
    }
    canvas.path(cable, size * 0.014, color);
    canvas.path([[cx - span * 0.85, deckY - size * 0.1], [towers[0], towerTop]], size * 0.012, color);
    canvas.path([[towers[1], towerTop], [cx + span * 0.85, deckY - size * 0.1]], size * 0.012, color);

    for (const [x, y] of cable) {
      if (y < deckY - size * 0.02) canvas.line(x, y, x, deckY, size * 0.006, color, 0.85);
    }
    // Traffic on the deck.
    for (let i = 0; i < 14; i++) {
      canvas.disc(cx - span * 0.8 + rng() * span * 1.6, deckY - size * 0.012, size * 0.008, palette.windows, 0.75, 1.5);
    }
  },

  /** Dense lit blocks — Shibuya, Times Square. */
  neon(canvas, { cx, baseY, size, color, palette, rng }) {
    const blocks = 7;
    for (let i = 0; i < blocks; i++) {
      const w = size * (0.16 + rng() * 0.2);
      const h = size * (0.4 + rng() * 0.62);
      const x = cx - size * 0.85 + (i / blocks) * size * 1.75 + (rng() - 0.5) * size * 0.06;
      const depth = 0.55 + rng() * 0.45;
      canvas.rect(x, baseY - h, w, h, mix(palette.haze, color, depth));

      for (let wy = baseY - h + size * 0.05; wy < baseY - size * 0.04; wy += size * 0.045) {
        for (let wx = x + size * 0.02; wx < x + w - size * 0.02; wx += size * 0.035) {
          if (rng() < 0.45) continue;
          canvas.rect(wx, wy, size * 0.018, size * 0.024, palette.windows, 0.35 + rng() * 0.6);
        }
      }
      // A lit hoarding, with the bloom you get shooting into a screen at night.
      if (rng() < 0.55) {
        const signColor = [
          [255, 96, 110],
          [96, 210, 255],
          [255, 208, 96],
          [150, 255, 180],
        ][Math.floor(rng() * 4)];
        const sy = baseY - h + size * (0.08 + rng() * 0.3);
        canvas.rect(x + size * 0.02, sy, w - size * 0.04, size * 0.09, signColor, 0.85);
        canvas.ellipse(x + w / 2, sy + size * 0.045, w * 0.9, size * 0.13, signColor, 0.16, 22);
      }
    }
  },

  skyline(canvas, { cx, baseY, size, color, palette, rng }) {
    for (let i = 0; i < 9; i++) {
      const w = size * (0.1 + rng() * 0.18);
      const h = size * (0.25 + rng() * 0.85);
      const x = cx - size * 0.95 + (i / 9) * size * 1.9;
      canvas.rect(x, baseY - h, w, h, mix(palette.haze, color, 0.5 + rng() * 0.5));
      for (let wy = baseY - h + size * 0.04; wy < baseY - size * 0.03; wy += size * 0.05) {
        for (let wx = x + size * 0.015; wx < x + w - size * 0.015; wx += size * 0.032) {
          if (rng() < 0.6) continue;
          canvas.rect(wx, wy, size * 0.014, size * 0.02, palette.windows, 0.3 + rng() * 0.5);
        }
      }
    }
    // The boat-on-three-towers profile of Marina Bay Sands.
    canvas.rect(cx - size * 0.55, baseY - size * 1.02, size * 1.1, size * 0.05, color);
  },

  /** Sagrada Família: a cluster of tapering spires. */
  spires(canvas, { cx, baseY, size, color, palette, rng }) {
    const heights = [0.62, 0.86, 1.0, 0.92, 0.7, 0.55];
    heights.forEach((factor, i) => {
      const x = cx - size * 0.5 + (i / (heights.length - 1)) * size;
      const top = baseY - size * factor;
      const halfBase = size * 0.062;
      canvas.polygon(
        [
          [x - halfBase, baseY],
          [x + halfBase, baseY],
          [x + halfBase * 0.15, top],
          [x - halfBase * 0.15, top],
        ],
        color,
      );
      canvas.disc(x, top - size * 0.018, size * 0.016, color);
      for (let y = baseY - size * 0.1; y > top; y -= size * 0.07) {
        canvas.rect(x - halfBase * 0.8, y, halfBase * 1.6, size * 0.008, mix(color, palette.windows, 0.18), 0.7);
      }
    });
    canvas.rect(cx - size * 0.58, baseY - size * 0.3, size * 1.16, size * 0.3, color);
  },

  /** Colosseum: a heavy wall with lit arches punched through it. */
  arches(canvas, { cx, baseY, size, color, palette, rng }) {
    const w = size * 1.6;
    const h = size * 0.72;
    const left = cx - w / 2;
    canvas.polygon(
      [
        [left, baseY],
        [left, baseY - h * 0.86],
        [left + w * 0.18, baseY - h],
        [left + w * 0.82, baseY - h],
        [left + w, baseY - h * 0.72],
        [left + w, baseY],
      ],
      color,
    );

    const glow = mix(palette.windows, color, 0.35);
    for (let row = 0; row < 3; row++) {
      const y = baseY - h * (0.78 - row * 0.25);
      const archH = h * 0.16;
      for (let x = left + w * 0.06; x < left + w * 0.94; x += w * 0.088) {
        if (y - archH < baseY - h) continue;
        canvas.rect(x, y - archH * 0.45, w * 0.045, archH * 0.45, glow, 0.5);
        canvas.ellipse(x + w * 0.0225, y - archH * 0.45, w * 0.0225, archH * 0.3, glow, 0.5, 1);
      }
    }
  },

  /** Sydney Opera House: a nested row of leaning shells, two facing back the other way. */
  shells(canvas, { cx, baseY, size, color, palette }) {
    const podium = baseY - size * 0.07;
    canvas.rect(cx - size * 0.98, podium, size * 1.96, size * 0.09, mix(color, palette.haze, 0.3));

    const shellColor = mix(color, [255, 255, 255], 0.16);
    // Each shell is drawn twice: an oversized copy in a sky tint first, so
    // neighbours read as separate sails instead of one merged mass.
    const gapColor = mix(palette.skyHorizon, palette.light, 0.3);

    const sails = [
      { x: cx - size * 0.9, w: size * 0.4, h: size * 0.34, dir: 1 },
      { x: cx - size * 0.66, w: size * 0.54, h: size * 0.54, dir: 1 },
      { x: cx - size * 0.34, w: size * 0.64, h: size * 0.78, dir: 1 },
      { x: cx + size * 0.52, w: size * 0.3, h: size * 0.26, dir: -1 },
      { x: cx + size * 0.88, w: size * 0.42, h: size * 0.44, dir: -1 },
    ];

    const sailOutline = ({ x, w, h, dir }, grow) => {
      const width = w + grow;
      const height = h + grow;
      const points = [];
      // Leading edge: steeply up from the podium, arcing over to a sharp apex.
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const a = (t * Math.PI) / 2;
        points.push([x + dir * width * (1 - Math.cos(a)), podium - height * Math.sin(a)]);
      }
      // Trailing edge: a concave drop back to the podium.
      const apexX = x + dir * width;
      const footX = x + dir * width * 0.48;
      for (let t = 0.08; t <= 1.0001; t += 0.08) {
        points.push([apexX - (apexX - footX) * t, podium - height * (1 - Math.pow(t, 1.5))]);
      }
      return points;
    };

    for (const sail of sails) {
      canvas.polygon(sailOutline(sail, size * 0.014), gapColor, 0.92);
      canvas.polygon(sailOutline(sail, 0), shellColor);
    }
  },

  mountain(canvas, { cx, baseY, size, color, palette, rng }) {
    // Flat-topped, like Table Mountain, with a scree slope on one side.
    const top = baseY - size * 0.78;
    const points = [
      [cx - size * 1.2, baseY],
      [cx - size * 0.72, top + size * 0.14],
      [cx - size * 0.5, top],
      [cx + size * 0.42, top + size * 0.02],
      [cx + size * 0.78, top + size * 0.22],
      [cx + size * 1.25, baseY],
    ];
    canvas.polygon(points, color);
    // Cloth-of-cloud spilling over the edge.
    for (let i = 0; i < 5; i++) {
      canvas.ellipse(
        cx - size * 0.3 + rng() * size * 0.7,
        top + rng() * size * 0.06,
        size * (0.16 + rng() * 0.18),
        size * 0.05,
        mix(palette.light, palette.haze, 0.4),
        0.3,
        14,
      );
    }
  },

  observatory(canvas, { cx, baseY, size, color, palette }) {
    const bodyH = size * 0.3;
    canvas.rect(cx - size * 0.62, baseY - bodyH, size * 1.24, bodyH, color);
    canvas.rect(cx - size * 0.2, baseY - bodyH - size * 0.16, size * 0.4, size * 0.16, color);
    canvas.disc(cx, baseY - bodyH - size * 0.16, size * 0.19, color, 1, 1);
    canvas.line(cx, baseY - bodyH - size * 0.35, cx, baseY - bodyH - size * 0.48, size * 0.014, color);
    for (const side of [-1, 1]) {
      const x = cx + side * size * 0.5;
      canvas.disc(x, baseY - bodyH, size * 0.11, color, 1, 1);
      canvas.rect(x - size * 0.11, baseY - bodyH, size * 0.22, size * 0.04, color);
    }
    for (let i = 0; i < 9; i++) {
      canvas.rect(cx - size * 0.56 + i * size * 0.13, baseY - bodyH * 0.62, size * 0.05, size * 0.09, palette.windows, 0.55);
    }
  },

  fountain(canvas, { cx, baseY, size, color, palette, rng }) {
    const facadeH = size * 0.8;
    canvas.rect(cx - size * 0.72, baseY - facadeH, size * 1.44, facadeH, color);
    // Columns and the central niche.
    for (let i = 0; i < 6; i++) {
      const x = cx - size * 0.62 + i * size * 0.25;
      canvas.rect(x, baseY - facadeH * 0.92, size * 0.06, facadeH * 0.7, mix(color, palette.light, 0.12));
    }
    canvas.rect(cx - size * 0.2, baseY - facadeH * 0.78, size * 0.4, facadeH * 0.6, mix(color, [0, 0, 0], 0.35));
    canvas.ellipse(cx, baseY - facadeH * 0.78, size * 0.2, size * 0.14, mix(color, [0, 0, 0], 0.35), 1, 1);
    canvas.disc(cx, baseY - facadeH * 0.42, size * 0.08, mix(color, palette.light, 0.3), 1, 2);

    // Basin and spray.
    canvas.rect(cx - size * 0.9, baseY - size * 0.16, size * 1.8, size * 0.16, mix(palette.light, palette.haze, 0.55), 0.75);
    for (let i = 0; i < 60; i++) {
      canvas.disc(
        cx + (rng() - 0.5) * size * 1.4,
        baseY - size * (0.16 + rng() * 0.18),
        size * 0.008,
        palette.light,
        0.15 + rng() * 0.35,
        1.5,
      );
    }
  },
};

export const HERO_NAMES = Object.keys(HERO_SHAPES);
