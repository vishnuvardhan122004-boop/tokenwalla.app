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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import BookingNoticePicker from './BookingNoticePicker';
import { DayPicker, SlotPicker } from './SchedulePicker';
import { pickImageFile, type PickedImage } from '../utils/imagePicker';
import { Colors } from '../constants/colors';
import { DEFAULT_SLOTS } from '../constants/slots';
import { suggestTests } from '../constants/testSuggestions';
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
  booking_cutoff_hours?: number | null;
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
  booking_cutoff_hours: string;   // '' = use the platform default
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
  price: '', duration_minutes: '15', max_per_slot: '1', booking_cutoff_hours: '',
  available: true, slots: [], days: [],
  payment_collection_mode: 'SERVICE_ONLY',
};

const collectionModes = (unit: string) => [
  {
    value: 'SERVICE_ONLY' as const,
    label: 'Service Fee Only',
    hint: `The patient pays only the TokenWalla service fee online and settles the ${unit} price at your centre. Nothing is owed to you by us.`,
  },
  {
    value: 'FULL' as const,
    label: `${unit[0].toUpperCase()}${unit.slice(1)} Price + Service Fee`,
    hint: `The patient pays everything online. We hold the ${unit} price and settle it to your payout account — add one on your Profile if you have not.`,
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
  booking_cutoff_hours: scan.booking_cutoff_hours == null ? '' : String(scan.booking_cutoff_hours),
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
  /** What a blood centre calls a scan. Defaults to 'scan' so a scanning centre
   *  — and any caller that predates blood centres — is unchanged. */
  unit?: 'scan' | 'test';
  /** Quick picks for the Name and Type boxes. Absent = none, as before. */
  suggestions?: { names: string[]; types: string[] };
  onClose: () => void;
  onSaved: () => void;
}

export default function ScanEditorModal({ visible, scan, centerId, unit = 'scan', suggestions, onClose, onSaved }: Props) {
  const Unit = `${unit[0].toUpperCase()}${unit.slice(1)}`;
  const [form, setForm]     = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const existingImage = (scan as any)?.image && String((scan as any).image).startsWith('http')
    ? String((scan as any).image) : null;

  const pickPhoto = async () => {
    const img = await pickImageFile([4, 3]);
    if (img) setPicked(img);
  };
  const [error, setError]   = useState('');

  // Reset on every open. The modal instance outlives one edit, so without this
  // the previous scan's price is sitting in the form when "Add" is tapped.
  //
  // `picked` belongs in here for the same reason and was missed, which is the
  // worse half of the same bug: a photo chosen for one scan survived the close
  // and was uploaded onto the NEXT scan saved — and because `picked` is also
  // what decides multipart-vs-JSON below, a save that touched no image at all
  // still shipped the previous scan's file. ROADMAP 28, claim 9.
  useEffect(() => {
    if (!visible) return;
    setForm(scan ? fromRecord(scan) : EMPTY);
    setPicked(null);
    setError('');
  }, [visible, scan]);

  const setField = (k: keyof FormState, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v } as FormState));

  const save = async () => {
    const name = form.name.trim();
    if (!name) { setError(`${Unit} name is required.`); return; }
    // Number('') is 0 and 0 is finite, so an untouched price field would have
    // sailed through and listed the scan to patients at ₹0.
    if (!form.price.trim()) { setError(`Enter the ${unit} price.`); return; }
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
        // null, not omitted: clearing the box must reset the override rather
        // than silently leave the old value on the server.
        booking_cutoff_hours: form.booking_cutoff_hours.trim() === ''
          ? null
          : Number(form.booking_cutoff_hours),
        available:        form.available,
        slots:            form.slots,
        days:             form.days,
        payment_collection_mode: form.payment_collection_mode,
      };
      // JSON unless a new photo was picked. Only then does it become
      // multipart: a JSON body cannot carry a file, and sending every save as
      // multipart would turn `slots`/`days` arrays into strings the serializer
      // then has to guess at.
      let body: any = payload;
      let headers: any = undefined;
      if (picked) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (v === null || v === undefined) { fd.append(k, ''); return; }
          // Arrays go one entry per key — DRF's ListField reads them back as a
          // list, where a JSON.stringify would arrive as one quoted string.
          if (Array.isArray(v)) { v.forEach(item => fd.append(k, String(item))); return; }
          fd.append(k, String(v));
        });
        fd.append('image', picked as unknown as Blob, picked.name);
        body = fd;
        headers = { 'Content-Type': 'multipart/form-data' };
      }
      if (scan) await API.patch(`/scans/${scan.id}/`, body, { headers });
      else      await API.post('/scans/', body, { headers });
      onSaved();
      onClose();
    } catch (e: any) {
      const errs = e?.response?.data?.errors;
      setError(
        errs && typeof errs === 'object'
          ? Object.values(errs).flat().join(' ')
          : e?.response?.data?.message || `Could not save the ${unit}. Please try again.`,
      );
    } finally {
      setSaving(false);
    }
  };

  // Tap-to-fill chips under a free-text box: the same idea as the doctor form's
  // specialization picks, and the website's <datalist>s.
  const picks = (options: string[] | undefined, typed: string, set: (v: string) => void) => {
    const list = options ? suggestTests(options, typed) : [];
    if (list.length === 0) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.pickRow} style={{ marginTop: -4 }}>
        {list.map(p => (
          <TouchableOpacity key={p} style={s.pick} onPress={() => set(p)} accessibilityRole="button"
            accessibilityLabel={`Use ${p}`}>
            <Text style={s.pickText}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
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
            <Text style={s.title} numberOfLines={1}>{scan ? `Edit ${scan.name}` : `Add New ${Unit}`}</Text>
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

            <Text style={s.label}>{Unit} Name</Text>
            <TextInput style={s.input} placeholder="e.g. MRI Brain" placeholderTextColor={Colors.gray400}
              value={form.name} onChangeText={t => setField('name', t)} />
            {picks(suggestions?.names, form.name, v => setField('name', v))}

            <Text style={s.label}>Modality</Text>
            <TextInput style={s.input} placeholder="e.g. MRI, CT, X-ray, Blood Test"
              placeholderTextColor={Colors.gray400}
              value={form.modality} onChangeText={t => setField('modality', t)} />
            {picks(suggestions?.types, form.modality, v => setField('modality', v))}
            <Text style={s.hint}>Patients filter the centre list by this.</Text>

            <Text style={s.label}>Search Keywords</Text>
            <TextInput style={s.input} placeholder="e.g. brain scan, head mri, neuro"
              placeholderTextColor={Colors.gray400}
              value={form.keywords} onChangeText={t => setField('keywords', t)} />
            <Text style={s.hint}>What a patient might type instead of the exact name.</Text>

            <Text style={s.label}>Description</Text>
            <TextInput style={[s.input, s.multiline]} multiline placeholder={`What this ${unit} is for`}
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

            <Text style={s.label}>{Unit} Price (₹)</Text>
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

            <Text style={s.label}>Photo (optional)</Text>
            <TouchableOpacity style={s.photoRow} onPress={pickPhoto}>
              {picked?.uri || existingImage ? (
                <Image
                  source={{ uri: picked?.uri || existingImage! }}
                  style={s.photoThumb}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={180}
                />
              ) : (
                <View style={[s.photoThumb, s.photoEmpty]}>
                  <Ionicons name="image-outline" size={20} color={Colors.blue600} />
                </View>
              )}
              <Text style={s.photoText}>
                {picked ? `Selected: ${picked.name}` : existingImage ? 'Change photo' : 'Add a photo'}
              </Text>
            </TouchableOpacity>

            <BookingNoticePicker
              value={form.booking_cutoff_hours}
              onChange={v => setField('booking_cutoff_hours', v)}
              label="Booking notice"
              noun="Patients"
            />

            <Text style={s.section}>HOW THE PATIENT PAYS</Text>
            {collectionModes(unit).map(opt => {
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
            <DayPicker days={form.days} onChange={days => setForm(p => ({ ...p, days }))}
              allLabel="All days" clearable={false} />

            <Text style={s.section}>
              TIME SLOTS  ({form.slots.length} of {DEFAULT_SLOTS.length} selected)
            </Text>
            <SlotPicker slots={form.slots} onChange={slots => setForm(p => ({ ...p, slots }))} keepOffGrid
              note={(
                <View style={s.note}>
                  <Text style={s.noteTitle}>No online slots</Text>
                  <Text style={s.noteText}>
                    With no slots selected, patients see this scan and your centre&apos;s number
                    but cannot book a token online.
                  </Text>
                </View>
              )} />

            <View style={{ height: 50 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/** Confirm-and-delete, exported so the dashboard's card menu stays a one-liner. */
export function confirmDeleteScan(
  scan: ScanRecord, onDone: () => void, unit: 'scan' | 'test' = 'scan',
) {
  Alert.alert(
    `Delete ${unit[0].toUpperCase()}${unit.slice(1)}`,
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
            Alert.alert('Error', `Could not delete. The ${unit} may have active bookings.`);
          }
        },
      },
    ],
  );
}

const s = StyleSheet.create({
  photoRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, padding: 10, marginBottom: 4 },
  photoThumb: { width: 46, height: 46, borderRadius: 9, borderWidth: 1, borderColor: Colors.blue100 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.blue50 },
  photoText:  { fontSize: 13, color: Colors.blue700, fontWeight: '600', flex: 1 },

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

  pickRow:  { gap: 6, paddingBottom: 12, paddingRight: 4 },
  pick:     { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  pickText: { fontSize: 12, fontWeight: '600', color: Colors.blue700 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },



  note:      { backgroundColor: Colors.blue50, borderRadius: 12, padding: 13, marginBottom: 14 },
  noteTitle: { fontSize: 13, fontWeight: '700', color: Colors.blue800, marginBottom: 3 },
  noteText:  { fontSize: 13, color: Colors.blue800, lineHeight: 18 },
});
