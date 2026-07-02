import axios from 'axios';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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

// Matches the route used everywhere else for the hospital login screen.
const HOSPITAL_LOGIN_ROUTE = '/(hospital)/login';

interface FormState {
  name: string;
  city: string;
  address: string;
  mobile: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  name?: string;
  city?: string;
  address?: string;
  mobile?: string;
  password?: string;
  confirmPassword?: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  city: '',
  address: '',
  mobile: '',
  password: '',
  confirmPassword: '',
};

const isValidMobile = (m: string) => /^[6-9]\d{9}$/.test(m);

export default function HospitalRegisterScreen() {
  const router = useRouter();

  const [form,    setForm]    = useState<FormState>(EMPTY_FORM);
  const [errors,  setErrors]  = useState<FormErrors>({});

  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const [submitting,  setSubmitting]  = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [globalInfo,  setGlobalInfo]  = useState('');

  const setField = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
    setGlobalError('');
  };

  // ── Validate the whole form (run right before final submit) ───────────────
  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.name.trim())            next.name    = 'Hospital name is required';
    if (!form.city.trim())            next.city    = 'City is required';
    if (!form.address.trim())         next.address = 'Address is required';
    if (!isValidMobile(form.mobile))  next.mobile  = 'Enter a valid 10-digit mobile number';
    if (form.password.length < 6)     next.password = 'Minimum 6 characters';
    if (form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // ── Step: request OTP ──────────────────────────────────────────────────────
  const requestOTP = async () => {
    if (!isValidMobile(form.mobile)) {
      setErrors(prev => ({ ...prev, mobile: 'Enter a valid 10-digit mobile number first' }));
      return;
    }
    setOtpLoading(true);
    setGlobalError('');
    setGlobalInfo('');
    try {
      await API.post('/auth/otp/request/', { mobile: form.mobile });
      setOtpSent(true);
      setGlobalInfo(`📞 OTP sent to ${form.mobile}.`);
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        setGlobalError(e.response?.data?.message || 'OTP failed. Please try again.');
      } else {
        setGlobalError('OTP failed. Please try again.');
      }
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Step: verify OTP ───────────────────────────────────────────────────────
  const verifyOTP = async () => {
    if (!otp || otp.length < 4) {
      setGlobalError('Enter the OTP sent to your mobile.');
      return;
    }
    setGlobalError('');
    try {
      const { data } = await API.post('/auth/otp/verify/', {
        mobile: form.mobile,
        otp,
      });
      if (data.verified) {
        setOtpVerified(true);
        setGlobalInfo('✅ Mobile verified.');
      } else {
        setGlobalError('Invalid OTP. Please try again.');
      }
    } catch {
      setGlobalError('Invalid or expired OTP. Please try again.');
    }
  };

  // ── Final submit: register hospital ────────────────────────────────────────
  const submitHandler = async () => {
    if (!validate()) return;
    if (!otpVerified) {
      setGlobalError('Please verify your mobile number with OTP first.');
      return;
    }

    setSubmitting(true);
    setGlobalError('');
    try {
      await API.post('/hospitals/register/', {
        name:     form.name.trim(),
        city:     form.city.trim(),
        address:  form.address.trim(),
        mobile:   form.mobile.trim(),
        password: form.password,
      });

      setGlobalInfo('');
      setGlobalError('');
      // Registration succeeds with status 'pending' on the backend — the
      // hospital cannot log in until an admin approves it (see
      // HospitalRegisterView / HospitalLoginView). Send them to login with
      // a clear message instead of silently dropping them there.
      router.replace({
        pathname: HOSPITAL_LOGIN_ROUTE,
        params: { registered: '1' },
      } as never);
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        setGlobalError(e.response?.data?.message || 'Registration failed. Please try again.');
      } else {
        setGlobalError('Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.root} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.brand}>
            <View style={styles.logoBox}><Text style={styles.logoText}>TW</Text></View>
            <Text style={styles.brandName}><Text style={styles.accent}>Token</Text>walla</Text>
          </View>

          <Text style={styles.panelLabel}>Hospital Registration</Text>
          <Text style={styles.title}>Register Your{'\n'}Hospital</Text>
          <Text style={styles.sub}>
            Create your hospital account to manage doctors, slots, and live
            patient queues from one dashboard.
          </Text>

          <View style={styles.divider} />

          {!!globalError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {globalError}</Text>
            </View>
          )}
          {!!globalInfo && !globalError && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{globalInfo}</Text>
            </View>
          )}

          {/* Hospital name */}
          <Text style={styles.label}>Hospital Name</Text>
          <View style={[styles.inputRow, errors.name && styles.inputRowError]}>
            <Text style={styles.inputIcon}>🏥</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. City Care Hospital"
              placeholderTextColor={Colors.gray400}
              value={form.name}
              onChangeText={t => setField('name', t)}
            />
          </View>
          {!!errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}

          {/* City */}
          <Text style={styles.label}>City</Text>
          <View style={[styles.inputRow, errors.city && styles.inputRowError]}>
            <Text style={styles.inputIcon}>📍</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Hindupur"
              placeholderTextColor={Colors.gray400}
              value={form.city}
              onChangeText={t => setField('city', t)}
            />
          </View>
          {!!errors.city && <Text style={styles.fieldError}>{errors.city}</Text>}

          {/* Address */}
          <Text style={styles.label}>Full Address</Text>
          <View style={[styles.inputRow, styles.textAreaRow, errors.address && styles.inputRowError]}>
            <Text style={[styles.inputIcon, { marginTop: 2 }]}>🏢</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Street, area, landmark, pincode"
              placeholderTextColor={Colors.gray400}
              value={form.address}
              onChangeText={t => setField('address', t)}
              multiline
              numberOfLines={3}
            />
          </View>
          {!!errors.address && <Text style={styles.fieldError}>{errors.address}</Text>}

          {/* Mobile + OTP */}
          <Text style={styles.label}>Mobile Number</Text>
          <View style={styles.otpRow}>
            <View style={[styles.inputRow, { flex: 1, marginBottom: 0 }, errors.mobile && styles.inputRowError]}>
              <Text style={styles.inputIcon}>📱</Text>
              <TextInput
                style={styles.input}
                placeholder="10-digit mobile number"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
                maxLength={10}
                value={form.mobile}
                onChangeText={t => setField('mobile', t.replace(/\D/g, '').slice(0, 10))}
                editable={!otpVerified}
              />
            </View>
            {!otpVerified && (
              <TouchableOpacity style={styles.otpBtn} onPress={requestOTP} disabled={otpLoading}>
                {otpLoading
                  ? <ActivityIndicator size="small" color={Colors.blue700} />
                  : <Text style={styles.otpBtnText}>{otpSent ? 'Resend' : 'Get OTP'}</Text>
                }
              </TouchableOpacity>
            )}
          </View>
          {!!errors.mobile && <Text style={styles.fieldError}>{errors.mobile}</Text>}

          {otpSent && !otpVerified && (
            <>
              <Text style={[styles.label, { marginTop: 6 }]}>Enter OTP</Text>
              <View style={styles.otpRow}>
                <View style={[styles.inputRow, { flex: 1, marginBottom: 0 }]}>
                  <Text style={styles.inputIcon}>🔢</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="4–6 digit OTP"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                  />
                </View>
                <TouchableOpacity style={styles.verifyBtn} onPress={verifyOTP}>
                  <Text style={styles.verifyBtnText}>Verify</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {otpVerified && (
            <View style={styles.verifiedPill}>
              <Text style={styles.verifiedPillText}>✅ Mobile verified — {form.mobile}</Text>
            </View>
          )}

          <View style={{ marginTop: 8 }} />

          {/* Password */}
          <Text style={styles.label}>Set Password</Text>
          <View style={[styles.inputRow, errors.password && styles.inputRowError]}>
            <Text style={styles.inputIcon}>🔑</Text>
            <TextInput
              style={styles.input}
              placeholder="Minimum 6 characters"
              placeholderTextColor={Colors.gray400}
              secureTextEntry
              value={form.password}
              onChangeText={t => setField('password', t)}
            />
          </View>
          {!!errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}

          {/* Confirm password */}
          <Text style={styles.label}>Confirm Password</Text>
          <View style={[styles.inputRow, errors.confirmPassword && styles.inputRowError]}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              style={styles.input}
              placeholder="Re-enter your password"
              placeholderTextColor={Colors.gray400}
              secureTextEntry
              value={form.confirmPassword}
              onChangeText={t => setField('confirmPassword', t)}
            />
          </View>
          {!!errors.confirmPassword && <Text style={styles.fieldError}>{errors.confirmPassword}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submitHandler}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.submitBtnText}>Register Hospital →</Text>
            }
          </TouchableOpacity>

          <Text style={styles.pendingNote}>
            ℹ️ Your account will be reviewed by an admin before you can log in.
          </Text>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.altLink} onPress={() => router.push(HOSPITAL_LOGIN_ROUTE)}>
            <Text style={styles.altLinkText}>
              Already registered?{' '}
              <Text style={styles.altLinkAccent}>Hospital Login →</Text>
            </Text>
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
  title:      { fontSize: 26, fontWeight: '800', color: Colors.gray900, marginBottom: 6, lineHeight: 32 },
  sub:        { fontSize: 14, color: Colors.gray500, marginBottom: 8, lineHeight: 21 },

  divider: { height: 1, backgroundColor: Colors.blue50, marginVertical: 20 },

  errorBox:  { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', gap: 8 },
  errorText: { fontSize: 14, color: Colors.errorText, flex: 1 },
  infoBox:   { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, padding: 12, marginBottom: 16 },
  infoText:  { fontSize: 13, color: Colors.successText },

  label: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7, letterSpacing: 0.4 },

  inputRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14, gap: 10 },
  inputRowError: { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg },
  textAreaRow:   { alignItems: 'flex-start', paddingVertical: 10 },
  inputIcon:     { fontSize: 15 },
  input:         { flex: 1, fontSize: 15, color: Colors.gray900, paddingVertical: 13 },
  textArea:      { paddingVertical: 4, minHeight: 60, textAlignVertical: 'top' },
  fieldError:    { fontSize: 12, color: Colors.errorText, marginTop: -10, marginBottom: 12 },

  otpRow:        { flexDirection: 'row', gap: 10, marginBottom: 6, alignItems: 'flex-start' },
  otpBtn:        { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', minWidth: 80, alignItems: 'center', minHeight: 50 },
  otpBtnText:    { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  verifyBtn:     { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', minHeight: 50 },
  verifyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.successText },

  verifiedPill:     { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14 },
  verifiedPillText: { fontSize: 13, fontWeight: '600', color: Colors.successText },

  submitBtn:         { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 8, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { color: Colors.white, fontWeight: '700', fontSize: 15 },

  pendingNote: { fontSize: 12, color: Colors.gray400, textAlign: 'center', marginTop: 14, lineHeight: 18 },

  altLink:       { alignItems: 'center' },
  altLinkText:   { fontSize: 13, color: Colors.gray500 },
  altLinkAccent: { color: Colors.blue600, fontWeight: '700' },
});