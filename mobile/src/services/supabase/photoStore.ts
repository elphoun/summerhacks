import { Coordinate } from '../../geo';
import { Photo } from '../../model/photo';
import {
  NearbySearchConfig,
  NearbySearchResult,
  NimbusDatabase,
  NimbusUser,
  defaultSearchConfig,
} from './database';

/**
 * A facade over `NimbusDatabase` shaped like the HTTP surface of
 * server/server.js, so a screen written against the local server reads the same
 * against Supabase.
 *
 * What it does *not* carry is friendship: the Supabase schema (schema.sql) has
 * users and photos and nothing else, so there is no friend code to issue and no
 * audience to scope a query to. Swapping `NimbusAPI` for this wholesale means
 * either adding those two tables or accepting that everyone sees everything —
 * which is why the app still talks to the Node server by default.
 */
export class NimbusPhotoStore {
  readonly searchConfig: NearbySearchConfig;
  readonly maxUploadBytes: number;

  photoCount = 0;
  lastError: string | null = null;

  private readonly database: NimbusDatabase;

  constructor(
    database: NimbusDatabase = new NimbusDatabase(),
    searchConfig: NearbySearchConfig = defaultSearchConfig,
    maxUploadBytes = 12_000_000
  ) {
    this.database = database;
    this.searchConfig = searchConfig;
    this.maxUploadBytes = maxUploadBytes;
  }

  // MARK: Health / users (GET /health, /users, POST /users)

  async refreshHealth(): Promise<boolean> {
    try {
      this.photoCount = await this.database.countPhotos();
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  listUsers(): Promise<NimbusUser[]> {
    return this.database.listUsers();
  }

  registerUser(id: string, displayName: string, color = '#6EA8FF'): Promise<NimbusUser> {
    return this.database.upsertUser(id, displayName, color, false);
  }

  // MARK: Discovery (GET /photos/nearby, /photos/bbox)

  nearby(centre: Coordinate, viewerId: string | null): Promise<NearbySearchResult> {
    return this.database.findNearby(centre, viewerId, this.searchConfig);
  }

  photosInBBox(bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  }): Promise<Photo[]> {
    return this.database.photosInBBox(bounds);
  }

  photo(id: string): Promise<Photo | null> {
    return this.database.getPhoto(id);
  }

  // MARK: Upload (POST /photos)

  /**
   * Leave a photo, and get the neighbourhood back in the same call — the reveal
   * is the point of taking it.
   */
  async uploadPhoto(request: {
    imageBase64: string;
    userId: string;
    displayName?: string;
    color?: string;
    coordinate: Coordinate;
    caption?: string;
    takenAt?: number;
    placeName?: string | null;
  }): Promise<{ photo: Photo; nearby: NearbySearchResult }> {
    if (request.imageBase64.length === 0) throw new Error('image data was empty');
    // Base64 carries four characters for every three bytes.
    if ((request.imageBase64.length * 3) / 4 > this.maxUploadBytes) {
      throw new Error('image too large');
    }

    await this.database.upsertUser(
      request.userId,
      request.displayName ?? 'Explorer',
      request.color ?? '#6EA8FF'
    );

    const id = randomIdentifier();
    const mediaFile = await this.database.uploadMedia(id, request.imageBase64);

    const photo = await this.database.insertPhoto({
      id,
      userId: request.userId,
      coordinate: request.coordinate,
      takenAt: request.takenAt ?? Date.now(),
      caption: (request.caption ?? '').slice(0, 280),
      mediaFile,
      placeName: request.placeName ?? null,
    });

    const nearby = await this.database.findNearby(
      request.coordinate,
      request.userId,
      this.searchConfig
    );

    this.photoCount = await this.database.countPhotos();
    return { photo: { ...photo, isYours: true, distanceM: 0 }, nearby };
  }
}

function randomIdentifier(): string {
  const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}
