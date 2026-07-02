import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';

const SECTIONS = [
  { title: '1. Eligibility',            body: 'You must be at least 18 years old and capable of entering into a legally binding contract to use TokenWalla services.' },
  { title: '2. Services',               body: 'TokenWalla provides hospital token booking services to reduce patient wait times. We are not a medical provider and are not responsible for medical outcomes.' },
  { title: '3. Account Responsibility', body: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.' },
  { title: '4. Accurate Information',   body: 'Users agree to provide accurate, current, and complete information while registering and booking. Misuse or false information may lead to account suspension.' },
  { title: '5. Payments',               body: 'All payments are processed via Razorpay. Orders are confirmed only after successful payment. TokenWalla does not store card details.' },
  { title: '6. Cancellations',          body: 'You may cancel a waiting booking at least 2 hours before your slot. Refunds are processed within 5–7 business days to your original payment method.' },
  { title: '7. Limitation of Liability', body: 'TokenWalla is not liable for any direct or indirect damages resulting from your use of the platform, including delays in medical care or hospital-side cancellations.' },
  { title: '8. Governing Law',          body: 'These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in Andhra Pradesh.' },
];

export default function TermsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>LEGAL</Text>
          <Text style={styles.title}>Terms & Conditions</Text>
          <Text style={styles.updated}>Last updated: March 2026</Text>
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
  body:    { padding: 20 },
  section:      { marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.blue600, marginBottom: 8 },
  sectionBody:  { fontSize: 14, color: Colors.gray500, lineHeight: 22 },
  contactBox:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 14, padding: 18, marginTop: 8 },
  contactTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 6 },
  contactText:  { fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});