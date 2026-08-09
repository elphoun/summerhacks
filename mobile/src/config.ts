import Constants from 'expo-constants';

/** Everything tunable in one place, so a demo can be adjusted without hunting. */

// MARK: Server

/**
 * The shared photo store.
 *
 * Expo Go runs the JS bundle on a phone but serves it from this Mac, so the
 * address of the machine running `node server.js` is already known: it is the
 * host serving the bundle. That is derived first, which is what makes the demo
 * work on a real phone with no configuration at all.
 *
 * Override with `EXPO_PUBLIC_NIMBUS_SERVER` (a `.env` file or the environment
 * `npx expo start` inherits) to point somewhere else.
 */
function resolveServerBaseURL(): string {
  const override = process.env.EXPO_PUBLIC_NIMBUS_SERVER;
  if (override) return override.replace(/\/$/, '');

  const host = debuggerHost();
  if (host) return `http://${host}:${SERVER_PORT}`;

  return `http://localhost:${SERVER_PORT}`;
}

/** The `host:port` Metro is being served from, without the port. */
function debuggerHost(): string | null {
  const raw =
    Constants.expoConfig?.hostUri ??
    // Older/alternate shapes, kept because a wrong guess here is the one
    // failure that looks like "the server is down" on a real phone.
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  if (!raw) return null;

  const host = raw.split('/')[0].split(':')[0];
  return host.length > 0 ? host : null;
}

const SERVER_PORT = 8788;

export const serverBaseURL = resolveServerBaseURL();

/** `path` joined onto the server, for building request URLs and image sources. */
export function serverURL(path: string): string {
  return `${serverBaseURL}/${path.replace(/^\//, '')}`;
}

// MARK: Exploration (private, on-device)

/**
 * How much of the world one location fix burns off. Roughly "the couple of
 * streets you can see from where you are standing".
 */
export const revealRadiusM = 150;

/**
 * A new fix closer than this to an existing one is dropped. Keeps the
 * breadcrumb list small enough that the fog renderer stays cheap.
 */
export const breadcrumbSpacingM = 60;

/**
 * Zoomed out to the whole world, a 150m hole would be far less than a pixel.
 * Reveals never shrink below this on screen, so your travels stay legible as a
 * constellation.
 */
export const minimumRevealScreenPoints = 5;

/** A fix within this distance of a landmark counts as having visited it. */
export const placeArrivalRadiusM = 900;

// MARK: Discovery
//
// The server is authoritative for the search; these are for wording the UI
// before a response comes back.

export const nearbyPrimaryRadiusM = 100;
export const nearbyFallbackRadiusM = 250;

// MARK: Simulated travel

/** Walking pace for simulated local movement, in metres per second. */
export const walkingSpeedMps = 22;

/**
 * Beyond this, "travelling" is a flight: you arrive, you do not uncover the
 * ground in between. This matters — a plane should not burn a line across the
 * map.
 */
export const maximumWalkDistanceM = 6_000;
