// A tiny raster canvas and a real PNG encoder, built on nothing but node:zlib.
//
// The seed photographs have to look like something during a demo, and pulling
// in a canvas library (native build) or fetching stock imagery (needs wifi at
// exactly the wrong moment) are both worse trades than ~150 lines of pixels.

import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 3);
  }

  blend(x, y, color, alpha = 1) {
    if (alpha <= 0) return;
    const px = x | 0;
    const py = y | 0;
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;

    const a = alpha >= 1 ? 1 : alpha;
    const i = (py * this.width + px) * 3;
    this.data[i] = this.data[i] * (1 - a) + color[0] * a;
    this.data[i + 1] = this.data[i + 1] * (1 - a) + color[1] * a;
    this.data[i + 2] = this.data[i + 2] * (1 - a) + color[2] * a;
  }

  /** Horizontal span with fractional coverage at both ends, so edges stay smooth. */
  span(x0, x1, y, color, alpha = 1) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    const first = Math.floor(x0);
    const last = Math.ceil(x1) - 1;
    for (let x = first; x <= last; x++) {
      const coverage = Math.min(x + 1, x1) - Math.max(x, x0);
      if (coverage > 0) this.blend(x, y, color, alpha * Math.min(1, coverage));
    }
  }

  rect(x, y, w, h, color, alpha = 1) {
    for (let py = Math.floor(y); py < y + h; py++) this.span(x, x + w, py, color, alpha);
  }

  /** Vertical gradient between two colors across a band of rows. */
  verticalGradient(y0, y1, top, bottom, alpha = 1) {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const t = clamp01((y - y0) / Math.max(1, y1 - y0));
      const color = mix(top, bottom, smoothstep(t));
      this.span(0, this.width, y, color, alpha);
    }
  }

  /** A circle whose edge fades over `feather` pixels. The workhorse for suns, glows and clouds. */
  disc(cx, cy, radius, color, alpha = 1, feather = 1) {
    const outer = radius + feather;
    for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
      if (y < 0 || y >= this.height) continue;
      for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const coverage = feather <= 0 ? (d <= radius ? 1 : 0) : clamp01((radius + feather - d) / feather);
        if (coverage > 0) this.blend(x, y, color, alpha * coverage);
      }
    }
  }

  ellipse(cx, cy, rx, ry, color, alpha = 1, feather = 1) {
    for (let y = Math.floor(cy - ry - feather); y <= Math.ceil(cy + ry + feather); y++) {
      if (y < 0 || y >= this.height) continue;
      for (let x = Math.floor(cx - rx - feather); x <= Math.ceil(cx + rx + feather); x++) {
        const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
        const edge = feather / Math.max(rx, ry);
        const coverage = clamp01((1 + edge - d) / Math.max(1e-6, edge));
        if (coverage > 0) this.blend(x, y, color, alpha * coverage);
      }
    }
  }

  /** Even-odd scanline fill. Points are [x, y] pairs. */
  polygon(points, color, alpha = 1) {
    if (points.length < 3) return;
    const ys = points.map((p) => p[1]);
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));

    for (let y = minY; y <= maxY; y++) {
      const scan = y + 0.5;
      const crossings = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xj, yj] = points[j];
        const [xi, yi] = points[i];
        if (yj > scan !== yi > scan) {
          crossings.push(xj + ((scan - yj) / (yi - yj)) * (xi - xj));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        this.span(crossings[k], crossings[k + 1], y, color, alpha);
      }
    }
  }

  /** Thick line segment, drawn as a quad. */
  line(x0, y0, x1, y1, width, color, alpha = 1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    this.polygon(
      [
        [x0 + nx, y0 + ny],
        [x1 + nx, y1 + ny],
        [x1 - nx, y1 - ny],
        [x0 - nx, y0 - ny],
      ],
      color,
      alpha,
    );
  }

  /** Polyline through sampled points — used for suspension cables and ridgelines. */
  path(points, width, color, alpha = 1) {
    for (let i = 1; i < points.length; i++) {
      this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], width, color, alpha);
    }
  }

  /** Film grain. Subtle, but it is most of what stops these reading as clip art. */
  grain(amount, rng) {
    for (let i = 0; i < this.data.length; i += 3) {
      const n = (rng() - 0.5) * amount;
      this.data[i] = clampByte(this.data[i] + n);
      this.data[i + 1] = clampByte(this.data[i + 1] + n);
      this.data[i + 2] = clampByte(this.data[i + 2] + n);
    }
  }

  vignette(strength = 0.45) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = Math.hypot(x - cx, y - cy) / maxD;
        const shade = 1 - strength * Math.pow(clamp01(t), 2.4);
        const i = (y * this.width + x) * 3;
        this.data[i] *= shade;
        this.data[i + 1] *= shade;
        this.data[i + 2] *= shade;
      }
    }
  }

  toPNG() {
    return encodePNG(this.width, this.height, this.data);
  }
}

/** RGB8 PNG. Rows use the Up filter, which suits the vertical gradients here. */
export function encodePNG(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.allocUnsafe((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 2; // filter: Up
    for (let x = 0; x < stride; x++) {
      const above = y === 0 ? 0 : rgb[(y - 1) * stride + x];
      raw[rowStart + 1 + x] = (rgb[y * stride + x] - above) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolour
  // bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
