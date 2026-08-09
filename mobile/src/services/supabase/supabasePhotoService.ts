import { Coordinate } from '../../geo';
import {
  AddFriendResponse,
  Explorer,
  RegistrationResponse,
  RemoteUser,
} from '../../model/explorer';
import { NearbyResult, Photo, UploadResponse } from '../../model/photo';
import {
  BoundingBox,
  FriendStats,
  PhotoService,
  PhotoServiceError,
  UploadRequest,
} from '../photoService';
import { NimbusUser, SupabaseError } from './database';
import { NimbusPhotoStore } from './photoStore';

/**
 * The Supabase backend, wearing the shape of server/server.js.
 *
 * `AppModel` talks to `PhotoService` and nothing else, so this is the whole of
 * what swapping the Node server for a hosted database costs: the same six
 * calls, answered by PostgREST and Storage instead of by an HTTP route.
 *
 * Failures are translated into `PhotoServiceError` on the way out, because the
 * UI already knows how to read one — `serverMessage` in particular is what a
 * mistyped friend code shows the person who typed it.
 */
export class SupabasePhotoService implements PhotoService {
  private readonly store: NimbusPhotoStore;

  constructor(store: NimbusPhotoStore = new NimbusPhotoStore()) {
    this.store = store;
  }

  health(): Promise<boolean> {
    return this.store.refreshHealth();
  }

  async register(explorer: Explorer, stats?: FriendStats): Promise<RegistrationResponse> {
    const { user, friends } = await this.run(() =>
      this.store.registerUser(explorer.id, explorer.displayName, explorer.colorHex, stats)
    );
    return { user: asRemoteUser(user), friends: friends.map(asRemoteUser) };
  }

  async friends(viewerID: string): Promise<RemoteUser[]> {
    const friends = await this.run(() => this.store.friends(viewerID));
    return friends.map(asRemoteUser);
  }

  async addFriend(code: string, viewerID: string): Promise<AddFriendResponse> {
    const friend = await this.run(() => this.store.findUserByCode(code));

    // Same two refusals, in the same words, as POST /friends.
    if (!friend) throw PhotoServiceError.server(404, 'no one has that code');
    if (friend.id === viewerID) throw PhotoServiceError.server(400, 'that is your own code');

    const friends = await this.run(() => this.store.addFriend(viewerID, friend.id));
    return { friend: asRemoteUser(friend), friends: friends.map(asRemoteUser) };
  }

  nearby(coordinate: Coordinate, viewerID: string): Promise<NearbyResult> {
    return this.run(() => this.store.nearby(coordinate, viewerID));
  }

  photos(bounds: BoundingBox, viewerID: string): Promise<Photo[]> {
    return this.run(() => this.store.photosInBBox(bounds, viewerID));
  }

  upload({
    imageBase64,
    coordinate,
    caption,
    explorer,
    placeName,
  }: UploadRequest): Promise<UploadResponse> {
    return this.run(() =>
      this.store.uploadPhoto({
        imageBase64,
        userId: explorer.id,
        displayName: explorer.displayName,
        color: explorer.colorHex,
        coordinate,
        caption,
        takenAt: Date.now(),
        placeName,
      })
    );
  }

  // MARK: Errors

  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw asPhotoServiceError(error);
    }
  }
}

function asPhotoServiceError(error: unknown): PhotoServiceError {
  if (error instanceof PhotoServiceError) return error;

  if (error instanceof SupabaseError) {
    return PhotoServiceError.server(error.status, messageFromBody(error.body));
  }

  // Anything else reaching here is a `fetch` that never got an answer, or a
  // missing key — both of which read to the person holding the phone as "this
  // build cannot talk to its database".
  const detail = error instanceof Error ? error.message : String(error);
  return new PhotoServiceError(`Can't reach Supabase. ${detail}`);
}

/** PostgREST answers with `{"message": …}`; anything else is its own message. */
function messageFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? body;
  } catch {
    return body || 'unknown error';
  }
}

const asRemoteUser = (user: NimbusUser): RemoteUser => ({
  id: user.id,
  displayName: user.displayName,
  color: user.color,
  isSeed: user.isSeed,
  steps: user.steps,
  exploredPercent: user.exploredPercent,
  ...(user.friendCode == null ? {} : { friendCode: user.friendCode }),
  ...(user.leaderboardRank == null ? {} : { leaderboardRank: user.leaderboardRank }),
});
