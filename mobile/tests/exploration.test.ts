// Tests for the exploration model — the private half of Nimbus.
//
// These check the property the whole product rests on: a map belongs to one
// identity, and nothing another person does can uncover ground on it.
// Friendship shares photographs; it never shares movement.
//
// The store takes its storage as an argument, so all of this runs against a
// scratch dictionary in memory — no device, no simulator, no network.

import { Coordinate, offset } from '../src/geo';
import { nearestPlace } from '../src/model/place';
import { ExplorationStore } from '../src/services/explorationStore';
import { KeyValueStore, memoryStore } from '../src/services/storage';

const PARIS: Coordinate = { latitude: 48.8584, longitude: 2.2945 };

/** All the explorers in one test share a device, as they would in life. */
let device: KeyValueStore;

const storeFor = (explorerID: string) => new ExplorationStore(explorerID, device);
const reloaded = (explorerID: string) => storeFor(explorerID).load();

beforeEach(() => {
  device = memoryStore();
});

test('a fresh explorer has uncovered nothing', () => {
  const store = storeFor('fresh');

  expect(store.hasExploredAnywhere).toBe(false);
  expect(store.isExplored(PARIS)).toBe(false);
  expect(store.placesDiscovered).toBe(0);
});

test('standing somewhere uncovers it, and only nearby ground', () => {
  const store = storeFor('alex');
  store.record(PARIS);

  expect(store.isExplored(PARIS)).toBe(true);
  // The reveal radius is 150m.
  expect(store.isExplored(offset(PARIS, 120, 45))).toBe(true);
  expect(store.isExplored(offset(PARIS, 400, 45))).toBe(false);
  expect(store.isExplored(offset(PARIS, 50_000, 45))).toBe(false);
});

// The product's central claim: your friends' travels are not yours.
test('a map is keyed to one identity and no other can uncover it', async () => {
  const mine = storeFor('me-2');
  const theirs = storeFor('friend-2');

  mine.record(PARIS);

  expect(mine.isExplored(PARIS)).toBe(true);
  expect(theirs.isExplored(PARIS)).toBe(false);
  expect(theirs.hasExploredAnywhere).toBe(false);

  // And it holds after their map is read back from storage.
  const theirsAgain = await reloaded('friend-2');
  expect(theirsAgain.isExplored(PARIS)).toBe(false);
});

test('fixes closer together than the spacing do not pile up breadcrumbs', () => {
  const store = storeFor('dedupe');
  for (let i = 0; i < 10; i++) {
    store.record(offset(PARIS, Math.random() * 25, 45));
  }
  expect(store.points).toHaveLength(1);
});

test('walking a route leaves a trail of breadcrumbs', () => {
  const store = storeFor('walk');
  for (let step = 0; step < 10; step++) {
    store.record(offset(PARIS, step * 100, 90));
  }
  expect(store.points.length).toBeGreaterThanOrEqual(8);
  expect(store.isExplored(offset(PARIS, 900, 90))).toBe(true);
});

test('arriving at a landmark records one visit, not one per step', () => {
  const store = storeFor('visits');
  for (let step = 0; step < 6; step++) {
    store.record(offset(PARIS, step * 70, 20));
  }
  expect(store.placesDiscovered).toBe(1);
  expect(store.visits[0]?.placeName).toBe('Eiffel Tower');
});

test('exploration survives a relaunch', async () => {
  const first = storeFor('persist');
  first.record(PARIS);
  first.notePhotoLeft();

  const second = await reloaded('persist');
  expect(second.isExplored(PARIS)).toBe(true);
  expect(second.photosLeft).toBe(1);
  expect(second.placesDiscovered).toBe(1);
});

test('resetting clouds one map over without touching any other', () => {
  const a = storeFor('reset-a');
  const b = storeFor('reset-b');
  a.record(PARIS);
  b.record(PARIS);

  a.reset();
  expect(a.isExplored(PARIS)).toBe(false);
  expect(b.isExplored(PARIS)).toBe(true);
});

test('uncovered area is reported in a sane range', () => {
  const store = storeFor('area');
  expect(store.uncoveredAreaKm2).toBe(0);

  store.record(PARIS);
  // A 150m circle is ~0.07 km²; the grid measures it in ~220m cells, so
  // anything in this window is the right order of magnitude.
  expect(store.uncoveredAreaKm2).toBeGreaterThan(0.01);
  expect(store.uncoveredAreaKm2).toBeLessThan(0.5);
});

test('landmark lookup only claims a place you are actually at', () => {
  expect(nearestPlace(PARIS)?.name).toBe('Eiffel Tower');
  expect(nearestPlace(offset(PARIS, 5_000, 45))).toBeNull();
  expect(nearestPlace({ latitude: -40, longitude: -130 })).toBeNull();
});
