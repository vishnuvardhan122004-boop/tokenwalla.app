import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text, TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { notifyBookingConfirmed, scheduleAppointmentReminder } from '../../services/notifications';

export default function BookingTokenScreen() {
  const router = useRouter();
  const { token, doctorName, hospital, date, slot, paymentId, userName, doctorMobile } = useLocalSearchParams();
  const notifiedRef = useRef(false);

   useEffect(() => {
   if (!token) { router.replace('/(patient)/doctors'); return; }

   // Fire the "token booked" notification once, then schedule the ~2.1h reminder.
   if (!notifiedRef.current) {
     notifiedRef.current = true;
     const tokenStr = String(token);
     const dateStr = date ? String(date) : undefined;
     const slotStr = slot ? String(slot) : undefined;
     notifyBookingConfirmed({
       token:      tokenStr,
       doctorName: doctorName ? String(doctorName) : undefined,
       hospital:   hospital ? String(hospital) : undefined,
       date:       dateStr,
       slot:       slotStr,
     });
     scheduleAppointmentReminder({
       token:       tokenStr,
       doctor_name: doctorName ? String(doctorName) : undefined,
       hospital_name: hospital ? String(hospital) : undefined,
       date:        dateStr,
       slot:        slotStr,
     });
   }
    }, [token]);

     if (!token) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.root} showsVerticalScrollIndicator={false}>

        {/* Success Icon */}
        <View style={styles.successIcon}>
          <Text style={{ fontSize: 40 }}>✅</Text>
        </View>
        <Text style={styles.title}>Booking Confirmed!</Text>
        <Text style={styles.sub}>Your appointment is booked. Show this token at the hospital.</Text>

        {/* Token Card */}
        <View style={styles.card}>
          <View style={styles.cardTopBar} />

          {/* Card Header */}
          <View style={styles.cardHeader}>
            <View style={styles.brand}>
              <View style={styles.logoBox}><Text style={styles.logoText}>TW</Text></View>
              <Text style={styles.brandName}><Text style={styles.accent}>Token</Text>walla</Text>
            </View>
            <View style={styles.confirmedBadge}>
              <View style={styles.confirmedDot} />
              <Text style={styles.confirmedText}>Confirmed</Text>
            </View>
          </View>

          {/* Token Number */}
          <View style={styles.tokenSection}>
            <Text style={styles.tokenLabel}>YOUR TOKEN NUMBER</Text>
            <Text style={styles.tokenNumber}>{String(token)}</Text>
            <Text style={styles.tokenSub}>Present this at reception</Text>
          </View>

          <View style={styles.dashed} />

          {/* Info Grid */}
          <View style={styles.infoGrid}>
            {[
              { label: 'Doctor',   value: `Dr. ${doctorName}` },
              { label: 'Patient',  value: String(userName || '—') },
              { label: 'Date',     value: String(date || '—') },
              { label: 'Slot',     value: String(slot || '—') },
              { label: 'Hospital', value: `🏥 ${hospital}` },
              { label: 'Contact',  value: `📞 ${doctorMobile || '—'}` },
              ...(paymentId ? [{ label: 'Payment ID', value: String(paymentId).slice(0, 20) + '...' }] : []),
            ].map(({ label, value }) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
              </View>
            ))}
          </View>

          {/* Queue Access */}
          <View style={styles.queueRow}>
            <Text style={{ fontSize: 18, marginRight: 10 }}>📍</Text>
            <View>
              <Text style={styles.queueTitle}>Queue View Active</Text>
              <Text style={styles.queueDesc}>Track your live position in My Bookings</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/(patient)/my-bookings')}
        >
          <Text style={styles.primaryBtnText}>View My Bookings →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => router.replace('/(patient)/doctors')}
        >
          <Text style={styles.outlineBtnText}>Book Another Appointment</Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Keep this token handy. You'll need it at the hospital reception.{'\n'}
          For support: tokentraq@gmail.com
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  root: { padding: 20, paddingTop: 24, alignItems: 'center' },

  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.successBg, borderWidth: 2, borderColor: Colors.successBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.gray900, marginBottom: 8, textAlign: 'center' },
  sub:   { fontSize: 14, color: Colors.gray500, textAlign: 'center', marginBottom: 28, lineHeight: 20 },

  card:       { width: '100%', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 22, overflow: 'hidden', marginBottom: 20, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 },
  cardTopBar: { height: 3, backgroundColor: Colors.blue600 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  brand:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoBox:    { width: 28, height: 28, borderRadius: 7, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  logoText:   { color: Colors.white, fontWeight: '800', fontSize: 10 },
  brandName:  { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  accent:     { color: Colors.blue600 },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, gap: 5 },
  confirmedDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.successText },
  confirmedText:  { fontSize: 12, fontWeight: '700', color: Colors.successText },

  tokenSection: { alignItems: 'center', padding: 24 },
  tokenLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.gray400, textTransform: 'uppercase', marginBottom: 8 },
  tokenNumber:  { fontSize: 42, fontWeight: '500', color: Colors.blue600, fontFamily: 'monospace', letterSpacing: -1, marginBottom: 6 },
  tokenSub:     { fontSize: 13, color: Colors.gray400 },

  dashed: { height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.blue100, marginHorizontal: 20 },

  infoGrid: { padding: 16 },
  infoRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  infoLabel: { fontSize: 12, color: Colors.gray500 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.gray900, maxWidth: '60%', textAlign: 'right' },

  queueRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.blue50, borderTopWidth: 1, borderTopColor: Colors.blue100, padding: 16 },
  queueTitle: { fontSize: 13, fontWeight: '700', color: Colors.blue700, marginBottom: 2 },
  queueDesc:  { fontSize: 12, color: Colors.blue600 },

  primaryBtn:     { width: '100%', backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginBottom: 12, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  outlineBtn:     { width: '100%', borderWidth: 1.5, borderColor: Colors.blue200, borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  outlineBtnText: { color: Colors.blue600, fontWeight: '600', fontSize: 15 },

  note: { fontSize: 12, color: Colors.gray400, textAlign: 'center', lineHeight: 18 },
});