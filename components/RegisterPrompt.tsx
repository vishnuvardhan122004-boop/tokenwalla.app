/**
 * components/RegisterPrompt.tsx
 *
 * The sign-up sheet the login screen opens for a mobile number with no account.
 *
 * Tapping Get OTP or Sign In with an unregistered number used to end in a red
 * "not registered, create an account first": the patient had to leave, retype
 * the number and start again. This keeps the number they already typed and asks
 * the three things the register screen asks, one question at a time — name, the
 * OTP we text them, a password — against the same endpoints, so there is no new
 * API. Mirrors src/componets/RegisterPrompt.js on the website.
 *
 * An SMS goes out only when they tap "Send OTP" here, never by the sheet
 * opening. Every string goes through t(): the login screen it opens over is
 * fully translated, and Telugu is the pilot language.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../constants/colors';
import { isCooldown429, retryAfter, useOtpCooldown } from '../hooks/useOtpCooldown';
import API, { apiMessage } from '../services/api';
import { useI18n } from '../services/i18n';
import { passwordProblem } from '../utils/password';

type Props = {
  mobile: string;
  onClose: () => void;
  /** Called with the /auth/register/ response: { user, access, refresh }. */
  onRegistered: (data: any) => void;
};

const STEP_TITLE_KEYS = ['rp_step1', 'rp_step2', 'rp_step3'];

