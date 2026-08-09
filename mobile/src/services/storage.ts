import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The narrowest thing `ExplorationStore` needs from a device.
 *
 * Narrow on purpose: the private half of the app should be swappable for a
 * scratch dictionary in a test without dragging React Native in, which is what
 * lets the invariant the product rests on be checked in milliseconds.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** This device's own storage — the app container, not the network. */
export const deviceStore: KeyValueStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
};

/** A store that forgets, for tests. */
export function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
  };
}
