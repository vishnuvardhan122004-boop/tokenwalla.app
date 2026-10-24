/**
 * components/SchedulePicker.tsx — the day chips and the time-slot grid a provider
 * picks from. One copy, used by the doctor form (dashboard.tsx), ScanEditorModal
 * and ScanBulkEdit, which each had their own and had drifted apart.
 *
 * Only the controls live here. Each form keeps its own headings ("AVAILABLE DAYS
 * (3 of 7 selected)") and its own wording for "nothing chosen" (`note`), because
 * what an empty list means differs: a doctor with no slots is walk-in, a bulk edit
 * must not save an empty one at all.
 *
 * Both pickers hand back the whole next array, so a caller can do more than store
 * it (the doctor form also clears that field's validation error).
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '../constants/colors';
import { DAYS_OF_WEEK, DEFAULT_SLOTS, SLOT_SECTIONS } from '../constants/slots';
import QuickHours from './QuickHours';

const WEEK = DAYS_OF_WEEK.map(d => d.key);

function Actions({ allLabel, onAll, onClear }: { allLabel: string; onAll: () => void; onClear?: () => void }) {
  return (
    <View style={s.actions}>
      <TouchableOpacity style={s.actionBtn} onPress={onAll} accessibilityRole="button">
        <Text style={s.actionText}>{allLabel}</Text>
      </TouchableOpacity>
      {onClear && (
        <TouchableOpacity style={[s.actionBtn, s.actionDanger]} onPress={onClear} accessibilityRole="button">
          <Text style={[s.actionText, { color: Colors.errorText }]}>Clear All</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Chip({ label, on, onPress, wide }: { label: string; on: boolean; onPress: () => void; wide?: boolean }) {
  return (
    <TouchableOpacity style={[wide ? s.dayChip : s.slotChip, on && s.chipOn]} onPress={onPress}
      accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DayPicker({ days, onChange, allLabel = 'Select All', clearable = true, note }: {
  days: string[];
  onChange: (days: string[]) => void;
  /** Wording of the pick-everything button. */
  allLabel?: string;
  /** Show Clear All too. */
  clearable?: boolean;
  /** Shown while no day is chosen. */
  note?: ReactNode;
}) {
  // Kept in week order whatever order they were tapped in.
  const toggle = (d: string) => onChange(WEEK.filter(x => (x === d ? !days.includes(d) : days.includes(x))));
  return (
    <>
      <Actions allLabel={allLabel} onAll={() => onChange([...WEEK])} onClear={clearable ? () => onChange([]) : undefined} />
      {days.length === 0 && note}
      <View style={s.grid}>
        {DAYS_OF_WEEK.map(({ key, label }) => (
          <Chip key={key} label={label} on={days.includes(key)} onPress={() => toggle(key)} wide />
        ))}
      </View>
    </>
  );
}

export function SlotPicker({ slots, onChange, keepOffGrid = false, note }: {
  slots: string[];
  onChange: (slots: string[]) => void;
  /** A time saved off the half-hour grid (09:15 AM) has no chip, so Quick hours must
   *  keep it or it could never be put back. */
  keepOffGrid?: boolean;
  /** Shown while no slot is chosen. */
  note?: ReactNode;
}) {
  const rank = (x: string) => { const i = DEFAULT_SLOTS.indexOf(x); return i < 0 ? Infinity : i; };
  // Kept in clock order whatever order they were tapped in: patients see them as stored.
  const toggle = (slot: string) => onChange(
    (slots.includes(slot) ? slots.filter(x => x !== slot) : [...slots, slot]).sort((a, b) => rank(a) - rank(b)));
  return (
    <>
      <Actions allLabel="Select All" onAll={() => onChange([...DEFAULT_SLOTS])} onClear={() => onChange([])} />
      <QuickHours onPick={picked =>
        onChange(keepOffGrid ? [...picked, ...slots.filter(x => !DEFAULT_SLOTS.includes(x))] : picked)} />
      {slots.length === 0 && note}
      {SLOT_SECTIONS.map(section => (
        <View key={section.label} style={{ marginBottom: 14 }}>
          <Text style={s.sectionLabel}>{section.label}</Text>
          <View style={s.grid}>
            {section.slots.map(slot => (
              <Chip key={slot} label={slot} on={slots.includes(slot)} onPress={() => toggle(slot)} />
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  actions:      { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn:    { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 8 },
  actionDanger: { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg },
  actionText:   { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.gray500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip:     { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.gray50 },
  dayChip:      { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.gray50 },
  chipOn:       { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  chipText:     { fontSize: 12, fontWeight: '500', color: Colors.gray600 },
  chipTextOn:   { color: Colors.white, fontWeight: '700' },
});
