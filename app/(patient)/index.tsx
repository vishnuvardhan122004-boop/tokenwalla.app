import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, FlatList, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Colors } from '../../constants/colors';
import API from '../../services/api';

const STEPS = [
  { icon: '🔍', title: 'Find a Doctor',   desc: 'Browse by specialization & city' },
  { icon: '📅', title: 'Pick a Slot',     desc: 'Choose date and time in seconds' },
  { icon: '💳', title: 'Pay ₹15',         desc: 'Secure payment via UPI / cards'  },
  { icon: '🏥', title: 'Walk In on Time', desc: 'Track live queue from anywhere'  },
];

export default function HomeScreen() {
  const router   = useRouter();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/doctors/')
      .then(({ data }) => setDoctors(data.slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>TW</Text>
          </View>
          <Text style={styles.brandName}>
            <Text style={styles.accent}>Token</Text>walla
          </Text>
        </View>
      </View>

      {/* ── Hero ── */}
      <View style={styles.heroSection}>
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>Live in AP & Telangana</Text>
        </View>

        <Text style={styles.heroTitle}>
          Skip the Queue.{'\n'}
          <Text style={styles.accent}>Book Your Token{'\n'}</Text>
          Online.
        </Text>

        <Text style={styles.heroSub}>
          Book a doctor slot, get a digital token, and
          walk in right on time. No more waiting rooms.
        </Text>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(patient)/doctors')}
        >
          <Text style={styles.primaryBtnText}>Book Appointment →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => router.push('/(hospital)/login')}
        >
          <Text style={styles.outlineBtnText}>Hospital Login</Text>
        </TouchableOpacity>
      </View>

      {/* ── Stats ── */}
      <View style={styles.statsRow}>
        {[
          { num: '2,400+', label: 'Tokens Issued'  },
          { num: '18',     label: 'Hospitals'      },
          { num: '94%',    label: 'On-time Rate'   },
          { num: '4.8★',   label: 'Rating'         },
        ].map((s, i) => (
          <View key={i} style={styles.statItem}>
            <Text style={styles.statNum}>{s.num}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── How it Works ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
        <Text style={styles.sectionTitle}>Book in 4 Simple Steps</Text>
        {STEPS.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={styles.stepNumBox}>
              <Text style={styles.stepNum}>0{i + 1}</Text>
            </View>
            <View style={styles.stepIconBox}>
              <Text style={{ fontSize: 20 }}>{step.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDesc}>{step.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Doctors Preview ── */}
      {doctors.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Doctors Near You</Text>
            <TouchableOpacity onPress={() => router.push('/(patient)/doctors')}>
              <Text style={styles.viewAll}>View All →</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {doctors.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                style={styles.docCard}
                onPress={() => router.push(`/(patient)/doctor/${doc.id}`)}
              >
                <View style={styles.docImgBox}>
                  <Text style={{ fontSize: 32 }}>🩺</Text>
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docSpec}>{doc.specialization}</Text>
                  <Text style={styles.docName}>Dr. {doc.name}</Text>
                  <Text style={styles.docMeta}>📍 {doc.city} · {doc.experience}y</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Price Card ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PRICING</Text>
        <View style={styles.priceCard}>
          <Text style={styles.priceBadge}>Best Value</Text>
          <Text style={styles.priceName}>Queue View</Text>
          <Text style={styles.priceAmount}>₹15</Text>
          <Text style={styles.priceSub}>Per appointment · No hidden fees</Text>
          {[
            'Confirmed token number',
            'Live queue position',
            'Instant confirmation',
            'UPI / Cards / Wallets',
          ].map((f) => (
            <Text key={f} style={styles.priceFeature}>✓  {f}</Text>
          ))}
          <TouchableOpacity
            style={styles.priceBtn}
            onPress={() => router.push('/(patient)/doctors')}
          >
            <Text style={styles.priceBtnText}>Book Appointment →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.white },
  header:     { backgroundColor: Colors.white, padding: 16, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox:    { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  logoText:   { color: Colors.white, fontWeight: '800', fontSize: 13 },
  brandName:  { fontSize: 18, fontWeight: '800', color: Colors.gray900 },
  accent:     { color: Colors.blue600 },

  heroSection: { padding: 24, paddingTop: 32, backgroundColor: Colors.bg },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 18 },
  badgeDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.successText },
  badgeText:   { fontSize: 12, color: Colors.blue700, fontWeight: '500' },
  heroTitle:   { fontSize: 30, fontWeight: '800', color: Colors.gray900, marginBottom: 14, lineHeight: 36 },
  heroSub:     { fontSize: 15, color: Colors.gray600, lineHeight: 23, marginBottom: 28 },
  primaryBtn:  { backgroundColor: Colors.blue600, borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  outlineBtn:  { borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, padding: 14, alignItems: 'center' },
  outlineBtnText: { color: Colors.blue600, fontWeight: '600', fontSize: 15 },

  statsRow:   { flexDirection: 'row', backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.blue100, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  statItem:   { flex: 1, alignItems: 'center', paddingVertical: 18, borderRightWidth: 1, borderRightColor: Colors.blue100 },
  statNum:    { fontSize: 18, fontWeight: '800', color: Colors.blue600 },
  statLabel:  { fontSize: 11, color: Colors.gray500, marginTop: 2 },

  section:      { padding: 24 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginBottom: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 18 },
  viewAll:      { fontSize: 14, color: Colors.blue600, fontWeight: '600' },

  stepCard:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 16, marginBottom: 12 },
  stepNumBox:  { width: 32, alignItems: 'center' },
  stepNum:     { fontSize: 22, fontWeight: '800', color: Colors.blue100 },
  stepIconBox: { width: 42, height: 42, borderRadius: 11, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center' },
  stepTitle:   { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 3 },
  stepDesc:    { fontSize: 13, color: Colors.gray500 },

  docCard:   { width: 160, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, marginRight: 14, overflow: 'hidden' },
  docImgBox: { height: 100, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  docInfo:   { padding: 12 },
  docSpec:   { fontSize: 10, fontWeight: '700', color: Colors.blue600, letterSpacing: 1, textTransform: 'uppercase' },
  docName:   { fontSize: 13, fontWeight: '700', color: Colors.gray900, marginVertical: 3 },
  docMeta:   { fontSize: 11, color: Colors.gray500 },

  priceCard:    { backgroundColor: Colors.blue600, borderRadius: 20, padding: 28 },
  priceBadge:   { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4, fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '700', marginBottom: 16 },
  priceName:    { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  priceAmount:  { fontSize: 48, fontWeight: '800', color: Colors.white, lineHeight: 52, marginBottom: 4 },
  priceSub:     { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
  priceFeature: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 10 },
  priceBtn:     { backgroundColor: Colors.white, borderRadius: 11, padding: 13, alignItems: 'center', marginTop: 20 },
  priceBtnText: { color: Colors.blue700, fontWeight: '700', fontSize: 14 },
});