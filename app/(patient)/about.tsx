import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { safeBack } from '../../utils/navigation';
const STATS = [
  { num: '2,400+', label: 'Tokens Issued'  },
  { num: '18',     label: 'Hospitals'      },
  { num: '94%',    label: 'On-time Rate'   },
  { num: '4.8★',   label: 'Patient Rating' },
];

const VALUES = [
  { icon: '♻️', title: 'Zero Waiting Rooms',  desc: 'Patients arrive when their number is close. Hospitals run on schedule.' },
  { icon: '🔐', title: 'Privacy First',        desc: 'Patient data is encrypted and never sold. Period.'                      },
  { icon: '🌐', title: 'Accessible Anywhere',  desc: 'Works on any device. No waiting room needed.'                          },
  { icon: '⚡', title: 'Real-time Queue',      desc: 'Live position tracking refreshed every 15 seconds.'                    },
];

export default function AboutScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>ABOUT TOKENWALLA</Text>
          <Text style={styles.title}>We built a smarter{'\n'}way to see a <Text style={styles.accent}>doctor</Text></Text>
          <Text style={styles.sub}>
            TokenWalla replaces chaotic hospital waiting rooms with digital tokens
            and live queue tracking — so patients arrive on time and hospitals run smoothly.
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {STATS.map((s, i) => (
            <View key={i} style={[styles.statItem, i % 2 === 0 && styles.statBorderRight]}>
              <Text style={styles.statNum}>{s.num}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Mission */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>OUR MISSION</Text>
          <Text style={styles.sectionTitle}>Healthcare that respects your time</Text>
          <Text style={styles.bodyText}>
            TokenWalla is a smart hospital token and queue management platform designed
            to close the gap between patients and doctors. Nobody should spend hours in
            a waiting room when a mobile notification can tell you exactly when to arrive.
          </Text>
          <Text style={[styles.bodyText, { marginTop: 12 }]}>
            Currently live in Andhra Pradesh and Telangana, we're expanding hospital by
            hospital, city by city — making every visit predictable, fair, and stress-free.
          </Text>
        </View>

        {/* Values */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WHY TOKENWALLA</Text>
          <Text style={styles.sectionTitle}>Built for real healthcare</Text>
          <View style={styles.valuesGrid}>
            {VALUES.map((v, i) => (
              <View key={i} style={styles.valueCard}>
                <Text style={{ fontSize: 24, marginBottom: 10 }}>{v.icon}</Text>
                <Text style={styles.valueTitle}>{v.title}</Text>
                <Text style={styles.valueDesc}>{v.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA */}
        <View style={styles.ctaBanner}>
          <Text style={styles.ctaTitle}>Ready to try TokenWalla?</Text>
          <Text style={styles.ctaSub}>Book your first appointment in under 2 minutes.</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/(patient)/doctors')}>
            <Text style={styles.ctaBtnText}>Find a Doctor →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },

  header:      { backgroundColor: Colors.bg, padding: 20, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  backBtn:     { marginBottom: 16 },
  backText:    { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginBottom: 10 },
  title:       { fontSize: 26, fontWeight: '800', color: Colors.gray900, lineHeight: 33, marginBottom: 12 },
  accent:      { color: Colors.blue600 },
  sub:         { fontSize: 14, color: Colors.gray500, lineHeight: 22 },

  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  statItem:       { width: '50%', alignItems: 'center', paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  statBorderRight: { borderRightWidth: 1, borderRightColor: Colors.blue100 },
  statNum:        { fontSize: 24, fontWeight: '800', color: Colors.blue600, marginBottom: 4 },
  statLabel:      { fontSize: 12, color: Colors.gray400 },

  section:      { padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 14 },
  bodyText:     { fontSize: 14, color: Colors.gray500, lineHeight: 22 },

  valuesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  valueCard:  { width: '47%', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 16 },
  valueTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
  valueDesc:  { fontSize: 12, color: Colors.gray500, lineHeight: 17 },

  ctaBanner: { backgroundColor: Colors.blue600, margin: 20, borderRadius: 20, padding: 28, alignItems: 'center' },
  ctaTitle:  { fontSize: 20, fontWeight: '800', color: Colors.white, marginBottom: 8, textAlign: 'center' },
  ctaSub:    { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 20, textAlign: 'center' },
  ctaBtn:    { backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13 },
  ctaBtnText: { color: Colors.blue700, fontWeight: '700', fontSize: 14 },
});