import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WanderTheme, wanderFont } from './theme';

/**
 * The inset grouped list SwiftUI's `List` draws, in the two places the app used
 * one: the travel sheet and the history sheet.
 */
export function Section({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.section}>
      {header ? (
        <Text style={[styles.header, wanderFont(13, 'semibold')]}>{header.toUpperCase()}</Text>
      ) : null}
      <View style={styles.group}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text style={[styles.footer, wanderFont(12)]}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  onPress,
  disabled = false,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (!onPress) return <View style={styles.row}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && !disabled ? styles.rowPressed : null]}>
      <View style={[styles.rowInner, disabled ? styles.rowDisabled : null]}>{children}</View>
    </Pressable>
  );
}

export function RowTitle({ children, tint }: { children: React.ReactNode; tint?: string }) {
  return (
    <Text style={[wanderFont(16), { color: tint ?? WanderTheme.textPrimary }]}>{children}</Text>
  );
}

export function RowCaption({ children }: { children: React.ReactNode }) {
  return <Text style={[wanderFont(12), styles.caption]}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  header: {
    color: WanderTheme.secondaryText,
    marginHorizontal: 32,
    marginBottom: 7,
    letterSpacing: 0.4,
  },
  footer: {
    color: WanderTheme.secondaryText,
    marginHorizontal: 32,
    marginTop: 8,
    lineHeight: 17,
  },
  group: {
    marginHorizontal: 18,
    backgroundColor: WanderTheme.panel,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: WanderTheme.hairline,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  rowInner: { flex: 1, justifyContent: 'center' },
  rowPressed: { backgroundColor: WanderTheme.panelSoft },
  rowDisabled: { opacity: 0.4 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: WanderTheme.hairline,
    marginLeft: 16,
  },
  caption: { color: WanderTheme.secondaryText },
});
