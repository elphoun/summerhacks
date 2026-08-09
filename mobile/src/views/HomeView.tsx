import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExplorationMapView } from '../map/ExplorationMapView';
import { Photo } from '../model/photo';
import { initialsOf } from '../model/explorer';
import { useAppModel } from '../state/useAppModel';
import { ExplorerAvatar } from '../ui/ExplorerAvatar';
import { PhotoThumbnail } from '../ui/PhotoThumbnail';
import { PixelClip, PixelPanel } from '../ui/PixelBox';
import { PixelGlyph, PixelIcon } from '../ui/PixelIcon';
import { groupedNumber, metresLabel, percentLabel } from '../ui/format';
import { WanderTheme, wanderFont, wanderShadow } from '../ui/theme';
import { ActiveSheet } from './RootView';

/**
 * The Home tab — everything from the mock except the map itself, which is the
 * same `ExplorationMapView` the Map tab uses, just framed as a card here.
 */
export function HomeView({
  onOpen,
  onOpenMap,
}: {
  onOpen: (sheet: ActiveSheet) => void;
  onOpenMap: () => void;
}) {
  const model = useAppModel();
  const insets = useSafeAreaInsets();

  const firstName = model.explorer.displayName.split(' ')[0] || 'Explorer';
  const recentPhotos = [...model.visiblePhotos]
    .sort((a, b) => b.takenAt - a.takenAt)
    .slice(0, 8);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={require('../../assets/wander-logo.png')} style={styles.logo} resizeMode="contain" />
      </View>

      {/* Welcome */}
      <View style={styles.welcome}>
        <ExplorerAvatar
          initials={initialsOf(model.explorer.displayName)}
          color={model.explorer.colorHex}
          size={52}
          source={require('../../assets/avatar.png')}
        />
        <View style={styles.welcomeText}>
          <Text style={[wanderFont(18, 'bold'), styles.primary]}>Welcome back, {firstName}!</Text>
          <View style={styles.welcomeStats}>
            <View style={styles.inlineStat}>
              <PixelIcon glyph="flame" size={13} color={WanderTheme.warm} />
              <Text style={[wanderFont(13, 'semibold'), { color: WanderTheme.warm }]}>
                {model.exploration.streakDays} day streak
              </Text>
            </View>
            <Text style={[wanderFont(13, 'semibold'), { color: WanderTheme.hairline }]}>|</Text>
            <View style={styles.inlineStat}>
              <PixelIcon glyph="steps" size={13} color={WanderTheme.accent} />
              <Text style={[wanderFont(13, 'semibold'), { color: WanderTheme.accent }]}>
                {groupedNumber(model.exploration.estimatedSteps)} steps
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Map card */}
      <View style={[styles.mapCard, wanderShadow, { shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }]}>
        <PixelClip
          radius={28}
          steps={3}
          cutColor={WanderTheme.background}
          stroke={WanderTheme.textPrimary}
          strokeWidth={5}
          innerStroke={{ color: 'rgba(217, 127, 53, 0.85)', width: 2, inset: 5, radius: 24 }}
          style={styles.mapClip}>
          <ExplorationMapView
            points={model.explorationPoints}
            photos={model.visiblePhotos}
            userLocation={model.location}
            userColor={model.explorer.colorHex}
            focus={model.focus}
            followsUser={model.followsUser}
            // A preview, not the real thing — a tap opens the Map tab instead
            // of acting on the map directly, so there is nothing for a long
            // press or a pin tap to do here.
            onLongPress={() => {}}
            onSelect={() => {}}
            onRegionChange={(region) => model.regionChanged(region)}
          />
        </PixelClip>
        <Pressable style={StyleSheet.absoluteFill} onPress={onOpenMap} />
      </View>

      {/* Stats row */}
      <PixelPanel style={styles.statsRow}>
        <StatItem
          glyph="seedling"
          tint={WanderTheme.accent}
          title={'World\nExplored'}
          value={percentLabel(model.exploration.worldExploredPercent)}
        />
        <View style={styles.divider} />
        <StatItem
          glyph="camera"
          tint={WanderTheme.secondaryText}
          title={'Photos\nTaken'}
          value={String(model.exploration.photosLeft)}
        />
        <View style={styles.divider} />
        <StatItem
          glyph="locationPin"
          tint={WanderTheme.warm}
          title={'Distance\nExplored'}
          value={metresLabel(model.exploration.totalDistanceM)}
        />
      </PixelPanel>

      {/* Recent adventures */}
      <PixelPanel style={styles.recent}>
        <Text style={[wanderFont(14, 'heavy'), styles.recentTitle]}>RECENT ADVENTURES</Text>
        {recentPhotos.length === 0 ? (
          <Text style={[wanderFont(13), styles.secondary]}>
            Nothing left behind yet — go take a photo somewhere you&apos;ve uncovered.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filmstrip}>
              {recentPhotos.map((photo: Photo) => (
                <Pressable key={photo.id} onPress={() => onOpen({ kind: 'photo', photo })}>
                  <PhotoThumbnail photo={photo} cornerRadius={12} style={styles.thumbnail} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </PixelPanel>
    </ScrollView>
  );
}

function StatItem({
  glyph,
  tint,
  title,
  value,
}: {
  glyph: PixelGlyph;
  tint: string;
  title: string;
  value: string;
}) {
  return (
    <View style={styles.statItem}>
      <PixelIcon glyph={glyph} size={22} color={tint} />
      <Text style={[wanderFont(15, 'bold'), styles.primary, styles.statValue]}>{value}</Text>
      <Text style={[wanderFont(11, 'semibold'), styles.secondary, styles.statTitle]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: WanderTheme.background },
  content: { paddingHorizontal: 18, paddingBottom: 130, gap: 18 },
  header: { alignItems: 'center', justifyContent: 'center' },
  logo: { height: 130, width: '70%' },

  welcome: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  welcomeText: { flex: 1, gap: 4 },
  welcomeStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  mapCard: { height: 380 },
  mapClip: { flex: 1 },

  statsRow: { flexDirection: 'row', padding: 16 },
  statItem: { flex: 1, alignItems: 'center', gap: 6 },
  statValue: { textAlign: 'center' },
  statTitle: { textAlign: 'center' },
  divider: { width: 1, backgroundColor: WanderTheme.hairline, marginVertical: 4 },

  recent: { padding: 16, gap: 14 },
  recentTitle: { color: WanderTheme.textPrimary, letterSpacing: 0.5, textAlign: 'center' },
  filmstrip: { flexDirection: 'row', gap: 12 },
  thumbnail: { width: 96, height: 128 },

  primary: { color: WanderTheme.textPrimary },
  secondary: { color: WanderTheme.secondaryText },
});
