import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { distanceM } from '../geo';
import { PLACES, Place } from '../model/place';
import { useAppModel } from '../state/useAppModel';
import { Row, RowCaption, RowTitle, Section } from '../ui/ListSection';
import { PixelIcon } from '../ui/PixelIcon';
import { Sheet } from '../ui/Sheet';
import { WanderTheme, wanderFont } from '../ui/theme';

/**
 * Simulated travel.
 *
 * Real background GPS is the eventual product; this is how you demonstrate a
 * year of wandering in ninety seconds without leaving the room. Flip "use real
 * GPS" and the same app runs on device location instead.
 */
export function TravelSheet({ visible, close }: { visible: boolean; close: () => void }) {
  const model = useAppModel();

  /**
   * Dismiss, then act once the sheet is actually gone.
   *
   * Starting a journey publishes location updates twenty times a second, and a
   * re-render storm that overlaps the dismissal makes the modal animate out
   * over a stuttering screen. Closing first and travelling after keeps the two
   * from racing (and looks better: you watch the flight).
   */
  const closeThen = (action: () => void) => {
    close();
    setTimeout(action, 250);
  };

  // Nearest first — the list doubles as "what is close to me right now".
  const here = model.location;
  const sortedPlaces = here
    ? [...PLACES].sort((a, b) => distanceM(here, a) - distanceM(here, b))
    : PLACES;

  const distanceLabel = (place: Place) => {
    if (!here) return '';
    const metres = distanceM(here, place);
    return metres < 1000 ? `${Math.trunc(metres)} m` : `${Math.trunc(metres / 1000)} km`;
  };

  return (
    <Sheet visible={visible} title="Travel" onClose={close}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section
          header="Where you are"
          footer="Tip: press and hold anywhere on the map to travel there.">
          <Row onPress={() => closeThen(() => model.wanderHere())} disabled={model.isTravelling}>
            <View style={styles.labelled}>
              <PixelIcon glyph="person" size={17} color={WanderTheme.accent} />
              <View style={styles.labelText}>
                <RowTitle>Walk around here</RowTitle>
                <RowCaption>Uncovers a few more streets on foot</RowCaption>
              </View>
            </View>
          </Row>

          <Row>
            <View style={styles.toggleRow}>
              <View style={styles.labelText}>
                <RowTitle>Use this device&apos;s real GPS</RowTitle>
                <RowCaption>Walk outside and the fog lifts for real</RowCaption>
              </View>
              <Switch
                value={model.usingRealGPS}
                onValueChange={(value) => model.setUsingRealGPS(value)}
                trackColor={{ true: WanderTheme.accent, false: WanderTheme.hairline }}
              />
            </View>
          </Row>
        </Section>

        <Section header="Travel somewhere">
          {sortedPlaces.map((place) => (
            <Row key={place.id} onPress={() => closeThen(() => model.travelToPlace(place))}>
              <View style={styles.placeRow}>
                <View style={styles.labelText}>
                  <RowTitle>{place.name}</RowTitle>
                  <RowCaption>
                    {place.city}, {place.country}
                  </RowCaption>
                </View>
                <View style={styles.placeTrailing}>
                  <Text style={[wanderFont(12, 'medium'), styles.secondary]}>
                    {distanceLabel(place)}
                  </Text>
                  {model.exploration.isExplored(place) ? (
                    <View style={styles.uncovered}>
                      <PixelIcon glyph="checkmarkCircle" size={11} color={WanderTheme.accent} />
                      <Text style={[wanderFont(10, 'semibold'), { color: WanderTheme.accent }]}>
                        uncovered
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Row>
          ))}
        </Section>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  labelled: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  labelText: { flex: 1, gap: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeTrailing: { alignItems: 'flex-end', gap: 2 },
  uncovered: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  secondary: { color: WanderTheme.secondaryText },
});
