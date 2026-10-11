/**
 * components/SignedInDevices.tsx — the "Signed-in devices" card on the
 * hospital Profile.
 *
 * A hospital is one shared login, so it can't otherwise tell which tablets and
 * phones still hold it. GET /auth/sessions/ lists them (this device first);
 * any other one can be signed out. A signed-out device's next request 401s and
 * its refresh 401s, which services/api.ts already turns into a logout — so
 * nothing here handles the kick itself.
 *
 * Confirms go through Alert.alert: utils/webAlert makes a cancel + one action
 * a window.confirm on the web, where react-native-web's Alert is a no-op.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API, { apiMessage } from '../services/api';

type Session = {
  id: string;
  device: string;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
};

/** "Active now" under 10 min — the server writes last_seen_at at most every 5. */
export function activeLabel(iso: string, now = Date.now()): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 10) return 'Active now';
  if (min < 60) return `Active ${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Active ${h} h ago`;
  const d = Math.floor(h / 24);
  return `Active ${d} day${d === 1 ? '' : 's'} ago`;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function SignedInDevices() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await API.get('/auth/sessions/');
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(apiMessage(e, 'Could not load signed-in devices.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmSignOut = (question: string, url: string, done: string) =>
    Alert.alert('Sign out', question, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await API.post(url);
          Alert.alert('Signed out', done);
        } catch (e) {
          Alert.alert('Could not sign out', apiMessage(e, 'Please try again.'));
        }
        // Either way: a 404 means the list was already stale.
        await load();
        setBusy(false);
      } },
    ]);

  const n = sessions?.length ?? 0;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Signed-in devices</Text>

      {sessions === null ? (
        error ? (
          <TouchableOpacity onPress={load}>
            <Text style={styles.error}>{error} Tap to try again.</Text>
          </TouchableOpacity>
        ) : (
          <ActivityIndicator color={Colors.blue600} />
        )
      ) : n === 0 ? (
        <Text style={styles.muted}>No signed-in devices found.</Text>
      ) : (
        <>
          <Text style={styles.muted}>
            {n} device{n === 1 ? '' : 's'} signed in to this account
          </Text>
          {sessions.map(s => {
            const label = s.device || 'Unknown device';
            return (
              <View key={s.id} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{label}</Text>
                    {s.current && <Text style={styles.badge}>This device</Text>}
                  </View>
                  <Text style={styles.meta}>
                    {activeLabel(s.last_seen_at)} · Signed in {shortDate(s.created_at)}
                  </Text>
                </View>
                {!s.current && (
                  <TouchableOpacity
                    style={styles.signOutBtn}
                    disabled={busy}
                    accessibilityLabel={`Sign out ${label}`}
                    onPress={() => confirmSignOut(
                      `Sign out ${label}? It will need the password or an OTP to get back in.`,
                      `/auth/sessions/${s.id}/revoke/`,
                      `${label} has been signed out.`,
                    )}
                  >
                    <Text style={styles.signOutText}>Sign out</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          {n >= 2 && (
            <TouchableOpacity
              style={[styles.allBtn, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={() => confirmSignOut(
                'Sign out all other devices? They will need the password or an OTP to get back in.',
                '/auth/sessions/revoke-others/',
                'All other devices have been signed out.',
              )}
            >
              <Text style={styles.allBtnText}>Sign out all other devices</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

// Same card as the Profile's `section`.
const styles = StyleSheet.create({
  section: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, padding: 16, marginBottom: 16 },
  title:   { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 8 },
  muted:   { fontSize: 13, color: Colors.gray500, marginBottom: 4 },
  error:   { fontSize: 13, color: Colors.errorText },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:    { fontSize: 13.5, fontWeight: '600', color: Colors.gray800, flexShrink: 1 },
  badge:   { fontSize: 11, fontWeight: '700', color: Colors.blue700, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  meta:    { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  signOutBtn:  { borderWidth: 1, borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  signOutText: { fontSize: 12, fontWeight: '700', color: Colors.errorText },
  allBtn:      { marginTop: 10, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  allBtnText:  { fontSize: 13, fontWeight: '700', color: Colors.errorText },
});
