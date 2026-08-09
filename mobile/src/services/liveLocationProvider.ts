import * as Location from 'expo-location';

import { Coordinate } from '../geo';
import { LocationProvider } from './locationProvider';

export type AuthorizationStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Real device GPS, behind the same protocol as the simulator.
 *
 * Turning this into true background exploration — the app uncovering your map
 * while it is in your pocket — needs no changes elsewhere:
 *
 *   1. `Location.requestBackgroundPermissionsAsync()` alongside the foreground
 *      request (the Info.plist string is already declared in app.json),
 *   2. `Location.startLocationUpdatesAsync` with a TaskManager task instead of
 *      `watchPositionAsync`,
 *   3. for battery, `accuracy: Location.Accuracy.Balanced` and a distance
 *      interval around 500m — about the granularity the fog uses anyway.
 *
 * Steps 2 and 3 need a development build rather than Expo Go, because
 * background location is not one of the entitlements the Expo Go app carries.
 * Everything downstream already treats fixes as arriving whenever they arrive.
 */
export class LiveLocationProvider implements LocationProvider {
  onUpdate: ((location: Coordinate) => void) | null = null;
  /** Surfaced so the UI can explain a refusal instead of silently doing nothing. */
  onAuthorizationChange: ((status: AuthorizationStatus) => void) | null = null;

  currentLocation: Coordinate | null = null;

  private subscription: Location.LocationSubscription | null = null;
  /** Bumped on every start/stop so a permission prompt answered after the
   * switch was flipped back off cannot resurrect the watch. */
  private generation = 0;

  start(): void {
    const generation = ++this.generation;

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (generation !== this.generation) return;

      this.onAuthorizationChange?.(toAuthorizationStatus(status));
      if (status !== Location.PermissionStatus.GRANTED) return;

      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 25,
          },
          ({ coords }) => {
            const coordinate = { latitude: coords.latitude, longitude: coords.longitude };
            this.currentLocation = coordinate;
            this.onUpdate?.(coordinate);
          }
        );

        if (generation !== this.generation) {
          subscription.remove();
          return;
        }
        this.subscription = subscription;
      } catch (error) {
        // A simulator with no location set fails here constantly; it is not
        // worth surfacing, the simulated provider is the default anyway.
        console.log('[Nimbus] location error:', error);
      }
    })();
  }

  stop(): void {
    this.generation += 1;
    this.subscription?.remove();
    this.subscription = null;
  }
}

function toAuthorizationStatus(status: Location.PermissionStatus): AuthorizationStatus {
  switch (status) {
    case Location.PermissionStatus.GRANTED:
      return 'granted';
    case Location.PermissionStatus.DENIED:
      return 'denied';
    default:
      return 'undetermined';
  }
}
