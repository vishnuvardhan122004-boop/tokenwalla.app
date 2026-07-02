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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import API, { getUser } from '../../../services/api';

function getNext7Days() {
  const days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: i === 0 ? 'Today' : days[d.getDay()],
      num:   d.getDate(),
      month: months[d.getMonth()],
      full:  d.toISOString().split('T')[0],
    };
  });
}

const DAYS = getNext7Days();

const PLAN = { price: 15, fee: 1500, name: 'Queue View', desc: 'Token + live queue position tracking' };

export default function DoctorDetails() {
  const { id }  = useLocalSearchParams();
  const router  = useRouter();

  const [doctor,       setDoctor]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [user,         setUser]         = useState(null);
  const [slotAvail,    setSlotAvail]    = useState({}); // { "09:00 AM": { booked, max, full } }
  const [availLoading, setAvailLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(DAYS[0].full);
  const [selectedSlot, setSelectedSlot] = useState('');

  useEffect(() => {
    getUser().then(setUser);
    API.get(`/doctors/${id}/`)
      .then(({ data }) => setDoctor(data))
      .catch(() => router.back())
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch slot availability whenever doctor or date changes
  const fetchAvailability = useCallback(async (doctorId, date) => {
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

  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedSlot('');
  };

  const handleSlotPress = (slot) => {
    const info = slotAvail[slot];
    if (info?.full) return; // fully booked — ignore tap
    setSelectedSlot(slot);
  };

  const handleBook = () => {
    if (!user) { router.push('/(auth)/login'); return; }
    if (!selectedSlot) { Alert.alert('Select Slot', 'Please select a time slot first'); return; }
    if (!doctor.available) { Alert.alert('Unavailable', 'This doctor is currently unavailable'); return; }
    // Guard: slot may have filled up since page load
    if (slotAvail[selectedSlot]?.full) {
      Alert.alert('Slot Full', 'This slot just filled up. Please choose another slot.');
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
  const slotState = (slot) => {
    if (slot === selectedSlot) return 'selected';
    const info = slotAvail[slot];
    if (!info) return 'available';
    if (info.full) return 'full';
    if (info.booked > 0) return 'partial';
    return 'available';
  };

  const slotSubtext = (slot) => {
    const info = slotAvail[slot];
    if (!info || info.booked === 0) return null;
    if (info.full) return 'Full';
    return `${info.max - info.booked} left`;
  };

  const slotFillPct = (slot) => {
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
  const isBookable = selectedSlot && doctor.available && !slotAvail[selectedSlot]?.full;

  const hasHospitalImage = doctor.hospital_image &&
    !doctor.hospital_image.includes('placehold') &&
    doctor.hospital_image.startsWith('http');

  const hasDoctorImage = doctor.image &&
    !doctor.image.includes('placehold') &&
    doctor.image.startsWith('http');

  // ── slot renderer ──────────────────────────────────────────────────────
  const renderSlot = (s) => {
    const state   = slotState(s);
    const sub     = slotSubtext(s);
    const fillPct = slotFillPct(s);

    const containerStyle = [
      styles.slotBtn,
      state === 'selected' && styles.slotSelected,
      state === 'partial'  && styles.slotPartial,
      state === 'full'     && styles.slotFull,
    ];

    return (
      <TouchableOpacity
        key={s}
        style={containerStyle}
        onPress={() => handleSlotPress(s)}
        activeOpacity={state === 'full' ? 1 : 0.7}
        disabled={state === 'full'}
      >
        {/* "FULL" badge top-right */}
        {state === 'full' && (
          <View style={styles.slotFullBadge}>
            <Text style={styles.slotFullBadgeText}>FULL</Text>
          </View>
        )}

        {/* Time label — strikethrough when full */}
        <Text style={[
          styles.slotTime,
          state === 'selected' && styles.slotTimeSelected,
          state === 'partial'  && styles.slotTimePartial,
          state === 'full'     && styles.slotTimeFull,
        ]}>
          {s}
        </Text>

        {/* Sub-label: "3 left" or "Full" */}
        {sub && (
          <Text style={[
            styles.slotSub,
            state === 'partial'  && styles.slotSubPartial,
            state === 'full'     && styles.slotSubFull,
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
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          {hasHospitalImage ? (
            <Image source={{ uri: doctor.hospital_image }} style={styles.bannerImage} resizeMode="cover" />
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
          {doctor.fee > 0 && (
            <View style={styles.infoRow}>
              <View style={styles.infoIconBox}><Text>💰</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Consultation Fee</Text>
                <Text style={styles.infoValue}>₹{doctor.fee}</Text>
              </View>
            </View>
          )}

          {/* Contact */}
          {doctor.mobile ? (
            <TouchableOpacity
              style={styles.infoRow}
              onPress={() => Linking.openURL(`tel:${doctor.mobile}`)}
              activeOpacity={0.7}
            >
              <View style={styles.infoIconBox}><Text>📞</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Contact</Text>
                <Text style={[styles.infoValue, { color: Colors.blue600 }]}>{doctor.mobile}</Text>
              </View>
              <Text style={{ fontSize: 12, color: Colors.blue400 }}>Call →</Text>
            </TouchableOpacity>
          ) : null}

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

        {/* ── DATE PICKER ── */}
        <View style={styles.block}>
          <Text style={styles.blockTitle}>📅 Select Date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {DAYS.map(day => (
              <TouchableOpacity
                key={day.full}
                style={[styles.dateChip, selectedDate === day.full && styles.dateChipActive]}
                onPress={() => handleDateChange(day.full)}
              >
                <Text style={[styles.dateDay,   selectedDate === day.full && styles.dateTextActive]}>{day.label}</Text>
                <Text style={[styles.dateNum,   selectedDate === day.full && styles.dateNumActive]}>{day.num}</Text>
                <Text style={[styles.dateMonth, selectedDate === day.full && styles.dateTextActive]}>{day.month}</Text>
              </TouchableOpacity>
            ))}
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

  // ── Date chips ──
  dateChip:       { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.gray50, minWidth: 56 },
  dateChipActive: { backgroundColor: Colors.blue50, borderColor: Colors.blue600 },
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
  slotTimeFull:     { color: Colors.gray400, textDecorationLine: 'line-through', textDecorationColor: Colors.gray300 },

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