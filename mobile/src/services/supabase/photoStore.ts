import { Coordinate } from '../../geo';
import { Photo } from '../../model/photo';
import {
  FriendStats,
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
 * The audience rule server/server.js applies to every photo route is applied
 * here too — but from the client, which is the one thing this cannot do as well
 * as the server does. See the note in schema.sql: with the publishable key
 * there is no identity for a row-level policy to test, so the filter narrows
 * what the app asks for rather than what the database is willing to answer.
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

  /**
   * Register or rename, and get back the friend code and current friends —
   * the same round trip as `POST /users`, and the same place this device's
   * travels are reported for the friends leaderboard.
   */
  async registerUser(
    id: string,
    displayName: string,
    color = '#6EA8FF',
    stats?: FriendStats
  ): Promise<{ user: NimbusUser; friends: NimbusUser[] }> {
    const user = await this.database.upsertUser(id, displayName, color, false, stats);
    await this.database.befriendSeedUsers(id);
    return { user, friends: await this.database.listFriends(id) };
  }

  // MARK: Friends (GET /friends, POST /friends)

  friends(userId: string): Promise<NimbusUser[]> {
    return this.database.listFriends(userId);
  }

  findUserByCode(code: string): Promise<NimbusUser | null> {
    return this.database.findUserByCode(code);
  }

  async addFriend(userId: string, friendId: string): Promise<NimbusUser[]> {
    await this.database.addFriendship(userId, friendId);
    return this.database.listFriends(userId);
  }

  // MARK: Discovery (GET /photos/nearby, /photos/bbox)

  async nearby(centre: Coordinate, viewerId: string | null): Promise<NearbySearchResult> {
    const audience = await this.database.audienceFor(viewerId);
    return this.database.findNearby(centre, viewerId, this.searchConfig, audience);
  }

  async photosInBBox(
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
    viewerId: string | null = null
  ): Promise<Photo[]> {
    const audience = await this.database.audienceFor(viewerId);
    return this.database.photosInBBox(bounds, audience);
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

    const nearby = await this.nearby(request.coordinate, request.userId);

    this.photoCount = await this.database.countPhotos();
    return { photo: { ...photo, isYours: true, distanceM: 0 }, nearby };
  }

  // MARK: Delete (DELETE /photos)

  async deleteMyPhotos(userId: string): Promise<void> {
    await this.database.deletePhotosByUser(userId);
    this.photoCount = await this.database.countPhotos();
  }
}

function randomIdentifier(): string {
  const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}
