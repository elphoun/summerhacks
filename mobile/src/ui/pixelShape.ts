/**
 * A rectangle whose corners are a staircase of right-angle steps rather than a
 * curve — a rounded corner as pixel art would draw one. `steps` controls how
 * many stairs approximate the curve: 1 is a single sharp 45° chamfer, more
 * steps read progressively softer/rounder while staying blocky.
 */
export function pixelRoundedRectPath(
  width: number,
  height: number,
  radius = 12,
  steps = 2,
  inset = 0
): string {
  const minX = inset;
  const minY = inset;
  const maxX = width - inset;
  const maxY = height - inset;
  const r = Math.max(0, Math.min(radius, Math.min(maxX - minX, maxY - minY) / 2));
  const n = Math.max(1, steps);
  const s = r / n;

  const parts: string[] = [`M${minX + r} ${minY}`, `L${maxX - r} ${minY}`];

  let x = maxX - r;
  let y = minY;
  for (let i = 0; i < n; i++) {
    x += s;
    parts.push(`L${x} ${y}`);
    y += s;
    parts.push(`L${x} ${y}`);
  }

  parts.push(`L${maxX} ${maxY - r}`);

  x = maxX;
  y = maxY - r;
  for (let i = 0; i < n; i++) {
    y += s;
    parts.push(`L${x} ${y}`);
    x -= s;
    parts.push(`L${x} ${y}`);
  }

  parts.push(`L${minX + r} ${maxY}`);

  x = minX + r;
  y = maxY;
  for (let i = 0; i < n; i++) {
    x -= s;
    parts.push(`L${x} ${y}`);
    y -= s;
    parts.push(`L${x} ${y}`);
  }

  parts.push(`L${minX} ${minY + r}`);

  x = minX;
  y = minY + r;
  for (let i = 0; i < n; i++) {
    y -= s;
    parts.push(`L${x} ${y}`);
    x += s;
    parts.push(`L${x} ${y}`);
  }

  parts.push('Z');
  return parts.join('');
}

/**
 * The four corner offcuts: the whole rectangle with the pixel-rounded shape
 * punched out of it, wound so an even-odd fill leaves only the stairs.
 *
 * Painting this in the surrounding colour over an image or a map gives the same
 * corners `clipShape` gave in SwiftUI, without needing to clip the thing
 * underneath — which React Native only offers as a plain corner radius.
 */
export function pixelCornerMaskPath(
  width: number,
  height: number,
  radius = 12,
  steps = 2
): string {
  const outline = `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
  return `${outline}${pixelRoundedRectPath(width, height, radius, steps)}`;
}
