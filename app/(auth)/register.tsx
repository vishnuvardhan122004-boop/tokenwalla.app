import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { Colors } from '../../constants/colors';
import API, { apiMessage } from '../../services/api';
import { isCooldown429, useOtpCooldown } from '../../hooks/useOtpCooldown';
import { passwordComplaint } from '../../utils/password';
import { safeBack } from '../../utils/navigation';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import { tenDigitMobile } from '../../utils/phone';

export default function RegisterScreen() {
  const router = useRouter();
  useAndroidBack(() => safeBack(router, '/(auth)/login'));
  const [name,        setName]        = useState('');
  const [mobile,      setMobile]      = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpToken,    setOtpToken]    = useState('');
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [cooldown,    startCooldown]  = useOtpCooldown();
  const [loading,     setLoading]     = useState(false);
  const [verifying,   setVerifying]   = useState(false);
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error,       setError]       = useState('');

  const step = otpVerified ? 3 : otpSent ? 2 : 1;

  const requestOTP = async () => {
    if (!/^[6-9]\d{9}$/.test(mobile)) { setError('Enter valid 10-digit mobile'); return; }
    setOtpLoading(true); setError('');
    try {
      await API.post('/auth/otp/request/', { mobile });  // ← fixed endpoint
      setOtpSent(true);
      startCooldown();
    } catch (e) {
      setError(apiMessage(e, 'OTP failed. Try again.'));
      // A 429 is the server's own 60s cooldown. Start the countdown anyway,
      // or the button stays live and the next tap sends a real SMS.
      if (isCooldown429(e)) startCooldown();
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (verifying) return;
    setVerifying(true); setError('');
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile, otp });  // ← fixed endpoint
      if (data.verified) { setOtpVerified(true); setOtpToken(data.otp_token || ''); }
      else setError('Invalid OTP. Try again.');
    } catch (e) {
      setError(apiMessage(e, 'Invalid OTP. Try again.'));
    } finally {
      setVerifying(false);
    }
  };

  // Continue with Google, from the register screen: the same sign-in as on the
  // login screen, so a hospital's linked staff account lands on its dashboard.
  const finishGoogle = async (data: any) => {
    await AsyncStorage.setItem('access',  data.access);
    await AsyncStorage.setItem('refresh', data.refresh);
    await AsyncStorage.setItem('user',    JSON.stringify(data.user));
    if (router.canDismiss()) router.dismissAll();
    if (data.user?.role === 'hospital' && data.user?.hospital) router.replace('/(hospital)/dashboard');
    else router.replace('/(patient)/home');
  };

  const handleRegister = async () => {
    if (!name.trim())        { setError('Enter your name'); return; }
    // All-numeric and the letter+digit minimum are checked here; the common-
    // password list and the mobile/name similarity rule are NOT duplicated —
    // the server owns those, and apiMessage now shows what it says. Same rule
    // as the website's profilecreate.js, shared with the password reset.
    const complaint = passwordComplaint(password);
    if (complaint) { setError(complaint); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!otpVerified)         { setError('Please verify your mobile first'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await API.post('/auth/register/', { name, mobile, password, otp_token: otpToken });
      await AsyncStorage.setItem('access',  data.access);
      await AsyncStorage.setItem('refresh', data.refresh);
      await AsyncStorage.setItem('user',    JSON.stringify(data.user));
      if (router.canDismiss()) router.dismissAll();
      router.replace('/(patient)/home');
    } catch (e) {
      // apiMessage reads the field-keyed {password:[...]}/{mobile:[...]} body
      // RegisterSerializer returns, which carries no `message` key.
      setError(apiMessage(e, 'Registration failed. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView contentContainerStyle={styles.root} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <TouchableOpacity style={styles.back} onPress={() => safeBack(router, '/(auth)/login')}>
            <Ionicons name="chevron-back" size={16} color={Colors.blue600} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.brand}>
            <View style={styles.logoBox}><Text style={styles.logoText}>TW</Text></View>
            <Text style={styles.brandName}><Text style={styles.accent}>Token</Text>walla</Text>
          </View>

          {/* Progress */}
          <View style={styles.progressRow}>
            {[1, 2, 3].map(n => (
              <View key={n} style={[styles.progressStep, n <= step && styles.progressStepActive, n < step && styles.progressStepDone]} />
            ))}
          </View>
          <Text style={styles.stepLabel}>Step {step} of 3 — {['Your Details', 'Verify Mobile', 'Set Password'][step - 1]}</Text>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.sub}>Free account · Book instantly · No hidden fees</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Name */}
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={17} color={Colors.gray400} />
            <TextInput style={styles.input} placeholder="e.g. Rahul Kumar" placeholderTextColor={Colors.gray400} value={name} onChangeText={setName} />
          </View>
          <Text style={styles.fieldHint}>Enter your name as it should appear on your token.</Text>

          {/* Mobile + OTP */}
          <Text style={styles.label}>Mobile Number</Text>
          <View style={styles.otpRow}>
            <View style={[styles.inputRow, { flex: 1 }]}>
              <Ionicons name="call-outline" size={17} color={Colors.gray400} />
              <TextInput style={styles.input} placeholder="10-digit mobile number" placeholderTextColor={Colors.gray400} keyboardType="numeric" value={mobile} onChangeText={v => {
                setMobile(tenDigitMobile(v));
                // A code was sent to the OLD number: back to step 1 for the new one.
                if (otpSent) { setOtpSent(false); setOtp(''); }
              }} editable={!otpVerified} />
            </View>
            {!otpVerified && (
              <TouchableOpacity style={styles.otpBtn} onPress={requestOTP} disabled={otpLoading || cooldown > 0}>
                <Text style={styles.otpBtnText}>
                  {otpLoading ? '...' : cooldown > 0 ? `Resend in ${cooldown}s` : otpSent ? 'Resend' : 'Get OTP'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.fieldHint}>We&apos;ll text a one-time code to verify this number.</Text>

          {otpSent && !otpVerified && (
            <>
              <Text style={styles.label}>Enter OTP</Text>
              <View style={styles.inputRow}>
                <Ionicons name="keypad-outline" size={17} color={Colors.gray400} />
                <TextInput style={styles.input} placeholder="Enter the code you received" placeholderTextColor={Colors.gray400} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" value={otp} onChangeText={v => setOtp(v.replace(/\D/g, '').slice(0, 6))} />
              </View>
              <TouchableOpacity style={[styles.verifyBtn, verifying && { opacity: 0.6 }]} onPress={verifyOTP} disabled={verifying}>
                <Text style={styles.verifyBtnText}>{verifying ? '...' : 'Verify OTP →'}</Text>
              </TouchableOpacity>
            </>
          )}

          {otpVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.successText} />
              <Text style={styles.verifiedText}>Mobile verified — {mobile}</Text>
            </View>
          )}

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={17} color={Colors.gray400} />
            <TextInput style={styles.input} placeholder="Create a password" placeholderTextColor={Colors.gray400} secureTextEntry={!showPass} value={password} onChangeText={setPassword} />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={8}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.gray400} />
            </TouchableOpacity>
          </View>
          <Text style={styles.fieldHint}>At least 6 characters, with a letter and a number.</Text>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={17} color={Colors.gray400} />
            <TextInput style={styles.input} placeholder="Re-enter your password" placeholderTextColor={Colors.gray400} secureTextEntry={!showConfirm} value={confirm} onChangeText={setConfirm} />
            <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={8}>
              <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.gray400} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>Create Account →</Text>}
          </TouchableOpacity>

          <GoogleSignInButton onSignedIn={finishGoogle} />

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.switchLink}>Sign in →</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.white },
  root:  { padding: 24, paddingTop: 16 },
  back:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 24, alignSelf: 'flex-start' },
  backText: { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  brand:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  logoBox:  { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  brandName: { fontSize: 18, fontWeight: '800', color: Colors.gray900 },
  accent:   { color: Colors.blue600 },

  progressRow:        { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressStep:       { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.blue100 },
  progressStepActive: { backgroundColor: Colors.blue400 },
  progressStepDone:   { backgroundColor: Colors.blue600 },
  stepLabel: { fontSize: 11, fontWeight: '600', color: Colors.blue600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 },

  title: { fontSize: 26, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  sub:   { fontSize: 14, color: Colors.gray500, marginBottom: 20 },

  errorBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 14, color: Colors.errorText, flex: 1 },

  label:     { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14, gap: 10 },
  fieldHint: { fontSize: 11.5, color: Colors.gray400, marginTop: -8, marginBottom: 14, marginLeft: 2, lineHeight: 15 },
  input:     { flex: 1, minWidth: 0, fontSize: 15, color: Colors.gray900, paddingVertical: 13 },

  otpRow:     { flexDirection: 'row', gap: 10, marginBottom: 0 },
  otpBtn:     { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 14 },
  otpBtnText: { fontSize: 13, fontWeight: '700', color: Colors.blue700 },

  verifyBtn:     { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  verifyBtnText: { color: Colors.successText, fontWeight: '700', fontSize: 14 },

  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, padding: 12, marginBottom: 14 },
  verifiedText:  { color: Colors.successText, fontWeight: '600', fontSize: 14 },

  submitBtn:     { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 4, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  divider:    { height: 1, backgroundColor: Colors.blue50, marginVertical: 20 },
  switchRow:  { flexDirection: 'row', justifyContent: 'center' },
  switchText: { fontSize: 14, color: Colors.gray500 },
  switchLink: { fontSize: 14, color: Colors.blue600, fontWeight: '700' },
});