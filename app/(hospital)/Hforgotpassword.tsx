import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import API from '../../services/api';

// ── Constants ────────────────────────────────────────────────────────────────

const STEPS = ['Mobile', 'Verify OTP', 'New Password'];

const FEATURES = [
  {
    icon: '🔐',
    title: 'Secure Reset',
    desc: 'OTP sent via SMS to your registered mobile number',
  },
  {
    icon: '✉️',
    title: 'SMS OTP',
    desc: 'Answer the automated sms and note the OTP spoken to you',
  },
  {
    icon: '🏥',
    title: 'Hospital Account',
    desc: 'Resets only your hospital admin password — not patient accounts',
  },
];

// ── Color tokens (mirrors authStyles.js CSS vars) ────────────────────────────
const C = {
  blue50:   '#EFF6FF',
  blue100:  '#DBEAFE',
  blue200:  '#BFDBFE',
  blue400:  '#60A5FA',
  blue600:  '#2563EB',
  blue700:  '#1D4ED8',
  blue800:  '#1E40AF',
  gray50:   '#F9FAFB',
  gray200:  '#E5E7EB',
  gray300:  '#D1D5DB',
  gray400:  '#9CA3AF',
  gray500:  '#6B7280',
  gray600:  '#4B5563',
  gray900:  '#111827',
  white:    '#FFFFFF',
  successBg:     '#F0FDF4',
  successBorder: '#86EFAC',
  successText:   '#15803D',
  errorBg:       '#FEF2F2',
  errorBorder:   '#FECACA',
  errorText:     '#DC2626',
};

// ── Strength helpers ─────────────────────────────────────────────────────────
const strengthColors = ['', '#F09595', '#EF9F27', '#97C459', '#3B6D11'];
const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

function calcStrength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 6)        s++;
  if (pw.length >= 10)       s++;
  if (/[A-Z]/.test(pw))      s++;
  if (/\d/.test(pw))         s++;
  return Math.min(s, 4);
}

