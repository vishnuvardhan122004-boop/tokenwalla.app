/**
 * components/DeskStaffBar.tsx — "who is at the desk?" (web ROADMAP 69).
 *
 * The hospital signs in once; each extra front-desk person picks their name and
 * types their 4-digit PIN here. The server checks it and returns a signed token
 * that rides along with Complete, so the staff incentive is credited to them.
 * Nobody picked = the hospital's main payee, exactly as before. The token is
 * held in memory only: after an app restart the desk starts as the main desk.
 *
 * The staff list itself is managed on the website. Against a server that
 * predates this (404) or a hospital with no extra staff, this renders nothing.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API, { apiMessage } from '../services/api';

type Person = { id: number; name: string; active: boolean };

export default function DeskStaffBar({ hospitalId, token, onToken }: {
  hospitalId: number | string;
  /** The current token; the parent sets it to null when the server refuses it. */
  token: string | null;
  onToken: (token: string | null) => void;
}) {
  const [staff, setStaff] = useState<Person[]>([]);
  const [who, setWho] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Person | null>(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    API.get(`/hospitals/${hospitalId}/staff/`)
      .then(({ data }) => { if (live && Array.isArray(data)) setStaff(data.filter((s: Person) => s.active)); })
      .catch(() => {});
    return () => { live = false; };
  }, [hospitalId]);

  // The parent drops the token when the server says it expired: fall back to the main desk.
  useEffect(() => { if (token === null) setWho(null); }, [token]);

  if (staff.length === 0) return null;

  const close = () => { setOpen(false); setPick(null); setPin(''); setErr(''); };

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
      <Text style={st.muted}>At the desk: </Text>
      <Text style={st.who}>{who ?? 'Main desk'}</Text>
      <TouchableOpacity onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Change">
        <Text style={st.link}>  Change</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={st.backdrop}>
          <View style={st.sheet}>
            <Text style={st.title}>Who is at the desk?</Text>
            <Text style={st.muted}>Bookings you complete are credited to this person.</Text>
            {pick === null ? (
              <>
                <TouchableOpacity style={st.option} onPress={() => { setWho(null); onToken(null); close(); }}>
                  <Text style={st.optionText}>Main desk</Text>
                </TouchableOpacity>
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
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
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
