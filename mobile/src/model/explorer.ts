import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * You.
 *
 * One identity per device, made on first launch and kept in AsyncStorage from
 * then on. The id is what the server files your photographs under, so it has to
 * outlive a relaunch — but not a delete-and-reinstall, which is the closest
 * thing this prototype has to signing out.
 */
export interface Explorer {
  id: string;
  displayName: string;
  colorHex: string;
  /**
   * Six characters other people type to add you. Allocated by the server on
   * registration, so it is absent until the first successful `POST /users`.
   */
  friendCode: string | null;
}

/**
 * Somebody else — a friend, or the author of a photograph.
 *
 * The same shape the server returns from `/users`, `/friends` and the friend
 * lookup, so one type covers all three.
 */
export interface RemoteUser {
  id: string;
  displayName: string;
  color: string;
  isSeed?: boolean;
  friendCode?: string;
  steps?: number;
  exploredPercent?: number;
  leaderboardRank?: number;
}

export interface RegistrationResponse {
  user: RemoteUser;
  friends: RemoteUser[];
}

export interface FriendListResponse {
  friends: RemoteUser[];
}

export interface AddFriendResponse {
  friend: RemoteUser;
  friends: RemoteUser[];
}

export function initialsOf(name: string): string {
  const letters = name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .filter((letter): letter is string => Boolean(letter));
  return letters.length === 0 ? '?' : letters.join('');
}

const STORAGE_KEY = 'nimbus.identity';

/**
 * Colours a new install picks from, so two phones side by side at a demo are
 * not both the same blue.
 */
const PALETTE = ['#6EA8FF', '#FF9F68', '#9CE37D', '#C79BFF', '#5ED2E0', '#FFD166'];

/** Loads the one identity this device has, making it the first time round. */
export const LocalIdentity = {
  async loadOrCreate(): Promise<Explorer> {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved) as Explorer;
      } catch {
        // A corrupt record is worth less than a working app; fall through and
        // mint a new identity rather than refusing to launch.
      }
    }

    const fresh: Explorer = {
      id: `explorer-${randomIdentifier()}`,
      displayName: 'Explorer',
      colorHex: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      friendCode: null,
    };
    await LocalIdentity.save(fresh);
    return fresh;
  },

  async save(explorer: Explorer): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(explorer));
  },
};

/** A UUID-shaped string. Only has to be unique across the people at a demo. */
function randomIdentifier(): string {
  const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}