export default function RegisterPrompt({ mobile, onClose, onRegistered }: Props) {
  const { t } = useI18n();
  const [step,     setStep]     = useState<1 | 2 | 3>(1);   // 1 name · 2 OTP · 3 password
  const [name,     setName]     = useState('');
  const [otp,      setOtp]      = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [cooldown, startCooldown] = useOtpCooldown();

  const requestOtp = async (): Promise<boolean> => {
    setBusy(true); setError('');
    try {
      const { data: sent } = await API.post('/auth/otp/request/', { mobile });
      startCooldown(sent?.retry_after);
      return true;
    } catch (e) {
      setError(apiMessage(e, t('rp_otp_failed')));
      // A 429 is the server's own 60s cooldown. Count it down too, or the
      // button stays live and the next tap sends a real SMS.
      if (isCooldown429(e)) startCooldown(retryAfter(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile, otp });
      if (data.verified) { setOtpToken(data.otp_token || ''); setStep(3); }
      else setError(t('rp_otp_invalid'));
    } catch (e) {
      setError(apiMessage(e, t('rp_otp_invalid')));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    const problem = passwordProblem(password);
    if (problem === 'numeric') { setError(t('rp_pw_numeric')); return; }
    if (problem === 'weak')    { setError(t('rp_pw_weak'));    return; }
    setBusy(true); setError('');
    try {
      const { data } = await API.post('/auth/register/', {
        name: name.trim(), mobile, password, otp_token: otpToken,
      });
      onRegistered(data);
    } catch (e) {
      // apiMessage reads the field-keyed {password:[...]} body RegisterSerializer
      // returns, which carries no `message` key.
      setError(apiMessage(e, t('rp_reg_failed')));
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    if (step === 1) {
      if (name.trim().length < 2) { setError(t('rp_name_error')); return; }
      if (await requestOtp()) setStep(2);
    } else if (step === 2) {
      await verifyOtp();
    } else {
      await createAccount();
    }
  };

  const stepTitle = t(STEP_TITLE_KEYS[step - 1]);
  const submitDisabled = busy || (step === 1 && cooldown > 0) || (step === 2 && otp.length !== 6);
  const submitLabel =
    step === 1 ? (cooldown > 0 ? t('rp_wait', { n: cooldown }) : t('rp_send_otp'))
    : step === 2 ? t('rp_verify')
    : t('rp_create');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <TouchableOpacity
              style={styles.close}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('rp_close')}
            >
              <Ionicons name="close" size={22} color={Colors.gray500} />
            </TouchableOpacity>

            <View style={styles.badge}>
              <Ionicons name="person-add-outline" size={24} color={Colors.blue600} />
            </View>
            <Text style={styles.title}>{t('rp_title')}</Text>
            <Text style={styles.sub}>{t('rp_sub', { mobile })}</Text>

            <View style={styles.progress}>
              {[1, 2, 3].map(n => (
                <View key={n} style={[styles.progressStep, n <= step && styles.progressActive, n < step && styles.progressDone]} />
              ))}
            </View>
            <Text style={styles.stepLabel}>{t('rp_step_label', { step, title: stepTitle })}</Text>

            {!!error && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {step === 1 && (
              <>
                <Text style={styles.label}>{t('rp_name_label')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={17} color={Colors.gray400} />
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={v => { setName(v); setError(''); }}
                    placeholder={t('rp_name_ph')}
                    placeholderTextColor={Colors.gray400}
                    autoFocus
                    autoCapitalize="words"
                    textContentType="name"
                    returnKeyType="next"
                    onSubmitEditing={submit}
                  />
                </View>
                <Text style={styles.hint}>{t('rp_name_hint', { mobile })}</Text>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={styles.label}>{t('rp_otp_label')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="keypad-outline" size={17} color={Colors.gray400} />
                  <TextInput
                    style={styles.input}
                    value={otp}
                    onChangeText={v => { setOtp(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                    placeholder={t('rp_otp_ph')}
                    placeholderTextColor={Colors.gray400}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    autoFocus
                    onSubmitEditing={submit}
                  />
                </View>
                <Text style={styles.hint}>{t('rp_otp_sent', { mobile })}</Text>
              </>
            )}

            {step === 3 && (
              <>
                <Text style={styles.label}>{t('rp_pw_label')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={17} color={Colors.gray400} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={v => { setPassword(v); setError(''); }}
                    placeholder={t('rp_pw_ph')}
                    placeholderTextColor={Colors.gray400}
                    secureTextEntry={!showPass}
                    textContentType="newPassword"
                    autoFocus
                    autoCapitalize="none"
                    onSubmitEditing={submit}
                  />
                  <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={8}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.gray400} />
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
              onPress={submit}
              disabled={submitDisabled}
              accessibilityRole="button"
              accessibilityLabel={busy ? t('rp_busy') : submitLabel}
            >
              {busy
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.submitBtnText}>{submitLabel}</Text>}
            </TouchableOpacity>

            {step === 2 && (
              <TouchableOpacity
                style={styles.link}
                onPress={requestOtp}
                disabled={busy || cooldown > 0}
              >
                <Text style={[styles.linkText, (busy || cooldown > 0) && styles.linkTextOff]}>
                  {cooldown > 0 ? t('rp_resend_in', { n: cooldown }) : t('rp_resend')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.link} onPress={onClose}>
              <Text style={styles.linkText}>{t('rp_wrong_number')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  sheet:    { maxHeight: '92%', backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  content:  { padding: 22, paddingTop: 20, paddingBottom: 28 },
  close:    { position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  badge:    { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title:    { fontSize: 22, fontWeight: '800', color: Colors.gray900, marginBottom: 6 },
  sub:      { fontSize: 14, color: Colors.gray500, lineHeight: 21, marginBottom: 18 },
  progress:       { flexDirection: 'row', gap: 6, marginBottom: 10 },
  progressStep:   { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.blue100 },
  progressActive: { backgroundColor: Colors.blue400 },
  progressDone:   { backgroundColor: Colors.blue600 },
  stepLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: Colors.blue600, textTransform: 'uppercase', marginBottom: 16 },
  errorBox:  { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { fontSize: 14, color: Colors.errorText, flex: 1 },
  label:     { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7, letterSpacing: 0.4 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, gap: 10 },
  input:     { flex: 1, fontSize: 15, color: Colors.gray900, paddingVertical: 13 },
  hint:      { fontSize: 12, color: Colors.gray500, lineHeight: 18, marginTop: 7, marginBottom: 6 },
  submitBtn:         { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 14, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText:     { color: Colors.white, fontWeight: '700', fontSize: 15 },
  link:        { alignItems: 'center', paddingVertical: 12 },
  linkText:    { fontSize: 14, fontWeight: '700', color: Colors.blue600 },
  linkTextOff: { color: Colors.gray400 },
});
