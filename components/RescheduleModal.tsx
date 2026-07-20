/**
 * components/RescheduleModal.tsx
 *
 * Full reschedule flow:
 *   Step 1 → Pick a new date (calendar view)
 *   Step 2 → Pick a new slot
 *   Step 3 → Pay ₹5 via Razorpay WebView
 *   Step 4 → Verify with backend → success callback
 *
 * Backend endpoints used:
 *   POST /payment/create-order/   { amount: 500, currency: 'INR' }
 *   POST /payment/verify/         { razorpay_*, booking: { booking_id, date, slot } }
 *
 * Props:
 *   visible         — controls modal visibility
 *   booking         — the Booking object from MyBookings (or null)
 *   onClose         — called when user dismisses without completing
 *   onSuccess       — called after successful reschedule (triggers list refresh)
 *   user            — current user object { name, mobile, ... }
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Colors } from '../constants/colors';
import { RAZORPAY_KEY_ID } from '../constants/config';
import API from '../services/api';
import { parsePaymentMessage } from '../utils/payment';
import { htmlEscape, jsStr } from '../utils/webviewSafe';

// ── Constants ──────────────────────────────────────────────────────────────
const RESCHEDULE_PAISE = 500;   // ₹5 in paise — must match backend VALID_AMOUNTS_PAISE
const RESCHEDULE_FEE   = 5;     // display only
const MAX_BOOKING_DAYS_AHEAD = 30; // how far into the future the calendar allows booking

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Returns YYYY-MM-DD in local time (avoids UTC off-by-one from toISOString)
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Set of bookable dates (skips today + Sundays), used to enable/disable calendar cells
function buildAvailableDateSet(count = MAX_BOOKING_DAYS_AHEAD): Set<string> {
  const set = new Set<string>();
  const d = new Date();
  d.setDate(d.getDate() + 1); // start from tomorrow
  let added = 0;
  while (added < count) {
    if (d.getDay() !== 0) { // skip Sunday
      set.add(toISODate(d));
      added++;
    }
    d.setDate(d.getDate() + 1);
  }
  return set;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Builds a 6-row x 7-col grid of cells (nulls for leading/trailing blanks) for a given month
function buildCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface Props {
  visible:   boolean;
  booking:   any | null;
  onClose:   () => void;
  onSuccess: () => void;
  user:      any | null;
}

type Step = 'date' | 'slot' | 'pay' | 'verifying';

// ── Component ──────────────────────────────────────────────────────────────
export default function RescheduleModal({ visible, booking, onClose, onSuccess, user }: Props) {

  const [step,          setStep]         = useState<Step>('date');
  const [selectedDate,  setSelectedDate] = useState('');
  const [selectedSlot,  setSelectedSlot] = useState('');
  const [webviewHtml,   setWebviewHtml]  = useState('');
  const [loading,       setLoading]      = useState(false);
  const [doctorSlots,   setDoctorSlots]  = useState<string[]>([]);
  const [slotsLoading,  setSlotsLoading] = useState(false);
  const payBtnDisabled = useRef(false);

  // Calendar navigation state — defaults to the current month
  const today = useMemo(() => new Date(), []);
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Reset state and fetch doctor's real slots when modal opens
  useEffect(() => {
    if (!visible || !booking) return;
    setStep('date');
    setSelectedDate('');
    setSelectedSlot('');
    setWebviewHtml('');
    setDoctorSlots([]);
    payBtnDisabled.current = false;
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());

    // ── Fetch the doctor's actual available slots ─────────────────────────
    // BookingSerializer does NOT return doctor slots — we must fetch separately.
    // booking.doctor is the doctor ID (integer FK from BookingSerializer).
    setSlotsLoading(true);
    API.get(`/doctors/${booking.doctor}/`)
      .then(({ data }: { data: any }) => {
        setDoctorSlots(Array.isArray(data.slots) ? data.slots : []);
      })
      .catch(() => {
        setDoctorSlots([]);
      })
      .finally(() => setSlotsLoading(false));
  }, [visible, booking?.id]);

  // ── All hooks must run unconditionally, on every render, in the same
  //    order — so these live ABOVE the `if (!booking) return null;` guard
  //    below. Computing them doesn't depend on `booking` being present.
  const availableDateSet = useMemo(() => buildAvailableDateSet(MAX_BOOKING_DAYS_AHEAD), []);
  const calendarRows = useMemo(() => buildCalendarGrid(calYear, calMonth), [calYear, calMonth]);

  // Bounds for prev/next nav — don't go before this month, or past the max-ahead window
  const earliestNav = new Date(today.getFullYear(), today.getMonth(), 1);
  const latestBound = new Date();
  latestBound.setDate(latestBound.getDate() + MAX_BOOKING_DAYS_AHEAD);
  const latestNav = new Date(latestBound.getFullYear(), latestBound.getMonth(), 1);

  const canGoPrev = new Date(calYear, calMonth, 1) > earliestNav;
  const canGoNext = new Date(calYear, calMonth, 1) < latestNav;

  // Early-return AFTER all hooks have been called.
  if (!booking) return null;

  const goPrevMonth = () => {
    if (!canGoPrev) return;
    const d = new Date(calYear, calMonth - 1, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  };
  const goNextMonth = () => {
    if (!canGoNext) return;
    const d = new Date(calYear, calMonth + 1, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  };

  const availableSlots: string[] = doctorSlots;
  const amSlots = availableSlots.filter(s => s.includes('AM'));
  const pmSlots = availableSlots.filter(s => s.includes('PM'));

  // ── Step 1 → 2: date selected ────────────────────────────────────────────
  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setStep('slot');
  };

  // ── Step 2 → 3: slot selected, create Razorpay order then open WebView ──
  const handleSlotSelect = async (slot: string) => {
    if (payBtnDisabled.current) return;
    payBtnDisabled.current = true;
    setSelectedSlot(slot);
    setLoading(true);
    try {
      const { data } = await API.post('/payment/create-order/', {
        amount:   RESCHEDULE_PAISE,
        currency: 'INR',
        notes:    { type: 'reschedule', booking_id: booking.id },
      });

      if (!data.order_id) throw new Error('No order_id returned from server.');

      // ── Build HTML only after real order_id is confirmed ─────────────────
      const rpAmount   = Number(data.amount);       // paise as JS number — not string
      if (!Number.isFinite(rpAmount)) throw new Error('Invalid amount from server.');
      const rpOrderId  = String(data.order_id);
      const userName   = String(user?.name || user?.username || '');
      const userMobile = String(user?.mobile || '');
      const drName     = String(booking.doctor_name || '');
      const feeDisplay = String(RESCHEDULE_FEE);

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <script src="https://checkout.razorpay.com/v1/checkout.js"><\/script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #F4F9FF;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 20px;
    }
    .card {
      background: white; border-radius: 20px; padding: 28px;
      box-shadow: 0 8px 32px rgba(24,95,165,0.15);
      width: 100%; max-width: 400px; text-align: center;
    }
    .icon   { font-size: 40px; margin-bottom: 12px; }
    h2      { color: #0F172A; font-size: 20px; font-weight: 800; margin-bottom: 6px; }
    .sub    { color: #64748B; font-size: 13px; margin-bottom: 20px; }
    .amount { font-size: 44px; font-weight: 800; color: #185FA5; margin: 16px 0; }
    .cur    { font-size: 22px; vertical-align: super; }
    .info   { background: #E6F1FB; border-radius: 10px; padding: 12px;
              margin-bottom: 20px; font-size: 13px; color: #185FA5; }
    .btn    {
      background: #185FA5; color: white; border: none; border-radius: 14px;
      padding: 16px; font-size: 16px; font-weight: 700; width: 100%; cursor: pointer;
    }
    .btn:disabled { opacity: 0.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📅</div>
    <h2>TokenWalla Payment</h2>
    <p class="sub">Reschedule · Dr. ${htmlEscape(drName)} · ${htmlEscape(slot)}</p>
    <div class="amount"><span class="cur">₹</span>${htmlEscape(feeDisplay)}</div>
    <div class="info">🔐 Secured by Razorpay &bull; UPI &bull; Cards &bull; Wallets</div>
    <button class="btn" id="payBtn" onclick="startPayment()">
      💳 &nbsp;Pay ₹${feeDisplay} to Reschedule
    </button>
  </div>
  <script>
    var fired = false;
    function startPayment() {
      if (fired) return;
      fired = true;
      document.getElementById('payBtn').disabled = true;

      var options = {
        key:         ${jsStr(RAZORPAY_KEY_ID)},
        amount:      ${rpAmount},
        currency:    'INR',
        name:        'TokenWalla',
        description: ${jsStr('Reschedule fee - Dr. ' + drName)},
        order_id:    ${jsStr(rpOrderId)},
        prefill: {
          name:    ${jsStr(userName)},
          contact: ${jsStr('91' + userMobile)},
        },
        theme: { color: '#185FA5' },
        handler: function(response) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type:      'SUCCESS',
            orderId:   response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          }));
        },
        modal: {
          ondismiss: function() {
            fired = false;
            document.getElementById('payBtn').disabled = false;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CANCELLED' }));
          }
        }
      };

      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function(r) {
        fired = false;
        document.getElementById('payBtn').disabled = false;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type:    'FAILED',
          message: r.error.description,
          reason:  r.error.reason,
          code:    r.error.code,
        }));
      });
      rzp.open();
    }
    window.addEventListener('load', function() { setTimeout(startPayment, 800); });
  <\/script>
</body>
</html>`;

      setWebviewHtml(html);
      setStep('pay');
    } catch (e: any) {
      Alert.alert(
        'Payment Error',
        e?.response?.data?.message || e?.message || 'Could not create payment order.',
      );
      setStep('slot');
    } finally {
      setLoading(false);
      payBtnDisabled.current = false;
    }
  };

  // ── Step 3: handle WebView message ───────────────────────────────────────
  const handleMessage = async (event: any) => {
    const msg = parsePaymentMessage(event?.nativeEvent?.data);
    if (!msg) return;

    if (msg.type === 'CANCELLED') return; // let user retry inside WebView

    if (msg.type === 'FAILED') {
      setStep('slot'); // go back so user can try again
      const detail = [msg.message, msg.reason && `Reason: ${msg.reason}`]
        .filter(Boolean).join('\n');
      Alert.alert('Payment Failed', detail || 'Payment failed. Please try again.');
      return;
    }

    if (msg.type === 'SUCCESS') {
      setStep('verifying');
      try {
        const { data } = await API.post('/payment/verify/', {
          razorpay_order_id:   msg.orderId,
          razorpay_payment_id: msg.paymentId,
          razorpay_signature:  msg.signature,
          // Backend _handle_reschedule reads from booking: {}
          booking: {
            booking_id: booking.id,
            date:       selectedDate,
            slot:       selectedSlot,
          },
        });

        if (data.success) {
          Alert.alert(
            '✅ Rescheduled!',
            `Your appointment has been moved to ${selectedDate} at ${selectedSlot}.`,
            [{ text: 'OK', onPress: () => { onSuccess(); onClose(); } }],
          );
        } else {
          Alert.alert('Failed', data.message || 'Reschedule verification failed. Contact support.');
          setStep('slot');
        }
      } catch (e: any) {
        const errMsg = e?.response?.data?.message || e?.message || 'Verification error. Contact support.';
        Alert.alert('Error', errMsg);
        setStep('slot');
      }
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={st.safe} edges={['top']}>

        {/* ── Header ── */}
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Text style={st.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={st.headerTitle}>Reschedule Appointment</Text>
            <Text style={st.headerSub}>Dr. {booking.doctor_name}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* ── Progress bar ── */}
        <View style={st.progressRow}>
          {(['date', 'slot', 'pay'] as Step[]).map((s, i) => (
            <View key={s} style={{ flex: 1, alignItems: 'center' }}>
              <View style={[
                st.progressDot,
                (step === s || (step === 'verifying' && i <= 2)) && st.progressDotActive,
                step !== s && i < ['date','slot','pay','verifying'].indexOf(step) && st.progressDotDone,
              ]}>
                <Text style={[st.progressDotText,
                  (step === s || i < ['date','slot','pay','verifying'].indexOf(step)) && { color: Colors.white }
                ]}>
                  {i + 1}
                </Text>
              </View>
              <Text style={st.progressLabel}>
                {s === 'date' ? 'Date' : s === 'slot' ? 'Slot' : 'Pay'}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Step: Date (Calendar) ── */}
        {step === 'date' && (
          <ScrollView contentContainerStyle={st.body}>
            <Text style={st.stepTitle}>Select a New Date</Text>
            <Text style={st.stepSub}>Tap an available day on the calendar below</Text>

            {/* Calendar card */}
            <View style={st.calendarCard}>

              {/* Month nav header */}
              <View style={st.calHeaderRow}>
                <TouchableOpacity
                  onPress={goPrevMonth}
                  disabled={!canGoPrev}
                  style={[st.calNavBtn, !canGoPrev && st.calNavBtnDisabled]}
                >
                  <Text style={[st.calNavBtnText, !canGoPrev && st.calNavBtnTextDisabled]}>‹</Text>
                </TouchableOpacity>

                <Text style={st.calMonthLabel}>{MONTH_LABELS[calMonth]} {calYear}</Text>

                <TouchableOpacity
                  onPress={goNextMonth}
                  disabled={!canGoNext}
                  style={[st.calNavBtn, !canGoNext && st.calNavBtnDisabled]}
                >
                  <Text style={[st.calNavBtnText, !canGoNext && st.calNavBtnTextDisabled]}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Weekday header row */}
              <View style={st.calWeekRow}>
                {WEEKDAY_LABELS.map((w, idx) => (
                  <View key={`${w}-${idx}`} style={st.calWeekCell}>
                    <Text style={st.calWeekText}>{w}</Text>
                  </View>
                ))}
              </View>

              {/* Date grid */}
              {calendarRows.map((row, rowIdx) => (
                <View key={rowIdx} style={st.calRow}>
                  {row.map((cellDate, colIdx) => {
                    if (!cellDate) {
                      return <View key={colIdx} style={st.calCell} />;
                    }
                    const iso = toISODate(cellDate);
                    const isAvailable = availableDateSet.has(iso);
                    const isSelected = selectedDate === iso;

                    return (
                      <TouchableOpacity
                        key={colIdx}
                        style={[
                          st.calCell,
                          st.calDayCell,
                          isSelected && st.calDayCellSelected,
                          !isAvailable && st.calDayCellDisabled,
                        ]}
                        disabled={!isAvailable}
                        onPress={() => handleDateSelect(iso)}
                      >
                        <Text style={[
                          st.calDayText,
                          isSelected && st.calDayTextSelected,
                          !isAvailable && st.calDayTextDisabled,
                        ]}>
                          {cellDate.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

              {/* Legend */}
              <View style={st.calLegendRow}>
                <View style={st.calLegendItem}>
                  <View style={[st.calLegendDot, { backgroundColor: Colors.blue600 }]} />
                  <Text style={st.calLegendText}>Selected</Text>
                </View>
                <View style={st.calLegendItem}>
                  <View style={[st.calLegendDot, { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200 }]} />
                  <Text style={st.calLegendText}>Available</Text>
                </View>
                <View style={st.calLegendItem}>
                  <View style={[st.calLegendDot, { backgroundColor: Colors.gray100 }]} />
                  <Text style={st.calLegendText}>Unavailable</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── Step: Slot ── */}
        {step === 'slot' && (
          <ScrollView contentContainerStyle={st.body}>
            <TouchableOpacity style={st.backLink} onPress={() => setStep('date')}>
              <Text style={st.backLinkText}>← Change date</Text>
            </TouchableOpacity>
            <Text style={st.stepTitle}>Select a Time Slot</Text>
            <Text style={st.stepSub}>{formatDate(selectedDate)}</Text>

            {/* Loading slots from doctor API */}
            {slotsLoading ? (
              <View style={st.centreLoader}>
                <ActivityIndicator size="large" color={Colors.blue600} />
                <Text style={st.loadingText}>Loading available slots…</Text>
              </View>
            ) : loading ? (
              <View style={st.centreLoader}>
                <ActivityIndicator size="large" color={Colors.blue600} />
                <Text style={st.loadingText}>Creating payment order…</Text>
              </View>
            ) : availableSlots.length === 0 ? (
              <View style={st.emptyBox}>
                <Text style={st.emptyText}>No slots configured for this doctor.</Text>
                <Text style={st.emptySubText}>Please contact the hospital directly.</Text>
              </View>
            ) : (
              <View>
                {/* Morning slots */}
                {amSlots.length > 0 && (
                  <>
                    <Text style={st.periodLabel}>🌅  Morning</Text>
                    <View style={st.slotGrid}>
                      {amSlots.map((slot: string) => (
                        <TouchableOpacity
                          key={slot}
                          style={[
                            st.slotCard,
                            slot === booking.slot && st.slotCardCurrent,
                            selectedSlot === slot && st.slotCardSelected,
                          ]}
                          onPress={() => handleSlotSelect(slot)}
                          disabled={slot === booking.slot || loading}
                        >
                          <Text style={[
                            st.slotText,
                            slot === booking.slot && { color: Colors.gray400 },
                            selectedSlot === slot && { color: Colors.white },
                          ]}>
                            🕐 {slot}
                          </Text>
                          {slot === booking.slot && (
                            <Text style={st.currentBadge}>Current</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Afternoon/Evening slots */}
                {pmSlots.length > 0 && (
                  <>
                    <Text style={[st.periodLabel, { marginTop: 16 }]}>🌇  Afternoon / Evening</Text>
                    <View style={st.slotGrid}>
                      {pmSlots.map((slot: string) => (
                        <TouchableOpacity
                          key={slot}
                          style={[
                            st.slotCard,
                            slot === booking.slot && st.slotCardCurrent,
                            selectedSlot === slot && st.slotCardSelected,
                          ]}
                          onPress={() => handleSlotSelect(slot)}
                          disabled={slot === booking.slot || loading}
                        >
                          <Text style={[
                            st.slotText,
                            slot === booking.slot && { color: Colors.gray400 },
                            selectedSlot === slot && { color: Colors.white },
                          ]}>
                            🕐 {slot}
                          </Text>
                          {slot === booking.slot && (
                            <Text style={st.currentBadge}>Current</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            <View style={st.feeNote}>
              <Text style={st.feeNoteText}>
                💡 A ₹{RESCHEDULE_FEE} reschedule fee applies. Razorpay will open after you select a slot.
              </Text>
            </View>
          </ScrollView>
        )}

        {/* ── Step: Pay (WebView) ── */}
        {step === 'pay' && webviewHtml ? (
          <WebView
            source={{ html: webviewHtml }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            originWhitelist={['*']}
            mixedContentMode="always"
            renderLoading={() => (
              <View style={st.centreLoader}>
                <ActivityIndicator size="large" color={Colors.blue600} />
                <Text style={st.loadingText}>Loading Razorpay…</Text>
              </View>
            )}
          />
        ) : null}

        {/* ── Step: Verifying ── */}
        {step === 'verifying' && (
          <View style={st.centreLoader}>
            <ActivityIndicator size="large" color={Colors.blue600} />
            <Text style={st.loadingText}>Verifying payment…</Text>
            <Text style={st.loadingSubText}>Please don't close the app</Text>
          </View>
        )}

      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.blue100,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  headerSub:   { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  closeBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:{ fontSize: 16, color: Colors.gray600 ?? Colors.gray500, fontWeight: '700' },

  progressRow: {
    flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 32,
    borderBottomWidth: 1, borderBottomColor: Colors.blue50,
  },
  progressDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.blue50, borderWidth: 2, borderColor: Colors.blue200,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  progressDotActive: { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  progressDotDone:   { backgroundColor: Colors.successText ?? '#1A7A4A', borderColor: Colors.successText ?? '#1A7A4A' },
  progressDotText:   { fontSize: 12, fontWeight: '700', color: Colors.blue600 },
  progressLabel:     { fontSize: 11, color: Colors.gray400, textAlign: 'center' },

  body:     { padding: 20, paddingBottom: 40 },
  stepTitle:{ fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  stepSub:  { fontSize: 14, color: Colors.gray500, marginBottom: 20 },
  backLink: { marginBottom: 16 },
  backLinkText: { fontSize: 13, color: Colors.blue600, fontWeight: '600' },

  // ── Calendar styles ──────────────────────────────────────────────────────
  calendarCard: {
    backgroundColor: Colors.blue50 ?? '#F4F9FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.blue100,
    padding: 14,
  },
  calHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  calMonthLabel: { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  calNavBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.blue200,
  },
  calNavBtnDisabled: { backgroundColor: Colors.blue50, borderColor: Colors.blue50 },
  calNavBtnText: { fontSize: 18, fontWeight: '800', color: Colors.blue600 },
  calNavBtnTextDisabled: { color: Colors.gray400 },

  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  calWeekText: { fontSize: 11, fontWeight: '700', color: Colors.gray400 },

  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, aspectRatio: 1, padding: 2 },
  calDayCell: {
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.blue50 ?? '#F4F9FF',
    borderWidth: 1, borderColor: Colors.blue100,
  },
  calDayCellSelected: { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  calDayCellDisabled: { backgroundColor: Colors.gray100, borderColor: Colors.gray100 },
  calDayText:   { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  calDayTextSelected: { color: Colors.white },
  calDayTextDisabled: { color: Colors.gray400 },

  calLegendRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 16,
    marginTop: 14, flexWrap: 'wrap',
  },
  calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calLegendDot:  { width: 10, height: 10, borderRadius: 5 },
  calLegendText: { fontSize: 11, color: Colors.gray500 },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  slotCard: {
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.blue50, borderWidth: 1.5, borderColor: Colors.blue200,
    borderRadius: 10, alignItems: 'center',
  },
  slotCardCurrent:  { backgroundColor: Colors.gray100, borderColor: Colors.gray200 },
  slotCardSelected: { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  slotText:         { fontSize: 13, fontWeight: '600', color: Colors.blue600 },
  currentBadge:     { fontSize: 10, color: Colors.gray400, marginTop: 2 },
  periodLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.gray400,
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },

  feeNote: {
    backgroundColor: Colors.warningBg ?? '#FFF9EC',
    borderWidth: 1, borderColor: Colors.warningBorder ?? '#F0D080',
    borderRadius: 10, padding: 12, marginTop: 8,
  },
  feeNoteText: { fontSize: 12, color: Colors.warningText ?? '#7A5A00', lineHeight: 18 },

  centreLoader:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText:   { marginTop: 16, fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  loadingSubText:{ marginTop: 6, fontSize: 12, color: Colors.gray500, textAlign: 'center' },

  emptyBox:    { alignItems: 'center', paddingVertical: 40 },
  emptyText:   { fontSize: 15, fontWeight: '700', color: Colors.gray600 ?? Colors.gray500 },
  emptySubText:{ fontSize: 13, color: Colors.gray400, marginTop: 6 },
});