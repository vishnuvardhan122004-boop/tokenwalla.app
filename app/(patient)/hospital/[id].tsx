/**
 * Hospital page — the hospital's profile, then its doctors. Reached from the
 * hospital list (hospitals.tsx); a doctor row opens doctor/[id] to book.
 *
 * Same shape as scan-center/[id].tsx, with doctors where a centre lists scans.
 * One Tabs.Screen instance serves the whole session, so state is reset on the
 * `id` param or the previous hospital's doctors flash before the new ones land.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../../../constants/colors';
import { useAndroidBack } from '../../../hooks/useAndroidBack';
import ProviderAboutPanel from '../../../components/ProviderAboutPanel';
import API from '../../../services/api';
import { useI18n } from '../../../services/i18n';
import { directionsUrl, providerLabel } from '../../../utils/booking';
import { asList } from '../../../utils/scanCenters';
import { safeBack } from '../../../utils/navigation';

const realImage = (u?: string | null) => !!u && u.startsWith('http') && !u.includes('placehold');

export default function HospitalScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const back = () => safeBack(router, '/(patient)/hospitals');
  useAndroidBack(back);

  const [hospital, setHospital] = useState<any>(null);
  const [doctors,  setDoctors]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [failed,   setFailed]   = useState(false);
  // A 404 is the server saying this hospital is not public (pending, rejected
  // or [TEST]), not a network failure — a different message.
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setHospital(null); setDoctors([]);
    setFailed(false); setNotFound(false); setLoading(true);
    Promise.all([
      API.get(`/hospitals/${id}/`),
      // params, not a ?hospital= in the URL: isPublicRequest keys on the URL,
      // and this is the patient browse read, so it goes out without a token
      // exactly like the doctors tab's /doctors/.
      API.get('/doctors/', { params: { hospital: id } }),
    ])
      .then(([hRes, dRes]) => {
        if (cancelled) return;
        setHospital(hRes.data);
        setDoctors(asList<any>(dRes.data));
      })
      .catch((err) => {
        if (cancelled) return;
        setNotFound(err?.response?.status === 404);
        setFailed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <View style={st.centre}><ActivityIndicator size="large" color={Colors.blue600} /></View>
      </SafeAreaView>
    );
  }

  if (failed || !hospital) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <View style={st.centre}>
          <Ionicons name={notFound ? 'information-circle-outline' : 'cloud-offline-outline'}
            size={44} color={Colors.gray400} />
          <Text style={st.emptyTitle}>{t(notFound ? 'hl_not_available' : 'hl_cant_load')}</Text>
          <TouchableOpacity style={st.retry} onPress={back}>
            <Text style={st.retryText}>{t('sc_go_back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const callNumber = hospital.landline || hospital.mobile;
  // Map only for a REAL destination, same guard as the centre page: a name+city
  // search can land a patient at a similarly-named clinic across town.
  const hasMap = (typeof hospital.latitude === 'number' && typeof hospital.longitude === 'number')
    || /^https?:\/\//i.test((hospital.location || '').trim());

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <TouchableOpacity onPress={back} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.gray700} />
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{hospital.name}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={st.banner}>
          {realImage(hospital.image) ? (
            <Image
              source={{ uri: hospital.image }}
              style={st.bannerImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={180}
            />
          ) : (
            <Ionicons name="business" size={54} color={Colors.blue200} />
          )}
          <View style={st.bannerOverlay} />
        </View>

        <View style={{ padding: 16 }}>
          <View style={st.card}>
            <Text style={st.name}>{hospital.name}</Text>
            <Text style={st.meta}>
              {[hospital.city,
                (hospital.open_time || hospital.close_time) ? `${hospital.open_time || '—'} – ${hospital.close_time || '—'}` : null,
              ].filter(Boolean).join('  •  ')}
            </Text>
            {!!hospital.address && <Text style={st.address}>{hospital.address}</Text>}

            {(!!callNumber || hasMap) && (
              <View style={st.actionRow}>
                {!!callNumber && (
                  <TouchableOpacity style={st.callBtn} onPress={() => Linking.openURL(`tel:${callNumber}`)}>
                    <Ionicons name="call-outline" size={16} color={Colors.white} />
                    <Text style={st.callText}>{t('sc_call_number', { phone: callNumber })}</Text>
                  </TouchableOpacity>
                )}
                {hasMap && (
                  <TouchableOpacity
                    style={st.mapBtn}
                    onPress={() => Linking.openURL(directionsUrl(hospital))}
                    accessibilityRole="button"
                    accessibilityLabel={t('sc_open_in_maps', { name: hospital.name })}
                  >
                    <Ionicons name="location-outline" size={16} color={Colors.blue700} />
                    <Text style={st.mapText}>{t('view_on_map')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <Text style={st.sectionTitle}>{t('tab_doctors')}</Text>
          {doctors.length === 0 && <Text style={st.emptySub}>{t('hl_no_doctors')}</Text>}
          {doctors.map(doc => (
            <TouchableOpacity
              key={String(doc.id)}
              style={st.docRow}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/(patient)/doctor/[id]', params: { id: doc.id } })}
            >
              {realImage(doc.image) ? (
                <Image source={{ uri: doc.image }} style={st.docImg} contentFit="cover"
                  cachePolicy="memory-disk" transition={180} />
              ) : (
                <View style={[st.docImg, st.docImgFallback]}>
                  <Ionicons name="medkit-outline" size={22} color={Colors.blue400} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.docName} numberOfLines={1}>{providerLabel(doc.name)}</Text>
                {!!doc.specialization && <Text style={st.docSpec} numberOfLines={1}>{doc.specialization}</Text>}
                {doc.experience != null && <Text style={st.docMeta}>{t('yrs_exp', { years: doc.experience })}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[st.badge, doc.available ? st.badgeOn : st.badgeOff]}>
                  {doc.available ? t('available') : t('busy')}
                </Text>
                <Text style={st.fee}>₹{doc.fee ?? 0}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <ProviderAboutPanel info={hospital} title={t('pa_about_hospital')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.gray50 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray800, textAlign: 'center' },
  emptySub:   { fontSize: 13.5, color: Colors.gray500, lineHeight: 20 },
  retry:      { marginTop: 8, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10, backgroundColor: Colors.blue50 },
  retryText:  { fontSize: 13.5, fontWeight: '700', color: Colors.blue700 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 10,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray200,
  },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray900, flex: 1 },

  banner:        { height: 170, position: 'relative', overflow: 'hidden', backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  bannerImage:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  bannerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,44,83,0.2)' },

  card:    { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray200 },
  name:    { fontSize: 21, fontWeight: '800', color: Colors.gray900 },
  meta:    { fontSize: 13, color: Colors.gray500, marginTop: 4 },
  address: { fontSize: 12.5, color: Colors.gray400, marginTop: 6 },
  // Wraps to one full-width button per line when both can't fit — see the
  // same rule on scan-center/[id].tsx for why it isn't flex:1.
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  callBtn: {
    flexGrow: 1, minWidth: 150,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 11, backgroundColor: Colors.blue600,
  },
  callText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  mapBtn: {
    flexGrow: 1, minWidth: 150,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 11,
    backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200,
  },
  mapText: { fontSize: 14, fontWeight: '700', color: Colors.blue700 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900, marginTop: 22, marginBottom: 10 },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10,
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.gray200,
  },
  docImg:         { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: Colors.blue100 },
  docImgFallback: { backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  docSpec: { fontSize: 12.5, fontWeight: '600', color: Colors.blue600, marginTop: 2 },
  docMeta: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  badge:    { fontSize: 10, fontWeight: '700', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden' },
  badgeOn:  { backgroundColor: Colors.successBg, color: Colors.successText },
  badgeOff: { backgroundColor: Colors.errorBg, color: Colors.errorText },
  fee:      { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
});
