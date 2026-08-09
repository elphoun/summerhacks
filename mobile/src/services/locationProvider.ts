import { maximumWalkDistanceM, walkingSpeedMps } from '../config';
import { Coordinate, bearing as bearingTo, distanceM, offset } from '../geo';

/**
 * Where the app thinks you are.
 *
 * Everything downstream — the fog, your history, where a photo gets pinned —
 * consumes this and nothing else, so swapping simulated movement for real GPS
 * is a one-line change in AppModel rather than a rewrite.
 */
export interface LocationProvider {
  onUpdate: ((location: Coordinate) => void) | null;
  readonly currentLocation: Coordinate | null;
  start(): void;
  stop(): void;
}

export type Arrival = 'walked' | 'flew';

const TICK_RATE = 20;

/**
 * Movement you can rely on in front of an audience.
 *
 * Two ways to arrive somewhere, and the difference is deliberate: walking emits
 * a stream of fixes and burns a trail through the fog, while flying emits a
 * single fix at the destination. A plane should not uncover a stripe across the
 * planet.
 */
export class SimulatedLocationProvider implements LocationProvider {
  onUpdate: ((location: Coordinate) => void) | null = null;
  currentLocation: Coordinate | null = null;
  isMoving = false;

  private timer: ReturnType<typeof setInterval> | null = null;
  private route: Coordinate[] = [];
  private routeIndex = 0;
  private completion: ((arrival: Arrival) => void) | null = null;

  start(): void {
    if (this.currentLocation) this.onUpdate?.(this.currentLocation);
  }

  stop(): void {
    this.cancelMovement();
  }

  /** Put the explorer somewhere with no journey in between. */
  jump(to: Coordinate): void {
    this.cancelMovement();
    this.emit(to);
  }

  /**
   * Travel to a destination. Short hops are walked (leaving a trail), long ones
   * are flown (leaving nothing but the arrival).
   */
  travel(destination: Coordinate, completion?: (arrival: Arrival) => void): void {
    const origin = this.currentLocation;
    if (!origin) {
      this.jump(destination);
      completion?.('flew');
      return;
    }

    const metres = distanceM(origin, destination);
    if (metres > maximumWalkDistanceM) {
      this.jump(destination);
      completion?.('flew');
      return;
    }

    const steps = Math.max(2, Math.trunc(metres / (walkingSpeedMps / TICK_RATE)));
    const path = Array.from({ length: steps }, (_, index) => {
      const t = (index + 1) / steps;
      return {
        latitude: origin.latitude + (destination.latitude - origin.latitude) * t,
        longitude: origin.longitude + (destination.longitude - origin.longitude) * t,
      };
    });
    this.follow(path, completion);
  }

  /** Mill about for a few blocks, the way someone actually explores a place. */
  wander(radiusM = 420, legs = 6, completion?: (arrival: Arrival) => void): void {
    const origin = this.currentLocation;
    if (!origin) return;

    const path: Coordinate[] = [];
    let cursor = origin;
    let heading = Math.random() * 360;

    for (let leg = 0; leg < legs; leg++) {
      // Turn a little each leg rather than teleporting in a new direction, so
      // the trail through the fog reads as a walk.
      heading += randomBetween(-70, 70);
      const legLength = (radiusM / legs) * randomBetween(1.2, 2.2);
      let target = offset(cursor, legLength, heading);

      // Keep the walk within `radiusM` of where it started. Without this,
      // several legs in the same general direction drift far enough that you
      // end up streets away from the landmark you just arrived at — and the
      // photos left *at* that landmark fall outside the search.
      if (distanceM(origin, target) > radiusM) {
        heading = bearingTo(cursor, origin) + randomBetween(-50, 50);
        target = offset(cursor, legLength, heading);
      }

      const steps = Math.max(2, Math.trunc(legLength / (walkingSpeedMps / TICK_RATE)));
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        path.push({
          latitude: cursor.latitude + (target.latitude - cursor.latitude) * t,
          longitude: cursor.longitude + (target.longitude - cursor.longitude) * t,
        });
      }
      cursor = target;
    }
    this.follow(path, completion);
  }

  cancelMovement(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.route = [];
    this.routeIndex = 0;
    this.isMoving = false;
    this.completion = null;
  }

  // MARK: Internals

  private follow(path: Coordinate[], completion?: (arrival: Arrival) => void): void {
    this.cancelMovement();
    if (path.length === 0) {
      completion?.('walked');
      return;
    }

    this.route = path;
    this.routeIndex = 0;
    this.isMoving = true;
    this.completion = completion ?? null;

    this.timer = setInterval(() => {
      if (this.routeIndex >= this.route.length) {
        const done = this.completion;
        this.cancelMovement();
        done?.('walked');
        return;
      }
      this.emit(this.route[this.routeIndex]);
      this.routeIndex += 1;
    }, 1000 / TICK_RATE);
  }

  private emit(coordinate: Coordinate): void {
    this.currentLocation = coordinate;
    this.onUpdate?.(coordinate);
  }
}

const randomBetween = (low: number, high: number) => low + Math.random() * (high - low);
