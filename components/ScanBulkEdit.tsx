/**
 * components/ScanBulkEdit.tsx — edit every ticked test at once. The app mirror
 * of the website's src/hospital/ScanBulkEdit.js.
 *
 * Nothing changes unless its box is ticked, and a price change is shown per test
 * before it is saved. The payment mode is not offered here on purpose: it
 * decides whether we hold a centre's money, so it stays a one-test decision.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { DAYS_OF_WEEK, DEFAULT_SLOTS } from '../constants/slots';
import { bulkError, bulkEditSummary, postInBatches, priceRows, type PriceEdit, type Unit } from '../utils/scanBulk';
import { DayPicker, SlotPicker } from './SchedulePicker';
import type { ScanRecord } from './ScanEditorModal';

const PREVIEW_ROWS = 5;
const NAME_CHIPS = 6;
const noun = (n: number, unit: Unit) => (n === 1 ? unit : `${unit}s`);

interface Props {
  visible: boolean;
  scans: ScanRecord[];
  unit: Unit;
  /** `failure` is set when only part of a big selection was saved. Awaited, so
   *  Update stays disabled until the parent has reloaded its list. */
  onDone: (summary: string, failure?: boolean) => void | Promise<void>;
  onClose: () => void;
}

type Key = 'price' | 'available' | 'days' | 'slots' | 'prep';

