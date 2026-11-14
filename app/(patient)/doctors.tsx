import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { isTestHospital } from '../../constants/config';
import { suggestKeywords } from '../../constants/searchKeywords';
import API from '../../services/api';
import { providerLabel } from '../../utils/booking';
import { matchesTest } from '../../utils/matchTest';
import { asList, BLOOD_CENTER, filterByKind, SCAN_CENTER } from '../../utils/scanCenters';
import PhotoViewer from '../../components/PhotoViewer';
import { SkeletonList } from '../../components/Skeleton';
import { useI18n } from '../../services/i18n';
import { localName } from '../../utils/localize';

// Last successful doctor list, cached so the screen paints instantly on reopen.
const DOCTORS_CACHE_KEY = 'doctors_cache_v1';

// Maps a home specialty chip (and any typed word) to substrings that may appear
// in the free-text `specialization` hospitals enter, so e.g. the "Skin" chip
// finds a doctor stored as "Dermatologist". Words with no entry match as-is.
// Keep in sync with the web app (src/componets/AllDoctor.js).
const SPEC_SYNONYMS: Record<string, string[]> = {
  general:  ['general', 'physician', 'family', 'medicine'],
  heart:    ['heart', 'cardio'],
  skin:     ['skin', 'dermat'],
  dental:   ['dental', 'dentist', 'tooth', 'teeth', 'oral'],
  child:    ['child', 'pediatric', 'paediatric', 'paed', 'neonat'],
  bones:    ['bone', 'ortho', 'joint'],
  eye:      ['eye', 'ophthal', 'optom', 'vision'],
  ent:      ['ent', 'ear', 'nose', 'throat', 'otolar'],
  women:    ['gyn', 'obstet', 'women', 'maternity'],
  neuro:    ['neuro', 'nuro'],
  mental:   ['psych', 'mental'],
  diabetes: ['diabet', 'endocrin'],
  kidney:   ['nephro', 'kidney', 'renal'],
  stomach:  ['gastro', 'stomach', 'digest', 'liver', 'hepat'],
  lungs:    ['pulmon', 'lung', 'chest', 'respir'],
  physio:   ['physio', 'rehab', 'physical'],
};

// ── TYPE ──────────────────────────────────────────────────────────────────────
interface Doctor {
  id: number;
  name: string;
  specialization: string;
  keywords: string;
  experience: number;
  mobile: string;
  available: boolean;
  fee: number;
  slots: string[];
  view_count?: number;
  booking_count?: number;
  max_per_slot: number;
  image: string | null;
  hospital_image: string | null;
  hospital: number;
  hospital_name: string;
  city: string;
}

// A doctor image is usable only if it's a real remote URL (not a placeholder).
const hasDoctorImage = (image: string | null): boolean =>
  !!image && !image.includes('placehold') && image.startsWith('http');

