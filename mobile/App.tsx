import { useFonts } from 'expo-font';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppModel } from './src/state/appModel';
import { AppModelProvider } from './src/state/useAppModel';
import { WANDER_FONTS, WanderTheme } from './src/ui/theme';
import { RootView } from './src/views/RootView';

/**
 * Nimbus — a personal exploration map, and the photographs people leave behind
 * in the places it uncovers.
 *
 * Two halves, deliberately kept apart:
 *   • what you have explored is private, stored on this device only
 *   • what you photograph is shared, stored in the server under ../server
 */
export default function App() {
  const [fontsLoaded] = useFonts(WANDER_FONTS);
  const [model, setModel] = useState<AppModel | null>(null);

  // The identity and the map both live in device storage, so there is a moment
  // before either exists. Hold the launch colour rather than flashing a half
  // built screen.
  useEffect(() => {
    void AppModel.boot().then(setModel);
  }, []);

  if (!model || !fontsLoaded) return <View style={styles.launch} />;

  return (
    <SafeAreaProvider>
      <AppModelProvider value={model}>
        <RootView />
      </AppModelProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  launch: { flex: 1, backgroundColor: WanderTheme.background },
});
