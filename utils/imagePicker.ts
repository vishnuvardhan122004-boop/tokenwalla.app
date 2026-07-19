/**
 * utils/imagePicker.ts — shared photo picker used by hospital profile.
 */

import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
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
