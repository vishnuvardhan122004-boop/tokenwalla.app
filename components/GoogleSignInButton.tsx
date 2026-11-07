/**
 * components/GoogleSignInButton.tsx
 *
 * "Continue with Google" on the login and register screens (ROADMAP 62).
 *
 * Opens Google's native account picker (services/googleAuth.ts), then asks the
 * server (POST /auth/google/). A Google account already linked to a TokenWalla
 * account signs straight in, whether that is a patient or a hospital's staff:
 * the server returns the same shape as /auth/login/ and the screen's own
 * finishLogin routes by role. An unknown one opens GoogleMobileSheet, because
 * every account is keyed on a verified mobile (token SMS and WhatsApp go there).
 *
 * Renders nothing where Google sign-in can't run (Expo Go, iOS for now, or no
 * client ID configured), so the screens look exactly as before.
 *
 * Mirrors src/componets/GoogleSignIn.js on the website.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API, { apiMessage } from '../services/api';
import { getGoogleCredential, isGoogleSignInAvailable } from '../services/googleAuth';
import { useI18n } from '../services/i18n';
import GoogleMobileSheet from './GoogleMobileSheet';

type Props = {
  /** Called with { user, access, refresh }, exactly as /auth/login/ returns. */
  onSignedIn: (data: any) => void | Promise<void>;
};

export default function GoogleSignInButton({ onSignedIn }: Props) {
  const { t } = useI18n();
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const [pending, setPending] = useState<{ link_token: string; name?: string; email?: string } | null>(null);

  if (!isGoogleSignInAvailable()) return null;

  const press = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const credential = await getGoogleCredential();
      if (!credential) return;                            // they backed out
      const { data } = await API.post('/auth/google/', { credential });
      if (data?.access) await onSignedIn(data);
      else if (data?.needs_mobile) setPending(data);
      else setError(t('gs_failed'));
    } catch (e) {
      // The server's own wording when it sent one (blocked account, a hospital
      // still under review); otherwise ours.
      setError(apiMessage(e, t('gs_failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>{t('gs_or')}</Text>
        <View style={styles.orLine} />
      </View>

      <TouchableOpacity
        style={[styles.btn, busy && styles.btnBusy]}
        onPress={press}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('gs_continue')}
      >
        {busy
          ? <ActivityIndicator color={Colors.gray600} />
          : <>
              <Ionicons name="logo-google" size={18} color={Colors.gray700} />
              <Text style={styles.btnText}>{t('gs_continue')}</Text>
            </>}
      </TouchableOpacity>

      {!!error && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {pending && (
        <GoogleMobileSheet
          linkToken={pending.link_token}
          name={pending.name}
          email={pending.email}
          onClose={() => setPending(null)}
          onSignedIn={async (data) => { setPending(null); await onSignedIn(data); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  orRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.blue100 },
  orText: { fontSize: 13, color: Colors.gray400 },
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 50, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 13, paddingVertical: 13 },
  btnBusy: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  errorBox:  { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { fontSize: 14, color: Colors.errorText, flex: 1 },
});
