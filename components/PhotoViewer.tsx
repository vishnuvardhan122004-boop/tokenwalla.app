/**
 * components/PhotoViewer.tsx
 *
 * Full-screen facility-photo viewer: tap a thumbnail, swipe through, close.
 *
 * Mirrors the website's viewer (ProviderAboutPanel there) with each platform's
 * own machinery — <dialog> and CSS scroll-snap on the web, Modal and a paging
 * FlatList here. No image-viewer dependency: `pagingEnabled` already gives the
 * native snap and momentum, which is the whole of what one would add.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { useI18n } from '../services/i18n';
import { photoIndexAt } from '../utils/gallery';

export interface GalleryPhoto { id: number | string; url: string }

interface Props {
  photos: GalleryPhoto[];
  /** Index of the thumbnail that was tapped — the viewer opens on it. */
  startAt: number;
  onClose: () => void;
}

export default function PhotoViewer({ photos, startAt, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [index, setIndex] = useState(startAt);

  return (
    // onRequestClose is the Android back button — without it, back leaves the
    // viewer up and pops the screen underneath instead.
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.backdrop}>
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={p => String(p.id)}
          initialScrollIndex={startAt}
          // Required for initialScrollIndex: without it the list has to measure
          // its way there and lands on the first photo instead of the tapped one.
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={e =>
            setIndex(photoIndexAt(e.nativeEvent.contentOffset.x, width, photos.length))}
          renderItem={({ item }) => (
            // Tap anywhere to dismiss, which is what every photo viewer on a
            // phone does. The website protects a click on the photo itself,
            // but that does not port: `contentFit="contain"` letterboxes INSIDE
            // the Image's box, so the dark margin a thumb aims at is still the
            // Image and a swallowing wrapper turns most of the screen into a
            // dead zone. Verified on device before it was taken out. A swipe is
            // not a press, so paging is unaffected.
            <Pressable style={[st.slide, { width, height }]} onPress={onClose}>
              <Image
                source={{ uri: item.url }}
                style={{ width: width - 24, height: height * 0.72 }}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={180}
              />
            </Pressable>
          )}
        />

        {photos.length > 1 && (
          <View style={[st.counter, { top: insets.top + 14 }]}>
            <Text style={st.counterText}>{index + 1} / {photos.length}</Text>
          </View>
        )}

        <Pressable
          style={[st.close, { top: insets.top + 8 }]}
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('pa_close')}
        >
          <Ionicons name="close" size={22} color={Colors.white} />
        </Pressable>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(2,6,23,0.96)' },
  slide:       { alignItems: 'center', justifyContent: 'center' },
  counter:     { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(15,23,42,0.62)', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 5 },
  counterText: { color: Colors.white, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  close:       { position: 'absolute', right: 14, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
});
