import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { initialsOf } from '../model/explorer';
import { useAppModel } from '../state/useAppModel';
import { ExplorerAvatar } from '../ui/ExplorerAvatar';
import { PixelPanel } from '../ui/PixelBox';
import { PixelIcon } from '../ui/PixelIcon';
import { WanderTheme, wanderFont } from '../ui/theme';

/**
 * Who you are, and whose photographs you can see.
 *
 * This device has one identity and one map. The only thing that changes what
 * appears on it is who you add here — which is why the friend code sits near the
 * top, at a size you can read across a table.
 */
export function FriendsView() {
  const model = useAppModel();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(model.explorer.displayName);
  const [code, setCode] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    void model.refreshFriends();
  }, [model]);

  const commitName = () => {
    model.rename(name);
    setName(model.explorer.displayName);
  };

  const add = async () => {
    if (code.length === 0 || isAdding) return;
    setIsAdding(true);
    setNotice(null);

    const outcome = await model.addFriend(code);
    if (outcome.kind === 'added') {
      setNotice({
        text: `${outcome.displayName} is now a friend. Their photos are on your map.`,
        isError: false,
      });
      setCode('');
    } else {
      setNotice({ text: outcome.message, isError: true });
    }
    setIsAdding(false);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View>
        <Text style={[wanderFont(26, 'heavy'), styles.primary]}>Friends</Text>
        <Text style={[wanderFont(13), styles.secondary]}>
          You see the photographs your friends left — and only on ground you have uncovered
          yourself.
        </Text>
      </View>

      {/* You */}
      <PixelPanel radius={18} style={styles.card}>
        <View style={styles.identityRow}>
          <ExplorerAvatar
            initials={initialsOf(name.length === 0 ? model.explorer.displayName : name)}
            color={model.explorer.colorHex}
            size={46}
          />
          <View style={styles.identityText}>
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={commitName}
              onBlur={commitName}
              placeholder="Your name"
              placeholderTextColor={WanderTheme.secondaryText}
              returnKeyType="done"
              style={[wanderFont(16, 'bold'), styles.primary, styles.nameField]}
            />
            <Text style={[wanderFont(12), styles.secondary]}>
              The name on every photo you leave
            </Text>
          </View>
        </View>

        <View style={styles.rule} />

        {model.explorer.friendCode ? (
          <>
            <View style={styles.codeRow}>
              <View>
                <Text style={[wanderFont(11, 'semibold'), styles.secondary]}>YOUR CODE</Text>
                <Text style={[wanderFont(26, 'heavy'), styles.primary, styles.code]}>
                  {model.explorer.friendCode}
                </Text>
              </View>
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(model.explorer.friendCode ?? '');
                  setNotice({ text: 'Code copied.', isError: false });
                }}>
                <Text style={[wanderFont(13, 'bold'), { color: WanderTheme.accent }]}>Copy</Text>
              </Pressable>
            </View>
            <Text style={[wanderFont(12), styles.secondary]}>
              Give this to someone to let them see what you leave behind.
            </Text>
          </>
        ) : (
          <View style={styles.waiting}>
            <PixelIcon glyph="clock" size={14} color={WanderTheme.secondaryText} />
            <Text style={[wanderFont(13), styles.secondary]}>
              Waiting for the server to issue your code
            </Text>
          </View>
        )}
      </PixelPanel>

      {/* Adding */}
      <PixelPanel radius={18} style={styles.card}>
        <View style={styles.cardTitle}>
          <PixelIcon glyph="users" size={16} color={WanderTheme.accent} />
          <Text style={[wanderFont(15, 'bold'), styles.primary]}>Add a friend</Text>
        </View>

        <View style={styles.addRow}>
          <PixelPanel
            radius={12}
            fill={WanderTheme.panelSoft}
            shadow={false}
            style={styles.codeFieldWrap}>
            <TextInput
              value={code}
              onChangeText={(text) => setCode(text.toUpperCase())}
              onSubmitEditing={add}
              placeholder="ABC123"
              placeholderTextColor={WanderTheme.secondaryText}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              style={[wanderFont(17, 'bold'), styles.primary, styles.codeField]}
            />
          </PixelPanel>

          <Pressable onPress={add} disabled={code.length === 0 || isAdding}>
            <PixelPanel
              radius={12}
              fill={code.length === 0 ? WanderTheme.secondaryText : WanderTheme.accent}
              stroke="none"
              shadow={false}
              style={styles.addButton}>
              {isAdding ? (
                <ActivityIndicator color={WanderTheme.background} />
              ) : (
                <Text style={[wanderFont(15, 'bold'), { color: WanderTheme.background }]}>Add</Text>
              )}
            </PixelPanel>
          </Pressable>
        </View>

        {notice ? (
          <Text
            style={[
              wanderFont(12, 'medium'),
              { color: notice.isError ? WanderTheme.warm : WanderTheme.accent },
            ]}>
            {notice.text}
          </Text>
        ) : null}

        <Text style={[wanderFont(12), styles.secondary]}>
          Type their code and you start seeing what they left in the places you have both been. It
          works both ways at once.
        </Text>
      </PixelPanel>

      {/* Their list */}
      <View style={styles.list}>
        <Text style={[wanderFont(11, 'semibold'), styles.secondary]}>
          {model.friends.length} FRIENDS
        </Text>

        {model.friends.length === 0 ? (
          <PixelPanel radius={18} style={styles.emptyCard}>
            <Text style={[wanderFont(13), styles.secondary]}>
              Nobody yet. Add someone by their code and their memories start showing up on your map.
            </Text>
          </PixelPanel>
        ) : (
          model.friends.map((friend) => (
            <PixelPanel key={friend.id} radius={18} style={styles.friendCard}>
              <ExplorerAvatar
                initials={initialsOf(friend.displayName)}
                color={friend.color}
                size={46}
              />
              <View style={styles.friendText}>
                <Text style={[wanderFont(16, 'bold'), styles.primary]}>{friend.displayName}</Text>
                <Text style={[wanderFont(12), styles.secondary]}>
                  {friend.isSeed === true ? 'One of the sample explorers' : 'Added by code'}
                </Text>
              </View>
              <PixelIcon glyph="checkmarkCircle" size={18} color={WanderTheme.accent} />
            </PixelPanel>
          ))
        )}
      </View>

      <Text style={[wanderFont(12), styles.secondary, styles.footnote]}>
        Where you have been is never sent anywhere. No friend of yours can uncover ground for you,
        and you cannot uncover any for them.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: WanderTheme.background },
  content: { paddingHorizontal: 18, paddingBottom: 130, gap: 18 },

  card: { padding: 16, gap: 12 },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityText: { flex: 1, gap: 2 },
  nameField: { padding: 0 },
  rule: { height: 1, backgroundColor: WanderTheme.hairline },
  codeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  code: { letterSpacing: 4, marginTop: 3 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeFieldWrap: { flex: 1 },
  codeField: { paddingHorizontal: 12, paddingVertical: 10 },
  addButton: { width: 70, height: 42, alignItems: 'center', justifyContent: 'center' },

  list: { gap: 12 },
  emptyCard: { padding: 14 },
  friendCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  friendText: { flex: 1, gap: 2 },
  footnote: { paddingHorizontal: 4 },

  primary: { color: WanderTheme.textPrimary },
  secondary: { color: WanderTheme.secondaryText },
});
