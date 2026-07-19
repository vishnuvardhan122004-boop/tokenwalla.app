/**
 * scanner.tsx — Hospital QR Code Scanner (React Native / Expo)
 *
 * Native port of the website's src/hospital/QRScanner.js:
 *   • Camera scans a patient QR code (expo-camera CameraView, qr only)
 *   • Verifies the token via  GET  /bookings/scan/:token/
 *   • Marks attendance  ("In Consultation") via  POST /bookings/scan/:token/
 *   • Manual token entry fallback
 *
 * Requires: expo-camera  (npx expo install expo-camera)
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API from '../../services/api';

// ── Extract token from QR data ──────────────────────────────────────────────
function extractToken(raw: string): string {
  const trimmed = (raw || '').trim();
  try {
    const parsed = JSON.parse(trimmed);
    return String(parsed.token_code || parsed.token || '').trim().toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}

// ── Status badge styles ─────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  waiting:     { bg: Colors.warningBg, text: Colors.warningText, label: 'Waiting'         },
  in_progress: { bg: Colors.blue50,    text: Colors.blue700,     label: 'In Consultation' },
  completed:   { bg: Colors.successBg, text: Colors.successText,  label: 'Completed'       },
  cancelled:   { bg: Colors.gray100,   text: Colors.gray600,     label: 'Cancelled'       },
};

type ScanState = 'idle' | 'fetching' | 'found' | 'already_done' | 'confirmed' | 'error';

interface Booking {
  token: string;
  status: string;
  hospital_name?: string;
  patient_name?: string;
  patient_mobile?: string;
  doctor_name?: string;
  specialization?: string;
  date?: string;
  slot?: string;
  queue_position?: number | null;
  amount?: number | string;
  payment_id?: string;
  created?: string;
}

interface ScanResult {
  booking?: Booking;
  already_done?: boolean;
  [key: string]: unknown;
}

export default function HospitalScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanning,   setScanning]   = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanState,  setScanState]  = useState<ScanState>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [confirming, setConfirming] = useState(false);

  const lastScannedRef = useRef('');
  const scanCooldown   = useRef(false);

  // ── Verify a token against the backend ────────────────────────────────────
  const handleTokenFound = useCallback(async (rawToken: string) => {
    const token = extractToken(rawToken);
    if (!token) {
      setErrorMsg('Invalid QR code — no token found.');
      setScanState('error');
      return;
    }

    setScanResult(null);
    setErrorMsg('');
    setScanState('fetching');

    try {
      const { data } = await API.get(`/bookings/scan/${token}/`);
      setScanResult(data);
      setScanState(
        data.already_done || data.booking?.status === 'completed' ? 'already_done' : 'found',
      );
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: any } };
      const status = err?.response?.status;
      if (status === 409) {
        const data = err?.response?.data;
        if (data?.booking) { setScanResult(data); setScanState('already_done'); }
        else { setErrorMsg('This patient has already been attended.'); setScanState('error'); }
      } else if (status === 403) {
        setErrorMsg('⛔ This token belongs to a different hospital. You can only scan patients booked at your hospital.');
        setScanState('error');
      } else if (status === 404) {
        setErrorMsg(`Token "${token}" not found. Please check and try again.`);
        setScanState('error');
      } else {
        setErrorMsg(
          err?.response?.data?.message ||
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          'Verification failed. Please try again.',
        );
        setScanState('error');
      }
    }
  }, []);

  // ── Camera scan handler (with cooldown to avoid duplicate scans) ──────────
  const onBarcodeScanned = useCallback(({ data }: { data: string }) => {
    if (!data || scanCooldown.current) return;
    const token = extractToken(data);
    if (!token || token === lastScannedRef.current) return;

    lastScannedRef.current = token;
    scanCooldown.current   = true;
    setScanning(false);              // stop camera while we verify + show result
    handleTokenFound(token);
    setTimeout(() => { scanCooldown.current = false; }, 4000);
  }, [handleTokenFound]);

  // ── Start / stop camera ───────────────────────────────────────────────────
  const startCamera = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setScanResult(null);
    setScanState('idle');
    setErrorMsg('');
    lastScannedRef.current = '';
    scanCooldown.current   = false;
    setScanning(true);
  };

  const stopCamera = () => setScanning(false);

  const handleManualSubmit = () => {
    const t = manualToken.trim();
    if (!t) return;
    setScanning(false);
    handleTokenFound(t);
  };

  // ── Mark as In Consultation ───────────────────────────────────────────────
  const markAttended = async () => {
    const token = scanResult?.booking?.token;
    if (!token) return;
    setConfirming(true);
    try {
      await API.post(`/bookings/scan/${token}/`);
      setScanState('confirmed');
      setScanResult(prev => ({
        ...prev,
        booking: { ...((prev?.booking || prev) as Booking), status: 'in_progress' },
      }));
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: any } };
      if (err?.response?.status === 409) { setScanState('already_done'); }
      else {
        setErrorMsg(err?.response?.data?.message || 'Failed to mark attendance. Try again.');
        setScanState('error');
      }
    } finally {
      setConfirming(false);
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setScanState('idle');
    setErrorMsg('');
    setManualToken('');
    lastScannedRef.current = '';
    scanCooldown.current   = false;
  };

  const booking = (scanResult?.booking || scanResult) as Booking | null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>📷 QR Scanner</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sub}>
            Scan patient QR codes to verify bookings and mark attendance
          </Text>

          {/* Camera */}
          <View style={styles.camWrap}>
            {scanning ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onBarcodeScanned}
              >
                <View style={styles.overlay}>
                  <View style={styles.scanFrame}>
                    <View style={[styles.corner, styles.tl]} />
                    <View style={[styles.corner, styles.tr]} />
                    <View style={[styles.corner, styles.bl]} />
                    <View style={[styles.corner, styles.br]} />
                  </View>
                  <Text style={styles.camLabel}>Point camera at patient&apos;s QR code</Text>
                </View>
              </CameraView>
            ) : (
              <View style={styles.camPlaceholder}>
                <Text style={{ fontSize: 46 }}>📷</Text>
                <Text style={styles.camPlaceholderText}>
                  {permission && !permission.granted && permission.canAskAgain === false
                    ? 'Camera permission denied. Enable it in Settings or use manual entry below.'
                    : 'Tap "Start Scanner" to activate camera'}
                </Text>
              </View>
            )}
          </View>

          {/* Camera controls */}
          {!scanning ? (
            <TouchableOpacity style={styles.startBtn} onPress={startCamera}>
              <Text style={styles.startBtnText}>📷 Start Scanner</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopBtn} onPress={stopCamera}>
              <Text style={styles.stopBtnText}>⏹ Stop Camera</Text>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or enter token manually</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Manual entry */}
          <Text style={styles.manualLabel}>Enter Booking Token</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              value={manualToken}
              onChangeText={setManualToken}
              placeholder="e.g. TW-143052-A3F9B1"
              placeholderTextColor={Colors.gray400}
              autoCapitalize="characters"
              onSubmitEditing={handleManualSubmit}
            />
            <TouchableOpacity
              style={[styles.manualBtn, (!manualToken.trim() || scanState === 'fetching') && { opacity: 0.5 }]}
              onPress={handleManualSubmit}
              disabled={!manualToken.trim() || scanState === 'fetching'}
            >
              <Text style={styles.manualBtnText}>Verify</Text>
            </TouchableOpacity>
          </View>

          {/* Fetching */}
          {scanState === 'fetching' && (
            <View style={styles.fetching}>
              <ActivityIndicator color={Colors.blue600} />
              <Text style={styles.fetchingText}>Verifying token...</Text>
            </View>
          )}

          {/* Error */}
          {scanState === 'error' && (
            <View style={styles.errorBox}>
              <Text style={{ fontSize: 20 }}>❌</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity onPress={resetScanner}>
                  <Text style={styles.errorRetry}>Try another token</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Result */}
          {['found', 'already_done', 'confirmed'].includes(scanState) && booking && (() => {
            const st          = STATUS_STYLE[booking.status] || STATUS_STYLE.waiting;
            const isDone      = scanState === 'already_done';
            const isConfirmed = scanState === 'confirmed';
            const topColor    = isConfirmed ? Colors.successText : isDone ? Colors.warningBorder : Colors.blue600;

            const rows: { label: string; value: string; mono?: boolean; blue?: boolean; bold?: boolean }[] = [
              { label: 'Hospital',       value: `🏥 ${booking.hospital_name ?? ''}` },
              { label: 'Patient',        value: `👤 ${booking.patient_name ?? ''}` },
              { label: 'Mobile',         value: String(booking.patient_mobile ?? ''), mono: true },
              { label: 'Doctor',         value: `Dr. ${booking.doctor_name ?? ''}` },
              { label: 'Specialization', value: booking.specialization ?? '' },
              { label: 'Date',           value: `📅 ${booking.date ?? ''}` },
              { label: 'Slot',           value: `🕐 ${booking.slot ?? ''}` },
              ...(booking.queue_position != null
                ? [{ label: 'Queue Position', value: `#${booking.queue_position}`, bold: true }] : []),
              { label: 'Token',          value: booking.token, mono: true, blue: true },
              { label: 'Amount Paid',    value: `₹${booking.amount ?? ''}`, bold: true, blue: true },
              ...(booking.payment_id
                ? [{ label: 'Payment Ref', value: booking.payment_id, mono: true }] : []),
              ...(booking.created
                ? [{ label: 'Booked On', value: booking.created }] : []),
            ];

            return (
              <View style={styles.result}>
                <View style={[styles.resultTopbar, { backgroundColor: topColor }]} />
                <View style={styles.resultHeader}>
                  <Text style={{ fontSize: 28 }}>
                    {isConfirmed ? '✅' : isDone ? '⚠️' : '🎫'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultTitle}>
                      {isConfirmed ? 'Marked as In Consultation!'
                        : isDone   ? 'Already Attended'
                        :            'Booking Verified ✓'}
                    </Text>
                    <Text style={styles.resultSub}>
                      {isConfirmed ? `${booking.patient_name} has been called in`
                        : isDone   ? `Status is already: ${st.label}`
                        :            'Booking found — confirm to mark attendance'}
                    </Text>
                  </View>
                </View>

                <View style={styles.resultBody}>
                  {rows.map(({ label, value, mono, blue, bold }) => (
                    <View style={styles.resultRow} key={label}>
                      <Text style={styles.resultLabel}>{label}</Text>
                      <Text
                        style={[
                          styles.resultValue,
                          mono && { fontFamily: 'monospace', fontSize: 13 },
                          blue && { color: Colors.blue700 },
                          bold && { fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {value}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.resultRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.resultLabel}>Status</Text>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: st.text }]}>{st.label}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.resultActions}>
                  {!isDone && !isConfirmed && (
                    <TouchableOpacity
                      style={[styles.confirmBtn, confirming && { opacity: 0.5 }]}
                      onPress={markAttended}
                      disabled={confirming}
                    >
                      {confirming
                        ? <ActivityIndicator color={Colors.white} size="small" />
                        : <Text style={styles.confirmBtnText}>✅ Mark as In Consultation</Text>}
                    </TouchableOpacity>
                  )}
                  {isConfirmed && (
                    <View style={styles.confirmedPill}>
                      <Text style={styles.confirmedPillText}>✅ Patient marked In Consultation</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.resetBtn} onPress={resetScanner}>
                    <Text style={styles.resetBtnText}>
                      {isConfirmed || isDone ? 'Scan Next' : 'Cancel'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  navbar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.white },
  backBtn:  { paddingVertical: 6, paddingHorizontal: 4, width: 60 },
  backBtnText: { fontSize: 15, fontWeight: '600', color: Colors.blue600 },
  navTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },

  sub: { fontSize: 13, color: Colors.gray500, marginBottom: 16 },

  camWrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#000', aspectRatio: 3 / 4, marginBottom: 16, borderWidth: 2, borderColor: Colors.blue200 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 210, height: 210, borderRadius: 16 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: Colors.blue400 },
  tl: { top: 0,    left: 0,    borderTopWidth: 3, borderLeftWidth: 3,  borderTopLeftRadius: 8 },
  tr: { top: 0,    right: 0,   borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0,    borderBottomWidth: 3, borderLeftWidth: 3,  borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0,   borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  camLabel: { position: 'absolute', bottom: 16, color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  camPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  camPlaceholderText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, textAlign: 'center', lineHeight: 21 },

  startBtn:  { backgroundColor: Colors.blue600, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  startBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  stopBtn:   { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  stopBtnText: { color: Colors.errorText, fontSize: 15, fontWeight: '700' },

  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.blue100 },
  dividerText: { fontSize: 12, color: Colors.gray400 },

  manualLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 8 },
  manualRow:   { flexDirection: 'row', gap: 8, marginBottom: 20 },
  manualInput: { flex: 1, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.gray900, fontFamily: 'monospace' },
  manualBtn:   { backgroundColor: Colors.blue600, borderRadius: 11, paddingHorizontal: 18, justifyContent: 'center' },
  manualBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  fetching:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.blue100, padding: 18 },
  fetchingText: { fontSize: 14, fontWeight: '600', color: Colors.blue700 },

  errorBox:  { flexDirection: 'row', gap: 12, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 16, padding: 16, alignItems: 'flex-start' },
  errorText: { fontSize: 14, color: Colors.errorText, lineHeight: 20 },
  errorRetry: { marginTop: 8, fontSize: 13, fontWeight: '700', color: Colors.errorText, textDecorationLine: 'underline' },

  result:        { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.white },
  resultTopbar:  { height: 4 },
  resultHeader:  { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  resultTitle:   { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 2 },
  resultSub:     { fontSize: 13, color: Colors.gray500 },
  resultBody:    { padding: 18 },
  resultRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.blue50, gap: 12 },
  resultLabel:   { fontSize: 14, color: Colors.gray500, flexShrink: 0 },
  resultValue:   { fontSize: 14, fontWeight: '600', color: Colors.gray900, flex: 1, textAlign: 'right' },
  statusBadge:   { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  resultActions: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: Colors.gray50, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  confirmBtn:    { flex: 1, backgroundColor: Colors.blue600, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  confirmedPill: { flex: 1, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  confirmedPillText: { color: Colors.successText, fontSize: 14, fontWeight: '600' },
  resetBtn:      { borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  resetBtnText:  { color: Colors.gray600, fontSize: 14, fontWeight: '500' },
});
