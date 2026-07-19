/**
 * app/(hospital)/analytics.tsx — Hospital "Today's Overview" analytics.
 *
 * Built entirely from data the hospital can already read:
 *   GET /bookings/queue/<id>/   → { waiting, inProgress, completed }
 *   GET /doctors/?hospital=<id> → doctor list
 * No new backend endpoint required.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API from '../../services/api';

interface Patient { doctor_name?: string; slot?: string; }

export default function HospitalAnalytics() {
  const router = useRouter();

  const [hospitalId, setHospitalId] = useState<string | number | null>(null);
  const [queue, setQueue] = useState<{ waiting: Patient[]; inProgress: Patient[]; completed: Patient[] }>({ waiting: [], inProgress: [], completed: [] });
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (id: string | number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [q, d] = await Promise.all([
        API.get(`/bookings/queue/${id}/`),
        API.get(`/doctors/?hospital=${id}`),
      ]);
      setQueue({
        waiting:    Array.isArray(q.data.waiting)    ? q.data.waiting    : [],
        inProgress: Array.isArray(q.data.inProgress) ? q.data.inProgress : [],
        completed:  Array.isArray(q.data.completed)  ? q.data.completed  : [],
      });
      const list = Array.isArray(d.data) ? d.data : (d.data.results || []);
      setDoctors(list);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) { router.replace('/(hospital)/login'); return; }
      const user = JSON.parse(raw);
      if (user.role !== 'hospital' || !user.hospital) { router.replace('/(hospital)/login'); return; }
      setHospitalId(user.hospital.id);
      load(user.hospital.id);
    })();
  }, []);

  const allToday = [...queue.waiting, ...queue.inProgress, ...queue.completed];
  const total = allToday.length;

  // Per-doctor patient counts (today)
  const byDoctor = Object.entries(
    allToday.reduce<Record<string, number>>((acc, p) => {
      const k = p.doctor_name || 'Unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // Busiest slots (today)
  const bySlot = Object.entries(
    allToday.reduce<Record<string, number>>((acc, p) => {
      if (!p.slot) return acc;
      acc[p.slot] = (acc[p.slot] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const availableDocs = doctors.filter(d => d.available).length;
  const completionRate = total > 0 ? Math.round((queue.completed.length / total) * 100) : 0;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.blue600} /></View>;
  }

  const STATS = [
    { label: 'Today Total',  val: total,                   color: Colors.blue600     },
    { label: 'Waiting',      val: queue.waiting.length,    color: Colors.warningText  },
    { label: 'In Progress',  val: queue.inProgress.length, color: Colors.blue400      },
    { label: 'Completed',    val: queue.completed.length,  color: Colors.successText  },
    { label: 'Doctors',      val: doctors.length,          color: Colors.gray800      },
    { label: 'Available',    val: availableDocs,           color: Colors.successText  },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(hospital)/dashboard')}>
          <Text style={styles.backBtnText}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 Analytics</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (hospitalId != null) { setRefreshing(true); load(hospitalId, true); } }} tintColor={Colors.blue600} />}
      >
        <Text style={styles.sectionTitle}>Today&apos;s Overview</Text>

        {/* Stat grid */}
        <View style={styles.statsGrid}>
          {STATS.map(({ label, val, color }) => (
            <View key={label} style={styles.statCard}>
              <Text style={[styles.statNum, { color }]}>{val}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Completion rate */}
        <View style={styles.rateCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rateLabel}>Completion Rate (today)</Text>
            <Text style={styles.rateSub}>{queue.completed.length} of {total} attended</Text>
          </View>
          <Text style={styles.ratePct}>{completionRate}%</Text>
        </View>

        {/* Per-doctor */}
        <Text style={styles.sectionTitle}>Patients per Doctor</Text>
        <View style={styles.card}>
          {byDoctor.length === 0 ? (
            <Text style={styles.empty}>No bookings today yet</Text>
          ) : byDoctor.map(([name, count]) => {
            const pct = total > 0 ? (count / total) : 0;
            return (
              <View key={name} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1}>Dr. {name}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(6, pct * 100)}%` }]} />
                </View>
                <Text style={styles.barVal}>{count}</Text>
              </View>
            );
          })}
        </View>

        {/* Busiest slots */}
        <Text style={styles.sectionTitle}>Busiest Slots</Text>
        <View style={styles.card}>
          {bySlot.length === 0 ? (
            <Text style={styles.empty}>No bookings today yet</Text>
          ) : bySlot.map(([slot, count]) => (
            <View key={slot} style={styles.slotRow}>
              <Text style={styles.slotTime}>🕐 {slot}</Text>
              <Text style={styles.slotCount}>{count} patient{count !== 1 ? 's' : ''}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footNote}>Live snapshot · pull down to refresh</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.white },
  backBtn:     { width: 90 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.blue600 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginTop: 8, marginBottom: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard:  { width: '31%', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 14, alignItems: 'center' },
  statNum:   { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 11, color: Colors.gray400, textAlign: 'center' },

  rateCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.blue600, borderRadius: 16, padding: 18, marginBottom: 20 },
  rateLabel: { fontSize: 14, fontWeight: '700', color: Colors.white, marginBottom: 2 },
  rateSub:   { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  ratePct:   { fontSize: 34, fontWeight: '800', color: Colors.white },

  card:  { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 14, marginBottom: 20 },
  empty: { fontSize: 13, color: Colors.gray400, textAlign: 'center', paddingVertical: 12, fontStyle: 'italic' },

  barRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  barLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray800, width: 110 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: Colors.blue50, overflow: 'hidden' },
  barFill:  { height: 10, borderRadius: 5, backgroundColor: Colors.blue600 },
  barVal:   { fontSize: 13, fontWeight: '800', color: Colors.blue600, width: 26, textAlign: 'right' },

  slotRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  slotTime:  { fontSize: 14, fontWeight: '600', color: Colors.gray800 },
  slotCount: { fontSize: 13, fontWeight: '700', color: Colors.blue600 },

  footNote: { fontSize: 11, color: Colors.gray400, textAlign: 'center' },
});
