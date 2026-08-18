import { useLocalSearchParams, useRouter } from 'expo-router';
import { ComponentProps, ReactNode, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { isTestHospital } from '../../../constants/config';
import API from '../../../services/api';
import {
  directionsUrl,
  getNext7Days,
  isOpenNow,
  isSlotTooSoon,
} from '../../../utils/booking';
import { computeFeeBreakdown, money, type FeeBreakdown } from '../../../utils/fees';
import { safeBack } from '../../../utils/navigation';
import { useAndroidBack } from '../../../hooks/useAndroidBack';
import { useCurrentUser } from '../../../hooks/useCurrentUser';

interface SlotInfo { booked: number; max: number; full: boolean; }
interface GalleryPhoto { id: number | string; url: string; }

interface Hospital {
  name?: string; city?: string; image?: string; logo?: string;
  mobile?: string; landline?: string; location?: string;
  instagram?: string; youtube?: string; facebook?: string;
  open_time?: string; close_time?: string;
  announcement?: string; announcement_until?: string | null;
  announcement_active?: boolean; description?: string;
  services?: string[]; gallery?: GalleryPhoto[];
}

interface Doctor {
  id: number | string; name: string;
  specialization?: string; city?: string; experience?: number;
  available?: boolean; hospital?: number | string;
  hospital_name?: string; hospital_image?: string; image?: string;
  mobile?: string; landline?: string; fee?: number;
  slots?: string[]; days?: string[]; max_per_slot?: number;
  // Server-computed patient bill (payments/fees.py). SERVICE_ONLY doctors
  // collect the consultation fee at the clinic, so it isn't part of the
  // online total — see offline_doctor_fee.
  fee_breakdown?: FeeBreakdown;
  payment_collection_mode?: string;
}

// The next 7 days, computed once at module load (the date/slot/open-hours
// helpers now live in utils/booking.ts and are unit-tested there).
const DAYS = getNext7Days();

// The full fee (doctor fee + platform + gateway + GST) is computed server-side
// at checkout from the doctor's consultation fee. This is just the plan label.
const PLAN = { name: 'Queue View', desc: 'Token + live queue position tracking' };

// Official brand logos (simple-icons paths) so the share menu shows real
// WhatsApp/Facebook/Instagram marks instead of look-alike emoji.
const WhatsAppLogo = ({ size = 26 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </Svg>
);
const FacebookLogo = ({ size = 26 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </Svg>
);
const InstagramLogo = ({ size = 26 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs>
      <LinearGradient id="igGrad" x1="0" y1="1" x2="1" y2="0">
        <Stop offset="0" stopColor="#FEDA75" />
        <Stop offset="0.25" stopColor="#FA7E1E" />
        <Stop offset="0.5" stopColor="#D62976" />
        <Stop offset="0.75" stopColor="#962FBF" />
        <Stop offset="1" stopColor="#4F5BD5" />
      </LinearGradient>
    </Defs>
    <Path fill="url(#igGrad)" d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
  </Svg>
);
const LinkLogo = ({ size = 24 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill="none" stroke="#185FA5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <Path fill="none" stroke="#185FA5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </Svg>
);

// Doctors whose view we have already counted this app session. The website
// uses sessionStorage for the same job; React Native has no such thing, and a
// module-level Set has exactly the lifetime we want — survives navigation,
// clears on restart.
const countedViews = new Set<string>();

// Section heading with a leading icon. Five sections use this shape, so the
// row markup lives here rather than being repeated (and drifting) at each one.
const BlockTitle = ({ icon, children }: {
  icon: ComponentProps<typeof Ionicons>['name'];
  children: ReactNode;
}) => (
  <View style={styles.blockTitleRow}>
    <Ionicons name={icon} size={16} color={Colors.blue600} />
    <Text style={[styles.blockTitle, { marginBottom: 0 }]}>{children}</Text>
  </View>
);

export default function DoctorDetails() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  useAndroidBack(() => safeBack(router, '/(patient)/doctors'));

  const [doctor,       setDoctor]       = useState<Doctor | null>(null);
  const [hospitalInfo, setHospitalInfo] = useState<Hospital | null>(null);
  const [loading,      setLoading]      = useState(true);
  const { user } = useCurrentUser();
  const [slotAvail,    setSlotAvail]    = useState<Record<string, SlotInfo>>({}); // { "09:00 AM": { booked, max, full } }
  const [availLoading, setAvailLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(DAYS[0].full);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [shareOpen,    setShareOpen]    = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Drop the previous doctor's data before fetching the new one. This screen
    // is a Tabs.Screen (`href: null` in the patient _layout), so the navigator
    // keeps ONE instance alive — picking a second doctor changes `id` on the
    // component that is already mounted rather than remounting it. Without
    // this reset, `loading` is still false and `doctor` still holds the last
    // one, so their photo, name and fee stay on screen until the fetch lands.
    // Same reason and same shape as the fee reset in payment.tsx.
    setLoading(true);
    setDoctor(null);
    setHospitalInfo(null);
    setSlotAvail({});
    setSelectedSlot('');

    API.get(`/doctors/${id}/`)
      .then(({ data }) => {
        if (cancelled) return;
        // A test-hospital doctor reached by deep link or a shared link. The
        // doctors list already hides these, but nothing stopped someone
        // landing here directly — and the only row in the system with
        // payment_collection_mode='FULL' lives behind a test hospital, so this
        // screen would have offered to charge the full consultation fee for an
        // appointment that does not exist. Treat it exactly like a missing
        // doctor. Mirrors the web's DoctorsDetails.js guard.
        if (isTestHospital(data?.hospital_name)) {
          safeBack(router, '/(patient)/doctors');
          return;
        }
        setDoctor(data);
        // Count the view once per app session. Without the guard, navigating
        // back and forth inflates the count and the ranking rewards whoever
        // taps around most rather than what patients actually choose.
        // Fire-and-forget — a failed count must never affect the screen.
        if (!countedViews.has(String(id))) {
          countedViews.add(String(id));
          API.post(`/doctors/${id}/view/`).catch(() => {});
        }
        // Fetch the hospital for contact number, social links & services.
        if (data?.hospital) {
          API.get(`/hospitals/${data.hospital}/`)
            .then(({ data: h }) => { if (!cancelled) setHospitalInfo(h); })
            .catch(() => {});
        }
      })
      .catch(() => { if (!cancelled) safeBack(router, '/(patient)/doctors'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    // Tapping through doctors quickly leaves earlier requests in flight; without
    // this, a slow response for the doctor you left could land last and overwrite
    // the one you are actually looking at.
    return () => { cancelled = true; };
  }, [id]);

  // Fetch slot availability whenever doctor or date changes
  const fetchAvailability = useCallback(async (doctorId: number | string, date: string) => {
    setAvailLoading(true);
    try {
      const { data } = await API.get(`/doctors/${doctorId}/slot-availability/?date=${date}`);
      setSlotAvail(data);
    } catch {
      setSlotAvail({});
    } finally {
      setAvailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!doctor) return;
    fetchAvailability(doctor.id, selectedDate);
  }, [doctor, selectedDate, fetchAvailability]);

  // Restrict the calendar to the doctor's working days. If today isn't one,
  // jump the selection to the first upcoming working day.
  useEffect(() => {
    const wd = doctor?.days;
    if (!Array.isArray(wd) || wd.length === 0) return; // no days set → allow all
    const cur = DAYS.find(d => d.full === selectedDate);
    if (cur && !wd.includes(cur.dayKey)) {
      const firstAvail = DAYS.find(d => wd.includes(d.dayKey));
      if (firstAvail) { setSelectedDate(firstAvail.full); setSelectedSlot(''); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor]);

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot('');
  };

  const handleSlotPress = (slot: string) => {
    const info = slotAvail[slot];
    if (info?.full) return; // fully booked — ignore tap
    if (isSlotTooSoon(selectedDate, slot)) return; // too soon / past — ignore tap
    setSelectedSlot(slot);
  };

  const handleBook = () => {
    if (!doctor) return;
    if (!user) { router.push('/(auth)/login'); return; }
    if (!selectedSlot) { Alert.alert('Select Slot', 'Please select a time slot first'); return; }
    if (!doctor.available) { Alert.alert('Unavailable', 'This doctor is currently unavailable'); return; }
    // Guard: slot may have filled up since page load
    if (slotAvail[selectedSlot]?.full) {
      Alert.alert('Slot Full', 'This slot just filled up. Please choose another slot.');
      setSelectedSlot('');
      return;
    }
    // Guard: slot must be at least 2.1 hours away (also covers slots that
    // lapsed while the page was open).
    if (isSlotTooSoon(selectedDate, selectedSlot)) {
      Alert.alert('Too Soon', 'Please pick a slot at least 2 hours from now so you have time to reach the hospital.');
      setSelectedSlot('');
      return;
    }
    router.push({
      pathname: '/(patient)/payment',
      params: {
        doctorId:     doctor.id,
        doctorName:   doctor.name,
        // Landline-only clinics exist — send whichever number they can be reached on.
        doctorMobile: doctor.mobile || doctor.landline,
        hospital:     doctor.hospital_name,
        date:         selectedDate,
        slot:         selectedSlot,
        // No fee params: checkout fetches the server's fee_breakdown for this
        // doctor, and the order is priced server-side from doctorId alone.
      },
    });
  };

  // We share the public website URL (not the tokenwalla:// deep link) so anyone
  // — even without the app — can open it and book. The website has the same
  // doctor page at /doctor/:id.
  const buildShare = () => {
    const url  = `https://www.tokenwalla.com/doctor/${doctor!.id}`;
    const text = [
      `👨‍⚕️ Dr. ${doctor!.name}`,
      doctor!.specialization ? `🩺 ${doctor!.specialization}` : null,
      doctor!.hospital_name  ? `🏥 ${doctor!.hospital_name}`  : null,
      doctor!.city           ? `📍 ${doctor!.city}`           : null,
      '',
      'Book your token on Tokenwalla 👉',
    ].filter(Boolean).join('\n');
    return { url, text, full: `${text} ${url}` };
  };

  const shareTo = async (target: 'whatsapp' | 'facebook' | 'instagram') => {
    if (!doctor) return;
    const { url, full } = buildShare();
    setShareOpen(false);
    try {
      if (target === 'whatsapp') {
        await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(full)}`);
      } else if (target === 'facebook') {
        await Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
      } else {
        // Instagram has no share-a-link URL — copy the link and open the app so
        // the user can paste it into a story or DM.
        await Clipboard.setStringAsync(full);
        Alert.alert('Link copied', 'Paste it into your Instagram story or DM to share.');
        await Linking.openURL('instagram://app').catch(() =>
          Linking.openURL('https://www.instagram.com/'));
      }
    } catch {
      Alert.alert('Not available', `Couldn't open ${target}. Is it installed?`);
    }
  };

  const copyShareLink = async () => {
    if (!doctor) return;
    const { full } = buildShare();
    await Clipboard.setStringAsync(full);
    setShareOpen(false);
    Alert.alert('Link copied', 'Share it anywhere so others can book this doctor.');
  };

  // ── slot state helpers ──────────────────────────────────────────────────
  const slotState = (slot: string) => {
    if (slot === selectedSlot) return 'selected';
    if (isSlotTooSoon(selectedDate, slot)) return 'past';
    const info = slotAvail[slot];
    if (!info) return 'available';
    if (info.full) return 'full';
    if (info.booked > 0) return 'partial';
    return 'available';
  };

  const slotSubtext = (slot: string) => {
    if (slot !== selectedSlot && isSlotTooSoon(selectedDate, slot)) return 'Too soon';
    const info = slotAvail[slot];
    if (!info || info.booked === 0) return null;
    if (info.full) return 'Full';
    return `${info.max - info.booked} left`;
  };

  const slotFillPct = (slot: string) => {
    const info = slotAvail[slot];
    if (!info || info.max === 0) return 0;
    return Math.min(1, info.booked / info.max);
  };

  // ── derived ──────────────────────────────────────────────────────────
  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
      <ActivityIndicator size="large" color={Colors.blue600} />
    </View>
  );
  if (!doctor) return null;

  const slots     = doctor.slots || [];
  const am        = slots.filter(s => s.includes('AM'));
  const pm        = slots.filter(s => s.includes('PM'));
  const dateLabel = DAYS.find(d => d.full === selectedDate);
  // Server-priced bill; the local mirror only covers backends that predate
  // fee_breakdown. Checkout re-fetches it and the order is priced server-side.
  const fees      = doctor.fee_breakdown
    || computeFeeBreakdown(doctor.fee ?? 0, doctor.payment_collection_mode);
  const atClinic  = Number(fees.offline_doctor_fee) > 0;
  const isBookable = selectedSlot && doctor.available &&
    !slotAvail[selectedSlot]?.full && !isSlotTooSoon(selectedDate, selectedSlot);

  // The sticky CTA's icon + label together, so the two can never disagree about
  // which state the button is in. `icon: null` means text alone.
  const cta: { icon: ComponentProps<typeof Ionicons>['name'] | null; label: string } =
    !doctor.available            ? { icon: 'close-circle-outline', label: 'Doctor Unavailable' }
    : !selectedSlot              ? { icon: null, label: 'Select a Slot First' }
    : slotAvail[selectedSlot]?.full ? { icon: 'close-circle-outline', label: 'Slot is Full' }
    : user                       ? { icon: 'card-outline', label: `Pay ₹${money(fees.final_amount)} & Book Appointment` }
    :                              { icon: 'lock-closed-outline', label: 'Login to Book' };

  // Walk-in: the hospital publishes no slot times, so there is nothing to book
  // online. We still list the doctor — patients get the hours, the days and a
  // number to call. Landline first: a clinic that has one usually wants calls
  // on it rather than on a personal mobile.
  const walkIn     = slots.length === 0;
  const callNumber = hospitalInfo?.landline || doctor.landline
                  || hospitalInfo?.mobile   || doctor.mobile || '';

  const hasHospitalImage = doctor.hospital_image &&
    !doctor.hospital_image.includes('placehold') &&
    doctor.hospital_image.startsWith('http');

  const hasDoctorImage = doctor.image &&
    !doctor.image.includes('placehold') &&
    doctor.image.startsWith('http');

  // ── slot renderer ──────────────────────────────────────────────────────
  const renderSlot = (s: string) => {
    const state   = slotState(s);
    const sub     = slotSubtext(s);
    const fillPct = slotFillPct(s);

    const isDisabled = state === 'full' || state === 'past';
    const containerStyle = [
      styles.slotBtn,
      state === 'selected' && styles.slotSelected,
      state === 'partial'  && styles.slotPartial,
      (state === 'full' || state === 'past') && styles.slotFull,
    ];

    return (
      <TouchableOpacity
        key={s}
        style={containerStyle}
        onPress={() => handleSlotPress(s)}
        activeOpacity={isDisabled ? 1 : 0.7}
        disabled={isDisabled}
      >
        {/* "FULL" badge top-right */}
        {state === 'full' && (
          <View style={styles.slotFullBadge}>
            <Text style={styles.slotFullBadgeText}>FULL</Text>
          </View>
        )}

        {/* Time label — strikethrough when full / past */}
        <Text style={[
          styles.slotTime,
          state === 'selected' && styles.slotTimeSelected,
          state === 'partial'  && styles.slotTimePartial,
          isDisabled           && styles.slotTimeFull,
        ]}>
          {s}
        </Text>

        {/* Sub-label: "3 left", "Full", or "Too soon" */}
        {sub && (
          <Text style={[
            styles.slotSub,
            state === 'partial'  && styles.slotSubPartial,
            (state === 'full' || state === 'past') && styles.slotSubFull,
            state === 'selected' && styles.slotSubSelected,
          ]}>
            {sub}
          </Text>
        )}

        {/* Fill bar — shown for partial, selected-with-booked, full */}
        {(state === 'partial' || state === 'full' || (state === 'selected' && fillPct > 0)) && (
          <View style={styles.slotBar}>
            <View style={[
              styles.slotBarFill,
              state === 'partial'  && { backgroundColor: '#F0A030' },
              state === 'full'     && { backgroundColor: '#E2384B' },
              state === 'selected' && { backgroundColor: Colors.blue600 },
              { width: `${Math.round(fillPct * 100)}%` },
            ]} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>

        {/* ── BANNER ── */}
        <View style={styles.banner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => safeBack(router)}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={() => setShareOpen(true)}>
            <Text style={styles.shareText}>↗ Share</Text>
          </TouchableOpacity>
          {(hospitalInfo?.image?.startsWith('http') || hasHospitalImage) ? (
            <Image
              source={{ uri: hospitalInfo?.image?.startsWith('http') ? hospitalInfo.image : doctor.hospital_image }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <Ionicons name="business-outline" size={58} color={Colors.blue200} />
            </View>
          )}
          <View style={styles.bannerOverlay} />
        </View>

        {/* ── PROFILE CARD ── */}
        <View style={styles.profileCard}>
          <View style={styles.cardTopBar} />
          <View style={styles.profileRow}>
            {hasDoctorImage ? (
              <Image source={{ uri: doctor.image }} style={styles.doctorAvatarImg} resizeMode="cover" />
            ) : (
              <View style={styles.doctorAvatarBox}>
                <Ionicons name="medkit-outline" size={32} color={Colors.blue400} />
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.specLabel}>{doctor.specialization}</Text>
              <Text style={styles.doctorName}>Dr. {doctor.name}</Text>
              <View style={styles.pillRow}>
                <View style={styles.pill}>
                  <Ionicons name="location-outline" size={11} color={Colors.blue700} style={styles.pillIcon} />
                  <Text style={styles.pillText}>{doctor.city}</Text>
                </View>
                <View style={styles.pill}>
                  <Ionicons name="time-outline" size={11} color={Colors.blue700} style={styles.pillIcon} />
                  <Text style={styles.pillText}>{doctor.experience} yrs exp</Text>
                </View>
                <View style={[
                  styles.pill,
                  { backgroundColor: doctor.available ? Colors.successBg : Colors.errorBg,
                    borderColor:     doctor.available ? Colors.successBorder : Colors.errorBorder }
                ]}>
                  <View style={{
                    width: 5, height: 5, borderRadius: 3, marginRight: 4,
                    backgroundColor: doctor.available ? Colors.successText : Colors.errorText,
                  }} />
                  <Text style={{
                    fontSize: 11, fontWeight: '700',
                    color: doctor.available ? Colors.successText : Colors.errorText,
                  }}>
                    {doctor.available ? 'Available' : 'Unavailable'}
                  </Text>
                </View>
              </View>
              <View style={styles.hospitalNameRow}>
                <Ionicons name="business-outline" size={13} color={Colors.gray500} />
                <Text style={styles.hospitalName}>{doctor.hospital_name}</Text>
              </View>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { val: `${doctor.experience}+`, lbl: 'Years Exp'    },
              // Slot counts are meaningless for a walk-in doctor — mirrors the
              // website's DoctorsDetails stats row.
              walkIn
                ? { val: 'Walk-in', lbl: 'Visit Type' }
                : { val: slots.length, lbl: 'Daily Slots' },
              walkIn
                ? { val: (doctor.days || []).length || '—', lbl: 'Days Open' }
                : { val: doctor.max_per_slot || 10, lbl: 'Per Slot' },
            ].map(({ val, lbl }, i) => (
              <View key={lbl} style={[styles.statBox, i < 2 && { borderRightWidth: 1, borderRightColor: Colors.blue50 }]}>
                <Text style={styles.statVal}>{val}</Text>
                <Text style={styles.statLbl}>{lbl}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── DOCTOR INFO ── */}
        <View style={styles.block}>
          <BlockTitle icon="person-outline">Doctor Info</BlockTitle>

          {/* Fee */}
          {(doctor.fee ?? 0) > 0 && (
            <View style={styles.infoRow}>
              <View style={styles.infoIconBox}>
                <Ionicons name="cash-outline" size={17} color={Colors.blue600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Consultation Fee</Text>
                <Text style={styles.infoValue}>₹{doctor.fee}</Text>
              </View>
            </View>
          )}

          {/* Hospital */}
          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Ionicons name="business-outline" size={17} color={Colors.blue600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Hospital</Text>
              <Text style={styles.infoValue}>{doctor.hospital_name}</Text>
            </View>
          </View>

          {/* City */}
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoIconBox}>
              <Ionicons name="location-outline" size={17} color={Colors.blue600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>{doctor.city}</Text>
            </View>
          </View>
        </View>

        {/* ── HOSPITAL ANNOUNCEMENT ── */}
        {/* `announcement_active` is computed server-side (expiry date), so an
            old notice stops showing without anyone remembering to delete it.
            Falls back to the raw text if the API predates the flag. */}
        {hospitalInfo?.announcement && hospitalInfo.announcement_active !== false ? (
          <View style={styles.noticeBox}>
            <Ionicons name="megaphone-outline" size={17} color={Colors.warningText} />
            <Text style={styles.noticeText}>{hospitalInfo.announcement}</Text>
          </View>
        ) : null}

        {/* ── HOSPITAL CONTACT & SERVICES ── */}
        {hospitalInfo && (hospitalInfo.mobile || hospitalInfo.location || hospitalInfo.instagram || hospitalInfo.youtube || hospitalInfo.facebook || hospitalInfo.open_time || ((hospitalInfo.services?.length ?? 0) > 0)) && (() => {
          const openNow = isOpenNow(hospitalInfo.open_time, hospitalInfo.close_time);
          return (
          <View style={styles.block}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                {hospitalInfo.logo?.startsWith('http') ? (
                  <Image source={{ uri: hospitalInfo.logo }} style={styles.hospLogo} resizeMode="cover" />
                ) : null}
                {hospitalInfo.logo?.startsWith('http') ? null : (
                  <Ionicons name="business-outline" size={16} color={Colors.blue600} />
                )}
                <Text style={[styles.blockTitle, { marginBottom: 0 }]}>About the Hospital</Text>
              </View>
              {openNow != null && (
                <View style={[styles.openPill, { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: openNow ? Colors.successBg : Colors.errorBg, borderColor: openNow ? Colors.successBorder : Colors.errorBorder }]}>
                  {/* A filled dot rather than 🟢/🔴 — the same status-dot shape
                      already used on the Available/Unavailable pill above. */}
                  <View style={{
                    width: 6, height: 6, borderRadius: 3,
                    backgroundColor: openNow ? Colors.successText : Colors.errorText,
                  }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: openNow ? Colors.successText : Colors.errorText }}>
                    {openNow ? 'Open now' : 'Closed'}
                  </Text>
                </View>
              )}
            </View>

            {(hospitalInfo.open_time && hospitalInfo.close_time) ? (
              <View style={styles.hoursRow}>
                <Ionicons name="time-outline" size={14} color={Colors.gray600} />
                <Text style={styles.hoursText}>{hospitalInfo.open_time} – {hospitalInfo.close_time}</Text>
              </View>
            ) : null}

            {/* About / description */}
            {hospitalInfo.description ? (
              <Text style={styles.hospDesc}>{hospitalInfo.description}</Text>
            ) : null}

            {/* Directions (call is available after booking, in My Bookings) */}
            <TouchableOpacity style={styles.directionsBtn} onPress={() => Linking.openURL(directionsUrl(hospitalInfo))}>
              <Ionicons name="navigate-outline" size={15} color={Colors.blue700} />
              <Text style={styles.directionsBtnText}>Get Directions</Text>
            </TouchableOpacity>

            {/* Real brand marks, not look-alike emoji — the same SVG logos the
                share sheet already uses, so the two places stay consistent. */}
            {(hospitalInfo.instagram || hospitalInfo.youtube || hospitalInfo.facebook) && (
              <View style={styles.socialRow}>
                {hospitalInfo.instagram ? (
                  <TouchableOpacity style={styles.socialBtn} onPress={() => Linking.openURL(hospitalInfo.instagram!)}>
                    <InstagramLogo size={16} />
                    <Text style={styles.socialBtnText}>Instagram</Text>
                  </TouchableOpacity>
                ) : null}
                {hospitalInfo.youtube ? (
                  <TouchableOpacity style={styles.socialBtn} onPress={() => Linking.openURL(hospitalInfo.youtube!)}>
                    <Ionicons name="logo-youtube" size={16} color="#FF0000" />
                    <Text style={styles.socialBtnText}>YouTube</Text>
                  </TouchableOpacity>
                ) : null}
                {hospitalInfo.facebook ? (
                  <TouchableOpacity style={styles.socialBtn} onPress={() => Linking.openURL(hospitalInfo.facebook!)}>
                    <FacebookLogo size={16} />
                    <Text style={styles.socialBtnText}>Facebook</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Services */}
            {hospitalInfo.services && hospitalInfo.services.length > 0 && (
              <>
                <Text style={styles.servicesLabel}>SERVICES</Text>
                <View style={styles.servicesWrap}>
                  {hospitalInfo.services.map(s => (
                    <View key={s} style={styles.serviceChip}>
                      <Text style={styles.serviceChipText}>{s}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Photo gallery */}
            {hospitalInfo.gallery && hospitalInfo.gallery.length > 0 && (
              <>
                <Text style={styles.servicesLabel}>PHOTOS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {hospitalInfo.gallery.map(p => (
                    <Image key={p.id} source={{ uri: p.url }} style={styles.galleryImg} resizeMode="cover" />
                  ))}
                </ScrollView>
              </>
            )}
          </View>
          );
        })()}

        {/* ── DATE PICKER ── pointless without slots to pick on that date. */}
        {!walkIn && (
        <View style={styles.block}>
          <BlockTitle icon="calendar-outline">Select Date</BlockTitle>
          {doctor.days && doctor.days.length > 0 && (
            <View style={styles.workingDaysRow}>
              <Ionicons name="medkit-outline" size={13} color={Colors.blue600} />
              <Text style={styles.workingDaysNote}>Works on: {doctor.days.join(', ')}</Text>
            </View>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {DAYS.map(day => {
              const isWorking = !doctor.days?.length || doctor.days.includes(day.dayKey);
              const isActive  = selectedDate === day.full;
              return (
                <TouchableOpacity
                  key={day.full}
                  style={[
                    styles.dateChip,
                    isActive && styles.dateChipActive,
                    !isWorking && styles.dateChipDisabled,
                  ]}
                  onPress={() => handleDateChange(day.full)}
                  disabled={!isWorking}
                >
                  <Text style={[styles.dateDay,   isActive && styles.dateTextActive, !isWorking && styles.dateTextDisabled]}>{day.label}</Text>
                  <Text style={[styles.dateNum,   isActive && styles.dateNumActive,  !isWorking && styles.dateTextDisabled]}>{day.num}</Text>
                  <Text style={[styles.dateMonth, isActive && styles.dateTextActive, !isWorking && styles.dateTextDisabled]}>{day.month}</Text>
                  {!isWorking && <Text style={styles.dayOff}>Off</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        )}

        {/* ── SLOT PICKER ── */}
        <View style={styles.block}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <BlockTitle icon="time-outline">{walkIn ? 'Visiting Hours' : 'Select Time Slot'}</BlockTitle>
            {availLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <ActivityIndicator size="small" color={Colors.blue400} />
                <Text style={{ fontSize: 11, color: Colors.gray400 }}>Checking…</Text>
              </View>
            ) : selectedSlot ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="checkmark-circle" size={15} color={Colors.blue600} />
                <Text style={{ fontSize: 13, color: Colors.blue600, fontWeight: '700' }}>{selectedSlot}</Text>
              </View>
            ) : null}
          </View>

          {/* Legend */}
          {slots.length > 0 && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.blue50, borderColor: Colors.blue600, borderWidth: 1 }]} />
                <Text style={styles.legendText}>Available</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FFF8ED', borderColor: '#F0A030', borderWidth: 1 }]} />
                <Text style={styles.legendText}>Filling up</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.gray100, borderColor: Colors.gray200, borderWidth: 1 }]} />
                <Text style={styles.legendText}>Full</Text>
              </View>
            </View>
          )}

          {walkIn ? (
            <View>
              <Text style={styles.walkInLead}>
                This doctor sees patients on a walk-in basis — there are no fixed
                appointment times to book online.
              </Text>
              {(hospitalInfo?.open_time || hospitalInfo?.close_time) ? (
                <View style={styles.walkInRow}>
                  <View style={styles.walkInKeyRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.gray600} />
                    <Text style={styles.walkInKey}>Hospital hours</Text>
                  </View>
                  <Text style={styles.walkInVal}>
                    {hospitalInfo?.open_time || '—'} – {hospitalInfo?.close_time || '—'}
                  </Text>
                </View>
              ) : null}
              {doctor.days && doctor.days.length > 0 ? (
                <View style={styles.walkInRow}>
                  <View style={styles.walkInKeyRow}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.gray600} />
                    <Text style={styles.walkInKey}>Available days</Text>
                  </View>
                  <Text style={styles.walkInVal}>{doctor.days.join(', ')}</Text>
                </View>
              ) : null}
              {callNumber ? (
                <TouchableOpacity
                  style={styles.walkInCall}
                  onPress={() => Linking.openURL(`tel:${callNumber}`)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="call-outline" size={16} color={Colors.white} />
                  <Text style={styles.walkInCallText}>Call {callNumber}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: Colors.gray400, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>
                  Contact the hospital directly to visit.
                </Text>
              )}
            </View>
          ) : (
            <View style={{ opacity: availLoading ? 0.5 : 1 }}>
              {am.length > 0 && (
                <>
                  <View style={styles.slotPeriodRow}>
                    <Ionicons name="sunny-outline" size={13} color={Colors.gray500} />
                    <Text style={styles.slotPeriod}>MORNING</Text>
                  </View>
                  <View style={styles.slotGrid}>
                    {am.map(s => renderSlot(s))}
                  </View>
                </>
              )}
              {pm.length > 0 && (
                <>
                  <View style={[styles.slotPeriodRow, am.length > 0 && { marginTop: 18 }]}>
                    <Ionicons name="partly-sunny-outline" size={13} color={Colors.gray500} />
                    <Text style={styles.slotPeriod}>AFTERNOON / EVENING</Text>
                  </View>
                  <View style={styles.slotGrid}>
                    {pm.map(s => renderSlot(s))}
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* ── BOOKING SUMMARY ── */}
        <View style={styles.block}>
          <BlockTitle icon="receipt-outline">Booking Summary</BlockTitle>

          {[
            { label: 'Doctor',   value: `Dr. ${doctor.name}`                                              },
            { label: 'Hospital', value: doctor.hospital_name                                              },
            walkIn
              ? { label: 'Hours', value: (hospitalInfo?.open_time || hospitalInfo?.close_time)
                  ? `${hospitalInfo?.open_time || '—'} – ${hospitalInfo?.close_time || '—'}` : 'Call to confirm' }
              : { label: 'Date',  value: dateLabel ? `${dateLabel.label}, ${dateLabel.num} ${dateLabel.month}` : '—' },
            walkIn
              ? { label: 'Booking', value: 'Walk-in — no token', dim: true }
              : { label: 'Slot',    value: selectedSlot || 'Not selected yet', dim: !selectedSlot },
          ].map(({ label, value, dim }) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={[styles.summaryValue, dim && styles.summaryValueDim]}>{value}</Text>
            </View>
          ))}

          {/* Plan row */}
          <View style={styles.planRow}>
            <View style={styles.planInfo}>
              <View style={styles.planNameRow}>
                <Ionicons name="people-outline" size={14} color={Colors.blue700} />
                <Text style={styles.planName}>{PLAN.name}</Text>
              </View>
              <Text style={styles.planDesc}>{PLAN.desc}</Text>
            </View>
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>Popular</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.feeLabelRow}>
              <Text style={styles.summaryLabel}>Consultation fee</Text>
              {atClinic && (
                <View style={styles.clinicTag}>
                  <Text style={styles.clinicTagText}>pay at clinic</Text>
                </View>
              )}
            </View>
            <Text style={styles.summaryValue}>
              ₹{money(atClinic ? fees.offline_doctor_fee : fees.doctor_fee)}
            </Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{walkIn ? 'Payable at Hospital' : 'Payable Now'}</Text>
            <Text style={styles.totalAmount}>
              ₹{money(walkIn ? (doctor.fee ?? 0) : fees.final_amount)}
            </Text>
          </View>
          <Text style={styles.feeNote}>
            {walkIn
              ? 'No online booking for this doctor — pay at the hospital when you visit'
              : atClinic
              ? 'Booking charge only — the consultation fee is paid at the clinic'
              : 'Includes platform fee, payment gateway fee & GST'}
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── STICKY BOOK BUTTON ── */}
      <View style={styles.stickyBar}>
        {/* No token to sell without a slot — the payment path needs one, and
            pretending otherwise would take money for nothing. */}
        {walkIn ? (
          <TouchableOpacity
            style={[styles.bookBtn, !callNumber && styles.bookBtnDisabled]}
            onPress={() => callNumber && Linking.openURL(`tel:${callNumber}`)}
            activeOpacity={0.85}
            disabled={!callNumber}
          >
            {callNumber ? <Ionicons name="call-outline" size={17} color={Colors.white} /> : null}
            <Text style={styles.bookBtnText}>
              {callNumber ? `Call ${callNumber}` : 'Contact the hospital to visit'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.bookBtn, !isBookable && styles.bookBtnDisabled]}
            onPress={handleBook}
            activeOpacity={0.85}
          >
            {cta.icon ? <Ionicons name={cta.icon} size={17} color={Colors.white} /> : null}
            <Text style={styles.bookBtnText}>{cta.label}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.bookNote}>
          {walkIn
            ? 'Walk in during the hospital\u2019s opening hours'
            : 'Secured by Razorpay · Refundable if cancelled 2hrs before slot'}
        </Text>
      </View>

      {/* ── SHARE SHEET ── */}
      <Modal
        visible={shareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShareOpen(false)}
      >
        <TouchableOpacity style={styles.shareBackdrop} activeOpacity={1} onPress={() => setShareOpen(false)}>
          <TouchableOpacity style={styles.shareSheet} activeOpacity={1}>
            <View style={styles.shareHandle} />
            <Text style={styles.shareSheetTitle}>Share this doctor</Text>
            <Text style={styles.shareSheetSub}>So others can book the same appointment</Text>

            <View style={styles.shareOptRow}>
              {[
                { key: 'whatsapp',  logo: <WhatsAppLogo />,  label: 'WhatsApp',  bg: '#E7F9EE', onPress: () => shareTo('whatsapp') },
                { key: 'facebook',  logo: <FacebookLogo />,  label: 'Facebook',  bg: '#E7F0FE', onPress: () => shareTo('facebook') },
                { key: 'instagram', logo: <InstagramLogo />, label: 'Instagram', bg: '#FCE9F1', onPress: () => shareTo('instagram') },
              ].map(opt => (
                <TouchableOpacity key={opt.key} style={styles.shareOpt} onPress={opt.onPress} activeOpacity={0.7}>
                  <View style={[styles.shareOptIcon, { backgroundColor: opt.bg }]}>
                    {opt.logo}
                  </View>
                  <Text style={styles.shareOptLabel}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* The link itself, shown with a Copy button */}
            <View style={styles.shareLinkRow}>
              <View style={styles.shareLinkTextBox}>
                <LinkLogo size={16} />
                <Text style={styles.shareLinkText} numberOfLines={1}>
                  {`tokenwalla.com/doctor/${doctor.id}`}
                </Text>
              </View>
              <TouchableOpacity style={styles.shareLinkCopyBtn} onPress={copyShareLink} activeOpacity={0.8}>
                <Text style={styles.shareLinkCopyText}>Copy</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.shareCancel} onPress={() => setShareOpen(false)}>
              <Text style={styles.shareCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  root: { flex: 1, backgroundColor: '#F4F9FF' },

  // ── Banner ──
  banner:            { height: 200, position: 'relative', overflow: 'hidden', backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  bannerImage:       { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  bannerOverlay:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,44,83,0.2)' },
  bannerPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  backBtn:           { position: 'absolute', top: 14, left: 14, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  backText:          { fontSize: 13, color: Colors.blue600, fontWeight: '600' },
  shareBtn:          { position: 'absolute', top: 14, right: 14, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  shareText:         { fontSize: 13, color: Colors.blue600, fontWeight: '600' },

  // ── Share sheet ──
  shareBackdrop:   { flex: 1, backgroundColor: 'rgba(4,44,83,0.45)', justifyContent: 'flex-end' },
  shareSheet:      { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  shareHandle:     { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, marginBottom: 16 },
  shareSheetTitle: { fontSize: 17, fontWeight: '800', color: Colors.gray900, textAlign: 'center' },
  shareSheetSub:   { fontSize: 13, color: Colors.gray400, textAlign: 'center', marginTop: 3, marginBottom: 22 },
  shareOptRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  shareOpt:        { alignItems: 'center', flex: 1 },
  shareOptIcon:    { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  shareOptLabel:   { fontSize: 12, color: Colors.gray700, fontWeight: '600' },
  shareLinkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  shareLinkTextBox:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13 },
  shareLinkText:     { flex: 1, fontSize: 13, color: Colors.gray700, fontWeight: '500' },
  shareLinkCopyBtn:  { backgroundColor: Colors.blue600, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13 },
  shareLinkCopyText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  shareCancel:     { borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  shareCancelText: { fontSize: 15, fontWeight: '700', color: Colors.gray600 },

  // ── Profile Card ──
  profileCard:     { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 20, marginHorizontal: 16, marginTop: -30, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, overflow: 'hidden', zIndex: 5 },
  cardTopBar:      { height: 3, backgroundColor: Colors.blue600 },
  profileRow:      { flexDirection: 'row', gap: 14, padding: 16, alignItems: 'flex-start' },
  doctorAvatarImg: { width: 72, height: 72, borderRadius: 14, borderWidth: 2, borderColor: Colors.blue200 },
  doctorAvatarBox: { width: 72, height: 72, borderRadius: 14, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center' },

  specLabel:    { fontSize: 10, fontWeight: '700', color: Colors.blue600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 },
  doctorName:   { fontSize: 18, fontWeight: '800', color: Colors.gray900, marginBottom: 8 },
  pillRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  pill:         { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  pillIcon:     { marginRight: 3 },
  pillText:     { fontSize: 11, color: Colors.blue700, fontWeight: '500' },
  hospitalNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hospitalName: { fontSize: 12, color: Colors.gray400 },

  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.blue50 },
  statBox:  { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statVal:  { fontSize: 18, fontWeight: '800', color: Colors.blue600, marginBottom: 2 },
  statLbl:  { fontSize: 11, color: Colors.gray400 },

  // ── Shared block ──
  block:      { backgroundColor: Colors.white, marginTop: 12, paddingHorizontal: 20, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.blue50 },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  blockTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 14 },

  // ── Doctor Info rows ──
  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  infoIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue100, alignItems: 'center', justifyContent: 'center' },
  infoLabel:   { fontSize: 11, fontWeight: '600', color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoValue:   { fontSize: 14, fontWeight: '600', color: Colors.gray900 },

  // Hospital contact & services
  noticeBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warningBorder, borderRadius: 12, padding: 14, marginHorizontal: 16, marginTop: 12 },
  noticeText:  { flex: 1, fontSize: 13, color: Colors.warningText, lineHeight: 19, fontWeight: '500' },
  openPill:    { borderWidth: 1, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  hoursRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  hoursText:   { fontSize: 13, color: Colors.gray600, fontWeight: '500' },
  hospDesc:    { fontSize: 13, color: Colors.gray600, lineHeight: 20, marginBottom: 14 },
  directionsBtn:     { flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  directionsBtnText: { fontSize: 14, fontWeight: '700', color: Colors.blue700 },
  socialRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  socialBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  socialBtnText: { fontSize: 12, fontWeight: '700', color: Colors.blue700 },
  servicesLabel: { fontSize: 10, fontWeight: '700', color: Colors.gray400, letterSpacing: 1.5, marginTop: 16, marginBottom: 8 },
  servicesWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  serviceChipText: { fontSize: 12, fontWeight: '600', color: Colors.blue700 },
  galleryImg:    { width: 150, height: 110, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100 },
  hospLogo:      { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: Colors.blue200 },

  // ── Date chips ──
  workingDaysRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, marginTop: -4 },
  workingDaysNote: { fontSize: 12, color: Colors.gray500 },
  dateChip:       { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.gray50, minWidth: 56 },
  dateChipActive: { backgroundColor: Colors.blue50, borderColor: Colors.blue600 },
  dateChipDisabled: { backgroundColor: Colors.gray100, borderColor: Colors.gray200, opacity: 0.6 },
  dateTextDisabled: { color: Colors.gray400 },
  dayOff:         { fontSize: 8, fontWeight: '700', color: Colors.gray400, marginTop: 2, textTransform: 'uppercase' },
  dateDay:        { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', color: Colors.gray400, marginBottom: 2 },
  dateNum:        { fontSize: 19, fontWeight: '800', color: Colors.gray800, lineHeight: 22 },
  dateNumActive:  { color: Colors.blue600 },
  dateMonth:      { fontSize: 8, color: Colors.gray400, textTransform: 'uppercase', marginTop: 1 },
  dateTextActive: { color: Colors.blue600 },

  // ── Slot legend ──
  legend:     { flexDirection: 'row', gap: 14, flexWrap: 'wrap', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue50, borderRadius: 10, padding: 10, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 11, color: Colors.gray500 },

  // ── Slot grid & buttons ──
  slotPeriodRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  slotPeriod: { fontSize: 10, fontWeight: '700', color: Colors.gray400, letterSpacing: 1.5, textTransform: 'uppercase' },

  // Walk-in (doctor publishes no slots)
  walkInLead: { fontSize: 14, lineHeight: 21, color: Colors.gray600, marginBottom: 12 },
  walkInRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  walkInKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walkInKey:  { fontSize: 14, color: Colors.gray500 },
  walkInVal:  { fontSize: 14, fontWeight: '700', color: Colors.gray900, textAlign: 'right', flexShrink: 1 },
  walkInCall: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 16, backgroundColor: Colors.blue600, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  walkInCallText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  slotGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  slotBtn: {
    minWidth: 80,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.blue100,
    backgroundColor: Colors.gray50,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  slotSelected: { backgroundColor: Colors.blue50,  borderColor: Colors.blue600                        },
  slotPartial:  { backgroundColor: '#FFF8ED',       borderColor: '#F0A030'                             },
  slotFull:     { backgroundColor: Colors.gray50,   borderColor: Colors.gray200, opacity: 0.65         },

  slotTime:         { fontSize: 12, fontWeight: '500', color: Colors.gray600 },
  slotTimeSelected: { color: Colors.blue600, fontWeight: '700' },
  slotTimePartial:  { color: '#854F0B' },
  slotTimeFull:     { color: Colors.gray400, textDecorationLine: 'line-through', textDecorationColor: Colors.gray200 },

  slotSub:         { fontSize: 9, fontWeight: '700', marginTop: 1 },
  slotSubPartial:  { color: '#854F0B' },
  slotSubFull:     { color: Colors.gray400 },
  slotSubSelected: { color: Colors.blue600 },

  slotFullBadge:     { position: 'absolute', top: 2, right: 2, backgroundColor: '#FCEBEB', borderWidth: 1, borderColor: '#F09595', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 },
  slotFullBadgeText: { fontSize: 7, fontWeight: '800', color: '#E2384B', letterSpacing: 0.3 },

  slotBar:     { height: 3, width: '80%', backgroundColor: Colors.gray200, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  slotBarFill: { height: 3, borderRadius: 2 },

  // ── Summary ──
  summaryRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  summaryLabel:    { fontSize: 13, color: Colors.gray500 },
  summaryValue:    { fontSize: 13, fontWeight: '600', color: Colors.gray900, flexShrink: 1, textAlign: 'right', maxWidth: '60%' },
  summaryValueDim: { color: Colors.gray400, fontStyle: 'italic', fontWeight: '400' },

  planRow:        { flexDirection: 'row', alignItems: 'center', marginTop: 14, padding: 12, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12 },
  planInfo:       { flex: 1 },
  planNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  planName:       { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  planDesc:       { fontSize: 11, color: Colors.gray500 },
  planBadge:      { backgroundColor: Colors.blue600, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3 },
  planBadgeText:  { fontSize: 10, fontWeight: '700', color: Colors.white, textTransform: 'uppercase', letterSpacing: 0.5 },

  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 4 },
  totalLabel:  { fontSize: 15, fontWeight: '700', color: Colors.gray700 },
  totalAmount: { fontSize: 26, fontWeight: '800', color: Colors.blue600 },
  feeNote:      { fontSize: 11, color: Colors.gray500, textAlign: 'right', marginTop: 2 },
  feeLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  clinicTag:    { backgroundColor: Colors.blue50, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  clinicTagText:{ fontSize: 10, fontWeight: '700', color: Colors.blue700, textTransform: 'uppercase', letterSpacing: 0.3 },

  // ── Sticky bar ──
  stickyBar: {
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: Colors.blue50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  bookBtn:         { flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: Colors.blue600, borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  bookBtnDisabled: { backgroundColor: Colors.gray200, shadowOpacity: 0 },
  bookBtnText:     { color: Colors.white, fontWeight: '700', fontSize: 15 },
  bookNote:        { fontSize: 11, color: Colors.gray400, textAlign: 'center', marginTop: 10, lineHeight: 17 },
});