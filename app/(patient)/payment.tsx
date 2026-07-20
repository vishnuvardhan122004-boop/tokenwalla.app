import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Colors } from '../../constants/colors';
import { RAZORPAY_KEY_ID } from '../../constants/config';
import API from '../../services/api';
import { parsePaymentMessage } from '../../utils/payment';
import { htmlEscape, jsStr } from '../../utils/webviewSafe';

export default function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const {
    doctorId, doctorName, doctorMobile,
    hospital, date, slot,
    fee = '15', amount = '1500',
  } = params;

  const [user,         setUser]         = useState<any>(null);
  const [loading,      setLoading]      = useState(false);
  const [showWebView,  setShowWebView]  = useState(false);
  // ✅ FIX 1: Store the full HTML string after order is confirmed
  const [webviewHtml,  setWebviewHtml]  = useState<string>('');
  const payBtnDisabled = useRef(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) { router.replace('/(auth)/login'); return; }
      setUser(JSON.parse(raw));
    })();
  }, []);

  // ── Build HTML only after we have real orderData ───────────────────────
  const buildRazorpayHTML = (orderData: any, currentUser: any) => {
    // ✅ FIX 2: amount is a JS Number, not a string
    const rpAmount   = Number(orderData.amount);          // paise from backend
    const rpOrderId  = String(orderData.order_id || '');
    // Prefer the key the backend created the order with — checkout and order
    // must be in the same mode, and the backend is the source of truth for
    // which (test/live) that is. Falls back to the build-time constant.
    const rpKeyId    = String(orderData.key_id || RAZORPAY_KEY_ID);
    const userName   = String(currentUser?.name || currentUser?.username || '');
    const userMobile = String(currentUser?.mobile || '');
    const feeDisplay = String(fee);
    const drName     = String(doctorName || '');
    const apptDate   = String(date || '');
    const apptSlot   = String(slot || '');

    // ✅ FIX 3: Guard — don't open if order_id is empty
    if (!rpOrderId) throw new Error('Missing order_id from backend');
    // Guard — amount must be a finite number, or the injected `amount: NaN`
    // would silently break the Razorpay options object.
    if (!Number.isFinite(rpAmount)) throw new Error('Invalid amount from backend');

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
        // ✅ FIX 2: number literal, not string
        amount:      ${rpAmount},
        currency:    'INR',
        name:        'TokenWalla',
        description: ${jsStr('Appointment – Dr. ' + drName)},
        // ✅ FIX 3: real order_id from backend
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
          // ✅ FIX 6: send full error details
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
    if (payBtnDisabled.current) return;   // ✅ FIX 7: double-tap guard
    payBtnDisabled.current = true;
    setLoading(true);
    try {
      const { data: orderData } = await API.post('/payment/create-order/', {
        amount:   Number(amount),
        currency: 'INR',
        notes:    { doctorId, doctorName, hospital, date, slot },
      });

      // ✅ FIX 1 & 3: build HTML now, with confirmed orderData
      const html = buildRazorpayHTML(orderData, user);
      setWebviewHtml(html);
      setShowWebView(true);
    } catch (e: any) {
      const msg = e?.message || e?.response?.data?.message || 'Could not initiate payment.';
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
        // ✅ FIX 4: flat payload — no nested booking object
        const { data: verifyData } = await API.post('/payment/verify/', {
         razorpay_order_id:   msg.orderId,
         razorpay_payment_id: msg.paymentId,
         razorpay_signature:  msg.signature,
           booking: {
           doctorId:     doctorId,
            doctorName:   doctorName,
              hospital:     hospital,
               date:         date,
              slot:         slot,
                amount:       Number(fee),
                 queue_access: true,
                    },
                      });

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
              userName:     user?.name || user?.username,
              queue_access: 'true',
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
      // ✅ FIX 6: show full Razorpay error details
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
              <Text style={styles.closeBtnText}>✕ Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Secure Payment</Text>
            <View style={styles.sslBadge}>
              <Text style={styles.sslText}>🔐 SSL</Text>
            </View>
          </View>

          {/* ✅ FIX 5: originWhitelist + mixedContentMode for Razorpay CDN */}
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
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Complete Payment</Text>
        <Text style={styles.sub}>Review your appointment before paying</Text>

        <View style={styles.card}>
          <View style={styles.cardTop} />
          <View style={styles.cardHeader}>
            <Text style={{ fontSize: 20 }}>📋</Text>
            <Text style={styles.cardTitle}>Appointment Summary</Text>
          </View>
          <View style={styles.cardBody}>
            {[
              { label: 'Doctor',   value: `Dr. ${doctorName}`         },
              { label: 'Hospital', value: `🏥 ${hospital}`            },
              { label: 'Date',     value: String(date)                 },
              { label: 'Slot',     value: String(slot)                 },
              { label: 'Patient',  value: user?.name || user?.username },
              { label: 'Plan',     value: '📍 Queue View'             },
            ].map(({ label, value }) => (
              <View key={label} style={styles.row}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalAmt}>₹{fee}</Text>
          </View>
        </View>

        <View style={styles.secureBadge}>
          <Text style={{ fontSize: 26, marginRight: 12 }}>🔐</Text>
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

        <TouchableOpacity style={styles.payBtn} onPress={createOrder}>
          <Text style={styles.payBtnText}>💳  Pay ₹{fee} & Confirm Appointment</Text>
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
  back:  { marginBottom: 20 },
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
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: Colors.gray800 },
  totalAmt:   { fontSize: 28, fontWeight: '800', color: Colors.blue600 },

  secureBadge: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, padding: 16, marginBottom: 20 },
  secureTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 3 },
  secureDesc:  { fontSize: 12, color: Colors.gray500, marginBottom: 8 },
  methodRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:        { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText:    { fontSize: 11, color: Colors.blue700, fontWeight: '600' },

  payBtn:     { backgroundColor: Colors.blue600, borderRadius: 14, paddingVertical: 17, alignItems: 'center', shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6, marginBottom: 14 },
  payBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  note:       { fontSize: 12, color: Colors.gray400, textAlign: 'center', lineHeight: 18 },

  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  closeBtn:       { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  closeBtnText:   { color: Colors.errorText, fontWeight: '700', fontSize: 13 },
  modalTitle:     { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  sslBadge:       { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  sslText:        { fontSize: 12, fontWeight: '700', color: Colors.successText },
  webLoading:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },
  webLoadingText: { marginTop: 12, color: Colors.gray500, fontSize: 14 },
});