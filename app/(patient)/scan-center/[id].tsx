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
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../../../constants/colors';
import { useAndroidBack } from '../../../hooks/useAndroidBack';
import ProviderAboutPanel from '../../../components/ProviderAboutPanel';
import API from '../../../services/api';
import { useI18n } from '../../../services/i18n';
import { directionsUrl } from '../../../utils/booking';
import { matchesTest, SEARCH_ABOVE } from '../../../utils/matchTest';
import { asList, BLOOD_CENTER, SCAN_PAGE } from '../../../utils/scanCenters';
import { safeBack } from '../../../utils/navigation';

interface Scan {
  id: number | string;
  name: string;
  modality?: string;
  keywords?: string;
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
  // ?scan=ID is the browse tab's test result: open that test on arrival.
  const { id, scan: scanParam } = useLocalSearchParams<{ id?: string; scan?: string }>();
  const { t } = useI18n();
  useAndroidBack(() => safeBack(router, '/(patient)/doctors'));

  const [centre,  setCentre]  = useState<any>(null);
  const [scans,   setScans]   = useState<Scan[]>([]);
  const [shown,   setShown]   = useState(SCAN_PAGE);
  const [query,   setQuery]   = useState('');
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);
  // A 404 is the server saying this centre is not public (pending, rejected
  // or [TEST], ROADMAP 33), not a network failure — a different message.
  const [notFound, setNotFound] = useState(false);

  const [openScan,     setOpenScan]     = useState<Scan | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [avail,        setAvail]        = useState<Record<string, any>>({});
  const [availLoading, setAvailLoading] = useState(false);

  const linked = useRef('');

  const dates = next7Days();

  // This one screen serves both centre kinds — the flow is identical (pick the
  // service, then the slot), only the noun differs. Derived from the fetched
  // centre, so a blood centre reached by any route says "Tests", never "Scans".
  // Walk-in: no slot times published for this service, so there is nothing to
  // book online. Same rule the doctor screen uses — a doctor is one service, a
  // centre is a menu, so it applies per service.
  const isWalkIn = (scan: any) => !(scan.slots?.length > 0);

  // Scan.image has existed on the model since centres shipped and was never
  // rendered anywhere. Decorative — the name beside it carries the meaning.
  const scanImg = (scan: any): string | null => {
    const u = scan.image || scan.image_url;
    return u && String(u).startsWith('http') && !String(u).includes('placehold') ? u : null;
  };

  // Word order differs enough between English, Hindi, Telugu and Kannada that
  // substituting a noun into a shared sentence does not survive translation —
  // so each sentence carries its own blood/scan key. This flag picks between
  // the pair.
  const isBlood  = centre?.kind === BLOOD_CENTER;
  const nounIcon: 'water-outline' | 'pulse-outline' = isBlood ? 'water-outline' : 'pulse-outline';
  /** t() for a key that comes in a blood/scan pair. */
  const tn = (stem: string, vars?: Record<string, string | number>) =>
    t(`${stem}_${isBlood ? 'blood' : 'scan'}`, vars);
  // Offer the map button only when there is a REAL destination: geocoded
  // coordinates, or a maps URL the centre saved itself. directionsUrl() would
  // happily fall back to a name+city search, but a button promising "View on
  // Map" that lands a patient at a similarly-named clinic across Hindupur is
  // worse than no button. Same guard the website's centre page applies.
  const hasMap = (typeof centre?.latitude === 'number' && typeof centre?.longitude === 'number')
    || /^https?:\/\//i.test((centre?.location || '').trim());

  const kindIcon: 'water' | 'pulse' = isBlood ? 'water' : 'pulse';

  // Reset on centre change. This screen is a single Tabs.Screen instance, so
  // without this the previous centre's scans flash before the new ones land.
  useEffect(() => {
    setCentre(null); setScans([]); setShown(SCAN_PAGE); setQuery(''); setOpenScan(null);
    linked.current = '';
    setSelectedDate(''); setSelectedSlot(''); setAvail({});
    setFailed(false); setNotFound(false); setLoading(true);
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
      .catch((err) => {
        if (cancelled) return;
        setNotFound(err?.response?.status === 404);
        setFailed(true);
      })
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

  useEffect(() => {
    if (selectedDate && !dates.some(d => d.value === selectedDate)) {
      setSelectedDate('');
      setSelectedSlot('');
    }
  // dates is rebuilt every render; dates[0].value is the primitive that moves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates[0].value, selectedDate]);

  const pickScan = useCallback((scan: Scan) => {
    const same = openScan?.id === scan.id;
    setOpenScan(same ? null : scan);
    setSelectedSlot('');
    setSelectedDate(same ? '' : next7Days()[0].value);
    if (!same) API.post(`/scans/${scan.id}/view/`).catch(() => {});
  }, [openScan]);

  // A different test linked at the same centre starts from a clean menu: an old
  // query would hide the test the link just opened.
  useEffect(() => { setQuery(''); setShown(SCAN_PAGE); }, [scanParam]);

  // Open the test a browse result pointed at, once per centre+test. A ref, not
  // state: the patient may close it again and it must stay closed.
  useEffect(() => {
    const key = `${id}/${scanParam}`;
    if (!scanParam || linked.current === key) return;
    const sc = scans.find(x => String(x.id) === String(scanParam));
    if (!sc) return;
    linked.current = key;
    pickScan(sc);
  }, [scans, scanParam, id, pickScan]);

  // The words typed in the search box narrow the menu. With none typed, a test
  // the patient arrived for goes first, so it is not buried under 30 others.
  const matched = scans.filter(sc => matchesTest(sc, query));
  const listed = !query && scanParam
    ? [...matched].sort((a, b) => Number(String(b.id) === scanParam) - Number(String(a.id) === scanParam))
    : matched;

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
          <Ionicons name={notFound ? 'information-circle-outline' : 'cloud-offline-outline'}
            size={44} color={Colors.gray400} />
          <Text style={st.emptyTitle}>{t(notFound ? 'sc_not_available' : 'sc_cant_load')}</Text>
          <TouchableOpacity style={st.retry} onPress={() => safeBack(router, '/(patient)/doctors')}>
            <Text style={st.retryText}>{t('sc_go_back')}</Text>
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

      {/* "handled": the search box is in here, and the first tap after typing must open
          the test rather than only dismiss the keyboard. */}
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Banner. Mirrors the doctor screen: a centre is chosen largely on
            whether it looks like somewhere you would walk into, and
            Hospital.image was already being uploaded and never displayed. */}
        <View style={st.banner}>
          {centre.image?.startsWith('http') && !centre.image.includes('placehold') ? (
            <Image
              source={{ uri: centre.image }}
              style={st.bannerImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={180}
            />
          ) : (
            <Ionicons name={kindIcon} size={54} color={Colors.blue200} />
          )}
          <View style={st.bannerOverlay} />
        </View>

        <View style={{ padding: 16 }}>
        <View style={st.card}>
          <View style={st.kindPill}>
            <Ionicons name={kindIcon} size={12} color={Colors.blue700} />
            <Text style={st.kindText}>{tn('sc_kind')}</Text>
          </View>
          <Text style={st.name}>{centre.name}</Text>
          <Text style={st.meta}>
            {[centre.city,
              (centre.open_time || centre.close_time) ? `${centre.open_time || '—'} – ${centre.close_time || '—'}` : null,
              t(isBlood ? 'tests_count' : 'scans_count', { count: scans.length }),
            ].filter(Boolean).join('  •  ')}
          </Text>
          {!!centre.address && <Text style={st.address}>{centre.address}</Text>}

          {(!!callNumber || hasMap) && (
            <View style={st.actionRow}>
              {!!callNumber && (
                <TouchableOpacity
                  style={st.callBtn}
                  onPress={() => Linking.openURL(`tel:${callNumber}`)}
                >
                  <Ionicons name="call-outline" size={16} color={Colors.white} />
                  <Text style={st.callText}>Call {callNumber}</Text>
                </TouchableOpacity>
              )}
              {hasMap && (
                <TouchableOpacity
                  style={st.mapBtn}
                  onPress={() => Linking.openURL(directionsUrl(centre))}
                  accessibilityRole="button"
                  accessibilityLabel={t('sc_open_in_maps', { name: centre.name })}
                >
                  <Ionicons name="location-outline" size={16} color={Colors.blue700} />
                  <Text style={st.mapText}>{t('view_on_map')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Photos, hours, blurb and socials — the same panel the doctor screen
            shows, from the same data: a centre IS a Hospital row and this
            screen already fetches /hospitals/<id>/. It was all being returned
            and thrown away. */}
        <ProviderAboutPanel
          info={centre}
          title={tn('sc_about')}
          fallbackIcon={nounIcon}
        />

        <Text style={st.sectionTitle}>{tn('sc_prices')}</Text>

        {scans.length === 0 && (
          <Text style={st.emptySub}>
            {tn('sc_none_listed')}
            {callNumber ? t('sc_call_to_ask', { phone: callNumber }) : ''}
          </Text>
        )}

        {scans.length > SEARCH_ABOVE && (
          <TextInput
            style={st.search}
            value={query}
            onChangeText={v => { setQuery(v); setShown(SCAN_PAGE); }}
            placeholder={tn('sc_search')}
            placeholderTextColor={Colors.gray400}
            accessibilityLabel={tn('sc_search')}
            autoCorrect={false}
            returnKeyType="search"
          />
        )}
        {scans.length > 0 && listed.length === 0 && (
          <Text style={st.emptySub}>{tn('sc_no_match')}</Text>
        )}

        {listed.slice(0, shown).map(scan => {
          const open = openScan?.id === scan.id;
          const isFull = scan.fee_breakdown?.collection_mode === 'FULL';
          return (
            <View key={String(scan.id)} style={[st.item, open && st.itemOpen]}>
              <TouchableOpacity style={st.itemRow} onPress={() => pickScan(scan)} activeOpacity={0.8}>
                {scanImg(scan) && (
                  <Image
                    source={{ uri: scanImg(scan)! }}
                    style={st.itemImg}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={180}
                  />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.itemName}>{scan.name}</Text>
                  <View style={st.itemTags}>
                    {!!scan.modality && <Text style={st.tag}>{scan.modality}</Text>}
                    {isWalkIn(scan) && <Text style={[st.tag, st.tagWalkIn]}>{t('walk_in')}</Text>}
                    <Text style={st.dur}>{t('sc_minutes', { n: scan.duration_minutes })}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.price}>₹{scan.price}</Text>
                  <Text style={st.select}>
                    {t(open ? 'sc_close' : isWalkIn(scan) ? 'sc_details' : 'sc_select')}
                  </Text>
                </View>
              </TouchableOpacity>

              {open && (
                <View style={st.expand}>
                  {!!scan.description && <Text style={st.desc}>{scan.description}</Text>}

                  {/* Prep before slots: a patient who arrives unfasted has burned
                      the slot and the machine time. */}
                  {!!scan.prep_instructions && (
                    <View style={st.prep}>
                      <Text style={st.prepTitle}>{t('sc_before_you_come')}</Text>
                      <Text style={st.prepBody}>{scan.prep_instructions}</Text>
                    </View>
                  )}

                  {scan.days?.length > 0 && (
                    <Text style={st.days}>{t('sc_available_days_inline', { days: scan.days.join(', ') })}</Text>
                  )}

                  {scan.slots?.length > 0 ? (
                    <>
                      <Text style={st.sub}>{t('pick_a_date')}</Text>
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

                      <Text style={st.sub}>{t('pick_a_time')}</Text>
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
                          {!scan.available ? t('sc_currently_unavailable')
                            : !selectedSlot ? t('sc_select_a_slot')
                            : t('sc_book_named', { name: scan.name })}
                        </Text>
                      </TouchableOpacity>
                      <Text style={st.note}>
                        {isFull
                          ? tn('sc_price_note')
                          : t('sc_pay_at_centre_note', { price: scan.price })}
                      </Text>
                    </>
                  ) : (
                    <View style={st.walkIn}>
                      <Text style={st.walkInLead}>
                        {tn('sc_walkin')} {t('sc_walkin_tail')}
                      </Text>
                      {(!!centre.open_time || !!centre.close_time) && (
                        <View style={st.walkInRow}>
                          <Text style={st.walkInKey}>{t('centre_hours')}</Text>
                          <Text style={st.walkInVal}>
                            {centre.open_time || '—'} – {centre.close_time || '—'}
                          </Text>
                        </View>
                      )}
                      {scan.days?.length > 0 && (
                        <View style={st.walkInRow}>
                          <Text style={st.walkInKey}>{t('available_days')}</Text>
                          <Text style={st.walkInVal}>{scan.days.join(', ')}</Text>
                        </View>
                      )}
                      {callNumber ? (
                        <TouchableOpacity
                          style={st.walkInCall}
                          onPress={() => Linking.openURL(`tel:${callNumber}`)}
                        >
                          <Ionicons name="call-outline" size={15} color={Colors.white} />
                          <Text style={st.walkInCallText}>{t('sc_call_number', { phone: callNumber })}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={st.walkInLead}>{t('contact_centre_direct')}</Text>
                      )}
                      <Text style={st.walkInNote}>
                        {tn('sc_pay_at_centre')}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {listed.length > shown && (
          <TouchableOpacity
            style={st.more}
            onPress={() => setShown(n => n + SCAN_PAGE)}
            accessibilityRole="button"
          >
            <Text style={st.retryText}>{t('sc_show_more', { n: listed.length - shown })}</Text>
          </TouchableOpacity>
        )}
        </View>
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
  more:       { alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.blue50, marginTop: 4 },
  search:     { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5, color: Colors.gray900, marginBottom: 12 },

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
  // Wrap, and let whatever lands on a line fill it.
  //
  // Two earlier tries were both wrong. flex:1 split the row into fixed halves
  // and truncated a landline to "Call 08556-234…" — a phone number the patient
  // cannot read is worse than no number. Pure content sizing (the website's
  // rule) never truncates, but "Call 08556-234567" + "View on Map" needs ~339pt
  // in a 311pt card, so it wrapped into two ragged pills of different widths
  // that read as a mistake.
  //
  // flexGrow makes the wrap deliberate: side by side when both fit, otherwise
  // one full-width button per line. minWidth is the wrap trigger — it is what
  // decides "these two cannot share a line" before any text gets squeezed.
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  callBtn: {
    flexGrow: 1, minWidth: 150,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 11,
    backgroundColor: Colors.blue600,
  },
  callText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  // Outline beside the solid Call, the same secondary weighting the website
  // gives it and the same treatment the doctor screen's Directions button uses.
  mapBtn: {
    flexGrow: 1, minWidth: 150,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 11,
    backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200,
  },
  mapText: { fontSize: 14, fontWeight: '700', color: Colors.blue700 },

  itemImg:       { width: 44, height: 44, borderRadius: 10, marginRight: 12, borderWidth: 1, borderColor: Colors.blue100 },
  banner:        { height: 170, position: 'relative', overflow: 'hidden', backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  bannerImage:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  bannerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,44,83,0.2)' },
  tagWalkIn:   { backgroundColor: Colors.warningBg, color: Colors.warningText, borderColor: Colors.warningBorder },
  walkIn:      { marginTop: 14 },
  walkInLead:  { fontSize: 13, color: Colors.gray700, lineHeight: 19, marginBottom: 10 },
  walkInRow:   { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  walkInKey:   { fontSize: 12.5, color: Colors.gray500 },
  walkInVal:   { fontSize: 12.5, color: Colors.gray900, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  walkInCall:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, backgroundColor: Colors.blue600, borderRadius: 12, paddingVertical: 11 },
  walkInCallText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  walkInNote:  { fontSize: 11.5, color: Colors.gray400, marginTop: 10, textAlign: 'center' },
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
