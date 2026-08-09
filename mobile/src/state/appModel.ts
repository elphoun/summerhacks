import { Coordinate, distanceM } from '../geo';
import { Explorer, LocalIdentity, RemoteUser } from '../model/explorer';
import { NearbyResult, Photo, photoCoordinate } from '../model/photo';
import { backendUnreachableAdvice, createPhotoService } from '../services/backend';
import { ExplorationStore, ExploredPoint } from '../services/explorationStore';
import { reverseGeocode } from '../services/geocoding';
import { AuthorizationStatus, LiveLocationProvider } from '../services/liveLocationProvider';
import { SimulatedLocationProvider } from '../services/locationProvider';
import { PhotoService, PhotoServiceError } from '../services/photoService';

/** A named place, whichever way it was resolved. */
interface ResolvedPlace {
  id: string;
  name: string;
  city: string;
  country: string;
}

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

/** Close enough to read street names, which is what "nearby" should look like by default. */
const DEFAULT_ZOOM_M = 600;

/**
 * Where the map opens before any real location is known — a fresh install
 * with no fix yet, or real GPS denied with nothing simulated to fall back
 * on. Not a destination or a feature, just somewhere to point the camera
 * other than null island; real GPS (the default) overtakes it the moment
 * the first fix arrives.
 */
const DEFAULT_START: Coordinate = { latitude: 37.8199, longitude: -122.4783 };

/**
 * How far you have to move, and how long to wait, before checking whether
 * you have reached a new named place. Reverse geocoding is a network call;
 * checking on every fix would mean dozens of calls a second during a
 * simulated wander, so this rate-limits it to something a demo can actually
 * afford. 150m is a couple of blocks — small enough that a real walk keeps
 * discovering places, large enough that GPS jitter cannot trigger it.
 */
const PLACE_CHECK_DISTANCE_M = 150;
const PLACE_CHECK_MIN_INTERVAL_MS = 5_000;

