/**
 * components/GoogleMobileSheet.tsx
 *
 * The one-time "add your mobile" step after a first Continue with Google.
 *
 * Google gives no phone number, and every TokenWalla account is keyed on one.
 * The patient types a number, proves it with the usual OTP, and the server links
 * the Google account to that number's account, creating a patient account if the
 * number is new (POST /auth/google/link/). From then on Google alone signs them
 * in. A hospital's number is refused by the server, with the reason.
 *
 * An SMS goes out only when they tap Send OTP, never by the sheet opening.
 * Mirrors src/componets/GoogleMobilePrompt.js on the website and reuses
 * RegisterPrompt's look and its rp_* strings where the words are the same.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Colors } from '../constants/colors';
import { isCooldown429, retryAfter, useOtpCooldown } from '../hooks/useOtpCooldown';
import API, { apiMessage } from '../services/api';
import { useI18n } from '../services/i18n';
import { tenDigitMobile } from '../utils/phone';

type Props = {
  linkToken: string;
  name?: string;
  email?: string;
  onClose: () => void;
  /** Called with the /auth/google/link/ response: { user, access, refresh, created }. */
  onSignedIn: (data: any) => void | Promise<void>;
};

export default function GoogleMobileSheet({ linkToken, name, email, onClose, onSignedIn }: Props) {
  const { t } = useI18n();
  const [step,     setStep]     = useState<1 | 2>(1);        // 1 mobile · 2 OTP
  const [mobile,   setMobile]   = useState('');
  const [otp,      setOtp]      = useState('');
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
      if (isCooldown429(e)) startCooldown(retryAfter(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const verifyAndLink = async () => {
    setBusy(true); setError('');
    try {
      const { data: v } = await API.post('/auth/otp/verify/', { mobile, otp });
      if (!v?.verified) { setError(t('rp_otp_invalid')); setBusy(false); return; }
      const { data } = await API.post('/auth/google/link/', {
        link_token: linkToken, mobile, otp_token: v.otp_token || '',
      });
      await onSignedIn(data);
    } catch (e) {
      setError(apiMessage(e, t('gs_link_failed')));
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    if (step === 1) {
      if (!/^[6-9]\d{9}$/.test(mobile)) { setError(t('gs_mobile_invalid')); return; }
      if (await requestOtp()) setStep(2);
    } else {
      await verifyAndLink();
    }
  };

  const submitDisabled = busy || (step === 1 && cooldown > 0) || (step === 2 && otp.length !== 6);
  const submitLabel =
    step === 1 ? (cooldown > 0 ? t('rp_wait', { n: cooldown }) : t('rp_send_otp')) : t('gs_verify');
  const first = (name || '').trim().split(/\s+/)[0];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false} bounces={false}>
            <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={8}
              accessibilityRole="button" accessibilityLabel={t('rp_close')}>
              <Ionicons name="close" size={22} color={Colors.gray500} />
            </TouchableOpacity>

            <View style={styles.badge}>
              <Ionicons name="call-outline" size={24} color={Colors.blue600} />
            </View>
            <Text style={styles.title}>{first ? t('gs_title_name', { name: first }) : t('gs_title')}</Text>
            <Text style={styles.sub}>{t('gs_sub')}</Text>
            {!!email && <Text style={styles.emailHint}>{t('gs_email_hint', { email })}</Text>}

            <View style={styles.progress}>
              {[1, 2].map(n => (
                <View key={n} style={[styles.progressStep, n <= step && styles.progressActive, n < step && styles.progressDone]} />
              ))}
            </View>
            <Text style={styles.stepLabel}>
              {t('gs_step_label', { step, title: step === 1 ? t('gs_step1') : t('rp_step2') })}
            </Text>

            {!!error && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {step === 1 && (
              <>
                <Text style={styles.label}>{t('gs_mobile_label')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="call-outline" size={17} color={Colors.gray400} />
                  <TextInput
                    style={styles.input}
                    value={mobile}
                    onChangeText={v => { setMobile(tenDigitMobile(v)); setError(''); }}
                    placeholder={t('gs_mobile_ph')}
                    placeholderTextColor={Colors.gray400}
                    keyboardType="number-pad"
                    textContentType="telephoneNumber"
                    autoFocus
                    onSubmitEditing={submit}
                  />
                </View>
                <Text style={styles.hint}>{t('gs_mobile_hint')}</Text>
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

            <TouchableOpacity
              style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
              onPress={submit}
              disabled={submitDisabled}
              accessibilityRole="button"
              accessibilityLabel={busy ? t('rp_busy') : submitLabel}
            >
              {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitBtnText}>{submitLabel}</Text>}
            </TouchableOpacity>

            {step === 2 && (
              <>
                <TouchableOpacity style={styles.link} onPress={requestOtp} disabled={busy || cooldown > 0}>
                  <Text style={[styles.linkText, (busy || cooldown > 0) && styles.linkTextOff]}>
                    {cooldown > 0 ? t('rp_resend_in', { n: cooldown }) : t('rp_resend')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.link} onPress={() => { setStep(1); setOtp(''); setError(''); }}>
                  <Text style={styles.linkText}>{t('rp_wrong_number')}</Text>
                </TouchableOpacity>
              </>
            )}
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
  sub:      { fontSize: 14, color: Colors.gray500, lineHeight: 21, marginBottom: 8 },
  emailHint:{ fontSize: 14, fontWeight: '600', color: Colors.gray700, lineHeight: 21, marginBottom: 10 },
  progress:       { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 10 },
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