export default function ScanBulkEdit({ visible, scans, unit, onDone, onClose }: Props) {
  const [on, setOn] = useState<Record<Key, boolean>>({ price: false, available: false, days: false, slots: false, prep: false });
  const [edit, setEdit] = useState<PriceEdit>({ mode: 'set', value: '' });
  const [available, setAvailable] = useState(true);
  const [days, setDays] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [prep, setPrep] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const n = scans.length;
  const tick = (k: Key) => setOn(o => ({ ...o, [k]: !o[k] }));
  const { rows: priced, ready: priceReady, problem: priceProblem } = priceRows(scans, edit);
  const anyTicked = Object.values(on).some(Boolean);
  // Days or Time slots ticked with nothing chosen would replace every selected
  // test's list with an empty one (all of them walk-in, no online booking) in one
  // tap. A choice is required; taking one test off online booking is its own edit.
  const emptyPick = (on.days && days.length === 0) || (on.slots && slots.length === 0);
  const canSave = anyTicked && (!on.price || priceReady) && !emptyPick && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    const newPrice = new Map(priced.map(r => [r.sc.id, r.to]));
    const rows = scans.map(sc => ({
      id: sc.id,
      ...(on.price && { price: newPrice.get(sc.id) }),
      ...(on.available && { available }),
      ...(on.days && { days }),
      ...(on.slots && { slots }),
      ...(on.prep && { prep_instructions: prep.trim() }),
    }));
    try {
      const done = await postInBatches('/scans/bulk-update/', 'rows', rows);
      await onDone(bulkEditSummary({ updated: done.updated }, unit));
    } catch (err: any) {
      const msg = bulkError(err, 'Could not save the changes.');
      if (err?.doneCount) {
        // Part of it is saved, so a retry would apply a % change twice to those:
        // close (the parent reloads the list) and say how far it got.
        await onDone(`${msg} Only the first ${err.doneCount} of ${rows.length} were updated.`, true);
        return;
      }
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // A plain function, not a component: one defined here would be a new type on
  // every render and remount (and unfocus) the inputs inside it.
  const section = (key: Key, title: string, body: React.ReactNode) => (
    <View style={[s.box, on[key] && s.boxOn]}>
      <TouchableOpacity style={s.boxHead} onPress={() => tick(key)}
        accessibilityRole="checkbox" accessibilityState={{ checked: on[key] }} accessibilityLabel={title}>
        <Ionicons name={on[key] ? 'checkbox' : 'square-outline'} size={22}
          color={on[key] ? Colors.blue600 : Colors.gray400} />
        <Text style={s.boxTitle}>{title}</Text>
      </TouchableOpacity>
      {on[key] && <View style={s.boxBody}>{body}</View>}
    </View>
  );

  const pill = (label: string, active: boolean, onPress: () => void, hint?: string) => (
    <TouchableOpacity key={label} style={[s.pill, active && s.pillOn]} onPress={onPress}
      accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={hint || label}>
      <Text style={[s.pillText, active && s.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.cancel} accessibilityRole="button">
              <Ionicons name="close" size={15} color={Colors.errorText} />
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.title} numberOfLines={1}>Edit {n} {noun(n, unit)}</Text>
            <TouchableOpacity style={[s.save, !canSave && { opacity: 0.45 }]} onPress={save}
              disabled={!canSave} accessibilityRole="button" accessibilityLabel={`Update ${n} ${noun(n, unit)}`}>
              {saving ? <ActivityIndicator color={Colors.white} size="small" />
                      : <Text style={s.saveText}>Update</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.lead}>Tick what you want to change. Everything else stays as it is.</Text>
            <View style={s.chips}>
              {scans.slice(0, NAME_CHIPS).map(sc => (
                <Text key={String(sc.id)} style={s.nameChip} numberOfLines={1}>{sc.name}</Text>
              ))}
              {n > NAME_CHIPS && <Text style={s.nameChip}>+{n - NAME_CHIPS} more</Text>}
            </View>

            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {section('price', 'Price', (
              <>
                <View style={s.pills}>
                  {pill('Set the same price', edit.mode === 'set', () => setEdit({ mode: 'set', value: '' }))}
                  {pill('Raise or lower', edit.mode === 'change',
                    () => setEdit({ mode: 'change', dir: 'up', by: 'percent', amount: '' }))}
                </View>
                {edit.mode === 'set' ? (
                  <TextInput style={s.input} keyboardType="number-pad" placeholder="New price (₹)"
                    placeholderTextColor={Colors.gray400} accessibilityLabel="New price"
                    value={edit.value} onChangeText={v => setEdit({ mode: 'set', value: v.replace(/\D/g, '') })} />
                ) : (
                  <>
                    <View style={s.pills}>
                      {pill('Raise by', edit.dir === 'up', () => setEdit({ ...edit, dir: 'up' }))}
                      {pill('Lower by', edit.dir === 'down', () => setEdit({ ...edit, dir: 'down' }))}
                    </View>
                    <View style={s.pills}>
                      {pill('%', edit.by === 'percent', () => setEdit({ ...edit, by: 'percent' }), 'Percent')}
                      {pill('₹', edit.by === 'amount', () => setEdit({ ...edit, by: 'amount' }), 'Rupees')}
                    </View>
                    <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Amount"
                      placeholderTextColor={Colors.gray400} accessibilityLabel="Amount"
                      value={edit.amount} onChangeText={v => setEdit({ ...edit, amount: v })} />
                  </>
                )}
                {!!priceProblem && <Text style={s.problem}>{priceProblem}</Text>}
                {priceReady && priced.length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    {priced.slice(0, PREVIEW_ROWS).map(({ sc, to }) => (
                      <View key={String(sc.id)} style={s.previewRow}>
                        <Text style={s.previewName} numberOfLines={1}>{sc.name}</Text>
                        <Text style={s.previewPrice}>₹{sc.price} → <Text style={{ fontWeight: '800' }}>₹{to}</Text></Text>
                      </View>
                    ))}
                    {priced.length > PREVIEW_ROWS && (
                      <Text style={s.hint}>and {priced.length - PREVIEW_ROWS} more</Text>
                    )}
                  </View>
                )}
              </>
            ))}

            {section('available', 'Listed or hidden', (
              <>
                <View style={s.pills}>
                  {pill('Listed', available, () => setAvailable(true))}
                  {pill('Hidden', !available, () => setAvailable(false))}
                </View>
                <Text style={s.hint}>A hidden {unit} stays visible to patients but cannot be booked.</Text>
              </>
            ))}

            {section('days', 'Days', (
              <>
                <Text style={s.hint}>
                  Replaces each {unit}&apos;s days ({days.length} of {DAYS_OF_WEEK.length} selected)
                </Text>
                <DayPicker days={days} onChange={setDays} allLabel="All days" clearable={false}
                  note={<Text style={s.problem}>Pick at least one day to save.</Text>} />
              </>
            ))}

            {section('slots', 'Time slots', (
              <>
                <Text style={s.hint}>
                  Replaces each {unit}&apos;s times ({slots.length} of {DEFAULT_SLOTS.length} selected)
                </Text>
                <SlotPicker slots={slots} onChange={setSlots}
                  note={(
                    <Text style={s.note}>
                      Pick at least one time to save. To take a {unit} off online booking, edit it on its own.
                    </Text>
                  )} />
              </>
            ))}

            {section('prep', 'Before you come', (
              <>
                <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline
                  placeholder="e.g. 12 hours fasting. Water is fine." placeholderTextColor={Colors.gray400}
                  accessibilityLabel="Before you come" value={prep} onChangeText={setPrep} />
                <Text style={s.hint}>Leave it empty to clear the note on every selected {unit}.</Text>
              </>
            ))}

            <View style={{ height: 50 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
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
  save:       { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, minWidth: 74, alignItems: 'center' },
  saveText:   { color: Colors.white, fontWeight: '700', fontSize: 13.5 },

  body: { padding: 16 },
  lead: { fontSize: 13, color: Colors.gray500, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  nameChip: {
    fontSize: 12, color: Colors.gray700, backgroundColor: Colors.gray50, borderWidth: 1,
    borderColor: Colors.gray200, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden',
    maxWidth: '100%',
  },

  errorBox:  { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, color: Colors.errorText, fontSize: 13, lineHeight: 18 },

  box:      { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, padding: 12, marginBottom: 10 },
  boxOn:    { borderColor: Colors.blue600 },
  boxHead:  { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  boxTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.gray900 },
  boxBody:  { marginTop: 10 },

  pills:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  pill:        { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  pillOn:      { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  pillText:    { fontSize: 12.5, color: Colors.gray600, fontWeight: '600' },
  pillTextOn:  { color: Colors.blue700, fontWeight: '700' },

  input: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 14.5,
    color: Colors.gray900, backgroundColor: Colors.white, marginBottom: 8,
  },
  problem: { fontSize: 12.5, color: Colors.errorText, marginTop: 2 },
  hint:    { fontSize: 11.5, color: Colors.gray400, lineHeight: 17, marginBottom: 8 },
  note:    { fontSize: 12.5, color: Colors.blue700, backgroundColor: Colors.blue50, borderRadius: 10, padding: 10, marginBottom: 10, lineHeight: 18 },

  previewRow:   { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  previewName:  { flex: 1, fontSize: 12.5, color: Colors.gray700 },
  previewPrice: { fontSize: 12.5, color: Colors.gray700 },

});
