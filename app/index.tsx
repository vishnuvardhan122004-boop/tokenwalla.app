import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import API, { getUser } from '../services/api';

const STATS = [
  { num: '2,400+', label: 'Tokens' },
  { num: '18',     label: 'Hospitals' },
  { num: '94%',    label: 'On-time' },
  { num: '4.8★',   label: 'Rating' },
];

const FEATURES = [
  { icon: '📍', title: 'Live Queue',    desc: 'Track position in real time, refreshed every 15s' },
  { icon: '🔐', title: 'Secure Pay',   desc: 'Razorpay-powered. UPI, cards, net banking'         },
  { icon: '♻️', title: 'Easy Cancel',  desc: 'Cancel 2hrs before slot, full refund'              },
  { icon: '📱', title: 'Any Device',   desc: 'Works on Android & iOS seamlessly'                 },
];

// ── Auth-aware navigation helpers ───────────────────────────────────────────
// Both check for a stored `user` + `access` token pair. We deliberately do
// NOT validate token expiry here — if the token has actually died, the
// destination screen's own auth effect (e.g. HospitalDashboard's mount
// check, or the API 401 interceptor) will catch it and bounce back to the
// relevant login screen. This keeps the home screen's nav logic cheap and
// avoids an extra network round-trip just to decide where to route.

async function getStoredAuth(): Promise<{ user: any; hasToken: boolean } | null> {
  try {
    const [raw, access] = await Promise.all([
      AsyncStorage.getItem('user'),
      AsyncStorage.getItem('access'),
    ]);
    if (!raw || !access) return null;
    return { user: JSON.parse(raw), hasToken: true };
  } catch {
    return null;
  }
}

