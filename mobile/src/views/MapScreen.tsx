import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExplorationMapView } from '../map/ExplorationMapView';
import { initialsOf } from '../model/explorer';
import { useAppModel } from '../state/useAppModel';
import { ExplorerAvatar } from '../ui/ExplorerAvatar';
import { PixelGlyph, PixelIcon } from '../ui/PixelIcon';
import { areaLabel } from '../ui/format';
import { Theme, darkShadow } from '../ui/theme';
import { ActiveSheet } from './RootView';

/**
 * The full-bleed exploration map — unchanged from the original design. This is
 * "the map feature": dark glass chrome floating over `ExplorationMapView`, with
 * its own travel/capture/history controls. `RootView` hosts it as the Map tab;
 * everything else in the app got a new look, this screen did not.
 */
export function MapScreen({ onOpen }: { onOpen: (sheet: ActiveSheet) => void }) {
  const model = useAppModel();
  const insets = useSafeAreaInsets();

  const friendsLabel =
    model.friends.length === 0
      ? 'no friends yet'
      : model.friends.length === 1
        ? '1 friend'
        : `${model.friends.length} friends`;

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

      {/* Top bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
        {/* Who this map belongs to. There is nobody to switch to — one device is
            one person — so this states rather than offers. */}
        <Glass radius={22} padding={8} style={styles.identity}>
          <ExplorerAvatar
            initials={initialsOf(model.explorer.displayName)}
            color={model.explorer.colorHex}
          />
          <View style={styles.identityText}>
            <Text style={styles.name}>{model.explorer.displayName}</Text>
            <Text style={styles.caption}>{friendsLabel}</Text>
          </View>
        </Glass>

        <View style={styles.topRight}>
          <Glass radius={16} padding={10} style={styles.statsPill}>
            <Stat value={areaLabel(model.exploration.uncoveredAreaKm2)} caption="uncovered" />
            <View style={styles.pillDivider} />
            <Stat value={String(model.exploration.placesDiscovered)} caption="places" />
          </Glass>

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
        </View>
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { bottom: insets.bottom + 108 }]} pointerEvents="box-none">
        <View style={styles.recentreRow}>
          <Pressable onPress={() => model.centreOnMe()}>
            <BlurView intensity={40} tint="dark" style={styles.recentre}>
              <PixelIcon glyph="locationPin" size={17} color="#fff" />
            </BlurView>
          </Pressable>
        </View>

        {model.isTravelling ? (
          <Pill glyph="person" tint="#fff">
            moving — clouds burning off
          </Pill>
        ) : null}

        <View style={styles.controls}>
          <CircleGlassButton
            glyph="planeDeparture"
            label="Travel"
            onPress={() => onOpen({ kind: 'travel' })}
          />

          <Pressable onPress={() => onOpen({ kind: 'capture' })}>
            <LinearGradient
              colors={['#ffffff', 'rgba(110, 168, 255, 0.75)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.shutter}>
              <PixelIcon glyph="camera" size={28} color={Theme.background} />
            </LinearGradient>
          </Pressable>

          <CircleGlassButton
            glyph="clock"
            label="History"
            onPress={() => onOpen({ kind: 'history' })}
          />
        </View>
      </View>
    </View>
  );
}

/** Frosted panel used by every floating control, so the map stays the subject. */
function Glass({
  radius = 18,
  padding = 12,
  style,
  children,
}: {
  radius?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <View style={[{ borderRadius: radius }, darkShadow, styles.glassShell, style]}>
      <BlurView intensity={40} tint="dark" style={[styles.glassInner, { padding, borderRadius: radius }]}>
        {children}
      </BlurView>
    </View>
  );
}

/** Round frosted button for the map controls. */
function CircleGlassButton({
  glyph,
  label,
  onPress,
}: {
  glyph: PixelGlyph;
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <BlurView intensity={40} tint="dark" style={[styles.circleButton, { height: label ? 62 : 56 }]}>
        <PixelIcon glyph={glyph} size={20} color="#fff" />
        {label ? <Text style={styles.circleLabel}>{label}</Text> : null}
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

function Stat({ value, caption }: { value: string; caption: string }) {
  return (
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },

  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  identityText: { gap: 1, paddingRight: 4 },
  name: { fontSize: 14, fontWeight: '600', color: '#fff' },
  caption: { fontSize: 11, color: Theme.secondaryText },
  topRight: { flex: 1, alignItems: 'flex-end', gap: 6 },
  statsPill: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pillDivider: { width: 1, height: 22, backgroundColor: Theme.hairline },
  statValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
  statCaption: { fontSize: 10, color: Theme.secondaryText, marginTop: 1 },

  glassShell: { overflow: 'hidden', borderWidth: 1, borderColor: Theme.hairline },
  glassInner: { overflow: 'hidden' },

  bottomBar: { position: 'absolute', left: 16, right: 16, gap: 12, alignItems: 'center' },
  recentreRow: { alignSelf: 'stretch', alignItems: 'flex-end' },
  recentre: {
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

  controls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  circleButton: {
    width: 62,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Theme.hairline,
  },
  circleLabel: { fontSize: 10, fontWeight: '500', color: '#fff' },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
});
