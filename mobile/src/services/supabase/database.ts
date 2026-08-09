import { Coordinate, bboxFor, distanceM } from '../../geo';
import { Photo } from '../../model/photo';
import { mediaBucket, requireSupabaseConfig } from './env';

/**
 * PostgreSQL-backed storage for the shared half of Nimbus.
 *
 * A port of server/db.js: users, friend codes, friendships, radius search, and
 * the primary/fallback discovery query — against Supabase (PostgREST + Storage)
 * instead of SQLite. Plain `fetch` rather than the Supabase SDK, so this stays
 * as dependency-free as the server it mirrors.
 */

export interface NimbusUser {
  id: string;
  displayName: string;
  color: string;
  isSeed: boolean;
  friendCode: string | null;
  steps: number;
  exploredPercent: number;
  /** Position among the friends they were listed with; absent on a lone user. */
  leaderboardRank?: number;
}

/** What a device reports about its own travels, for the friends leaderboard. */
export interface FriendStats {
  steps: number;
  exploredPercent: number;
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

/**
 * Whose photographs a viewer may see: their friends, plus themselves. `null`
 * means "no restriction", the same open case server/db.js allows for an
 * anonymous request.
 */
export type Audience = string[] | null;

/** A PostgREST or Storage response that was not a success. */
export class SupabaseError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Supabase said ${status}: ${body}`);
    this.name = 'SupabaseError';
    this.status = status;
    this.body = body;
  }

  /** A unique-index collision — the only failure the code allocator retries. */
  get isUniqueViolation(): boolean {
    return this.status === 409 || this.body.includes('23505');
  }
}

const PHOTO_SELECT =
  'id,user_id,lat,lon,taken_at,caption,media_file,place_name,users!inner(display_name,color)';

const USER_SELECT = 'id,display_name,color,is_seed,friend_code,steps,explored_percent';

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
  friend_code: string | null;
  steps: number | null;
  explored_percent: number | null;
}

export class NimbusDatabase {
  // MARK: Users

  /**
   * Create or refresh a user, and make sure they have a friend code.
   *
   * A merge-duplicates upsert writes exactly the columns it is given, which is
   * the whole reason the body is assembled rather than fixed: `friend_code` is
   * never sent, so reopening the app cannot blank it, and `steps` are sent only
   * when the caller actually has some — leaving an upload, which knows nothing
   * about how far you have walked, unable to reset your leaderboard row to nil.
   *
   * That is one round trip where server/db.js takes two (`upsertUser` then
   * `upsertUserStats`), and it is why the stats have no separate insert here:
   * every path that reports them registers first, so the row always exists.
   */
  async upsertUser(
    id: string,
    displayName: string,
    color: string,
    isSeed = false,
    stats?: FriendStats
  ): Promise<NimbusUser> {
    const [row] = await this.rest<UserRow[]>('users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        {
          id,
          display_name: displayName,
          color,
          is_seed: isSeed,
          ...(stats == null
            ? {}
            : {
                steps: stats.steps,
                explored_percent: stats.exploredPercent,
                updated_at: Date.now(),
              }),
        },
      ]),
    });

    const friendCode = row.friend_code ?? (await this.assignFriendCode(id));
    return asUser({ ...row, friend_code: friendCode });
  }

  async getUser(id: string): Promise<NimbusUser | null> {
    const rows = await this.rest<UserRow[]>(
      `users?select=${USER_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    return rows[0] ? asUser(rows[0]) : null;
  }

  async findUserByCode(code: string): Promise<NimbusUser | null> {
    const normalised = normaliseCode(code);
    if (normalised.length === 0) return null;

    const rows = await this.rest<UserRow[]>(
      `users?select=${USER_SELECT}&friend_code=eq.${encodeURIComponent(normalised)}&limit=1`
    );
    return rows[0] ? asUser(rows[0]) : null;
  }

  async listUsers(): Promise<NimbusUser[]> {
    const rows = await this.rest<UserRow[]>(
      `users?select=${USER_SELECT}&order=is_seed,display_name`
    );
    return rows.map(asUser);
  }

