import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { backendAddress, backendKind } from '../services/backend';
import { useAppModel } from '../state/useAppModel';
import { Row, RowCaption, RowTitle, Section } from '../ui/ListSection';
import { PixelIcon } from '../ui/PixelIcon';
import { Sheet } from '../ui/Sheet';
import { WanderTheme } from '../ui/theme';

/**
 * Simulated travel and the handful of things a demo needs, in one place.
 *
 * Real device GPS is on by default and is how the app is meant to be used;
 * the travel controls here are the fallback for showing a year of wandering
 * in ninety seconds instead. Flipping "use real GPS" off borrows the location
 * for a simulated walk or flight, and switches back on its own once it lands.
 */
export function SettingsSheet({ visible, close }: { visible: boolean; close: () => void }) {
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

  const confirmReset = () => {
    Alert.alert(
      'Cloud this map over?',
      'All your data and photos will be reset.',
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
    <Sheet visible={visible} title="Settings" onClose={close}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section
          header="Where you are"
          footer="Tip: press and hold anywhere on the map to travel there.">
          <Row
            onPress={() =>
              model.isTravelling ? model.stopTravel() : closeThen(() => model.wanderHere())
            }>
            <View style={styles.labelled}>
              <PixelIcon
                glyph="person"
                size={17}
                color={model.isTravelling ? WanderTheme.warm : WanderTheme.accent}
              />
              <View style={styles.labelText}>
                <RowTitle>{model.isTravelling ? 'Stop' : 'Walk around here'}</RowTitle>
                <RowCaption>
                  {model.isTravelling
                    ? 'Stop and keep what you have uncovered so far'
                    : 'Uncovers a few more streets on foot'}
                </RowCaption>
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

        <Section
          header="Reset"
          footer={`Resets only what you have uncovered. Photos left in the world are not deleted, and your friends are kept.\n\n${backendKind === 'supabase' ? 'Supabase' : 'Server'}: ${backendAddress()}`}>
          <Row onPress={confirmReset}>
            <View style={styles.labelled}>
              <PixelIcon glyph="cloud" size={15} color="#e0483a" />
              <RowTitle tint="#e0483a">Cloud this map over again</RowTitle>
            </View>
          </Row>
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
});
