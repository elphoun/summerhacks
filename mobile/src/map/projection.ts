import { Coordinate } from '../geo';
import { MapRegion } from '../state/appModel';

/**
 * Web Mercator, which is what both Apple Maps and Google Maps draw.
 *
 * MapKit handed the fog renderer a ready-made `MKMapPoint` space and a zoom
 * scale; react-native-maps hands over a region and nothing else, so the same
 * projection has to be reconstructed here. Everything drawn on top of the map —
 * the cloud layer, the photo pins, the explorer dot — goes through this, which
 * is what keeps them registered against each other even mid-gesture.
 */
export interface Projection {
  width: number;
  height: number;
  /** Width of the whole planet at this zoom, in screen points. */
  worldPoints: number;
  /**
   * Where the viewport's top-left sits on the world, in the same screen-point
   * units. Anything that has to stay put under the map while it pans — the
   * cloud texture — is laid out against this rather than against the screen.
   */
  viewportOrigin: { x: number; y: number };
  toScreen(coordinate: Coordinate): { x: number; y: number };
  toCoordinate(point: { x: number; y: number }): Coordinate;
  /** Screen points per metre at a latitude. Mercator stretches towards the poles. */
  pointsPerMetre(latitude: number): number;
}

/** Metres round the equator, the Mercator scale is measured against. */
const EQUATOR_M = 40_075_016.686;

/** Normalised Mercator y, 0 at the north pole and 1 at the south. */
function mercatorY(latitude: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (clamped * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI);
}

function inverseMercatorY(y: number): number {
  const radians = 2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2;
  return (radians * 180) / Math.PI;
}

export function projectionFor(
  region: MapRegion,
  size: { width: number; height: number }
): Projection {
  // The region's longitude span pins the scale exactly: Mercator is conformal,
  // so one number sets both axes and reveals stay circular.
  const worldPoints = (size.width * 360) / Math.max(1e-9, region.longitudeDelta);
  const centreY = mercatorY(region.latitude);

  return {
    width: size.width,
    height: size.height,
    worldPoints,
    viewportOrigin: {
      x: ((region.longitude + 180) / 360) * worldPoints - size.width / 2,
      y: centreY * worldPoints - size.height / 2,
    },

    toScreen(coordinate) {
      return {
        x: size.width / 2 + (wrapLongitude(coordinate.longitude - region.longitude) / 360) * worldPoints,
        y: size.height / 2 + (mercatorY(coordinate.latitude) - centreY) * worldPoints,
      };
    },

    toCoordinate(point) {
      return {
        latitude: inverseMercatorY(centreY + (point.y - size.height / 2) / worldPoints),
        longitude:
          region.longitude + ((point.x - size.width / 2) / worldPoints) * 360,
      };
    },

    pointsPerMetre(latitude) {
      const scale = Math.cos((Math.max(-85, Math.min(85, latitude)) * Math.PI) / 180);
      return worldPoints / (EQUATOR_M * Math.max(1e-6, scale));
    },
  };
}

/** Bring a longitude difference into [-180, 180] so the antimeridian behaves. */
export function wrapLongitude(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
