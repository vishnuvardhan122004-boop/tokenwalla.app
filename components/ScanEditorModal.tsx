/**
 * components/ScanEditorModal.tsx — add or edit one Scan from the centre dashboard.
 *
 * Its own file rather than a second modal inside dashboard.tsx: that screen is
 * already ~1700 lines around the doctor form, and a scan is a DIFFERENT shape —
 * no specialization, no experience, but a price, a duration, prep instructions
 * and a collection mode. Sharing one form would mean a per-field `isCentre`
 * ternary in a screen that is live and carrying revenue.
 *
 * The slot and day grids come from constants/slots.ts, which the doctor form
 * uses too — a doctor and a scan pick from the same half-hour grid, and two
 * copies would drift.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { DAYS_OF_WEEK, DEFAULT_SLOTS, SLOT_SECTIONS } from '../constants/slots';
import API from '../services/api';

export interface ScanRecord {
  id: number | string;
  name: string;
  modality?: string;
  keywords?: string;
  description?: string;
  prep_instructions?: string;
  price: number;
  duration_minutes: number;
  max_per_slot?: number;
  available: boolean;
  slots: string[];
  days?: string[];
  payment_collection_mode?: string;
}

interface FormState {
  name: string;
  modality: string;
  keywords: string;
  description: string;
  prep_instructions: string;
  price: string;
  duration_minutes: string;
  max_per_slot: string;
  available: boolean;
  slots: string[];
  days: string[];
  // Only an explicit FULL collects the scan price online. Blank, unknown and
  // never-chosen all mean SERVICE_ONLY — the same rule as a doctor's fee, and
  // for the same reason: FULL has us holding a centre's money.
  payment_collection_mode: 'SERVICE_ONLY' | 'FULL';
}

const EMPTY: FormState = {
  name: '', modality: '', keywords: '', description: '', prep_instructions: '',
  price: '', duration_minutes: '15', max_per_slot: '1',
  available: true, slots: [], days: [],
  payment_collection_mode: 'SERVICE_ONLY',
};

const COLLECTION_MODES = [
  {
    value: 'SERVICE_ONLY' as const,
    label: 'Service Fee Only',
    hint: 'The patient pays only the TokenWalla service fee online and settles the scan price at your centre. Nothing is owed to you by us.',
  },
  {
    value: 'FULL' as const,
    label: 'Scan Price + Service Fee',
    hint: 'The patient pays everything online. We hold the scan price and settle it to your payout account — add one on your Profile if you have not.',
  },
];

const fromRecord = (scan: ScanRecord): FormState => ({
  name:              scan.name || '',
  modality:          scan.modality || '',
  keywords:          scan.keywords || '',
  description:       scan.description || '',
  prep_instructions: scan.prep_instructions || '',
  price:             String(scan.price ?? ''),
  duration_minutes:  String(scan.duration_minutes ?? 15),
  max_per_slot:      String(scan.max_per_slot ?? 1),
  available:         scan.available !== false,
  slots:             scan.slots || [],
  days:              scan.days || [],
  payment_collection_mode: scan.payment_collection_mode === 'FULL' ? 'FULL' : 'SERVICE_ONLY',
});

interface Props {
  visible: boolean;
  /** null = adding a new scan. */
  scan: ScanRecord | null;
  centerId: number | string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ScanEditorModal({ visible, scan, centerId, onClose, onSaved }: Props) {
  const [form, setForm]     = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Reset on every open. The modal instance outlives one edit, so without this
  // the previous scan's price is sitting in the form when "Add" is tapped.
  useEffect(() => {
    if (!visible) return;
    setForm(scan ? fromRecord(scan) : EMPTY);
    setError('');
  }, [visible, scan]);

  const setField = (k: keyof FormState, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v } as FormState));

  const toggle = (key: 'slots' | 'days', value: string) =>
    setForm(p => ({
      ...p,
      [key]: p[key].includes(value) ? p[key].filter(v => v !== value) : [...p[key], value],
    }));

  const save = async () => {
    const name = form.name.trim();
    if (!name) { setError('Scan name is required.'); return; }
    // Number('') is 0 and 0 is finite, so an untouched price field would have
    // sailed through and listed the scan to patients at ₹0.
    if (!form.price.trim()) { setError('Enter the scan price.'); return; }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) { setError('Enter a valid price.'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        center: centerId,
        name,
        modality:          form.modality.trim(),
        keywords:          form.keywords.trim(),
        description:       form.description.trim(),
        prep_instructions: form.prep_instructions.trim(),
        price,
        duration_minutes: Number(form.duration_minutes) || 15,
        max_per_slot:     Number(form.max_per_slot) || 1,
        available:        form.available,
        slots:            form.slots,
        days:             form.days,
        payment_collection_mode: form.payment_collection_mode,
      };
      if (scan) await API.patch(`/scans/${scan.id}/`, payload);
      else      await API.post('/scans/', payload);
      onSaved();
      onClose();
    } catch (e: any) {
      const errs = e?.response?.data?.errors;
      setError(
        errs && typeof errs === 'object'
          ? Object.values(errs).flat().join(' ')
          : e?.response?.data?.message || 'Could not save the scan. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.cancel}>
              <Ionicons name="close" size={15} color={Colors.errorText} />
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.title} numberOfLines={1}>{scan ? `Edit ${scan.name}` : 'Add New Scan'}</Text>
            <TouchableOpacity style={[s.save, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} size="small" />
                      : <Text style={s.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <Text style={s.section}>THE SCAN</Text>

            <Text style={s.label}>Scan Name</Text>
            <TextInput style={s.input} placeholder="e.g. MRI Brain" placeholderTextColor={Colors.gray400}
              value={form.name} onChangeText={t => setField('name', t)} />

            <Text style={s.label}>Modality</Text>
            <TextInput style={s.input} placeholder="e.g. MRI, CT, X-ray, Blood Test"
              placeholderTextColor={Colors.gray400}
              value={form.modality} onChangeText={t => setField('modality', t)} />
            <Text style={s.hint}>Patients filter the centre list by this.</Text>

            <Text style={s.label}>Search Keywords</Text>
            <TextInput style={s.input} placeholder="e.g. brain scan, head mri, neuro"
              placeholderTextColor={Colors.gray400}
              value={form.keywords} onChangeText={t => setField('keywords', t)} />
            <Text style={s.hint}>What a patient might type instead of the exact name.</Text>

            <Text style={s.label}>Description</Text>
            <TextInput style={[s.input, s.multiline]} multiline placeholder="What this scan is for"
              placeholderTextColor={Colors.gray400}
              value={form.description} onChangeText={t => setField('description', t)} />

            {/* The highest-value scan-only field. A patient who arrives unfasted
                for a lipid profile, or wearing metal for an MRI, has burned the
                slot AND your machine time. Shown above the slots on the patient
                screen and sent in the booking message. */}
            <Text style={s.label}>Preparation Instructions</Text>
            <TextInput style={[s.input, s.multiline]} multiline
              placeholder="e.g. Fast for 8 hours. Remove all metal jewellery."
              placeholderTextColor={Colors.gray400}
              value={form.prep_instructions} onChangeText={t => setField('prep_instructions', t)} />
            <Text style={s.hint}>
              The patient sees this before booking and again on their token. It is what
              stops a wasted slot.
            </Text>

            <Text style={s.section}>PRICE & CAPACITY</Text>

            <Text style={s.label}>Scan Price (₹)</Text>
            <TextInput style={s.input} keyboardType="number-pad" placeholder="e.g. 4500"
              placeholderTextColor={Colors.gray400}
              value={form.price} onChangeText={t => setField('price', t.replace(/\D/g, ''))} />

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Duration (minutes)</Text>
                <TextInput style={s.input} keyboardType="number-pad" placeholder="15"
                  placeholderTextColor={Colors.gray400}
                  value={form.duration_minutes}
                  onChangeText={t => setField('duration_minutes', t.replace(/\D/g, ''))} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Patients per slot</Text>
                <TextInput style={s.input} keyboardType="number-pad" placeholder="1"
                  placeholderTextColor={Colors.gray400}
                  value={form.max_per_slot}
                  onChangeText={t => setField('max_per_slot', t.replace(/\D/g, ''))} />
              </View>
            </View>
            <Text style={s.hint}>
              Capacity is counted per SCAN, not per centre — a full MRI never closes the
              blood draw running at the same time.
            </Text>

            <Text style={s.section}>HOW THE PATIENT PAYS</Text>
            {COLLECTION_MODES.map(opt => {
              const on = form.payment_collection_mode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.modeCard, on && s.modeCardOn]}
                  onPress={() => setField('payment_collection_mode', opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={18} color={on ? Colors.blue600 : Colors.gray400}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.modeLabel, on && { color: Colors.blue700 }]}>{opt.label}</Text>
                    <Text style={s.modeHint}>{opt.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={s.section}>AVAILABILITY</Text>

            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Accepting bookings</Text>
                <Text style={s.hint}>
                  Turn off while the machine is down — the scan stays listed but cannot be booked.
                </Text>
              </View>
              <Switch value={form.available} onValueChange={v => setField('available', v)} />
            </View>

            <Text style={s.section}>DAYS  ({form.days.length} selected)</Text>
            <View style={s.grid}>
              {DAYS_OF_WEEK.map(({ key, label }) => {
                const on = form.days.includes(key);
                return (
                  <TouchableOpacity key={key} style={[s.dayChip, on && s.chipOn]} onPress={() => toggle('days', key)}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.section}>
              TIME SLOTS  ({form.slots.length} of {DEFAULT_SLOTS.length} selected)
            </Text>
            <View style={s.slotActions}>
              <TouchableOpacity style={s.slotActionBtn}
                onPress={() => setForm(p => ({ ...p, slots: [...DEFAULT_SLOTS] }))}>
                <Text style={s.slotActionText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.slotActionBtn, { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg }]}
                onPress={() => setForm(p => ({ ...p, slots: [] }))}>
                <Text style={[s.slotActionText, { color: Colors.errorText }]}>Clear All</Text>
              </TouchableOpacity>
            </View>
            {form.slots.length === 0 && (
              <View style={s.note}>
                <Text style={s.noteTitle}>No online slots</Text>
                <Text style={s.noteText}>
                  With no slots selected, patients see this scan and your centre&apos;s number
                  but cannot book a token online.
                </Text>
              </View>
            )}
            {SLOT_SECTIONS.map(section => (
              <View key={section.label} style={{ marginBottom: 14 }}>
                <Text style={s.slotSectionLabel}>{section.label}</Text>
                <View style={s.grid}>
                  {section.slots.map(slot => {
                    const on = form.slots.includes(slot);
                    return (
                      <TouchableOpacity key={slot} style={[s.slotChip, on && s.chipOn]}
                        onPress={() => toggle('slots', slot)}>
                        <Text style={[s.chipText, on && s.chipTextOn]}>{slot}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            <View style={{ height: 50 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/** Confirm-and-delete, exported so the dashboard's card menu stays a one-liner. */
export function confirmDeleteScan(scan: ScanRecord, onDone: () => void) {
  Alert.alert(
    'Delete Scan',
    `Delete "${scan.name}"?\nThis cannot be undone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await API.delete(`/scans/${scan.id}/`);
            onDone();
          } catch {
            Alert.alert('Error', 'Could not delete. The scan may have active bookings.');
          }
        },
      },
    ],
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  cancel:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cancelText: { color: Colors.errorText, fontWeight: '700', fontSize: 13 },
  title:      { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  save:       { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8, minWidth: 68, alignItems: 'center' },
  saveText:   { color: Colors.white, fontWeight: '700', fontSize: 13.5 },

  body: { padding: 16 },

  errorBox:  { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, color: Colors.errorText, fontSize: 13, lineHeight: 18 },

  section: { fontSize: 11.5, fontWeight: '800', color: Colors.gray400, letterSpacing: 0.7, marginTop: 20, marginBottom: 10 },
  label:   { fontSize: 13, fontWeight: '700', color: Colors.gray800, marginBottom: 6 },
  hint:    { fontSize: 11.5, color: Colors.gray400, lineHeight: 17, marginTop: -6, marginBottom: 12 },
  input: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 14.5,
    color: Colors.gray900, backgroundColor: Colors.white, marginBottom: 12,
  },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  row:       { flexDirection: 'row', gap: 12 },

  modeCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 13,
    padding: 13, marginBottom: 10,
  },
  modeCardOn: { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  modeLabel:  { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 3 },
  modeHint:   { fontSize: 12, color: Colors.gray500, lineHeight: 17 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },

  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip:  { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  slotChip: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 },
  chipOn:      { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  chipText:    { fontSize: 12.5, color: Colors.gray600, fontWeight: '600' },
  chipTextOn:  { color: Colors.blue700, fontWeight: '700' },

  slotActions:   { flexDirection: 'row', gap: 10, marginBottom: 12 },
  slotActionBtn: { flex: 1, borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  slotActionText:{ fontSize: 12.5, fontWeight: '700', color: Colors.blue700 },
  slotSectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray500, marginBottom: 8 },

  note:      { backgroundColor: Colors.blue50, borderRadius: 12, padding: 13, marginBottom: 14 },
  noteTitle: { fontSize: 13, fontWeight: '700', color: Colors.blue800, marginBottom: 3 },
  noteText:  { fontSize: 13, color: Colors.blue800, lineHeight: 18 },
});
