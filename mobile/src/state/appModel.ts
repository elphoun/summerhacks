import { serverBaseURL } from '../config';
import { Coordinate, distanceM } from '../geo';
import { Explorer, LocalIdentity, RemoteUser } from '../model/explorer';
import { NearbyResult, Photo, photoCoordinate } from '../model/photo';
import { Place, homePlace, nearestPlace } from '../model/place';
import { ExplorationStore, ExploredPoint } from '../services/explorationStore';
import { AuthorizationStatus, LiveLocationProvider } from '../services/liveLocationProvider';
import { SimulatedLocationProvider } from '../services/locationProvider';
import { NimbusAPI, PhotoService, PhotoServiceError } from '../services/photoService';

/**
 * A camera instruction. Compared by token so repeated identical requests (for
 * example "centre on me" twice) still take effect.
 */
export interface MapFocus {
  token: number;
  latitude: number;
  longitude: number;
  metres: number;
  animated: boolean;
}

/** The visible span of the map, as the map reports it. */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface Banner {
  id: number;
  text: string;
  isError: boolean;
}

export interface CaptureOutcome {
  photo: Photo;
  nearby: NearbyResult;
}

export type AddFriendOutcome =
  | { kind: 'added'; displayName: string }
  | { kind: 'failed'; message: string };

/**
 * Holds the two halves of Nimbus and keeps them apart.
 *
 * `exploration` is private to this device and never leaves it. `service` is the
 * shared photo store. The only place they meet is `visiblePhotos`, which is
 * twice narrowed: to photographs left by your friends, and then to ground *you*
 * have uncovered.
 */
export class AppModel {
  // MARK: Observable state

  /** This device's one identity. */
  explorer: Explorer;
  friends: RemoteUser[] = [];
  exploration: ExplorationStore;

  location: Coordinate | null = null;
  /**
   * The breadcrumbs the fog is punched out of. Replaced wholesale rather than
   * appended to: a new array is what tells the map its cloud layer is stale.
   */
  explorationPoints: ExploredPoint[] = [];

  visiblePhotos: Photo[] = [];
  hiddenPhotoCount = 0;

  serverReachable: boolean | null = null;
  isTravelling = false;
  focus: MapFocus | null = null;
  followsUser = false;
  banner: Banner | null = null;
  usingRealGPS = false;

  // MARK: Collaborators

  readonly simulated = new SimulatedLocationProvider();
  readonly live = new LiveLocationProvider();
  private readonly service: PhotoService;

  /** Everything the last bbox query returned, before the exploration gate. */
  private photosInView: Photo[] = [];
  private focusToken = 0;
  private bannerToken = 0;
  private lastRegion: MapRegion | null = null;
  private regionFetch: ReturnType<typeof setTimeout> | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  // MARK: Observation

  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  // MARK: Lifecycle

  private constructor(explorer: Explorer, exploration: ExplorationStore, service: PhotoService) {
    this.explorer = explorer;
    this.exploration = exploration;
    this.service = service;

    this.simulated.onUpdate = (location) => this.handle(location);
    this.live.onUpdate = (location) => this.handle(location);
    this.live.onAuthorizationChange = (status) => this.handleAuthorization(status);

    this.explorationPoints = exploration.points;

    // Pick up where this device left off, or open on the starting landmark if
    // the map has never been anywhere.
    const start = exploration.lastCoordinate ?? homePlace;
    this.simulated.jump(start);
    this.focusMap(start, 2_600, false);
  }

  /**
   * Device storage is asynchronous, so the identity and the map have to be read
   * back before there is a model to observe.
   */
  static async boot(service: PhotoService = new NimbusAPI()): Promise<AppModel> {
    const explorer = await LocalIdentity.loadOrCreate();
    const exploration = await new ExplorationStore(explorer.id).load();
    return new AppModel(explorer, exploration, service);
  }

  setUsingRealGPS(value: boolean): void {
    if (this.usingRealGPS === value) return;
    this.usingRealGPS = value;
    this.switchProvider();
    this.notify();
  }

  private switchProvider(): void {
    // Stopping a provider cancels any walk in flight *without* running its
    // completion handler, so the travelling flag has to be cleared here or it
    // sticks on for the rest of the session.
    this.simulated.stop();
    this.live.stop();
    this.isTravelling = false;
    this.followsUser = false;

    if (this.usingRealGPS) this.live.start();
    else this.simulated.start();
  }

