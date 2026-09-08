import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { logError, toAppError } from '../lib/errors';
import { compressForUploadSafe, formatBytes } from '../lib/images';
import { deletePhoto, getPhotoUrl, uploadPhoto } from '../services/api';
import { neutral, radius, semantic, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { useToast } from './Toast';

/** Renders a stored photo path by resolving a short-lived signed URL. */
export const SignedImage: React.FC<{ path?: string | null; size?: number; radius?: number }> = ({
  path,
  size = 60,
  radius: r = 10,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl(null);
    if (!path) return;

    getPhotoUrl(path)
      .then((resolved) => {
        if (!active) return;
        if (resolved) setUrl(resolved);
        else setFailed(true);
      })
      .catch((error) => {
        logError('SignedImage.resolve', error);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [path]);

  if (!path) return null;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        overflow: 'hidden',
        backgroundColor: neutral[200],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {failed ? (
        // A missing photo must never look like a crash — the ledger figures
        // are what matter.
        <Text style={styles.imageFallback}>photo{'\n'}unavailable</Text>
      ) : url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ActivityIndicator size="small" color={neutral[400]} />
      )}
    </View>
  );
};

/**
 * Camera / gallery strip used for ornament photos and KYC documents.
 * Images upload straight to Supabase Storage; only the object path is kept in
 * the row, so photos never bloat the database.
 */
export const PhotoStrip: React.FC<{
  storeId: string;
  folder: 'items' | 'kyc';
  paths: string[];
  onChange: (paths: string[]) => void;
  max?: number;
  label?: string;
}> = ({ storeId, folder, paths, onChange, max = 4, label = 'Photos' }) => {
  const { accent } = useAccent();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (source: 'camera' | 'library') => {
    if (busy) return; // one upload at a time
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          source === 'camera'
            ? 'Allow camera access to photograph pledged ornaments. You can turn this on in Android Settings → Apps → Girvi Pawn Manager → Permissions.'
            : 'Allow photo access to attach existing pictures. You can turn this on in Android Settings → Apps → Girvi Pawn Manager → Permissions.'
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        // Full quality here — compressForUpload does the real shrinking, and
        // stacking two lossy passes just makes the photo muddy for no gain.
        quality: 1,
        base64: false,
        allowsEditing: false,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.uri) throw new Error('Could not read the selected image. Please try another photo.');

      setBusy(true);
      const compressed = await compressForUploadSafe(
        asset.uri,
        folder,
        asset.base64 ?? undefined,
        asset.width,
        asset.height
      );

      const path = await uploadPhoto(storeId, compressed.base64, folder);
      onChange([...paths, path]);
      toast.showSuccess(`Photo attached (${formatBytes(compressed.bytes)}).`);
    } catch (error) {
      logError('PhotoStrip.pick', error);
      const appError = toAppError(error);
      // A failed photo must not block recording the pledge itself.
      toast.showError(error, appError.retryable ? { retry: () => void pick(source) } : undefined);
    } finally {
      setBusy(false);
    }
  };

  const remove = (path: string) => {
    Alert.alert('Remove photo?', 'This deletes the picture from cloud storage permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          // Drop it from the form first so the UI stays responsive; a failed
          // cloud delete only leaves an orphan file, which is harmless.
          onChange(paths.filter((p) => p !== path));
          deletePhoto(path).catch((error) => logError('PhotoStrip.remove', error));
        },
      },
    ]);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>
        {label} ({paths.length}/{max})
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {paths.map((path) => (
          <Pressable key={path} onLongPress={() => remove(path)}>
            <SignedImage path={path} size={68} />
            <Text style={styles.removeHint}>hold to remove</Text>
          </Pressable>
        ))}

        {paths.length < max && (
          <>
            <Pressable
              onPress={() => pick('camera')}
              style={[styles.addTile, { borderColor: accent.primary }]}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={accent.primary} />
              ) : (
                <Text style={[styles.addTileText, { color: accent.primary }]}>Camera</Text>
              )}
            </Pressable>
            <Pressable onPress={() => pick('library')} style={styles.addTile} disabled={busy}>
              <Text style={styles.addTileText}>Gallery</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: '700', color: neutral[600], marginBottom: 6 },
  row: { gap: spacing.sm, alignItems: 'center', paddingRight: spacing.md },
  addTile: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: neutral[300],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  addTileText: { fontSize: 11, fontWeight: '800', color: neutral[500] },
  removeHint: { fontSize: 8, color: semantic.danger, textAlign: 'center', marginTop: 2 },
  imageFallback: {
    fontSize: 8,
    color: neutral[500],
    textAlign: 'center',
    fontWeight: '600',
  },
});
