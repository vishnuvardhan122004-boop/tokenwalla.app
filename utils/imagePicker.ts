/**
 * utils/imagePicker.ts — shared photo pickers.
 *
 * Two callers with different needs: the hospital profile picks a banner/logo
 * from the library and crops it, and the queue shares a document with a patient
 * — usually by photographing a printed report, which must NOT be cropped.
 */

import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
  /** The real File, which the picker only provides on web. Native has no File
   *  object at all — there, FormData takes the { uri, name, type } shape. Send
   *  this when it exists: a web `blob:` uri in that shape uploads nothing. */
  file?: File;
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Please allow photo library access to upload images.');
    return false;
  }
  return true;
}

/**
 * Launch the photo library and return the picked image as an upload-ready
 * { uri, name, type }, or null if cancelled / denied.
 * `aspect` controls the crop ratio (e.g. [16,9] banner, [1,1] logo).
 */
export async function pickImageFile(aspect: [number, number] = [1, 1]): Promise<PickedImage | null> {
  const ok = await ensurePermission();
  if (!ok) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality: 0.8,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  const fileName = asset.uri.split('/').pop() ?? 'image.jpg';
  const match = /\.(\w+)$/.exec(fileName);
  const mimeType = match ? `image/${match[1]}` : 'image/jpeg';

  return { uri: asset.uri, name: fileName, type: mimeType };
}


async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Please allow camera access to photograph a report.');
    return false;
  }
  return true;
}

/**
 * Photograph a document, or pick an existing photo of one.
 *
 * No `allowsEditing`: the profile picker crops to an aspect ratio because a
 * logo has one, but a printed report does not — cropping it to a square cuts
 * off half the results. Quality stays high enough that small print survives.
 */
export async function pickDocumentPhoto(source: 'camera' | 'library'): Promise<PickedImage | null> {
  const ok = source === 'camera' ? await ensureCameraPermission() : await ensurePermission();
  if (!ok) return null;

  const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);

  if (result.canceled) return null;

  const asset    = result.assets[0];
  const fileName = asset.fileName || asset.uri.split('/').pop() || 'photo.jpg';
  // The extension is what decides whether the patient's phone can open it, so
  // never let a nameless asset through as something unopenable.
  const withExt  = /\.\w+$/.test(fileName) ? fileName : `${fileName}.jpg`;
  const match    = /\.(\w+)$/.exec(withExt);
  return {
    uri:  asset.uri,
    name: withExt,
    type: asset.mimeType || (match ? `image/${match[1].toLowerCase()}` : 'image/jpeg'),
    file: (asset as { file?: File }).file,
  };
}
