import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

import { minimumRevealScreenPoints } from '../config';
import { ExploredPoint } from '../services/explorationStore';
import { Projection } from './projection';

/**
 * Cloud cover over the entire planet, with what you have explored punched out
 * of it.
 *
 * MapKit let the app hand `MKMapView` an overlay renderer and draw the erase
 * with `CGBlendMode.destinationOut`; react-native-maps has no equivalent hook,
 * so the cloud is an SVG layer sitting over the map instead. The erase is the
 * same shape it always was — an SVG luminance mask whose white ground is the
 * fog and whose radial gradients are the reveals, giving cloud that burns off
 * at the edges rather than a cookie cutter.
 *
 * Being above the map means it is also above the map's own labels, which is
 * what the original went out of its way to arrange: place names hide under
 * cloud too.
 */
export function FogLayer({
  points,
  projection,
}: {
  points: ExploredPoint[];
  projection: Projection;
}) {
  const { width, height } = projection;
  if (width <= 0 || height <= 0) return null;

  // Zoomed right out, 150m is far below a pixel. Floor the erase radius so a
  // life of travel still reads as a constellation of lit points.
  const reveals: { x: number; y: number; r: number }[] = [];
  for (const point of points) {
    const radius = Math.max(
      point.radiusM * projection.pointsPerMetre(point.latitude),
      minimumRevealScreenPoints
    );
    const { x, y } = projection.toScreen(point);
    if (x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) continue;
    reveals.push({ x, y, r: radius });
  }

  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient id="reveal" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000" stopOpacity="1" />
          <Stop offset="0.55" stopColor="#000" stopOpacity="1" />
          <Stop offset="1" stopColor="#000" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="puff" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="rgb(158, 179, 235)" stopOpacity="0.09" />
          <Stop offset="1" stopColor="rgb(158, 179, 235)" stopOpacity="0" />
        </RadialGradient>
        <Mask id="fog" x="0" y="0" width={width} height={height}>
          {/* White is fog; every reveal paints black over it, and the mask's
              luminance is what survives. */}
          <Rect x="0" y="0" width={width} height={height} fill="#fff" />
          {reveals.map((reveal, index) => (
            <Circle
              key={index}
              cx={reveal.x}
              cy={reveal.y}
              r={reveal.r}
              fill="url(#reveal)"
            />
          ))}
        </Mask>
      </Defs>

      <G mask="url(#fog)">
        <Rect x="0" y="0" width={width} height={height} fill={FOG_COLOR} />
        {cloudTexture(projection).map((puff, index) => (
          <Circle key={index} cx={puff.x} cy={puff.y} r={puff.r} fill="url(#puff)" />
        ))}
      </G>
    </Svg>
  );
}

const FOG_COLOR = 'rgba(14, 19, 34, 0.985)';

/**
 * Soft highlights on a lattice fixed in *world* space rather than screen space,
 * so the texture stays put under the map while you pan instead of swimming with
 * the viewport.
 */
function cloudTexture(projection: Projection): { x: number; y: number; r: number }[] {
  const spacing = 170;
  const radius = spacing * 0.8;

  const worldMinX = projection.viewportOrigin.x;
  const worldMinY = projection.viewportOrigin.y;

  const firstX = Math.floor((worldMinX - radius) / spacing);
  const lastX = Math.ceil((worldMinX + projection.width + radius) / spacing);
  const firstY = Math.floor((worldMinY - radius) / spacing);
  const lastY = Math.ceil((worldMinY + projection.height + radius) / spacing);

  const puffs: { x: number; y: number; r: number }[] = [];
  // A wildly zoomed-out viewport could ask for an unbounded number of puffs.
  if ((lastX - firstX) * (lastY - firstY) > 4_000) return puffs;

  for (let ix = firstX; ix <= lastX; ix++) {
    for (let iy = firstY; iy <= lastY; iy++) {
      const noise = hash(ix, iy);
      const jitterX = (noise & 0xff) / 255 - 0.5;
      const jitterY = ((noise >>> 8) & 0xff) / 255 - 0.5;
      const scale = 0.6 + (((noise >>> 16) & 0xff) / 255) * 0.7;

      puffs.push({
        x: (ix + 0.5 + jitterX * 0.7) * spacing - worldMinX,
        y: (iy + 0.5 + jitterY * 0.7) * spacing - worldMinY,
        r: radius * scale,
      });
    }
  }
  return puffs;
}

function hash(x: number, y: number): number {
  let h = (Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
