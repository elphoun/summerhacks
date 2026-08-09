import { BlurView } from 'expo-blur';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExplorationMapView } from '../map/ExplorationMapView';
import { useAppModel } from '../state/useAppModel';
import { PixelGlyph, PixelIcon } from '../ui/PixelIcon';
import { Theme } from '../ui/theme';
import { ActiveSheet } from './RootView';

/**
 * The full-bleed exploration map — unchanged from the original design. Just
 * the map itself and the controls that actually act on it (recentre, settings);
 * identity, stats and capture all live elsewhere in the app now, so this
 * screen stays about one thing.
 */
export function MapScreen({ onOpen }: { onOpen: (sheet: ActiveSheet) => void }) {
  const model = useAppModel();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ExplorationMapView
        points={model.explorationPoints}
        photos={model.visiblePhotos}
        userLocation={model.location}
        userColor={model.explorer.colorHex}
        focus={model.focus}
        followsUser={model.followsUser}
        onLongPress={(coordinate) => model.travel(coordinate, null)}
        onSelect={(photo) => onOpen({ kind: 'photo', photo })}
        onRegionChange={(region) => model.regionChanged(region)}
      />

      {/* Top bar — alerts, then settings anchored at the far corner. */}
      <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
        {model.hiddenPhotoCount > 0 ? (
          <Pill glyph="cloud" tint={Theme.secondaryText}>
            {model.hiddenPhotoCount} still under cloud
          </Pill>
        ) : null}

        {model.serverReachable === false ? (
          <Pill glyph="wifi" tint={Theme.warm}>
            server offline
          </Pill>
        ) : null}

        <IconButton glyph="gear" onPress={() => onOpen({ kind: 'settings' })} />
      </View>

      {/* Bottom bar — recentre anchored at the far corner. */}
      <View style={[styles.bottomBar, { bottom: insets.bottom + 108 }]} pointerEvents="box-none">
        {model.isTravelling ? (
          <Pill glyph="person" tint="#fff">
            moving — clouds burning off
          </Pill>
        ) : null}

        <View style={styles.cornerRow}>
          <IconButton glyph="locationPin" onPress={() => model.centreOnMe()} />
        </View>
      </View>
    </View>
  );
}

/** Small round frosted button, for the corner controls. */
function IconButton({ glyph, onPress }: { glyph: PixelGlyph; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <BlurView intensity={40} tint="dark" style={styles.iconButton}>
        <PixelIcon glyph={glyph} size={17} color="#fff" />
      </BlurView>
    </Pressable>
  );
}

function Pill({
  glyph,
  tint,
  children,
}: {
  glyph: PixelGlyph;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <BlurView intensity={40} tint="dark" style={styles.pill}>
      <PixelIcon glyph={glyph} size={12} color={tint} />
      <Text style={[styles.pillText, { color: tint }]}>{children}</Text>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },

  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },

  bottomBar: { position: 'absolute', left: 16, right: 16, gap: 12, alignItems: 'center' },
  cornerRow: { alignSelf: 'stretch', alignItems: 'flex-end' },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.hairline,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pillText: { fontSize: 11, fontWeight: '500' },
});
