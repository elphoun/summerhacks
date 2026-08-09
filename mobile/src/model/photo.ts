import { nearbyFallbackRadiusM, nearbyPrimaryRadiusM, serverURL } from '../config';
import { Coordinate } from '../geo';

/**
 * A memory left at a place. This is the shared half of the app: photos belong
 * to everyone who stands near them, unlike exploration state.
 */
export interface Photo {
  id: string;
  userId: string;
  displayName: string;
  color: string;
  lat: number;
  lon: number;
  /** Epoch milliseconds, as the server stores it. */
  takenAt: number;
  caption: string;
  placeName: string | null;
  imagePath: string;

  /** Present on results from a nearby search. */
  distanceM?: number;
  isYours?: boolean;
}

export const photoCoordinate = (photo: Photo): Coordinate => ({
  latitude: photo.lat,
  longitude: photo.lon,
});

export const photoTakenDate = (photo: Photo): Date => new Date(photo.takenAt);

/**
 * The server stores a path relative to itself for locally served media, and an
 * absolute URL when the Supabase backend is in play. Honour both.
 */
export const photoImageURL = (photo: Photo): string =>
  /^https?:\/\//.test(photo.imagePath) ? photo.imagePath : serverURL(photo.imagePath);

/** The result of a radius search, including which radius actually answered it. */
export interface NearbyResult {
  radiusUsed: number;
  expanded: boolean;
  primaryRadiusM: number;
  fallbackRadiusM: number;
  othersCount: number;
  photos: Photo[];
}

export const emptyNearbyResult: NearbyResult = {
  radiusUsed: nearbyPrimaryRadiusM,
  expanded: false,
  primaryRadiusM: nearbyPrimaryRadiusM,
  fallbackRadiusM: nearbyFallbackRadiusM,
  othersCount: 0,
  photos: [],
};

/** Everyone else's photos, which is what the discovery UI is actually about. */
export const otherPeoplesPhotos = (result: NearbyResult): Photo[] =>
  result.photos.filter((photo) => photo.isYours !== true);

/**
 * Uploading returns the neighbourhood in the same round trip, because the
 * reveal is the point of taking the photo.
 */
export interface UploadResponse {
  photo: Photo;
  nearby: NearbyResult;
}

export interface PhotoListResponse {
  photos: Photo[];
}
