import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { Photo, photoImageURL } from '../model/photo';
import { PixelClip } from './PixelBox';
import { PixelIcon } from './PixelIcon';
import { WanderTheme } from './theme';

/**
 * A photo from the shared collection, with a soft placeholder while it loads.
 *
 * Sized strictly to the frame it is given: the image fills and is clipped, so a
 * tall shot cannot spill into its neighbours or widen a scroll view.
 */
export function PhotoThumbnail({
  photo,
  cornerRadius = 14,
  cutColor = WanderTheme.panel,
  style,
}: {
  photo: Photo;
  cornerRadius?: number;
  /** Whatever the thumbnail sits on, so its corners read as cut out of it. */
  cutColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');

  return (
    <PixelClip
      radius={cornerRadius}
      cutColor={cutColor}
      stroke={WanderTheme.hairline}
      style={style}>
      <Image
        source={{ uri: photoImageURL(photo) }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
      {state === 'loaded' ? null : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          {state === 'failed' ? (
            <PixelIcon glyph="image" size={22} color={WanderTheme.secondaryText} />
          ) : (
            <ActivityIndicator color={WanderTheme.secondaryText} />
          )}
        </View>
      )}
    </PixelClip>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: WanderTheme.panelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
