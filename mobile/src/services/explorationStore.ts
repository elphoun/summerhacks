import { breadcrumbSpacingM, revealRadiusM } from '../config';
import { Coordinate, distanceM } from '../geo';
import { nearestPlace } from '../model/place';
import { KeyValueStore, deviceStore } from './storage';

/** One place you stood, and the circle of world it burned off your fog. */
export interface ExploredPoint {
  latitude: number;
  longitude: number;
  /** Epoch milliseconds. */
  discoveredAt: number;
  radiusM: number;
}

/** The first time you reached a named landmark. */
export interface Visit {
  id: string;
  placeName: string;
  city: string;
  country: string;
  /** Epoch milliseconds. */
  firstSeen: number;
}

interface Snapshot {
  points: ExploredPoint[];
  visits: Visit[];
  photosLeft: number;
  lastLatitude?: number;
  lastLongitude?: number;
}

/**
 * ~1.1km — comfortably larger than a reveal radius, so checking a 3x3
 * neighbourhood of cells is guaranteed to find every candidate.
 */
const INDEX_CELL_SIZE = 0.01;
/** ~220m, the resolution the area statistic is measured at. */
const COVERAGE_CELL_SIZE = 0.002;

/**
 * Everything one explorer has uncovered.
 *
 * This is the private half of Nimbus and it is private *structurally*: the
 * record lives in this app's own storage, keyed by explorer, and no part of the
 * API layer can read it. Another user travelling somewhere cannot uncover it
 * for you, because their travels never leave their own device.
 */
export class ExplorationStore {
  readonly explorerID: string;

  points: ExploredPoint[] = [];
  visits: Visit[] = [];
  photosLeft = 0;
  /** Where this explorer was when the app last saw them. */
  lastCoordinate: Coordinate | null = null;

  /** Fine grid of covered cells, kept incrementally for the area statistic. */
  private coveredCells = new Set<string>();
  /** Coarse spatial index so `isExplored` does not scan every breadcrumb. */
  private index = new Map<string, number[]>();

  private readonly storage: KeyValueStore;
  private readonly key: string;

  /**
   * `storage` is injectable so the logic tests can run against memory instead
   * of the device's own store.
   */
  constructor(explorerID: string, storage: KeyValueStore = deviceStore) {
    this.explorerID = explorerID;
    this.storage = storage;
    this.key = `nimbus.exploration.${explorerID}`;
  }

  /**
   * Reads this explorer's record back. Separate from the constructor because
   * device storage is asynchronous; until this resolves the map is simply
   * clouded over, which is also the correct state for a first launch.
   */
  async load(): Promise<this> {
    const raw = await this.storage.get(this.key);
    if (!raw) return this;

    let snapshot: Snapshot;
    try {
      snapshot = JSON.parse(raw) as Snapshot;
    } catch {
      return this;
    }

    this.points = snapshot.points ?? [];
    this.visits = snapshot.visits ?? [];
    this.photosLeft = snapshot.photosLeft ?? 0;
    if (snapshot.lastLatitude != null && snapshot.lastLongitude != null) {
      this.lastCoordinate = { latitude: snapshot.lastLatitude, longitude: snapshot.lastLongitude };
    }
    this.rebuildDerivedState();
    return this;
  }

  // MARK: Recording

  /**
   * Record a location fix. Returns true if this actually uncovered new ground,
   * which is the cue for the map to redraw.
   */
  record(coordinate: Coordinate): boolean {
    this.lastCoordinate = coordinate;
    this.noteArrival(coordinate);

    if (this.isTooCloseToExistingPoint(coordinate)) {
      this.save();
      return false;
    }

