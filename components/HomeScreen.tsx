/**
 * components/HomeScreen.tsx
 *
 * The app's home screen (patient tab). The old standalone landing route ("/")
 * now just redirects here, so this is the single source of truth for the home UI.
 * Includes a language switcher (globe button) wired to the i18n context.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { isTestHospital } from '../constants/config';
import API, { getUser } from '../services/api';
import { useI18n } from '../services/i18n';
import LanguageModal from './LanguageModal';

const STATS = [
  { num: '2,400+', key: 'stat_tokens'    },
  { num: '18',     key: 'stat_hospitals' },
  { num: '94%',    key: 'stat_ontime'    },
  { num: '4.8★',   key: 'stat_rating'    },
];

const FEATURES = [
  { icon: '📍', titleKey: 'feat_queue_title',  descKey: 'feat_queue_desc'  },
  { icon: '🔐', titleKey: 'feat_pay_title',    descKey: 'feat_pay_desc'    },
  { icon: '♻️', titleKey: 'feat_cancel_title', descKey: 'feat_cancel_desc' },
  { icon: '📱', titleKey: 'feat_device_title', descKey: 'feat_device_desc' },
];

const STEPS_2_4 = [
  { icon: '📅', titleKey: 'step_slot_title',   descKey: 'step_slot_desc'   },
  { icon: '💳', titleKey: 'step_pay_title',    descKey: 'step_pay_desc'    },
  { icon: '🏥', titleKey: 'step_walkin_title', descKey: 'step_walkin_desc' },
];

const PRICE_FEATURES = ['price_f1', 'price_f2', 'price_f3', 'price_f4', 'price_f5'];

// A doctor image is usable only if it's a real remote URL (not a placeholder).
function hasDoctorImage(image?: string | null): boolean {
  return !!image && !image.includes('placehold') && image.startsWith('http');
}

// ── Auth-aware navigation helpers ───────────────────────────────────────────
// Check for a stored user + access token. We do NOT validate expiry here — if
// the token has died, the destination screen's own auth effect / the API 401
// interceptor will bounce back to the right login screen.
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
  const router = useRouter();
  const { t, lang } = useI18n();

  const [doctors, setDoctors] = useState<any[]>([]);
  const [user,    setUser]    = useState<{ name?: string; username?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [navBusy, setNavBusy] = useState<'hospital' | 'patient' | null>(null);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    getUser().then(setUser);
    API.get('/doctors/')
      .then(({ data }) => {
        // Backend returns a DRF-paginated object { count, results: [...] };
        // older versions returned a plain array — handle both.
        const list = Array.isArray(data) ? data : (data.results || []);
        // Hide test/demo hospitals from the patient app.
        const real = list.filter((d: any) => !isTestHospital(d.hospital_name));
        setDoctors(real.slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
      <LanguageModal visible={langOpen} onClose={() => setLangOpen(false)} />
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

          <View style={styles.navRight}>
            {/* Language switcher */}
            <TouchableOpacity style={styles.langBtn} onPress={() => setLangOpen(true)}>
              <Text style={styles.langBtnText}>🌐 {lang.toUpperCase()}</Text>
            </TouchableOpacity>

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
                  : <Text style={styles.loginBtnText}>{t('login')}</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>{t('live_region')}</Text>
          </View>

          <Text style={styles.heroTitle}>
            {t('hero_line1')}{'\n'}
            <Text style={styles.accent}>{t('hero_line2')}</Text>
          </Text>

          <Text style={styles.heroSub}>{t('hero_sub')}</Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/(patient)/doctors')}
          >
            <Text style={styles.primaryBtnText}>{t('book_appointment')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={handleHospitalLoginPress}
            disabled={navBusy === 'hospital'}
          >
            {navBusy === 'hospital'
              ? <ActivityIndicator size="small" color={Colors.blue600} />
              : <Text style={styles.outlineBtnText}>{t('hospital_login')}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          {STATS.map((s, i) => (
            <View key={s.key} style={[styles.statItem, i < 3 && styles.statBorder]}>
              <Text style={styles.statNum}>{s.num}</Text>
              <Text style={styles.statLabel}>{t(s.key)}</Text>
            </View>
          ))}
        </View>

        {/* ── How it Works ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('how_it_works')}</Text>
          <Text style={styles.sectionTitle}>{t('book_4_steps')}</Text>

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
              <Text style={[styles.stepTitle, styles.stepTitleActive]}>{t('step_find_title')}</Text>
              <Text style={styles.stepDesc}>{t('step_find_desc')}</Text>
            </View>
          </TouchableOpacity>

          {/* Steps 2–4 — informational only */}
          {STEPS_2_4.map((step, i) => (
            <View key={step.titleKey} style={styles.stepCard}>
              <Text style={styles.stepNum}>0{i + 2}</Text>
              <View style={styles.stepIconBox}>
                <Text style={{ fontSize: 18 }}>{step.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{t(step.titleKey)}</Text>
                <Text style={styles.stepDesc}>{t(step.descKey)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Doctor Cards ── */}
        {!loading && doctors.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{t('doctors_near_you')}</Text>
              <TouchableOpacity onPress={() => router.push('/(patient)/doctors')}>
                <Text style={styles.viewAll}>{t('view_all')}</Text>
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
                    {hasDoctorImage(doc.image) ? (
                      <Image source={{ uri: doc.image }} style={styles.docImg} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 30 }}>🩺</Text>
                    )}
                    <View style={[styles.availBadge, { backgroundColor: doc.available ? Colors.successBg : Colors.errorBg }]}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: doc.available ? Colors.successText : Colors.errorText }}>
                        {doc.available ? t('available') : t('busy')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.docInfo}>
                    <Text style={styles.docSpec} numberOfLines={1}>{doc.specialization}</Text>
                    <Text style={styles.docName} numberOfLines={1}>Dr. {doc.name}</Text>
                    <Text style={styles.docMeta}>📍 {doc.city}  ·  {doc.experience}y exp</Text>
                    <Text style={styles.docFee}>₹15 {t('per_visit')}</Text>
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
          <Text style={styles.sectionLabel}>{t('why_tokenwalla')}</Text>
          <Text style={styles.sectionTitle}>{t('built_for_healthcare')}</Text>
          <View style={styles.featGrid}>
            {FEATURES.map((f) => (
              <View key={f.titleKey} style={styles.featCard}>
                <Text style={{ fontSize: 22, marginBottom: 10 }}>{f.icon}</Text>
                <Text style={styles.featTitle}>{t(f.titleKey)}</Text>
                <Text style={styles.featDesc}>{t(f.descKey)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Price Card ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('pricing')}</Text>
          <Text style={styles.sectionTitle}>{t('simple_transparent')}</Text>
          <View style={styles.priceCard}>
            <View style={styles.priceBadgeRow}>
              <Text style={styles.priceBadge}>{t('best_value')}</Text>
            </View>
            <Text style={styles.pricePlan}>{t('queue_view')}</Text>
            <View style={styles.priceAmtRow}>
              <Text style={styles.priceCur}>₹</Text>
              <Text style={styles.priceAmt}>15</Text>
            </View>
            <Text style={styles.priceSub}>{t('per_appointment')}</Text>
            {PRICE_FEATURES.map((f) => (
              <View key={f} style={styles.priceFeatureRow}>
                <Text style={styles.priceCheck}>✓</Text>
                <Text style={styles.priceFeature}>{t(f)}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.priceCTA}
              onPress={() => router.push('/(patient)/doctors')}
            >
              <Text style={styles.priceCTAText}>{t('book_appointment')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── CTA Banner ── */}
        <View style={styles.ctaBanner}>
          <Text style={styles.ctaTitle}>{t('cta_title')}</Text>
          <Text style={styles.ctaSub}>{t('cta_sub')}</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/(patient)/doctors')}>
            <Text style={styles.ctaBtnText}>{t('cta_btn')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('footer_1')}</Text>
          <Text style={styles.footerSub}>{t('footer_2')}</Text>
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
  navRight:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  langBtn:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  langBtnText:{ fontSize: 12, fontWeight: '700', color: Colors.blue700 },
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
  stepCardActive:    { borderColor: Colors.blue200, borderWidth: 1.5, backgroundColor: Colors.blue50 },
  stepIconBoxActive: { backgroundColor: Colors.blue100, borderColor: Colors.blue100 ?? Colors.blue200 },
  stepTitleActive:   { color: Colors.blue700 ?? Colors.blue600 },

  // Doctor cards
  docCard:   { width: 162, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, marginRight: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  docImgBox: { height: 110, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  docImg:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
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
