/**
 * app/(patient)/MyBookings.tsx
 *
 * NOTE: react-native-razorpay is NOT used here or anywhere in this file.
 * Payment is handled entirely inside RescheduleModal via react-native-webview.
 * If you previously installed react-native-razorpay, uninstall it:
 *   npm uninstall react-native-razorpay
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RescheduleModal from '../../components/RescheduleModal';
import { Colors } from '../../constants/colors';
import API, { getUser } from '../../services/api';
import { useI18n } from '../../services/i18n';
import { syncAppointmentReminders } from '../../services/notifications';

// status → translation key (labels themselves are resolved with t() at render)
const STATUS_LABEL_KEY: Record<string, string> = {
  waiting:     'status_waiting',
  in_progress: 'status_in_consult',
  completed:   'status_completed',
  cancelled:   'status_cancelled',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RESCHEDULE_FEE = 5;

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; border: string }> = {
  waiting:     { label: 'Waiting',         bg: Colors.warningBg,  text: Colors.warningText,  border: Colors.warningBorder  },
  in_progress: { label: 'In Consultation', bg: Colors.blue50,     text: Colors.blue600,      border: Colors.blue200        },
  completed:   { label: 'Completed',       bg: Colors.successBg,  text: Colors.successText,  border: Colors.successBorder  },
  cancelled:   { label: 'Cancelled',       bg: Colors.gray100,    text: Colors.gray500,      border: Colors.gray200        },
};

const TABS = [
  { key: 'all',       labelKey: 'tab_all'    },
  { key: 'active',    labelKey: 'tab_active' },
  { key: 'completed', labelKey: 'tab_done'   },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Booking { [key: string]: any }

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MyBookings() {
  const router = useRouter();
  const { t } = useI18n();

  const [bookings,          setBookings]          = useState<Booking[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState(false);
  const [refreshing,        setRefreshing]        = useState(false);
  const [tab,               setTab]               = useState('all');
  const [user,              setUser]              = useState<any>(null);
  const [cancelling,        setCancelling]        = useState<number | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { getUser().then(setUser); }, []);

  const fetchBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const { data } = await API.get('/bookings/my/');
      const list = Array.isArray(data) ? data : (data?.results || []);
      setBookings(list);
      setError(false);
      // Keep the ~2.1h reminders in sync with the latest date/slot/status.
      syncAppointmentReminders(list);
    } catch {
      // Only surface an error when we have nothing to show — a failed silent
      // poll shouldn't wipe the list the user is already looking at.
      setBookings(prev => { if (prev.length === 0) setError(true); return prev; });
    }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchBookings();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchBookings]));

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const hasActive = bookings.some(b => b.status === 'waiting' || b.status === 'in_progress');
    if (hasActive) {
      pollingRef.current = setInterval(() => fetchBookings(true), 15_000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [bookings, fetchBookings]);

  const handleCancel = (booking: Booking) => {
    Alert.alert(
      'Cancel Appointment',
      `Cancel with Dr. ${booking.doctor_name}?\n\nRefunds are processed within 5–7 business days.`,
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Yes, Cancel', style: 'destructive',
          onPress: async () => {
            setCancelling(booking.id);
            try {
              await API.patch(`/bookings/cancel/${booking.id}/`);
              fetchBookings(true);
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'Failed to cancel booking.');
            } finally {
              setCancelling(null);
            }
          },
        },
      ],
    );
  };

  const queueMsg = (pos: number | null | undefined) => {
    if (pos == null) return 'Loading queue position…';
    if (pos === 0)   return '✅ Your turn — go in now!';
    if (pos === 1)   return "You're next! Head to the clinic.";
    return `${pos - 1} patient${pos > 2 ? 's' : ''} ahead of you`;
  };

  const filtered = bookings.filter(b => {
    if (tab === 'active')    return b.status === 'waiting' || b.status === 'in_progress';
    if (tab === 'completed') return b.status === 'completed' || b.status === 'cancelled';
    return true;
  });
  const activeCount = bookings.filter(
    b => b.status === 'waiting' || b.status === 'in_progress'
  ).length;

  // ── Not logged in ─────────────────────────────────────────────────────────

  if (!user) return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.centreBox}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>🎫</Text>
        <Text style={st.emptyTitle}>{t('login_to_view_bookings')}</Text>
        <Text style={st.emptySub}>
          {t('login_to_view_bookings_sub')}
        </Text>
        <TouchableOpacity style={st.primaryBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={st.primaryBtnText}>{t('login_arrow')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={st.safe} edges={['top']}>

      {/* Header */}
      <View style={st.header}>
        <Text style={st.title}>{t('my_bookings')}</Text>
        <Text style={st.sub}>
          {loading ? t('loading_ellipsis') : t('bookings_summary', { total: bookings.length, active: activeCount })}
        </Text>
        <View style={st.tabRow}>
          {TABS.map(tb => (
            <TouchableOpacity
              key={tb.key}
              style={[st.tabBtn, tab === tb.key && st.tabBtnActive]}
              onPress={() => setTab(tb.key)}
            >
              <Text style={[st.tabText, tab === tb.key && st.tabTextActive]}>
                {t(tb.labelKey)}{tb.key === 'active' && activeCount > 0 ? ` (${activeCount})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Loading */}
      {loading ? (
        <View style={st.centreLoader}>
          <ActivityIndicator size="large" color={Colors.blue600} />
        </View>

      /* Error */
      ) : error && bookings.length === 0 ? (
        <View style={st.centreBox}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>📡</Text>
          <Text style={st.emptyTitle}>{t('cant_load_bookings')}</Text>
          <Text style={st.emptySub}>{t('connection_error')}</Text>
          <TouchableOpacity style={st.primaryBtn} onPress={() => fetchBookings()}>
            <Text style={st.primaryBtnText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>

      /* Empty */
      ) : filtered.length === 0 ? (
        <ScrollView
          contentContainerStyle={st.centreBox}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings(true)} tintColor={Colors.blue600} />
          }
        >
          <Text style={{ fontSize: 52, marginBottom: 12 }}>🎫</Text>
          <Text style={st.emptyTitle}>
            {tab === 'active' ? t('no_active_bookings_lc') : t('no_bookings_yet')}
          </Text>
          <Text style={st.emptySub}>
            {tab === 'active' ? t('active_appts_here') : t('book_first_appt')}
          </Text>
          <TouchableOpacity style={st.primaryBtn} onPress={() => router.push('/(patient)/doctors')}>
            <Text style={st.primaryBtnText}>{t('find_doctors_arrow')}</Text>
          </TouchableOpacity>
        </ScrollView>

      /* List */
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings(true)} tintColor={Colors.blue600} />
          }
        >
          {filtered.map(booking => {
            const s         = STATUS_MAP[booking.status] ?? STATUS_MAP.cancelled;
            const isActive  = booking.status === 'waiting' || booking.status === 'in_progress';
            const isWaiting = booking.status === 'waiting';

            return (
              <View key={booking.id} style={st.card}>

                <View style={[st.cardAccent, { backgroundColor: s.text }]} />

                <View style={st.cardBody}>
                  <View style={st.tokenCol}>
                    <Text style={st.tokenLabel}>TOKEN</Text>
                    <Text style={st.tokenNum} numberOfLines={2}>
                      {booking.token?.replace('TW-', '#')}
                    </Text>
                  </View>

                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <View style={[st.statusBadge, { backgroundColor: s.bg, borderColor: s.border }]}>
                      {isActive && <View style={[st.statusDot, { backgroundColor: s.text }]} />}
                      <Text style={[st.statusText, { color: s.text }]}>{t(STATUS_LABEL_KEY[booking.status] ?? 'status_cancelled')}</Text>
                    </View>
                    <Text style={st.doctorName}>Dr. {booking.doctor_name}</Text>
                    <Text style={st.hospitalName}>🏥 {booking.hospital_name}</Text>
                    {booking.hospital_mobile ? (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${booking.hospital_mobile}`)}>
                        <Text style={st.callHospital}>📞 Call hospital · {booking.hospital_mobile}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={st.metaRow}>
                      <Text style={st.metaChip}>📅 {booking.date}</Text>
                      <Text style={st.metaChip}>🕐 {booking.slot}</Text>
                    </View>
                    <Text style={st.amount}>₹{booking.amount}</Text>
                  </View>
                </View>

                {/* Queue panel */}
                {isActive && booking.queue_access && (
                  <View style={st.queuePanel}>
                    <View style={st.queueCircle}>
                      <Text style={st.queueNum}>
                        {booking.status === 'in_progress' ? '🔔' : (booking.queue_position ?? '…')}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.queueLabel}>{t('your_queue_position')}</Text>
                      <Text style={st.queueDesc}>
                        {booking.status === 'in_progress'
                          ? t('your_turn')
                          : queueMsg(booking.queue_position)}
                      </Text>
                      <Text style={st.queueNote}>{t('auto_refresh_15')}</Text>
                    </View>
                  </View>
                )}

                {/* Show QR — quick check-in at reception */}
                {isActive && (
                  <TouchableOpacity
                    style={st.qrBtn}
                    onPress={() => router.push('/(patient)/my-qr')}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 16 }}>📷</Text>
                    <Text style={st.qrBtnText}>{t('show_qr_checkin')}</Text>
                  </TouchableOpacity>
                )}

                {/* Action row */}
                {isWaiting && (
                  <View style={st.actionRow}>
                    <TouchableOpacity
                      style={st.rescheduleBtn}
                      onPress={() => setRescheduleBooking(booking)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 18 }}>📅</Text>
                      <View>
                        <Text style={st.rescheduleBtnTitle}>{t('reschedule')}</Text>
                        <Text style={st.rescheduleBtnFee}>{t('reschedule_fee', { fee: RESCHEDULE_FEE })}</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[st.cancelBtn, cancelling === booking.id && { opacity: 0.5 }]}
                      onPress={() => handleCancel(booking)}
                      disabled={cancelling === booking.id}
                      activeOpacity={0.7}
                    >
                      {cancelling === booking.id ? (
                        <ActivityIndicator size="small" color={Colors.errorText} />
                      ) : (
                        <>
                          <Text style={{ fontSize: 18 }}>❌</Text>
                          <View>
                            <Text style={st.cancelBtnTitle}>{t('cancel')}</Text>
                            <Text style={st.cancelBtnFee}>{t('refund_in_days')}</Text>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* RescheduleModal — WebView-based, no react-native-razorpay */}
      <RescheduleModal
        visible={!!rescheduleBooking}
        booking={rescheduleBooking}
        onClose={() => setRescheduleBooking(null)}
        onSuccess={() => fetchBookings(true)}
        user={user}
      />

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.white },
  centreLoader:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  centreBox:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },

  header: {
    padding: 20, paddingBottom: 0,
    borderBottomWidth: 1, borderBottomColor: Colors.blue100,
    backgroundColor: Colors.bg ?? Colors.white,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.gray900, marginBottom: 2 },
  sub:   { fontSize: 14, color: Colors.gray400, marginBottom: 14 },

  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.blue50,
    borderWidth: 1, borderColor: Colors.blue100,
    borderRadius: 12, padding: 4, marginBottom: 14, gap: 4,
  },
  tabBtn:        { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabBtnActive:  { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  tabText:       { fontSize: 13, fontWeight: '500', color: Colors.gray400 },
  tabTextActive: { color: Colors.blue700 ?? Colors.blue600, fontWeight: '700' },

  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray600 ?? Colors.gray500, marginBottom: 8, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: Colors.gray400, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  primaryBtn: { backgroundColor: Colors.blue600, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14, marginTop: 4 },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  card: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100,
    borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardAccent: { height: 3 },
  cardBody:   { flexDirection: 'row' },

  tokenCol: {
    width: 90, alignItems: 'center', justifyContent: 'center', padding: 16,
    backgroundColor: Colors.blue50, borderRightWidth: 1, borderRightColor: Colors.blue100,
  },
  tokenLabel: { fontSize: 9, fontWeight: '700', color: Colors.blue400 ?? Colors.blue200, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  tokenNum:   { fontFamily: 'monospace', fontSize: 14, fontWeight: '600', color: Colors.blue600, textAlign: 'center' },

  statusBadge:  { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, marginTop: 12, marginBottom: 8, gap: 5 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  doctorName:   { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 3 },
  hospitalName: { fontSize: 12, color: Colors.gray500, marginBottom: 4 },
  callHospital: { fontSize: 12, fontWeight: '700', color: Colors.blue600, marginBottom: 8 },
  metaRow:      { flexDirection: 'row', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  metaChip:     { fontSize: 12, color: Colors.gray400 },
  amount:       { fontSize: 13, fontWeight: '700', color: Colors.blue600, paddingBottom: 12 },

  queuePanel:  { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F0F9FF', borderTopWidth: 1, borderTopColor: Colors.blue100, padding: 14 },
  queueCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.blue50, borderWidth: 2, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  queueNum:    { fontSize: 16, fontWeight: '800', color: Colors.blue600 },
  queueLabel:  { fontSize: 11, color: Colors.gray400, marginBottom: 2 },
  queueDesc:   { fontSize: 13, fontWeight: '600', color: Colors.blue600 },
  queueNote:   { fontSize: 10, color: Colors.gray400, marginTop: 2 },

  qrBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: Colors.blue600, borderTopWidth: 1, borderTopColor: Colors.blue100 },
  qrBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.blue50 },
  rescheduleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: Colors.blue50, borderRightWidth: 1, borderRightColor: Colors.blue100 },
  rescheduleBtnTitle: { fontSize: 13, fontWeight: '700', color: Colors.blue700 ?? Colors.blue600 },
  rescheduleBtnFee:   { fontSize: 11, color: Colors.blue600, marginTop: 1 },

  cancelBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: Colors.errorBg ?? '#FCEBEB' },
  cancelBtnTitle: { fontSize: 13, fontWeight: '700', color: Colors.errorText ?? '#A32D2D' },
  cancelBtnFee:   { fontSize: 11, color: Colors.errorText ?? '#A32D2D', marginTop: 1, opacity: 0.7 },
});