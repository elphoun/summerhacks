import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Photo } from '../model/photo';
import { CaptureOutcome } from '../state/appModel';
import { useAppModel } from '../state/useAppModel';
import { PixelPanel } from '../ui/PixelBox';
import { WanderTheme, wanderFont } from '../ui/theme';
import { CaptureSheet } from './CaptureSheet';
import { FriendsView } from './FriendsView';
import { HistorySheet } from './HistorySheet';
import { HomeView } from './HomeView';
import { MapScreen } from './MapScreen';
import { NearbySheet } from './NearbySheet';
import { PhotoDetailView } from './PhotoDetailView';
import { StatsView } from './StatsView';
import { TravelSheet } from './TravelSheet';
import { WanderTab, WanderTabBar } from './WanderTabBar';

export interface NearbyPresentation {
  id: number;
  justUploaded: Photo | null;
  result: CaptureOutcome['nearby'];
}

export type ActiveSheet =
  | { kind: 'travel' }
  | { kind: 'capture' }
  | { kind: 'history' }
  | { kind: 'nearby'; presentation: NearbyPresentation }
  | { kind: 'photo'; photo: Photo };

export function RootView() {
  const model = useAppModel();
  const [sheet, setSheet] = useState<ActiveSheet | null>(null);
  const [tab, setTab] = useState<WanderTab>('home');

  useEffect(() => {
    void model.checkServer();
  }, [model]);

  const closeSheet = () => setSheet(null);

  return (
    <View style={styles.root}>
      <StatusBar style={tab === 'map' ? 'light' : 'dark'} />

      <View style={styles.screen}>
        {tab === 'home' ? <HomeView onOpen={setSheet} /> : null}
        {tab === 'map' ? <MapScreen onOpen={setSheet} /> : null}
        {tab === 'friends' ? <FriendsView /> : null}
        {tab === 'stats' ? <StatsView /> : null}
      </View>

      <View style={styles.tabBar}>
        <WanderTabBar tab={tab} onSelect={setTab} onCapture={() => setSheet({ kind: 'capture' })} />
      </View>

      {model.banner ? (
        <PixelPanel radius={14} style={styles.banner}>
          <Text
            style={[
              wanderFont(13, 'medium'),
              styles.bannerText,
              { color: model.banner.isError ? WanderTheme.warm : WanderTheme.textPrimary },
            ]}>
            {model.banner.text}
          </Text>
        </PixelPanel>
      ) : null}

      <TravelSheet visible={sheet?.kind === 'travel'} close={closeSheet} />
      <HistorySheet visible={sheet?.kind === 'history'} close={closeSheet} />
      <CaptureSheet
        visible={sheet?.kind === 'capture'}
        close={closeSheet}
        onFinished={(outcome) => {
          // Dismiss first, then present: swapping one modal straight for
          // another drops the second presentation.
          setSheet(null);
          setTimeout(
            () =>
              setSheet({
                kind: 'nearby',
                presentation: {
                  id: Date.now(),
                  justUploaded: outcome.photo,
                  result: outcome.nearby,
                },
              }),
            400
          );
        }}
      />
      <NearbySheet
        visible={sheet?.kind === 'nearby'}
        presentation={sheet?.kind === 'nearby' ? sheet.presentation : null}
        close={closeSheet}
      />
      <PhotoDetailView
        visible={sheet?.kind === 'photo'}
        photo={sheet?.kind === 'photo' ? sheet.photo : null}
        from={model.location}
        close={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WanderTheme.background },
  screen: { flex: 1 },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  banner: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 150,
    padding: 14,
  },
  bannerText: { textAlign: 'center' },
});
