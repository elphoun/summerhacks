/**
 * The handful of spherical-geometry functions CoreLocation used to provide.
 *
 * `CLLocation.distance(from:)` is a geodesic on the WGS-84 ellipsoid; this is a
 * great circle on a sphere of the mean radius. The two differ by well under a
 * metre at the distances anything here cares about (a 150m reveal, a 100m
 * search), and the server's own search — server/geo.js — is already haversine,
 * so this keeps the client and the server agreeing on what "100 metres" means.
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Great-circle distance between two coordinates, in metres. */
export function distanceM(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Offset a coordinate by a distance along a bearing. */
export function offset(from: Coordinate, metres: number, bearingDegrees: number): Coordinate {
  const bearing = toRadians(bearingDegrees);
  const angular = metres / EARTH_RADIUS_M;
  const lat1 = toRadians(from.latitude);
  const lon1 = toRadians(from.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );

  // Normalised the way server/geo.js normalises, so walking east past the
  // antimeridian yields -179.9 rather than 180.1 — which the bounding-box
  // search would silently find nothing for.
  return { latitude: toDegrees(lat2), longitude: ((toDegrees(lon2) + 540) % 360) - 180 };
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Bounding box that fully contains the circle of `radiusM` around a point.
 *
 * The cheap half of a two-stage search: a box an index can answer, then an
 * exact haversine pass. Same shape as server/geo.js.
 */
export function bboxFor(centre: Coordinate, radiusM: number): BoundingBox {
  const latDelta = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.cos(toRadians(centre.latitude));
  const lonDelta =
    Math.abs(cosLat) < 1e-6 ? 180 : (radiusM / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);
  const clampedLon = Math.min(180, Math.abs(lonDelta));

  return {
    minLat: centre.latitude - latDelta,
    maxLat: centre.latitude + latDelta,
    minLon: centre.longitude - clampedLon,
    maxLon: centre.longitude + clampedLon,
  };
}

/** Initial bearing from one coordinate to another, in degrees. */
export function bearing(from: Coordinate, to: Coordinate): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return toDegrees(Math.atan2(y, x));
}
