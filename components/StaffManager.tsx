/**
 * components/StaffManager.tsx — add and edit the other front-desk staff
 * (web ROADMAP 69), the app's counterpart of src/hospital/StaffManager.js.
 *
 * Each person has a name, a mobile number (required), an optional UPI and a
 * 4-digit PIN they type at the desk. The server stores only a hash of the PIN,
 * so it is shown once, right after it is saved; a forgotten one is reset.
 * Delete hides a person (web ROADMAP 71): they can't be picked any more, and
 * money they earned is still paid. Shift hours are edited on the
 * website only (they are for reference and nothing reads them).
 */
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API, { apiMessage } from '../services/api';
import { tenDigitMobile } from '../utils/phone';

type Person = { id: number; name: string; upi: string; phone: string; active: boolean };
type Form = { id: number | null; name: string; upi: string; phone: string; pin: string; active: boolean };

const EMPTY: Form = { id: null, name: '', upi: '', phone: '', pin: '', active: true };

export default function StaffManager({ hospitalId, refresh }: { hospitalId: number | string; refresh?: unknown }) {
  const base = `/hospitals/${hospitalId}/staff/`;
  const [rows, setRows] = useState<Person[] | null>(null);   // null = not loaded / older server
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [shownPin, setShownPin] = useState<{ name: string; pin: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Person | null>(null);   // inline confirm (Alert is a no-op on web)
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    API.get(base).then(({ data }) => { if (Array.isArray(data)) setRows(data); }).catch(() => {});
  }, [base]);
  useEffect(load, [load, refresh]);

  if (rows === null) return null;

  const edit = (p: Person) => { setErrors({}); setForm({ ...EMPTY, ...p, pin: '' }); };
  const set = (k: keyof Form) => (v: string) =>
    setForm((f) => f && ({ ...f, [k]: k === 'phone' ? tenDigitMobile(v) : k === 'pin' ? v.replace(/\D/g, '').slice(0, 4) : v }));

  const remove = async (p: Person) => {
    setConfirmDel(null);
    try {
      const { data } = await API.delete(`${base}${p.id}/`);
      setNote(data?.kept_for_payouts
        ? `${p.name} is deleted. What they earned stays on record and is still paid to them.`
        : `${p.name} is deleted.`);
      load();
    } catch (e) {
      setNote(apiMessage(e, `Could not delete ${p.name}.`));
    }
  };

  const save = async () => {
    if (!form) return;
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = 'Enter a name.';
    // The server's rule (web StaffManager.phoneProblem): 10 digits, an Indian mobile starts 6-9.
    if (!/^\d{10}$/.test(form.phone)) local.phone = 'Enter the 10-digit mobile number.';
    else if (!/^[6-9]/.test(form.phone)) local.phone = 'A mobile number starts with 6, 7, 8 or 9.';
    if (!form.id && form.pin.length !== 4) local.pin = 'Set a 4-digit PIN.';
    if (form.id && form.pin && form.pin.length !== 4) local.pin = 'The PIN must be exactly 4 digits.';
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    const body: Record<string, unknown> = { name: form.name, upi: form.upi, phone: form.phone, active: form.active };
    if (form.pin) body.pin = form.pin;
    try {
      if (form.id) await API.patch(`${base}${form.id}/`, body);
      else await API.post(base, body);
      setShownPin(form.pin ? { name: form.name.trim(), pin: form.pin } : null);
      setForm(null);
      load();
    } catch (e: any) {
      const d = e?.response?.data;
      // Field errors go under their field; anything else ({detail}, non_field_errors)
      // would otherwise vanish and leave a failed save looking like nothing happened.
      const hasField = d && typeof d === 'object' && !d.message && ['name', 'phone', 'upi', 'pin'].some((k) => k in d);
      if (hasField) {
        setErrors(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, ([] as unknown[]).concat(v).join(' ')])));
      } else {
        setErrors({ message: apiMessage(e, 'Could not save. Try again.') });
      }
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof Form, props: object = {}) => (
    <View style={{ gap: 4 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput style={[st.input, errors[key] ? st.inputErr : null]} value={String(form![key])}
                 onChangeText={set(key)} accessibilityLabel={label} {...props} />
      {!!errors[key] && <Text style={st.err}>{errors[key]}</Text>}
    </View>
  );

  return (
    <View style={st.card}>
      <Text style={st.title}>👥 Front-desk staff</Text>
      <Text style={st.muted}>
        Add a night shift or another person. When a patient is scanned or marked Done, the desk taps who
        handled them, and the ₹7 goes to that person. Each person's 4-digit PIN opens their own "My earnings".
      </Text>

      {shownPin && (
        <View style={st.pinBox} accessibilityRole="alert">
          <Text style={st.pinText}>
            {`Saved. ${shownPin.name}'s PIN is `}<Text style={st.pinBig}>{shownPin.pin}</Text>
            {'. Tell them now: it is stored scrambled and can\'t be shown again. Forgotten? Use Reset PIN.'}
          </Text>
          <TouchableOpacity onPress={() => setShownPin(null)} accessibilityRole="button" accessibilityLabel="Hide PIN">
            <Text style={st.link}>Hide</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!note && <Text style={st.note} accessibilityRole="alert">{note}</Text>}

      {rows.map((p) => (
        <View key={p.id} style={st.row}>
          {/* flexBasis + wrap: on a phone the three buttons drop to their own line
              instead of squeezing the mobile and UPI into broken half-words. */}
          <View style={{ flexGrow: 1, flexBasis: 160 }}>
            <Text style={st.name}>{p.name}{p.active ? '' : ' (inactive)'}</Text>
            <Text style={p.phone ? st.muted : st.warn}>{p.phone || 'add a mobile number'}</Text>
            <Text style={p.upi ? st.muted : st.warn}>{p.upi || 'no UPI yet'}</Text>
          </View>
          <TouchableOpacity style={st.small} onPress={() => edit(p)} accessibilityRole="button" accessibilityLabel={`Edit ${p.name}`}>
            <Text style={st.smallText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.small} onPress={() => edit(p)} accessibilityRole="button" accessibilityLabel={`Reset PIN for ${p.name}`}>
            <Text style={st.smallText}>Reset PIN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.small, st.danger]} onPress={() => setConfirmDel(p)} accessibilityRole="button"
                            accessibilityLabel={`Delete ${p.name}`}>
            <Text style={[st.smallText, st.dangerText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}

      {confirmDel && (
        <View style={st.confirm}>
          <Text style={st.name}>{`Delete ${confirmDel.name}?`}</Text>
          <Text style={st.muted}>They can no longer be picked at the desk. Money they already earned is still paid to them.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[st.small, st.danger]} onPress={() => remove(confirmDel)} accessibilityRole="button"
                              accessibilityLabel={`Yes, delete ${confirmDel.name}`}>
              <Text style={[st.smallText, st.dangerText]}>Yes, delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.small} onPress={() => setConfirmDel(null)} accessibilityRole="button" accessibilityLabel="Keep">
              <Text style={st.smallText}>Keep</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={st.add} onPress={() => { setErrors({}); setForm({ ...EMPTY }); }}
                        accessibilityRole="button" accessibilityLabel="Add a person">
        <Text style={st.addText}>+ Add a person</Text>
      </TouchableOpacity>

      <Modal visible={form !== null} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <KeyboardAvoidingView behavior="padding" style={st.backdrop}>
          {form && (
            <View style={st.sheet}>
              <Text style={st.title}>{form.id ? 'Edit person' : 'Add a person'}</Text>
              {field('Name', 'name', { maxLength: 100 })}
              {field('Mobile number', 'phone', { keyboardType: 'number-pad', placeholder: '10-digit' })}
              {field('UPI ID (to pay them)', 'upi', { autoCapitalize: 'none', placeholder: 'name@bank' })}
              {field(form.id ? 'New PIN (leave blank to keep)' : '4-digit PIN', 'pin',
                     { keyboardType: 'number-pad', secureTextEntry: true })}
              {form.id != null && (
                <View style={st.switchRow}>
                  <Text style={[st.label, { flex: 1 }]}>Active (an inactive person can't be picked at the desk, but is still paid)</Text>
                  <Switch value={form.active} onValueChange={(v) => setForm((f) => f && ({ ...f, active: v }))}
                          accessibilityLabel="Active" />
                </View>
              )}
              {!!errors.message && <Text style={st.err}>{errors.message}</Text>}
              <TouchableOpacity style={[st.go, saving && { opacity: 0.5 }]} disabled={saving} onPress={save}
                                accessibilityRole="button" accessibilityLabel={form.id ? 'Save changes' : 'Add person'}>
                <Text style={st.goText}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Add person'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setForm(null)} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={[st.link, { textAlign: 'center' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginHorizontal: 16, marginTop: 12, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#111' },
  muted: { color: '#667', fontSize: 13 },
  warn: { color: '#c0392b', fontSize: 13 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: '#eef', paddingTop: 8 },
  small: { borderWidth: 1, borderColor: '#ccd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smallText: { fontSize: 12, fontWeight: '600', color: '#334' },
  add: { borderWidth: 1, borderColor: Colors.blue600, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  addText: { color: Colors.blue600, fontWeight: '700' },
  pinBox: { backgroundColor: '#e8f7ee', borderRadius: 10, padding: 10, gap: 4 },
  pinText: { color: '#14532d', fontSize: 13 },
  pinBig: { fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  link: { color: Colors.blue600, fontSize: 13, fontWeight: '600', paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 14, padding: 18, gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#334' },
  input: { borderWidth: 1, borderColor: '#ccd', borderRadius: 10, padding: 10, fontSize: 15 },
  inputErr: { borderColor: '#c0392b' },
  err: { color: '#c0392b', fontSize: 12 },
  note: { color: '#14532d', backgroundColor: '#e8f7ee', borderRadius: 8, padding: 8, fontSize: 13 },
  danger: { borderColor: '#e6b3ad' },
  dangerText: { color: '#c0392b' },
  confirm: { borderWidth: 1, borderColor: '#e6b3ad', borderRadius: 10, padding: 10, gap: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  go: { backgroundColor: Colors.blue600, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  goText: { color: '#fff', fontWeight: '700' },
});
