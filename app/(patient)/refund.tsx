import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { safeBack } from '../utils/navigation';

const SECTIONS = [
  { title: 'Cancellations',            body: 'You may cancel a waiting booking from your "My Bookings" page at least 2 hours before your scheduled slot. Refunds are processed within 5–7 business days to your original payment method.' },
  { title: 'Non-refundable Situations', body: 'Bookings with status "In Consultation" or "Completed", cancellations made less than 2 hours before the slot, and no-shows without prior cancellation are non-refundable.' },
  { title: 'Emergency Cancellations',  body: 'Emergency cancellations due to documented medical reasons may be considered on a case-by-case basis. Contact support@tokenwalla.com with documentation.' },
  { title: 'Payment Partner Rights',   body: 'TokenWalla uses Razorpay as its payment partner. Razorpay and TokenWalla reserve the right to hold settlements or restrict account access in cases of compliance violations or chargebacks.' },
  { title: 'Important Notice',         body: 'This service is for legitimate outpatient appointment booking only — not for medical emergencies. For emergencies, call 108.' },
];

export default function RefundScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>LEGAL</Text>
          <Text style={styles.title}>Refund Policy</Text>
          <Text style={styles.updated}>Last updated: March 2026</Text>
        </View>

        {/* Quick summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>⚡ Quick Summary</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryCheck}>✅</Text><Text style={styles.summaryText}>Cancel 2+ hrs before slot → Full refund in 5–7 days</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryCheck}>❌</Text><Text style={styles.summaryText}>Cancel less than 2hrs before → No refund</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryCheck}>❌</Text><Text style={styles.summaryText}>No-show without cancellation → No refund</Text></View>
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
  backBtn: { marginBottom: 16 },
  backText: { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginBottom: 10 },
  title:   { fontSize: 26, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  updated: { fontSize: 13, color: Colors.gray400 },

  summaryBox:  { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, margin: 20, borderRadius: 14, padding: 16 },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: Colors.gray900, marginBottom: 12 },
  summaryRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  summaryCheck: { fontSize: 16, width: 22 },
  summaryText: { flex: 1, fontSize: 13, color: Colors.gray600, lineHeight: 19 },

  body:    { padding: 20 },
  section:      { marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.blue600, marginBottom: 8 },
  sectionBody:  { fontSize: 14, color: Colors.gray500, lineHeight: 22 },
  contactBox:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 14, padding: 18, marginTop: 8 },
  contactTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 6 },
  contactText:  { fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});
