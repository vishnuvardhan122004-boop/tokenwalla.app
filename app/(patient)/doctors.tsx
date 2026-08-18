import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { isTestHospital } from '../../constants/config';
import { suggestKeywords } from '../../constants/searchKeywords';
import API from '../../services/api';
import { asList, filterScanCenters, SCAN_CENTER } from '../../utils/scanCenters';
import { useI18n } from '../../services/i18n';

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
  max_per_slot: number;
  image: string | null;
  hospital_image: string | null;
  hospital: number;
  hospital_name: string;
  city: string;
}

export default function DoctorsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  // A specialty chip on the home screen deep-links here with ?q=<term>.
  const params = useLocalSearchParams<{ q?: string }>();
  // 'doctors' | 'centres'. The centre path sits BESIDE the doctor path rather
  // than generalising it: the doctor list is the live, revenue-carrying screen.
  const [mode,            setMode]            = useState<'doctors' | 'centres'>('doctors');
  const [centres,         setCentres]         = useState<any[]>([]);
  const [scans,           setScans]           = useState<any[]>([]);
  const [centresLoading,  setCentresLoading]  = useState(false);

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

  // Scanning centres, fetched lazily — a patient who never switches never pays
  // for these two requests.
  //
  // filterScanCenters() is load-bearing, not belt-and-braces: this build can
  // reach a backend that has not deployed scanning centres, and an older
  // /api/hospitals/ IGNORES the unknown ?kind= param and returns every
  // hospital. Without the client-side check those would render here as
  // scanning centres. See utils/scanCenters.ts.
  const loadCentres = useCallback(async () => {
    setCentresLoading(true);
    try {
      const [hRes, sRes] = await Promise.all([
        API.get('/hospitals/', { params: { kind: SCAN_CENTER } }),
        API.get('/scans/').catch(() => ({ data: [] })),   // 404 on an old backend
      ]);
      setCentres(filterScanCenters(asList(hRes.data)));
      setScans(asList(sRes.data));
    } catch {
      setCentres([]);
      setScans([]);
    } finally {
      setCentresLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'centres' && centres.length === 0) loadCentres();
  }, [mode, centres.length, loadCentres]);

  const scansByCentre = scans.reduce((acc: Record<string, any[]>, sc: any) => {
    (acc[sc.center] = acc[sc.center] || []).push(sc);
    return acc;
  }, {});

  const filteredCentres = centres
    .map(c => ({ ...c, scans: scansByCentre[c.id] || [] }))
    .filter(c => {
      const hay = [c.name, c.city, c.address,
                   ...c.scans.map((sc: any) => `${sc.name} ${sc.modality}`)]
        .filter(Boolean).join(' ').toLowerCase();
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      const matchSearch = words.every(w => hay.includes(w));
      const matchCity   = !city || (c.city || '').toLowerCase().includes(city.toLowerCase());
      return matchSearch && matchCity;
    })
    // A centre with nothing listed opens onto an empty menu — ranked last
    // rather than hidden, so it still appears in a search by name.
    .sort((a, b) => (b.scans.length > 0 ? 1 : 0) - (a.scans.length > 0 ? 1 : 0)
                 || b.scans.length - a.scans.length);

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
    if (typeof params.q === 'string' && params.q) setSearch(params.q);
  }, [params.q]);

  // ── LOCATION DETECTION ────────────────────────────────────────────────────
  const detectLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow location access to find nearby doctors.');
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
      Alert.alert('Error', 'Could not detect location. Try again.');
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
  const popularityBoost = (views?: number): number =>
    Math.min(30, Math.round(12 * Math.log10(1 + (views || 0))));

  const rankDoctor = (doc: Doctor): number => {
    let score = 0;
    if (doc.available) score += 100;
    if (city && (doc.city || '').toLowerCase() === city.toLowerCase()) score += 50;
    score += (doc.experience || 0);
    score += (doc.slots?.length || 0) * 2;
    score += popularityBoost(doc.view_count);
    return score;
  };

  // ── IMAGE CHECK ───────────────────────────────────────────────────────────
  const hasDoctorImage = (image: string | null): boolean =>
    !!image && !image.includes('placehold') && image.startsWith('http');

  // ── FILTER + SORT ─────────────────────────────────────────────────────────
  const filtered = doctors
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
    .sort((a: Doctor, b: Doctor) => rankDoctor(b) - rankDoctor(a));

  // ── KEYWORD CHIPS ─────────────────────────────────────────────────────────
  // Tappable quick-search terms pulled from the real data: each doctor's
  // comma-separated `keywords` plus their specialization. Deduped
  // case-insensitively and capped so the strip stays short and scrollable.
  const keywordChips = (() => {
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
  })();

  // ── SEARCH TYPEAHEAD ──────────────────────────────────────────────────────
  // Google-style completions under the search box. Candidates from the live
  // data (doctor names, specializations, keywords, hospitals, cities) rank
  // ahead of the generic term list, so a tapped suggestion always has results.
  const searchSuggestions = (() => {
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
    return suggestKeywords(search, fromData.filter(Boolean), 6);
  })();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('find_doctors')}</Text>
        <Text style={styles.sub}>
          {loading ? t('loading_ellipsis') : t('doctors_available', { count: doctors.length })}
        </Text>

        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color={Colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('search_placeholder')}
            placeholderTextColor={Colors.gray400}
            value={search}
            onChangeText={setSearch}
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
        {searchSuggestions.length === 0 && keywordChips.length > 0 && (
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
                    {kw}
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

        {/* Available Only Toggle */}
        <TouchableOpacity
          style={[styles.availToggle, availOnly && styles.availToggleActive]}
          onPress={() => setAvailOnly(p => !p)}
        >
          <View style={[styles.toggleDot, { backgroundColor: availOnly ? Colors.successText : Colors.gray400 }]} />
          <Text style={[styles.availToggleText, availOnly && { color: Colors.successText }]}>
            {t('available_only')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── DOCTORS ⇄ SCAN CENTRES ── */}
      <View style={styles.modeRow}>
        {([
          { key: 'doctors', icon: 'medkit-outline', label: 'Doctors' },
          { key: 'centres', icon: 'pulse-outline',  label: 'Scan Centres' },
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
              <Ionicons name={m.icon} size={15} color={active ? Colors.blue700 : Colors.gray500} />
              <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── RESULTS COUNT + SORT LABEL ── */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {mode === 'centres'
            ? `${filteredCentres.length} centre${filteredCentres.length === 1 ? '' : 's'}`
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

      {/* ── SCAN CENTRE LIST ── */}
      {mode === 'centres' ? (
        centresLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue600} />
          </View>
        ) : filteredCentres.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pulse-outline" size={46} color={Colors.gray400} style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No scanning centres yet</Text>
            <Text style={styles.emptySub}>
              We&apos;re onboarding diagnostic partners now. Try the Doctors tab.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredCentres}
            keyExtractor={(item: any) => String(item.id)}
            contentContainerStyle={{ padding: 16, gap: 14 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => setSearchFocused(false)}
            renderItem={({ item: c }: { item: any }) => {
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
                      <Ionicons name="pulse" size={20} color={Colors.blue600} />
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
                        ? `${c.scans.length} scan${c.scans.length === 1 ? '' : 's'}`
                        : 'Contact the centre'}
                    </Text>
                    {from != null && <Text style={styles.centreFrom}>from ₹{from}</Text>}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )
      ) : /* ── DOCTOR LIST ── */
      loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.blue600} />
          <Text style={{ marginTop: 12, color: Colors.gray400, fontSize: 14 }}>{t('loading_doctors')}</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline-outline" size={46} color={Colors.gray400} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>{t('cant_load_doctors')}</Text>
          <Text style={styles.emptySub}>{t('connection_error')}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadDoctors}>
            <Text style={styles.retryBtnText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={46} color={Colors.gray400} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>{t('no_doctors_found')}</Text>
          <Text style={styles.emptySub}>{t('adjust_search')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: Doctor) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Scrolling the results means the user is done with the typeahead.
          onScrollBeginDrag={() => setSearchFocused(false)}
          renderItem={({ item: doc, index }: { item: Doctor; index: number }) => {

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
                    <Image
                      source={{ uri: doc.image! }}
                      style={styles.docAvatarImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.docAvatarFallback}>
                      <Ionicons name="medkit-outline" size={28} color={Colors.blue400} />
                    </View>
                  )}

                  {/* ── CENTER INFO ── */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docSpec}>{doc.specialization}</Text>
                    <Text style={styles.docName}>{doc.name}</Text>
                    <View style={styles.docHospitalRow}>
                      <Ionicons name="business-outline" size={12} color={Colors.gray500} />
                      <Text style={styles.docHospital} numberOfLines={1}>{doc.hospital_name}</Text>
                    </View>
                    <View style={styles.docMeta}>
                      <View style={styles.metaChipRow}>
                        <Ionicons name="location-outline" size={12} color={isNearby ? Colors.blue600 : Colors.gray400} />
                        <Text style={[styles.metaChip, isNearby && { color: Colors.blue600, fontWeight: '700' }]}>
                          {isNearby ? `Nearby · ${doc.city}` : doc.city}
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
                    <Text style={styles.feeSub}>per visit</Text>
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

              </TouchableOpacity>
            );
          }}
        />
      )}
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
  suggestHeading:    { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: Colors.gray400, textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: 11, paddingBottom: 3 },
  suggestItem:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  suggestItemBorder: { borderTopWidth: 1, borderTopColor: Colors.blue50 },
  suggestItemMain:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11 },
  suggestItemText:   { flex: 1, fontSize: 14, color: Colors.gray800 },
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

  docCard: {
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
  docMeta:     { flexDirection: 'row', gap: 12, marginBottom: 8 },
  metaChipRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaChip:    { fontSize: 11, color: Colors.gray400 },

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
    paddingHorizontal: 16,
    paddingBottom: 14,
    marginTop: -4,
  },
  slotsCount:      { fontSize: 12, color: Colors.gray400 },

  modeRow: {
    flexDirection: 'row', gap: 6, alignSelf: 'flex-start', marginHorizontal: 16,
    marginTop: 4, marginBottom: 2, padding: 4, borderRadius: 999,
    backgroundColor: Colors.gray100,
  },
  modeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999,
  },
  modeBtnActive: { backgroundColor: Colors.white },
  modeText:       { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  modeTextActive: { color: Colors.blue700 },

  centreCard: {
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