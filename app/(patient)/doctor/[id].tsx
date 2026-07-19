import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import API from '../../../services/api';
import {
  directionsUrl,
  getNext7Days,
  isOpenNow,
  isSlotTooSoon,
} from '../../../utils/booking';
import { safeBack } from '../../../utils/navigation';
import { useCurrentUser } from '../../../hooks/useCurrentUser';

interface SlotInfo { booked: number; max: number; full: boolean; }
interface GalleryPhoto { id: number | string; url: string; }

interface Hospital {
  name?: string; city?: string; image?: string; logo?: string;
  mobile?: string; location?: string;
  instagram?: string; youtube?: string; facebook?: string;
  open_time?: string; close_time?: string;
  announcement?: string; description?: string;
  services?: string[]; gallery?: GalleryPhoto[];
}

interface Doctor {
  id: number | string; name: string;
  specialization?: string; city?: string; experience?: number;
  available?: boolean; hospital?: number | string;
  hospital_name?: string; hospital_image?: string; image?: string;
  mobile?: string; fee?: number;
  slots?: string[]; days?: string[]; max_per_slot?: number;
}

// The next 7 days, computed once at module load (the date/slot/open-hours
// helpers now live in utils/booking.ts and are unit-tested there).
const DAYS = getNext7Days();

const PLAN = { price: 15, fee: 1500, name: 'Queue View', desc: 'Token + live queue position tracking' };

