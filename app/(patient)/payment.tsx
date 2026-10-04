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
import { useI18n } from '../../services/i18n';
import { checkoutPayable, parsePaymentMessage } from '../../utils/payment';
import { computeFeeBreakdown, money, type FeeBreakdown } from '../../utils/fees';
import { providerLabel } from '../../utils/booking';
import { htmlEscape, jsStr } from '../../utils/webviewSafe';
import { safeBack } from '../../utils/navigation';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import { tenDigitMobile } from '../../utils/phone';

export default function PaymentScreen() {
  const router = useRouter();
  const { t }  = useI18n();
  const params = useLocalSearchParams();
  const {
    doctorId, doctorName, doctorMobile,
    scanId, scanName,
    hospital, date, slot,
  } = params;

  // One screen, either provider. The SERVER prices whichever id it is sent and
  // is the only authority on the amount — this screen only previews it.
  const isScan       = !!scanId;
  const providerId   = isScan ? scanId : doctorId;
  const providerName = String((isScan ? scanName : doctorName) || '');

  // The itemised bill comes from the SERVER (doctor.fee_breakdown, computed by
  // payments/fees.py — the same code that prices the order). We don't recompute
  // it here: a client-side copy can drift from the backend, and it would get
  // SERVICE_ONLY doctors wrong (their consultation fee is paid at the clinic,
  // not online). Until it loads, the pay button stays disabled.
  const [breakdown, setBreakdown] = useState<FeeBreakdown | null>(null);
  const [feeError,  setFeeError]  = useState(false);
  const [feeReload, setFeeReload] = useState(0);
  const total = breakdown ? Number(breakdown.final_amount) : null;

  const [user,         setUser]         = useState<any>(null);
  const [loading,      setLoading]      = useState(false);
  const [showWebView,  setShowWebView]  = useState(false);

  // The Appointment Pass: the server's offer AND whatever the patient already
  // holds ({enabled, price, bookings, days, pass}). The price is never
  // hard-coded here — it comes from payments/fees.py like every other figure.
  const [passData, setPassData] = useState<any>(null);
  const [buyPass,  setBuyPass]  = useState(false);

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

  // Hardware back must never leave the screen with money in flight. While the
  // Razorpay modal is up, RN's Modal handles back itself (onRequestClose —
  // cancel + tell the patient); while an order is being created or a capture
  // verified, there is nothing safe to do but wait, so back is swallowed.
  useAndroidBack(() => {
    if (showWebView || loading) return;
    safeBack(router, '/(patient)/doctors');
  });

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) { router.replace('/(auth)/login'); return; }
      setUser(JSON.parse(raw));
    })();
  }, [router]);

  // ── Server-computed fee breakdown for this provider ────────────────────
  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    // Drop the previous provider's figures first — otherwise a slow or failed
    // load leaves the last one's price on screen as if it were this one's.
    setBreakdown(null);
    setFeeError(false);
    API.get(isScan ? `/scans/${scanId}/` : `/doctors/${doctorId}/`)
      .then(({ data }) => {
        if (cancelled) return;
        // A backend that predates fee_breakdown would leave this screen stuck
        // on "Loading…" forever, so fall back to the local mirror. It's a
        // preview either way — the amount charged is the server's order amount.
        setBreakdown(data.fee_breakdown
          || computeFeeBreakdown(isScan ? data.price : data.fee, data.payment_collection_mode));
      })
      .catch(() => {
        if (!cancelled) setFeeError(true);
      });
    return () => { cancelled = true; };
  }, [providerId, isScan, scanId, doctorId, feeReload]);

  // ── The Appointment Pass ───────────────────────────────────────────────
  useEffect(() => {
    if (isScan) return;                     // scans can't use a pass in v1
    let cancelled = false;
    API.get('/payment/pass/')
      .then(({ data }) => { if (!cancelled) setPassData(data); })
      // An older backend, or an offline moment, simply means no pass on
      // offer — never a blocked checkout.
      .catch(() => { if (!cancelled) setPassData(null); });
    return () => { cancelled = true; };
  }, [isScan]);

  // A pass waives the SERVICE fee only — never a consultation fee — and it is
  // offered at EVERY doctor. This screen used to require SERVICE_ONLY, which
  // was the v1 rule; the backend and the website moved on 2026-09-07 and this
  // did not, so a patient holding a credit who booked a FULL doctor in the app
  // was quietly charged the service fee again and kept a credit that could
  // expire unused. `collection_mode` is the server's verdict, not a guess from
  // the numbers, and it decides what is left to charge:
  //   SERVICE_ONLY → nothing. ₹0, no gateway, POST /payment/pass/redeem/.
  //   FULL         → the consultation fee, through the normal Razorpay
  //                  checkout with redeemPass:true (RedeemPassView refuses a
  //                  FULL doctor outright and points here).
  const isFull         = breakdown?.collection_mode === 'FULL';
  const doctorFeeOnline = Number(breakdown?.doctor_fee || 0);
  const passOffered  = !!passData?.enabled && !isScan;
  const creditsLeft: number = passData?.pass?.remaining || 0;
  const canRedeem    = passOffered && creditsLeft > 0;   // holding one → spend it
  const redeemIsFree   = canRedeem && !isFull;
  const redeemNeedsPay = canRedeem && isFull;
  const canBuy       = passOffered && creditsLeft === 0; // otherwise → offer one
  const passSelected = canBuy && buyPass;
  const passExpiry   = passData?.pass?.expires_at
    ? new Date(passData.pass.expires_at).toLocaleDateString('en-IN',
        { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  // What is actually charged now — see utils/payment.checkoutPayable, which
  // holds the table so it can be unit tested without a React tree.
  const payable = checkoutPayable({
    redeemIsFree, redeemNeedsPay, passSelected,
    doctorFeeOnline,
    passPrice: Number(passData?.price || 0),
    total,
  });

  // Spending a credit: no order, no WebView, no Razorpay. The server re-checks
  // the pass, the doctor and the slot — this only asks.
  const redeemPass = async () => {
    if (payBtnDisabled.current) return;
    if (forOther) {
      if (bookedForName.length < 2) {
        Alert.alert(t('pay_missing_name'), t('pay_missing_name_msg'));
        return;
      }
      if (!/^[6-9]\d{9}$/.test(bookedForMobile)) {
        Alert.alert(t('pay_invalid_mobile'), t('pay_invalid_mobile_msg'));
        return;
      }
    }
    payBtnDisabled.current = true;
    setLoading(true);
    try {
      const { data } = await API.post('/payment/pass/redeem/', {
        doctorId, hospital, date, slot, bookedForName, bookedForMobile,
      });
      if (!data?.success) {
        Alert.alert(t('pay_pass_failed'), data?.message || t('pay_try_again'));
        return;
      }
      router.replace({
        pathname: '/(patient)/booking-token',
        params: {
          token:        data.token,
          doctorName:   providerName,
          providerKind: 'DOCTOR',
          doctorMobile: String(doctorMobile || ''),
          hospital:     String(hospital),
          date:         String(date),
          slot:         String(slot),
          paymentId:    '',
          userName:     bookedForName || user?.name || user?.username,
          queue_access: 'true',
          offlineFee:   String(breakdown?.offline_doctor_fee ?? 0),
        },
      });
    } catch (e: any) {
      // Server message first — a 409 here means the last visit went while the
      // patient was on this screen, and that sentence is the useful one.
      const msg = e?.response?.data?.message || e?.message || t('pay_pass_error');
      Alert.alert(t('pay_pass'), msg);
    } finally {
      setLoading(false);
      payBtnDisabled.current = false;
    }
  };

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
    const provider   = providerLabel(providerName, isScan ? 'SCAN' : 'DOCTOR');
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
    <p class="sub">${htmlEscape(provider)} &bull; ${htmlEscape(apptDate)} &bull; ${htmlEscape(apptSlot)}</p>
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
        description: ${jsStr('Appointment – ' + provider)},
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
        Alert.alert(t('pay_missing_name'), t('pay_missing_name_msg'));
        return;
      }
      if (!/^[6-9]\d{9}$/.test(bookedForMobile)) {
        Alert.alert(t('pay_invalid_mobile'), t('pay_invalid_mobile_msg'));
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
        ...(isScan ? { scanId } : { doctorId }),
        date,
        slot,
        currency: 'INR',
        // Opt-in per checkout. The server prices and tags the order — this flag
        // only asks for the upgrade, it never says what it costs.
        ...(passSelected ? { buyPass: true } : {}),
        // A FULL-doctor redemption: the server prices this order as the
        // consultation fee alone and tags it pass:'redeem', so /verify/ spends
        // the credit against the order rather than trusting this flag.
        ...(redeemNeedsPay ? { redeemPass: true } : {}),
        notes:    { providerId, providerName, hospital, date, slot },
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
      const msg = e?.response?.data?.message || e?.message || t('pay_error_msg');
      Alert.alert(t('pay_error'), msg);
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
            ...(isScan ? { scanId, scanName } : { doctorId, doctorName }),
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
              // booking-token renders this as the provider line; for a scan
              // it carries the scan's name.
              doctorName:   providerName,
              providerKind: isScan ? 'SCAN' : 'DOCTOR',
              doctorMobile: String(doctorMobile || ''),
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
          Alert.alert(t('pay_verify_failed'), t('pay_verify_failed_msg') + msg.paymentId);
        }
      } catch (e: any) {
        const errMsg = e?.response?.data?.message || e?.message || t('pay_verify_error');
        Alert.alert(t('error'), errMsg + '\n\nPayment ID: ' + msg.paymentId);
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
      Alert.alert(t('pay_failed'), detail || t('pay_failed_msg'));
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
        {t(showWebView ? 'pay_opening' : 'pay_verifying')}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 13, color: Colors.gray500, textAlign: 'center' }}>
        {t('pay_please_wait')}
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
          Alert.alert(t('pay_cancelled'), t('pay_cancelled_msg'));
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                setShowWebView(false);
                Alert.alert(t('pay_cancelled'), t('pay_cancelled_msg'));
              }}
            >
              <Ionicons name="close" size={15} color={Colors.errorText} />
              <Text style={styles.closeBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('pay_secure_payment')}</Text>
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
                <Text style={styles.webLoadingText}>{t('pay_loading_razorpay')}</Text>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Payment Summary Page ── */}
      <ScrollView contentContainerStyle={styles.root} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.back} onPress={() => safeBack(router, '/(patient)/doctors')}>
          <Ionicons name="chevron-back" size={16} color={Colors.blue600} />
          <Text style={styles.backText}>{t('pay_back')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('pay_complete_payment')}</Text>
        <Text style={styles.sub}>{t('pay_review')}</Text>

        <View style={styles.card}>
          <View style={styles.cardTop} />
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={19} color={Colors.blue600} />
            <Text style={styles.cardTitle}>{t('pay_appt_summary')}</Text>
          </View>
          <View style={styles.cardBody}>
            {[
              { label: t(isScan ? 'bt_scan' : 'bt_doctor'),
                value: providerLabel(providerName, isScan ? 'SCAN' : 'DOCTOR') },
              { label: t('bt_hospital'), value: String(hospital)             },
              { label: t('bt_date'),     value: String(date)                 },
              { label: t('bt_slot'),     value: String(slot)                 },
              { label: t('bt_patient'),  value: bookedForName || user?.name || user?.username },
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
                  <Text style={styles.feeErrorText}>{t('pay_fee_load_failed')}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={() => setFeeReload(n => n + 1)}>
                    <Ionicons name="refresh" size={14} color={Colors.blue600} />
                    <Text style={styles.retryText}>{t('retry')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.feeLoadingRow}>
                  <ActivityIndicator size="small" color={Colors.blue600} />
                  <Text style={styles.feeLabel}>{t('pay_loading_fees')}</Text>
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
                    <Text style={styles.feeLabel}>{t(isScan ? 'pay_test_fee' : 'pay_consultation_fee')}</Text>
                    <View style={styles.clinicTag}>
                      <Text style={styles.clinicTagText}>{t('dr_pay_at_clinic_tag')}</Text>
                    </View>
                  </View>
                  <Text style={styles.feeValueMuted}>₹{money(breakdown.offline_doctor_fee)}</Text>
                </View>
              ) : (
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>{t(isScan ? 'pay_test_fee' : 'pay_consultation_fee')}</Text>
                  <Text style={styles.feeValue}>₹{money(breakdown.doctor_fee)}</Text>
                </View>
              )}
              {/* A pass replaces the three service-fee lines with one. The GST
                  split of ₹35 is computed server-side and itemised on the
                  receipt — this screen never does money math. */}
              {canRedeem ? (
                <View style={styles.feeRow}>
                  <View style={styles.feeLabelRow}>
                    <Text style={styles.feeLabel}>{t('pay_service_fee')}</Text>
                    <View style={styles.clinicTag}>
                      <Text style={styles.clinicTagText}>{t('pay_paid_by_pass')}</Text>
                    </View>
                  </View>
                  <Text style={styles.feeValue}>₹0.00</Text>
                </View>
              ) : passSelected ? (
                <View style={styles.feeRow}>
                  <View style={styles.feeLabelRow}>
                    <Text style={styles.feeLabel}>{t('pay_appointment_pass')}</Text>
                    <View style={styles.clinicTag}>
                      <Text style={styles.clinicTagText}>
                        {t('pay_pass_visits_days', { visits: passData.bookings, days: passData.days })}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.feeValue}>₹{money(passData.price)}</Text>
                </View>
              ) : (
                [
                  { label: t('price_platform'), value: breakdown.platform_fee },
                  { label: t('price_gateway'),  value: breakdown.gateway_fee  },
                  { label: t('price_gst'),      value: breakdown.gst_amount   },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.feeRow}>
                    <Text style={styles.feeLabel}>{label}</Text>
                    <Text style={styles.feeValue}>₹{money(value)}</Text>
                  </View>
                ))
              )}
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('pay_total_now')}</Text>
            <Text style={styles.totalAmt}>
              {payable === null ? '—' : `₹${money(payable)}`}
            </Text>
          </View>
        </View>

        {/* ── The Appointment Pass: spend one, or buy one. Never both. ── */}
        {canRedeem && (
          <View style={[styles.passCard, styles.passCardActive]}>
            <View style={styles.passBadge}>
              <Text style={styles.passBadgeText}>{t('pay_pass_caps')}</Text>
            </View>
            {/* "no payment needed" is only true at a SERVICE_ONLY doctor. At a
                FULL one the pass still waives the service fee, but the
                consultation fee is charged — saying otherwise next to a Pay
                ₹200 button is the kind of contradiction a patient reads as a
                bug in our favour. */}
            <Text style={styles.passTitle}>
              {t(redeemNeedsPay ? 'pay_pass_covered_fee_due' : 'pay_pass_covered')}
            </Text>
            <Text style={styles.passDesc}>
              {creditsLeft === 1
                ? t('pay_last_visit')
                : t('pay_visits_left', { count: creditsLeft })}
              {passExpiry ? t('pay_valid_to', { date: passExpiry }) : ''}
              {Number(breakdown?.offline_doctor_fee) > 0
                ? t('pay_clinic_still', { amount: money(breakdown!.offline_doctor_fee) })
                : ''}
            </Text>
          </View>
        )}

        {canBuy && (
          <View style={styles.passCard}>
            <View style={styles.passBadge}>
              <Text style={styles.passBadgeText}>{t('pay_save_next')}</Text>
            </View>
            {[false, true].map((choice) => (
              <TouchableOpacity
                key={String(choice)}
                style={[styles.passOption, buyPass === choice && styles.passOptionChosen]}
                onPress={() => setBuyPass(choice)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={buyPass === choice ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={buyPass === choice ? Colors.blue600 : Colors.gray400}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.passOptionTitle}>
                    {choice
                      ? t('pay_opt_pass',   { price: money(passData.price) })
                      : t('pay_opt_single', { price: money(total!) })}
                  </Text>
                  <Text style={styles.passOptionDesc}>
                    {choice
                      ? t('pay_opt_pass_desc', {
                          more: passData.bookings - 1,
                          days: passData.days,
                          save: money(Number(total) * passData.bookings - Number(passData.price)),
                        })
                      : t('pay_opt_single_desc')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Book for someone else */}
        <View style={styles.otherCard}>
          <View style={styles.otherToggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.otherTitle}>{t('pay_for_someone')}</Text>
              <Text style={styles.otherDesc}>{t('pay_for_someone_sub')}</Text>
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
              <Text style={styles.otherLabel}>{t('pay_patient_name')}</Text>
              <TextInput
                style={styles.otherInput}
                placeholder={t('pay_name_ph')}
                placeholderTextColor={Colors.gray400}
                value={otherName}
                onChangeText={setOtherName}
                maxLength={100}
              />
              <Text style={[styles.otherLabel, { marginTop: 14 }]}>{t('pay_patient_mobile')}</Text>
              <TextInput
                style={styles.otherInput}
                placeholder={t('mobile_placeholder')}
                placeholderTextColor={Colors.gray400}
                value={otherMobile}
                onChangeText={(v) => setOtherMobile(tenDigitMobile(v))}
                keyboardType="number-pad"
              />
              <Text style={styles.otherNote}>
                {t('pay_other_note')}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.secureBadge}>
          <Ionicons name="shield-checkmark" size={26} color={Colors.blue600} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.secureTitle}>{t('pay_secured_by')}</Text>
            <Text style={styles.secureDesc}>{t('pay_secure_desc')}</Text>
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
          onPress={redeemIsFree ? redeemPass : createOrder}
          disabled={!breakdown}
        >
          <Ionicons
            name={redeemIsFree ? 'ticket-outline' : 'card-outline'}
            size={18}
            color={Colors.white}
          />
          <Text style={styles.payBtnText}>
            {!breakdown
              ? t(feeError ? 'pay_fee_unavailable' : 'loading_ellipsis')
              : redeemIsFree
                ? t('pay_use_pass_btn')
                : t('pay_pay_confirm', { amount: money(payable!) })}
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          {t('pay_terms_note')}{'\n'}
          {t('pay_refund_note')}
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

  passCard:        { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 20, padding: 16, marginBottom: 16 },
  passCardActive:  { backgroundColor: Colors.blue50 },
  passBadge:       { alignSelf: 'flex-start', backgroundColor: Colors.blue600, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10 },
  passBadgeText:   { fontSize: 10, fontWeight: '800', color: Colors.white, letterSpacing: 0.4 },
  passTitle:       { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
  passDesc:        { fontSize: 12, color: Colors.gray500, lineHeight: 18 },
  passOption:       { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, padding: 12, marginBottom: 10 },
  passOptionChosen: { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  passOptionTitle:  { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 2 },
  passOptionDesc:   { fontSize: 12, color: Colors.gray500, lineHeight: 18 },

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