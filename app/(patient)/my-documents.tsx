/**
 * app/(patient)/my-documents.tsx
 *
 * Every document a provider has shared with the patient, in one list.
 *
 * The same rows the booking cards already show, flattened across bookings and
 * newest-first — a patient looking for "my blood report from March" does not
 * remember which booking it hung off. The file itself is never held here: each
 * row downloads through the ownership-checked endpoint on tap.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../../constants/colors';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import API from '../../services/api';
import { useI18n } from '../../services/i18n';
import { openSharedDocument } from '../../services/reportFile';
import { safeBack } from '../../utils/navigation';

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyDocumentsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  useAndroidBack(() => safeBack(router, '/(patient)/profile'));

  const [docs,    setDocs]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);
  const [busyId,  setBusyId]  = useState<number | string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get('/bookings/reports/mine/');
      setDocs(Array.isArray(data) ? data : []);
      setFailed(false);
    } catch (e: any) {
      // 404 = a backend without the endpoint yet: nothing to show. Anything
      // else is a failure, not "no documents" — say so and offer a retry.
      if (e?.response?.status === 404) { setDocs([]); setFailed(false); }
      else setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // On focus, so a document shared since the last visit shows up.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (doc: any) => {
    setBusyId(doc.id);
    try {
      await openSharedDocument(doc);
    } catch {
      Alert.alert(t('error'), t('md_open_failed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => safeBack(router, '/(patient)/profile')}>
          <Ionicons name="chevron-back" size={22} color={Colors.blue600} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('menu_my_documents')}</Text>
        <View style={st.backBtn} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={Colors.blue600} /></View>
      ) : failed && docs.length === 0 ? (
        <View style={st.center}>
          <Ionicons name="cloud-offline-outline" size={44} color={Colors.gray400} />
          <Text style={st.emptyTitle}>{t('connection_error')}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={[st.emptyText, { color: Colors.blue600, fontWeight: '700' }]}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={docs.length === 0 ? st.emptyWrap : st.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={st.card}
              activeOpacity={0.7}
              disabled={busyId === item.id}
              onPress={() => open(item)}
            >
              <View style={st.iconWrap}>
                <Ionicons name="document-text-outline" size={18} color={Colors.blue600} />
              </View>
              <View style={st.body}>
                <Text style={st.title} numberOfLines={1}>{item.title || 'Document'}</Text>
                <Text style={st.meta} numberOfLines={1}>
                  {[item.hospital_name, item.provider_name].filter(Boolean).join(' · ')}
                </Text>
                <Text style={st.date}>{formatDate(item.created)}</Text>
              </View>
              {busyId === item.id
                ? <ActivityIndicator size="small" color={Colors.blue600} />
                : <Ionicons name="download-outline" size={20} color={Colors.blue600} />}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={st.empty}>
              <Ionicons name="document-outline" size={44} color={Colors.gray400} />
              <Text style={st.emptyTitle}>{t('md_no_documents')}</Text>
              <Text style={st.emptyText}>
                When a hospital, scanning centre or blood centre shares a report
                with you, it appears here — and we&apos;ll notify you.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.gray50 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.gray900 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:        { padding: 14, gap: 10 },
  card:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: Colors.blue100, padding: 14 },
  iconWrap:    { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  body:        { flex: 1 },
  title:       { fontSize: 14.5, fontWeight: '700', color: Colors.gray900 },
  meta:        { fontSize: 12.5, color: Colors.gray500, marginTop: 2 },
  date:        { fontSize: 11.5, color: Colors.gray400, marginTop: 2 },
  emptyWrap:   { flexGrow: 1, justifyContent: 'center' },
  empty:       { alignItems: 'center', paddingHorizontal: 36, gap: 8 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: Colors.gray700 },
  emptyText:   { fontSize: 13, color: Colors.gray500, textAlign: 'center', lineHeight: 19 },
});
