import React from 'react';
import { Text, View } from 'react-native';

/**
 * Initials in a coloured ring. Stands in for a profile picture, for you and for
 * your friends alike.
 */
export function ExplorerAvatar({
  initials,
  color,
  size = 34,
}: {
  initials: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: withOpacity(color, 0.85),
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        style={{
          fontSize: size * 0.38,
          fontWeight: '700',
          color: '#fff',
        }}>
        {initials}
      </Text>
    </View>
  );
}

/** `#RRGGBB` with an alpha channel bolted on. */
export function withOpacity(hex: string, opacity: number): string {
  const value = parseInt(hex.replace('#', ''), 16);
  if (!Number.isFinite(value)) return hex;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
