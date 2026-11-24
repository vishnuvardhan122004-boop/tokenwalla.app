/**
 * app/(patient)/MyBookings.tsx
 *
 * NOTE: react-native-razorpay is NOT used here or anywhere in this file.
 * Payment is handled entirely inside RescheduleModal via react-native-webview.
 * If you previously installed react-native-razorpay, uninstall it:
 *   npm uninstall react-native-razorpay
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import ReceiptModal from '../../components/ReceiptModal';
import RescheduleModal from '../../components/RescheduleModal';
import { SkeletonList } from '../../components/Skeleton';
import { Colors } from '../../constants/colors';
import API from '../../services/api';
import { openSharedDocument } from '../../services/reportFile';
import { useI18n } from '../../services/i18n';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { usePolling } from '../../hooks/usePolling';
import { syncAppointmentReminders } from '../../services/notifications';
import { normalizeBookingStatus, nearSlot, providerLabel, slotDateTime, toLocalISODate } from '../../utils/booking';
import { formatDelay } from '../../utils/formatDelay';
import { shareCapturedView } from '../../utils/shareCapture';
import { localName } from '../../utils/localize';
import { cancelNoteKey, cancelSubKey, shareMessage } from '../../utils/shareQueue';

// status → translation key (labels themselves are resolved with t() at render)
const STATUS_LABEL_KEY: Record<string, string> = {
  waiting:     'status_waiting',
  in_progress: 'status_in_consult',
  completed:   'status_completed',
  cancelled:   'status_cancelled',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RESCHEDULE_FEE = 12;   // must match a key of the backend's VALID_PLAN_AMOUNTS

// "10:30 AM" + 15min delay -> "10:45 AM". Reuses slotDateTime (utils/booking.ts)
// for the date math; no equivalent formatter exists there or nearby, so it's
// local to this screen (mirrors the website's addMinutesToSlot in MyBookings.js).
function addDelayToSlot(dateStr: string, slot: string, delayMinutes: number): string {
  const base = slotDateTime(dateStr, slot);
  if (!base) return slot;
  const adjusted = new Date(base.getTime() + delayMinutes * 60_000);
  const hour = adjusted.getHours() % 12 || 12;
  const min  = String(adjusted.getMinutes()).padStart(2, '0');
  return `${hour}:${min} ${adjusted.getHours() >= 12 ? 'PM' : 'AM'}`;
}

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
  const { t, lang } = useI18n();

  const [bookings,          setBookings]          = useState<Booking[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState(false);
  const [refreshing,        setRefreshing]        = useState(false);
  const [tab,               setTab]               = useState('all');
  const { user } = useCurrentUser({ refetchOnFocus: true });
  const [cancelling,        setCancelling]        = useState<number | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [receiptBooking,    setReceiptBooking]    = useState<Booking | null>(null);

  // Download ticket: render a full ticket (with QR) off-screen for the chosen
  // booking, snapshot it to a PNG, then open the share sheet. The list cards
  // have no QR of their own, so we capture a dedicated off-screen ticket view.
  const [downloadingId, setDownloadingId] = useState<string | number | null>(null);

  // { [bookingId]: report[] }. A scan's journey does not end at the visit — the
  // report comes back hours or days later, and this is the ONLY thing in the
  // product that arrives after a booking is COMPLETED. Fetched only for
  // completed SCAN bookings: a consultation has no report, and asking for one
  // on every card would be a request per booking for nothing.
  const [reports,      setReports]      = useState<Record<string, any[]>>({});
  const [reportBusyId, setReportBusyId] = useState<string | number | null>(null);
  const [ticketBooking, setTicketBooking] = useState<Booking | null>(null);
  const ticketRef = useRef<View>(null);

  const handleDownload = (booking: Booking) => {
    setDownloadingId(booking.id);
    setTicketBooking(booking);   // mounts the off-screen ticket → captured in the effect below
  };

  useEffect(() => {
    if (!ticketBooking) return;
    let cancelled = false;
    // Give the off-screen ticket + QR a moment to lay out and paint before capture.
    const timer = setTimeout(async () => {
      try {
        if (!(await shareCapturedView(ticketRef, t('mb_save_ticket')))) {
          Alert.alert(t('mb_not_available'), t('mb_save_unavailable'));
        }
      } catch {
        if (!cancelled) Alert.alert(t('error'), t('mb_ticket_failed'));
      } finally {
        if (!cancelled) { setTicketBooking(null); setDownloadingId(null); }
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ticketBooking, t]);

  // Keyed on the IDS, not on `bookings`. The list is re-fetched every 15s while
  // any booking is active, and each poll hands back a new array — so depending
  // on `bookings` re-ran this on every tick, one request per completed scan
  // forever, for data that changes about twice in its lifetime.
  // Any provider may share a document now — a hospital's discharge summary,
  // not just a centre's scan PDF.
  const completedScanIds = bookings
    .filter((b: Booking) => normalizeBookingStatus(b.status) === 'completed')
    .map((b: Booking) => String(b.id))
    .join(',');

  useEffect(() => {
    if (!completedScanIds) return;
    let cancelled = false;
    Promise.all(completedScanIds.split(',').map(id =>
      API.get(`/bookings/${id}/reports/`)
        .then(({ data }) => [id, Array.isArray(data) ? data : []])
        .catch(() => [id, []]),   // 404 on a backend without reports yet
    )).then(pairs => { if (!cancelled) setReports(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [completedScanIds]);

  const openReport = async (report: any) => {
    setReportBusyId(report.id);
    try {
      await openSharedDocument(report);
    } catch {
      Alert.alert(t('error'), t('mb_open_file_failed'));
    } finally {
      setReportBusyId(null);
    }
  };

  // 'load' = screen focus / retry, 'pull' = the user's pull-to-refresh (shows its
  // spinner), 'poll' = background refresh (shows nothing: no spinner, no skeleton).
  const fetchBookings = useCallback(async (mode: 'load' | 'pull' | 'poll' = 'load') => {
    if (mode === 'load') setLoading(true); else if (mode === 'pull') setRefreshing(true);
    try {
      const { data } = await API.get('/bookings/my/', { params: { shared: 1 } });
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

  useFocusEffect(useCallback(() => { fetchBookings(); }, [fetchBookings]));

  // Only while something is actually moving — and only while this tab is on
  // screen and the app is in the foreground (see hooks/usePolling).
  const hasActive = useMemo(() => bookings.some(b => {
    const s = normalizeBookingStatus(b.status);
    return s === 'waiting' || s === 'in_progress';
  }), [bookings]);

  usePolling(() => fetchBookings('poll'), 15_000, hasActive);

  // Doctor Running Late: { [doctorId]: { minutes, reason } }. Bookings carry
  // only the doctor's id, not their live delay, so it's fetched separately for
  // today's confirmed doctors — depends on `bookings` (not a memoized id list)
  // so it refetches on every bookings poll and a delay set mid-wait shows up
  // within 15s, same cadence as the queue position.
  const [doctorDelays, setDoctorDelays] = useState<Record<string, { minutes: number; reason: string }>>({});
  useEffect(() => {
    const today = toLocalISODate(new Date());
    const ids = [...new Set(
      bookings.filter(b => b.status === 'CONFIRMED' && b.date === today).map(b => b.doctor),
    )].filter(Boolean);
    if (!ids.length) return;
    let alive = true;
    Promise.all(ids.map(id =>
      API.get(`/doctors/${id}/`).then(({ data }) => [id, { minutes: data.running_delay_minutes ?? 0, reason: data.delay_reason ?? '' }]).catch(() => null),
    )).then(pairs => {
      if (!alive) return;
      setDoctorDelays(prev => {
        const next = { ...prev };
        pairs.forEach(p => { if (p) next[p[0]] = p[1]; });
        return next;
      });
    });
    return () => { alive = false; };
  }, [bookings]);

  // Deep-link from a "doctor unavailable" push (data.reschedule='free') — once the
  // matching booking has loaded, pop the reschedule modal automatically. Consumed
  // once via a ref so it doesn't reopen on every poll/refresh.
  const { rescheduleId } = useLocalSearchParams<{ rescheduleId?: string }>();
  const consumedRescheduleId = useRef<string | null>(null);
  useEffect(() => {
    if (!rescheduleId || consumedRescheduleId.current === rescheduleId) return;
    const match = bookings.find(b => String(b.id) === String(rescheduleId));
    if (match) {
      consumedRescheduleId.current = rescheduleId;
      setRescheduleBooking(match);
    }
  }, [rescheduleId, bookings]);

  const handleCancel = (booking: Booking) => {
    Alert.alert(
      t('mb_cancel_appt'),
      `${t('mb_cancel_confirm', { name: providerLabel(booking.doctor_name, booking.provider_kind) })}\n\n${t(cancelNoteKey(booking))}`,
      [
        { text: t('mb_keep_booking'), style: 'cancel' },
        {
          text: t('mb_yes_cancel'), style: 'destructive',
          onPress: async () => {
            setCancelling(booking.id);
            try {
              await API.patch(`/bookings/cancel/${booking.id}/`);
              fetchBookings('poll');
            } catch (e: any) {
              Alert.alert(t('error'), e?.response?.data?.message || t('mb_cancel_failed'));
            } finally {
              setCancelling(null);
            }
          },
        },
      ],
    );
  };

  const queueMsg = (pos: number | null | undefined, b: Booking) => {
    if (pos == null) return t('mb_queue_loading');
    if (pos === 0)   return t('mb_queue_your_turn');
    if (pos === 1)   return nearSlot(b.slot, b.date) ? t('mb_queue_next') : t('mb_queue_first', { slot: b.slot });
    return t('mb_queue_ahead', { count: pos - 1 });
  };

  const filtered = useMemo(() => bookings.filter(b => {
    const s = normalizeBookingStatus(b.status);
    if (tab === 'active')    return s === 'waiting' || s === 'in_progress';
    if (tab === 'completed') return s === 'completed' || s === 'cancelled';
    return true;
  }), [bookings, tab]);
  const activeCount = useMemo(() => bookings.filter(b => {
    const s = normalizeBookingStatus(b.status);
    return s === 'waiting' || s === 'in_progress';
  }).length, [bookings]);
  const todayISO = toLocalISODate(new Date());

  // ── Not logged in ─────────────────────────────────────────────────────────

  if (!user) return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.centreBox}>
        <Ionicons name="ticket-outline" size={52} color={Colors.blue200} style={{ marginBottom: 16 }} />
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
          {loading && bookings.length === 0 ? t('loading_ellipsis') : t('bookings_summary', { total: bookings.length, active: activeCount })}
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
      {loading && bookings.length === 0 ? (
        <SkeletonList count={4} variant="booking" />

      /* Error */
      ) : error && bookings.length === 0 ? (
        <View style={st.centreBox}>
          <Ionicons name="cloud-offline-outline" size={50} color={Colors.gray400} style={{ marginBottom: 12 }} />
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
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings('pull')} tintColor={Colors.blue600} />
          }
        >
          <Ionicons name="ticket-outline" size={50} color={Colors.blue200} style={{ marginBottom: 12 }} />
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
        <FlatList
          data={filtered}
          keyExtractor={(b: Booking) => String(b.id)}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings('pull')} tintColor={Colors.blue600} />
          }
          // /bookings/my/ returns a patient's whole history, and every card
          // carries a status block, an action row and (for scans) a report
          // list. A ScrollView mounted all of them at once.
          initialNumToRender={5}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item: booking }: { item: Booking }) => {
            const cs        = normalizeBookingStatus(booking.status);
            const s         = STATUS_MAP[cs] ?? STATUS_MAP.cancelled;
            const isActive  = cs === 'waiting' || cs === 'in_progress';
            const isWaiting = cs === 'waiting';
            // Reschedule is a DOCTOR flow end to end: the modal fetches the
            // doctor's slots and the backend prices a doctor reschedule. A scan
            // booking carries no `doctor`, so offering it here opened a modal
            // titled "Dr. Complete Blood Count (CBC)" onto an empty calendar.
            // Cancel (which the backend does support for scans) fills the row.
            // A paid move is capped at 3 per booking; the server sends how many
            // are left. A server that sends nothing (older) means allowed. The
            // free, hospital-caused reschedule is never capped.
            const paidLimitReached = !booking.free_reschedule && booking.paid_reschedules_left === 0;
            // A token someone else booked for this number (is_shared, opt-in
            // via ?shared=1) is view-only: only the payer can move or cancel it.
            const shared = !!booking.is_shared;
            const canReschedule = isWaiting && booking.provider_kind !== 'SCAN' && !paidLimitReached && !shared;

            return (
              <View key={booking.id} style={st.card}>

                <View style={[st.cardAccent, { backgroundColor: s.text }]} />

                <View style={st.cardBody}>
                  <View style={st.tokenCol}>
                    <Text style={st.tokenLabel}>{t('mb_token_caps')}</Text>
                    <Text style={st.tokenNum} numberOfLines={2}>
                      {booking.token?.replace('TW-', '#')}
                    </Text>
                  </View>

                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <View style={[st.statusBadge, { backgroundColor: s.bg, borderColor: s.border }]}>
                      {isActive && <View style={[st.statusDot, { backgroundColor: s.text }]} />}
                      <Text style={[st.statusText, { color: s.text }]}>{t(STATUS_LABEL_KEY[cs] ?? 'status_cancelled')}</Text>
                    </View>
                    <Text style={st.doctorName}>{providerLabel(booking.doctor_name, booking.provider_kind)}</Text>
                    <View style={st.iconTextRow}>
                      <Ionicons name="business-outline" size={13} color={Colors.gray500} />
                      <Text style={st.hospitalName} numberOfLines={1}>{localName(booking.hospital_name)}</Text>
                    </View>
                    {shared ? (
                      <View style={st.forOther}>
                        <Ionicons name="people-outline" size={12} color={Colors.blue700} />
                        <Text style={st.forOtherText}>{t('mb_booked_for_you_by', { payer: booking.user_name || 'family' })}</Text>
                      </View>
                    ) : booking.is_for_other ? (
                      <View style={st.forOther}>
                        <Ionicons name="people-outline" size={12} color={Colors.blue700} />
                        <Text style={st.forOtherText}>For {booking.patient_name}</Text>
                      </View>
                    ) : null}
                    {booking.is_priority ? (
                      <View style={st.forOther}>
                        <Ionicons name="star" size={12} color={Colors.blue700} />
                        <Text style={st.forOtherText}>{t('mb_priority')}</Text>
                      </View>
                    ) : null}
                    {booking.hospital_mobile ? (
                      <TouchableOpacity style={st.iconTextRow} onPress={() => Linking.openURL(`tel:${booking.hospital_mobile}`)}>
                        <Ionicons name="call-outline" size={13} color={Colors.blue600} />
                        <Text style={st.callHospital}>{t('mb_call_hospital', { mobile: booking.hospital_mobile })}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={st.metaRow}>
                      <View style={st.metaChipRow}>
                        <Ionicons name="calendar-outline" size={12} color={Colors.gray400} />
                        <Text style={st.metaChip}>{booking.date}</Text>
                      </View>
                      <View style={st.metaChipRow}>
                        <Ionicons name="time-outline" size={12} color={Colors.gray400} />
                        <Text style={st.metaChip}>{booking.slot}</Text>
                      </View>
                    </View>
                    <View style={st.amountRow}>
                      <Text style={st.amount}>₹{booking.amount}</Text>
                      {/* A free booking (a pass visit at a SERVICE_ONLY provider)
                          has nothing to itemise. */}
                      {Number(booking.amount) > 0 && !shared && (
                        <TouchableOpacity
                          style={st.receiptLink}
                          onPress={() => setReceiptBooking(booking)}
                          accessibilityRole="button"
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="receipt-outline" size={13} color={Colors.blue600} />
                          <Text style={st.receiptLinkText}>{t('mb_receipt')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* The doctor's "Before you come" note (web ROADMAP 78), upcoming tokens only. */}
                    {isActive && booking.instructions ? (
                      <View style={st.note}>
                        <Text style={st.noteTitle}>{t('sc_before_you_come')}</Text>
                        <Text style={st.noteBody}>{String(booking.instructions)}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Queue panel */}
                {/* The booking's own day only (web ROADMAP 79): a future token first in its slot must not say "you're next". */}
                {isActive && booking.queue_access && booking.date === todayISO && (
                  <View style={st.queuePanel}>
                    <View style={st.queueCircle}>
                      {cs === 'in_progress' ? (
                        <Ionicons name="notifications" size={22} color={Colors.blue600} />
                      ) : (
                        <Text style={st.queueNum}>{booking.queue_position ?? '…'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.queueLabel}>{t('your_queue_position')}</Text>
                      <Text style={st.queueDesc}>
                        {cs === 'in_progress'
                          ? t('your_turn')
                          : queueMsg(booking.queue_position, booking)}
                      </Text>
                      <Text style={st.queueNote}>{t('auto_refresh_15')}</Text>
                    </View>
                  </View>
                )}

                {/* Show QR — quick check-in at reception */}
                {isActive && (
                  <TouchableOpacity
                    style={st.qrBtn}
                    onPress={() => router.push({ pathname: '/(patient)/my-qr', params: { id: String(booking.id) } })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="qr-code-outline" size={16} color={Colors.white} />
                    <Text style={st.qrBtnText}>{t('show_qr_checkin')}</Text>
                  </TouchableOpacity>
                )}

                {/* Download ticket (with QR) — available for every booking */}
                <TouchableOpacity
                  style={st.downloadBtn}
                  onPress={() => handleDownload(booking)}
                  disabled={downloadingId === booking.id}
                  activeOpacity={0.7}
                >
                  {downloadingId === booking.id ? (
                    <ActivityIndicator size="small" color={Colors.blue600} />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={16} color={Colors.blue600} />
                      <Text style={st.downloadBtnText}>{t('download_ticket')}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Scan reports. Only rendered once the centre has uploaded
                    one — an empty "Reports" heading on every completed scan
                    would read as something having gone missing. */}
                {(reports[String(booking.id)]?.length ?? 0) > 0 && (
                  <View style={st.reportBox}>
                    <Text style={st.reportTitle}>{t('mb_your_documents')}</Text>
                    {reports[String(booking.id)].map((r: any) => (
                      <TouchableOpacity
                        key={String(r.id)}
                        style={st.reportRow}
                        onPress={() => openReport(r)}
                        disabled={reportBusyId === r.id}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="document-text-outline" size={17} color={Colors.blue600} />
                        <Text style={st.reportName} numberOfLines={1}>
                          {r.title || 'Scan report'}
                        </Text>
                        {reportBusyId === r.id
                          ? <ActivityIndicator size="small" color={Colors.blue600} />
                          : <Ionicons name="download-outline" size={17} color={Colors.blue600} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Doctor-unavailable banner: hospital marked the doctor off,
                    so this booking can be rescheduled for free. */}
                {(canReschedule || (shared && isWaiting)) && booking.free_reschedule && (
                  <View style={st.unavailBanner}>
                    <Ionicons name="alert-circle" size={15} color={Colors.warningText} style={{ marginRight: 7 }} />
                    <Text style={st.unavailBannerText}>
                      {t(shared ? 'mb_shared_free_reschedule' : 'mb_free_reschedule', {
                        name: providerLabel(booking.doctor_name, booking.provider_kind),
                        payer: booking.user_name || 'the person who booked',
                      })}
                      {booking.leave_reason ? ` (${booking.leave_reason})` : ''}
                    </Text>
                  </View>
                )}

                {/* Doctor Running Late: hospital set a delay for today's confirmed
                    booking. Delay lives on the doctor record, fetched separately
                    into doctorDelays above (bookings only carry the doctor id). */}
                {booking.status === 'CONFIRMED' && booking.date === todayISO && (doctorDelays[booking.doctor]?.minutes ?? 0) > 0 && (
                  <View style={st.unavailBanner}>
                    <Ionicons name="alert-circle" size={15} color={Colors.warningText ?? '#854F0B'} style={{ marginRight: 7 }} />
                    <Text style={st.unavailBannerText}>
                      {t('mb_running_late', {
                        who: providerLabel(booking.doctor_name, booking.provider_kind),
                        delay: formatDelay(doctorDelays[booking.doctor].minutes),
                        reason: doctorDelays[booking.doctor].reason ? ` (${doctorDelays[booking.doctor].reason})` : '',
                      })}{' '}
                      <Text style={{ textDecorationLine: 'line-through' }}>{booking.slot}</Text>
                      {' → '}
                      {addDelayToSlot(booking.date, booking.slot, doctorDelays[booking.doctor].minutes)}
                    </Text>
                  </View>
                )}

                {/* Share my queue (web ROADMAP 84): the server sends live_key only
                    for the payer's own active visit. */}
                {booking.live_key ? (
                  <TouchableOpacity style={st.shareBtn} activeOpacity={0.7}
                                    accessibilityRole="button" accessibilityLabel={t('share_queue')}
                                    onPress={() => {
                                      const message = shareMessage(booking, t, lang);
                                      if (message) Share.share({ message }).catch(() => {});
                                    }}>
                    <Ionicons name="logo-whatsapp" size={18} color={Colors.successText} />
                    <Text style={st.shareBtnText}>{t('share_queue')}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Action row */}
                {isWaiting && !shared && (
                  <View style={st.actionRow}>
                    {canReschedule && (
                      <TouchableOpacity
                        style={[st.rescheduleBtn, booking.free_reschedule && st.rescheduleBtnFree]}
                        onPress={() => setRescheduleBooking(booking)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="calendar-outline" size={18} color={Colors.blue600} />
                        <View>
                          <Text style={st.rescheduleBtnTitle}>{t('reschedule')}</Text>
                          <Text style={st.rescheduleBtnFee}>
                            {booking.free_reschedule ? t('mb_free') : t('reschedule_fee', { fee: RESCHEDULE_FEE })}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* A shop paid for it, so only the shop can cancel (web ROADMAP 79). */}
                    {booking.booked_by_shop_name ? (
                      <View style={st.cancelBtn}>
                        <Ionicons name="storefront-outline" size={18} color={Colors.errorText} />
                        <Text style={[st.cancelBtnFee, { flexShrink: 1 }]}>
                          {t('mb_ask_shop_to_cancel', { shop: booking.booked_by_shop_name })}
                        </Text>
                      </View>
                    ) : (
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
                          <Ionicons name="close-circle-outline" size={18} color={Colors.errorText} />
                          <View style={{ flexShrink: 1 }}>
                            <Text style={st.cancelBtnTitle}>{t('cancel')}</Text>
                            <Text style={st.cancelBtnFee}>{t(cancelSubKey(booking))}</Text>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Mounted only while open, so it fetches its receipt when asked. */}
      {receiptBooking && (
        <ReceiptModal booking={{ id: receiptBooking.id }} onClose={() => setReceiptBooking(null)} />
      )}

      {/* RescheduleModal — WebView-based, no react-native-razorpay */}
      <RescheduleModal
        visible={!!rescheduleBooking}
        booking={rescheduleBooking}
        onClose={() => setRescheduleBooking(null)}
        onSuccess={() => fetchBookings('poll')}
        user={user}
        free={!!rescheduleBooking?.free_reschedule}
      />

      {/* Off-screen ticket (with QR) rendered only while a download is in flight;
          captured by handleDownload's effect, never shown to the user. */}
      {ticketBooking && (
        <View ref={ticketRef} collapsable={false} style={st.ticketCapture}>
          <View style={st.ticketBar} />
          <View style={st.ticketHeader}>
            <Text style={st.ticketBrand}><Text style={st.ticketAccent}>Token</Text>walla</Text>
            <Text style={st.ticketConfirmed}>● {t(STATUS_LABEL_KEY[normalizeBookingStatus(ticketBooking.status)] ?? 'status_cancelled')}</Text>
          </View>

          <View style={st.ticketQrWrap}>
            <View style={st.ticketQrBox}>
              <QRCode
                value={JSON.stringify({
                  token_code:  ticketBooking.token,
                  doctor_name: ticketBooking.doctor_name,
                  hospital:    ticketBooking.hospital_name,
                  date:        ticketBooking.date,
                  slot:        ticketBooking.slot,
                })}
                size={180}
                color="#0F172A"
                backgroundColor="#FFFFFF"
              />
            </View>
          </View>

          <Text style={st.ticketTokenLabel}>{t('mb_your_token')}</Text>
          <Text style={st.ticketToken}>{ticketBooking.token}</Text>

          <View style={st.ticketDivider} />

          <View style={st.ticketDetails}>
            {[
              { label: 'Patient',  value: ticketBooking.patient_name || user?.name || user?.username },
              { label: ticketBooking.provider_kind === 'SCAN' ? 'Scan' : 'Doctor',
                value: providerLabel(ticketBooking.doctor_name, ticketBooking.provider_kind) },
              { label: 'Hospital', value: localName(ticketBooking.hospital_name) },
              { label: 'Date',     value: ticketBooking.date },
              { label: 'Slot',     value: ticketBooking.slot },
            ].map(({ label, value }) => (
              <View key={label} style={st.ticketRow}>
                <Text style={st.ticketRowLabel}>{label}</Text>
                <Text style={st.ticketRowValue} numberOfLines={1}>{String(value ?? '—')}</Text>
              </View>
            ))}
          </View>

          {ticketBooking.instructions ? (
            <View style={[st.note, { marginHorizontal: 20 }]}>
              <Text style={st.noteTitle}>{t('sc_before_you_come')}</Text>
              <Text style={st.noteBody}>{String(ticketBooking.instructions)}</Text>
            </View>
          ) : null}

          <Text style={st.ticketFooter}>{t('mb_show_at_reception')}</Text>
        </View>
      )}

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  shareBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: Colors.successText, borderRadius: 10, paddingVertical: 10, marginHorizontal: 14, marginBottom: 10 },
  shareBtnText: { color: Colors.successText, fontWeight: '700', fontSize: 14 },
  safe:        { flex: 1, backgroundColor: Colors.white },
  centreLoader:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  centreBox:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },

  header: {
    padding: 20, paddingBottom: 0,
    borderBottomWidth: 1, borderBottomColor: Colors.blue100,
    backgroundColor: Colors.bg,
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
  tabTextActive: { color: Colors.blue700, fontWeight: '700' },

  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray600, marginBottom: 8, textAlign: 'center' },
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
  tokenLabel: { fontSize: 9, fontWeight: '700', color: Colors.blue400, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  tokenNum:   { fontFamily: 'monospace', fontSize: 14, fontWeight: '600', color: Colors.blue600, textAlign: 'center' },

  statusBadge:  { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, marginTop: 12, marginBottom: 8, gap: 5 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  doctorName:   { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 3 },
  iconTextRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  hospitalName: { fontSize: 12, color: Colors.gray500, flexShrink: 1 },
  note:      { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  noteTitle: { fontSize: 12.5, fontWeight: '800', color: '#92400E' },
  noteBody:  { fontSize: 13, color: '#78350F', marginTop: 3, lineHeight: 18 },
  forOther:     { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4 },
  forOtherText: { fontSize: 12, fontWeight: '700', color: Colors.blue700 },
  callHospital: { fontSize: 12, fontWeight: '700', color: Colors.blue600, flexShrink: 1 },
  metaRow:      { flexDirection: 'row', gap: 12, marginBottom: 8, marginTop: 4, flexWrap: 'wrap' },
  metaChipRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChip:     { fontSize: 12, color: Colors.gray400 },
  amount:       { fontSize: 13, fontWeight: '700', color: Colors.blue600 },
  amountRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 12 },
  receiptLink:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  receiptLinkText: { fontSize: 12.5, fontWeight: '600', color: Colors.blue600, textDecorationLine: 'underline' },

  queuePanel:  { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F0F9FF', borderTopWidth: 1, borderTopColor: Colors.blue100, padding: 14 },
  queueCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.blue50, borderWidth: 2, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  queueNum:    { fontSize: 16, fontWeight: '800', color: Colors.blue600 },
  queueLabel:  { fontSize: 11, color: Colors.gray400, marginBottom: 2 },
  queueDesc:   { fontSize: 13, fontWeight: '600', color: Colors.blue600 },
  queueNote:   { fontSize: 10, color: Colors.gray400, marginTop: 2 },

  qrBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: Colors.blue600, borderTopWidth: 1, borderTopColor: Colors.blue100 },
  qrBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  downloadBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, minHeight: 44, backgroundColor: Colors.blue50, borderTopWidth: 1, borderTopColor: Colors.blue100 },
  downloadBtnText: { fontSize: 13, fontWeight: '700', color: Colors.blue700 },

  reportBox:   { marginTop: 12, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.blue50, borderRadius: 12, padding: 12 },
  reportTitle: { fontSize: 12, fontWeight: '800', color: Colors.blue800, letterSpacing: 0.4, marginBottom: 8 },
  reportRow:   { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, marginBottom: 7 },
  reportName:  { flex: 1, fontSize: 13.5, fontWeight: '600', color: Colors.gray800 },

  // Off-screen ticket used only for image capture (never visible).
  ticketCapture:      { position: 'absolute', left: -9999, top: 0, width: 360, backgroundColor: Colors.white, borderRadius: 20, overflow: 'hidden', paddingBottom: 18 },
  ticketBar:          { height: 5, backgroundColor: Colors.blue600 },
  ticketHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 },
  ticketBrand:        { fontSize: 18, fontWeight: '800', color: Colors.gray900 },
  ticketAccent:       { color: Colors.blue600 },
  ticketConfirmed:    { fontSize: 12, fontWeight: '700', color: Colors.successText },
  ticketQrWrap:       { alignItems: 'center', paddingVertical: 20 },
  ticketQrBox:        { padding: 14, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.blue100 },
  ticketTokenLabel:   { textAlign: 'center', fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.gray400 },
  ticketToken:        { textAlign: 'center', fontSize: 26, fontWeight: '700', color: Colors.blue600, fontFamily: 'monospace', letterSpacing: 2, marginTop: 4 },
  ticketDivider:      { height: 1, backgroundColor: Colors.blue50, marginHorizontal: 20, marginTop: 16 },
  ticketDetails:      { paddingHorizontal: 20, paddingTop: 6 },
  ticketRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  ticketRowLabel:     { fontSize: 12, color: Colors.gray500 },
  ticketRowValue:     { fontSize: 13, fontWeight: '600', color: Colors.gray900, maxWidth: '60%', textAlign: 'right' },
  ticketFooter:       { textAlign: 'center', fontSize: 11, color: Colors.gray400, marginTop: 14, paddingHorizontal: 20 },

  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.blue50 },
  rescheduleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: Colors.blue50, borderRightWidth: 1, borderRightColor: Colors.blue100 },
  rescheduleBtnTitle: { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  rescheduleBtnFee:   { fontSize: 11, color: Colors.blue600, marginTop: 1 },
  rescheduleBtnFree:  { backgroundColor: Colors.successBg },

  unavailBanner:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warningBg, borderTopWidth: 1, borderTopColor: Colors.warningBorder, paddingVertical: 10, paddingHorizontal: 14 },
  unavailBannerText:  { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.warningText, lineHeight: 17 },

  cancelBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: Colors.errorBg },
  cancelBtnTitle: { fontSize: 13, fontWeight: '700', color: Colors.errorText },
  cancelBtnFee:   { fontSize: 11, color: Colors.errorText, marginTop: 1, opacity: 0.7 },
});