  /**
   * Say what actually happened when the GPS switch is flipped, including the
   * case where the person taps "Don't Allow".
   */
  private handleAuthorization(status: AuthorizationStatus): void {
    if (!this.usingRealGPS) return;

    if (status === 'granted') {
      this.showBanner("Using this device's real GPS.");
      return;
    }
    if (status === 'denied') {
      this.usingRealGPS = false;
      this.switchProvider();
      this.showBanner(
        'Location is off for Nimbus. Turn it on in Settings, or keep using simulated travel.',
        true
      );
    }
  }

  // MARK: Location

  private handle(location: Coordinate): void {
    this.location = location;
    const uncoveredSomethingNew = this.exploration.record(location);

    if (uncoveredSomethingNew) {
      this.explorationPoints = [...this.exploration.points];
      this.applyExplorationGate();
    }
    this.notify();
  }

  /**
   * Fly or walk to a destination, then have a look around — a short wander
   * makes the reveal look like a person moving through a place rather than a
   * stamped circle.
   */
  travel(coordinate: Coordinate, name: string | null): void {
    this.simulated.cancelMovement();
    if (this.usingRealGPS) {
      this.usingRealGPS = false;
      this.live.stop();
    }
    this.isTravelling = true;
    this.followsUser = true;
    this.focusMap(coordinate, 1_400, true);
    this.notify();

    this.simulated.travel(coordinate, (arrival) => {
      if (arrival === 'flew') {
        this.showBanner(name ? `Arrived at ${name}.` : 'Arrived.');
      }
      // Deliberately small: arriving somewhere should leave you *at* it, close
      // enough that the memories people left there are within the 100m search.
      // "Walk around here" is the way to cover more ground.
      this.simulated.wander(60, 3, () => {
        this.isTravelling = false;
        this.followsUser = false;
        this.notify();
        void this.refreshPhotosForCurrentRegion();
      });
    });
  }

  travelToPlace(place: Place): void {
    this.travel(place, place.name);
  }

  /** Mill about where you already are, uncovering a few more streets. */
  wanderHere(): void {
    if (this.isTravelling) return;
    if (this.usingRealGPS) {
      this.usingRealGPS = false;
      this.live.stop();
    }
    this.isTravelling = true;
    this.followsUser = true;
    this.notify();

    this.simulated.wander(500, 7, () => {
      this.isTravelling = false;
      this.followsUser = false;
      this.notify();
      void this.refreshPhotosForCurrentRegion();
    });
  }

  centreOnMe(): void {
    if (!this.location) return;
    this.focusMap(this.location, 1_200, true);
    this.notify();
  }

  focusMap(coordinate: Coordinate, metres: number, animated: boolean): void {
    this.focusToken += 1;
    this.focus = {
      token: this.focusToken,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      metres,
      animated,
    };
  }

  // MARK: Photos (shared)

  async checkServer(): Promise<void> {
    const reachable = await this.service.health();
    this.serverReachable = reachable;
    if (!reachable) {
      this.showBanner(
        `Can't reach the photo server at ${serverBaseURL} — run \`node server.js\`.`,
        true
      );
      return;
    }
    this.notify();
    await this.register();
    await this.refreshPhotosForCurrentRegion();
  }

  // MARK: Identity and friends

  /**
   * Tell the server who this device is. Idempotent, and how a rename reaches
   * the people who can see your photographs.
   */
  async register(): Promise<void> {
    try {
      const response = await this.service.register(this.explorer);
      this.explorer = { ...this.explorer, friendCode: response.user.friendCode ?? null };
      void LocalIdentity.save(this.explorer);
      this.friends = response.friends;
      this.notify();
    } catch (error) {
      // Not fatal — photographs still load. Only the friend code and the friend
      // list go missing, so say so rather than showing a blank.
      this.showBanner(`Couldn't reach the server to register. ${messageFor(error)}`, true);
    }
  }

  rename(newName: string): void {
    const trimmed = newName.trim();
    if (trimmed.length === 0 || trimmed === this.explorer.displayName) return;

    this.explorer = { ...this.explorer, displayName: trimmed };
    void LocalIdentity.save(this.explorer);
    this.notify();
    void this.register();
  }

  async addFriend(code: string): Promise<AddFriendOutcome> {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 0) return { kind: 'failed', message: 'Enter a code first.' };

