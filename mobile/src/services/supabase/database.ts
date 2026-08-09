import { Coordinate, bboxFor, distanceM } from '../../geo';
import { Photo } from '../../model/photo';
import { mediaBucket, requireSupabaseConfig } from './env';

/**
 * PostgreSQL-backed storage for the shared half of Nimbus.
 *
 * A port of server/db.js: users, photos, radius search, and the
 * primary/fallback discovery query — against Supabase (PostgREST + Storage)
 * instead of SQLite. Plain `fetch` rather than the Supabase SDK, so this stays
 * as dependency-free as the server it mirrors.
 */

export interface NimbusUser {
  id: string;
  displayName: string;
  color: string;
  isSeed: boolean;
}

/** Discovery search tuning — mirrors server/config.json. */
export interface NearbySearchConfig {
  primaryRadiusM: number;
  fallbackRadiusM: number;
  minResults: number;
}

export const defaultSearchConfig: NearbySearchConfig = {
  primaryRadiusM: 100,
  fallbackRadiusM: 250,
  minResults: 3,
};

/** Result of the core discovery query (server/db.js `findNearby`). */
export interface NearbySearchResult {
  radiusUsed: number;
  expanded: boolean;
  primaryRadiusM: number;
  fallbackRadiusM: number;
  othersCount: number;
  photos: Photo[];
}

const PHOTO_SELECT =
  'id,user_id,lat,lon,taken_at,caption,media_file,place_name,users!inner(display_name,color)';

interface PhotoRow {
  id: string;
  user_id: string;
  lat: number;
  lon: number;
  taken_at: number;
  caption: string;
  media_file: string;
  place_name: string | null;
  users: { display_name: string; color: string };
}

interface UserRow {
  id: string;
  display_name: string;
  color: string;
  is_seed: boolean;
}

export class NimbusDatabase {
  // MARK: Users