// ── DOCTOR CARD ───────────────────────────────────────────────────────────────
// Lifted out of the screen and memoised. It used to be an inline closure inside
// `renderItem`, so every keystroke in the search box rebuilt the function and
// re-rendered every visible row. Now a row only re-renders when its own props
// change — the list stays smooth while typing.
const DoctorCard = memo(function DoctorCard({ doc, index, city, t, router }: {
  doc:    Doctor;
  index:  number;
  city:   string;
  t:      (key: string, vars?: Record<string, string | number>) => string;
  router: ReturnType<typeof useRouter>;
}) {
    // Tap the photo to see it full-screen; the rest of the card still opens the doctor.
    const [photoOpen, setPhotoOpen] = useState(false);
    const isTopRanked = index === 0 && doc.available;
    const isNearby    = city && (doc.city || '').toLowerCase() === city.toLowerCase();

    return (
      <TouchableOpacity
        style={[styles.docCard, isTopRanked && styles.docCardTop]}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/(patient)/doctor/[id]', params: { id: doc.id } })}
      >
        {/* Top colour strip */}
        <View style={[styles.cardStrip, isTopRanked && styles.cardStripTop]} />

        {/* Top Ranked Badge */}
        {isTopRanked && (
          <View style={styles.topBadge}>
            <Text style={styles.topBadgeText}>{t('top_match')}</Text>
          </View>
        )}

        <View style={styles.cardBody}>

          {/* ── AVATAR ── */}
          {hasDoctorImage(doc.image) ? (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setPhotoOpen(true)}
              accessibilityRole="imagebutton" accessibilityLabel={providerLabel(doc.name)}>
              <Image
                source={{ uri: doc.image! }}
                style={styles.docAvatarImg}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={180}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.docAvatarFallback}>
              <Ionicons name="medkit-outline" size={28} color={Colors.blue400} />
            </View>
          )}

          {/* ── CENTER INFO ── */}
          <View style={{ flex: 1 }}>
            <Text style={styles.docSpec}>{localName(doc.specialization)}</Text>
            <Text style={styles.docName}>{providerLabel(doc.name)}</Text>
            <View style={styles.docHospitalRow}>
              <Ionicons name="business-outline" size={12} color={Colors.gray500} />
              <Text style={styles.docHospital} numberOfLines={1}>{localName(doc.hospital_name)}</Text>
            </View>
            <View style={styles.docMeta}>
              <View style={styles.metaChipRow}>
                <Ionicons name="location-outline" size={12} color={isNearby ? Colors.blue600 : Colors.gray400} />
                <Text style={[styles.metaChip, isNearby && { color: Colors.blue600, fontWeight: '700' }]}>
                  {isNearby ? `Nearby · ${localName(doc.city)}` : localName(doc.city)}
                </Text>
              </View>
              <View style={styles.metaChipRow}>
                <Ionicons name="time-outline" size={12} color={Colors.gray400} />
                <Text style={styles.metaChip}>{t('yrs_exp', { years: doc.experience })}</Text>
              </View>
            </View>
            {doc.slots && doc.slots.length > 0 && (
              <View style={styles.slotRow}>
                {doc.slots.slice(0, 2).map((s: string) => (
                  <View key={s} style={styles.slotChip}>
                    <Text style={styles.slotText}>{s}</Text>
                  </View>
                ))}
                {doc.slots.length > 2 && (
                  <Text style={styles.slotMore}>+{doc.slots.length - 2}</Text>
                )}
              </View>
            )}
          </View>

          {/* ── RIGHT: STATUS + FEE ── */}
          <View style={styles.cardRight}>
            <View style={[
              styles.availBadge,
              { backgroundColor: doc.available ? Colors.successBg : Colors.errorBg }
            ]}>
              <View style={{
                width: 5, height: 5, borderRadius: 3,
                backgroundColor: doc.available ? Colors.successText : Colors.errorText,
                marginRight: 4,
              }} />
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: doc.available ? Colors.successText : Colors.errorText,
              }}>
                {doc.available ? t('available') : t('busy')}
              </Text>
            </View>
            <Text style={styles.feeText}>₹{doc.fee ?? 0}</Text>
            <Text style={styles.feeSub}>{t('dc_per_visit')}</Text>
          </View>
        </View>

        {/* ── FOOTER ── */}
        <View style={styles.cardFooter}>
          <Text style={styles.slotsCount}>
            {doc.slots?.length
              ? t('slots_today', { count: doc.slots.length })
              : t('walk_in_contact')}
          </Text>
          <View style={[styles.bookBtn, !doc.available && styles.bookBtnDisabled]}>
            <Text style={styles.bookBtnText}>
              {doc.available ? t('book_now') : t('unavailable')}
            </Text>
          </View>
        </View>

        {photoOpen && hasDoctorImage(doc.image) && (
          <PhotoViewer photos={[{ id: doc.id, url: doc.image! }]} startAt={0} onClose={() => setPhotoOpen(false)} />
        )}
      </TouchableOpacity>
    );
});

