import { createContext, useContext, useSyncExternalStore } from 'react';

import { AppModel } from './appModel';

const AppModelContext = createContext<AppModel | null>(null);

export const AppModelProvider = AppModelContext.Provider;

/**
 * Subscribe to the model.
 *
 * `AppModel` publishes a version number rather than an immutable snapshot,
 * which is the same bargain SwiftUI's `@ObservedObject` strikes: any change
 * re-renders the whole subtree, and no view has to be told which fields it
 * depends on.
 */
export function useAppModel(): AppModel {
  const model = useContext(AppModelContext);
  if (!model) throw new Error('useAppModel used outside of AppModelProvider');

  useSyncExternalStore(model.subscribe, model.getVersion, model.getVersion);
  return model;
}
