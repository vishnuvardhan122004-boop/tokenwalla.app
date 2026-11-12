import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { safeBack } from '../../utils/navigation';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import { YOUTUBE_URL } from '../../constants/config';

const SECTIONS = [
  { title: "Cancelling a booking", body: "You can cancel a booking that is still waiting from My Bookings. How much comes back depends on how long before your slot you cancel: 24 hours or more, 70%; 12 to 24 hours, 60%; 2 to 12 hours, 50%; less than 2 hours, no refund." },
  { title: "What the percentage applies to", body: "It applies to what you paid online for the visit: the doctor's consultation fee (when it is collected online), any priority fee, and TokenWalla's platform fee. The payment-gateway fee and GST are never refunded, because the payment provider does not return them. If the consultation fee is paid at the clinic, nothing is charged or refunded online for it." },
  { title: "When the money arrives", body: "Refunds go back to the original payment method, usually within 5 to 7 working days. You will see the refund amount in the cancellation message." },
  { title: "Not refundable", body: "Bookings that are In Consultation or Completed, no-shows without a cancellation, and cancellations made less than 2 hours before the slot." },
  { title: "Moving a booking instead", body: "You can move a booking to another day or slot from My Bookings. If your doctor is unavailable on your day (for example on leave), you can move it to another day at no charge. Other moves may carry a small fee, shown before you confirm, and a booking can be moved a limited number of times." },
  { title: "Appointment Pass", body: "Cancelling a visit you booked with a pass gives that visit back to your pass. Cancelling the booking that bought the pass refunds only the part you have not used." },
  { title: "Payment taken but no booking", body: "If your payment goes through but we cannot confirm the booking (for example the last seat was taken at the same moment), the amount is refunded to you. If you do not see it within 7 working days, write to us." },
  { title: "Emergencies and special cases", body: "If a documented medical emergency stopped you from attending, email support@tokenwalla.com with the details and we will review it. Each case is looked at individually." },
  { title: "Payment partner", body: "TokenWalla uses Razorpay for payments. Razorpay and TokenWalla may hold settlements or restrict an account where there is a compliance issue or a chargeback." },
  { title: "Important notice", body: "This service is for outpatient appointment booking only, not for medical emergencies. In an emergency, call 108." },
];

export default function RefundScreen() {
  const router = useRouter();
  useAndroidBack(() => safeBack(router, '/(patient)/home'));
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={16} color={Colors.blue600} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>LEGAL</Text>
          <Text style={styles.title}>Refund Policy</Text>
          <Text style={styles.updated}>Last updated: November 2026</Text>
        </View>

        {/* Quick summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryTitleRow}>
            <Ionicons name="flash" size={15} color={Colors.blue600} />
            <Text style={styles.summaryTitle}>Quick Summary</Text>
          </View>
          <View style={styles.summaryRow}><Ionicons name="checkmark-circle" size={17} color={Colors.successText} /><Text style={styles.summaryText}>Cancel 24+ hrs before → 70% back · 12–24 hrs → 60% · 2–12 hrs → 50%</Text></View>
          <View style={styles.summaryRow}><Ionicons name="close-circle" size={17} color={Colors.errorText} /><Text style={styles.summaryText}>Cancel less than 2 hrs before → No refund</Text></View>
          <View style={styles.summaryRow}><Ionicons name="close-circle" size={17} color={Colors.errorText} /><Text style={styles.summaryText}>No-show without cancellation → No refund</Text></View>
        </View>

        <View style={styles.body}>
          {SECTIONS.map(s => (
            <View key={s.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionBody}>{s.body}</Text>
            </View>
          ))}
          <View style={styles.contactBox}>
            <Text style={styles.contactTitle}>Questions?</Text>
            <Text style={styles.contactText}>Email us at support@tokenwalla.com{'\n'}Hindupur – Nimpalli Road, AP – 515201</Text>
            <TouchableOpacity onPress={() => Linking.openURL(YOUTUBE_URL)} accessibilityRole="link" accessibilityLabel="Know more on YouTube">
              <Text style={[styles.contactText, { color: Colors.blue600, fontWeight: '700', marginTop: 6 }]}>▶ Know more on YouTube</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.white },
  header:  { backgroundColor: Colors.bg, padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 16, alignSelf: 'flex-start' },
  backText: { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginBottom: 10 },
  title:   { fontSize: 26, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  updated: { fontSize: 13, color: Colors.gray400 },

  summaryBox:  { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, margin: 20, borderRadius: 14, padding: 16 },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: Colors.gray900 },
  summaryRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  summaryText: { flex: 1, fontSize: 13, color: Colors.gray600, lineHeight: 19 },

  body:    { padding: 20 },
  section:      { marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.blue600, marginBottom: 8 },
  sectionBody:  { fontSize: 14, color: Colors.gray500, lineHeight: 22 },
  contactBox:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 14, padding: 18, marginTop: 8 },
  contactTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 6 },
  contactText:  { fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});