// ═════════════════════════════════════════════════════════════════════════════
export default function HforgotPassword() {
  const router = useRouter();
  const [step,      setStep]      = useState(1);
  const [mobile,    setMobile]    = useState('');
  const [otp,       setOtp]       = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [resending, setResending] = useState(false);
  const [done,      setDone]      = useState(false);

  // Progress-bar animation for success state
  const progressAnim = useRef(new Animated.Value(0)).current;

  const startProgressBar = () => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 1800,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  const strength = calcStrength(password);

  // ── Step 1: Request OTP ────────────────────────────────────────────────────
  const requestOTP = async () => {
    const cleaned = mobile.replace(/\D/g, '').slice(0, 10);
    if (!cleaned || cleaned.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await API.post('/auth/otp/request/', { mobile: cleaned, via: 'SMS' });
      setSuccess(`📞 An SMS has been sent to ${cleaned}. Please check and note the OTP.`);
      setStep(2);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to initiate SMS. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  const resendOTP = async () => {
    setResending(true);
    setError('');
    setSuccess('');
    try {
      await API.post('/auth/otp/request/', { mobile, via: 'SMS' });
      setSuccess(' A new SMS has been sent. Please check and note the OTP.');
      setOtp('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Could not resend OTP. Wait 60 seconds and try again.');
    } finally {
      setResending(false);
    }
  };

  // ── Step 2: Verify OTP ─────────────────────────────────────────────────────
  const verifyOTP = async () => {
    if (!otp || otp.replace(/\D/g, '').length < 4) {
      setError('Please enter the OTP you received in the SMS.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile, otp });
      if (data.verified) {
        setSuccess('✅ OTP verified! Now set your new password.');
        setStep(3);
      } else {
        setError('Incorrect OTP. Please try again or request a new SMS.');
      }
    } catch {
      setError('Verification failed. The OTP may have expired — please request a new SMS.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Reset Password ─────────────────────────────────────────────────
  const resetPassword = async () => {
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await API.post('/hospitals/reset-password/', { mobile, otp, password });
      setDone(true);
      startProgressBar();
      setTimeout(() => {
        router.replace('/(hospital)/login');
      }, 1800);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Reset failed. Please restart the process.');
    } finally {
      setLoading(false);
    }
  };

  // ── Shared sub-components ──────────────────────────────────────────────────

  const Alert = ({ type, msg }: { type: 'error' | 'success'; msg: string }) => (
    <View style={[s.alert, type === 'error' ? s.alertError : s.alertSuccess]}>
      <Text style={[s.alertText, type === 'error' ? s.alertTextError : s.alertTextSuccess]}>
        {type === 'error' ? '⚠️  ' : ''}{msg}
      </Text>
    </View>
  );

  const SubmitButton = ({
    onPress,
    disabled,
    label,
    loadingLabel,
  }: {
    onPress: () => void;
    disabled: boolean;
    label: string;
    loadingLabel: string;
  }) => (
    <TouchableOpacity
      style={[s.submitBtn, disabled && s.submitBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
    >
      {loading
        ? <><ActivityIndicator color={C.white} size="small" style={{ marginRight: 8 }} /><Text style={s.submitBtnText}>{loadingLabel}</Text></>
        : <Text style={s.submitBtnText}>{label}</Text>
      }
    </TouchableOpacity>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── HEADER ──────────────────────────────────────────────────────── */}
          <View style={s.header}>
            <TouchableOpacity style={s.backArrow} onPress={() => router.back()}>
              <Text style={s.backArrowText}>←</Text>
            </TouchableOpacity>
            <View style={s.brandRow}>
              <View style={s.brandLogo}>
                <Text style={s.brandLogoText}>T</Text>
              </View>
              <Text style={s.brandName}>
                <Text style={s.accent}>Token</Text>walla
              </Text>
            </View>
            <Text style={s.panelLabel}>Hospital Account Recovery</Text>
            <Text style={s.panelTitle}>
              Reset Your{'\n'}
              <Text style={s.accent}>Hospital Password</Text>
            </Text>
            <Text style={s.panelSub}>
              Forgot your hospital login password? We'll verify your identity via a voice call and get you back in securely.
            </Text>
          </View>

          {/* ── FEATURES ───────────────────────────────────────────────────── */}
          <View style={s.featuresRow}>
            {FEATURES.map((f, i) => (
              <View key={i} style={s.featureCard}>
                <Text style={s.featureIcon}>{f.icon}</Text>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>

          {/* ── STEP PROGRESS ──────────────────────────────────────────────── */}
          <View style={s.stepLabels}>
            {STEPS.map((label, i) => {
              const isDone   = i + 1 < step;
              const isActive = i + 1 === step;
              return (
                <Text
                  key={label}
                  style={[
                    s.stepLabel,
                    isDone   && s.stepLabelDone,
                    isActive && s.stepLabelActive,
                  ]}
                >
                  {isDone ? '✓ ' : ''}{label}
                </Text>
              );
            })}
          </View>
          <View style={s.progressRow}>
            {[1, 2, 3].map(n => (
              <View
                key={n}
                style={[
                  s.progressStep,
                  n < step  && s.progressStepDone,
                  n === step && s.progressStepActive,
                ]}
              />
            ))}
          </View>

          {/* ══════════════════════════════════════════════════════════════════
              STEP 1 – Mobile Entry
          ══════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <View style={s.card}>
              <Text style={s.formTitle}>Forgot Password?</Text>
              <Text style={s.formSub}>
                Enter your hospital's registered mobile number. We'll call you with a one-time code.
              </Text>

              {!!error && <Alert type="error" msg={error} />}

              <Text style={s.fieldLabel}>Registered Hospital Mobile</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputIcon}>🏥</Text>
                <TextInput
                  style={s.input}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={C.gray300}
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={mobile}
                  onChangeText={v => { setMobile(v.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={requestOTP}
                />
              </View>
              <Text style={s.fieldHint}>This must be the mobile used when registering your hospital</Text>

              <View style={s.voiceInfo}>
                <Text style={s.voiceIcon}>📞</Text>
                <Text style={s.voiceText}>
                  We'll place an <Text style={{ fontWeight: '700' }}> automated SMS </Text> to this number.
                </Text>
              </View>

              <SubmitButton
                onPress={requestOTP}
                disabled={loading || mobile.length !== 10}
                label=" Send OTP →"
                loadingLabel="Calling…"
              />

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerOr}>or</Text>
                <View style={s.dividerLine} />
              </View>

              <TouchableOpacity onPress={() => router.push('./Hlogin')}>
                <Text style={s.switchText}>
                  Remember your password?{' '}
                  <Text style={s.switchLink}>Sign in →</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 2 – OTP Verification
          ══════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <View style={s.card}>
              <Text style={s.formTitle}>Enter Your OTP</Text>
              <Text style={s.formSub}>
                OTP has send check once
              </Text>

              {/* Mobile display */}
              <View style={s.mobileDisplay}>
                <Text style={s.mobileDisplayText}>📱  {mobile}</Text>
                <TouchableOpacity
                  onPress={() => { setStep(1); setError(''); setSuccess(''); setOtp(''); }}
                  style={{ marginLeft: 8 }}
                >
                  <Text style={s.changeBtn}>(change)</Text>
                </TouchableOpacity>
              </View>

              {!!error   && <Alert type="error"   msg={error}   />}
              {!!success && <Alert type="success" msg={success} />}

              <Text style={s.fieldLabel}>OTP from Voice Call</Text>
              <TextInput
                style={s.otpInput}
                placeholder="• • • •"
                placeholderTextColor={C.gray300}
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={v => { setOtp(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={verifyOTP}
              />

              <View style={s.resendRow}>
                <Text style={s.resendLabel}>Didn't receive the OTP?</Text>
                <Text style={s.resendSep}> · </Text>
                <TouchableOpacity onPress={resendOTP} disabled={resending}>
                  <Text style={[s.resendBtn, resending && { opacity: 0.5 }]}>
                    {resending ? 'Calling…' : 'Call again'}
                  </Text>
                </TouchableOpacity>
              </View>

              <SubmitButton
                onPress={verifyOTP}
                disabled={loading || otp.length < 4}
                label="✅  Verify OTP →"
                loadingLabel="Verifying…"
              />

              <TouchableOpacity
                style={s.backBtn}
                onPress={() => { setStep(1); setError(''); setSuccess(''); setOtp(''); }}
              >
                <Text style={s.backBtnText}>← Back to mobile entry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 3 – New Password
          ══════════════════════════════════════════════════════════════════ */}
          {step === 3 && !done && (
            <View style={s.card}>
              <Text style={s.formTitle}>Set New Password</Text>
              <Text style={s.formSub}>
                Choose a strong new password for your hospital account.
              </Text>

              {!!error   && <Alert type="error"   msg={error}   />}
              {!!success && <Alert type="success" msg={success} />}

              {/* New Password field */}
              <Text style={s.fieldLabel}>New Password</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputIcon}>🔑</Text>
                <TextInput
                  style={[s.input, { paddingRight: 48 }]}
                  placeholder="Minimum 6 characters"
                  placeholderTextColor={C.gray300}
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={v => { setPassword(v); setError(''); }}
                  autoFocus
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPass(p => !p)}
                >
                  <Text style={s.eyeIcon}>{showPass ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>

              {/* Strength bar */}
              {!!password && (
                <>
                  <View style={s.strengthRow}>
                    {[1, 2, 3, 4].map(i => (
                      <View
                        key={i}
                        style={[
                          s.strengthBar,
                          { backgroundColor: i <= strength ? strengthColors[strength] : C.blue100 },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[s.strengthLabel, { color: strengthColors[strength] || C.gray400 }]}>
                    {strength > 0 ? `${strengthLabels[strength]} password` : ''}
                  </Text>
                </>
              )}

              {/* Confirm Password */}
              <Text style={[s.fieldLabel, { marginTop: 8 }]}>Confirm Password</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputIcon}>🔒</Text>
                <TextInput
                  style={s.input}
                  placeholder="Re-enter your new password"
                  placeholderTextColor={C.gray300}
                  secureTextEntry
                  value={confirm}
                  onChangeText={v => { setConfirm(v); setError(''); }}
                  returnKeyType="done"
                  onSubmitEditing={resetPassword}
                />
              </View>
              {!!confirm && (
                <Text style={[s.matchHint, { color: confirm === password ? C.successText : C.errorText }]}>
                  {confirm === password ? '✓ Passwords match' : '✗ Passwords do not match'}
                </Text>
              )}

              <SubmitButton
                onPress={resetPassword}
                disabled={loading || !password || password !== confirm || password.length < 6}
                label="🔐  Reset Password →"
                loadingLabel="Resetting…"
              />
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              SUCCESS STATE
          ══════════════════════════════════════════════════════════════════ */}
          {done && (
            <View style={s.card}>
              <View style={s.successCard}>
                <View style={s.successIconWrap}>
                  <Text style={s.successIconText}>✅</Text>
                </View>
                <Text style={s.successTitle}>Password Reset Successful!</Text>
                <Text style={s.successSub}>
                  Your hospital account password has been updated.{'\n'}
                  Redirecting you to the login page…
                </Text>

                {/* Animated progress bar */}
                <View style={s.progressBarTrack}>
                  <Animated.View
                    style={[
                      s.progressBarFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>

                <TouchableOpacity
                  style={s.submitBtn}
                  onPress={() => router.replace('./Hlogin')}
                  activeOpacity={0.82}
                >
                  <Text style={s.submitBtnText}>Go to Hospital Login →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Footer ────────────────────────────────────────────────────── */}
          {!done && (
            <View style={s.footer}>
              <Text style={s.footerText}>
                Are you a patient?{' '}
                <Text
                  style={s.footerLink}
                  onPress={() => router.push('../(auth)/forgot-password')}
                >
                  Patient forgot password →
                </Text>
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.white,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingTop: 20,
    marginBottom: 20,
  },
  backArrow: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  backArrowText: {
    fontSize: 22,
    color: C.blue600,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.blue600,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandLogoText: {
    color: C.white,
    fontWeight: '800',
    fontSize: 18,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '700',
    color: C.gray900,
  },
  accent: {
    color: C.blue600,
  },
  panelLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.blue600,
    marginBottom: 6,
  },
  panelTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: C.gray900,
    lineHeight: 34,
    marginBottom: 10,
  },
  panelSub: {
    fontSize: 14,
    color: C.gray500,
    lineHeight: 22,
  },

  // ── Feature cards ─────────────────────────────────────────────────────────
  featuresRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  featureCard: {
    flex: 1,
    backgroundColor: C.blue50,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  featureTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.blue700,
    textAlign: 'center',
    marginBottom: 3,
  },
  featureDesc: {
    fontSize: 10,
    color: C.gray500,
    textAlign: 'center',
    lineHeight: 14,
  },

  // ── Step progress ─────────────────────────────────────────────────────────
  stepLabels: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  stepLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: C.gray400,
  },
  stepLabelActive: {
    color: C.blue600,
  },
  stepLabelDone: {
    color: C.successText,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 28,
  },
  progressStep: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.blue100,
  },
  progressStepActive: {
    backgroundColor: C.blue600,
  },
  progressStepDone: {
    backgroundColor: C.successText,
  },

  // ── Card (form container) ─────────────────────────────────────────────────
  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.blue100,
    marginBottom: 20,
    shadowColor: C.blue200,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.gray900,
    marginBottom: 6,
  },
  formSub: {
    fontSize: 14,
    color: C.gray500,
    lineHeight: 21,
    marginBottom: 18,
  },

  // ── Alerts ────────────────────────────────────────────────────────────────
  alert: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  alertError: {
    backgroundColor: C.errorBg,
    borderColor: C.errorBorder,
  },
  alertSuccess: {
    backgroundColor: C.successBg,
    borderColor: C.successBorder,
  },
  alertText: {
    fontSize: 13,
    lineHeight: 19,
  },
  alertTextError: {
    color: C.errorText,
  },
  alertTextSuccess: {
    color: C.successText,
  },

  // ── Form fields ───────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.gray600,
    marginBottom: 7,
  },
  fieldHint: {
    fontSize: 12,
    color: C.gray400,
    marginTop: 5,
    marginBottom: 16,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.gray50,
    borderWidth: 1,
    borderColor: C.blue100,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 4,
    position: 'relative',
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 15,
    color: C.gray900,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: [{ translateY: -12 }],
    padding: 4,
  },
  eyeIcon: {
    fontSize: 15,
  },

  // ── OTP ───────────────────────────────────────────────────────────────────
  otpInput: {
    backgroundColor: C.gray50,
    borderWidth: 1,
    borderColor: C.blue100,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 28,
    fontWeight: '500',
    color: C.blue700,
    letterSpacing: 12,
    textAlign: 'center',
    marginBottom: 14,
  },

  // ── Voice info box ────────────────────────────────────────────────────────
  voiceInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: C.blue50,
    borderWidth: 1,
    borderColor: C.blue200,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  voiceIcon: {
    fontSize: 20,
    marginTop: 1,
    marginRight: 4,
  },
  voiceText: {
    flex: 1,
    fontSize: 13,
    color: C.blue700,
    lineHeight: 20,
  },

  // ── Mobile display tag ────────────────────────────────────────────────────
  mobileDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: C.blue50,
    borderWidth: 1,
    borderColor: C.blue200,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  mobileDisplayText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.blue700,
    letterSpacing: 1,
  },
  changeBtn: {
    fontSize: 12,
    color: C.blue600,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // ── Resend row ────────────────────────────────────────────────────────────
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  resendLabel: {
    fontSize: 13,
    color: C.gray400,
  },
  resendSep: {
    fontSize: 13,
    color: C.gray300,
  },
  resendBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: C.blue600,
    textDecorationLine: 'underline',
  },

  // ── Submit button ─────────────────────────────────────────────────────────
  submitBtn: {
    backgroundColor: C.blue600,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: C.blue600,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: C.blue200,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Back button ───────────────────────────────────────────────────────────
  backBtn: {
    alignSelf: 'center',
    marginTop: 14,
    padding: 6,
  },
  backBtnText: {
    fontSize: 13,
    color: C.gray400,
  },

  // ── Strength bar ──────────────────────────────────────────────────────────
  strengthRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
    marginBottom: 3,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 14,
  },
  matchHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 5,
    marginBottom: 4,
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.blue100,
  },
  dividerOr: {
    marginHorizontal: 12,
    fontSize: 13,
    color: C.gray400,
    fontWeight: '500',
  },

  // ── Switch / footer link ──────────────────────────────────────────────────
  switchText: {
    textAlign: 'center',
    fontSize: 14,
    color: C.gray500,
  },
  switchLink: {
    color: C.blue600,
    fontWeight: '600',
  },
  footer: {
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: C.blue50,
    marginTop: 4,
    marginBottom: 10,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 13,
    color: C.gray400,
  },
  footerLink: {
    color: C.blue600,
    fontWeight: '600',
  },

  // ── Success card ──────────────────────────────────────────────────────────
  successCard: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.successBg,
    borderWidth: 2,
    borderColor: C.successBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIconText: {
    fontSize: 32,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.gray900,
    marginBottom: 8,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 14,
    color: C.gray500,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  progressBarTrack: {
    width: '100%',
    height: 3,
    backgroundColor: C.blue100,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: C.blue600,
    borderRadius: 2,
  },
});