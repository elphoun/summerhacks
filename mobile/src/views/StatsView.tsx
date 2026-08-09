import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppModel } from '../state/useAppModel';
import { PixelPanel } from '../ui/PixelBox';
import { PixelGlyph, PixelIcon } from '../ui/PixelIcon';
import { abbreviatedDate, areaLabel, groupedNumber, metresLabel, percentLabel } from '../ui/format';
import { WanderTheme, wanderFont } from '../ui/theme';

/**
 * A fuller breakdown of one explorer's progress: the numbers from the Home stat
 * row, plus the streak/steps from the welcome card, plus the places they've
 * actually reached.
 */
export function StatsView() {
  const model = useAppModel();
  const insets = useSafeAreaInsets();
  const visits = model.exploration.mostRecentVisits;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}>
      <View>
        <Text style={[wanderFont(26, 'heavy'), styles.primary]}>Stats</Text>
        <Text style={[wanderFont(13), styles.secondary]}>
          {model.explorer.displayName}&apos;s progress so far.
        </Text>
      </View>

      <View style={styles.grid}>
        <Tile
          glyph="cloud"
          tint={WanderTheme.accent}
          value={areaLabel(model.exploration.uncoveredAreaKm2)}
          caption="world uncovered"
        />
        <Tile
          glyph="seedling"
          tint={WanderTheme.accent}
          value={percentLabel(model.exploration.worldExploredPercent)}
          caption="world explored"
        />
        <Tile
          glyph="camera"
          tint={WanderTheme.warm}
          value={String(model.exploration.photosLeft)}
          caption="photos left behind"
        />
        <Tile
          glyph="locationPin"
          tint={WanderTheme.warm}
          value={metresLabel(model.exploration.totalDistanceM)}
          caption="distance explored"
        />
        <Tile
          glyph="flame"
          tint={WanderTheme.warm}
          value={String(model.exploration.streakDays)}
          caption="day streak"
        />
        <Tile
          glyph="steps"
          tint={WanderTheme.accent}
          value={groupedNumber(model.exploration.estimatedSteps)}
          caption="steps taken"
        />
      </View>

      <PixelPanel style={styles.visited}>
        <Text style={[wanderFont(13, 'heavy'), styles.primary, styles.visitedTitle]}>
          PLACES YOU&apos;VE FOUND
        </Text>

        {visits.length === 0 ? (
          <Text style={[wanderFont(13), styles.secondary]}>
            Nothing yet — the world is still under cloud.
          </Text>
        ) : (
          <View style={styles.visitList}>
            {visits.map((visit, index) => (
              <View key={visit.id}>
                {index > 0 ? <View style={styles.rule} /> : null}
                <View style={styles.visitRow}>
                  <View style={styles.visitText}>
                    <Text style={[wanderFont(14, 'semibold'), styles.primary]}>
                      {visit.placeName}
                    </Text>
                    <Text style={[wanderFont(12), styles.secondary]}>
                      {visit.city}, {visit.country}
                    </Text>
                  </View>
                  <Text style={[wanderFont(11), styles.secondary]}>
                    {abbreviatedDate(new Date(visit.firstSeen))}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </PixelPanel>
    </ScrollView>
  );
}

function Tile({
  glyph,
  tint,
  value,
  caption,
}: {
  glyph: PixelGlyph;
  tint: string;
  value: string;
  caption: string;
}) {
  return (
    <PixelPanel radius={18} style={styles.tile}>
      <PixelIcon glyph={glyph} size={20} color={tint} />
      <Text style={[wanderFont(20, 'bold'), styles.primary]}>{value}</Text>
      <Text style={[wanderFont(11, 'semibold'), styles.secondary]}>{caption}</Text>
    </PixelPanel>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: WanderTheme.background },
  content: { paddingHorizontal: 18, paddingBottom: 130, gap: 18 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.5%', flexGrow: 1, padding: 14, gap: 8 },

  visited: { padding: 16, gap: 12 },
  visitedTitle: { letterSpacing: 0.4 },
  visitList: { gap: 10 },
  visitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  visitText: { flex: 1, gap: 2 },
  rule: { height: 1, backgroundColor: WanderTheme.hairline, marginBottom: 5 },

  primary: { color: WanderTheme.textPrimary },
  secondary: { color: WanderTheme.secondaryText },
});
