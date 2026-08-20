import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import LocationSearch from '../../components/LocationSearch';
import LocationPickerModal from '../../components/LocationPickerModal';
import API from '../../services/api';
import { safeBack } from '../../utils/navigation';
import { useAndroidBack } from '../../hooks/useAndroidBack';

// Matches the route used everywhere else for the hospital login screen.
const HOSPITAL_LOGIN_ROUTE = '/(hospital)/login';

interface FormState {
  kind: 'HOSPITAL' | 'SCAN_CENTER';
  name: string;
  city: string;
  address: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  licenseNumber: string;
  latitude: number | null;
  longitude: number | null;
}

interface FormErrors {
  name?: string;
  city?: string;
  address?: string;
  mobile?: string;
  password?: string;
  confirmPassword?: string;
  licenseNumber?: string;
}

const EMPTY_FORM: FormState = {
  kind: 'HOSPITAL',
  name: '',
  city: '',
  address: '',
  mobile: '',
  password: '',
  confirmPassword: '',
  licenseNumber: '',
  latitude: null,
  longitude: null,
};

const isValidMobile = (m: string) => /^[6-9]\d{9}$/.test(m);

export default function HospitalRegisterScreen() {
  const router = useRouter();
  useAndroidBack(() => safeBack(router, '/(hospital)/login'));

  // ?kind=SCAN_CENTER lands a centre on the centre form, so the "Register your
  // scanning centre" links elsewhere in the app arrive at the right thing.
  // Whitelisted against the one value we accept rather than trusted — the
  // toggle below stays the real control either way.
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const [form,    setForm]    = useState<FormState>(
    kindParam === 'SCAN_CENTER' ? { ...EMPTY_FORM, kind: 'SCAN_CENTER' } : EMPTY_FORM,
  );

  // One flag drives every label. A scanning centre registers through the same
  // form, the same OTP and the same admin approval as a hospital — only the
  // wording and the bookable unit differ (Doctors vs Scans).
  const isCentre = form.kind === 'SCAN_CENTER';
  const noun     = isCentre ? 'Scanning Centre' : 'Hospital';
  const [errors,  setErrors]  = useState<FormErrors>({});

  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const [pickerOpen,  setPickerOpen]  = useState(false);

  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
    // Centre-only. The backend blocks approval without it, so catching it here
    // saves a partner sitting in 'pending' with no idea what is missing.
    if (isCentre && !form.licenseNumber.trim()) {
      next.licenseNumber = 'Registration / licence number is required';
    }
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
      setGlobalInfo(`OTP sent to ${form.mobile}.`);
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
        setGlobalInfo('Mobile verified.');
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
        kind:      form.kind,
        name:      form.name.trim(),
        city:      form.city.trim(),
        address:   form.address.trim(),
        latitude:  form.latitude,
        longitude: form.longitude,
        mobile:    form.mobile.trim(),
        password:  form.password,
        license_number: form.licenseNumber.trim(),
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView contentContainerStyle={styles.root} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <TouchableOpacity style={styles.back} onPress={() => safeBack(router,'/(hospital)/login')}>
            <Ionicons name="chevron-back" size={16} color={Colors.blue600} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.brand}>
            <View style={styles.logoBox}><Text style={styles.logoText}>TW</Text></View>
            <Text style={styles.brandName}><Text style={styles.accent}>Token</Text>walla</Text>
          </View>

          <Text style={styles.panelLabel}>{noun} Registration</Text>
          <Text style={styles.title}>Register Your{'\n'}{isCentre ? 'Centre' : 'Hospital'}</Text>
          <Text style={styles.sub}>
            {isCentre
              ? 'Create your centre account to list your scans and prices, take bookings and manage the queue from one dashboard.'
              : 'Create your hospital account to manage doctors, slots, and live patient queues from one dashboard.'}
          </Text>

          {/* What are you registering? Asked first, because it changes what the
              account can do: a hospital lists doctors and OPD slots, a centre
              lists scans and their prices. Changing it later needs an admin. */}
          <View style={styles.kindRow}>
            {([
              { value: 'HOSPITAL',    icon: 'business-outline',   label: 'Hospital / Clinic', sub: 'Doctors and OPD slots' },
              { value: 'SCAN_CENTER', icon: 'pulse-outline',      label: 'Scanning Centre',   sub: 'MRI, CT, X-ray, blood' },
            ] as const).map(opt => {
              const active = form.kind === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.kindCard, active && styles.kindCardActive]}
                  onPress={() => setForm(prev => ({ ...prev, kind: opt.value }))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={active ? Colors.blue700 : Colors.gray400}
                  />
                  <Text style={[styles.kindLabel, active && styles.kindLabelActive]}>{opt.label}</Text>
                  <Text style={styles.kindSub}>{opt.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          {!!globalError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
              <Text style={styles.errorText}>{globalError}</Text>
            </View>
          )}
          {!!globalInfo && !globalError && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{globalInfo}</Text>
            </View>
          )}

          {/* Provider name */}
          <Text style={styles.label}>{noun} Name</Text>
          <View style={[styles.inputRow, errors.name && styles.inputRowError]}>
            <Ionicons name={isCentre ? 'pulse-outline' : 'business-outline'} size={17} color={Colors.gray400} />
            <TextInput
              style={styles.input}
              placeholder={isCentre ? 'e.g. Vijaya Diagnostics' : 'e.g. City Care Hospital'}
              placeholderTextColor={Colors.gray400}
              value={form.name}
              onChangeText={t => setField('name', t)}
            />
          </View>
          {!!errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}

          {/* Registration / licence number — scanning centres only. The one
              field separating a real centre from anybody who can type a name,
              and a patient walks into the result for an MRI. */}
          {isCentre && (
            <>
              <Text style={styles.label}>Registration / Licence Number</Text>
              <View style={[styles.inputRow, errors.licenseNumber && styles.inputRowError]}>
                <Ionicons name="card-outline" size={17} color={Colors.gray400} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. AP/CEA/2026/1188"
                  placeholderTextColor={Colors.gray400}
                  autoCapitalize="characters"
                  value={form.licenseNumber}
                  onChangeText={t => setField('licenseNumber', t)}
                />
              </View>
              {errors.licenseNumber
                ? <Text style={styles.fieldError}>{errors.licenseNumber}</Text>
                : <Text style={styles.fieldHint}>
                    Your Clinical Establishments Act registration, AERB licence or NABL
                    id — whichever your centre operates under. We verify it before
                    approving your account.
                  </Text>}
            </>
          )}

          {/* City / location — real place autocomplete (captures coordinates) */}
          <Text style={styles.label}>City / Location</Text>
          <LocationSearch
            value={form.city}
            hasError={!!errors.city}
            placeholder="Search your city or area…"
            onChangeText={(t) => {
              // Free typing clears any previously picked coordinates.
              setForm(prev => ({ ...prev, city: t, latitude: null, longitude: null }));
              setErrors(prev => ({ ...prev, city: undefined }));
              setGlobalError('');
            }}
            onPick={({ city, lat, lng }) => {
              setForm(prev => ({ ...prev, city: city || prev.city, latitude: lat, longitude: lng }));
              setErrors(prev => ({ ...prev, city: undefined }));
            }}
          />
          {form.latitude != null ? (
            <View style={styles.pinnedRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.successText} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pinnedTitle}>Pinned on the map</Text>
                <Text style={styles.pinnedCoords} numberOfLines={1}>
                  {form.latitude.toFixed(6)}, {form.longitude!.toFixed(6)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPickerOpen(true)} style={styles.pinnedChange}>
                <Text style={styles.pinnedChangeText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.pickBtn} onPress={() => setPickerOpen(true)}>
              <Ionicons name="map-outline" size={16} color={Colors.blue700} />
              <Text style={styles.pickBtnText}>Pin exact location on map</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.pinnedHint}>
            An exact pin helps patients find your entrance and get directions.
          </Text>
          {!!errors.city && <Text style={styles.fieldError}>{errors.city}</Text>}

          <LocationPickerModal
            visible={pickerOpen}
            initial={{ lat: form.latitude, lng: form.longitude }}
            onClose={() => setPickerOpen(false)}
            onPick={({ city, lat, lng }) => {
              setForm(prev => ({ ...prev, city: prev.city || city, latitude: lat, longitude: lng }));
              setErrors(prev => ({ ...prev, city: undefined }));
            }}
          />
          <View style={{ height: 14 }} />

          {/* Address */}
          <Text style={styles.label}>Full Address</Text>
          <View style={[styles.inputRow, styles.textAreaRow, errors.address && styles.inputRowError]}>
            <Ionicons name="home-outline" size={17} color={Colors.gray400} style={{ marginTop: 2 }} />
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
              <Ionicons name="call-outline" size={17} color={Colors.gray400} />
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
                  <Ionicons name="keypad-outline" size={17} color={Colors.gray400} />
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
              <Ionicons name="checkmark-circle" size={16} color={Colors.successText} />
              <Text style={styles.verifiedPillText}>Mobile verified — {form.mobile}</Text>
            </View>
          )}

          <View style={{ marginTop: 8 }} />

          {/* Password */}
          <Text style={styles.label}>Set Password</Text>
          <View style={[styles.inputRow, errors.password && styles.inputRowError]}>
            <Ionicons name="lock-closed-outline" size={17} color={Colors.gray400} />
            <TextInput
              style={styles.input}
              placeholder="Minimum 6 characters"
              placeholderTextColor={Colors.gray400}
              secureTextEntry={!showPass}
              value={form.password}
              onChangeText={t => setField('password', t)}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={8}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.gray400} />
            </TouchableOpacity>
          </View>
          {!!errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}

          {/* Confirm password */}
          <Text style={styles.label}>Confirm Password</Text>
          <View style={[styles.inputRow, errors.confirmPassword && styles.inputRowError]}>
            <Ionicons name="lock-closed-outline" size={17} color={Colors.gray400} />
            <TextInput
              style={styles.input}
              placeholder="Re-enter your password"
              placeholderTextColor={Colors.gray400}
              secureTextEntry={!showConfirm}
              value={form.confirmPassword}
              onChangeText={t => setField('confirmPassword', t)}
            />
            <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={8}>
              <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.gray400} />
            </TouchableOpacity>
          </View>
          {!!errors.confirmPassword && <Text style={styles.fieldError}>{errors.confirmPassword}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submitHandler}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.submitBtnText}>Register {noun} →</Text>
            }
          </TouchableOpacity>

          <View style={styles.pendingNote}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.blue600} style={{ marginRight: 7, marginTop: 1 }} />
            <Text style={styles.pendingNoteText}>Your account will be reviewed by an admin before you can log in.</Text>
          </View>

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

  back:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 24, alignSelf: 'flex-start' },
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

  errorBox:  { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { fontSize: 14, color: Colors.errorText, flex: 1 },
  infoBox:   { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, padding: 12, marginBottom: 16 },
  infoText:  { fontSize: 13, color: Colors.successText },

  label: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7, letterSpacing: 0.4 },

  inputRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14, gap: 10 },
  inputRowError: { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg },
  textAreaRow:   { alignItems: 'flex-start', paddingVertical: 10 },
  input:         { flex: 1, fontSize: 15, color: Colors.gray900, paddingVertical: 13 },
  textArea:      { paddingVertical: 4, minHeight: 60, textAlignVertical: 'top' },
  fieldError:    { fontSize: 12, color: Colors.errorText, marginTop: -10, marginBottom: 12 },
  fieldHint:     { fontSize: 11.5, color: Colors.gray400, lineHeight: 17, marginTop: -8, marginBottom: 12 },

  kindRow:   { flexDirection: 'row', gap: 10, marginBottom: 18 },
  kindCard: {
    flex: 1, gap: 3, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.gray200,
  },
  kindCardActive: { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  kindLabel:       { fontSize: 13, fontWeight: '700', color: Colors.gray700 },
  kindLabelActive: { color: Colors.blue700 },
  kindSub:         { fontSize: 11, color: Colors.gray400, lineHeight: 15 },

  pickBtn:       { flexDirection: 'row', gap: 8, justifyContent: 'center', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  pickBtnText:   { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  pinnedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder,
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11,
  },
  pinnedTitle:  { fontSize: 13, fontWeight: '700', color: Colors.successText },
  pinnedCoords: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  pinnedChange: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.successBorder,
  },
  pinnedChangeText: { fontSize: 12, fontWeight: '700', color: Colors.successText },
  pinnedHint: { fontSize: 11.5, color: Colors.gray500, marginTop: 6, marginBottom: 2 },

  otpRow:        { flexDirection: 'row', gap: 10, marginBottom: 6, alignItems: 'flex-start' },
  otpBtn:        { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', minWidth: 80, alignItems: 'center', minHeight: 50 },
  otpBtnText:    { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  verifyBtn:     { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', minHeight: 50 },
  verifyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.successText },

  verifiedPill:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14 },
  verifiedPillText: { fontSize: 13, fontWeight: '600', color: Colors.successText },

  submitBtn:         { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 8, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { color: Colors.white, fontWeight: '700', fontSize: 15 },

  pendingNote: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  pendingNoteText: { flex: 1, fontSize: 12, color: Colors.gray400, lineHeight: 18 },

  altLink:       { alignItems: 'center' },
  altLinkText:   { fontSize: 13, color: Colors.gray500 },
  altLinkAccent: { color: Colors.blue600, fontWeight: '700' },
});