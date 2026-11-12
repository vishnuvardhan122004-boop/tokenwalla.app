import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ComponentProps, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import RegisterPrompt from '../../components/RegisterPrompt';
import { Colors } from '../../constants/colors';
import API, { apiMessage } from '../../services/api';
import { useI18n } from '../../services/i18n';
import { safeBack } from '../../utils/navigation';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import { isCooldown429, useOtpCooldown } from '../../hooks/useOtpCooldown';
import { tenDigitMobile } from '../../utils/phone';
import { clearNotifications } from '../../services/notificationStore';

export default function LoginScreen() {
  const router = useRouter();
  useAndroidBack(() => safeBack(router, '/(patient)/home'));
  const { t } = useI18n();
  const [mobile,     setMobile]     = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [otpSent,    setOtpSent]    = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [cooldown,   startCooldown] = useOtpCooldown();
  const [showPass,   setShowPass]   = useState(false);
  const [error,      setError]      = useState('');
  // Open when the number typed has no account: offers to create one right here.
  const [signUp,     setSignUp]     = useState(false);
  const mobileRef = useRef<TextInput>(null);

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
    if (!mobile) { setError(t('lg_enter_mobile_first')); return; }
    if (!isValidMobile(mobile)) { setError(t('lg_invalid_mobile')); return; }

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
        // A new patient: offer to create the account here, not a dead-end
        // error. No OTP is sent until they say yes inside the sheet.
        setSignUp(true);
        setOtpLoading(false);
        return;
      }
      if (check?.status === 'blocked') {
        setError(t('lg_blocked'));
        setOtpLoading(false);
        return;
      }
    } catch {
      // fail-open — don't let a broken pre-check stop a real OTP request
    }

    try {
      await API.post('/auth/otp/request/', { mobile });
      setOtpSent(true);
      startCooldown();
    } catch (e) {
      setError(apiMessage(e, t('lg_otp_failed')));
      // A 429 is the server's own 60s cooldown. Start the countdown anyway,
      // or the button stays live and the next tap sends a real SMS.
      if (isCooldown429(e)) startCooldown();
    } finally {
      setOtpLoading(false);
    }
  };

  // "No such account" and "wrong password" are both a 401 from /auth/login/, so
  // /auth/check-mobile/ (public, and what Get OTP already uses) says which. Any
  // failure here just means "not known to be new": the login error stands.
  const isUnregistered = async (): Promise<boolean> => {
    if (!isValidMobile(mobile)) return false;
    try {
      const { data } = await API.post('/auth/check-mobile/', { mobile, type: 'patient' });
      return data?.exists === false;
    } catch {
      return false;
    }
  };

  const finishLogin = async (data: any) => {
    await AsyncStorage.setItem('access',  data.access);
    await AsyncStorage.setItem('refresh', data.refresh);
    // A different account on this device starts with an empty bell (the cache is per audience, not per user).
    try {
      const prev = JSON.parse((await AsyncStorage.getItem('user')) || 'null');
      if (prev?.id !== data.user?.id) await clearNotifications();
    } catch { /* keep logging in */ }
    await AsyncStorage.setItem('user',    JSON.stringify(data.user));
    // Same test as the dashboard's. A hospital whose hospital object failed to
    // attach (best-effort on the backend) goes Home instead, which keeps it
    // signed in with Profile -> Logout — the dashboard would bounce it to the
    // hospital login, which clears the session it was just given.
    if (data.user?.role === 'hospital' && data.user?.hospital) {
      // Drop the logged-out stack so it can't sit under the dashboard.
      if (router.canDismiss()) router.dismissAll();
      router.replace('/(hospital)/dashboard');
    } else if (router.canGoBack()) {
      // A patient sent here by "Login to Book" goes back to that doctor and
      // slot; the screen re-reads the user on focus (useCurrentUser).
      router.back();
    } else {
      router.replace('/(patient)/home');
    }
  };

  // Closing the sheet lands back on the number, in case it was a typo.
  const closeSignUp = () => {
    setSignUp(false);
    setTimeout(() => mobileRef.current?.focus(), 300);
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      if (!mobile || !password) {
        // A new patient often types only their number and taps Sign In.
        if (await isUnregistered()) setSignUp(true);
        else setError(t('lg_enter_mobile_password'));
        return;
      }
      const { data } = await API.post('/auth/login/', { mobile, password });
      await finishLogin(data);
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 401 && await isUnregistered()) setSignUp(true);
      else setError(apiMessage(e, t('lg_invalid_credentials')));
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

          <TouchableOpacity style={styles.back} onPress={() => safeBack(router, '/(patient)/home')}>
            <Text style={styles.backText}>{t('back')}</Text>
          </TouchableOpacity>

          <View style={styles.brand}>
            <View style={styles.logoBox}><Text style={styles.logoText}>TW</Text></View>
            <Text style={styles.brandName}><Text style={styles.accent}>Token</Text>walla</Text>
          </View>

          <Text style={styles.panelLabel}>{t('patient_login')}</Text>
          <Text style={styles.title}>{t('welcome_back')}</Text>
          <Text style={styles.sub}>{t('login_intro')}</Text>

          {([
            { icon: 'ticket-outline',            title: t('feat_instant_token_title'), desc: t('feat_instant_token_desc') },
            { icon: 'navigate-outline',          title: t('feat_live_track_title'),    desc: t('feat_live_track_desc')    },
            { icon: 'shield-checkmark-outline',  title: t('feat_secure_title'),        desc: t('feat_secure_desc')        },
          ] as { icon: ComponentProps<typeof Ionicons>['name']; title: string; desc: string }[]).map(f => (
            <View key={f.title} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={17} color={Colors.blue600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}

          <View style={styles.divider} />

          <Text style={styles.formTitle}>{t('sign_in')}</Text>
          <Text style={styles.formSub}>{t('enter_mobile_continue')}</Text>

          <Text style={styles.label}>{t('mobile_number')}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="call-outline" size={17} color={Colors.gray400} />
            <TextInput
              ref={mobileRef}
              style={styles.input}
              placeholder={t('mobile_placeholder')}
              placeholderTextColor={Colors.gray400}
              keyboardType="numeric"
              value={mobile}
              onChangeText={v => { setMobile(tenDigitMobile(v)); setError(''); }}
            />
          </View>

          <Text style={styles.label}>{t('password_otp')}</Text>
          <View style={styles.otpRow}>
            <View style={[styles.inputRow, { flex: 1, marginBottom: 0 }]}>
              <Ionicons name="lock-closed-outline" size={17} color={Colors.gray400} />
              <TextInput
                style={styles.input}
                placeholder={otpSent ? t('enter_otp') : t('password_or_otp')}
                placeholderTextColor={Colors.gray400}
                secureTextEntry={!otpSent && !showPass}
                keyboardType={otpSent ? 'number-pad' : 'default'}
                textContentType={otpSent ? 'oneTimeCode' : 'password'}
                autoComplete={otpSent ? 'sms-otp' : 'current-password'}
                value={password}
                onChangeText={v => { setPassword(v); setError(''); }}
              />
              {!otpSent && (
                <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={8}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.gray400} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.otpBtn}
              onPress={requestOTP}
              disabled={otpLoading || cooldown > 0}
            >
              {otpLoading
                ? <ActivityIndicator size="small" color={Colors.blue700} />
                : <Text style={styles.otpBtnText}>
                    {cooldown > 0 ? t('resend_in', { seconds: cooldown }) : otpSent ? t('resend') : t('get_otp')}
                  </Text>
              }
            </TouchableOpacity>
          </View>
          {otpSent && <Text style={styles.otpHint}>{t('otp_sent_to', { mobile })}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.submitBtnText}>{t('sign_in_arrow')}</Text>
            }
          </TouchableOpacity>
          {/* Under the button, not above the form: appearing and clearing (on
              every keystroke) must not move the fields or the button under a finger. */}
          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.forgotWrap}
            onPress={() => router.push('/(auth)/forgot-password')}
          >
            <Text style={styles.forgotText}>{t('forgot_password')}</Text>
          </TouchableOpacity>

          {/* Patients and hospital staff alike: finishLogin routes by role. */}
          <GoogleSignInButton onSignedIn={finishLogin} />

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{t('no_account')}</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.switchLink}>{t('create_one_free')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.altLink}
            onPress={() => router.push('/(hospital)/Hlogin')}
          >
            <Text style={styles.altLinkText}>{t('are_you_hospital')}</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {signUp && (
        <RegisterPrompt mobile={mobile} onClose={closeSignUp} onRegistered={finishLogin} />
      )}
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
  errorBox:  { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { fontSize: 14, color: Colors.errorText, flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7, letterSpacing: 0.4 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14, gap: 10 },
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