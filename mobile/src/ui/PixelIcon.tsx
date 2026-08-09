import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { PIXEL_GLYPHS, PixelGlyph } from './pixelGlyphs';

export type { PixelGlyph };

interface Props {
  glyph: PixelGlyph;
  size?: number;
  color: string;
}

/**
 * A pixel-art icon from the vendored set, tinted like an SF Symbol.
 *
 * Even-odd fill, because the artwork draws its holes — the tick inside the
 * check circle, the window inside the camera — as inner subpaths rather than as
 * separate shapes.
 */
export function PixelIcon({ glyph, size = 22, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={PIXEL_GLYPHS[glyph]} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
