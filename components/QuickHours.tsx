/**
 * components/QuickHours.tsx — one-tap hours above a slot grid.
 *
 * Shared by the doctor form (dashboard.tsx) and ScanEditorModal so the two
 * can't drift, as their Select All buttons already have. A tap REPLACES the
 * selected slots; the caller decides what else survives (a scan keeps times
 * saved off the half-hour grid, which this grid cannot show or remove).
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '../constants/colors';
import { SLOT_PRESETS, presetSlots } from '../constants/slots';

export default function QuickHours({ onPick }: { onPick: (slots: string[]) => void }) {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>QUICK HOURS  (replaces the slots below)</Text>
      <View style={s.row}>
        {SLOT_PRESETS.map(p => (
          <TouchableOpacity
            key={p.label}
            style={s.btn}
            onPress={() => onPick(presetSlots(p))}
            accessibilityRole="button"
            accessibilityLabel={`Quick hours ${p.label}`}
          >
            <Text style={s.btnText}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { marginBottom: 12 },
  label:   { fontSize: 12, fontWeight: '700', color: Colors.gray500, marginBottom: 6 },
  row:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn:     { minHeight: 44, justifyContent: 'center', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 9, paddingHorizontal: 14 },
  btnText: { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
});
