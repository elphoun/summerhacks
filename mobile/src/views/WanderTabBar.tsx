import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PixelIcon, PixelGlyph } from '../ui/PixelIcon';
import { WanderTheme, wanderFont, wanderShadow } from '../ui/theme';

/**
 * The four destinations behind the bottom bar. Camera has no screen of its own —
 * it always opens the capture sheet — so it is not a case here.
 */
export type WanderTab = 'home' | 'map' | 'friends' | 'stats';

/**
 * The illustrated bottom bar from the mock: four destinations plus a raised
 * shutter button that always opens capture, regardless of the active tab.
 */
export function WanderTabBar({
  tab,
  onSelect,
  onCapture,
}: {
  tab: WanderTab;
  onSelect: (tab: WanderTab) => void;
  onCapture: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <TabButton tab="home" active={tab} glyph="home" label="Home" onSelect={onSelect} />
      <TabButton tab="map" active={tab} glyph="map" label="Map" onSelect={onSelect} />

      <View style={styles.cameraSlot}>
        <Pressable onPress={onCapture} style={styles.camera}>
          <PixelIcon glyph="camera" size={24} color={WanderTheme.textPrimary} />
        </Pressable>
      </View>

      <TabButton tab="friends" active={tab} glyph="users" label="Friends" onSelect={onSelect} />
      <TabButton tab="stats" active={tab} glyph="chartBar" label="Stats" onSelect={onSelect} />
    </View>
  );
}

function TabButton({
  tab,
  active,
  glyph,
  label,
  onSelect,
}: {
  tab: WanderTab;
  active: WanderTab;
  glyph: PixelGlyph;
  label: string;
  onSelect: (tab: WanderTab) => void;
}) {
  const isActive = tab === active;
  const tint = isActive ? WanderTheme.accent : WanderTheme.secondaryText;

  return (
    <Pressable style={styles.tab} onPress={() => onSelect(tab)}>
      <PixelIcon glyph={glyph} size={21} color={tint} />
      <Text style={[wanderFont(11, 'semibold'), { color: tint, marginTop: 4 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: WanderTheme.background,
    borderTopWidth: 1,
    borderTopColor: WanderTheme.hairline,
  },
  tab: { flex: 1, alignItems: 'center' },
  cameraSlot: { flex: 1, alignItems: 'center' },
  camera: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WanderTheme.panel,
    borderWidth: 2.5,
    borderColor: 'rgba(74, 47, 24, 0.55)',
    ...wanderShadow,
    shadowRadius: 8,
  },
});
