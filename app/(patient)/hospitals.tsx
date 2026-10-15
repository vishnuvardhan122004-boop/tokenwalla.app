/**
 * Hospital list — opened by tapping the "Hospitals" stat on Home.
 *
 * /hospitals/ without ?kind= is consultation providers only (active, no
 * [TEST]), so every row here has doctors to show. Tapping one opens
 * hospital/[id], the hospital's profile with its doctors.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../../constants/colors';
import { isTestHospital } from '../../constants/config';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import API from '../../services/api';
import { useI18n } from '../../services/i18n';
import { safeBack } from '../../utils/navigation';
import { asList } from '../../utils/scanCenters';

/** Real remote URL, not a placeholder. Same test the doctor list applies. */
const realImage = (u?: string | null) => !!u && u.startsWith('http') && !u.includes('placehold');

export default function HospitalsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  useAndroidBack(() => safeBack(router));

  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [failed,    setFailed]    = useState(false);
  const [attempt,   setAttempt]   = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setFailed(false);
    API.get('/hospitals/')
      .then(({ data }) => {
        if (!cancelled) setHospitals(asList<any>(data).filter(h => !isTestHospital(h.name)));
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.gray700} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('stat_hospitals')}</Text>
      </View>

      {loading ? (
        <View style={st.centre}><ActivityIndicator size="large" color={Colors.blue600} /></View>
      ) : failed ? (
        <View style={st.centre}>
          <Ionicons name="cloud-offline-outline" size={44} color={Colors.gray400} />
          <Text style={st.emptyTitle}>{t('hl_cant_load_list')}</Text>
          <TouchableOpacity style={st.retry} onPress={() => setAttempt(a => a + 1)}>
            <Text style={st.retryText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={hospitals}
          keyExtractor={h => String(h.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={st.emptySub}>{t('hl_no_hospitals')}</Text>}
          renderItem={({ item: h }) => (
            <TouchableOpacity
              style={st.card}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/(patient)/hospital/[id]', params: { id: h.id } })}
            >
              {realImage(h.logo) || realImage(h.image) ? (
                <Image
                  source={{ uri: realImage(h.logo) ? h.logo : h.image }}
                  style={st.thumb}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={180}
                />
              ) : (
                <View style={[st.thumb, st.thumbFallback]}>
                  <Ionicons name="business-outline" size={24} color={Colors.blue400} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name} numberOfLines={1}>{h.name}</Text>
                {!!h.city && <Text style={st.meta} numberOfLines={1}>{h.city}</Text>}
                {!!h.address && <Text style={st.address} numberOfLines={2}>{h.address}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.gray50 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray800, textAlign: 'center' },
  emptySub:   { fontSize: 13.5, color: Colors.gray500, textAlign: 'center', marginTop: 24 },
  retry:      { marginTop: 8, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10, backgroundColor: Colors.blue50 },
  retryText:  { fontSize: 13.5, fontWeight: '700', color: Colors.blue700 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 10,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray200,
  },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray900, flex: 1 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10,
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.gray200,
  },
  thumb:         { width: 54, height: 54, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100 },
  thumbFallback: { backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  name:    { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  meta:    { fontSize: 12.5, color: Colors.gray500, marginTop: 2 },
  address: { fontSize: 12, color: Colors.gray400, marginTop: 3 },
});
