import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { LongPressEvent, Region } from 'react-native-maps';

import { Coordinate, distanceM } from '../geo';
import { Photo, photoCoordinate } from '../model/photo';
import { ExploredPoint } from '../services/explorationStore';
import { MapFocus, MapRegion } from '../state/appModel';
import { PixelIcon } from '../ui/PixelIcon';
import { withOpacity } from '../ui/ExplorerAvatar';
import { FogLayer } from './FogLayer';
import { Projection, projectionFor } from './projection';

interface Props {
  points: ExploredPoint[];
  /** Already filtered to areas this explorer has uncovered. */
  photos: Photo[];
  userLocation: Coordinate | null;
  userColor: string;
  focus: MapFocus | null;
  followsUser: boolean;
  onLongPress: (coordinate: Coordinate) => void;
  onSelect: (photo: Photo) => void;
  onRegionChange: (region: MapRegion) => void;
}

/** Where the map opens: the whole clouded planet, before the model focuses it. */
const WORLD: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 120,
};

/** How long a fly-to takes. Long enough to read as travel, short enough to wait. */
const FLY_DURATION_MS = 600;

/**
 * The map.
 *
 * Everything the app draws on top of it — cloud, photo pins, the explorer's own
 * dot — is projected onto the map's current region by hand rather than handed
 * to react-native-maps as `<Marker>` children. It has to be: the cloud is an
 * opaque layer over the whole viewport, and native annotations would be
 * underneath it and therefore invisible. Projecting both from the same region
 * keeps them registered against each other, which is what the eye actually
 * notices.
 */
export function ExplorationMapView({
  points,
  photos,
  userLocation,
  userColor,
  focus,
  followsUser,
  onLongPress,
  onSelect,
  onRegionChange,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [region, setRegion] = useState<MapRegion>(WORLD);
  const [isReady, setIsReady] = useState(false);

  const lastFocusToken = useRef(-1);
  const pendingRegion = useRef<MapRegion | null>(null);
  const frame = useRef<number | null>(null);
  const regionRef = useRef<MapRegion>(WORLD);

  /**
   * The zoom the camera is meant to be at, which is not the same thing as the
   * zoom it is at right now: a fly-to takes half a second, and a location fix
   * lands every 50ms while it runs. Following the explorer at whatever span the
   * animation happens to be passing through would freeze the flight halfway.
   */
  const cameraSpan = useRef({
    latitudeDelta: WORLD.latitudeDelta,
    longitudeDelta: WORLD.longitudeDelta,
  });
  /** When the current fly-to lands. Nothing else steers the camera until then. */
  const focusSettlesAt = useRef(0);

  // The map reports its region every frame of a pan. Painting the overlay on
  // each one would queue more React work than a gesture leaves room for, so
  // fold them into one update per displayed frame.
  const handleRegionChange = (next: Region) => {
    pendingRegion.current = next;
    regionRef.current = next;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pendingRegion.current) setRegion(pendingRegion.current);
    });
  };

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    []
  );

  /**
   * Everything that moves the camera, in one place and in priority order — the
   * shape `updateUIView` had, and for the same reason. A focus and a location
   * fix routinely arrive together (travelling somewhere publishes both in the
   * same tick), and if the follow camera got to answer that it would cancel the
   * flight before it had gone anywhere.
   */
  useEffect(() => {
    // A map with no frame yet cannot be aimed: MapKit takes the instruction,
    // then clamps the region back to the whole planet once it is measured. Wait
    // for a size and for the map to say it is ready, and because the focus
    // token is only consumed here, the opening camera move is not lost — it is
    // applied the moment there is something to apply it to.
    if (!isReady || size.width === 0 || size.height === 0) return;

    if (focus && focus.token !== lastFocusToken.current) {
      lastFocusToken.current = focus.token;

      const span = {
        latitudeDelta: focus.metres / 111_320,
        longitudeDelta:
          focus.metres / (111_320 * Math.max(0.05, Math.cos((focus.latitude * Math.PI) / 180))),
      };
      const duration = focus.animated ? FLY_DURATION_MS : 0;

      cameraSpan.current = span;
      focusSettlesAt.current = Date.now() + duration;
      mapRef.current?.animateToRegion(
        { latitude: focus.latitude, longitude: focus.longitude, ...span },
        duration
      );
      return;
    }

    // Only recentre on real movement, and only once the flight has landed.
    // Re-setting the same centre would fire another region change and loop us
    // back here every frame.
    if (!followsUser || !userLocation) return;
    if (Date.now() < focusSettlesAt.current) return;
    if (distanceM(regionRef.current, userLocation) <= 15) return;

    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        ...cameraSpan.current,
      },
      0
    );
  }, [focus, followsUser, userLocation, isReady, size.width, size.height]);

  const projection = useMemo(() => projectionFor(region, size), [region, size]);

  const clusters = useMemo(
    () => clusterPhotos(photos, projection),
    [photos, projection]
  );

  const explorerPoint = userLocation ? projection.toScreen(userLocation) : null;

  return (
    <View style={styles.container} onLayout={onLayout(setSize)}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={WORLD}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        userInterfaceStyle="dark"
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
        // Location is usually simulated here; the app draws its own explorer.
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        onMapReady={() => setIsReady(true)}
        onLongPress={(event: LongPressEvent) => onLongPress(event.nativeEvent.coordinate)}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={(next) => {
          handleRegionChange(next);
          // A gesture that ends is the person choosing a zoom; follow at that
          // one from now on. Mid-flight the span is the animation's, not a
          // choice, so leave the intended one alone.
          if (Date.now() >= focusSettlesAt.current) {
            cameraSpan.current = {
              latitudeDelta: next.latitudeDelta,
              longitudeDelta: next.longitudeDelta,
            };
          }
          onRegionChange(next);
        }}
      />

      <FogLayer points={points} projection={projection} />

      {clusters.map((cluster) =>
        cluster.photos.length === 1 ? (
          <PhotoPin
            key={cluster.photos[0].id}
            photo={cluster.photos[0]}
            x={cluster.x}
            y={cluster.y}
            onPress={() => onSelect(cluster.photos[0])}
          />
        ) : (
          <ClusterPin
            key={`cluster-${cluster.key}`}
            count={cluster.photos.length}
            x={cluster.x}
            y={cluster.y}
            onPress={() => zoomTo(mapRef, projection, cluster)}
          />
        )
      )}

      {explorerPoint ? <ExplorerPin x={explorerPoint.x} y={explorerPoint.y} tint={userColor} /> : null}
    </View>
  );
}