/** A cached geocode is reused for anything still this close to where it was resolved. */
const PLACE_CACHE_RADIUS_M = 150;

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
  usingRealGPS = true;

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
  private hasCentredOnLiveLocation = false;
  private geocodeCache: { coordinate: Coordinate; place: ResolvedPlace } | null = null;
  private lastPlaceCheck: { coordinate: Coordinate; at: number } | null = null;

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
    this.live.onUpdate = (location) => {
      this.handle(location);
      // The very first real fix is what tells the map where the person
      // actually is, rather than wherever the app opened on. Recentring on
      // every fix after that would fight anyone who pans away to look
      // around, so this only fires once per app launch.
      if (!this.hasCentredOnLiveLocation) {
        this.hasCentredOnLiveLocation = true;
        this.focusMap(location, DEFAULT_ZOOM_M, true);
      }
    };
    this.live.onAuthorizationChange = (status) => this.handleAuthorization(status);

    this.explorationPoints = exploration.points;

    // Pick up where this device left off, or open on the default starting
    // point if the map has never been anywhere. Real GPS (the default)
    // overtakes this the moment the first fix arrives.
    const start = exploration.lastCoordinate ?? DEFAULT_START;
    this.simulated.jump(start);
    this.focusMap(start, DEFAULT_ZOOM_M, false);
    this.switchProvider();
  }

  /**
   * Device storage is asynchronous, so the identity and the map have to be read
   * back before there is a model to observe.
   */
  static async boot(service: PhotoService = createPhotoService()): Promise<AppModel> {
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
    this.maybeCheckForNewPlace(location);
    this.notify();
  }

  // MARK: Places

  /**
   * A named place for `coordinate`, from the device's own geocoder. Caches
   * the last geocode, since capture and the visit check both ask for
   * wherever you currently are.
   */
  private async resolvePlace(coordinate: Coordinate): Promise<ResolvedPlace | null> {
    if (
      this.geocodeCache &&
      distanceM(coordinate, this.geocodeCache.coordinate) < PLACE_CACHE_RADIUS_M
    ) {
      return this.geocodeCache.place;
    }

    const resolved = await reverseGeocode(coordinate);
    if (!resolved) return null;

    // Grid the id to a city-block-ish cell rather than the exact fix, so
    // wandering around the same spot cannot mint a second "visit" just
    // because the geocoder phrased the address slightly differently.
    const place: ResolvedPlace = {
      id: `geo:${Math.round(coordinate.latitude * 100)}:${Math.round(coordinate.longitude * 100)}`,
      name: resolved.name,
      city: resolved.city ?? '',
      country: resolved.country ?? '',
    };
    this.geocodeCache = { coordinate, place };
    return place;
  }

  /** What to call the place you are at right now, for the capture screen. */
  async resolvePlaceName(coordinate: Coordinate): Promise<string | null> {
    const place = await this.resolvePlace(coordinate);
    return place?.name ?? null;
  }

  /**
   * Rate-limited check for whether `location` is a new entry for "places you
   * found" — see `PLACE_CHECK_DISTANCE_M` for why this cannot run on every
   * fix.
   */
  private maybeCheckForNewPlace(location: Coordinate): void {
    const now = Date.now();
    if (this.lastPlaceCheck) {
      const farEnough = distanceM(location, this.lastPlaceCheck.coordinate) >= PLACE_CHECK_DISTANCE_M;
      const longEnough = now - this.lastPlaceCheck.at >= PLACE_CHECK_MIN_INTERVAL_MS;
      if (!farEnough || !longEnough) return;
    }
    this.lastPlaceCheck = { coordinate: location, at: now };

    void this.resolvePlace(location).then((place) => {
      if (!place) return;
      const isNew = this.exploration.noteVisit(place.id, place.name, place.city, place.country);
      if (isNew) this.notify();
    });
  }

  /**
   * Fly or walk to a destination, then have a look around — a short wander
   * makes the reveal look like a person moving through a place rather than a
   * stamped circle.
   */
  travel(coordinate: Coordinate, name: string | null): void {
    this.simulated.cancelMovement();
    this.pauseRealGPSForSimulation();
    this.isTravelling = true;
    this.followsUser = true;
    this.focusMap(coordinate, DEFAULT_ZOOM_M, true);
    this.notify();

    this.simulated.travel(coordinate, (arrival) => {
      if (arrival === 'flew') {
        this.showBanner(name ? `Arrived at ${name}.` : 'Arrived.');
      }
      // Deliberately small: arriving somewhere should leave you *at* it, close
      // enough that the memories people left there are within the 100m search.
      // "Walk around here" is the way to cover more ground.
      this.simulated.wander(60, 3, () => this.finishSimulatedExcursion());
    });
  }

  /** Mill about where you already are, uncovering a few more streets. */
  wanderHere(): void {
    if (this.isTravelling) return;
    this.pauseRealGPSForSimulation();
    this.isTravelling = true;
    this.followsUser = true;
    this.notify();

    this.simulated.wander(500, 7, () => this.finishSimulatedExcursion());
  }

  /**
   * Hand control from real GPS to the simulator, starting it from wherever
   * that real GPS fix last put you — not wherever the simulator was last
   * left (`DEFAULT_START`, on a fresh install), which is what made "walk
   * around here" wander a stale city on the other side of the world.
   */
  private pauseRealGPSForSimulation(): void {
    if (!this.usingRealGPS) return;
    this.usingRealGPS = false;
    this.live.stop();
    if (this.location) this.simulated.jump(this.location);
  }

  /** Cut a walk or flight short. Whatever fog burned off before now stays off. */
  stopTravel(): void {
    if (!this.isTravelling) return;
    this.simulated.cancelMovement();
    this.finishSimulatedExcursion();
  }

  /**
   * A demo excursion is over — hand location back to the device's real GPS,
   * which is the default the rest of the app expects to be running.
   */
  private finishSimulatedExcursion(): void {
    this.isTravelling = false;
    this.followsUser = false;
    this.usingRealGPS = true;
    this.live.start();
    this.notify();
    void this.refreshPhotosForCurrentRegion();
  }

  centreOnMe(): void {
    if (!this.location) return;
    this.focusMap(this.location, DEFAULT_ZOOM_M, true);
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
      this.showBanner(backendUnreachableAdvice(), true);
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
  private currentFriendStats() {
    return {
      steps: this.exploration.estimatedSteps,
      exploredPercent: Number(this.exploration.worldExploredPercent.toFixed(3)),
    };
  }

  async register(): Promise<void> {
    try {
      const response = await this.service.register(this.explorer, this.currentFriendStats());
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
      const place = await this.resolvePlace(coordinate);
      const response = await this.service.upload({
        imageBase64,
        coordinate,
        caption,
        explorer: this.explorer,
        placeName: place?.name ?? null,
      });
      this.exploration.notePhotoLeft();
      this.notify();
      void this.register();
      await this.refreshPhotosForCurrentRegion();
      return { photo: response.photo, nearby: response.nearby };
    } catch (error) {
      this.showBanner(messageFor(error), true);
      return null;
    }
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
   * Cloud this device's map back over, so a demo can be run twice — and take
   * every photo *you* left with it, so the next run does not find last time's
   * memories still sitting there. Friends' photographs are never touched;
   * only this explorer's own uploads are.
   */
  async resetExploration(): Promise<void> {
    this.exploration.reset();
    this.explorationPoints = [];
    this.lastPlaceCheck = null;

    // `jump` cancels any walk in flight without running its completion.
    this.isTravelling = false;
    this.followsUser = false;

    if (this.usingRealGPS && this.location) {
      // You are still standing exactly where you were a moment ago — only
      // the fog and history are being cleared, not where the app thinks you
      // are. Jumping to `DEFAULT_START` here is the bug that used to relocate
      // a real-GPS user to San Francisco on every reset.
      this.focusMap(this.location, DEFAULT_ZOOM_M, true);
    } else {
      this.simulated.jump(DEFAULT_START);
      this.focusMap(DEFAULT_START, 90_000, true);
    }

    // Drop your own photos from view immediately rather than waiting on the
    // network call below — there is no reason "cloud this over" should look
    // like it worked halfway.
    this.photosInView = this.photosInView.filter((photo) => photo.userId !== this.explorer.id);
    this.applyExplorationGate();
    this.notify();

    try {
      await this.service.deleteMyPhotos(this.explorer.id);
      this.showBanner('Your map is clouded over, and your photos are gone with it.');
    } catch (error) {
      this.showBanner(`Clouded over, but couldn't remove your photos. ${messageFor(error)}`, true);
    }
    await this.refreshPhotosForCurrentRegion();
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
