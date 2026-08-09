import { TextStyle } from 'react-native';

/** The dark glass palette. Used by the map screen and nowhere else. */
export const Theme = {
  background: 'rgb(9, 12, 22)',
  panel: 'rgb(23, 28, 43)',
  accent: 'rgb(110, 168, 255)',
  warm: 'rgb(255, 158, 105)',
  hairline: 'rgba(255, 255, 255, 0.12)',
  secondaryText: 'rgba(255, 255, 255, 0.62)',
} as const;

/**
 * The light, illustrated palette used by every screen except the map itself —
 * home, friends, stats, and the sheets they open. The map screen keeps `Theme`
 * (dark glass) untouched, so this lives alongside it rather than replacing it.
 */
export const WanderTheme = {
  background: 'rgb(246, 233, 207)',
  panel: 'rgb(254, 248, 236)',
  panelSoft: 'rgb(251, 240, 218)',
  accent: 'rgb(91, 138, 58)',
  warm: 'rgb(217, 127, 53)',
  textPrimary: 'rgb(74, 47, 24)',
  secondaryText: 'rgb(142, 109, 73)',
  hairline: 'rgba(74, 47, 24, 0.14)',
  shadow: 'rgba(74, 47, 24, 0.14)',
} as const;

/** The drop shadow every card and floating control shares. */
export const wanderShadow = {
  shadowColor: 'rgb(74, 47, 24)',
  shadowOpacity: 0.14,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 5 },
} as const;

export const darkShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
} as const;

export type WanderWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy';

const FAMILIES: Record<WanderWeight, string> = {
  regular: 'Manrope-Regular',
  medium: 'Manrope-Medium',
  semibold: 'Manrope-SemiBold',
  bold: 'Manrope-Bold',
  heavy: 'Manrope-ExtraBold',
};

/**
 * Manrope, the typeface for every non-map screen. Bundled as static weights
 * rather than the variable font, so a family name resolves one specific weight
 * reliably — React Native has no synthetic weight axis to fall back on.
 */
export function wanderFont(size: number, weight: WanderWeight = 'regular'): TextStyle {
  return { fontFamily: FAMILIES[weight], fontSize: size };
}

/** The five font files loaded at launch, keyed by the family name they register. */
export const WANDER_FONTS = {
  'Manrope-Regular': require('../../assets/fonts/Manrope-Regular.ttf'),
  'Manrope-Medium': require('../../assets/fonts/Manrope-Medium.ttf'),
  'Manrope-SemiBold': require('../../assets/fonts/Manrope-SemiBold.ttf'),
  'Manrope-Bold': require('../../assets/fonts/Manrope-Bold.ttf'),
  'Manrope-ExtraBold': require('../../assets/fonts/Manrope-ExtraBold.ttf'),
};
