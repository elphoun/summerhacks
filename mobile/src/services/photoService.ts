import { serverBaseURL } from '../config';
import { Coordinate } from '../geo';
import {
  AddFriendResponse,
  Explorer,
  FriendListResponse,
  RegistrationResponse,
  RemoteUser,
} from '../model/explorer';

export interface FriendStats {
  steps: number;
  exploredPercent: number;
}
import { NearbyResult, Photo, PhotoListResponse, UploadResponse } from '../model/photo';

/**
 * The shared half of Nimbus: leaving photos at a place and finding the ones
 * other people left.
 *
 * Kept as an interface so the local Node server can be swapped for a hosted
 * backend (Supabase, Firebase, anything) without touching a single view.
 */
export interface PhotoService {
  health(): Promise<boolean>;

  /**
   * Announce this device's identity and get back its friend code and current
   * friends. Safe to call on every launch; it doubles as a rename.
   */
  register(explorer: Explorer, stats?: FriendStats): Promise<RegistrationResponse>;
  friends(viewerID: string): Promise<RemoteUser[]>;
  addFriend(code: string, viewerID: string): Promise<AddFriendResponse>;

  nearby(coordinate: Coordinate, viewerID: string): Promise<NearbyResult>;
  photos(bounds: BoundingBox, viewerID: string): Promise<Photo[]>;
  upload(request: UploadRequest): Promise<UploadResponse>;

  /** Remove every photo this explorer has left. Never touches anyone else's. */
  deleteMyPhotos(viewerID: string): Promise<void>;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface UploadRequest {
  imageBase64: string;
  coordinate: Coordinate;
  caption: string;
  explorer: Explorer;
  placeName: string | null;
}

export class PhotoServiceError extends Error {
  readonly status: number | null;
  /**
   * What the server itself said, without the status code wrapped round it.
   * "no one has that code" is the whole of what someone typing a friend code
   * needs to read; the status belongs in a log.
   */
  readonly serverMessage: string | null;

  constructor(message: string, status: number | null = null, serverMessage: string | null = null) {
    super(message);
    this.name = 'PhotoServiceError';
    this.status = status;
    this.serverMessage = serverMessage;
  }

  static server(status: number, message: string): PhotoServiceError {
    return new PhotoServiceError(`Server said ${status}: ${message}`, status, message);
  }

  static unreachable(): PhotoServiceError {
    return new PhotoServiceError("Can't reach the Nimbus server. Is `node server.js` running?");
  }
}

/** How long a request may take before it counts as unreachable. */
const REQUEST_TIMEOUT_MS = 8_000;
const UPLOAD_TIMEOUT_MS = 20_000;

/** Talks to server/server.js. */
export class NimbusAPI implements PhotoService {
  private readonly baseURL: string;

  constructor(baseURL: string = serverBaseURL) {
    this.baseURL = baseURL.replace(/\/$/, '');
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.fetch('/health', {}, REQUEST_TIMEOUT_MS);
      return response.ok;
    } catch {
      return false;
    }
  }

  register(explorer: Explorer, stats?: FriendStats): Promise<RegistrationResponse> {
    return this.post('/users', {
      id: explorer.id,
      displayName: explorer.displayName,
      color: explorer.colorHex,
      ...(stats == null ? {} : { steps: stats.steps, exploredPercent: stats.exploredPercent }),
    });
  }

  async friends(viewerID: string): Promise<RemoteUser[]> {
    const response = await this.get<FriendListResponse>('/friends', { userId: viewerID });
    return response.friends;
  }

  addFriend(code: string, viewerID: string): Promise<AddFriendResponse> {
    return this.post('/friends', { userId: viewerID, code });
  }

  nearby(coordinate: Coordinate, viewerID: string): Promise<NearbyResult> {
    return this.get('/photos/nearby', {
      lat: String(coordinate.latitude),
      lon: String(coordinate.longitude),
      viewerId: viewerID,
    });
  }

  async photos(bounds: BoundingBox, viewerID: string): Promise<Photo[]> {
    const response = await this.get<PhotoListResponse>('/photos/bbox', {
      minLat: String(bounds.minLat),
      maxLat: String(bounds.maxLat),
      minLon: String(bounds.minLon),
      maxLon: String(bounds.maxLon),
      // Without this the server would hand back everybody's photographs.
      viewerId: viewerID,
    });
    return response.photos;
  }

  upload({
    imageBase64,
    coordinate,
    caption,
    explorer,
    placeName,
  }: UploadRequest): Promise<UploadResponse> {
    return this.post(
      '/photos',
      {
        userId: explorer.id,
        displayName: explorer.displayName,
        color: explorer.colorHex,
        lat: coordinate.latitude,
        lon: coordinate.longitude,
        caption,
        takenAt: Date.now(),
        ...(placeName == null ? {} : { placeName }),
        imageBase64,
      },
      UPLOAD_TIMEOUT_MS
    );
  }

  deleteMyPhotos(viewerID: string): Promise<void> {
    return this.delete(`/photos?${new URLSearchParams({ userId: viewerID }).toString()}`);
  }

  // MARK: Transport

  private get<T>(path: string, query: Record<string, string>): Promise<T> {
    const search = new URLSearchParams(query).toString();
    return this.send<T>(`${path}${search ? `?${search}` : ''}`, {}, REQUEST_TIMEOUT_MS);
  }

  private delete<T>(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    return this.send<T>(path, { method: 'DELETE' }, timeoutMs);
  }

  private post<T>(path: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    return this.send<T>(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs
    );
  }

  private async send<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
    const response = await this.fetch(path, init, timeoutMs);
    const text = await response.text();

    if (!response.ok) {
      let message = text || 'unknown error';
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? message;
      } catch {
        // Not JSON; the body itself is the best message available.
      }
      throw PhotoServiceError.server(response.status, message);
    }

    return JSON.parse(text) as T;
  }

  /** `fetch` with a deadline, so a dead server fails fast instead of hanging. */
  private async fetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.baseURL}${path}`, { ...init, signal: controller.signal });
    } catch {
      throw PhotoServiceError.unreachable();
    } finally {
      clearTimeout(timeout);
    }
  }
}
