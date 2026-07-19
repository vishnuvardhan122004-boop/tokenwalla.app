/**
 * app/(patient)/edit-profile.tsx — Patient edit profile.
 *
 * Edit name freely. Changing the mobile number requires OTP verification of the
 * NEW number before saving.
 *
 * Backend: PATCH /auth/me/  { name, mobile }
 *   - name is updated directly
 *   - mobile only changes if the server has an OTP-verified flag for it
 *     (set via /auth/otp/verify/). Until PATCH /auth/me/ is deployed, Save shows
 *     a friendly message instead of failing silently.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useI18n } from '../../services/i18n';
import API, { getUser } from '../../services/api';

export default function EditProfile() {
  const router = useRouter();
  const { t } = useI18n();

  const [origName,   setOrigName]   = useState('');
  const [origMobile, setOrigMobile] = useState('');
  const [name,       setName]       = useState('');
  const [mobile,     setMobile]     = useState('');
  const [loaded,     setLoaded]     = useState(false);
  const [saving,     setSaving]     = useState(false);

  // OTP state for a mobile change
  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (!u) { router.replace('/(auth)/login'); return; }
      const n = u.name || u.username || '';
      const m = u.mobile || '';
      setOrigName(n); setOrigMobile(m); setName(n); setMobile(m);
      setLoaded(true);
    })();
  }, []);

  const mobileChanged = mobile.trim() !== origMobile;
  const isValidMobile = (m: string) => /^[6-9]\d{9}$/.test(m.trim());

  const sendOtp = async () => {
    if (!isValidMobile(mobile)) { Alert.alert(t('ep_invalid'), t('ep_invalid_mobile')); return; }
    setOtpLoading(true);
    try {
      await API.post('/auth/otp/request/', { mobile: mobile.trim(), via: 'sms' });
      setOtpSent(true);
      setOtpVerified(false);
    } catch (e: any) {
      Alert.alert(t('error'), e?.response?.data?.message || t('ep_otp_send_fail'));
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return;
    setOtpLoading(true);
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile: mobile.trim(), otp: otp.trim() });
      if (data?.verified) { setOtpVerified(true); Alert.alert(t('ep_verified_title'), t('ep_verified_msg')); }
      else Alert.alert(t('ep_invalid_otp'), t('ep_check_try_again'));
    } catch (e: any) {
      Alert.alert(t('ep_invalid_otp'), e?.response?.data?.message || t('ep_try_again'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert(t('ep_validation'), t('ep_name_required')); return; }
    if (mobileChanged && !otpVerified) { Alert.alert(t('ep_verify_mobile'), t('ep_verify_mobile_msg')); return; }

    setSaving(true);
    try {
      const body: Record<string, string> = { name: name.trim() };
      if (mobileChanged) body.mobile = mobile.trim();
      const { data } = await API.patch('/auth/me/', body);

      // Persist updated user locally
      const raw = await AsyncStorage.getItem('user');
      const user = raw ? JSON.parse(raw) : {};
      user.name = data?.name ?? name.trim();
      if (mobileChanged) user.mobile = data?.mobile ?? mobile.trim();
      await AsyncStorage.setItem('user', JSON.stringify(user));

      Alert.alert(t('ep_saved_title'), t('ep_saved_msg'), [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404 || status === 405) {
        Alert.alert(t('ep_not_available'), t('ep_not_available_msg'));
      } else {
        Alert.alert(t('error'), e?.response?.data?.message || t('ep_save_fail'));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.blue600} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t('back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('ep_title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          <Text style={styles.label}>{t('ep_full_name')}</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t('ep_your_name_ph')} placeholderTextColor={Colors.gray400} />

          <Text style={styles.label}>{t('ep_mobile')}</Text>
          <TextInput
            style={styles.input}
            value={mobile}
            onChangeText={v => { setMobile(v.replace(/\D/g, '')); setOtpSent(false); setOtpVerified(false); }}
            placeholder={t('ep_mobile_ph')}
            placeholderTextColor={Colors.gray400}
            keyboardType="numeric"
            maxLength={10}
          />

          {/* Mobile-change OTP flow */}
          {mobileChanged && !otpVerified && (
            <View style={styles.otpBox}>
              <Text style={styles.otpHint}>{t('ep_change_needs_verify')}</Text>
              {!otpSent ? (
                <TouchableOpacity style={styles.otpBtn} onPress={sendOtp} disabled={otpLoading}>
                  {otpLoading ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.otpBtnText}>{t('ep_send_otp_new')}</Text>}
                </TouchableOpacity>
              ) : (
                <>
                  <View style={styles.otpRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={otp}
                      onChangeText={setOtp}
                      placeholder={t('ep_enter_otp_ph')}
                      placeholderTextColor={Colors.gray400}
                      keyboardType="numeric"
                      maxLength={6}
                    />
                    <TouchableOpacity style={styles.verifyBtn} onPress={verifyOtp} disabled={otpLoading}>
                      {otpLoading ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.verifyBtnText}>{t('ep_verify')}</Text>}
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={sendOtp}><Text style={styles.resendText}>{t('ep_resend_otp')}</Text></TouchableOpacity>
                </>
              )}
            </View>
          )}
          {mobileChanged && otpVerified && (
            <Text style={styles.verifiedText}>{t('ep_new_verified')}</Text>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveBtnText}>{t('ep_save_changes')}</Text>}
          </TouchableOpacity>

          {/* Change password */}
          <View style={styles.divider} />
          <TouchableOpacity style={styles.pwdBtn} onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={styles.pwdBtnText}>{t('ep_change_password')}</Text>
            <Text style={styles.pwdArrow}>›</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.white },
  backBtn:     { width: 60 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.blue600 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },

  label: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7, marginTop: 4 },
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900, marginBottom: 16 },

  otpBox:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, padding: 14, marginBottom: 16 },
  otpHint:  { fontSize: 12, color: Colors.blue700, marginBottom: 10 },
  otpBtn:   { backgroundColor: Colors.blue600, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  otpBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  otpRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  verifyBtn: { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  verifyBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  resendText: { fontSize: 13, color: Colors.blue600, fontWeight: '600' },
  verifiedText: { fontSize: 13, color: Colors.successText, fontWeight: '700', marginBottom: 16 },

  saveBtn:     { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 8, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  divider: { height: 1, backgroundColor: Colors.blue100, marginVertical: 22 },
  pwdBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 16 },
  pwdBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.gray800 },
  pwdArrow:   { fontSize: 22, color: Colors.gray400 },
});
