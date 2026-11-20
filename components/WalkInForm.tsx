/**
 * components/WalkInForm.tsx — "Add walk-in" on the hospital queue.
 *
 * The front desk gives today's token to a patient standing at the counter:
 * POST /bookings/walk-in/ (₹0, no checkout). The server finds or creates the
 * patient's account by mobile, so the confirmation and every later queue
 * WhatsApp reach their phone. A full slot answers 409 `slot_full`, which the
 * desk can override with "Add anyway".
 *
 * Mirrors the website's src/hospital/WalkInForm.js, currentSlot() included.
 */
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { isAxiosError } from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import API, { apiMessage } from '../services/api';
import { providerLabel } from '../utils/booking';
import { tenDigitMobile } from '../utils/phone';

type WalkInDoctor = { id: number | string; name: string; available: boolean; slots: string[] };
type Issued = { token: string; slot: string; patient_name?: string };

const slotMinutes = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(s || '');
  return m ? (Number(m[1]) % 12 + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]) : null;
};

/** The slot a patient at the counter most likely belongs to: the latest one
 *  already started, else the day's first. */
export function currentSlot(slots: string[] | undefined, now: Date = new Date()): string {
  const timed = (slots || []).filter((s) => slotMinutes(s) !== null)
    .sort((a, b) => (slotMinutes(a) as number) - (slotMinutes(b) as number));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const started = timed.filter((s) => (slotMinutes(s) as number) <= nowMin);
  return started[started.length - 1] || timed[0] || '';
}

export default function WalkInForm({ doctors, onAdded }: { doctors: WalkInDoctor[]; onAdded: () => void }) {
  const bookable = doctors.filter((d) => d.available !== false);
  const [open, setOpen]       = useState(false);
  const [doctor, setDoctor]   = useState<WalkInDoctor | null>(null);
  const [slot, setSlot]       = useState('');
  const [name, setName]       = useState('');
  const [mobile, setMobile]   = useState('');
  const [consent, setConsent] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [full, setFull]       = useState('');
  const [issued, setIssued]   = useState<Issued | null>(null);

  if (bookable.length === 0) return null;

  const pick = (d: WalkInDoctor) => { setDoctor(d); setSlot(currentSlot(d.slots)); setFull(''); };

  const submit = async (override = false) => {
    if (!doctor) return;
    setError(''); setFull(''); setBusy(true);
    try {
      const { data } = await API.post<Issued>('/bookings/walk-in/', {
        doctor_id: doctor.id, slot, name, mobile,
        whatsapp_consent: consent, override_full: override,
      });
      setIssued(data);
      setName(''); setMobile(''); setConsent(true);
      onAdded();
    } catch (e) {
      const body = isAxiosError(e) ? e.response?.data : null;
      if (isAxiosError(e) && e.response?.status === 409 && body?.code === 'slot_full') setFull(body.message);
      else setError(apiMessage(e, 'Could not add the walk-in. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <TouchableOpacity style={styles.openBtn} onPress={() => setOpen(true)} accessibilityRole="button">
        <Ionicons name="person-add-outline" size={16} color={Colors.white} />
        <Text style={styles.openBtnText}>Add walk-in</Text>
      </TouchableOpacity>
    );
  }

  const ready = !!doctor && name.trim().length >= 2 && mobile.length === 10 && (!!slot || !doctor.slots?.length);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Walk-in token (today)</Text>
        <TouchableOpacity onPress={() => { setOpen(false); setIssued(null); }} accessibilityLabel="Close">
          <Ionicons name="close" size={20} color={Colors.gray500} />
        </TouchableOpacity>
      </View>

      {issued && (
        <Text style={styles.success} accessibilityRole="alert">
          Token {issued.token} for {issued.patient_name || 'the patient'}, {issued.slot}.
        </Text>
      )}

      <Text style={styles.label}>Doctor</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {bookable.map((d) => (
          <TouchableOpacity key={d.id} onPress={() => pick(d)}
            style={[styles.chip, doctor?.id === d.id && styles.chipOn]}>
            <Text style={[styles.chipText, doctor?.id === d.id && styles.chipTextOn]}>{providerLabel(d.name)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!!doctor?.slots?.length && (
        <>
          <Text style={styles.label}>Slot</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[...doctor.slots].sort((a, b) => (slotMinutes(a) ?? 0) - (slotMinutes(b) ?? 0)).map((s) => (
              <TouchableOpacity key={s} onPress={() => { setSlot(s); setFull(''); }}
                style={[styles.chip, slot === s && styles.chipOn]}>
                <Text style={[styles.chipText, slot === s && styles.chipTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <Text style={styles.label}>Patient name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name"
        placeholderTextColor={Colors.gray400} accessibilityLabel="Patient name" />

      <Text style={styles.label}>Mobile</Text>
      {/* No maxLength: it truncates a paste before tenDigitMobile can drop the +91. */}
      <TextInput style={styles.input} value={mobile} onChangeText={(v) => setMobile(tenDigitMobile(v))}
        keyboardType="phone-pad" placeholder="10 digits" placeholderTextColor={Colors.gray400}
        accessibilityLabel="Mobile" />

      <TouchableOpacity style={styles.consent} onPress={() => setConsent((c) => !c)}
        accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
        <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={20} color={Colors.blue600} />
        <Text style={styles.consentText}>Patient agreed to get their token and queue updates on WhatsApp</Text>
      </TouchableOpacity>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!full && (
        <View style={styles.full}>
          <Text style={styles.fullText}>{full}</Text>
          <TouchableOpacity style={styles.fullBtn} disabled={busy} onPress={() => submit(true)}>
            <Text style={styles.fullBtnText}>Add anyway</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={[styles.submit, (!ready || busy) && styles.submitOff]}
        disabled={!ready || busy} onPress={() => submit()} accessibilityRole="button">
        {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Give token</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  openBtn:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
                 backgroundColor: Colors.successText, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 12 },
  openBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  card:        { backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 14,
                 borderWidth: 1, borderColor: Colors.successBorder },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title:       { fontSize: 15, fontWeight: '700', color: Colors.successText },
  success:     { backgroundColor: Colors.successBg, color: Colors.successText, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 6 },
  label:       { fontSize: 12, color: Colors.gray500, marginTop: 10, marginBottom: 4 },
  chips:       { gap: 8, paddingRight: 8 },
  chip:        { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 18, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Colors.gray50 },
  chipOn:      { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  chipText:    { fontSize: 13, color: Colors.gray700 },
  chipTextOn:  { color: Colors.blue700, fontWeight: '700' },
  input:       { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: Colors.gray900 },
  consent:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  consentText: { flex: 1, fontSize: 13, color: Colors.gray700 },
  error:       { backgroundColor: Colors.errorBg, color: Colors.errorText, borderRadius: 8, padding: 10, fontSize: 13, marginTop: 10 },
  full:        { backgroundColor: Colors.warningBg, borderRadius: 8, padding: 10, marginTop: 10, gap: 8 },
  fullText:    { color: Colors.warningText, fontSize: 13 },
  fullBtn:     { alignSelf: 'flex-start', backgroundColor: Colors.warningBorder, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  fullBtnText: { color: Colors.gray900, fontWeight: '700', fontSize: 13 },
  submit:      { backgroundColor: Colors.successText, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  submitOff:   { opacity: 0.5 },
  submitText:  { color: Colors.white, fontWeight: '700', fontSize: 15 },
});
