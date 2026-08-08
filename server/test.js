// Tests for the part of Nimbus that is easy to get quietly wrong: the radius
// search and its fallback. Run with `node --test` from server/.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findNearby, findWithinRadius, insertPhoto, openDatabase, upsertUser } from './db.js';
import { haversineM, offsetCoordinate } from './geo.js';
import { PLACES } from './places.js';

const CONFIG = { primaryRadiusM: 100, fallbackRadiusM: 250, minResults: 3 };
const EIFFEL = { lat: 48.8584, lon: 2.2945 };

function freshDb() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-')), 'test.db');
  const db = openDatabase(file);
  upsertUser(db, { id: 'u-a', displayName: 'A', color: '#fff' });
  upsertUser(db, { id: 'u-b', displayName: 'B', color: '#fff' });
  upsertUser(db, { id: 'viewer', displayName: 'Viewer', color: '#fff' });
  return db;
}

/** Place a photo `distanceM` from the Eiffel Tower, on a fixed bearing. */
function plant(db, id, userId, distanceM, bearing = 45) {
  const { lat, lon } = offsetCoordinate(EIFFEL.lat, EIFFEL.lon, distanceM, bearing);
  return insertPhoto(db, {
    id,
    userId,
    lat,
    lon,
    takenAt: 1_700_000_000_000,
    caption: id,
    mediaFile: `${id}.png`,
  });
}

test('haversine matches known distances', () => {
  // Paris -> London, ~344km.
  const parisToLondon = haversineM(48.8584, 2.2945, 51.5007, -0.1246);
  assert.ok(Math.abs(parisToLondon - 344_000) < 4_000, `got ${parisToLondon}`);

  // A metre is a metre, even at high latitude.
  const short = haversineM(64.1466, -21.9426, ...Object.values(offsetCoordinate(64.1466, -21.9426, 100, 90)));
  assert.ok(Math.abs(short - 100) < 1, `got ${short}`);
});

test('radius search excludes photos outside the circle, including box corners', () => {
  const db = freshDb();
  plant(db, 'inside', 'u-a', 50);
  plant(db, 'edge', 'u-a', 99);
  plant(db, 'outside', 'u-a', 140);
  // A bounding box around 100m reaches ~141m at its corners; this photo sits
  // in that corner and must still be rejected by the exact haversine pass.
  plant(db, 'corner', 'u-a', 135, 45);

  const found = findWithinRadius(db, { ...EIFFEL, radiusM: 100 }).map((p) => p.id);
  assert.deepEqual(found, ['inside', 'edge']);
});

test('results come back nearest first with distances attached', () => {
  const db = freshDb();
  plant(db, 'far', 'u-a', 90);
  plant(db, 'near', 'u-b', 10);
  plant(db, 'mid', 'u-a', 50);

  const found = findWithinRadius(db, { ...EIFFEL, radiusM: 100 });
  assert.deepEqual(found.map((p) => p.id), ['near', 'mid', 'far']);
  assert.ok(Math.abs(found[0].distanceM - 10) <= 1);
});

test('three or more neighbours keeps the search at 100m', () => {
  const db = freshDb();
  plant(db, 'p1', 'u-a', 20);
  plant(db, 'p2', 'u-b', 40);
  plant(db, 'p3', 'u-a', 80);
  plant(db, 'p4', 'u-b', 180); // inside the fallback radius, must not appear

  const result = findNearby(db, { ...EIFFEL, viewerId: 'viewer', config: CONFIG });
  assert.equal(result.radiusUsed, 100);
  assert.equal(result.expanded, false);
  assert.equal(result.othersCount, 3);
  assert.deepEqual(result.photos.map((p) => p.id), ['p1', 'p2', 'p3']);
});

test('fewer than three neighbours widens the search to 250m', () => {
  const db = freshDb();
  plant(db, 'close', 'u-a', 30);
  plant(db, 'wide1', 'u-b', 160);
  plant(db, 'wide2', 'u-a', 240);
  plant(db, 'too-far', 'u-b', 400);

  const result = findNearby(db, { ...EIFFEL, viewerId: 'viewer', config: CONFIG });
  assert.equal(result.radiusUsed, 250);
  assert.equal(result.expanded, true);
  assert.equal(result.othersCount, 3);
  assert.deepEqual(result.photos.map((p) => p.id), ['close', 'wide1', 'wide2']);
});

test('your own photos do not count as company, but are still returned and flagged', () => {
  const db = freshDb();
  plant(db, 'mine1', 'viewer', 10);
  plant(db, 'mine2', 'viewer', 20);
  plant(db, 'mine3', 'viewer', 30);
  plant(db, 'theirs', 'u-a', 200);

  const result = findNearby(db, { ...EIFFEL, viewerId: 'viewer', config: CONFIG });
  // Three photos within 100m, but all the viewer's own — so it still widens.
  assert.equal(result.expanded, true);
  assert.equal(result.radiusUsed, 250);
  assert.equal(result.othersCount, 1);
  assert.equal(result.photos.filter((p) => p.isYours).length, 3);
});

test('the middle of the ocean returns nothing rather than failing', () => {
  const db = freshDb();
  plant(db, 'paris', 'u-a', 10);

  const result = findNearby(db, { lat: -40.1, lon: -130.5, viewerId: 'viewer', config: CONFIG });
  assert.deepEqual(result.photos, []);
  assert.equal(result.othersCount, 0);
  assert.equal(result.expanded, true);
});

test('the antimeridian and the poles do not blow up the bounding box', () => {
  const db = freshDb();
  for (const point of [
    { lat: 0, lon: 179.9999 },
    { lat: 89.99, lon: 12 },
    { lat: -89.99, lon: -170 },
  ]) {
    const result = findNearby(db, { ...point, viewerId: 'viewer', config: CONFIG });
    assert.ok(Array.isArray(result.photos));
  }
});

test('the seeded sparse landmark is the one that triggers the fallback', () => {
  const sparse = PLACES.filter((place) => place.sparse);
  assert.equal(sparse.length, 1, 'exactly one landmark should be scattered for the demo');
  assert.equal(sparse[0].id, 'griffith');
});
