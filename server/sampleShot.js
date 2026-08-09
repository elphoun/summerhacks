// A plausible photograph on demand.
//
// Neither the iOS Simulator nor an Android emulator has a camera, and a demo
// that cannot take a photo cannot show the half of the app that matters. This
// draws a stylised scene instead — the same raster canvas that draws the seed
// artwork, so a stand-in capture sits naturally alongside the seeded memories in
// a gallery rather than looking like a placeholder.
//
// It lives on the server rather than in the app because React Native has no
// canvas: the renderer here already exists, already produces PNGs with nothing
// but node:zlib, and the app has to be able to reach the server to leave a photo
// anyway.

import { Raster } from './png.js';
import { makeRng } from './artwork.js';

const WIDTH = 640;
const HEIGHT = 854;

/** PNG bytes of a freshly drawn scene. */
export function renderSampleShot(seed = (Math.random() * 0xffffffff) >>> 0) {
  const rng = makeRng(seed >>> 0);
  const raster = new Raster(WIDTH, HEIGHT);
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
  const horizon = HEIGHT * (0.6 + rng() * 0.12);

  // Sky
  raster.verticalGradient(0, horizon, palette.skyTop, palette.skyHorizon);

  // Sun or moon, with a glow.
  const lightX = WIDTH * (0.2 + rng() * 0.6);
  const lightY = horizon * (0.2 + rng() * 0.35);
  raster.disc(lightX, lightY, 20, palette.glow, 0.55, 240);
  raster.disc(lightX, lightY, 30, palette.light, 1, 2);

  // Two silhouette ridges, the far one hazier.
  ridge(raster, horizon, 135, palette.haze, 0.55, rng);
  ridge(raster, horizon + 10, 215, palette.silhouette, 1, rng);

  // Ground
  raster.verticalGradient(horizon, HEIGHT, palette.silhouette, palette.ground);

  raster.grain(9, rng);
  raster.vignette(0.45);
  return raster.toPNG();
}

/** A jagged skyline, drawn as one polygon so the fill stays cheap. */
function ridge(raster, baseline, height, colour, roughness, rng) {
  const points = [[0, baseline + height]];
  const step = WIDTH / 9;
  for (let x = 0; x <= WIDTH; x += step) {
    points.push([x, baseline - rng() * height * roughness * 0.55]);
  }
  points.push([WIDTH, baseline + height]);
  raster.polygon(points, colour, 1);
}

const PALETTES = [
  {
    // Night
    skyTop: [8, 10, 28],
    skyHorizon: [38, 33, 71],
    light: [237, 240, 255],
    glow: [120, 140, 219],
    haze: [33, 33, 61],
    silhouette: [13, 13, 28],
    ground: [5, 5, 13],
  },
  {
    // Golden hour
    skyTop: [84, 140, 199],
    skyHorizon: [255, 196, 122],
    light: [255, 242, 201],
    glow: [255, 189, 110],
    haze: [153, 120, 107],
    silhouette: [46, 33, 38],
    ground: [20, 15, 20],
  },
  {
    // Dusk
    skyTop: [26, 31, 82],
    skyHorizon: [237, 117, 107],
    light: [255, 196, 161],
    glow: [245, 120, 110],
    haze: [125, 92, 112],
    silhouette: [28, 20, 41],
    ground: [13, 10, 20],
  },
];