export default function DoctorsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  // A specialty chip on the home screen deep-links here with ?q=<term>.
  const params = useLocalSearchParams<{ q?: string; kind?: string; ts?: string }>();
  // 'doctors' | a centre kind. The centre path sits BESIDE the doctor path
  // rather than generalising it: the doctor list is the live, revenue-carrying
  // screen. Scanning and blood centres DO share the path — same request, same
  // card, same detail screen — because the only difference is the label and
  // which kind the backend filters on.
  const [mode, setMode] = useState<'doctors' | typeof SCAN_CENTER | typeof BLOOD_CENTER>('doctors');
  // Cached per kind, so switching tabs twice does not refetch, and so the two
  // lists can never be shown under each other's heading.
  const [centresByKind, setCentresByKind] = useState<Record<string, any[]>>({});
  const [scans,           setScans]         = useState<any[]>([]);
  const [centresLoading,  setCentresLoading] = useState(false);

  const isCentreMode = mode !== 'doctors';
  const centres      = useMemo(() => centresByKind[mode] || [], [centresByKind, mode]);

  const [doctors,         setDoctors]         = useState<Doctor[]>([]);
  const [search,          setSearch]          = useState(typeof params.q === 'string' ? params.q : '');
  const [searchFocused,   setSearchFocused]   = useState(false);
  const [availOnly,       setAvailOnly]       = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(false);
  const [city,            setCity]            = useState('');
  const [locationLoading, setLocationLoading] = useState(false);

  // Normalize a raw API/cache payload into the doctor list + spec filters.
  const applyData = useCallback((data: any): Doctor[] => {
    const raw: Doctor[] = Array.isArray(data) ? data : (data?.results || []);
    // Hide test/demo hospitals from the patient app.
    const list = raw.filter((d: Doctor) => !isTestHospital(d.hospital_name));
    setDoctors(list);
    return list;
  }, []);

  // Centres, fetched lazily — a patient who never switches never pays for
  // these two requests.
  //
  // filterByKind() is load-bearing, not belt-and-braces: this build can reach a
  // backend that has not deployed centres, and an older /api/hospitals/ IGNORES
  // the unknown ?kind= param and returns every hospital. Without the
  // client-side check those would render here as centres. It also keeps a
  // backend that knows SCAN_CENTER but not BLOOD_CENTER from showing scanning
  // centres under the Blood tab. See utils/scanCenters.ts.
  const loadCentres = useCallback(async (kind: string) => {
    setCentresLoading(true);
    try {
      const [hRes, sRes] = await Promise.all([
        API.get('/hospitals/', { params: { kind } }),
        API.get('/scans/').catch(() => ({ data: [] })),   // 404 on an old backend
      ]);
      setCentresByKind(prev => ({ ...prev, [kind]: filterByKind(asList(hRes.data), kind) }));
      setScans(asList(sRes.data));
    } catch {
      setCentresByKind(prev => ({ ...prev, [kind]: [] }));
      setScans([]);
    } finally {
      setCentresLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCentreMode && !centresByKind[mode]) loadCentres(mode);
  }, [mode, isCentreMode, centresByKind, loadCentres]);

  const scansByCentre = useMemo(() => scans.reduce((acc: Record<string, any[]>, sc: any) => {
    (acc[sc.center] = acc[sc.center] || []).push(sc);
    return acc;
  }, {}), [scans]);

  const filteredCentres = useMemo(() => centres
    .map(c => ({ ...c, scans: scansByCentre[c.id] || [] }))
    .filter(c => {
      const hay = [c.name, c.city, c.address,
                   ...c.scans.map((sc: any) => [sc.name, sc.modality, sc.keywords].filter(Boolean).join(' '))]
        .filter(Boolean).join(' ').toLowerCase();
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      const matchSearch = words.every(w => hay.includes(w));
      const matchCity   = !city || (c.city || '').toLowerCase().includes(city.toLowerCase());
      return matchSearch && matchCity;
    })
    // A centre with nothing listed opens onto an empty menu — ranked last
    // rather than hidden, so it still appears in a search by name.
    .sort((a, b) => (b.scans.length > 0 ? 1 : 0) - (a.scans.length > 0 ? 1 : 0)
                 || b.scans.length - a.scans.length),
    [centres, scansByCentre, search, city]);

  // Test-first results: someone typing "brain" is shopping for a test, so the
  // matching tests (cheapest first) sit above the centre cards. Taken from
  // filteredCentres, so the city filter applies. A row matches on the test's OWN
  // name, type and synonyms: a place name alone gives centre cards only. The
  // website's AllDoctor.js does the same, ten rows.
  const TEST_ROWS = 10;
  const testHits = useMemo(() => (isCentreMode && search.trim()
    ? filteredCentres
        .flatMap(c => c.scans.filter((sc: any) => matchesTest(sc, search)).map((sc: any) => ({ sc, c })))
        .sort((a, b) => Number(a.sc.price) - Number(b.sc.price) || String(a.sc.name).localeCompare(String(b.sc.name)))
    : []), [isCentreMode, search, filteredCentres]);

  const loadDoctors = useCallback(async () => {
    setError(false);

    // 1. Paint the last-known list instantly so an impatient patient sees
    //    doctors immediately instead of a spinner (or a connection error) while
    //    the network round-trip is still in flight.
    let hasCache = false;
    try {
      const cached = await AsyncStorage.getItem(DOCTORS_CACHE_KEY);
      if (cached) {
        applyData(JSON.parse(cached));
        hasCache = true;
        setLoading(false);
      }
    } catch { /* ignore cache read errors */ }
    if (!hasCache) setLoading(true);

    // 2. Fetch fresh in the background, retrying a couple of times so a single
    //    transient hiccup (slow cold-start, brief network drop) self-heals
    //    instead of flipping the whole screen to the error state.
    try {
      let data: any;
      for (let attempt = 0; ; attempt++) {
        try {
          ({ data } = await API.get('/doctors/'));
          break;
        } catch (e) {
          if (attempt >= 2) throw e;
          await new Promise(res => setTimeout(res, 700 * (attempt + 1)));
        }
      }
      applyData(data);
      AsyncStorage.setItem(DOCTORS_CACHE_KEY, JSON.stringify(data)).catch(() => {});
    } catch {
      // Only surface the error screen when we have nothing to show. If a cached
      // list is already on screen, keep it rather than blanking to an error.
      if (!hasCache) {
        setDoctors([]);
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [applyData]);

  useEffect(() => { loadDoctors(); }, [loadDoctors]);

  // Doctors is a persistent tab, so re-apply the ?q= term each time a home
  // specialty chip deep-links here (the initial useState only runs once).
  useEffect(() => {
    if (params.ts || params.q) setSearch(typeof params.q === 'string' ? params.q : '');
  }, [params.q, params.ts]);

  // Home's city question (components/CityIntentModal.tsx) also picks the tab.
  // `ts` is new on every pick, so answering the same way twice switches back
  // even if the patient moved to another tab in between. Any other `kind` is
  // ignored and the tab stays where it was.
  useEffect(() => {
    if (params.kind === 'doctors' || params.kind === SCAN_CENTER || params.kind === BLOOD_CENTER) {
      setMode(params.kind);
    }
  }, [params.kind, params.ts]);

  // ── LOCATION DETECTION ────────────────────────────────────────────────────
  const detectLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permission_denied'), t('allow_location'));
        return;
      }
      const coords = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude:  coords.coords.latitude,
        longitude: coords.coords.longitude,
      });
      const detectedCity = place.city || place.subregion || place.region || '';
      // Only rank by the detected city — do NOT write it into `search`. That
      // filters the list down to that city, so a patient anywhere we have no
      // doctors sees an empty list with no explanation.
      setCity(detectedCity);
    } catch {
      Alert.alert(t('error'), t('location_failed'));
    } finally {
      setLocationLoading(false);
    }
  };

  const clearLocation = () => {
    setCity('');
    setSearch('');
  };

  // ── SMART RANKING ─────────────────────────────────────────────────────────
  // Bounded and log-scaled ON PURPOSE. Sorting by raw clicks makes the top
  // spot self-reinforcing — whoever is first gets clicked because they are
  // first, and no new doctor can ever climb. log10 means the 10th view moves a
  // doctor as much as the next ninety do, and the cap keeps the boost below the
  // availability weight, so a popular doctor who is unavailable today never
  // outranks one who can actually see you.
  // Taps count early (max 30), completed bookings count more as they grow
  // (max 40). Experience and slots are capped so a newly added doctor with a
  // long slot list can't outrank one patients have opened. Mirrors the web's
  // services/doctorRank.js — change one, change the other.
  const popularityBoost = (views?: number, bookings?: number): number =>
    Math.min(30, Math.round(12 * Math.log10(1 + (views || 0)))) +
    Math.min(40, Math.round(15 * Math.log10(1 + (bookings || 0))));

  const rankDoctor = (doc: Doctor): number => {
    let score = 0;
    if (doc.available) score += 100;
    if (city && (doc.city || '').toLowerCase() === city.toLowerCase()) score += 50;
    score += Math.min(doc.experience || 0, 10);
    score += Math.min(doc.slots?.length || 0, 5) * 2;
    score += popularityBoost(doc.view_count, doc.booking_count);
    return score;
  };

  // ── FILTER + SORT ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => doctors
    .filter((doc: Doctor) => {
      const q = search.trim().toLowerCase();
      // Expand common terms (skin→dermat, heart→cardio, …) so specialty chips
      // reach doctors named with clinical terms; unknown words match as-is.
      const terms = SPEC_SYNONYMS[q] || [q];
      const haystack = [doc.name, doc.specialization, doc.keywords, doc.hospital_name, doc.city]
        .filter(Boolean).join(' ').toLowerCase();
      const matchSearch = !search || terms.some((term) => haystack.includes(term));
      const matchAvail = !availOnly || doc.available;
      return matchSearch && matchAvail;
    })
    .sort((a: Doctor, b: Doctor) => rankDoctor(b) - rankDoctor(a)),
    // rankDoctor only reads `city`; listing it keeps the sort honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doctors, search, availOnly, city]);

  // ── KEYWORD CHIPS ─────────────────────────────────────────────────────────
  // Tappable quick-search terms pulled from the real data: each doctor's
  // comma-separated `keywords` plus their specialization. Deduped
  // case-insensitively and capped so the strip stays short and scrollable.
  const keywordChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: string[] = [];
    for (const doc of doctors) {
      const terms = [
        ...(doc.keywords || '').split(','),
        doc.specialization || '',
      ];
      for (const raw of terms) {
        const term = raw.trim();
        const key = term.toLowerCase();
        if (term && !seen.has(key)) {
          seen.add(key);
          chips.push(term);
        }
      }
    }
    return chips.slice(0, 20);
  }, [doctors]);

  // ── SEARCH TYPEAHEAD ──────────────────────────────────────────────────────
  // Google-style completions under the search box. Candidates from the live
  // data (doctor names, specializations, keywords, hospitals, cities) rank
  // ahead of the generic term list, so a tapped suggestion always has results.
  const searchSuggestions = useMemo(() => {
    if (!searchFocused) return [];
    const fromData: string[] = [];
    for (const doc of doctors) {
      fromData.push(
        doc.name,
        doc.specialization,
        doc.hospital_name,
        doc.city,
        ...(doc.keywords || '').split(','),
      );
    }
    return suggestKeywords(search, fromData.filter(Boolean), 4);
  }, [searchFocused, doctors, search]);

  const renderDoctor = useCallback(
    ({ item: doc, index }: { item: Doctor; index: number }) => (
      <DoctorCard doc={doc} index={index} city={city} t={t} router={router} />
    ),
    [city, t, router],
  );

  const renderCentre = useCallback(
    ({ item: c }: { item: any }) => {
      const prices = c.scans.map((sc: any) => sc.price || 0);
      const from   = prices.length ? Math.min(...prices) : null;
      const mods   = [...new Set(c.scans.map((sc: any) => sc.modality).filter(Boolean))].slice(0, 3);
      return (
        <TouchableOpacity
          style={styles.centreCard}
          activeOpacity={0.85}
          onPress={() => router.push(`/(patient)/scan-center/${c.id}` as never)}
        >
          <View style={styles.centreTop}>
            <View style={styles.centreIcon}>
              <Ionicons
                name={mode === BLOOD_CENTER ? 'water' : 'pulse'}
                size={20} color={Colors.blue600} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.centreName} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.centreMeta} numberOfLines={1}>
                {[c.city, mods.join(' · ')].filter(Boolean).join('  •  ')}
              </Text>
            </View>
          </View>

          {c.scans.length > 0 && (
            <View style={styles.centreChips}>
              {c.scans.slice(0, 3).map((sc: any) => (
                <Text key={sc.id} style={styles.centreChip} numberOfLines={1}>{sc.name}</Text>
              ))}
              {c.scans.length > 3 && (
                <Text style={styles.centreChipMore}>+{c.scans.length - 3}</Text>
              )}
            </View>
          )}

          <View style={styles.centreFooter}>
            <Text style={styles.centreCount}>
              {c.scans.length > 0
                ? t(mode === BLOOD_CENTER ? 'tests_count' : 'scans_count', { count: c.scans.length })
                : t('contact_the_centre')}
            </Text>
            {from != null && <Text style={styles.centreFrom}>{t('from_price', { price: from })}</Text>}
          </View>
        </TouchableOpacity>
      );
    },
    [mode, t, router],
  );

  const listHeader = (
    <>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {mode === BLOOD_CENTER ? t('title_blood')
           : mode === SCAN_CENTER ? t('title_scans')
           : t('find_doctors')}
        </Text>
        <Text style={styles.sub}>
          {isCentreMode
            ? (centresLoading
                ? t('loading_ellipsis')
                : t('centres_near_you', { count: centres.length }))
            : loading ? t('loading_ellipsis') : t('doctors_available', { count: doctors.length })}
        </Text>

        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color={Colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder={isCentreMode
              ? t(mode === BLOOD_CENTER ? 'search_tests_ph' : 'search_scans_ph')
              : t('search_placeholder')}
            placeholderTextColor={Colors.gray400}
            value={search}
            // Scrolling the list clears searchFocused, but the input often
            // keeps native focus — so onFocus never fires again and the
            // typeahead stays hidden however many times it's tapped. Press and
            // typing are the other two ways a patient says they want it back.
            onChangeText={v => { setSearch(v); setSearchFocused(true); }}
            onPressIn={() => setSearchFocused(true)}
            onFocus={() => setSearchFocused(true)}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => setSearchFocused(false)}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Typeahead — top searches when empty, completions once typing */}
        {searchSuggestions.length > 0 && (
          <View style={styles.suggestBox}>
            {!search.trim() && (
              <Text style={styles.suggestHeading}>{t('top_searches')}</Text>
            )}
            {searchSuggestions.map((s, i) => (
              <View key={s} style={[styles.suggestItem, i > 0 && styles.suggestItemBorder]}>
                <TouchableOpacity
                  style={styles.suggestItemMain}
                  onPress={() => { setSearch(s); setSearchFocused(false); }}
                >
                  <Ionicons
                    name={search.trim() ? 'search-outline' : 'trending-up-outline'}
                    size={14}
                    color={Colors.gray400}
                  />
                  <Text style={styles.suggestItemText} numberOfLines={1}>{s}</Text>
                </TouchableOpacity>
                {/* Google's ↖ — drops the term into the box to keep refining */}
                <TouchableOpacity onPress={() => setSearch(s)} hitSlop={10}>
                  <Ionicons name="arrow-up-outline" size={15} color={Colors.gray400} style={styles.suggestFill} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Keyword quick-search chips — hidden while the typeahead is open */}
        {!isCentreMode && searchSuggestions.length === 0 && keywordChips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.keywordScroll}
            contentContainerStyle={styles.keywordScrollContent}
          >
            {keywordChips.map(kw => {
              const active = search.trim().toLowerCase() === kw.toLowerCase();
              return (
                <TouchableOpacity
                  key={kw}
                  style={[styles.keywordChip, active && styles.keywordChipActive]}
                  onPress={() => setSearch(active ? '' : kw)}
                >
                  <Ionicons
                    name="search"
                    size={11}
                    color={active ? Colors.white : Colors.blue600}
                  />
                  <Text style={[styles.keywordChipText, active && styles.keywordChipTextActive]}>
                    {localName(kw)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Location Button */}
        <TouchableOpacity
          style={[styles.locationBtn, locationLoading && { opacity: 0.6 }]}
          onPress={city ? clearLocation : detectLocation}
          disabled={locationLoading}
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color={Colors.blue600} />
          ) : (
            <>
              <Ionicons name="location-outline" size={15} color={Colors.blue600} />
              <Text style={styles.locationBtnText}>
                {city ? t('near_city', { city }) : t('detect_location')}
              </Text>
            </>
          )}
          {city && !locationLoading ? (
            <Ionicons name="close" size={14} color={Colors.gray400} style={{ marginLeft: 4 }} />
          ) : null}
        </TouchableOpacity>

        {/* Available Only Toggle — doctors only. A centre's machines are not
            on leave, and filteredCentres never reads availOnly, so leaving this
            on a centre tab is a control that silently does nothing. */}
        {!isCentreMode && (
          <TouchableOpacity
            style={[styles.availToggle, availOnly && styles.availToggleActive]}
            onPress={() => setAvailOnly(p => !p)}
          >
            <View style={[styles.toggleDot, { backgroundColor: availOnly ? Colors.successText : Colors.gray400 }]} />
            <Text style={[styles.availToggleText, availOnly && { color: Colors.successText }]}>
              {t('available_only')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── DOCTORS ⇄ SCAN CENTRES ⇄ BLOOD CENTRES ── */}
      <View style={styles.modeRow}>
        {([
          { key: 'doctors',      icon: 'medkit-outline', labelKey: 'tab_doctors' },
          // "Scans", not "Scan Centres" — at three tabs the longer label no
          // longer fits 375pt and truncated to "Scan Centr…". Both of these
          // name what the patient WANTS, which is also how the rest of the
          // app words it ("3 scans", "Add scan").
          { key: SCAN_CENTER,    icon: 'pulse-outline',  labelKey: 'tab_scans' },
          { key: BLOOD_CENTER,   icon: 'water-outline',  labelKey: 'tab_blood' },
        ] as const).map(m => {
          const active = mode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => setMode(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={m.icon} size={14} color={active ? Colors.blue700 : Colors.gray500} />
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.modeText, active && styles.modeTextActive]}>
                {t(m.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── RESULTS COUNT + SORT LABEL ── */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {isCentreMode
            ? t('centres_count', { count: filteredCentres.length })
            : t('results_count', { count: filtered.length })}
          {mode === 'doctors' && (city ? ` · ${t('sorted_proximity')}` : ` · ${t('sorted_availability')}`)}
        </Text>
        {(search || availOnly || city) && (
          <TouchableOpacity onPress={() => {
            setSearch('');
            setAvailOnly(false);
            setCity('');
          }}>
            <Text style={{ fontSize: 13, color: Colors.blue600, fontWeight: '600' }}>{t('clear_all')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {testHits.length > 0 && (
        <View style={styles.hits}>
          <Text style={styles.hitsTitle}>
            {t(mode === BLOOD_CENTER ? 'tests_matching_blood' : 'tests_matching_scan')}
          </Text>
          {testHits.slice(0, TEST_ROWS).map(({ sc, c }) => (
            <TouchableOpacity
              key={String(sc.id)}
              style={styles.hit}
              activeOpacity={0.8}
              // ?scan= opens this test on the centre page, not at the top of a
              // long menu.
              onPress={() => router.push(`/(patient)/scan-center/${c.id}?scan=${sc.id}` as never)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.hitName} numberOfLines={1}>{localName(sc.name)}</Text>
                <Text style={styles.hitSub} numberOfLines={1}>{localName(c.name)}{c.city ? ` · ${localName(c.city)}` : ''}</Text>
              </View>
              <Text style={styles.hitPrice}>₹{sc.price}</Text>
            </TouchableOpacity>
          ))}
          {testHits.length > TEST_ROWS && (
            <Text style={styles.hitsMore}>{t('tests_more', { shown: TEST_ROWS, total: testHits.length })}</Text>
          )}
          <Text style={[styles.hitsTitle, { marginTop: 10 }]}>{t('centres_heading')}</Text>
        </View>
      )}
    </>
  );

  const listEmpty = isCentreMode ? (
    centresLoading ? (
      <SkeletonList count={4} />
    ) : (
      <View style={styles.emptyState}>
        <Ionicons
          name={mode === BLOOD_CENTER ? 'water-outline' : 'pulse-outline'}
          size={46} color={Colors.gray400} style={{ marginBottom: 12 }} />
        <Text style={styles.emptyTitle}>
          {t(mode === BLOOD_CENTER ? 'no_blood_centres' : 'no_scan_centres')}
        </Text>
        <Text style={styles.emptySub}>
          {t('onboarding_partners')}
        </Text>
      </View>
    )
  ) : loading ? (
    // Skeletons, not a spinner: this list paints from cache almost
    // immediately, and a full-screen spinner made the fast path feel
    // slower than it is. Lists get skeletons; one-off transitions (the
    // detail screen, checkout) keep the spinner — there the shape of what
    // is coming isn't predictable enough for a placeholder to help.
    <SkeletonList count={5} />
  ) : error ? (
    <View style={styles.emptyState}>
      <Ionicons name="cloud-offline-outline" size={46} color={Colors.gray400} style={{ marginBottom: 12 }} />
      <Text style={styles.emptyTitle}>{t('cant_load_doctors')}</Text>
      <Text style={styles.emptySub}>{t('connection_error')}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={loadDoctors}>
        <Text style={styles.retryBtnText}>{t('retry')}</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.emptyState}>
      <Ionicons name="search-outline" size={46} color={Colors.gray400} style={{ marginBottom: 12 }} />
      <Text style={styles.emptyTitle}>{t('no_doctors_found')}</Text>
      <Text style={styles.emptySub}>{t('adjust_search')}</Text>
    </View>
  );

  const listData = isCentreMode
    ? (centresLoading ? [] : filteredCentres)
    : (loading || error ? [] : filtered);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* The header scrolls WITH the results. It used to sit outside the list,
          which pinned ~340pt of a 812pt screen — title, search, tabs and count
          — above the first card for the whole session. */}
      <FlatList
        data={listData}
        keyExtractor={(item: any) => String(item.id)}
        renderItem={isCentreMode ? renderCentre : renderDoctor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Scrolling the results means the user is done with the typeahead.
        onScrollBeginDrag={() => setSearchFocused(false)}
        // Windowing: a city with a few hundred doctors used to mount every
        // card up front. These keep the first paint to roughly a screenful.
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        // No removeClippedSubviews: the search box and its typeahead now live
        // inside the scrolled content, and on Android that flag unmounts
        // clipped subviews — which drops focus mid-typing.
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },

  header: {
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.blue100,
    backgroundColor: Colors.bg,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.gray900, marginBottom: 2 },
  sub:   { fontSize: 14, color: Colors.gray400, marginBottom: 14 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.blue100,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.gray900 },

  // Search typeahead
  suggestBox:        { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, overflow: 'hidden', marginBottom: 10 },
  suggestHeading:    { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: Colors.gray400, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 },
  suggestItem:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  suggestItemBorder: { borderTopWidth: 1, borderTopColor: Colors.blue50 },
  suggestItemMain:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  suggestItemText:   { flex: 1, fontSize: 13, color: Colors.gray800 },
  suggestFill:       { transform: [{ rotate: '-45deg' }] },

  keywordScroll:        { flexGrow: 0, marginBottom: 10 },
  keywordScrollContent: { gap: 8, paddingRight: 4 },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.blue50,
    borderWidth: 1,
    borderColor: Colors.blue200,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  keywordChipActive:     { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  keywordChipText:       { fontSize: 12, fontWeight: '600', color: Colors.blue600 },
  keywordChipTextActive: { color: Colors.white },

  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.blue50,
    borderWidth: 1,
    borderColor: Colors.blue200,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 10,
    gap: 4,
  },
  locationBtnText: { fontSize: 13, fontWeight: '600', color: Colors.blue600 },

  availToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.blue100,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  availToggleActive: { backgroundColor: Colors.successBg, borderColor: Colors.successBorder },
  toggleDot:         { width: 8, height: 8, borderRadius: 4 },
  availToggleText:   { fontSize: 13, fontWeight: '600', color: Colors.gray500 },

  countRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  countText: { fontSize: 13, color: Colors.gray400 },

  // No horizontal padding: the header is full-bleed (its own padding, its own
  // bottom border), so the 16px gutter lives on the cards instead. flexGrow
  // lets the empty state's flex:1 fill what's left below the header rather
  // than collapsing to zero height.
  listContent: { paddingBottom: 24, gap: 14, flexGrow: 1 },

  docCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.blue100,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  docCardTop: {
    borderColor: Colors.blue400,
    shadowColor: Colors.blue600,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },

  cardStrip:    { height: 3, backgroundColor: Colors.blue600 },
  cardStripTop: { height: 4, backgroundColor: Colors.blue700 },

  topBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.blue50,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.blue200,
  },
  topBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.blue600 },

  cardBody: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'flex-start' },

  docAvatarImg: {
    width: 64,
    height: 64,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.blue200,
    flexShrink: 0,
  },
  docAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: Colors.blue50,
    borderWidth: 1,
    borderColor: Colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  docSpec:     { fontSize: 10, fontWeight: '700', color: Colors.blue600, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  docName:     { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 3 },
  docHospitalRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  docHospital: { fontSize: 12, color: Colors.gray500, flexShrink: 1 },
  docMeta:     { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginBottom: 8 },
  metaChipRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  metaChip:    { fontSize: 11, color: Colors.gray400, flexShrink: 1 },

  slotRow:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  slotChip: { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  slotText: { fontSize: 10, color: Colors.blue700, fontWeight: '500' },
  slotMore: { fontSize: 11, color: Colors.blue400, paddingVertical: 3 },  // fixed: blue500 → blue400

  cardRight:  { alignItems: 'flex-end', justifyContent: 'flex-start', gap: 6 },
  availBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 4 },
  feeText:    { fontSize: 18, fontWeight: '800', color: Colors.blue600 },
  feeSub:     { fontSize: 10, color: Colors.gray400 },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    marginTop: -4,
  },
  slotsCount:      { fontSize: 12, color: Colors.gray400, flexShrink: 1 },

  // alignSelf: 'stretch', NOT 'flex-start'. Sizing the row to its content fit
  // while there were two tabs and silently overflowed the screen at three —
  // on a 375pt phone "Blood Tests" ended 28pt past the row and 12pt past the
  // viewport, so it was clipped and only half-tappable. The tabs share the row
  // instead, which stays correct whatever the third label says.
  modeRow: {
    flexDirection: 'row', gap: 4, alignSelf: 'stretch', marginHorizontal: 16,
    marginTop: 4, marginBottom: 2, padding: 4, borderRadius: 999,
    backgroundColor: Colors.gray100,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 999,
  },
  modeBtnActive: { backgroundColor: Colors.white },
  modeText:       { fontSize: 12, fontWeight: '600', color: Colors.gray500, flexShrink: 1 },
  modeTextActive: { color: Colors.blue700 },

  hits:      { paddingHorizontal: 16, paddingTop: 12 },
  hitsTitle: { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 8 },
  hit: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12,
  },
  hitName:  { fontSize: 14.5, fontWeight: '700', color: Colors.gray900 },
  hitSub:   { fontSize: 12.5, color: Colors.gray500, marginTop: 2 },
  hitPrice: { fontSize: 15, fontWeight: '800', color: Colors.blue700 },
  hitsMore: { fontSize: 12.5, color: Colors.gray500, marginBottom: 6 },
  centreCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  centreTop:  { flexDirection: 'row', alignItems: 'center', gap: 11 },
  centreIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.blue50,
    alignItems: 'center', justifyContent: 'center',
  },
  centreName: { fontSize: 15.5, fontWeight: '700', color: Colors.gray900 },
  centreMeta: { fontSize: 12.5, color: Colors.gray500, marginTop: 2 },
  centreChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  centreChip: {
    fontSize: 11.5, color: Colors.blue700, backgroundColor: Colors.blue50,
    paddingVertical: 4, paddingHorizontal: 9, borderRadius: 7, maxWidth: 150,
  },
  centreChipMore: { fontSize: 11.5, color: Colors.gray400, alignSelf: 'center' },
  centreFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.gray100,
  },
  centreCount: { fontSize: 12.5, color: Colors.gray500 },
  centreFrom:  { fontSize: 14, fontWeight: '800', color: Colors.gray900 },
  bookBtn:         { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  bookBtnDisabled: { backgroundColor: Colors.gray200 },  // fixed: gray300 → gray200
  bookBtnText:     { color: Colors.white, fontWeight: '700', fontSize: 13 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray500, marginBottom: 8 },
  emptySub:   { fontSize: 14, color: Colors.gray400, textAlign: 'center' },
  retryBtn:     { marginTop: 20, backgroundColor: Colors.blue600, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12 },
  retryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
});