export default function HomeScreen() {
  const router  = useRouter();
  const [doctors,  setDoctors]  = useState<any[]>([]);
  const [user,     setUser]     = useState<{ name?: string; username?: string } | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [navBusy,  setNavBusy]  = useState<'hospital' | 'patient' | null>(null);

  useEffect(() => {
    getUser().then(setUser);
    API.get('/doctors/')
      .then(({ data }) => setDoctors(data.slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Tapping "Hospital Login": if already logged in as a hospital, skip
  // straight to the dashboard. Otherwise go to the hospital login screen.
  const handleHospitalLoginPress = async () => {
    setNavBusy('hospital');
    const auth = await getStoredAuth();
    setNavBusy(null);
    if (auth?.hasToken && auth.user?.role === 'hospital') {
      router.replace('/(hospital)/dashboard');
      return;
    }
    router.push('/(hospital)/login');
  };

  // Tapping the navbar "Login →" button: if already logged in as a patient,
  // skip straight past login. Otherwise go to the patient login screen.
  const handlePatientLoginPress = async () => {
    setNavBusy('patient');
    const auth = await getStoredAuth();
    setNavBusy(null);
    if (auth?.hasToken && auth.user?.role === 'patient') {
      router.replace('/(patient)/doctors');
      return;
    }
    router.push('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>

        {/* ── Navbar ── */}
        <View style={styles.navbar}>
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>TW</Text>
            </View>
            <Text style={styles.brandName}>
              <Text style={styles.accent}>Token</Text>walla
            </Text>
          </View>
          {user ? (
            <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/(patient)/profile')}>
              <Text style={styles.avatarText}>
                {(user.name || user.username || 'U').slice(0, 2).toUpperCase()}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={handlePatientLoginPress}
              disabled={navBusy === 'patient'}
            >
              {navBusy === 'patient'
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.loginBtnText}>Login →</Text>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          {/* Live badge */}
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>Live in AP & Telangana</Text>
          </View>

          <Text style={styles.heroTitle}>
            Skip the Queue.{'\n'}
            <Text style={styles.accent}>Book Your{'\n'}Token</Text> Online.
          </Text>

          <Text style={styles.heroSub}>
            Book doctor appointments instantly, get a digital token,
            and walk in right on time. No more waiting rooms.
          </Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/(patient)/doctors')}
          >
            <Text style={styles.primaryBtnText}>Book Appointment →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={handleHospitalLoginPress}
            disabled={navBusy === 'hospital'}
          >
            {navBusy === 'hospital'
              ? <ActivityIndicator size="small" color={Colors.blue600} />
              : <Text style={styles.outlineBtnText}>Hospital Login</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          {STATS.map((s, i) => (
            <View key={i} style={[styles.statItem, i < 3 && styles.statBorder]}>
              <Text style={styles.statNum}>{s.num}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── How it Works ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
          <Text style={styles.sectionTitle}>Book in 4 Simple Steps</Text>

          {/* Step 1 — tappable, navigates to doctors */}
          <TouchableOpacity
            style={[styles.stepCard, styles.stepCardActive]}
            onPress={() => router.push('/(patient)/doctors')}
            activeOpacity={0.75}
          >
            <Text style={styles.stepNum}>01</Text>
            <View style={[styles.stepIconBox, styles.stepIconBoxActive]}>
              <Text style={{ fontSize: 18 }}>🔍</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepTitle, styles.stepTitleActive]}>Find a Doctor →</Text>
              <Text style={styles.stepDesc}>Browse by specialization, city, or hospital</Text>
            </View>
          </TouchableOpacity>

          {/* Steps 2–4 — informational only */}
          {[
            { icon: '📅', title: 'Pick a Slot',     desc: 'Choose date & time in under 60 seconds'  },
            { icon: '💳', title: 'Pay ₹15',         desc: 'Secure UPI, cards, wallets via Razorpay' },
            { icon: '🏥', title: 'Walk In on Time', desc: 'Track live queue from anywhere'           },
          ].map((step, i) => (
            <View key={i} style={styles.stepCard}>
              <Text style={styles.stepNum}>0{i + 2}</Text>
              <View style={styles.stepIconBox}>
                <Text style={{ fontSize: 18 }}>{step.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Doctor Cards ── */}
        {!loading && doctors.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Doctors Near You</Text>
              <TouchableOpacity onPress={() => router.push('/(patient)/doctors')}>
                <Text style={styles.viewAll}>View All →</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24 }} contentContainerStyle={{ paddingHorizontal: 24 }}>
              {doctors.map((doc) => (
                <TouchableOpacity
                  key={doc.id}
                  style={styles.docCard}
                  onPress={() => router.push({ pathname: '/(patient)/doctor/[id]', params: { id: doc.id } })}
                >
                  <View style={styles.docImgBox}>
                    <Text style={{ fontSize: 30 }}>🩺</Text>
                    <View style={[styles.availBadge, { backgroundColor: doc.available ? Colors.successBg : Colors.errorBg }]}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: doc.available ? Colors.successText : Colors.errorText }}>
                        {doc.available ? 'Available' : 'Busy'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.docInfo}>
                    <Text style={styles.docSpec} numberOfLines={1}>{doc.specialization}</Text>
                    <Text style={styles.docName} numberOfLines={1}>Dr. {doc.name}</Text>
                    <Text style={styles.docMeta}>📍 {doc.city}  ·  {doc.experience}y exp</Text>
                    <Text style={styles.docFee}>₹15 / visit</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {loading && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator color={Colors.blue600} />
          </View>
        )}

        {/* ── Features ── */}
        <View style={[styles.section, { backgroundColor: Colors.bg, marginHorizontal: 0, padding: 24 }]}>
          <Text style={styles.sectionLabel}>WHY TOKENWALLA</Text>
          <Text style={styles.sectionTitle}>Built for Real Healthcare</Text>
          <View style={styles.featGrid}>
            {FEATURES.map((f, i) => (
              <View key={i} style={styles.featCard}>
                <Text style={{ fontSize: 22, marginBottom: 10 }}>{f.icon}</Text>
                <Text style={styles.featTitle}>{f.title}</Text>
                <Text style={styles.featDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Price Card ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PRICING</Text>
          <Text style={styles.sectionTitle}>Simple, Transparent</Text>
          <View style={styles.priceCard}>
            <View style={styles.priceBadgeRow}>
              <Text style={styles.priceBadge}>✨ Best Value</Text>
            </View>
            <Text style={styles.pricePlan}>Queue View</Text>
            <View style={styles.priceAmtRow}>
              <Text style={styles.priceCur}>₹</Text>
              <Text style={styles.priceAmt}>15</Text>
            </View>
            <Text style={styles.priceSub}>Per appointment · No hidden fees</Text>
            {[
              'Confirmed token number',
              'Live queue position tracking',
              'Instant confirmation',
              'UPI / Cards / Wallets',
              'Refundable if cancelled',
            ].map((f) => (
              <View key={f} style={styles.priceFeatureRow}>
                <Text style={styles.priceCheck}>✓</Text>
                <Text style={styles.priceFeature}>{f}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.priceCTA}
              onPress={() => router.push('/(patient)/doctors')}
            >
              <Text style={styles.priceCTAText}>Book Appointment →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── CTA Banner ── */}
        <View style={styles.ctaBanner}>
          <Text style={styles.ctaTitle}>Ready to Skip the Queue?</Text>
          <Text style={styles.ctaSub}>Join thousands booking smarter with TokenWalla.</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/(patient)/doctors')}>
            <Text style={styles.ctaBtnText}>Find a Doctor Now →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 TokenWalla · Built for better healthcare</Text>
          <Text style={styles.footerSub}>support@tokenwalla.com · Hindupur, AP 515201</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  root: { flex: 1, backgroundColor: Colors.white },

  // Navbar
  navbar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.white },
  brand:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox:    { width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  logoText:   { color: Colors.white, fontWeight: '800', fontSize: 12 },
  brandName:  { fontSize: 17, fontWeight: '800', color: Colors.gray900 },
  accent:     { color: Colors.blue600 },
  loginBtn:   { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, minWidth: 76, alignItems: 'center', justifyContent: 'center' },
  loginBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  avatarBtn:  { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontWeight: '800', fontSize: 12 },

  // Hero
  hero:       { padding: 24, paddingTop: 32, backgroundColor: Colors.bg },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 18 },
  badgeDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.successText },
  badgeText:  { fontSize: 12, color: Colors.blue700, fontWeight: '600' },
  heroTitle:  { fontSize: 32, fontWeight: '800', color: Colors.gray900, lineHeight: 40, marginBottom: 14 },
  heroSub:    { fontSize: 15, color: Colors.gray500, lineHeight: 24, marginBottom: 26 },
  primaryBtn: { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginBottom: 12, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  outlineBtn: { borderWidth: 1.5, borderColor: Colors.blue200, borderRadius: 13, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  outlineBtnText: { color: Colors.blue600, fontWeight: '600', fontSize: 15 },

  // Stats
  statsRow:   { flexDirection: 'row', backgroundColor: Colors.white, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.blue100 },
  statItem:   { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statBorder: { borderRightWidth: 1, borderRightColor: Colors.blue100 },
  statNum:    { fontSize: 17, fontWeight: '800', color: Colors.blue600 },
  statLabel:  { fontSize: 11, color: Colors.gray400, marginTop: 2 },

  // Section
  section:      { padding: 24 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginBottom: 6 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 18 },
  viewAll:      { fontSize: 13, color: Colors.blue600, fontWeight: '600' },

  // Steps
  stepCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  stepNum:     { fontSize: 22, fontWeight: '800', color: Colors.blue100, width: 32, textAlign: 'center' },
  stepIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center' },
  stepTitle:   { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 3 },
  stepDesc:    { fontSize: 12, color: Colors.gray500, lineHeight: 18 },

  // Step active overrides (Step 1)
  stepCardActive:    { borderColor: Colors.blue200, borderWidth: 1.5, backgroundColor: Colors.blue50 },
  stepIconBoxActive: { backgroundColor: Colors.blue100, borderColor: Colors.blue100 ?? Colors.blue200 },
  stepTitleActive:   { color: Colors.blue700 ?? Colors.blue600 },

  // Doctor cards
  docCard:   { width: 162, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, marginRight: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  docImgBox: { height: 110, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  availBadge: { position: 'absolute', top: 8, right: 8, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  docInfo:   { padding: 12 },
  docSpec:   { fontSize: 9, fontWeight: '700', color: Colors.blue600, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  docName:   { fontSize: 13, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
  docMeta:   { fontSize: 11, color: Colors.gray400, marginBottom: 6 },
  docFee:    { fontSize: 12, fontWeight: '700', color: Colors.blue600 },

  // Features
  featGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  featCard: { width: '47%', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 16 },
  featTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
  featDesc:  { fontSize: 12, color: Colors.gray500, lineHeight: 17 },

  // Price card
  priceCard:    { backgroundColor: Colors.blue600, borderRadius: 22, padding: 28, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 },
  priceBadgeRow: { marginBottom: 16 },
  priceBadge:   { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4, color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  pricePlan:    { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 8 },
  priceAmtRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  priceCur:     { fontSize: 22, fontWeight: '700', color: Colors.white, marginTop: 6 },
  priceAmt:     { fontSize: 52, fontWeight: '800', color: Colors.white, lineHeight: 58 },
  priceSub:     { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 22 },
  priceFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  priceCheck:   { fontSize: 15, color: '#9FE1CB', fontWeight: '700' },
  priceFeature: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  priceCTA:     { backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  priceCTAText: { color: Colors.blue700, fontWeight: '700', fontSize: 15 },

  // CTA banner
  ctaBanner: { backgroundColor: Colors.blue900, margin: 24, borderRadius: 20, padding: 28, alignItems: 'center' },
  ctaTitle:  { fontSize: 20, fontWeight: '800', color: Colors.white, textAlign: 'center', marginBottom: 8 },
  ctaSub:    { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  ctaBtn:    { backgroundColor: Colors.white, borderRadius: 11, paddingHorizontal: 24, paddingVertical: 13 },
  ctaBtnText: { color: Colors.blue700, fontWeight: '700', fontSize: 14 },

  // Footer
  footer:    { padding: 24, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.blue50 },
  footerText: { fontSize: 12, color: Colors.gray400, marginBottom: 4 },
  footerSub:  { fontSize: 11, color: Colors.gray400 },
});

