/**
 * components/DeskStaffBar.tsx — "My earnings" sign-in (web ROADMAP 69, reworded for 71).
 *
 * Who gets the ₹7 is picked per patient in DeskPicker, with no PIN. The PIN
 * here only opens a person's OWN earnings, so nobody sees a colleague's
 * figures; the token is never sent with Complete. Held in memory only.
 *
 * "Manage staff" opens the staff list (components/StaffManager.tsx on Payments).
 * With no extra staff only "+ Add desk staff" shows; against a server that
 * predates this (404) it renders nothing.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API, { apiMessage } from '../services/api';

type Person = { id: number; name: string; active: boolean };
type Earnings = {
  error?: string; name?: string; enabled?: boolean; upi_set?: boolean; month_count?: number;
  month_amount?: string; unpaid_amount?: string; paid_total?: string;
  daily?: { date: string; count: number; amount: string }[];
  payments?: { paid_at: string; utr: string; amount: string }[];
};
const inr = (v?: string) => `₹${Number(v || 0).toFixed(2)}`;
const bookings = (n?: number) => `${n ?? 0} booking${n === 1 ? '' : 's'}`;

export default function DeskStaffBar({ hospitalId, token, onToken, onManage }: {
  hospitalId: number | string;
  /** The current token; the parent sets it to null when the server refuses it. */
  token: string | null;
  onToken: (token: string | null) => void;
  onManage?: () => void;
}) {
  const [staff, setStaff] = useState<Person[] | null>(null);   // null = older server
  const [who, setWho] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Person | null>(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // null = closed, {} = loading, else the person's own figures from /staff/me/
  const [earn, setEarn] = useState<Earnings | null>(null);

  useEffect(() => {
    let live = true;
    API.get(`/hospitals/${hospitalId}/staff/`)
      .then(({ data }) => { if (live && Array.isArray(data)) setStaff(data.filter((s: Person) => s.active)); })
      .catch(() => {});
    return () => { live = false; };
  }, [hospitalId]);

  // The parent drops the token when the server says it expired: back to signed out.
  useEffect(() => { if (token === null) setWho(null); }, [token]);

  if (staff === null) return null;
  const manage = onManage && (
    <TouchableOpacity onPress={onManage} accessibilityRole="button"
                      accessibilityLabel={staff.length ? 'Manage staff' : 'Add desk staff'}>
      <Text style={st.link}>{staff.length ? '  ·  Manage staff' : '+ Add desk staff'}</Text>
    </TouchableOpacity>
  );
  if (staff.length === 0) return manage ? <View style={st.bar}>{manage}</View> : null;

  const close = () => { setOpen(false); setPick(null); setPin(''); setErr(''); };

  const openEarnings = async () => {
    setEarn({});
    try {
      const { data } = await API.post(`/hospitals/${hospitalId}/staff/me/`, { token });
      setEarn(data);
    } catch (e) {
      setEarn({ error: apiMessage(e, 'Could not load your earnings.') });
    }
  };

  const submit = async () => {
    if (!pick) return;
    setBusy(true); setErr('');
    try {
      const { data } = await API.post(`/hospitals/${hospitalId}/staff/${pick.id}/pin/`, { pin });
      setWho(data.name);
      onToken(data.token);
      close();
    } catch (e) {
      setErr(apiMessage(e, 'Could not check the PIN.'));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={st.bar}>
      <Text style={st.muted}>My earnings: </Text>
      <Text style={st.who}>{who ?? 'not signed in'}</Text>
      <TouchableOpacity onPress={() => setOpen(true)} accessibilityRole="button"
                        accessibilityLabel={who ? 'Change' : 'Sign in with PIN'}>
        <Text style={st.link}>{who ? '  Change' : '  Sign in with PIN'}</Text>
      </TouchableOpacity>
      {who && token ? (
        <TouchableOpacity onPress={openEarnings} accessibilityRole="button" accessibilityLabel="My earnings">
          <Text style={st.link}>  ·  My earnings</Text>
        </TouchableOpacity>
      ) : null}
      {manage}

      <Modal visible={earn !== null} transparent animationType="fade" onRequestClose={() => setEarn(null)}>
        <View style={st.backdrop}>
          <View style={st.sheet}>
            <Text style={st.title}>{`${earn?.name || who || ''}: my earnings`}</Text>
            {earn?.error ? <Text style={st.error}>{earn.error}</Text>
            : earn?.month_amount === undefined ? <ActivityIndicator />
            : (
              <>
                {!earn.enabled && <Text style={st.muted}>The staff incentive is switched off right now.</Text>}
                <View style={st.tiles}>
                  <View style={st.tile}><Text style={st.muted}>This month</Text>
                    <Text style={st.big}>{inr(earn.month_amount)}</Text>
                    <Text style={st.muted}>{bookings(earn.month_count)}</Text></View>
                  <View style={st.tile}><Text style={st.muted}>Waiting to be paid</Text>
                    <Text style={st.big}>{inr(earn.unpaid_amount)}</Text></View>
                  <View style={st.tile}><Text style={st.muted}>Paid so far</Text>
                    <Text style={st.big}>{inr(earn.paid_total)}</Text></View>
                </View>
                {!earn.upi_set && <Text style={st.error}>No UPI saved for you yet: ask the hospital to add it so we can pay you.</Text>}
                {(earn.daily || []).slice(0, 7).map((d) => (
                  <Text key={d.date} style={st.muted}>{`${d.date}   ${bookings(d.count)}   ${inr(d.amount)}`}</Text>
                ))}
                {(earn.payments || []).length > 0 && (
                  <Text style={st.muted}>
                    {`Last paid ${inr(earn.payments![0].amount)} on ${String(earn.payments![0].paid_at).slice(0, 10)} (UTR ${earn.payments![0].utr})`}
                  </Text>
                )}
              </>
            )}
            <TouchableOpacity onPress={() => setEarn(null)} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={[st.link, { textAlign: 'center' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={st.backdrop}>
          <View style={st.sheet}>
            <Text style={st.title}>Whose earnings?</Text>
            <Text style={st.muted}>Pick your name and enter your PIN to see what you have earned.</Text>
            {pick === null ? (
              <>
                {who ? (
                  <TouchableOpacity style={st.option} onPress={() => { setWho(null); onToken(null); close(); }}>
                    <Text style={st.optionText}>Sign out</Text>
                  </TouchableOpacity>
                ) : null}
                {staff.map((s) => (
                  <TouchableOpacity key={s.id} style={st.option} onPress={() => setPick(s)}>
                    <Text style={st.optionText}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <Text style={st.label}>{`PIN for ${pick.name}`}</Text>
                <TextInput
                  style={st.input} value={pin} placeholder="4-digit PIN" secureTextEntry
                  keyboardType="number-pad" maxLength={4} autoFocus
                  onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
                />
                {!!err && <Text style={st.error}>{err}</Text>}
                <TouchableOpacity style={[st.go, (pin.length !== 4 || busy) && { opacity: 0.5 }]}
                                  disabled={pin.length !== 4 || busy} onPress={submit}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.goText}>Start</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPick(null); setPin(''); setErr(''); }}>
                  <Text style={st.link}>Back</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={close}><Text style={st.link}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#f3f6fb', borderRadius: 10, padding: 8 },
  big: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  muted: { color: Colors.gray500, fontSize: 13 },
  who: { fontWeight: '700', fontSize: 13, color: Colors.gray900 },
  link: { color: Colors.blue600, fontSize: 13, fontWeight: '600', paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 14, padding: 18, gap: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  option: { borderWidth: 1, borderColor: Colors.blue600, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  optionText: { color: Colors.blue600, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#ccd', borderRadius: 10, padding: 10, fontSize: 18, letterSpacing: 6 },
  error: { color: '#b91c1c', fontSize: 13 },
  go: { backgroundColor: Colors.blue600, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  goText: { color: '#fff', fontWeight: '700' },
});
