import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { serverBaseURL } from '../config';
import { initialsOf } from '../model/explorer';
import { homePlace } from '../model/place';
import { useAppModel } from '../state/useAppModel';
import { ExplorerAvatar } from '../ui/ExplorerAvatar';
import { Row, RowCaption, RowTitle, Section } from '../ui/ListSection';
import { PixelIcon } from '../ui/PixelIcon';
import { Sheet } from '../ui/Sheet';
import { abbreviatedDateAndTime, areaLabel } from '../ui/format';
import { WanderTheme, wanderFont } from '../ui/theme';

/**
 * Your own record of where you have been — and the place the app states, in as
 * many words, that this record belongs to you alone.
 */
export function HistorySheet({ visible, close }: { visible: boolean; close: () => void }) {
  const model = useAppModel();
  const visits = model.exploration.mostRecentVisits;

  /** Dismiss, then act once the sheet is actually gone. */
  const closeThen = (action: () => void) => {
    close();
    setTimeout(action, 250);
  };

  const confirmReset = () => {
    Alert.alert(
      'Cloud this map over?',
      `You will start again from ${homePlace.city}, with everywhere back under cloud.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => closeThen(() => model.resetExploration()),
        },
      ]
    );
  };

  return (
    <Sheet visible={visible} title="Your exploration" onClose={close}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statRow}>
          <StatTile value={areaLabel(model.exploration.uncoveredAreaKm2)} caption="uncovered" />
          <StatTile value={String(model.exploration.placesDiscovered)} caption="places" />
          <StatTile value={String(model.exploration.photosLeft)} caption="photos left" />
        </View>

        <Section
          header="Who you are"
          footer="This map is yours alone. It is stored on this device and never sent anywhere — no friend of yours can uncover ground for you, and you cannot uncover any for them. The photographs everyone leaves behind are the only thing shared.">
          <Row>
            <View style={styles.identity}>
              <ExplorerAvatar
                initials={initialsOf(model.explorer.displayName)}
                color={model.explorer.colorHex}
                size={30}
              />
              <View style={styles.identityText}>
                <RowTitle>{model.explorer.displayName}</RowTitle>
                <RowCaption>{model.friends.length} friends</RowCaption>
              </View>
            </View>
          </Row>
        </Section>

        <Section header="Places you found">
          {visits.length === 0 ? (
            <Row>
              <Text style={[wanderFont(15), styles.secondary]}>
                Nothing yet. The world is still under cloud.
              </Text>
            </Row>
          ) : (
            visits.map((visit) => (
              <Row key={visit.id}>
                <View style={styles.visitRow}>
                  <View style={styles.visitText}>
                    <RowTitle>{visit.placeName}</RowTitle>
                    <RowCaption>
                      {visit.city}, {visit.country}
                    </RowCaption>
                  </View>
                  <Text style={[wanderFont(12), styles.secondary]}>
                    {abbreviatedDateAndTime(new Date(visit.firstSeen))}
                  </Text>
                </View>
              </Row>
            ))
          )}
        </Section>

        <Section
          header="Demo"
          footer={`Resets only what you have uncovered. Photos left in the world are not deleted, and your friends are kept.\n\nServer: ${serverBaseURL}`}>
          <Row onPress={confirmReset}>
            <View style={styles.destructive}>
              <PixelIcon glyph="cloud" size={15} color="#e0483a" />
              <RowTitle tint="#e0483a">Cloud this map over again</RowTitle>
            </View>
          </Row>
        </Section>
      </ScrollView>
    </Sheet>
  );
}

function StatTile({ value, caption }: { value: string; caption: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={[wanderFont(20, 'bold'), styles.primary]}>{value}</Text>
      <Text style={[wanderFont(11), styles.secondary]}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  statRow: { flexDirection: 'row', paddingTop: 8 },
  statTile: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityText: { flex: 1, gap: 2 },

  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  visitText: { flex: 1, gap: 2 },

  destructive: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  primary: { color: WanderTheme.textPrimary },
  secondary: { color: WanderTheme.secondaryText },
});