// MARK: - Pins

const PIN_WIDTH = 32;
const PIN_HEIGHT = 42;

/** A photo left here, in its author's colour. */
function PhotoPin({
  photo,
  x,
  y,
  onPress,
}: {
  photo: Photo;
  x: number;
  y: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.pin, { left: x - PIN_WIDTH / 2, top: y - PIN_HEIGHT }]}>
      <View style={[styles.pinHead, { backgroundColor: photo.color }]}>
        <PixelIcon glyph="camera" size={15} color="#fff" />
      </View>
      <View style={[styles.pinTail, { borderTopColor: photo.color }]} />
    </Pressable>
  );
}

/** Too many pins to read individually — zoom in rather than pick one arbitrarily. */
function ClusterPin({
  count,
  x,
  y,
  onPress,
}: {
  count: number;
  x: number;
  y: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[styles.pin, styles.cluster, { left: x - 17, top: y - 17 }]}>
      <Text style={styles.clusterCount}>{count}</Text>
    </Pressable>
  );
}

/**
 * Where you are. Not the system's blue dot, because in this prototype "you" are
 * usually a simulated traveller.
 */
function ExplorerPin({ x, y, tint }: { x: number; y: number; tint: string }) {
  const pulse = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.25,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.75,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View pointerEvents="none" style={[styles.explorer, { left: x - 30, top: y - 30 }]}>
      <Animated.View style={[styles.halo, { transform: [{ scale: pulse }] }]} />
      <View style={[styles.dot, { backgroundColor: tint }]} />
    </View>
  );
}

// MARK: - Clustering

interface Cluster {
  key: string;
  x: number;
  y: number;
  photos: Photo[];
}

/**
 * MapKit collapsed colliding annotations on its own. Same idea, on a grid the
 * size of a pin: anything closer than that is one bubble.
 */
function clusterPhotos(photos: Photo[], projection: Projection): Cluster[] {
  if (projection.width <= 0) return [];

  const cellSize = 44;
  const buckets = new Map<string, Cluster>();

  for (const photo of photos) {
    const { x, y } = projection.toScreen(photoCoordinate(photo));
    if (
      x < -cellSize ||
      y < -cellSize ||
      x > projection.width + cellSize ||
      y > projection.height + cellSize
    ) {
      continue;
    }

    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.photos.push(photo);
      // Sit the bubble on the group's centre of mass, not on whichever pin
      // happened to be first.
      existing.x += (x - existing.x) / existing.photos.length;
      existing.y += (y - existing.y) / existing.photos.length;
    } else {
      buckets.set(key, { key, x, y, photos: [photo] });
    }
  }

  return [...buckets.values()];
}

function zoomTo(
  mapRef: React.RefObject<MapView | null>,
  projection: Projection,
  cluster: Cluster
): void {
  const centre = projection.toCoordinate({ x: cluster.x, y: cluster.y });
  mapRef.current?.animateToRegion(
    {
      ...centre,
      latitudeDelta: 400 / 111_320,
      longitudeDelta: 400 / (111_320 * Math.max(0.05, Math.cos((centre.latitude * Math.PI) / 180))),
    },
    350
  );
}

const onLayout =
  (set: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>) =>
  (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    set((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height }
    );
  };

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  pin: { position: 'absolute', alignItems: 'center' },
  pinHead: {
    width: PIN_WIDTH,
    height: PIN_WIDTH,
    borderRadius: PIN_WIDTH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cluster: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(20, 26, 44, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCount: { color: '#fff', fontSize: 13, fontWeight: '700' },
  explorer: { position: 'absolute', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withOpacity('#ffffff', 0.16),
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
});
