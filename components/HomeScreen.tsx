/**
 * components/HomeScreen.tsx
 *
 * The app's home screen (patient tab). The old standalone landing route ("/")
 * now just redirects here, so this is the single source of truth for the home UI.
 * Includes a language switcher (globe button) wired to the i18n context.
 *
 * It opens on what a patient came for — search, their city, hospitals, doctors —
 * and every number on it is derived from the public doctor list
 * (utils/homeSummary.ts). It used to carry a hard-coded stats row ("2,400+
 * tokens", "94% on-time", "4.8★") that no data ever supported.
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { isTestHospital } from '../constants/config';
import { providerLabel } from '../utils/booking';
import { computeFeeBreakdown, money } from '../utils/fees';
import { featuredDoctors, initials, summariseDoctors } from '../utils/homeSummary';
import API, { getUser } from '../services/api';
import { useI18n } from '../services/i18n';
import { registerPushToken } from '../services/notifications';
import CityIntentModal, { cityIntentRoute } from './CityIntentModal';
import LanguageModal from './LanguageModal';
import NotificationBell from './NotificationBell';

// Icon name typed against Ionicons' glyph set, so tsc rejects any invalid name
// (a typo fails the build — no broken glyph boxes ever ship).
type IconName = ComponentProps<typeof Ionicons>['name'];

// Three short promises under the hero buttons, in place of the old feature cards.
const TRUST = ['feat_queue_title', 'feat_pay_title', 'feat_cancel_title'];

const STEPS: { icon: IconName; titleKey: string }[] = [
  { icon: 'search-outline',   titleKey: 'step_find_title'   },
  { icon: 'calendar-outline', titleKey: 'step_slot_title'   },
  { icon: 'card-outline',     titleKey: 'step_pay_title'    },
  { icon: 'walk-outline',     titleKey: 'step_walkin_title' },
];

const MAX_CITIES    = 5;
const MAX_HOSPITALS = 6;
const MAX_DOCTORS   = 8;

// What a booking actually costs online, computed from the same constants the
// backend prices with (utils/fees.ts mirrors payments/fees.py). Passing 0 as
// the doctor's fee gives the SERVICE_ONLY bill — the consultation itself is
// settled at the clinic. Derived, never typed in, so it cannot go stale the
// way the old hardcoded "₹20" did.
const SERVICE_BILL = computeFeeBreakdown(0);

// Quick-access specialty tiles. `key` is the search term deep-linked to the
// doctors tab (?q=key); doctors.tsx expands it via SPEC_SYNONYMS so e.g. "skin"
// also finds doctors stored as "Dermatologist". Labels are translated (spec_*).
// Icons mirror the web app's specialty chips (src/componets/AllDoctor.js).
const SPECIALTIES: { key: string; icon: IconName }[] = [
  { key: 'general',  icon: 'medkit-outline'          },
  { key: 'heart',    icon: 'heart-outline'           },
  { key: 'skin',     icon: 'hand-left-outline'       },
  { key: 'dental',   icon: 'happy-outline'           },
  { key: 'child',    icon: 'balloon-outline'         },
  { key: 'bones',    icon: 'body-outline'            },
  { key: 'eye',      icon: 'eye-outline'             },
  { key: 'ent',      icon: 'ear-outline'             },
  { key: 'women',    icon: 'female-outline'          },
  { key: 'neuro',    icon: 'git-network-outline'     },
  { key: 'mental',   icon: 'happy-outline'           },
  { key: 'diabetes', icon: 'water-outline'           },
  { key: 'kidney',   icon: 'flask-outline'           },
  { key: 'stomach',  icon: 'nutrition-outline'       },
  { key: 'lungs',    icon: 'fitness-outline'         },
  { key: 'physio',   icon: 'accessibility-outline'   },
];

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

  // Every real doctor; the cities, hospitals and cards below are all derived
  // from this one list.
  const [allDoctors, setAllDoctors] = useState<any[]>([]);
  const [query,   setQuery]   = useState('');
  const [user,    setUser]    = useState<{ name?: string; username?: string; role?: string; hospital?: unknown } | null>(null);
  const [loading, setLoading] = useState(true);
  const [navBusy, setNavBusy] = useState<'patient' | null>(null);
  // A hospital still lands here: app launch boots into this tab (app/index.tsx),
  // and Android back from its dashboard pops to whatever patient screen it
  // logged in from. It is redirected to its own Dashboard | Scanner bar below,
  // once `user` is read (re-read on focus, so never stale after a login).
  // The booking routes are also unregistered for it in app/(patient)/_layout.tsx,
  // and the booking controls below stay hidden for it as a second line, in
  // case the redirect ever doesn't fire.
  const isHospital = user?.role === 'hospital';
  // Same test the dashboard applies (dashboard.tsx: role AND user.hospital).
  // A hospital login whose hospital object failed to attach (the backend does
  // it best-effort) would bounce dashboard -> login -> dashboard forever, so it
  // stays here instead, where Profile -> Logout still gets it out.
  const opensDashboard = isHospital && !!user?.hospital;
  const [langOpen, setLangOpen] = useState(false);
  const [pickedCity, setPickedCity] = useState<string | null>(null);   // the city whose question is open
  // The Appointment Pass offer + whatever this patient already holds.
  const [passData, setPassData] = useState<any>(null);

  // Which user id this device was last registered for. A ref, not state: it
  // must not trigger a render, and it must survive re-renders of this screen.
  const registeredFor = useRef<string | null>(null);

  // Re-registering is keyed on WHO is signed in, and checked on every focus.
  //
  // This screen is the patient Home tab, so its instance is never unmounted —
  // a `[]` effect runs exactly once per app session. That meant a logout
  // followed by a login as a different account never re-registered the push
  // token: the DeviceToken row still pointed at the PREVIOUS user, and the new
  // one silently received no push at all. Confirmed in the Railway log on
  // 2026-08-17 — "device registered for user 21", then "Booking 21 created for
  // user 4", then "[push] no registered devices".
  //
  // The backend is an idempotent update_or_create on (expo_token, role), so a
  // repeat call is cheap and self-healing; the ref just avoids a POST on every
  // single focus.
  useFocusEffect(useCallback(() => {
    getUser().then((u) => {
      setUser(u);
      if (!(u?.role === 'patient' || (u && u.role == null))) return;
      const id = String(u?.id ?? u?.mobile ?? u?.username ?? '');
      if (!id || registeredFor.current === id) return;
      registeredFor.current = id;
      registerPushToken('patient');
    });
  }, []));

  // /payment/pass/ is AllowAny on the backend now (web PR #68, so the offer
  // can be advertised pre-login) — an anonymous call gets the real `enabled`
  // + price/bookings/days with `pass: null`, never a 401, so there's no more
  // refresh-retry trap to dodge by gating on `user`. Still keyed on `[user]`
  // so logging in refetches and picks up whatever pass this patient actually
  // holds — api.ts only attaches a token when one exists in storage, public
  // route or not, so an authenticated call is unaffected. A failure of any
  // kind (old backend with no endpoint, offline, feature off) simply means
  // no pass block, same as before.
  useEffect(() => {
    let cancelled = false;
    API.get('/payment/pass/')
      .then(({ data }) => { if (!cancelled) setPassData(data); })
      .catch(() => { if (!cancelled) setPassData(null); });
    return () => { cancelled = true; };
  }, [user]);

  // On focus until it has loaded once: a failed first fetch (offline at launch)
  // is retried when the patient comes back to Home, not left empty for the session.
  const doctorsLoaded = useRef(false);
  useFocusEffect(useCallback(() => {
    if (doctorsLoaded.current) return;
    API.get('/doctors/')
      .then(({ data }) => {
        doctorsLoaded.current = true;
        // Backend returns a DRF-paginated object { count, results: [...] };
        // older versions returned a plain array — handle both.
        const list = Array.isArray(data) ? data : (data.results || []);
        // Hide test/demo hospitals from the patient app.
        setAllDoctors(list.filter((d: any) => !isTestHospital(d.hospital_name)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  const { cities, hospitals } = useMemo(() => summariseDoctors(allDoctors), [allDoctors]);
  const doctors = useMemo(() => featuredDoctors(allDoctors, MAX_DOCTORS), [allDoctors]);

  // `q` is the doctors tab's search box: a city, a hospital or a specialty all
  // match the doctor's searchable text there.
  // Always the same params (empty q, a fresh ts): the Doctors tab stays mounted,
  // so a bare push would leave the previous search and centre tab in place.
  const openDoctors = (q?: string) =>
    router.push({ pathname: '/(patient)/doctors', params: { q: q ?? '', kind: 'doctors', ts: String(Date.now()) } });

  // Only render the pass when the server says it is on sale. `credits` is what
  // the patient is holding right now; when they hold one we show that instead
  // of the sales pitch.
  const passOn   = !!passData?.enabled;
  const credits  = passData?.pass?.remaining || 0;
  const passSave = passOn
    ? money(Number(SERVICE_BILL.final_amount) * passData.bookings - Number(passData.price))
    : '0';
  const passExpiry = passData?.pass?.expires_at
    ? new Date(passData.pass.expires_at).toLocaleDateString('en-IN',
        { day: 'numeric', month: 'short' })
    : '';

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

  // replace(), so this patient screen leaves the history and back from the
  // Dashboard can't return to it.
  // ponytail: a hospital sees this screen for one AsyncStorage read on cold
  // start. Decide in app/index.tsx before routing if that flash ever matters.
  if (opensDashboard) return <Redirect href="/(hospital)/dashboard" />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LanguageModal visible={langOpen} onClose={() => setLangOpen(false)} />
      <CityIntentModal
        city={pickedCity}
        onClose={() => setPickedCity(null)}
        onPick={(intent) => {
          if (pickedCity) router.push(cityIntentRoute(intent, pickedCity));
          setPickedCity(null);
        }}
      />
      <ScrollView style={styles.root} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Navbar ── */}
        <View style={styles.navbar}>
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>TW</Text>
            </View>
            <Text style={styles.brandName} numberOfLines={1}>
              <Text style={styles.accent}>Token</Text>walla
            </Text>
          </View>

          <View style={styles.navRight}>
            {/* Language switcher */}
            <TouchableOpacity style={styles.langBtn} onPress={() => setLangOpen(true)}>
              <Ionicons name="globe-outline" size={14} color={Colors.blue700} />
              <Text style={styles.langBtnText}>{lang.toUpperCase()}</Text>
            </TouchableOpacity>

            {user ? (
              <>
                <NotificationBell audience="patient" />
                <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/(patient)/profile')}>
                  <Text style={styles.avatarText}>
                    {(user.name || user.username || 'U').slice(0, 2).toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </>
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

          {!isHospital && (
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color={Colors.gray400} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t('search_placeholder')}
                placeholderTextColor={Colors.gray400}
                returnKeyType="search"
                onSubmitEditing={() => openDoctors(query.trim())}
                accessibilityLabel={t('search_placeholder')}
              />
              <TouchableOpacity
                style={styles.searchBtn}
                onPress={() => openDoctors(query.trim())}
                accessibilityRole="button"
                accessibilityLabel={t('find_doctors')}
              >
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>
            </View>
          )}

          {/* The city buttons: one per city that has doctors, so a new city
              appears with no code change. */}
          {!isHospital && (loading || cities.length > 0) && (
            <View style={styles.cityBlock}>
              <View style={styles.cityLabelRow}>
                <Ionicons name="location" size={13} color={Colors.blue600} />
                <Text style={styles.cityLabel}>{t('choose_your_city')}</Text>
              </View>
              {loading && <View style={[styles.cityBtn, styles.skel]} />}
              {cities.slice(0, MAX_CITIES).map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={styles.cityBtn}
                  activeOpacity={0.8}
                  onPress={() => setPickedCity(c.name)}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                >
                  <View style={styles.cityPin}>
                    <Ionicons name="location" size={20} color={Colors.white} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cityName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.cityMeta} numberOfLines={1}>
                      {t('home_doctors_count', { count: c.doctors })} · {t('home_hospitals_count', { count: c.hospitals })}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={18} color={Colors.blue600} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!isHospital && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => openDoctors()}>
              <Text style={styles.primaryBtnText}>{t('book_appointment')}</Text>
            </TouchableOpacity>
          )}

          {!isHospital && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(patient)/hospitals')}>
              <Ionicons name="business-outline" size={17} color={Colors.blue600} />
              <Text style={styles.secondaryBtnText}>{t('stat_hospitals')}</Text>
            </TouchableOpacity>
          )}

          {!isHospital && (
            <View style={styles.trustRow}>
              {TRUST.map((k) => (
                <View key={k} style={styles.trustItem}>
                  <Ionicons name="checkmark" size={14} color={Colors.successText} />
                  <Text style={styles.trustText}>{t(k)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Browse by specialty ── */}
        {!isHospital && (
        <View style={styles.specSection}>
          <Text style={styles.specLabel}>{t('browse_by_specialty')}</Text>
          <View style={styles.specGrid}>
            {SPECIALTIES.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={styles.specTile}
                activeOpacity={0.7}
                onPress={() => openDoctors(s.key)}
              >
                <View style={styles.specIconBox}>
                  <Ionicons name={s.icon} size={20} color={Colors.blue600} />
                </View>
                <Text style={styles.specTileText} numberOfLines={2}>{t(`spec_${s.key}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        )}

        {/* ── Hospitals ── */}
        {!isHospital && !loading && hospitals.length > 0 && (
          <View style={[styles.section, styles.sectionAlt]}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{t('hospitals_heading')}</Text>
              <TouchableOpacity onPress={() => router.push('/(patient)/hospitals')}>
                <Text style={styles.viewAll}>{t('view_all')}</Text>
              </TouchableOpacity>
            </View>
            {hospitals.slice(0, MAX_HOSPITALS).map((h) => (
              <TouchableOpacity
                key={String(h.id)}
                style={styles.hospCard}
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: '/(patient)/hospital/[id]', params: { id: h.id } })}
              >
                <View style={styles.hospIcon}>
                  <Ionicons name="business-outline" size={22} color={Colors.blue600} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.hospName} numberOfLines={1}>{h.name}</Text>
                  <Text style={styles.hospMeta} numberOfLines={1}>
                    {[h.city, t('home_doctors_count', { count: h.doctors })].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Doctor Cards ── */}
        {!isHospital && !loading && doctors.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{t('doctors_near_you')}</Text>
              <TouchableOpacity onPress={() => openDoctors()}>
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
                      <Image
                        source={{ uri: doc.image }}
                        style={styles.docImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={180}
                      />
                    ) : (
                      <View style={styles.docInitials}>
                        <Text style={styles.docInitialsText}>{initials(doc.name)}</Text>
                      </View>
                    )}
                    <View style={[styles.availBadge, { backgroundColor: doc.available ? Colors.successBg : Colors.errorBg }]}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: doc.available ? Colors.successText : Colors.errorText }}>
                        {doc.available ? t('available') : t('busy')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.docInfo}>
                    <Text style={styles.docSpec} numberOfLines={1}>{doc.specialization}</Text>
                    <Text style={styles.docName} numberOfLines={1}>{providerLabel(doc.name)}</Text>
                    <View style={styles.docMetaRow}>
                      <Ionicons name="location-outline" size={12} color={Colors.gray400} />
                      <Text style={styles.docMeta} numberOfLines={1}>{doc.city} · {doc.experience}y exp</Text>
                    </View>
                    {/* The doctor's consultation fee. The ₹20 queue plan is
                        retired — checkout prices the bill server-side. */}
                    <Text style={styles.docFee}>₹{doc.fee ?? 0} {t('per_visit')}</Text>
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

        {/* ── How it works: four titles, no paragraphs ── */}
        {!isHospital && (
          <View style={styles.stepsRow}>
            {STEPS.map((step, i) => (
              <View key={step.titleKey} style={styles.stepChip}>
                <View style={styles.stepIconBox}>
                  <Ionicons name={step.icon} size={17} color={Colors.blue600} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.stepNum}>0{i + 1}</Text>
                  <Text style={styles.stepTitle} numberOfLines={2}>{t(step.titleKey)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Fee card ── */}
        {!isHospital && (
        <View style={styles.section}>
          <View style={styles.priceCard}>
            <Text style={styles.pricePlan}>{t('queue_view')}</Text>
            <View style={styles.priceAmtRow}>
              <Text style={styles.priceCur}>₹</Text>
              <Text style={styles.priceAmt}>{money(SERVICE_BILL.final_amount)}</Text>
            </View>
            <Text style={styles.priceSub}>{t('per_appointment')}</Text>

            {/* The itemised bill, straight from utils/fees.ts — the same
                mirror checkout falls back to. The card used to advertise a
                flat ₹20, which was the platform fee alone. */}
            <View style={styles.priceBreakdown}>
              {([
                [t('price_platform'), SERVICE_BILL.platform_fee],
                [t('price_gateway'),  SERVICE_BILL.gateway_fee ],
                [t('price_gst'),      SERVICE_BILL.gst_amount  ],
              ] as const).map(([label, amt]) => (
                <View key={label} style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>{label}</Text>
                  <Text style={styles.priceRowValue}>₹{money(amt)}</Text>
                </View>
              ))}
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>{t('price_total')}</Text>
                <Text style={styles.priceTotalValue}>₹{money(SERVICE_BILL.final_amount)}</Text>
              </View>
            </View>

            <Text style={styles.priceNote}>{t('price_clinic_note')}</Text>

            {/* The Appointment Pass, priced by the same server call checkout
                uses — never hard-coded here. Only shown to a signed-in patient
                (see the fetch above); a visitor sees the single-visit price
                alone, which is what they are about to pay anyway. */}
            {passOn && (
              <>
                <View style={styles.priceOrRow}>
                  <View style={styles.priceOrLine} />
                  <Text style={styles.priceOrText}>{t('price_or')}</Text>
                  <View style={styles.priceOrLine} />
                </View>

                <View style={styles.passRow}>
                  <View style={styles.passIcon}>
                    <Ionicons name="ticket-outline" size={17} color={Colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.passName}>{t('pay_appointment_pass')}</Text>
                    <Text style={styles.passTerms}>
                      {credits > 0
                        ? t('price_pass_held', { count: credits, date: passExpiry })
                        : t('price_pass_offer', {
                            visits: passData.bookings,
                            days:   passData.days,
                            save:   passSave,
                          })}
                    </Text>
                  </View>
                  {credits === 0 && (
                    <Text style={styles.passPrice}>₹{money(passData.price)}</Text>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
        )}

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
  navbar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.white },
  // flexShrink: on a 320px phone the name gives way instead of running under EN.
  brand:      { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, marginRight: 6 },
  logoBox:    { width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  logoText:   { color: Colors.white, fontWeight: '800', fontSize: 12 },
  brandName:  { fontSize: 17, fontWeight: '800', color: Colors.gray900, flexShrink: 1 },
  accent:     { color: Colors.blue600 },
  navRight:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  langBtnText:{ fontSize: 12, fontWeight: '700', color: Colors.blue700 },
  loginBtn:   { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, minWidth: 76, alignItems: 'center', justifyContent: 'center' },
  loginBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  avatarBtn:  { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontWeight: '800', fontSize: 12 },

  // Hero
  hero:       { padding: 24, paddingTop: 28, backgroundColor: Colors.bg },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 16 },
  badgeDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.successText },
  badgeText:  { fontSize: 12, color: Colors.blue700, fontWeight: '600' },
  heroTitle:  { fontSize: 32, fontWeight: '800', color: Colors.gray900, lineHeight: 40, marginBottom: 12 },
  heroSub:    { fontSize: 15, color: Colors.gray500, lineHeight: 24, marginBottom: 20 },
  primaryBtn: { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginBottom: 10, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 13, paddingVertical: 14, marginBottom: 16 },
  secondaryBtnText: { color: Colors.blue600, fontWeight: '700', fontSize: 15 },

  // Search
  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, marginBottom: 20, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.gray900, paddingVertical: 8, minWidth: 0 },
  searchBtn:   { width: 40, height: 40, borderRadius: 11, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },

  // City buttons
  cityBlock:    { marginBottom: 16 },
  cityLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cityLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: Colors.gray500, textTransform: 'uppercase' },
  cityBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, padding: 12, marginBottom: 10, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 9, elevation: 3 },
  cityPin:      { width: 46, height: 46, borderRadius: 13, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  cityName:     { fontSize: 18, fontWeight: '800', color: Colors.gray900 },
  cityMeta:     { fontSize: 12.5, color: Colors.gray500, marginTop: 2 },
  skel:         { backgroundColor: Colors.gray100, borderColor: Colors.gray100, shadowOpacity: 0, elevation: 0 },

  // Trust row
  trustRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, columnGap: 16 },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trustText: { fontSize: 12.5, color: Colors.gray500 },

  // Browse by specialty
  specSection: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 26, backgroundColor: Colors.white },
  specLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: Colors.gray400, textTransform: 'uppercase', marginBottom: 14 },
  specGrid:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  specTile:    { width: '23.5%', minHeight: 88, alignItems: 'center', gap: 7, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 3 },
  specIconBox: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  specTileText: { fontSize: 11.5, fontWeight: '600', color: Colors.gray900, textAlign: 'center' },

  // Section
  section:      { padding: 24 },
  sectionAlt:   { backgroundColor: Colors.gray50, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.blue50 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginBottom: 6 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.gray900, flexShrink: 1 },
  viewAll:      { fontSize: 13, color: Colors.blue600, fontWeight: '600' },

  // Hospital cards
  hospCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 14, marginBottom: 10 },
  hospIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  hospName: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  hospMeta: { fontSize: 12.5, color: Colors.gray500, marginTop: 3 },

  // Steps
  stepsRow:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, paddingHorizontal: 24, paddingVertical: 22, backgroundColor: Colors.gray50, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.blue50 },
  stepChip:    { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 13, padding: 12 },
  stepNum:     { fontSize: 10.5, fontWeight: '700', letterSpacing: 1, color: Colors.blue400 },
  stepIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  stepTitle:   { fontSize: 13, fontWeight: '700', color: Colors.gray900 },

  // Doctor cards
  docCard:   { width: 162, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, marginRight: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  docImgBox: { height: 110, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  docImg:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  docInitials: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.blue100, alignItems: 'center', justifyContent: 'center' },
  docInitialsText: { fontSize: 18, fontWeight: '800', color: Colors.blue600 },
  availBadge: { position: 'absolute', top: 8, right: 8, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  docInfo:   { padding: 12 },
  docSpec:   { fontSize: 9, fontWeight: '700', color: Colors.blue600, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  docName:   { fontSize: 13, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
  docMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  docMeta:   { fontSize: 11, color: Colors.gray400, flexShrink: 1 },
  docFee:    { fontSize: 12, fontWeight: '700', color: Colors.blue600 },

  // Fee card
  priceCard:    { backgroundColor: Colors.blue600, borderRadius: 22, padding: 26, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 },
  pricePlan:    { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 8 },
  priceAmtRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  priceCur:     { fontSize: 22, fontWeight: '700', color: Colors.white, marginTop: 6 },
  priceAmt:     { fontSize: 46, fontWeight: '800', color: Colors.white, lineHeight: 52, fontVariant: ['tabular-nums'] },
  priceSub:     { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
  priceBreakdown:  { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14, padding: 16, marginBottom: 14 },
  priceRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  priceRowLabel:   { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  priceRowValue:   { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)', fontVariant: ['tabular-nums'] },
  priceDivider:    { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 11, marginTop: 2 },
  priceTotalLabel: { fontSize: 14, fontWeight: '700', color: Colors.white },
  priceTotalValue: { fontSize: 16, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  priceNote:       { fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 18 },
  priceOrRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 14 },
  priceOrLine:     { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  priceOrText:     { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.2 },
  passRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 14 },
  passIcon:        { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  passName:        { fontSize: 14, fontWeight: '700', color: Colors.white },
  passTerms:       { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  passPrice:       { fontSize: 16, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },

  // Footer
  footer:    { padding: 24, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.blue50 },
  footerText: { fontSize: 12, color: Colors.gray400, marginBottom: 4 },
  footerSub:  { fontSize: 11, color: Colors.gray400 },
});
