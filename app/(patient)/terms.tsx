import { useRouter } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { safeBack } from '../../utils/navigation';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import { YOUTUBE_URL } from '../../constants/config';
const SECTIONS = [
  { title: "1. Eligibility", body: "You must be at least 18 years old and capable of entering into a legally binding contract to use TokenWalla services." },
  { title: "2. Services", body: "TokenWalla lets you book a token with a doctor or centre and follow the live queue. We are not a medical provider and are not responsible for medical outcomes. Each doctor and hospital is responsible for their own services, timings and fees." },
  { title: "3. Account responsibility", body: "You are responsible for keeping your login details safe and for all activity under your account." },
  { title: "4. Accurate information", body: "You agree to give accurate, current and complete information when registering and booking. False information or misuse may lead to account suspension." },
  { title: "5. Payments and fees", body: "Payments are processed by Razorpay and a booking is confirmed only after the payment succeeds. TokenWalla charges the patient a service fee (platform fee, payment-gateway fee and GST), shown at checkout. The doctor's consultation fee, where it is collected online, is passed on to the doctor or hospital and is shown separately. TokenWalla never charges a hospital or doctor for your booking and does not store card details." },
  { title: "6. Cancellations and refunds", body: "Refunds depend on how long before your slot you cancel: 70% at 24 hours or more, 60% at 12 to 24 hours, 50% at 2 to 12 hours, and none under 2 hours. The payment-gateway fee and GST are not refunded. See the Refund Policy for the full rules." },
  { title: "7. Optional features", body: "Priority booking (where a doctor offers it) places you ahead of non-priority bookings in the same slot, up to the seats the doctor allows. The Appointment Pass, where available, covers the service fee for a limited number of visits for a limited time. The price and rules are shown before you pay." },
  { title: "8. Messages", body: "We send booking confirmations, queue updates and reminders by app notification, SMS or WhatsApp, and OTPs for login. These are service messages, not advertising." },
  { title: "9. KYC & verification", body: "By using TokenWalla, you consent to provide identity documents as required by TokenWalla, Razorpay, or regulatory authorities to comply with RBI guidelines and anti-money laundering regulations." },
  { title: "10. Acceptable use", body: "Do not misuse the platform: no fake or duplicate bookings, no attempts to bypass the queue or payment, and no interference with the service or other users." },
  { title: "11. Limitation of liability", body: "TokenWalla is not liable for any direct or indirect damages resulting from your use of the platform, including delays in medical care or hospital-side cancellations." },
  { title: "12. Changes to these terms", body: "We may update these terms. The date above shows the latest version; continuing to use TokenWalla after a change means you accept it." },
  { title: "13. Governing law", body: "These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in Andhra Pradesh." },
];

export default function TermsScreen() {
  const router = useRouter();
  useAndroidBack(() => safeBack(router, '/(patient)/home'));
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>LEGAL</Text>
          <Text style={styles.title}>Terms & Conditions</Text>
          <Text style={styles.updated}>Last updated: November 2026</Text>
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
  backBtn: { marginBottom: 16 },
  backText: { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginBottom: 10 },
  title:   { fontSize: 26, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  updated: { fontSize: 13, color: Colors.gray400 },
  body:    { padding: 20 },
  section:      { marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.blue600, marginBottom: 8 },
  sectionBody:  { fontSize: 14, color: Colors.gray500, lineHeight: 22 },
  contactBox:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 14, padding: 18, marginTop: 8 },
  contactTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 6 },
  contactText:  { fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});