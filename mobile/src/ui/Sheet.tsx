import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { WanderTheme, wanderFont } from './theme';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** The trailing button's wording. SwiftUI's confirmationAction, by any name. */
  closeLabel?: string;
  /** Put the button on the leading edge instead, as the capture sheet does. */
  closeOnLeading?: boolean;
  closeDisabled?: boolean;
  children: React.ReactNode;
}

/**
 * A presented sheet: the `NavigationStack` inside `.sheet` that every modal in
 * the app was built from — inline title, one toolbar button, background carried
 * through so the sheet is not a white card on a warm screen.
 *
 * `pageSheet` is the card presentation SwiftUI's `.large` detent gives. Custom
 * detents are a native API with no React Native equivalent, so the travel sheet
 * opens at full height rather than half.
 */
export function Sheet({
  visible,
  title,
  onClose,
  closeLabel = 'Done',
  closeOnLeading = false,
  closeDisabled = false,
  children,
}: Props) {
  const button = (
    <Pressable onPress={onClose} disabled={closeDisabled} hitSlop={8}>
      <Text
        style={[
          styles.action,
          wanderFont(16, 'semibold'),
          closeDisabled ? styles.actionDisabled : null,
        ]}>
        {closeLabel}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.bar}>
          <View style={styles.barSide}>{closeOnLeading ? button : null}</View>
          <Text numberOfLines={1} style={[styles.title, wanderFont(17, 'semibold')]}>
            {title}
          </Text>
          <View style={[styles.barSide, styles.barTrailing]}>
            {closeOnLeading ? null : button}
          </View>
        </View>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WanderTheme.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: WanderTheme.hairline,
  },
  barSide: { minWidth: 72 },
  barTrailing: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', color: WanderTheme.textPrimary },
  action: { color: WanderTheme.accent },
  actionDisabled: { color: WanderTheme.secondaryText },
});
