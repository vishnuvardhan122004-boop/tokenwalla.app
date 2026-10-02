/**
 * components/ProviderAboutPanel.tsx
 *
 * "About the …" panel — logo, hours, blurb, directions, socials, services and
 * photos for a provider, whatever kind it is.
 *
 * Lifted out of the doctor screen so the scanning-centre and blood-centre
 * screens get the same panel rather than a second copy that drifts. Centres
 * ARE Hospital rows and their screens already fetch /hospitals/<id>/, so every
 * field here was being returned and thrown away.
 *
 * Renders nothing when the provider has filled none of it in — an empty
 * "About" heading reads as something that failed to load.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Colors } from '../constants/colors';
import { directionsUrl, isOpenNow } from '../utils/booking';
import { useI18n } from '../services/i18n';
import PhotoViewer from './PhotoViewer';

// Official brand marks (simple-icons paths), not look-alike emoji. Exported
// because the doctor screen's share sheet uses the same two.
const FacebookLogo = ({ size = 26 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </Svg>
);
const InstagramLogo = ({ size = 26 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs>
      <LinearGradient id="igGrad" x1="0" y1="1" x2="1" y2="0">
        <Stop offset="0" stopColor="#FEDA75" />
        <Stop offset="0.25" stopColor="#FA7E1E" />
        <Stop offset="0.5" stopColor="#D62976" />
        <Stop offset="0.75" stopColor="#962FBF" />
        <Stop offset="1" stopColor="#4F5BD5" />
      </LinearGradient>
    </Defs>
    <Path fill="url(#igGrad)" d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
  </Svg>
);

export { FacebookLogo, InstagramLogo };

export interface GalleryPhoto { id: number | string; url: string }

export interface ProviderInfo {
  name?: string;
  logo?: string;
  description?: string;
  open_time?: string;
  close_time?: string;
  instagram?: string;
  youtube?: string;
  facebook?: string;
  services?: string[];
  gallery?: GalleryPhoto[];
  location?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface Props {
  info: ProviderInfo | null;
  title?: string;
  /** Ionicon shown when the provider has no logo uploaded. */
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

export default function ProviderAboutPanel({
  info, title, fallbackIcon = 'business-outline',
}: Props) {
  // Above the early return — hooks must run on every render.
  const { t } = useI18n();
  // Index of the photo the full-screen viewer is open on; -1 is closed.
  const [viewerAt, setViewerAt] = useState(-1);
  if (!info) return null;

  const hasAnything = info.description || info.open_time || info.instagram || info.youtube
    || info.facebook || (info.services?.length ?? 0) > 0 || (info.gallery?.length ?? 0) > 0;
  if (!hasAnything) return null;

  const openNow = isOpenNow(info.open_time, info.close_time);
  const hasLogo = !!info.logo?.startsWith('http');

  return (
    <View style={st.block}>
      <View style={st.headRow}>
        <View style={st.headLeft}>
          {hasLogo
            ? <Image
                source={{ uri: info.logo! }}
                style={st.logo}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={180}
              />
            : <Ionicons name={fallbackIcon} size={16} color={Colors.blue600} />}
          <Text style={st.title}>{title ?? t('pa_about_hospital')}</Text>
        </View>
        {openNow != null && (
          <View style={[st.openPill, {
            backgroundColor: openNow ? Colors.successBg : Colors.errorBg,
            borderColor:     openNow ? Colors.successBorder : Colors.errorBorder,
          }]}>
            {/* A filled dot rather than an emoji — the same status-dot shape
                the Available/Unavailable pill uses. */}
            <View style={[st.dot, { backgroundColor: openNow ? Colors.successText : Colors.errorText }]} />
            <Text style={[st.openText, { color: openNow ? Colors.successText : Colors.errorText }]}>
              {openNow ? 'Open now' : 'Closed'}
            </Text>
          </View>
        )}
      </View>

      {info.open_time && info.close_time ? (
        <View style={st.hoursRow}>
          <Ionicons name="time-outline" size={14} color={Colors.gray600} />
          <Text style={st.hoursText}>{info.open_time} – {info.close_time}</Text>
        </View>
      ) : null}

      {info.description ? <Text style={st.desc}>{info.description}</Text> : null}

      <TouchableOpacity style={st.directionsBtn} onPress={() => Linking.openURL(directionsUrl(info))}>
        <Ionicons name="navigate-outline" size={15} color={Colors.blue700} />
        <Text style={st.directionsBtnText}>{t('pa_directions')}</Text>
      </TouchableOpacity>

      {(info.instagram || info.youtube || info.facebook) && (
        <View style={st.socialRow}>
          {info.instagram ? (
            <TouchableOpacity style={st.socialBtn} onPress={() => Linking.openURL(info.instagram!)}>
              <InstagramLogo size={16} />
              <Text style={st.socialBtnText}>Instagram</Text>
            </TouchableOpacity>
          ) : null}
          {info.youtube ? (
            <TouchableOpacity style={st.socialBtn} onPress={() => Linking.openURL(info.youtube!)}>
              <Ionicons name="logo-youtube" size={16} color="#FF0000" />
              <Text style={st.socialBtnText}>YouTube</Text>
            </TouchableOpacity>
          ) : null}
          {info.facebook ? (
            <TouchableOpacity style={st.socialBtn} onPress={() => Linking.openURL(info.facebook!)}>
              <FacebookLogo size={16} />
              <Text style={st.socialBtnText}>Facebook</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {info.services && info.services.length > 0 && (
        <>
          <Text style={st.sectionLabel}>{t('pa_services')}</Text>
          <View style={st.chipWrap}>
            {info.services.map(s => (
              <View key={s} style={st.chip}><Text style={st.chipText}>{s}</Text></View>
            ))}
          </View>
        </>
      )}

      {info.gallery && info.gallery.length > 0 && (
        <>
          <Text style={st.sectionLabel}>{t('pa_photos')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {info.gallery.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                onPress={() => setViewerAt(i)}
                accessibilityRole="button"
                accessibilityLabel={t('pa_view_photo')}
              >
                <Image
                  source={{ uri: p.url }}
                  style={st.galleryImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={180}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {viewerAt >= 0 && info.gallery && (
        <PhotoViewer
          photos={info.gallery}
          startAt={viewerAt}
          onClose={() => setViewerAt(-1)}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  block:       { backgroundColor: Colors.white, marginTop: 12, paddingHorizontal: 20, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.blue50 },
  headRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title:       { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  logo:        { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: Colors.blue200 },
  openPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  openText:    { fontSize: 11, fontWeight: '700' },
  hoursRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  hoursText:   { fontSize: 13, color: Colors.gray600, fontWeight: '500' },
  desc:        { fontSize: 13, color: Colors.gray600, lineHeight: 20, marginBottom: 14 },
  directionsBtn:     { flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  directionsBtnText: { fontSize: 14, fontWeight: '700', color: Colors.blue700 },
  socialRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  socialBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  socialBtnText: { fontSize: 12, fontWeight: '700', color: Colors.blue700 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.gray400, letterSpacing: 1.5, marginTop: 16, marginBottom: 8 },
  chipWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  chipText:    { fontSize: 12, fontWeight: '600', color: Colors.blue700 },
  galleryImg:  { width: 150, height: 110, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100 },
});
