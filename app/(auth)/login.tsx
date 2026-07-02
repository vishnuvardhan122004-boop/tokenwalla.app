import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API from '../../services/api';

export default function LoginScreen() {
  const router = useRouter();
  const [mobile,     setMobile]     = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [otpSent,    setOtpSent]    = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [error,      setError]      = useState('');

  // Reaching this screen means there is no valid session. Any token left
  // in storage is stale and, if left in place, gets attached by the API
  // interceptor to every request — including "public" ones like
  // check-mobile and otp/request. An expired token makes JWTAuthentication
  // fail before the view's AllowAny permission is even checked, which
  // 401s an endpoint that doesn't need auth and silently breaks "Get OTP".
  useEffect(() => {
    AsyncStorage.multiRemove(['access', 'refresh', 'user']).catch(() => {});
  }, []);

  const isValidMobile = (m: string) => /^[6-9]\d{9}$/.test(m);

  const requestOTP = async () => {
    if (!mobile) { setError('Enter your mobile number first'); return; }
    if (!isValidMobile(mobile)) { setError('Enter a valid 10-digit mobile number'); return; }

    setOtpLoading(true);
    setError('');

    // Pre-flight existence check — nice to have, never a blocker.
    // If this fails for any reason (stale token, network blip, server
    // hiccup) we fall through and try the OTP anyway, same as the
    // forgot-password flow.
    try {
      const { data: check } = await API.post('/auth/check-mobile/', {
        mobile,
        type: 'patient',
      });

      if (check?.exists === false) {
        setError('This mobile number is not registered. Please create an account first.');
        setOtpLoading(false);
        return;
      }
      if (check?.status === 'blocked') {
        setError('This account has been blocked. Please contact support.');
        setOtpLoading(false);
        return;
      }
    } catch {
      // fail-open — don't let a broken pre-check stop a real OTP request
    }

    try {
      await API.post('/auth/otp/request/', { mobile });
      setOtpSent(true);
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        setError(e.response?.data?.message || 'OTP failed. Please try again.');
      } else {
        setError('OTP failed. Please try again.');
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!mobile || !password) { setError('Enter mobile and password / OTP'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await API.post('/auth/login/', { mobile, password });
      await AsyncStorage.setItem('access',  data.access);
      await AsyncStorage.setItem('refresh', data.refresh);
      await AsyncStorage.setItem('user',    JSON.stringify(data.user));
      if (data.user?.role === 'hospital') router.replace('/(hospital)/dashboard');
      else router.replace('/(patient)/home');
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        setError(e.response?.data?.message || 'Invalid credentials');
      } else {
        setError('Invalid credentials');
      }
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

          <Text style={styles.panelLabel}>Patient Login</Text>
          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.sub}>
            Log in to view your bookings, track your live queue position,
            and book new doctor appointments instantly.
          </Text>

          {[
            { icon: '🎫', title: 'Instant Token',       desc: 'Get your token immediately after booking'   },
            { icon: '📍', title: 'Live Queue Tracking', desc: 'Know your exact position in the queue'       },
            { icon: '🔐', title: 'Secure & Private',    desc: 'Your data is encrypted and never shared'     },
          ].map(f => (
            <View key={f.title} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Text style={{ fontSize: 16 }}>{f.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}

          <View style={styles.divider} />

          <Text style={styles.formTitle}>Sign In</Text>
          <Text style={styles.formSub}>Enter your mobile number to continue</Text>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          <Text style={styles.label}>Mobile Number</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputIcon}>📱</Text>
            <TextInput
              style={styles.input}
              placeholder="10-digit mobile number"
              placeholderTextColor={Colors.gray400}
              keyboardType="numeric"
              maxLength={10}
              value={mobile}
              onChangeText={t => { setMobile(t); setError(''); }}
            />
          </View>

          <Text style={styles.label}>Password / OTP</Text>
          <View style={styles.otpRow}>
            <View style={[styles.inputRow, { flex: 1, marginBottom: 0 }]}>
              <Text style={styles.inputIcon}>🔑</Text>
              <TextInput
                style={styles.input}
                placeholder={otpSent ? 'Enter OTP sent to your mobile' : 'Password or OTP'}
                placeholderTextColor={Colors.gray400}
                secureTextEntry={!otpSent}
                value={password}
                onChangeText={t => { setPassword(t); setError(''); }}
              />
            </View>
            <TouchableOpacity
              style={styles.otpBtn}
              onPress={requestOTP}
              disabled={otpLoading}
            >
              {otpLoading
                ? <ActivityIndicator size="small" color={Colors.blue700} />
                : <Text style={styles.otpBtnText}>{otpSent ? 'Resend' : 'Get OTP'}</Text>
              }
            </TouchableOpacity>
          </View>
          {otpSent && <Text style={styles.otpHint}>✓ OTP sent to {mobile}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.submitBtnText}>Sign In →</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotWrap}
            onPress={() => router.push('/(auth)/forgot-password')}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.switchLink}>Create one free →</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.altLink}
            onPress={() => router.push('/(hospital)/login')}
          >
            <Text style={styles.altLinkText}>Are you a hospital?  Hospital Login →</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  root: { padding: 24, paddingTop: 16, paddingBottom: 40 },
  back:     { marginBottom: 24 },
  backText: { fontSize: 14, color: Colors.blue600, fontWeight: '600' },
  brand:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  logoBox:   { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  logoText:  { color: Colors.white, fontWeight: '800', fontSize: 13 },
  brandName: { fontSize: 18, fontWeight: '800', color: Colors.gray900 },
  accent:    { color: Colors.blue600 },
  panelLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', color: Colors.blue600, marginBottom: 8 },
  title:      { fontSize: 26, fontWeight: '800', color: Colors.gray900, marginBottom: 6 },
  sub:        { fontSize: 14, color: Colors.gray500, marginBottom: 22, lineHeight: 21 },
  featureRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  featureIcon:  { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray800, marginBottom: 2 },
  featureDesc:  { fontSize: 12, color: Colors.gray500 },
  divider: { height: 1, backgroundColor: Colors.blue50, marginVertical: 22 },
  formTitle: { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  formSub:   { fontSize: 13, color: Colors.gray500, marginBottom: 20 },
  errorBox:  { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', gap: 8 },
  errorText: { fontSize: 14, color: Colors.errorText, flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7, letterSpacing: 0.4 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14, gap: 10 },
  inputIcon: { fontSize: 15 },
  input:     { flex: 1, fontSize: 15, color: Colors.gray900, paddingVertical: 13 },
  otpRow:     { flexDirection: 'row', gap: 10, marginBottom: 6 },
  otpBtn:     { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', minWidth: 80, alignItems: 'center', minHeight: 50 },
  otpBtnText: { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  otpHint:    { fontSize: 12, color: Colors.successText, marginBottom: 14 },
  submitBtn:         { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 8, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { color: Colors.white, fontWeight: '700', fontSize: 15 },
  forgotWrap: { alignItems: 'flex-end', marginTop: 10 },
  forgotText: { fontSize: 13, color: Colors.blue600, fontWeight: '600' },
  switchRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  switchText: { fontSize: 14, color: Colors.gray500 },
  switchLink: { fontSize: 14, color: Colors.blue600, fontWeight: '700' },
  altLink:     { marginTop: 18, alignItems: 'center' },
  altLinkText: { fontSize: 13, color: Colors.gray400 },
});