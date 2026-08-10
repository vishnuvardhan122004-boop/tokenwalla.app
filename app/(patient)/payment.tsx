import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Colors } from '../../constants/colors';
import { RAZORPAY_KEY_ID } from '../../constants/config';
import API from '../../services/api';
import { parsePaymentMessage } from '../../utils/payment';
import { computeFeeBreakdown, money, type FeeBreakdown } from '../../utils/fees';
import { htmlEscape, jsStr } from '../../utils/webviewSafe';
import { safeBack } from '../../utils/navigation';

export default function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const {
    doctorId, doctorName, doctorMobile,
    hospital, date, slot,
  } = params;

  // The itemised bill comes from the SERVER (doctor.fee_breakdown, computed by
  // payments/fees.py — the same code that prices the order). We don't recompute
  // it here: a client-side copy can drift from the backend, and it would get
  // SERVICE_ONLY doctors wrong (their consultation fee is paid at the clinic,
  // not online). Until it loads, the pay button stays disabled.
  const [breakdown, setBreakdown] = useState<FeeBreakdown | null>(null);
  const [feeError,  setFeeError]  = useState('');
  const [feeReload, setFeeReload] = useState(0);
  const total = breakdown ? Number(breakdown.final_amount) : null;

  const [user,         setUser]         = useState<any>(null);
  const [loading,      setLoading]      = useState(false);
  const [showWebView,  setShowWebView]  = useState(false);

  // "Book for someone else" — appointment for another person (name + mobile).
  // Notifications still go to the logged-in account holder.
  const [forOther,    setForOther]    = useState(false);
  const [otherName,   setOtherName]   = useState('');
  const [otherMobile, setOtherMobile] = useState('');
  const bookedForName   = forOther ? otherName.trim()   : '';
  const bookedForMobile = forOther ? otherMobile.trim() : '';
  // FIX 1: Store the full HTML string after order is confirmed
  const [webviewHtml,  setWebviewHtml]  = useState<string>('');
  const payBtnDisabled = useRef(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) { router.replace('/(auth)/login'); return; }
      setUser(JSON.parse(raw));
    })();
  }, []);

  // ── Server-computed fee breakdown for this doctor ──────────────────────
  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;
    // Drop the previous doctor's figures first — otherwise a slow or failed
    // load leaves the last doctor's price on screen as if it were this one's.
    setBreakdown(null);
    setFeeError('');
    API.get(`/doctors/${doctorId}/`)
      .then(({ data }) => {
        if (cancelled) return;
        // A backend that predates fee_breakdown would leave this screen stuck
        // on "Loading…" forever, so fall back to the local mirror. It's a
        // preview either way — the amount charged is the server's order amount.
        setBreakdown(data.fee_breakdown
          || computeFeeBreakdown(data.fee, data.payment_collection_mode));
      })
      .catch(() => {
        if (!cancelled) setFeeError('Could not load the fee details. Check your connection and try again.');
      });
    return () => { cancelled = true; };
  }, [doctorId, feeReload]);

  // ── Build HTML only after we have real orderData ───────────────────────
  const buildRazorpayHTML = (orderData: any, currentUser: any) => {
    // The backend prices orders in RUPEES; Razorpay Checkout wants paise.
    const rpRupees   = Number(orderData.amount);
    const rpAmount   = Math.round(rpRupees * 100);        // FIX 2: a JS Number, not a string
    const rpOrderId  = String(orderData.order_id || '');
    // Prefer the key the backend created the order with — checkout and order
    // must be in the same mode, and the backend is the source of truth for
    // which (test/live) that is. Falls back to the build-time constant.
    const rpKeyId    = String(orderData.key || orderData.key_id || RAZORPAY_KEY_ID);
    const userName   = String(currentUser?.name || currentUser?.username || '');
    const userMobile = String(currentUser?.mobile || '');
    // Display the server-authoritative amount, not a client guess.
    const feeDisplay = money(rpRupees);
    const drName     = String(doctorName || '');
    const apptDate   = String(date || '');
    const apptSlot   = String(slot || '');

    // FIX 3: Guard — don't open if order_id is empty
    if (!rpOrderId) throw new Error('Missing order_id from backend');
    // Guard — amount must be a finite number, or the injected `amount: NaN`
    // would silently break the Razorpay options object.
    if (!Number.isFinite(rpRupees)) throw new Error('Invalid amount from backend');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
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
    .icon  { font-size: 40px; margin-bottom: 12px; }
    h2     { color: #0F172A; font-size: 20px; font-weight: 800; margin-bottom: 6px; }
    .sub   { color: #64748B; font-size: 13px; margin-bottom: 20px; }
    .amount { font-size: 44px; font-weight: 800; color: #185FA5; margin: 16px 0; }
    .cur   { font-size: 22px; vertical-align: super; }
    .info  { background: #E6F1FB; border-radius: 10px; padding: 12px; margin-bottom: 20px; font-size: 13px; color: #185FA5; }
    .btn   {
      background: #185FA5; color: white; border: none; border-radius: 14px;
      padding: 16px; font-size: 16px; font-weight: 700; width: 100%; cursor: pointer;
    }
    .btn:disabled { opacity: 0.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">💳</div>
    <h2>TokenWalla Payment</h2>
    <p class="sub">Dr. ${htmlEscape(drName)} &bull; ${htmlEscape(apptDate)} &bull; ${htmlEscape(apptSlot)}</p>
    <div class="amount"><span class="cur">₹</span>${htmlEscape(feeDisplay)}</div>
    <div class="info">🔐 Secured by Razorpay &bull; UPI &bull; Cards &bull; Wallets</div>
    <button class="btn" id="payBtn" onclick="startPayment()">
      💳 &nbsp;Pay ₹${htmlEscape(feeDisplay)} Now
    </button>
  </div>

  <script>
    var fired = false;

    function startPayment() {
      if (fired) return;
      fired = true;
      document.getElementById('payBtn').disabled = true;

      var options = {
        key:         ${jsStr(rpKeyId)},
        // FIX 2: number literal, not string
        amount:      ${rpAmount},
        currency:    'INR',
        name:        'TokenWalla',
        description: ${jsStr('Appointment – Dr. ' + drName)},
        // FIX 3: real order_id from backend
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
          // FIX 6: send full error details
          code:    r.error.code,
          message: r.error.description,
          reason:  r.error.reason,
          step:    r.error.step,
        }));
      });

      rzp.open();
    }

    window.addEventListener('load', function() {
      setTimeout(startPayment, 800);
    });
  </script>
</body>
</html>`;
  };

  // ── Step 1: Create order, then open WebView with baked HTML ───────────
  const createOrder = async () => {
    if (payBtnDisabled.current) return;   // FIX 7: double-tap guard
    // Validate the "book for someone else" details before charging.
    if (forOther) {
      if (bookedForName.length < 2) {
        Alert.alert('Missing name', "Please enter the other person's name.");
        return;
      }
      if (!/^[6-9]\d{9}$/.test(bookedForMobile)) {
        Alert.alert('Invalid mobile', "Please enter a valid 10-digit mobile number for the other person.");
        return;
      }
    }
    payBtnDisabled.current = true;
    setLoading(true);
    try {
      // Server computes the full fee from the doctor's consultation fee — we
      // send only doctorId, never an amount.
      //
      // `date` and `slot` go at the TOP LEVEL, not just inside `notes`:
      // CreateOrderView reads them from there to reject a full or past-cutoff
      // slot BEFORE any money moves. Sending them only in `notes` (as this did)
      // means the server can't check, and every collision falls through to
      // /verify/, which has to capture the payment and then refund it. Same
      // outcome for the patient, far worse experience — and a real refund on
      // our books every time.
      const { data: orderData } = await API.post('/payment/create-order/', {
        doctorId,
        date,
        slot,
        currency: 'INR',
        notes:    { doctorId, doctorName, hospital, date, slot },
      });

      // FIX 1 & 3: build HTML now, with confirmed orderData
      const html = buildRazorpayHTML(orderData, user);
      setWebviewHtml(html);
      setShowWebView(true);
    } catch (e: any) {
      // Server message FIRST. On an axios error `e.message` is always the
      // useless "Request failed with status code 409", so checking it first
      // swallowed the server's actual explanation ("This slot is full…").
      // That only became visible once we started sending date/slot above.
      const msg = e?.response?.data?.message || e?.message || 'Could not initiate payment.';
      Alert.alert('Payment Error', msg);
    } finally {
      setLoading(false);
      payBtnDisabled.current = false;
    }
  };

  // ── Step 2: Handle messages back from the WebView ─────────────────────
  const handleMessage = async (event: any) => {
    const msg = parsePaymentMessage(event?.nativeEvent?.data);
    if (!msg) return;

    if (msg.type === 'SUCCESS') {
      setShowWebView(false);
      setLoading(true);
      try {
        // The backend verify is idempotent (a repeat of the same payment_id
        // returns the existing booking token), so retry a couple of times to
        // ride out a transient blip. Without this, a single hiccup right after a
        // *successful* payment stranded the patient with a "Network Error" and
        // no token even though they were charged.
        // Razorpay contract: send only the order_id we checked out with. The
        // server confirms the payment with Razorpay itself — the signature
        // Checkout hands back is not trusted and not sent.
        const verifyPayload = {
          order_id: msg.orderId,
          booking: {
            doctorId,
            doctorName,
            hospital,
            date,
            slot,
            queue_access: true,
            bookedForName,
            bookedForMobile,
          },
        };
        let verifyData: any;
        for (let attempt = 0; ; attempt++) {
          try {
            ({ data: verifyData } = await API.post('/payment/verify/', verifyPayload));
            break;
          } catch (err: any) {
            // Only retry what a retry can fix. A 4xx is the server's final
            // answer — 409 means the slot filled while the patient was paying
            // (money already auto-refunded), 400 means the slot was invalid.
            // Retrying those just makes the patient stare at "Verifying
            // Payment..." for another 4.5s before hearing the same thing.
            // Network blips and 5xx still get the original three attempts.
            const status = err?.response?.status;
            if (status && status >= 400 && status < 500) throw err;
            if (attempt >= 2) throw err;
            await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
          }
        }

        if (verifyData.success) {
          router.replace({
            pathname: '/(patient)/booking-token',
            params: {
              token:        verifyData.token,
              doctorName:   String(doctorName),
              doctorMobile: String(doctorMobile),
              hospital:     String(hospital),
              date:         String(date),
              slot:         String(slot),
              paymentId:    msg.paymentId,
              userName:     bookedForName || user?.name || user?.username,
              queue_access: 'true',
              // What's still owed at the hospital desk: 0 when the consultation
              // fee was collected online (FULL), so the ticket can drop the
              // "pay the doctor at the hospital" note.
              offlineFee:   String(breakdown?.offline_doctor_fee ?? 0),
            },
          });
        } else {
          Alert.alert('Verification Failed', 'Payment could not be verified. Contact support with Payment ID: ' + msg.paymentId);
        }
      } catch (e: any) {
        const errMsg = e?.response?.data?.message || e?.message || 'Verification error. Contact support.';
        Alert.alert('Error', errMsg + '\n\nPayment ID: ' + msg.paymentId);
      } finally {
        setLoading(false);
      }
    }

    if (msg.type === 'CANCELLED') {
      // Keep WebView open so user can retry — do nothing
    }

    if (msg.type === 'FAILED') {
      setShowWebView(false);
      // FIX 6: show full Razorpay error details
      const detail = [
        msg.message,
        msg.reason  ? `Reason: ${msg.reason}` : null,
        msg.step    ? `Step: ${msg.step}`      : null,
        msg.code    ? `Code: ${msg.code}`      : null,
      ].filter(Boolean).join('\n');
      Alert.alert('Payment Failed', detail || 'Payment failed. Please try again.');
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────
  if (!user) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
      <ActivityIndicator size="large" color={Colors.blue600} />
    </View>
  );

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg, padding: 40 }}>
      <ActivityIndicator size="large" color={Colors.blue600} />
      <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '700', color: Colors.gray900 }}>
        {showWebView ? 'Opening Payment...' : 'Verifying Payment...'}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 13, color: Colors.gray500, textAlign: 'center' }}>
        Please wait, do not close the app
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Razorpay WebView Modal ── */}
      <Modal
        visible={showWebView}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowWebView(false);
          Alert.alert('Cancelled', 'Payment was cancelled. You can try again.');
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                setShowWebView(false);
                Alert.alert('Cancelled', 'Payment was cancelled. You can try again.');
              }}
            >
              <Ionicons name="close" size={15} color={Colors.errorText} />
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Secure Payment</Text>
            <View style={styles.sslBadge}>
              <Ionicons name="lock-closed" size={12} color={Colors.successText} />
              <Text style={styles.sslText}>SSL</Text>
            </View>
          </View>

          {/* FIX 5: originWhitelist + mixedContentMode for Razorpay CDN */}
          <WebView
            source={{ html: webviewHtml }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            originWhitelist={['*']}
            mixedContentMode="always"
            renderLoading={() => (
              <View style={styles.webLoading}>
                <ActivityIndicator size="large" color={Colors.blue600} />
                <Text style={styles.webLoadingText}>Loading Razorpay...</Text>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Payment Summary Page ── */}
      <ScrollView contentContainerStyle={styles.root} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.back} onPress={() => safeBack(router, '/(patient)/doctors')}>
          <Ionicons name="chevron-back" size={16} color={Colors.blue600} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Complete Payment</Text>
        <Text style={styles.sub}>Review your appointment before paying</Text>

        <View style={styles.card}>
          <View style={styles.cardTop} />
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={19} color={Colors.blue600} />
            <Text style={styles.cardTitle}>Appointment Summary</Text>
          </View>
          <View style={styles.cardBody}>
            {[
              { label: 'Doctor',   value: `Dr. ${doctorName}`         },
              { label: 'Hospital', value: String(hospital)             },
              { label: 'Date',     value: String(date)                 },
              { label: 'Slot',     value: String(slot)                 },
              { label: 'Patient',  value: bookedForName || user?.name || user?.username },
            ].map(({ label, value }) => (
              <View key={label} style={styles.row}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue}>{value}</Text>
              </View>
            ))}
          </View>

          {/* Itemised fee breakdown, straight from the server */}
          {!breakdown ? (
            <View style={styles.feeBox}>
              {feeError ? (
                <View style={styles.feeErrorBox}>
                  <Text style={styles.feeErrorText}>{feeError}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={() => setFeeReload(n => n + 1)}>
                    <Ionicons name="refresh" size={14} color={Colors.blue600} />
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.feeLoadingRow}>
                  <ActivityIndicator size="small" color={Colors.blue600} />
                  <Text style={styles.feeLabel}>Loading fee details…</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.feeBox}>
              {/* SERVICE_ONLY doctors collect the consultation fee at the
                  clinic, so it is NOT part of the online total. */}
              {Number(breakdown.offline_doctor_fee) > 0 ? (
                <View style={styles.feeRow}>
                  <View style={styles.feeLabelRow}>
                    <Text style={styles.feeLabel}>Consultation fee</Text>
                    <View style={styles.clinicTag}>
                      <Text style={styles.clinicTagText}>pay at clinic</Text>
                    </View>
                  </View>
                  <Text style={styles.feeValueMuted}>₹{money(breakdown.offline_doctor_fee)}</Text>
                </View>
              ) : (
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Consultation fee</Text>
                  <Text style={styles.feeValue}>₹{money(breakdown.doctor_fee)}</Text>
                </View>
              )}
              {[
                { label: 'Platform fee',    value: breakdown.platform_fee },
                { label: 'Payment gateway', value: breakdown.gateway_fee  },
                { label: 'GST (18%)',       value: breakdown.gst_amount   },
              ].map(({ label, value }) => (
                <View key={label} style={styles.feeRow}>
                  <Text style={styles.feeLabel}>{label}</Text>
                  <Text style={styles.feeValue}>₹{money(value)}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Payable Now</Text>
            <Text style={styles.totalAmt}>{total === null ? '—' : `₹${money(total)}`}</Text>
          </View>
        </View>

        {/* Book for someone else */}
        <View style={styles.otherCard}>
          <View style={styles.otherToggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.otherTitle}>Booking for someone else?</Text>
              <Text style={styles.otherDesc}>Book this appointment for a family member or friend</Text>
            </View>
            <Switch
              value={forOther}
              onValueChange={setForOther}
              trackColor={{ false: Colors.gray200, true: Colors.blue600 }}
              thumbColor={Colors.white}
            />
          </View>

          {forOther && (
            <View style={styles.otherFields}>
              <Text style={styles.otherLabel}>Patient's full name</Text>
              <TextInput
                style={styles.otherInput}
                placeholder="e.g. Rahul Kumar"
                placeholderTextColor={Colors.gray400}
                value={otherName}
                onChangeText={setOtherName}
                maxLength={100}
              />
              <Text style={[styles.otherLabel, { marginTop: 14 }]}>Patient's mobile number</Text>
              <TextInput
                style={styles.otherInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={Colors.gray400}
                value={otherMobile}
                onChangeText={(v) => setOtherMobile(v.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                maxLength={10}
              />
              <Text style={styles.otherNote}>
                Appointment updates (SMS/WhatsApp) are sent to your account. The hospital sees this patient&apos;s name at reception.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.secureBadge}>
          <Ionicons name="shield-checkmark" size={26} color={Colors.blue600} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.secureTitle}>Secured by Razorpay</Text>
            <Text style={styles.secureDesc}>256-bit SSL encrypted · PCI DSS compliant</Text>
            <View style={styles.methodRow}>
              {['UPI', 'Cards', 'Net Banking', 'Wallets'].map(m => (
                <View key={m} style={styles.chip}>
                  <Text style={styles.chipText}>{m}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.payBtn, !breakdown && styles.payBtnDisabled]}
          onPress={createOrder}
          disabled={!breakdown}
        >
          <Ionicons name="card-outline" size={18} color={Colors.white} />
          <Text style={styles.payBtnText}>
            {breakdown
              ? `Pay ₹${money(total!)} & Confirm Appointment`
              : feeError ? 'Fee details unavailable' : 'Loading…'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          By paying, you agree to our Terms & Conditions.{'\n'}
          Refundable if cancelled at least 2 hours before your slot.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.bg },
  root:  { padding: 20, paddingTop: 16, paddingBottom: 40 },
  back:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 20, alignSelf: 'flex-start' },
  backText: { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  sub:   { fontSize: 14, color: Colors.gray500, marginBottom: 24 },

  card:       { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 20, overflow: 'hidden', marginBottom: 16, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  cardTop:    { height: 3, backgroundColor: Colors.blue600 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue50, backgroundColor: Colors.bg },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  cardBody:   { padding: 16 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowLabel:   { fontSize: 13, color: Colors.gray500 },
  rowValue:   { fontSize: 13, fontWeight: '600', color: Colors.gray900, maxWidth: '55%', textAlign: 'right' },
  feeBox:      { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  feeRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  feeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  feeLabel:    { fontSize: 13, color: Colors.gray500 },
  feeValue:    { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  feeValueMuted: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  clinicTag:     { backgroundColor: Colors.blue50, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  clinicTagText: { fontSize: 10, fontWeight: '700', color: Colors.blue700, textTransform: 'uppercase', letterSpacing: 0.3 },
  feeLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  feeErrorBox:   { paddingVertical: 8, gap: 8 },
  feeErrorText:  { fontSize: 13, color: Colors.errorText, lineHeight: 19 },
  retryBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.blue200, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  retryText:     { fontSize: 13, fontWeight: '700', color: Colors.blue600 },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: Colors.gray800 },
  totalAmt:   { fontSize: 28, fontWeight: '800', color: Colors.blue600 },

  otherCard:      { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 20, marginBottom: 16, overflow: 'hidden' },
  otherToggleRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  otherTitle:     { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 2 },
  otherDesc:      { fontSize: 12, color: Colors.gray500 },
  otherFields:    { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  otherLabel:     { fontSize: 12, fontWeight: '600', color: Colors.gray700, marginBottom: 6, marginTop: 10 },
  otherInput:     { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.gray900 },
  otherNote:      { fontSize: 11.5, color: Colors.gray500, lineHeight: 17, marginTop: 12 },

  secureBadge: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, padding: 16, marginBottom: 20 },
  secureTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 3 },
  secureDesc:  { fontSize: 12, color: Colors.gray500, marginBottom: 8 },
  methodRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:        { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText:    { fontSize: 11, color: Colors.blue700, fontWeight: '600' },

  payBtn:     { flexDirection: 'row', gap: 8, justifyContent: 'center', backgroundColor: Colors.blue600, borderRadius: 14, paddingVertical: 17, alignItems: 'center', shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6, marginBottom: 14 },
  payBtnDisabled: { backgroundColor: Colors.gray400, shadowOpacity: 0 },
  payBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  note:       { fontSize: 12, color: Colors.gray400, textAlign: 'center', lineHeight: 18 },

  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  closeBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  closeBtnText:   { color: Colors.errorText, fontWeight: '700', fontSize: 13 },
  modalTitle:     { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  sslBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sslText:        { fontSize: 12, fontWeight: '700', color: Colors.successText },
  webLoading:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },
  webLoadingText: { marginTop: 12, color: Colors.gray500, fontSize: 14 },
});