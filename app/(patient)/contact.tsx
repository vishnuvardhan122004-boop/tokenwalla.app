import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert, Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { safeBack } from '../../utils/navigation';

export default function ContactScreen() {
  const router = useRouter();
  const [name,    setName]    = useState('');
  const [mobile,  setMobile]  = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = () => {
    if (!name || !mobile || !message) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      Alert.alert('Error', 'Enter a valid 10-digit mobile number');
      return;
    }
    const mailSubject = encodeURIComponent(`[TokenWalla] ${subject || 'Support Request'}`);
    const mailBody    = encodeURIComponent(`Name: ${name}\nMobile: ${mobile}\n\n${message}`);
    Linking.openURL(`mailto:support@tokenwalla.com?subject=${mailSubject}&body=${mailBody}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>GET IN TOUCH</Text>
          <Text style={styles.title}>Contact Us</Text>
          <Text style={styles.sub}>We're here to help. Reach out and we'll respond as soon as possible.</Text>
        </View>

        {/* Contact Info Cards */}
        <View style={styles.contactGrid}>
          {[
            { icon: '📧', label: 'Email',  value: 'support@tokenwalla.com', onPress: () => Linking.openURL('mailto:support@tokenwalla.com') },
            { icon: '📞', label: 'Phone',  value: '+91-7286995933',       onPress: () => Linking.openURL('tel:+917286995933')          },
            { icon: '💬', label: 'WhatsApp', value: 'Chat with us',       onPress: () => Linking.openURL('https://wa.me/917286995933') },
            { icon: '🏢', label: 'Office', value: 'Hindupur, AP 515201', onPress: null },
          ].map(({ icon, label, value, onPress }) => (
            <TouchableOpacity
              key={label}
              style={styles.contactCard}
              onPress={onPress || undefined}
              disabled={!onPress}
            >
              <Text style={{ fontSize: 26, marginBottom: 8 }}>{icon}</Text>
              <Text style={styles.contactLabel}>{label}</Text>
              <Text style={styles.contactValue}>{value}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Support Hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support Hours</Text>
          {[
            { day: 'Mon – Fri', time: '9:00 AM – 6:00 PM' },
            { day: 'Saturday',  time: '9:00 AM – 1:00 PM' },
            { day: 'Sunday',    time: 'Closed'             },
          ].map(h => (
            <View key={h.day} style={styles.hoursRow}>
              <Text style={styles.hoursDay}>{h.day}</Text>
              <Text style={styles.hoursTime}>{h.time}</Text>
            </View>
          ))}
        </View>

        {/* Message Form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send a Message</Text>
          <Text style={styles.fieldLabel}>Your Name *</Text>
          <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={Colors.gray400} value={name} onChangeText={setName} />

          <Text style={styles.fieldLabel}>Mobile *</Text>
          <TextInput style={styles.input} placeholder="10-digit mobile" placeholderTextColor={Colors.gray400} keyboardType="numeric" maxLength={10} value={mobile} onChangeText={setMobile} />

          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput style={styles.input} placeholder="What is this about?" placeholderTextColor={Colors.gray400} value={subject} onChangeText={setSubject} />

          <Text style={styles.fieldLabel}>Message *</Text>
          <TextInput
            style={[styles.input, { height: 110, textAlignVertical: 'top' }]}
            placeholder="Describe your issue or question..."
            placeholderTextColor={Colors.gray400}
            multiline
            value={message}
            onChangeText={setMessage}
          />

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Text style={styles.submitBtnText}>Send Message →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.white },
  header: { backgroundColor: Colors.bg, padding: 20, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  backBtn:  { marginBottom: 16 },
  backText: { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.gray900, marginBottom: 8 },
  sub:   { fontSize: 14, color: Colors.gray500, lineHeight: 21 },

  contactGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  contactCard:  { width: '47%', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, padding: 16, alignItems: 'center' },
  contactLabel: { fontSize: 11, fontWeight: '700', color: Colors.gray400, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  contactValue: { fontSize: 13, fontWeight: '600', color: Colors.blue600, textAlign: 'center' },

  section:      { padding: 20, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.gray900, marginBottom: 16 },

  hoursRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  hoursDay:  { fontSize: 14, fontWeight: '600', color: Colors.gray700 },
  hoursTime: { fontSize: 14, color: Colors.gray500 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7 },
  input:      { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.gray900, marginBottom: 14 },

  submitBtn:     { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
});