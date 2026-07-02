import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API from '../../services/api';

export default function RegisterScreen() {
  const router = useRouter();
  const [name,        setName]        = useState('');
  const [mobile,      setMobile]      = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const step = otpVerified ? 3 : otpSent ? 2 : 1;

  const requestOTP = async () => {
    if (!/^[6-9]\d{9}$/.test(mobile)) { setError('Enter valid 10-digit mobile'); return; }
    setOtpLoading(true); setError('');
    try {
      await API.post('/auth/otp/request/', { mobile });  // ← fixed endpoint
      setOtpSent(true);
    } catch {
      setError('OTP failed. Try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOTP = async () => {
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile, otp });  // ← fixed endpoint
      if (data.verified) setOtpVerified(true);
      else setError('Invalid OTP. Try again.');
    } catch {
      setError('Invalid OTP. Try again.');
    }
  };

  const handleRegister = async () => {
    if (!name.trim())        { setError('Enter your name'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!otpVerified)         { setError('Please verify your mobile first'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await API.post('/auth/register/', { name, mobile, password });
      await AsyncStorage.setItem('access',  data.access);
      await AsyncStorage.setItem('refresh', data.refresh);
      await AsyncStorage.setItem('user',    JSON.stringify(data.user));
      router.replace('/(patient)/home');
    } catch (e: unknown) {  // ← fixed TS error
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.root} showsVerticalScrollIndicator={false}>

          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
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

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {error}</Text></View> : null}

          {/* Name */}
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputIcon}>👤</Text>
            <TextInput style={styles.input} placeholder="Your full name" placeholderTextColor={Colors.gray400} value={name} onChangeText={setName} />
          </View>

          {/* Mobile + OTP */}
          <Text style={styles.label}>Mobile Number</Text>
          <View style={styles.otpRow}>
            <View style={[styles.inputRow, { flex: 1 }]}>
              <Text style={styles.inputIcon}>📱</Text>
              <TextInput style={styles.input} placeholder="10-digit mobile" placeholderTextColor={Colors.gray400} keyboardType="numeric" maxLength={10} value={mobile} onChangeText={setMobile} editable={!otpVerified} />
            </View>
            {!otpVerified && (
              <TouchableOpacity style={styles.otpBtn} onPress={requestOTP} disabled={otpLoading}>
                <Text style={styles.otpBtnText}>{otpLoading ? '...' : otpSent ? 'Resend' : 'Get OTP'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {otpSent && !otpVerified && (
            <>
              <Text style={styles.label}>Enter OTP</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputIcon}>🔢</Text>
                <TextInput style={styles.input} placeholder="4-digit OTP" placeholderTextColor={Colors.gray400} keyboardType="numeric" maxLength={6} value={otp} onChangeText={setOtp} />
              </View>
              <TouchableOpacity style={styles.verifyBtn} onPress={verifyOTP}>
                <Text style={styles.verifyBtnText}>Verify OTP →</Text>
              </TouchableOpacity>
            </>
          )}

          {otpVerified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✅ Mobile verified — {mobile}</Text>
            </View>
          )}

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputIcon}>🔑</Text>
            <TextInput style={styles.input} placeholder="Min 6 characters" placeholderTextColor={Colors.gray400} secureTextEntry value={password} onChangeText={setPassword} />
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput style={styles.input} placeholder="Repeat password" placeholderTextColor={Colors.gray400} secureTextEntry value={confirm} onChangeText={setConfirm} />
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>Create Account →</Text>}
          </TouchableOpacity>

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
  back:  { marginBottom: 24 },
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

  errorBox:  { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 14, color: Colors.errorText },

  label:     { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14, gap: 10 },
  inputIcon: { fontSize: 16 },
  input:     { flex: 1, fontSize: 15, color: Colors.gray900, paddingVertical: 13 },

  otpRow:     { flexDirection: 'row', gap: 10, marginBottom: 0 },
  otpBtn:     { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 14 },
  otpBtnText: { fontSize: 13, fontWeight: '700', color: Colors.blue700 },

  verifyBtn:     { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  verifyBtnText: { color: Colors.successText, fontWeight: '700', fontSize: 14 },

  verifiedBadge: { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, padding: 12, marginBottom: 14 },
  verifiedText:  { color: Colors.successText, fontWeight: '600', fontSize: 14 },

  submitBtn:     { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 4, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  divider:    { height: 1, backgroundColor: Colors.blue50, marginVertical: 20 },
  switchRow:  { flexDirection: 'row', justifyContent: 'center' },
  switchText: { fontSize: 14, color: Colors.gray500 },
  switchLink: { fontSize: 14, color: Colors.blue600, fontWeight: '700' },
});