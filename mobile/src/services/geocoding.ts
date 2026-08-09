import * as Location from 'expo-location';

import { Coordinate } from '../geo';

export interface ResolvedPlace {
  name: string;
  city: string | null;
  country: string | null;
}

/**
 * Turns a coordinate into a real-world place name, so "current place" works
 * anywhere on Earth rather than only near a handful of hardcoded landmarks.
 *
 * Rides the OS's own geocoder (Apple Maps on iOS, Google on Android) via
 * `expo-location` — no API key, and no extra permission beyond what location
 * already needed, since this only ever runs on a coordinate the app already
 * has in hand.
 */
export async function reverseGeocode(coordinate: Coordinate): Promise<ResolvedPlace | null> {
  try {
    const [address] = await Location.reverseGeocodeAsync(coordinate);
    if (!address) return null;

    // `name` is often a point of interest ("Dolores Park"); falling further
    // back trades specificity for always having *something* to show.
    const name = address.name ?? address.street ?? address.district ?? address.city ?? address.region;
    if (!name) return null;

    return {
      name,
      city: address.city ?? address.subregion ?? address.region ?? null,
      country: address.country ?? null,
    };
  } catch {
    // Offline, no network geocoder available, or a simulator with no
    // connectivity — "couldn't name this spot" rather than an error.
    return null;
  }
}