  /**
   * Give a user a code if they have not got one, and return whatever they have.
   *
   * The `friend_code=is.null` filter is what makes this safe to race: two
   * devices registering the same id at once cannot both win the update, and the
   * loser reads back the winner's code instead of overwriting it.
   */
  private async assignFriendCode(id: string): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt++) {
      const code = randomCode();
      try {
        const rows = await this.rest<UserRow[]>(
          `users?id=eq.${encodeURIComponent(id)}&friend_code=is.null`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ friend_code: code }),
          }
        );
        if (rows.length > 0) return code;

        // Nothing was updated, so a code was already there.
        const existing = await this.getUser(id);
        if (existing?.friendCode) return existing.friendCode;
      } catch (error) {
        // Collision against the unique index. With 31^6 codes this is
        // vanishingly unlikely, but a retry is cheaper than reasoning about how
        // unlikely.
        if (!(error instanceof SupabaseError && error.isUniqueViolation)) throw error;
      }
    }
    throw new Error('could not allocate a friend code');
  }

  // MARK: Friendship

  /** Stored both ways round, so an audience is one column lookup. */
  async addFriendship(a: string, b: string): Promise<void> {
    if (!a || !b || a === b) return;
    await this.rest<unknown>('friendships?on_conflict=user_id,friend_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([
        { user_id: a, friend_id: b },
        { user_id: b, friend_id: a },
      ]),
    });
  }

  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.rest<{ friend_id: string }[]>(
      `friendships?select=friend_id&user_id=eq.${encodeURIComponent(userId)}`
    );
    return rows.map((row) => row.friend_id);
  }

  /**
   * Two queries rather than an embedded join: `friendships` has two foreign
   * keys to `users`, so a PostgREST embed needs a disambiguating hint and
   * breaks the moment the constraint is renamed.
   */
  async listFriends(userId: string): Promise<NimbusUser[]> {
    const ids = await this.friendIds(userId);
    if (ids.length === 0) return [];

    const rows = await this.rest<UserRow[]>(
      `users?select=${USER_SELECT}&id=in.(${ids.map(quoteForIn).join(',')})` +
        '&order=is_seed,display_name'
    );
    return withLeaderboardRanks(rows.map(asUser));
  }

  /**
   * The seeded people are everyone's friends, so a fresh install has something
   * to look at on its first launch. Run on every registration rather than only
   * the first, so it does not matter whether the app or the seed went first.
   */
  async befriendSeedUsers(userId: string): Promise<void> {
    const rows = await this.rest<{ id: string }[]>('users?select=id&is_seed=is.true');
    const seeds = rows.map((row) => row.id).filter((id) => id !== userId);
    if (seeds.length === 0) return;

    await this.rest<unknown>('friendships?on_conflict=user_id,friend_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(
        seeds.flatMap((id) => [
          { user_id: userId, friend_id: id },
          { user_id: id, friend_id: userId },
        ])
      ),
    });
  }

  /** Whose photographs this viewer may see. Mirrors server/db.js `audienceFor`. */
  async audienceFor(userId: string | null): Promise<Audience> {
    if (!userId) return null;
    return [userId, ...(await this.friendIds(userId))];
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

  /**
   * Delete every photo a user left, and the media files they pointed at.
   * Mirrors server/db.js `deletePhotosByUser` + the file cleanup server.js
   * does around it — here in one call, since Storage is just another Supabase
   * endpoint rather than the local filesystem.
   */
  async deletePhotosByUser(userId: string): Promise<string[]> {
    const rows = await this.rest<{ media_file: string }[]>(
      `photos?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      }
    );
    const mediaFiles = rows.map((row) => row.media_file);
    if (mediaFiles.length > 0) await this.deleteMedia(mediaFiles);
    return mediaFiles;
  }

  async countPhotos(): Promise<number> {
    const { url, key } = requireSupabaseConfig();
    const response = await fetch(`${url}/rest/v1/photos?select=id`, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    });
    // A HEAD carries no body to explain itself, and this is the call the health
    // check is made of: a rejected key has to fail here rather than read as an
    // empty database that everything else then fails against.
    if (!response.ok) throw new SupabaseError(response.status, 'count request was refused');

    // "0-24/59" — the total is what is being asked for.
    const range = response.headers.get('content-range');
    const total = range?.split('/')[1];
    return total && total !== '*' ? Number(total) : 0;
  }

  /** Every photo within `radiusM` of a point, nearest first. */
  async findWithinRadius(
    centre: Coordinate,
    radiusM: number,
    audience: Audience = null
  ): Promise<Photo[]> {
    if (audience && audience.length === 0) return [];

    const box = bboxFor(centre, radiusM);
    const rows = await this.rest<PhotoRow[]>(
      `photos?select=${PHOTO_SELECT}` +
        `&lat=gte.${box.minLat}&lat=lte.${box.maxLat}` +
        `&lon=gte.${box.minLon}&lon=lte.${box.maxLon}` +
        audienceClause(audience)
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
    config: NearbySearchConfig = defaultSearchConfig,
    audience: Audience = null
  ): Promise<NearbySearchResult> {
    let radiusUsed = config.primaryRadiusM;
    let photos = await this.findWithinRadius(centre, config.primaryRadiusM, audience);
    let expanded = false;

    // Your own shots do not count as company.
    if (countOthers(photos, viewerId) < config.minResults) {
      radiusUsed = config.fallbackRadiusM;
      expanded = true;
      photos = await this.findWithinRadius(centre, config.fallbackRadiusM, audience);
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
    audience: Audience = null,
    limit = 500
  ): Promise<Photo[]> {
    if (audience && audience.length === 0) return [];

    const rows = await this.rest<PhotoRow[]>(
      `photos?select=${PHOTO_SELECT}` +
        `&lat=gte.${bounds.minLat}&lat=lte.${bounds.maxLat}` +
        `&lon=gte.${bounds.minLon}&lon=lte.${bounds.maxLon}` +
        audienceClause(audience) +
        `&limit=${limit}`
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
    if (!response.ok) throw new SupabaseError(response.status, await response.text());

    return file;
  }

  /** Storage's bulk-remove endpoint — one call for every file, not one call each. */
  private async deleteMedia(files: string[]): Promise<void> {
    const { url, key } = requireSupabaseConfig();
    const response = await fetch(`${url}/storage/v1/object/${mediaBucket}`, {
      method: 'DELETE',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: files }),
    });
    if (!response.ok) throw new SupabaseError(response.status, await response.text());
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
    if (!response.ok) throw new SupabaseError(response.status, text);
    return (text.length === 0 ? null : JSON.parse(text)) as T;
  }
}

const asUser = (row: UserRow): NimbusUser => ({
  id: row.id,
  displayName: row.display_name,
  color: row.color,
  isSeed: row.is_seed,
  friendCode: row.friend_code ?? null,
  steps: Number(row.steps ?? 0),
  exploredPercent: Number(row.explored_percent ?? 0),
});

/**
 * The friends leaderboard, ranked exactly as server/db.js ranks it: by ground
 * uncovered, then by steps, then by name so a tie is at least stable. The list
 * itself stays in its display order — the rank is a number carried alongside,
 * not a re-sort.
 */
function withLeaderboardRanks(friends: NimbusUser[]): NimbusUser[] {
  const ranked = [...friends].sort(
    (a, b) =>
      b.exploredPercent - a.exploredPercent ||
      b.steps - a.steps ||
      a.displayName.localeCompare(b.displayName)
  );

  return friends.map((friend) => ({
    ...friend,
    leaderboardRank: ranked.findIndex((candidate) => candidate.id === friend.id) + 1,
  }));
}

const countOthers = (photos: Photo[], viewerId: string | null) =>
  photos.filter((photo) => photo.userId !== viewerId).length;

/** `&user_id=in.("a","b")`, or nothing at all when the audience is open. */
const audienceClause = (audience: Audience) =>
  audience ? `&user_id=in.(${audience.map(quoteForIn).join(',')})` : '';

/**
 * PostgREST reads `,` and `)` as list syntax, so every value goes in quotes —
 * an id is not user-authored here, but a filter that depends on that staying
 * true is a filter waiting to be widened by accident.
 */
const quoteForIn = (value: string) => `"${value.replace(/(["\\])/g, '\\$1')}"`;

// MARK: Friend codes
//
// No O/0, I/1 or L: these get read aloud across a table and typed by someone
// who is not looking at their own screen.

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

/** Uppercase, and forgiving about the spaces and dashes people add. */
export const normaliseCode = (raw: string): string =>
  String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');

const randomCode = () =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join('');

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
