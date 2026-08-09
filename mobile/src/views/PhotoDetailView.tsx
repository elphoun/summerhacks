import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Coordinate, distanceM } from '../geo';
import { Photo, photoCoordinate, photoTakenDate } from '../model/photo';
import { PhotoThumbnail } from '../ui/PhotoThumbnail';
import { PixelPanel } from '../ui/PixelBox';
import { Sheet } from '../ui/Sheet';
import { coordinateLabel, longDateAndTime, metresLabel } from '../ui/format';
import { WanderTheme, wanderFont } from '../ui/theme';

/** One memory, full size. */
export function PhotoDetailView({
  visible,
  photo,
  from,
  close,
}: {
  visible: boolean;
  photo: Photo | null;
  /**
   * Where the viewer is, so the distance can be shown for photos that did not
   * come from a radius search (map taps, for instance).
   */
  from: Coordinate | null;
  close: () => void;
}) {
  if (!photo) return null;

  const distanceLabel =
    photo.distanceM != null
      ? `${photo.distanceM} m`
      : from
        ? metresLabel(distanceM(from, photoCoordinate(photo)))
        : null;

  return (
    <Sheet visible={visible} title={photo.placeName ?? 'A memory'} onClose={close}>
      <ScrollView contentContainerStyle={styles.content}>
        <PhotoThumbnail
          photo={photo}
          cornerRadius={20}
          cutColor={WanderTheme.background}
          style={styles.hero}
        />

        {photo.caption ? (
          <Text style={[wanderFont(17, 'medium'), styles.primary]}>{photo.caption}</Text>
        ) : null}

        <View style={styles.author}>
          <View style={[styles.swatch, { backgroundColor: photo.color }]} />
          <View style={styles.authorText}>
            <Text style={[wanderFont(15, 'semibold'), styles.primary]}>{photo.displayName}</Text>
            <Text style={[wanderFont(12), styles.secondary]}>
              {longDateAndTime(photoTakenDate(photo))}
            </Text>
          </View>
        </View>

        <PixelPanel radius={16} style={styles.details}>
          {photo.placeName ? <DetailRow label="Place" value={photo.placeName} withRule /> : null}
          {distanceLabel ? (
            <DetailRow label="Distance from you" value={distanceLabel} withRule />
          ) : null}
          <DetailRow label="Coordinates" value={coordinateLabel(photo.lat, photo.lon)} />
        </PixelPanel>
      </ScrollView>
    </Sheet>
  );
}

function DetailRow({
  label,
  value,
  withRule = false,
}: {
  label: string;
  value: string;
  withRule?: boolean;
}) {
  return (
    <View>
      <View style={styles.detailRow}>
        <Text style={[wanderFont(13), styles.secondary]}>{label}</Text>
        <Text style={[wanderFont(13, 'medium'), styles.primary, styles.detailValue]}>{value}</Text>
      </View>
      {withRule ? <View style={styles.rule} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  hero: { height: 460 },

  author: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(74, 47, 24, 0.25)',
  },
  authorText: { flex: 1, gap: 2 },

  details: { padding: 4 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  detailValue: { flex: 1, textAlign: 'right' },
  rule: { height: 1, backgroundColor: WanderTheme.hairline },

  primary: { color: WanderTheme.textPrimary },
  secondary: { color: WanderTheme.secondaryText },
});
