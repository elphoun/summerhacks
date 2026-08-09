import React, { useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { pixelCornerMaskPath, pixelRoundedRectPath } from './pixelShape';
import { WanderTheme, wanderShadow } from './theme';

interface Size {
  width: number;
  height: number;
}

/** A second, inset outline — the map card's warm inner rule. */
interface InnerStroke {
  color: string;
  width: number;
  inset: number;
  radius: number;
}

interface PanelProps {
  radius?: number;
  steps?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  innerStroke?: InnerStroke;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * A card with pixel-art corners: the SwiftUI `wanderCard` modifier.
 *
 * The shape is drawn behind the children rather than clipping them, which is
 * all that is needed for text and icons and avoids paying for an offscreen
 * layer on every card.
 */
export function PixelPanel({
  radius = 20,
  steps = 2,
  fill = WanderTheme.panel,
  stroke = WanderTheme.hairline,
  strokeWidth = 1.5,
  innerStroke,
  shadow = true,
  style,
  children,
}: PanelProps) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  return (
    <View style={[shadow ? wanderShadow : null, style]} onLayout={measure(setSize)}>
      <Svg
        width={size.width}
        height={size.height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none">
        <Path
          d={pixelRoundedRectPath(size.width, size.height, radius, steps)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {innerStroke ? <Path {...insetOutline(size, innerStroke, steps)} /> : null}
      </Svg>
      {children}
    </View>
  );
}

interface ClipProps {
  radius?: number;
  steps?: number;
  /** The colour showing through the corners — whatever this box sits on. */
  cutColor: string;
  stroke?: string;
  strokeWidth?: number;
  innerStroke?: InnerStroke;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Pixel-art corners over something that has to be clipped — a photograph, the
 * map.
 *
 * React Native clips to a corner *radius* and nothing else, so instead of
 * clipping, the four corner offcuts are painted over the top in the surrounding
 * colour. The result is identical as long as `cutColor` is what the box sits
 * on, and it costs one overlay rather than an offscreen render pass on a
 * live map.
 */
export function PixelClip({
  radius = 14,
  steps = 2,
  cutColor,
  stroke,
  strokeWidth = 1,
  innerStroke,
  style,
  children,
}: ClipProps) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  return (
    <View style={[styles.clip, style]} onLayout={measure(setSize)}>
      {children}
      <Svg
        width={size.width}
        height={size.height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none">
        <Path
          d={pixelCornerMaskPath(size.width, size.height, radius, steps)}
          fill={cutColor}
          fillRule="evenodd"
        />
        {stroke ? (
          <Path
            d={pixelRoundedRectPath(size.width, size.height, radius, steps)}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        ) : null}
        {innerStroke ? <Path {...insetOutline(size, innerStroke, steps)} /> : null}
      </Svg>
    </View>
  );
}

const insetOutline = (size: Size, inner: InnerStroke, steps: number) => ({
  d: pixelRoundedRectPath(size.width, size.height, inner.radius, steps, inner.inset),
  fill: 'none',
  stroke: inner.color,
  strokeWidth: inner.width,
});

const measure =
  (set: React.Dispatch<React.SetStateAction<Size>>) => (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    set((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height }
    );
  };

const styles = StyleSheet.create({
  // Square clip: the corners are painted, not radiused, so rounding here would
  // only fight the overlay.
  clip: { overflow: 'hidden' },
});