export default function DoctorDetails() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const [doctor,       setDoctor]       = useState<Doctor | null>(null);
  const [hospitalInfo, setHospitalInfo] = useState<Hospital | null>(null);
  const [loading,      setLoading]      = useState(true);
  const { user } = useCurrentUser();
  const [slotAvail,    setSlotAvail]    = useState<Record<string, SlotInfo>>({}); // { "09:00 AM": { booked, max, full } }
  const [availLoading, setAvailLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(DAYS[0].full);
  const [selectedSlot, setSelectedSlot] = useState('');

  useEffect(() => {
    API.get(`/doctors/${id}/`)
      .then(({ data }) => {
        setDoctor(data);
        // Fetch the hospital for contact number, social links & services.
        if (data?.hospital) {
          API.get(`/hospitals/${data.hospital}/`)
            .then(({ data: h }) => setHospitalInfo(h))
            .catch(() => {});
        }
      })
      .catch(() => router.back())
      .finally(() => setLoading(false));
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
        doctorMobile: doctor.mobile,
        hospital:     doctor.hospital_name,
        date:         selectedDate,
        slot:         selectedSlot,
        fee:          PLAN.price,
        amount:       PLAN.fee,
      },
    });
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
  const isBookable = selectedSlot && doctor.available &&
    !slotAvail[selectedSlot]?.full && !isSlotTooSoon(selectedDate, selectedSlot);

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
          {(hospitalInfo?.image?.startsWith('http') || hasHospitalImage) ? (
            <Image
              source={{ uri: hospitalInfo?.image?.startsWith('http') ? hospitalInfo.image : doctor.hospital_image }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <Text style={{ fontSize: 64, opacity: 0.25 }}>🏥</Text>
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
                <Text style={{ fontSize: 34 }}>🩺</Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.specLabel}>{doctor.specialization}</Text>
              <Text style={styles.doctorName}>Dr. {doctor.name}</Text>
              <View style={styles.pillRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>📍 {doctor.city}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>⏳ {doctor.experience} yrs exp</Text>
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
              <Text style={styles.hospitalName}>🏥 {doctor.hospital_name}</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { val: `${doctor.experience}+`, lbl: 'Years Exp'    },
              { val: slots.length,             lbl: 'Daily Slots'  },
              { val: doctor.max_per_slot || 10, lbl: 'Per Slot'   },
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
          <Text style={styles.blockTitle}>👨‍⚕️ Doctor Info</Text>

          {/* Fee */}
          {(doctor.fee ?? 0) > 0 && (
            <View style={styles.infoRow}>
              <View style={styles.infoIconBox}><Text>💰</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Consultation Fee</Text>
                <Text style={styles.infoValue}>₹{doctor.fee}</Text>
              </View>
            </View>
          )}

          {/* Hospital */}
          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}><Text>🏥</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Hospital</Text>
              <Text style={styles.infoValue}>{doctor.hospital_name}</Text>
            </View>
          </View>

          {/* City */}
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoIconBox}><Text>📍</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>{doctor.city}</Text>
            </View>
          </View>
        </View>

        {/* ── HOSPITAL ANNOUNCEMENT ── */}
        {hospitalInfo?.announcement ? (
          <View style={styles.noticeBox}>
            <Text style={{ fontSize: 16 }}>📢</Text>
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
                <Text style={[styles.blockTitle, { marginBottom: 0 }]}>🏥 About the Hospital</Text>
              </View>
              {openNow != null && (
                <View style={[styles.openPill, { backgroundColor: openNow ? Colors.successBg : Colors.errorBg, borderColor: openNow ? Colors.successBorder : Colors.errorBorder }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: openNow ? Colors.successText : Colors.errorText }}>
                    {openNow ? '🟢 Open now' : '🔴 Closed'}
                  </Text>
                </View>
              )}
            </View>

            {(hospitalInfo.open_time && hospitalInfo.close_time) ? (
              <Text style={styles.hoursText}>🕐 {hospitalInfo.open_time} – {hospitalInfo.close_time}</Text>
            ) : null}

            {/* About / description */}
            {hospitalInfo.description ? (
              <Text style={styles.hospDesc}>{hospitalInfo.description}</Text>
            ) : null}

            {/* Directions (call is available after booking, in My Bookings) */}
            <TouchableOpacity style={styles.directionsBtn} onPress={() => Linking.openURL(directionsUrl(hospitalInfo))}>
              <Text style={styles.directionsBtnText}>📍 Get Directions</Text>
            </TouchableOpacity>

            {(hospitalInfo.instagram || hospitalInfo.youtube || hospitalInfo.facebook) && (
              <View style={styles.socialRow}>
                {hospitalInfo.instagram ? (
                  <TouchableOpacity style={styles.socialBtn} onPress={() => Linking.openURL(hospitalInfo.instagram!)}>
                    <Text style={styles.socialBtnText}>📸 Instagram</Text>
                  </TouchableOpacity>
                ) : null}
                {hospitalInfo.youtube ? (
                  <TouchableOpacity style={styles.socialBtn} onPress={() => Linking.openURL(hospitalInfo.youtube!)}>
                    <Text style={styles.socialBtnText}>▶️ YouTube</Text>
                  </TouchableOpacity>
                ) : null}
                {hospitalInfo.facebook ? (
                  <TouchableOpacity style={styles.socialBtn} onPress={() => Linking.openURL(hospitalInfo.facebook!)}>
                    <Text style={styles.socialBtnText}>👍 Facebook</Text>
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

        {/* ── DATE PICKER ── */}
        <View style={styles.block}>
          <Text style={styles.blockTitle}>📅 Select Date</Text>
          {doctor.days && doctor.days.length > 0 && (
            <Text style={styles.workingDaysNote}>
              🩺 Works on: {doctor.days.join(', ')}
            </Text>
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

        {/* ── SLOT PICKER ── */}
        <View style={styles.block}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.blockTitle}>🕐 Select Time Slot</Text>
            {availLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <ActivityIndicator size="small" color={Colors.blue400} />
                <Text style={{ fontSize: 11, color: Colors.gray400 }}>Checking…</Text>
              </View>
            ) : selectedSlot ? (
              <Text style={{ fontSize: 13, color: Colors.blue600, fontWeight: '700' }}>✓ {selectedSlot}</Text>
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

          {slots.length === 0 ? (
            <Text style={{ color: Colors.gray400, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>
              No slots configured. Contact hospital directly.
            </Text>
          ) : (
            <View style={{ opacity: availLoading ? 0.5 : 1 }}>
              {am.length > 0 && (
                <>
                  <Text style={styles.slotPeriod}>🌅 MORNING</Text>
                  <View style={styles.slotGrid}>
                    {am.map(s => renderSlot(s))}
                  </View>
                </>
              )}
              {pm.length > 0 && (
                <>
                  <Text style={[styles.slotPeriod, am.length > 0 && { marginTop: 18 }]}>🌇 AFTERNOON / EVENING</Text>
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
          <Text style={styles.blockTitle}>📋 Booking Summary</Text>

          {[
            { label: 'Doctor',   value: `Dr. ${doctor.name}`                                              },
            { label: 'Hospital', value: doctor.hospital_name                                              },
            { label: 'Date',     value: dateLabel ? `${dateLabel.label}, ${dateLabel.num} ${dateLabel.month}` : '—' },
            { label: 'Slot',     value: selectedSlot || 'Not selected yet',  dim: !selectedSlot           },
          ].map(({ label, value, dim }) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={[styles.summaryValue, dim && styles.summaryValueDim]}>{value}</Text>
            </View>
          ))}

          {/* Plan row */}
          <View style={styles.planRow}>
            <View style={styles.planInfo}>
              <Text style={styles.planName}>📍 {PLAN.name}</Text>
              <Text style={styles.planDesc}>{PLAN.desc}</Text>
            </View>
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>Popular</Text>
            </View>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalAmount}>₹{PLAN.price}</Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── STICKY BOOK BUTTON ── */}
      <View style={styles.stickyBar}>
        <TouchableOpacity
          style={[styles.bookBtn, !isBookable && styles.bookBtnDisabled]}
          onPress={handleBook}
          activeOpacity={0.85}
        >
          <Text style={styles.bookBtnText}>
            {!doctor.available
              ? '⛔ Doctor Unavailable'
              : !selectedSlot
              ? 'Select a Slot First'
              : slotAvail[selectedSlot]?.full
              ? '⛔ Slot is Full'
              : user
              ? `💳 Pay ₹${PLAN.price} & Book Appointment`
              : '🔐 Login to Book'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.bookNote}>
          Secured by Razorpay · Refundable if cancelled 2hrs before slot
        </Text>
      </View>
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
  pillText:     { fontSize: 11, color: Colors.blue700, fontWeight: '500' },
  hospitalName: { fontSize: 12, color: Colors.gray400 },

  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.blue50 },
  statBox:  { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statVal:  { fontSize: 18, fontWeight: '800', color: Colors.blue600, marginBottom: 2 },
  statLbl:  { fontSize: 11, color: Colors.gray400 },

  // ── Shared block ──
  block:      { backgroundColor: Colors.white, marginTop: 12, paddingHorizontal: 20, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.blue50 },
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
  hoursText:   { fontSize: 13, color: Colors.gray600, marginBottom: 12, fontWeight: '500' },
  hospDesc:    { fontSize: 13, color: Colors.gray600, lineHeight: 20, marginBottom: 14 },
  directionsBtn:     { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  directionsBtnText: { fontSize: 14, fontWeight: '700', color: Colors.blue700 },
  socialRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  socialBtn:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  socialBtnText: { fontSize: 12, fontWeight: '700', color: Colors.blue700 },
  servicesLabel: { fontSize: 10, fontWeight: '700', color: Colors.gray400, letterSpacing: 1.5, marginTop: 16, marginBottom: 8 },
  servicesWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  serviceChipText: { fontSize: 12, fontWeight: '600', color: Colors.blue700 },
  galleryImg:    { width: 150, height: 110, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100 },
  hospLogo:      { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: Colors.blue200 },

  // ── Date chips ──
  workingDaysNote: { fontSize: 12, color: Colors.gray500, marginBottom: 12, marginTop: -4 },
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
  slotPeriod: { fontSize: 10, fontWeight: '700', color: Colors.gray400, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
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
  planName:       { fontSize: 13, fontWeight: '700', color: Colors.gray900, marginBottom: 2 },
  planDesc:       { fontSize: 11, color: Colors.gray500 },
  planBadge:      { backgroundColor: Colors.blue600, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3 },
  planBadgeText:  { fontSize: 10, fontWeight: '700', color: Colors.white, textTransform: 'uppercase', letterSpacing: 0.5 },

  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 4 },
  totalLabel:  { fontSize: 15, fontWeight: '700', color: Colors.gray700 },
  totalAmount: { fontSize: 26, fontWeight: '800', color: Colors.blue600 },

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
  bookBtn:         { backgroundColor: Colors.blue600, borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  bookBtnDisabled: { backgroundColor: Colors.gray200, shadowOpacity: 0 },
  bookBtnText:     { color: Colors.white, fontWeight: '700', fontSize: 15 },
  bookNote:        { fontSize: 11, color: Colors.gray400, textAlign: 'center', marginTop: 10, lineHeight: 17 },
});