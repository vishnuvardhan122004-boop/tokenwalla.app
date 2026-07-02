import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import API from '../../services/api';

// ── TYPE ──────────────────────────────────────────────────────────────────────
interface Doctor {
  id: number;
  name: string;
  specialization: string;
  experience: number;
  mobile: string;
  available: boolean;
  fee: number;
  slots: string[];
  max_per_slot: number;
  image: string | null;
  hospital_image: string | null;
  hospital: number;
  hospital_name: string;
  city: string;
}

export default function DoctorsScreen() {
  const router = useRouter();
  const [doctors,         setDoctors]         = useState<Doctor[]>([]);
  const [search,          setSearch]          = useState('');
  const [specFilter,      setSpecFilter]      = useState('All');
  const [availOnly,       setAvailOnly]       = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [specs,           setSpecs]           = useState<string[]>(['All']);
  const [city,            setCity]            = useState('');
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    API.get('/doctors/')
      .then(({ data }) => {
        const list: Doctor[] = Array.isArray(data) ? data : (data.results || []);
        setDoctors(list);
        const uniqueSpecs: string[] = ['All', ...new Set(list.map((d: Doctor) => d.specialization).filter(Boolean))];
        setSpecs(uniqueSpecs);
      })
      .catch(() => setDoctors([]))
      .finally(() => setLoading(false));
  }, []);

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
      setCity(detectedCity);
      setSearch(detectedCity);
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
  const rankDoctor = (doc: Doctor): number => {
    let score = 0;
    if (doc.available) score += 100;
    if (city && (doc.city || '').toLowerCase() === city.toLowerCase()) score += 50;
    score += (doc.experience || 0);
    score += (doc.slots?.length || 0) * 2;
    return score;
  };

  // ── IMAGE CHECK ───────────────────────────────────────────────────────────
  const hasDoctorImage = (image: string | null): boolean =>
    !!image && !image.includes('placehold') && image.startsWith('http');

  // ── FILTER + SORT ─────────────────────────────────────────────────────────
  const filtered = doctors
    .filter((doc: Doctor) => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        (doc.name            || '').toLowerCase().includes(q) ||
        (doc.specialization  || '').toLowerCase().includes(q) ||
        (doc.hospital_name   || '').toLowerCase().includes(q) ||
        (doc.city            || '').toLowerCase().includes(q);
      const matchSpec  = specFilter === 'All' || doc.specialization === specFilter;
      const matchAvail = !availOnly || doc.available;
      return matchSearch && matchSpec && matchAvail;
    })
    .sort((a: Doctor, b: Doctor) => rankDoctor(b) - rankDoctor(a));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Find Doctors</Text>
        <Text style={styles.sub}>
          {loading ? 'Loading...' : `${doctors.length} doctors available`}
        </Text>

        {/* Search */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search doctor, specialization, hospital..."
            placeholderTextColor={Colors.gray400}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={{ fontSize: 16, color: Colors.gray400 }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Location Button */}
        <TouchableOpacity
          style={[styles.locationBtn, locationLoading && { opacity: 0.6 }]}
          onPress={city ? clearLocation : detectLocation}
          disabled={locationLoading}
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color={Colors.blue600} />
          ) : (
            <Text style={styles.locationBtnText}>
              📍 {city ? `Near: ${city}` : 'Detect My Location'}
            </Text>
          )}
          {city && !locationLoading ? (
            <Text style={{ fontSize: 13, color: Colors.gray400, marginLeft: 4 }}>✕</Text>
          ) : null}
        </TouchableOpacity>

        {/* Available Only Toggle */}
        <TouchableOpacity
          style={[styles.availToggle, availOnly && styles.availToggleActive]}
          onPress={() => setAvailOnly(p => !p)}
        >
          <View style={[styles.toggleDot, { backgroundColor: availOnly ? Colors.successText : Colors.gray400 }]} />
          <Text style={[styles.availToggleText, availOnly && { color: Colors.successText }]}>
            Available Only
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── SPECIALIZATION PILLS ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.specScroll}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {specs.map(spec => (
          <TouchableOpacity
            key={spec}
            style={[styles.specPill, specFilter === spec && styles.specPillActive]}
            onPress={() => setSpecFilter(spec)}
          >
            <Text style={[styles.specText, specFilter === spec && styles.specTextActive]}>
              {spec}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── RESULTS COUNT + SORT LABEL ── */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {city ? ` · sorted by proximity` : ' · sorted by availability'}
        </Text>
        {(search || specFilter !== 'All' || availOnly || city) && (
          <TouchableOpacity onPress={() => {
            setSearch('');
            setSpecFilter('All');
            setAvailOnly(false);
            setCity('');
          }}>
            <Text style={{ fontSize: 13, color: Colors.blue600, fontWeight: '600' }}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── DOCTOR LIST ── */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.blue600} />
          <Text style={{ marginTop: 12, color: Colors.gray400, fontSize: 14 }}>Loading doctors...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🔍</Text>
          <Text style={styles.emptyTitle}>No doctors found</Text>
          <Text style={styles.emptySub}>Try adjusting your search or filters</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: Doctor) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          showsVerticalScrollIndicator={false}
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
                    <Text style={styles.topBadgeText}>⭐ Top Match</Text>
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
                      <Text style={{ fontSize: 28 }}>🩺</Text>
                    </View>
                  )}

                  {/* ── CENTER INFO ── */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docSpec}>{doc.specialization}</Text>
                    <Text style={styles.docName}>Dr. {doc.name}</Text>
                    <Text style={styles.docHospital}>🏥 {doc.hospital_name}</Text>
                    <View style={styles.docMeta}>
                      <Text style={[
                        styles.metaChip,
                        isNearby && { color: Colors.blue600, fontWeight: '700' }
                      ]}>
                        {isNearby ? '📍 Nearby · ' : '📍 '}{doc.city}
                      </Text>
                      <Text style={styles.metaChip}>⏳ {doc.experience}y exp</Text>
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
                        {doc.available ? 'Available' : 'Busy'}
                      </Text>
                    </View>
                    <Text style={styles.feeText}>₹{doc.fee || 15}</Text>
                    <Text style={styles.feeSub}>per visit</Text>
                  </View>
                </View>

                {/* ── FOOTER ── */}
                <View style={styles.cardFooter}>
                  <Text style={styles.slotsCount}>{doc.slots?.length || 0} slots today</Text>
                  <View style={[styles.bookBtn, !doc.available && styles.bookBtnDisabled]}>
                    <Text style={styles.bookBtnText}>
                      {doc.available ? 'Book Now →' : 'Unavailable'}
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
  searchIcon:  { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.gray900 },

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

  specScroll:     { flexGrow: 0, paddingVertical: 12 },
  specPill:       { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 7 },
  specPillActive: { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  specText:       { fontSize: 13, fontWeight: '500', color: Colors.gray600 },
  specTextActive: { color: Colors.white, fontWeight: '600' },

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
  docHospital: { fontSize: 12, color: Colors.gray500, marginBottom: 8 },
  docMeta:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
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
  bookBtn:         { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  bookBtnDisabled: { backgroundColor: Colors.gray200 },  // fixed: gray300 → gray200
  bookBtnText:     { color: Colors.white, fontWeight: '700', fontSize: 13 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray500, marginBottom: 8 },
  emptySub:   { fontSize: 14, color: Colors.gray400, textAlign: 'center' },
});