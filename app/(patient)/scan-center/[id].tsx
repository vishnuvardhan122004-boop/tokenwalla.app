/**
 * Scanning centre detail — the app mirror of the website's ScanCenterDetails.
 *
 * The one structural difference from the doctor screen: a doctor IS the service
 * (one name, one fee, straight to slots) while a centre offers many services at
 * many prices. So there is a step in between — pick the scan, THEN the slot.
 * The scan expands in place rather than pushing a second screen, so Android
 * back closes it and nothing has to be carried across a navigation.
 *
 * This screen is registered as a Tabs.Screen with href:null, like every other
 * hidden patient screen, so ONE instance serves the whole session. State that
 * must not survive a different centre is reset on the `id` param — the same
 * trap that caused the doctor-detail stale flash.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../../../constants/colors';
import { useAndroidBack } from '../../../hooks/useAndroidBack';
import API from '../../../services/api';
import { asList } from '../../../utils/scanCenters';
import { safeBack } from '../../../utils/navigation';

interface Scan {
  id: number | string;
  name: string;
  modality?: string;
  price: number;
  duration_minutes: number;
  description?: string;
  prep_instructions?: string;
  available: boolean;
  slots: string[];
  days: string[];
  fee_breakdown?: { collection_mode?: string };
}

const next7Days = () => Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    num:   d.getDate(),
    month: d.toLocaleDateString('en-IN', { month: 'short' }),
  };
});

export default function ScanCenterScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  useAndroidBack(() => safeBack(router, '/(patient)/doctors'));

  const [centre,  setCentre]  = useState<any>(null);
  const [scans,   setScans]   = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);

  const [openScan,     setOpenScan]     = useState<Scan | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [avail,        setAvail]        = useState<Record<string, any>>({});
  const [availLoading, setAvailLoading] = useState(false);

  const dates = next7Days();

  // Reset on centre change. This screen is a single Tabs.Screen instance, so
  // without this the previous centre's scans flash before the new ones land.
  useEffect(() => {
    setCentre(null); setScans([]); setOpenScan(null);
    setSelectedDate(''); setSelectedSlot(''); setAvail({});
    setFailed(false); setLoading(true);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      API.get(`/hospitals/${id}/`),
      API.get('/scans/', { params: { center: id } }),
    ])
      .then(([cRes, sRes]) => {
        if (cancelled) return;
        setCentre(cRes.data);
        setScans(asList<Scan>(sRes.data));
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Availability for the open scan + date.
  useEffect(() => {
    if (!openScan || !selectedDate) { setAvail({}); return; }
    let cancelled = false;
    setAvailLoading(true);
    API.get(`/scans/${openScan.id}/slot-availability/`, { params: { date: selectedDate } })
      .then(({ data }) => { if (!cancelled) setAvail(data || {}); })
      .catch(() => { if (!cancelled) setAvail({}); })
      .finally(() => { if (!cancelled) setAvailLoading(false); });
    return () => { cancelled = true; };
  }, [openScan, selectedDate]);

  const pickScan = useCallback((scan: Scan) => {
    const same = openScan?.id === scan.id;
    setOpenScan(same ? null : scan);
    setSelectedSlot('');
    setSelectedDate(same ? '' : dates[0].value);
    if (!same) API.post(`/scans/${scan.id}/view/`).catch(() => {});
  }, [openScan, dates]);

  const callNumber = centre?.landline || centre?.mobile;

  const book = (scan: Scan) => {
    if (!selectedSlot) return;
    router.push({
      pathname: '/(patient)/payment',
      params: {
        scanId:   String(scan.id),
        scanName: scan.name,
        hospital: centre?.name ?? '',
        date:     selectedDate,
        slot:     selectedSlot,
        scanFee:  String(scan.price),
      },
    } as never);
  };

  if (loading) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <View style={st.centre}><ActivityIndicator size="large" color={Colors.blue600} /></View>
      </SafeAreaView>
    );
  }

  if (failed || !centre) {
    return (
      <SafeAreaView style={st.safe} edges={['top']}>
        <View style={st.centre}>
          <Ionicons name="cloud-offline-outline" size={44} color={Colors.gray400} />
          <Text style={st.emptyTitle}>We couldn&apos;t load this centre</Text>
          <TouchableOpacity style={st.retry} onPress={() => safeBack(router, '/(patient)/doctors')}>
            <Text style={st.retryText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => safeBack(router, '/(patient)/doctors')} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.gray700} />
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{centre.name}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={st.card}>
          <View style={st.kindPill}>
            <Ionicons name="pulse" size={12} color={Colors.blue700} />
            <Text style={st.kindText}>SCANNING CENTRE</Text>
          </View>
          <Text style={st.name}>{centre.name}</Text>
          <Text style={st.meta}>
            {[centre.city,
              (centre.open_time || centre.close_time) ? `${centre.open_time || '—'} – ${centre.close_time || '—'}` : null,
              `${scans.length} scan${scans.length === 1 ? '' : 's'}`,
            ].filter(Boolean).join('  •  ')}
          </Text>
          {!!centre.address && <Text style={st.address}>{centre.address}</Text>}

          {!!callNumber && (
            <TouchableOpacity style={st.callBtn} onPress={() => Linking.openURL(`tel:${callNumber}`)}>
              <Ionicons name="call-outline" size={16} color={Colors.white} />
              <Text style={st.callText}>Call {callNumber}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={st.sectionTitle}>Scans &amp; Prices</Text>

        {scans.length === 0 && (
          <Text style={st.emptySub}>
            This centre hasn&apos;t listed its scans yet.
            {callNumber ? ` Call ${callNumber} to ask what they offer.` : ''}
          </Text>
        )}

        {scans.map(scan => {
          const open = openScan?.id === scan.id;
          const isFull = scan.fee_breakdown?.collection_mode === 'FULL';
          return (
            <View key={String(scan.id)} style={[st.item, open && st.itemOpen]}>
              <TouchableOpacity style={st.itemRow} onPress={() => pickScan(scan)} activeOpacity={0.8}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.itemName}>{scan.name}</Text>
                  <View style={st.itemTags}>
                    {!!scan.modality && <Text style={st.tag}>{scan.modality}</Text>}
                    <Text style={st.dur}>{scan.duration_minutes} min</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.price}>₹{scan.price}</Text>
                  <Text style={st.select}>{open ? 'Close' : 'Select'}</Text>
                </View>
              </TouchableOpacity>

              {open && (
                <View style={st.expand}>
                  {!!scan.description && <Text style={st.desc}>{scan.description}</Text>}

                  {/* Prep before slots: a patient who arrives unfasted has burned
                      the slot and the machine time. */}
                  {!!scan.prep_instructions && (
                    <View style={st.prep}>
                      <Text style={st.prepTitle}>⚠ Before you come</Text>
                      <Text style={st.prepBody}>{scan.prep_instructions}</Text>
                    </View>
                  )}

                  {scan.days?.length > 0 && (
                    <Text style={st.days}>Available days: {scan.days.join(', ')}</Text>
                  )}

                  {scan.slots?.length > 0 ? (
                    <>
                      <Text style={st.sub}>PICK A DATE</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                        {dates.map(d => {
                          const on = selectedDate === d.value;
                          return (
                            <TouchableOpacity
                              key={d.value}
                              style={[st.date, on && st.dateOn]}
                              onPress={() => { setSelectedDate(d.value); setSelectedSlot(''); }}
                            >
                              <Text style={[st.dateLbl, on && st.dateOnText]}>{d.label}</Text>
                              <Text style={[st.dateNum, on && st.dateOnText]}>{d.num}</Text>
                              <Text style={[st.dateMon, on && st.dateOnText]}>{d.month}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      <Text style={st.sub}>PICK A TIME</Text>
                      <View style={[st.slots, availLoading && { opacity: 0.5 }]}>
                        {scan.slots.map(sl => {
                          const full = avail[sl]?.full;
                          const on   = selectedSlot === sl;
                          return (
                            <TouchableOpacity
                              key={sl}
                              disabled={full}
                              style={[st.slot, on && st.slotOn, full && st.slotFull]}
                              onPress={() => setSelectedSlot(sl)}
                            >
                              <Text style={[st.slotText, on && st.slotOnText, full && st.slotFullText]}>{sl}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Both collection modes check out online now — a centre
                          picks per scan the way a doctor picks per doctor. Only
                          the note under the button differs, and it has to be
                          right: it is what the patient reads before deciding
                          how much cash to carry. */}
                      <TouchableOpacity
                        style={[st.bookBtn, (!selectedSlot || !scan.available) && st.bookDisabled]}
                        disabled={!selectedSlot || !scan.available}
                        onPress={() => book(scan)}
                      >
                        <Text style={st.bookText}>
                          {!scan.available ? 'Currently unavailable'
                            : !selectedSlot ? 'Select a time slot'
                            : `Book ${scan.name} →`}
                        </Text>
                      </TouchableOpacity>
                      <Text style={st.note}>
                        {isFull
                          ? `Scan price + service fee payable now — nothing to pay at the centre`
                          : `Pay ₹${scan.price} at the centre — only the service fee is paid online`}
                      </Text>
                    </>
                  ) : (
                    <Text style={st.note}>
                      No online slots for this scan.
                      {callNumber ? ` Call ${callNumber} to arrange a visit.` : ''}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.gray50 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray800 },
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

  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray200 },
  kindPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: Colors.blue50, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999,
  },
  kindText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, color: Colors.blue700 },
  name:    { fontSize: 21, fontWeight: '800', color: Colors.gray900, marginTop: 9 },
  meta:    { fontSize: 13, color: Colors.gray500, marginTop: 4 },
  address: { fontSize: 12.5, color: Colors.gray400, marginTop: 6 },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 13, paddingVertical: 11, borderRadius: 11, backgroundColor: Colors.blue600,
  },
  callText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900, marginTop: 22, marginBottom: 10 },

  item:     { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.gray200, marginBottom: 10, overflow: 'hidden' },
  itemOpen: { borderColor: Colors.blue400 },
  itemRow:  { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  itemName: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  itemTags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  tag: {
    fontSize: 10.5, fontWeight: '800', color: Colors.blue700, backgroundColor: Colors.blue50,
    paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden',
  },
  dur:    { fontSize: 12, color: Colors.gray400 },
  price:  { fontSize: 17, fontWeight: '800', color: Colors.gray900 },
  select: { fontSize: 12, fontWeight: '700', color: Colors.blue600, marginTop: 2 },

  expand: { paddingHorizontal: 14, paddingBottom: 15, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  desc:   { fontSize: 13.5, color: Colors.gray500, marginTop: 11, lineHeight: 19 },
  prep:   { marginTop: 11, padding: 11, borderRadius: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  prepTitle: { fontSize: 12.5, fontWeight: '800', color: '#92400E' },
  prepBody:  { fontSize: 13, color: '#78350F', marginTop: 3, lineHeight: 18 },
  days:   { fontSize: 12.5, color: Colors.gray500, marginTop: 11 },
  sub:    { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.5, color: Colors.gray400, marginTop: 15, marginBottom: 7 },

  date:   { width: 58, paddingVertical: 8, marginRight: 8, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.gray200 },
  dateOn: { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  dateOnText: { color: Colors.white },
  dateLbl: { fontSize: 10.5, color: Colors.gray500 },
  dateNum: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  dateMon: { fontSize: 10, color: Colors.gray500 },

  slots:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot:     { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 9, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.gray200 },
  slotOn:   { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  slotFull: { opacity: 0.45 },
  slotText:     { fontSize: 13, fontWeight: '600', color: Colors.gray800 },
  slotOnText:   { color: Colors.white },
  slotFullText: { textDecorationLine: 'line-through' },

  bookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.blue600,
  },
  bookDisabled: { backgroundColor: Colors.gray200 },
  bookText: { fontSize: 15, fontWeight: '800', color: Colors.white },
  note:     { fontSize: 12, color: Colors.gray400, textAlign: 'center', marginTop: 8, lineHeight: 17 },
});
