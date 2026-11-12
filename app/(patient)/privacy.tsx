import { useRouter } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { safeBack } from '../../utils/navigation';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import { YOUTUBE_URL } from '../../constants/config';

const SECTIONS = [
  { title: "What we collect", body: "Your name and mobile number (your login). If you choose Continue with Google, your name, email and Google account ID from Google. Your bookings: doctor, date, slot, token and status. Razorpay order and payment IDs only; we never store your card number, CVV, UPI PIN or bank login. A one-time password sent to your mobile for login and reset. Technical data such as device type and IP address, used for security. Hospitals upload doctor and hospital photos; patients upload nothing." },
  { title: "Permissions in the app", body: "Location (optional): if you allow it, your phone uses it on the device only, to show doctors near you. It is not sent to or kept by TokenWalla. Notifications (optional): used to tell you about your booking and queue. The camera is used only by hospital staff, to scan patient QR codes and photograph reports for the patient. We do not collect your contacts, microphone audio or biometrics." },
  { title: "How we use your information", body: "To create your account, book appointments and issue tokens, show your live queue position, send OTPs and booking messages, process payments and refunds, prevent fraud, meet legal duties, and improve the service with anonymised usage. We do not use your data for advertising or profiling, and we never sell it." },
  { title: "Who we share it with", body: "The hospital you booked with gets your name, mobile, date, slot and token. Razorpay processes payments (card data never reaches us). 2Factor.in delivers OTPs (mobile number only). Meta WhatsApp delivers booking messages (mobile number and booking details). Expo delivers app notifications (a device notification token). Google, only if you use Continue with Google. Cloudinary stores hospital photos (no patient data). Sentry receives technical crash reports with personal data switched off. Railway and Vercel host the service. We disclose information to authorities only when the law requires it." },
  { title: "How long we keep it", body: "Account data: while your account is active, plus 30 days after deletion. Booking history: 24 months from the appointment. Payment transaction IDs: 5 years, as Indian financial rules require. OTPs: deleted within 5 minutes. Login sessions: access tokens last 1 day and refresh tokens 14 days. After that the data is permanently deleted." },
  { title: "Deleting your account", body: "Email support@tokenwalla.com with the subject Account Deletion Request and your registered mobile number. We act within 7 business days and confirm when done. Your name, mobile and booking history are deleted; payment transaction IDs stay for 5 years but are no longer linked to you. Please cancel upcoming bookings first so any refund is processed." },
  { title: "Security", body: "All data travels over HTTPS (TLS 1.2 or higher). Data is stored encrypted at rest by our database host. Passwords are hashed and never stored in plain text. Login sessions are short-lived and can be ended on logout. Requests are rate-limited to stop abuse. No system is perfectly secure; tell us at once if you suspect unauthorised access." },
  { title: "Local storage", body: "The app keeps your login tokens and language choice on your device so you stay signed in; logging out clears them. We use no advertising or tracking cookies and no usage-analytics tools." },
  { title: "Children", body: "TokenWalla is for people aged 18 and over. We do not knowingly collect data from anyone younger and will delete it if we find it." },
  { title: "Your rights", body: "You can ask to see, correct or delete your data, to receive your booking history in CSV or JSON, or to withdraw consent, by emailing support@tokenwalla.com. We reply within 30 days." },
  { title: "Changes to this policy", body: "When we make material changes we update the date above and tell you in the app. Earlier versions are available on request." },
];

export default function PrivacyScreen() {
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
          <Text style={styles.title}>Privacy Policy</Text>
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