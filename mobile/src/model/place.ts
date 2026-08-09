import { placeArrivalRadiusM } from '../config';
import { Coordinate, distanceM } from '../geo';

/**
 * A landmark used for travel presets and for naming places in your history.
 *
 * Coordinates mirror server/places.js, where the seed photographs are
 * clustered. Keep the two in sync if you add somewhere.
 */
export interface Place {
  id: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

export const PLACES: Place[] = [
  { id: 'eiffel', name: 'Eiffel Tower', city: 'Paris', country: 'France', latitude: 48.8584, longitude: 2.2945 },
  { id: 'golden-gate', name: 'Golden Gate Bridge', city: 'San Francisco', country: 'USA', latitude: 37.8199, longitude: -122.4783 },
  { id: 'shibuya', name: 'Shibuya Crossing', city: 'Tokyo', country: 'Japan', latitude: 35.6595, longitude: 139.7005 },
  { id: 'times-square', name: 'Times Square', city: 'New York', country: 'USA', latitude: 40.758, longitude: -73.9855 },
  { id: 'sagrada', name: 'Sagrada Família', city: 'Barcelona', country: 'Spain', latitude: 41.4036, longitude: 2.1744 },
  { id: 'colosseum', name: 'Colosseum', city: 'Rome', country: 'Italy', latitude: 41.8902, longitude: 12.4922 },
  { id: 'opera-house', name: 'Sydney Opera House', city: 'Sydney', country: 'Australia', latitude: -33.8568, longitude: 151.2153 },
  { id: 'marina-bay', name: 'Marina Bay Sands', city: 'Singapore', country: 'Singapore', latitude: 1.2834, longitude: 103.8607 },
  { id: 'table-mountain', name: 'Table Mountain', city: 'Cape Town', country: 'South Africa', latitude: -33.9628, longitude: 18.4098 },
  { id: 'griffith', name: 'Griffith Observatory', city: 'Los Angeles', country: 'USA', latitude: 34.1184, longitude: -118.3004 },
  { id: 'brooklyn-bridge', name: 'Brooklyn Bridge', city: 'New York', country: 'USA', latitude: 40.7061, longitude: -73.9969 },
  { id: 'trevi', name: 'Trevi Fountain', city: 'Rome', country: 'Italy', latitude: 41.9009, longitude: 12.4833 },
];

/**
 * Where a brand new, wholly clouded map opens. Nothing is uncovered here yet —
 * it is just somewhere to point the camera other than the null island.
 */
export const homePlace: Place = PLACES.find((place) => place.id === 'golden-gate') ?? PLACES[0];

/** The landmark you are standing at, if any. */
export function nearestPlace(
  coordinate: Coordinate,
  withinM: number = placeArrivalRadiusM
): Place | null {
  let best: Place | null = null;
  let bestDistance = Infinity;

  for (const place of PLACES) {
    const metres = distanceM(coordinate, place);
    if (metres <= withinM && metres < bestDistance) {
      best = place;
      bestDistance = metres;
    }
  }
  return best;
}
