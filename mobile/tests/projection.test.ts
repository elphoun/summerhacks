// Tests for the map projection.
//
// MapKit used to hand the fog renderer a map-point space and a zoom scale, and
// none of this arithmetic existed. react-native-maps reports a region and
// nothing else, so the projection is now the app's own — which makes it worth
// checking, because everything drawn over the map (cloud, pins, the explorer's
// dot) is only registered against the map if this is right.

import { distanceM, offset } from '../src/geo';
import { projectionFor, wrapLongitude } from '../src/map/projection';

const SIZE = { width: 390, height: 760 };

const regionAround = (latitude: number, longitude: number, span = 0.02) => ({
  latitude,
  longitude,
  latitudeDelta: span,
  longitudeDelta: span,
});

test('the centre of the region lands in the centre of the view', () => {
  const region = regionAround(48.8584, 2.2945);
  const projection = projectionFor(region, SIZE);
  const centre = projection.toScreen(region);

  expect(centre.x).toBeCloseTo(SIZE.width / 2, 6);
  expect(centre.y).toBeCloseTo(SIZE.height / 2, 6);
});

test('projecting and unprojecting round-trips', () => {
  const projection = projectionFor(regionAround(48.8584, 2.2945), SIZE);
  const point = { x: 130, y: 615 };
  const there = projection.toCoordinate(point);
  const back = projection.toScreen(there);

  expect(back.x).toBeCloseTo(point.x, 6);
  expect(back.y).toBeCloseTo(point.y, 6);
});

test('north is up and east is right', () => {
  const region = regionAround(48.8584, 2.2945);
  const projection = projectionFor(region, SIZE);

  const north = projection.toScreen(offset(region, 300, 0));
  const east = projection.toScreen(offset(region, 300, 90));

  expect(north.y).toBeLessThan(SIZE.height / 2);
  expect(east.x).toBeGreaterThan(SIZE.width / 2);
});

// A reveal has to come out round, or the fog would erase ellipses.
test('a metre measures the same in both directions', () => {
  for (const latitude of [0, 37.8, 48.86, -33.86, 64]) {
    const region = regionAround(latitude, 12.4922);
    const projection = projectionFor(region, SIZE);
    const centre = projection.toScreen(region);

    const north = projection.toScreen(offset(region, 200, 0));
    const east = projection.toScreen(offset(region, 200, 90));

    const vertical = Math.abs(north.y - centre.y);
    const horizontal = Math.abs(east.x - centre.x);
    expect(vertical / horizontal).toBeCloseTo(1, 2);
  }
});

test('pointsPerMetre agrees with what the projection actually draws', () => {
  const region = regionAround(37.8199, -122.4783);
  const projection = projectionFor(region, SIZE);
  const centre = projection.toScreen(region);
  const east = projection.toScreen(offset(region, 500, 90));

  // Within a tenth of a percent: the projection measures the world against the
  // WGS-84 equator, as Mercator does, while `offset` walks a sphere of the mean
  // radius. That gap is the ellipsoid, not a mistake.
  const measured = Math.abs(east.x - centre.x) / 500;
  expect(measured / projection.pointsPerMetre(region.latitude)).toBeCloseTo(1, 2);
});

test('a viewport straddling the antimeridian does not fold in half', () => {
  const region = regionAround(-16.5, 179.99);
  const projection = projectionFor(region, SIZE);

  // A point 2km east of the centre is over the line at longitude -180.
  const acrossTheLine = offset(region, 2_000, 90);
  expect(acrossTheLine.longitude).toBeLessThan(0);

  const point = projection.toScreen(acrossTheLine);
  expect(point.x).toBeGreaterThan(SIZE.width / 2);
  expect(point.x - SIZE.width / 2).toBeLessThan(SIZE.width);
});

test('unprojecting a screen point gives back a real coordinate', () => {
  const region = regionAround(35.6595, 139.7005);
  const projection = projectionFor(region, SIZE);

  const corner = projection.toCoordinate({ x: 0, y: 0 });
  expect(corner.latitude).toBeGreaterThan(region.latitude);
  expect(corner.longitude).toBeLessThan(region.longitude);
  // The whole viewport is a couple of kilometres across at this zoom.
  expect(distanceM(region, corner)).toBeLessThan(10_000);
});

test('longitude differences wrap into a half turn', () => {
  expect(wrapLongitude(0)).toBe(0);
  expect(wrapLongitude(190)).toBeCloseTo(-170, 9);
  expect(wrapLongitude(-190)).toBeCloseTo(170, 9);
  expect(wrapLongitude(360)).toBeCloseTo(0, 9);
});
