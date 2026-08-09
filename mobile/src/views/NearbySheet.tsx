import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Photo, otherPeoplesPhotos } from '../model/photo';
import { PhotoThumbnail } from '../ui/PhotoThumbnail';
import { PixelPanel } from '../ui/PixelBox';
import { PixelIcon } from '../ui/PixelIcon';
import { Sheet } from '../ui/Sheet';
import { photoSubtitle } from '../ui/format';
import { WanderTheme, wanderFont } from '../ui/theme';
import { PhotoDetailView } from './PhotoDetailView';
import { NearbyPresentation } from './RootView';

/**
 * The payoff: what other people left where you are standing.
 *
 * The radius the server actually answered with is shown, not assumed, so when
 * the search widens from 100m to 250m the person watching understands why a
 * photo from four streets away is on screen.
 */
export function NearbySheet({
  visible,
  presentation,
  close,
}: {
  visible: boolean;
  presentation: NearbyPresentation | null;
  close: () => void;
}) {
  const [selected, setSelected] = useState<Photo | null>(null);

  if (!presentation) return null;

  const result = presentation.result;
  const others = otherPeoplesPhotos(result);

  const headline =
    others.length === 0
      ? 'You are the first one here.'
      : others.length === 1
        ? 'One other person has stood here.'
        : `${others.length} other people have stood here.`;

  return (
    <Sheet visible={visible} title="This place" onClose={close}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[wanderFont(26, 'bold'), styles.primary]}>{headline}</Text>

          <View style={styles.badges}>
            <Badge tint={WanderTheme.textPrimary}>within {Math.round(result.radiusUsed)} m</Badge>
            {result.expanded ? <Badge tint={WanderTheme.warm}>widened</Badge> : null}
          </View>

          {result.expanded ? (
            <Text style={[wanderFont(13), styles.secondary]}>
              Fewer than three memories within {Math.round(result.primaryRadiusM)} m, so Nimbus
              widened the search to {Math.round(result.fallbackRadiusM)} m.
            </Text>
          ) : null}
        </View>

        {/* Yours */}
        {presentation.justUploaded ? (
          <Pressable onPress={() => setSelected(presentation.justUploaded)}>
            <PixelPanel radius={18} style={styles.yours}>
              <PhotoThumbnail photo={presentation.justUploaded} style={styles.yoursThumb} />
              <View style={styles.yoursText}>
                <Text style={[wanderFont(15, 'semibold'), styles.primary]}>
                  Your photo is here now
                </Text>
                <Text numberOfLines={2} style={[wanderFont(13), styles.secondary]}>
                  {presentation.justUploaded.caption || 'No note'}
                </Text>
                <Text style={[wanderFont(12), { color: WanderTheme.accent }]}>
                  Whoever comes next will find it.
                </Text>
              </View>
            </PixelPanel>
          </Pressable>
        ) : null}

        {others.length === 0 ? (
          <PixelPanel radius={18} style={styles.empty}>
            <Text style={[wanderFont(15, 'semibold'), styles.primary]}>
              Nothing else within {Math.round(result.radiusUsed)} m — yet.
            </Text>
            <Text style={[wanderFont(13), styles.secondary]}>
              Your photo is the start of this place&apos;s collection.
            </Text>
          </PixelPanel>
        ) : (
          <>
            <Text style={[wanderFont(13, 'semibold'), styles.secondary]}>
              LEFT HERE BY OTHER PEOPLE
            </Text>
            <View style={styles.grid}>
              {others.map((photo) => (
                <Pressable key={photo.id} style={styles.gridItem} onPress={() => setSelected(photo)}>
                  <PhotoThumbnail
                    photo={photo}
                    cutColor={WanderTheme.background}
                    style={styles.gridThumb}
                  />
                  <Text numberOfLines={1} style={[wanderFont(13, 'semibold'), styles.primary]}>
                    {photo.displayName}
                  </Text>
                  <Text style={[wanderFont(11), styles.secondary]}>{photoSubtitle(photo)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <PhotoDetailView
        visible={selected != null}
        photo={selected}
        from={null}
        close={() => setSelected(null)}
      />
    </Sheet>
  );
}

function Badge({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <View style={styles.badge}>
      <PixelIcon glyph="expand" size={12} color={tint} />
      <Text style={[wanderFont(12, 'medium'), { color: tint }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20 },
  header: { gap: 8 },
  badges: { flexDirection: 'row', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: WanderTheme.panelSoft,
  },

  yours: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  yoursThumb: { width: 74, height: 92 },
  yoursText: { flex: 1, gap: 4 },

  empty: { padding: 16, gap: 6 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47%', flexGrow: 1, gap: 6 },
  gridThumb: { height: 175 },

  primary: { color: WanderTheme.textPrimary },
  secondary: { color: WanderTheme.secondaryText },
});