    const point: ExploredPoint = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      discoveredAt: Date.now(),
      radiusM: revealRadiusM,
    };
    this.points.push(point);
    this.addToIndex(point, this.points.length - 1);
    this.addCoverage(point);
    this.save();
    return true;
  }

  notePhotoLeft(): void {
    this.photosLeft += 1;
    this.save();
  }

  /** Wipes this explorer back to a fresh install. Only they are affected. */
  reset(): void {
    this.points = [];
    this.visits = [];
    this.photosLeft = 0;
    this.coveredCells = new Set();
    this.index = new Map();
    this.lastCoordinate = null;
    this.save();
  }

  // MARK: Queries

  /**
   * Has this explorer uncovered this spot? Gates whether other people's photos
   * here are visible at all.
   */
  isExplored(coordinate: Coordinate): boolean {
    for (const cell of neighbourhood(coordinate, INDEX_CELL_SIZE)) {
      for (const i of this.index.get(cell) ?? []) {
        const point = this.points[i];
        if (distanceM(coordinate, point) <= point.radiusM) return true;
      }
    }
    return false;
  }

  get hasExploredAnywhere(): boolean {
    return this.points.length > 0;
  }

  /**
   * Approximate uncovered area, from the fine coverage grid rather than by
   * summing circles, so overlapping breadcrumbs are not double counted.
   */
  get uncoveredAreaKm2(): number {
    let total = 0;
    for (const cell of this.coveredCells) {
      const { y } = parseCell(cell);
      const latitude = (y + 0.5) * COVERAGE_CELL_SIZE;
      const metres = COVERAGE_CELL_SIZE * 111_320;
      total += (metres * metres * Math.cos((latitude * Math.PI) / 180)) / 1_000_000;
    }
    return total;
  }

  get placesDiscovered(): number {
    return this.visits.length;
  }

  get mostRecentVisits(): Visit[] {
    return [...this.visits].sort((a, b) => b.firstSeen - a.firstSeen);
  }

  /**
   * Straight-line distance covered between consecutive breadcrumbs — an
   * underestimate of the true path, but a real one, not a guess.
   */
  get totalDistanceM(): number {
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      total += distanceM(this.points[i - 1], this.points[i]);
    }
    return total;
  }

  /** A rough step count from distance covered, at an average stride of 0.75m. */
  get estimatedSteps(): number {
    return Math.trunc(this.totalDistanceM / 0.75);
  }

  /**
   * Consecutive calendar days of exploration, counting back from the most
   * recent day something was uncovered.
   */
  get streakDays(): number {
    if (this.points.length === 0) return 0;

    const days = [...new Set(this.points.map((point) => startOfDay(point.discoveredAt)))].sort(
      (a, b) => b - a
    );

    let streak = 1;
    let cursor = days[0];
    for (const day of days.slice(1)) {
      const expected = startOfDay(cursor - 12 * 60 * 60 * 1000);
      if (day !== expected) break;
      streak += 1;
      cursor = day;
    }
    return streak;
  }

  // MARK: Internals

  private isTooCloseToExistingPoint(coordinate: Coordinate): boolean {
    for (const cell of neighbourhood(coordinate, INDEX_CELL_SIZE)) {
      for (const i of this.index.get(cell) ?? []) {
        if (distanceM(coordinate, this.points[i]) < breadcrumbSpacingM) return true;
      }
    }
    return false;
  }

  private noteArrival(coordinate: Coordinate): void {
    const place = nearestPlace(coordinate);
    if (!place) return;
    if (this.visits.some((visit) => visit.id === place.id)) return;

    this.visits.push({
      id: place.id,
      placeName: place.name,
      city: place.city,
      country: place.country,
      firstSeen: Date.now(),
    });
  }

  private addToIndex(point: ExploredPoint, offset: number): void {
    const key = cellKey(point, INDEX_CELL_SIZE);
    const bucket = this.index.get(key);
    if (bucket) bucket.push(offset);
    else this.index.set(key, [offset]);
  }

  private addCoverage(point: ExploredPoint): void {
    // Mark every fine cell whose centre falls inside the revealed circle.
    const latitudeScale = Math.max(0.2, Math.cos((point.latitude * Math.PI) / 180));
    const span =
      Math.ceil(point.radiusM / (COVERAGE_CELL_SIZE * 111_320 * latitudeScale)) + 1;
    const origin = cellIndices(point, COVERAGE_CELL_SIZE);

    for (let dx = -span; dx <= span; dx++) {
      for (let dy = -span; dy <= span; dy++) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        const centre = {
          latitude: (y + 0.5) * COVERAGE_CELL_SIZE,
          longitude: (x + 0.5) * COVERAGE_CELL_SIZE,
        };
        if (distanceM(point, centre) <= point.radiusM) this.coveredCells.add(`${x}:${y}`);
      }
    }
  }

  private rebuildDerivedState(): void {
    this.index = new Map();
    this.coveredCells = new Set();
    this.points.forEach((point, offset) => {
      this.addToIndex(point, offset);
      this.addCoverage(point);
    });
  }

  // MARK: Persistence

  /**
   * Fire-and-forget: a dropped write costs at most the breadcrumbs since the
   * last one, and blocking a location fix on storage would stutter the walk.
   */
  private save(): void {
    const snapshot: Snapshot = {
      points: this.points,
      visits: this.visits,
      photosLeft: this.photosLeft,
      lastLatitude: this.lastCoordinate?.latitude,
      lastLongitude: this.lastCoordinate?.longitude,
    };
    void this.storage.set(this.key, JSON.stringify(snapshot));
  }
}

// MARK: - An integer grid cell on a fixed degree lattice

const cellIndices = (coordinate: Coordinate, size: number) => ({
  x: Math.floor(coordinate.longitude / size),
  y: Math.floor(coordinate.latitude / size),
});

const cellKey = (coordinate: Coordinate, size: number) => {
  const { x, y } = cellIndices(coordinate, size);
  return `${x}:${y}`;
};

const parseCell = (key: string) => {
  const [x, y] = key.split(':');
  return { x: Number(x), y: Number(y) };
};

function neighbourhood(coordinate: Coordinate, size: number): string[] {
  const { x, y } = cellIndices(coordinate, size);
  const cells: string[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) cells.push(`${x + dx}:${y + dy}`);
  }
  return cells;
}

/** Local-midnight epoch millis for a timestamp, for the streak count. */
function startOfDay(epochMs: number): number {
  const date = new Date(epochMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
