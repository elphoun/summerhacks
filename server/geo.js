// Geographic helpers for the nearby-photo search.
//
// The search is deliberately two-stage: a cheap bounding-box prefilter that
// SQLite can answer from an index, then an exact haversine pass in JS. At
// hackathon data volumes either stage alone would do, but this is the shape a
// real implementation wants, and it keeps the SQL portable (no spatial ext).

const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in metres. */
export function haversineM(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Bounding box that fully contains the circle of `radiusM` around a point.
 * Longitude degrees shrink with latitude, so the lon delta is scaled by
 * 1/cos(lat); near the poles that blows up, so it is clamped to a full sweep.
 */
export function bboxFor(lat, lon, radiusM) {
  const latDelta = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.cos(toRad(lat));
  const lonDelta =
    Math.abs(cosLat) < 1e-6
      ? 180
      : (radiusM / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - Math.min(180, Math.abs(lonDelta)),
    maxLon: lon + Math.min(180, Math.abs(lonDelta)),
  };
}

/** Offset a coordinate by a distance and bearing. Used to scatter seed photos. */
export function offsetCoordinate(lat, lon, distanceM, bearingDeg) {
  const bearing = toRad(bearingDeg);
  const angular = distanceM / EARTH_RADIUS_M;
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
  };
}