  async upsertUser(
    id: string,
    displayName: string,
    color: string,
    isSeed = false
  ): Promise<NimbusUser> {
    const [row] = await this.rest<UserRow[]>('users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        { id, display_name: displayName, color, is_seed: isSeed },
      ]),
    });
    return asUser(row);
  }

  async listUsers(): Promise<NimbusUser[]> {
    const rows = await this.rest<UserRow[]>('users?select=*&order=is_seed,display_name');
    return rows.map(asUser);
  }

  // MARK: Photos

  async insertPhoto(photo: {
    id: string;
    userId: string;
    coordinate: Coordinate;
    takenAt: number;
    caption?: string;
    mediaFile: string;
    placeName?: string | null;
  }): Promise<Photo> {
    await this.rest<unknown>('photos', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([
        {
          id: photo.id,
          user_id: photo.userId,
          lat: photo.coordinate.latitude,
          lon: photo.coordinate.longitude,
          taken_at: photo.takenAt,
          caption: photo.caption ?? '',
          media_file: photo.mediaFile,
          place_name: photo.placeName ?? null,
        },
      ]),
    });

    const saved = await this.getPhoto(photo.id);
    if (!saved) throw new Error(`Photo ${photo.id} was not found after insert.`);
    return saved;
  }

  async getPhoto(id: string): Promise<Photo | null> {
    const rows = await this.rest<PhotoRow[]>(
      `photos?select=${PHOTO_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    return rows[0] ? this.asPhoto(rows[0]) : null;
  }

  async countPhotos(): Promise<number> {
    const { url, key } = requireSupabaseConfig();
    const response = await fetch(`${url}/rest/v1/photos?select=id`, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    });
    // "0-24/59" — the total is what is being asked for.
    const range = response.headers.get('content-range');
    const total = range?.split('/')[1];
    return total && total !== '*' ? Number(total) : 0;
  }

  /** Every photo within `radiusM` of a point, nearest first. */
  async findWithinRadius(centre: Coordinate, radiusM: number): Promise<Photo[]> {
    const box = bboxFor(centre, radiusM);
    const rows = await this.rest<PhotoRow[]>(
      `photos?select=${PHOTO_SELECT}` +
        `&lat=gte.${box.minLat}&lat=lte.${box.maxLat}` +
        `&lon=gte.${box.minLon}&lon=lte.${box.maxLon}`
    );

    // A box is not a circle: its corners would otherwise admit results 41% too
    // far away, so an exact pass follows the one the index could answer.
    return rows
      .map((row) => this.asPhoto(row, Math.round(distanceM(centre, { latitude: row.lat, longitude: row.lon }))))
      .filter((photo) => (photo.distanceM ?? Infinity) <= Math.round(radiusM))
      .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  }

  /** The core discovery query — mirrors server/db.js `findNearby`. */
  async findNearby(
    centre: Coordinate,
    viewerId: string | null = null,
    config: NearbySearchConfig = defaultSearchConfig
  ): Promise<NearbySearchResult> {
    let radiusUsed = config.primaryRadiusM;
    let photos = await this.findWithinRadius(centre, config.primaryRadiusM);
    let expanded = false;

    // Your own shots do not count as company.
    if (countOthers(photos, viewerId) < config.minResults) {
      radiusUsed = config.fallbackRadiusM;
      expanded = true;
      photos = await this.findWithinRadius(centre, config.fallbackRadiusM);
    }

    const flagged = photos.map((photo) => ({ ...photo, isYours: photo.userId === viewerId }));

    return {
      radiusUsed,
      expanded,
      primaryRadiusM: config.primaryRadiusM,
      fallbackRadiusM: config.fallbackRadiusM,
      othersCount: countOthers(flagged, viewerId),
      photos: flagged,
    };
  }

  /** Photos in a map bounding box — mirrors GET /photos/bbox. */
  async photosInBBox(
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
    limit = 500
  ): Promise<Photo[]> {
    const rows = await this.rest<PhotoRow[]>(
      `photos?select=${PHOTO_SELECT}` +
        `&lat=gte.${bounds.minLat}&lat=lte.${bounds.maxLat}` +
        `&lon=gte.${bounds.minLon}&lon=lte.${bounds.maxLon}&limit=${limit}`
    );
    return rows.map((row) => this.asPhoto(row));
  }

  // MARK: Media

  /** Upload bytes to Supabase Storage and return the stored file name. */
  async uploadMedia(id: string, base64: string): Promise<string> {
    const { url, key } = requireSupabaseConfig();
    const extension = sniffExtension(base64);
    const file = `${id}${extension}`;

    const response = await fetch(`${url}/storage/v1/object/${mediaBucket}/${file}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': mimeType(extension),
        'x-upsert': 'true',
      },
      // A typed array's backing buffer is the one body shape both React Native's
      // networking layer and the DOM types agree on.
      body: decodeBase64(base64).buffer as ArrayBuffer,
    });
    if (!response.ok) throw new Error(`Storage said ${response.status}: ${await response.text()}`);

    return file;
  }

  publicMediaURL(mediaFile: string): string {
    const { url } = requireSupabaseConfig();
    return `${url}/storage/v1/object/public/${mediaBucket}/${mediaFile}`;
  }

  // MARK: Private

  private asPhoto(row: PhotoRow, distance?: number): Photo {
    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.users.display_name,
      color: row.users.color,
      lat: row.lat,
      lon: row.lon,
      takenAt: row.taken_at,
      caption: row.caption,
      placeName: row.place_name,
      imagePath: this.publicMediaURL(row.media_file),
      ...(distance == null ? {} : { distanceM: distance }),
    };
  }

  private async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { url, key } = requireSupabaseConfig();
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase said ${response.status}: ${text}`);
    return (text.length === 0 ? null : JSON.parse(text)) as T;
  }
}

const asUser = (row: UserRow): NimbusUser => ({
  id: row.id,
  displayName: row.display_name,
  color: row.color,
  isSeed: row.is_seed,
});

const countOthers = (photos: Photo[], viewerId: string | null) =>
  photos.filter((photo) => photo.userId !== viewerId).length;

/** Trust the bytes, not the caller: read the magic number. */
function sniffExtension(base64: string): '.png' | '.jpg' {
  // "iVBORw0KGgo" is the 89 50 4E 47 PNG signature; "/9j/" is FF D8 FF.
  if (base64.startsWith('iVBOR')) return '.png';
  if (base64.startsWith('/9j/')) return '.jpg';
  return '.png';
}

const mimeType = (extension: string) => (extension === '.jpg' ? 'image/jpeg' : 'image/png');

/** Base64 to bytes. React Native provides `atob`, but no Buffer. */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
