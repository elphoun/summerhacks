import Constants from 'expo-constants';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CaptureOutcome } from '../state/appModel';
import { useAppModel } from '../state/useAppModel';
import { PixelClip, PixelPanel } from '../ui/PixelBox';
import { PixelGlyph, PixelIcon } from '../ui/PixelIcon';
import { Sheet } from '../ui/Sheet';
import { coordinateLabel } from '../ui/format';
import { WanderTheme, wanderFont } from '../ui/theme';

interface Picked {
  uri: string;
  base64: string;
}

/**
 * Leaving a photo at a place.
 *
 * Three ways in, on purpose: the camera on a real device, the photo library,
 * and a generated sample shot so the flow is still demonstrable on a simulator
 * that has neither.
 */
export function CaptureSheet({
  visible,
  close,
  onFinished,
}: {
  visible: boolean;
  close: () => void;
  onFinished: (outcome: CaptureOutcome) => void;
}) {
  const model = useAppModel();

  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  const reset = () => {
    setPicked(null);
    setCaption('');
  };

  const dismiss = () => {
    reset();
    close();
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('No camera access', 'Allow the camera in Settings to leave a photo you took.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled) await accept(result.assets[0].uri);
  };

  const chooseFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled) await accept(result.assets[0].uri);
  };

  const useSampleShot = async () => {
    setIsRendering(true);
    try {
      const base64 = await model.sampleShot();
      setPicked({ uri: `data:image/png;base64,${base64}`, base64 });
    } catch {
      model.showBanner('Could not draw a sample shot — is the server running?', true);
    }
    setIsRendering(false);
  };

  /**
   * Downscale before upload. Phone cameras produce far more pixels than a
   * gallery thumbnail needs, and the upload travels as base64.
   */
  const accept = async (uri: string) => {
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (result.base64) setPicked({ uri: result.uri, base64: result.base64 });
  };

  const upload = async () => {
    if (!picked) return;
    setIsUploading(true);
    const outcome = await model.leavePhoto(picked.base64, caption);
    setIsUploading(false);
    if (!outcome) return;
    reset();
    onFinished(outcome);
  };

  return (
    <Sheet
      visible={visible}
      title={picked ? 'Add a note' : 'Leave a memory'}
      onClose={dismiss}
      closeLabel="Cancel"
      closeOnLeading
      closeDisabled={isUploading}>
      {picked ? (
        <ScrollView contentContainerStyle={styles.composer} keyboardShouldPersistTaps="handled">
          <PixelClip radius={20} cutColor={WanderTheme.background} stroke={WanderTheme.hairline} style={styles.preview}>
            <Image source={{ uri: picked.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </PixelClip>

          <PixelPanel radius={14} shadow={false} style={styles.captionBox}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Say something about this place…"
              placeholderTextColor={WanderTheme.secondaryText}
              multiline
              style={[wanderFont(15), styles.captionField]}
            />
          </PixelPanel>

          <Pressable onPress={upload} disabled={isUploading}>
            <PixelPanel radius={16} fill={WanderTheme.warm} stroke="none" shadow={false} style={styles.primaryButton}>
              {isUploading ? <ActivityIndicator color="#fff" /> : null}
              <Text style={[wanderFont(16, 'semibold'), styles.onWarm]}>
                {isUploading ? 'Leaving it here…' : 'Leave this photo here'}
              </Text>
            </PixelPanel>
          </Pressable>

          <Pressable onPress={reset} disabled={isUploading}>
            <Text style={[wanderFont(13), styles.secondary, styles.centered]}>
              Pick a different photo
            </Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.chooser}>
          <View style={styles.where}>
            <Text style={[wanderFont(22, 'bold'), styles.primary]}>
              {model.currentPlaceName ?? 'Right here'}
            </Text>
            {model.location ? (
              <Text style={styles.coordinates}>
                {coordinateLabel(model.location.latitude, model.location.longitude)}
              </Text>
            ) : null}
            <Text style={[wanderFont(13), styles.secondary, styles.centered]}>
              Your photo stays here for whoever comes next.
            </Text>
          </View>

          <View style={styles.sources}>
            {cameraIsUsable ? (
              <SourceButton title="Take a photo" glyph="camera" prominent onPress={takePhoto} />
            ) : null}

            <SourceButton
              title="Choose from library"
              glyph="image"
              prominent={false}
              onPress={chooseFromLibrary}
            />

            <SourceButton
              title="Use a sample shot"
              glyph="sparkles"
              prominent={!cameraIsUsable}
              busy={isRendering}
              onPress={useSampleShot}
            />

            {cameraIsUsable ? null : (
              <Text style={[wanderFont(12), styles.secondary, styles.centered]}>
                No camera here — the sample shot stands in for one.
              </Text>
            )}
          </View>
        </View>
      )}
    </Sheet>
  );
}

/**
 * The simulator *claims* a camera — it will happily report one — but the
 * viewfinder never opens, so tapping through lands you on a dead black screen.
 * Trust the hardware check only where it can be true.
 */
const cameraIsUsable = Constants.isDevice;

function SourceButton({
  title,
  glyph,
  prominent,
  busy = false,
  onPress,
}: {
  title: string;
  glyph: PixelGlyph;
  prominent: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={busy}>
      <PixelPanel
        radius={16}
        fill={prominent ? WanderTheme.warm : WanderTheme.panel}
        stroke={prominent ? 'none' : WanderTheme.hairline}
        strokeWidth={1}
        shadow={false}
        style={styles.source}>
        <PixelIcon glyph={glyph} size={18} color={prominent ? '#fff' : WanderTheme.textPrimary} />
        <Text
          style={[
            wanderFont(16, 'semibold'),
            { color: prominent ? '#fff' : WanderTheme.textPrimary, flex: 1 },
          ]}>
          {title}
        </Text>
        {busy ? <ActivityIndicator color={prominent ? '#fff' : WanderTheme.textPrimary} /> : null}
      </PixelPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chooser: { flex: 1, gap: 18 },
  where: { alignItems: 'center', gap: 6, paddingTop: 24, paddingHorizontal: 20 },
  coordinates: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: WanderTheme.secondaryText,
  },
  sources: { paddingHorizontal: 20, gap: 12 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 16 },

  composer: { padding: 20, gap: 16 },
  preview: { height: 340 },
  captionBox: {},
  captionField: { padding: 14, minHeight: 60, color: WanderTheme.textPrimary },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  onWarm: { color: '#fff' },

  primary: { color: WanderTheme.textPrimary },
  secondary: { color: WanderTheme.secondaryText },
  centered: { textAlign: 'center' },
});