    try {
      const response = await this.service.addFriend(trimmed, this.explorer.id);
      this.friends = response.friends;
      this.notify();
      // Their photographs were invisible a moment ago; make them appear without
      // waiting for the next pan.
      await this.refreshPhotosForCurrentRegion();
      return { kind: 'added', displayName: response.friend.displayName };
    } catch (error) {
      // Show what the server said, not the status code it said it with.
      if (error instanceof PhotoServiceError && error.serverMessage) {
        return { kind: 'failed', message: error.serverMessage };
      }
      return { kind: 'failed', message: messageFor(error) };
    }
  }

  async refreshFriends(): Promise<void> {
    try {
      this.friends = await this.service.friends(this.explorer.id);
      this.notify();
    } catch {
      // Keep whatever list we already had rather than blanking it.
    }
  }

  /**
   * The map reports region changes continuously — every frame of a pan, and
   * every simulated step while the camera follows a walk. Coalesce them so one
   * gesture costs one request.
   */
  regionChanged(region: MapRegion): void {
    this.lastRegion = region;
    if (this.regionFetch) clearTimeout(this.regionFetch);
    this.regionFetch = setTimeout(() => {
      void this.refreshPhotos(region);
    }, 350);
  }

  private async refreshPhotosForCurrentRegion(): Promise<void> {
    if (!this.lastRegion) return;
    await this.refreshPhotos(this.lastRegion);
  }

  private async refreshPhotos(region: MapRegion): Promise<void> {
    // A whole-world request would drag back every photo in the database for
    // ground the explorer almost certainly cannot see anyway.
    if (region.latitudeDelta >= 12) return;

    try {
      this.photosInView = await this.service.photos(
        {
          minLat: region.latitude - region.latitudeDelta / 2,
          maxLat: region.latitude + region.latitudeDelta / 2,
          minLon: region.longitude - region.longitudeDelta / 2,
          maxLon: region.longitude + region.longitudeDelta / 2,
        },
        this.explorer.id
      );
      this.serverReachable = true;
      this.applyExplorationGate();
    } catch {
      this.serverReachable = false;
    }
    this.notify();
  }

  /**
   * The one rule connecting the private half to the shared half: you cannot see
   * what your friends left somewhere you have never been.
   */
  private applyExplorationGate(): void {
    const visible = this.photosInView.filter((photo) =>
      this.exploration.isExplored(photoCoordinate(photo))
    );
    this.visiblePhotos = visible;
    this.hiddenPhotoCount = this.photosInView.length - visible.length;
  }

  // MARK: Capture

  async leavePhoto(imageBase64: string, caption: string): Promise<CaptureOutcome | null> {
    const coordinate = this.location;
    if (!coordinate) {
      this.showBanner('No location yet.', true);
      return null;
    }

    try {
      const response = await this.service.upload({
        imageBase64,
        coordinate,
        caption,
        explorer: this.explorer,
        placeName: nearestPlace(coordinate)?.name ?? null,
      });
      this.exploration.notePhotoLeft();
      this.notify();
      await this.refreshPhotosForCurrentRegion();
      return { photo: response.photo, nearby: response.nearby };
    } catch (error) {
      this.showBanner(messageFor(error), true);
      return null;
    }
  }

  /** A generated stand-in photograph, for demoing capture without a camera. */
  sampleShot(): Promise<string> {
    return this.service.sampleShot();
  }

  // MARK: Banners

  showBanner(text: string, isError = false): void {
    this.bannerToken += 1;
    this.banner = { id: this.bannerToken, text, isError };
    this.notify();

    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    const id = this.banner.id;
    this.bannerTimer = setTimeout(
      () => {
        if (this.banner?.id === id) {
          this.banner = null;
          this.notify();
        }
      },
      isError ? 6_000 : 3_200
    );
  }

  // MARK: Demo helpers

  /**
   * Cloud this device's map back over, so a demo can be run twice. Nothing
   * anyone has left in the world is touched.
   */
  resetExploration(): void {
    this.exploration.reset();
    this.explorationPoints = [];
    this.applyExplorationGate();

    // `jump` cancels any walk in flight without running its completion.
    this.isTravelling = false;
    this.followsUser = false;
    this.simulated.jump(homePlace);
    this.focusMap(homePlace, 90_000, true);
    this.showBanner('Your map is clouded over again.');
  }

  get currentPlaceName(): string | null {
    return this.location ? (nearestPlace(this.location)?.name ?? null) : null;
  }

  /** How far the map has drifted from the explorer, for the follow camera. */
  driftFrom(centre: Coordinate): number {
    return this.location ? distanceM(centre, this.location) : 0;
  }
}

function messageFor(error: unknown): string {
  if (error instanceof PhotoServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
