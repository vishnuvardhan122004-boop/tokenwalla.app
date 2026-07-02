import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API from '../../services/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step,     setStep]     = useState(1);
  const [mobile,   setMobile]   = useState('');
  const [otp,      setOtp]      = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const requestOTP = async () => {
    if (mobile.length !== 10) { setError('Enter valid mobile'); return; }
    setLoading(true); setError('');
    try {
      await API.post('/auth/otp/request/', { mobile, via: 'sms' });
      setSuccess(`✉️ SMS sent to ${mobile}. Note the OTP.`);
      setStep(2);
    } catch { setError('Failed to send OTP. Try again.'); }
    finally { setLoading(false); }
  };

  const verifyOTP = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile, otp });
      if (data.verified) { setStep(3); setSuccess('✅ OTP verified! Set new password.'); }
      else setError('Invalid OTP.');
    } catch { setError('Invalid OTP.'); }
    finally { setLoading(false); }
  };

  const resetPassword = async () => {
    if (password.length < 6)   { setError('Min 6 characters'); return; }
    if (password !== confirm)   { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await API.post('/auth/reset-password/', { mobile, otp, password });
      setSuccess('🎉 Password reset! Redirecting...');
      setTimeout(() => router.replace('./login'), 1500);
    } catch (e) { setError((e as any)?.response?.data?.message || 'Reset failed.'); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.root}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back to Login</Text>
        </TouchableOpacity>

        <View style={styles.brand}>
          <View style={styles.logoBox}><Text style={styles.logoText}>TW</Text></View>
          <Text style={styles.brandName}><Text style={styles.accent}>Token</Text>walla</Text>
        </View>

        <View style={styles.progressRow}>
          {[1, 2, 3].map(n => (
            <View key={n} style={[styles.progressStep, n <= step && styles.progressActive, n < step && styles.progressDone]} />
          ))}
        </View>
        <Text style={styles.stepLabel}>Step {step} of 3</Text>

        <Text style={styles.title}>Forgot Password?</Text>

        {error   ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {error}</Text></View>   : null}
        {success ? <View style={styles.successBox}><Text style={styles.successText}>{success}</Text></View> : null}

        {step === 1 && (
          <>
            <Text style={styles.sub}>Enter your mobile. We'll call with an OTP.</Text>
            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>📱</Text>
              <TextInput style={styles.input} placeholder="10-digit mobile" placeholderTextColor={Colors.gray400} keyboardType="numeric" maxLength={10} value={mobile} onChangeText={setMobile} />
            </View>
            <View style={styles.infoBox}>
              <Text style={{ fontSize: 16, marginRight: 10 }}>✉️</Text>
              <Text style={{ fontSize: 13, color: Colors.blue600, flex: 1 }}>We'll send an SMS to your mobile with the OTP.</Text>
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={requestOTP} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>✉️ Send SMS with OTP →</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.sub}>Enter the OTP from the SMS to {mobile}.</Text>
            <Text style={styles.label}>OTP</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>🔢</Text>
              <TextInput style={styles.input} placeholder="Enter OTP" placeholderTextColor={Colors.gray400} keyboardType="numeric" maxLength={6} value={otp} onChangeText={setOtp} />
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={verifyOTP} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>✅ Verify OTP →</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => { setStep(1); setError(''); setSuccess(''); }}>
              <Text style={styles.ghostBtnText}>← Change Mobile</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.sub}>Set your new password.</Text>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>🔑</Text>
              <TextInput style={styles.input} placeholder="Min 6 characters" placeholderTextColor={Colors.gray400} secureTextEntry value={password} onChangeText={setPassword} />
            </View>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput style={styles.input} placeholder="Repeat password" placeholderTextColor={Colors.gray400} secureTextEntry value={confirm} onChangeText={setConfirm} />
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={resetPassword} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>🔐 Reset Password →</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.white },
  root:  { padding: 24 },
  back:  { marginBottom: 24 },
  backText: { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  brand:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  logoBox:  { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  brandName: { fontSize: 18, fontWeight: '800', color: Colors.gray900 },
  accent:   { color: Colors.blue600 },
  progressRow:   { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressStep:  { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.blue100 },
  progressActive: { backgroundColor: Colors.blue400 },
  progressDone:   { backgroundColor: Colors.blue600 },
  stepLabel: { fontSize: 11, fontWeight: '600', color: Colors.blue600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  sub:   { fontSize: 14, color: Colors.gray500, marginBottom: 20, lineHeight: 20 },
  errorBox:   { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText:  { fontSize: 14, color: Colors.errorText },
  successBox: { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, padding: 12, marginBottom: 14 },
  successText: { fontSize: 14, color: Colors.successText },
  label:     { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14, gap: 10 },
  inputIcon: { fontSize: 16 },
  input:     { flex: 1, fontSize: 15, color: Colors.gray900, paddingVertical: 13 },
  infoBox:   { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, padding: 14, marginBottom: 16 },
  submitBtn:     { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  submitBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  ghostBtn:      { borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  ghostBtnText:  { color: Colors.gray500, fontWeight: '600', fontSize: 14 },
});