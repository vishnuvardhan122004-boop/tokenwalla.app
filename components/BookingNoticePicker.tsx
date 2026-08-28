/**
 * components/BookingNoticePicker.tsx
 *
 * How much notice a doctor or a service needs before a slot starts, set as a
 * timer rather than typed as a number.
 *
 * The control has THREE states, not two, and keeping them distinct is the
 * whole reason it is not a plain number box:
 *
 *   ''   → use the platform default (the column stores NULL)
 *   '0'  → Off: bookable right up to the moment the slot starts
 *   'n'  → n hours of notice
 *
 * "Default" and "Off" look identical in a number field — both are "nothing
 * typed" to a hurried receptionist — but they mean opposite things to the
 * booking gate. So each gets its own chip and its own caption, and the readout
 * always spells out the consequence in a sentence.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '../constants/colors';

/** Mirrors the serializer's bound. A week is past anything a clinic means. */
export const MAX_NOTICE_HOURS = 168;
/** Mirrors tokenwalla.utils.BOOKING_CUTOFF_HOURS — shown when nothing is set. */
export const DEFAULT_NOTICE_HOURS = 2;

const PRESETS = [0, 1, 2, 4, 12, 24];

function clamp(h: number) {
  return Math.min(MAX_NOTICE_HOURS, Math.max(0, h));
}

interface Props {
  value: string;                      // '' | '0' | '4' …
  onChange: (next: string) => void;
  label?: string;
  /** What the reader is choosing notice FOR — "a patient", "a test". */
  noun?: string;
}

export default function BookingNoticePicker({
  value, onChange, label = 'Booking notice', noun = 'Patients',
}: Props) {
  const isDefault = value.trim() === '';
  const hours     = isDefault ? DEFAULT_NOTICE_HOURS : clamp(Number(value) || 0);

  // Stepping from "default" starts at the default rather than at zero, so the
  // first tap moves in the direction it looks like it should.
  const step = (delta: number) => onChange(String(clamp(hours + delta)));

  const caption = isDefault
    ? `Using the standard ${DEFAULT_NOTICE_HOURS}-hour notice.`
    : hours === 0
      ? `${noun} can book right up to the moment the slot starts.`
      : `${noun} must book at least ${hours} hour${hours === 1 ? '' : 's'} before the slot.`;

  return (
    <View style={st.wrap}>
      <Text style={st.label}>{label}</Text>

      <View style={st.timerRow}>
        <TouchableOpacity
          style={[st.stepBtn, hours === 0 && st.stepBtnOff]}
          onPress={() => step(-1)}
          disabled={hours === 0}
          accessibilityRole="button"
          accessibilityLabel="Decrease booking notice by one hour"
        >
          <Ionicons name="remove" size={20}
            color={hours === 0 ? Colors.gray400 : Colors.blue700} />
        </TouchableOpacity>

        <View style={st.readout}>
          <Text style={[st.time, isDefault && st.timeMuted]}>
            {String(hours).padStart(2, '0')}<Text style={st.colon}>:</Text>00
          </Text>
          <Text style={st.unit}>
            {isDefault ? 'default' : hours === 0 ? 'off' : 'hh:mm'}
          </Text>
        </View>

        <TouchableOpacity
          style={[st.stepBtn, hours >= MAX_NOTICE_HOURS && st.stepBtnOff]}
          onPress={() => step(1)}
          disabled={hours >= MAX_NOTICE_HOURS}
          accessibilityRole="button"
          accessibilityLabel="Increase booking notice by one hour"
        >
          <Ionicons name="add" size={20}
            color={hours >= MAX_NOTICE_HOURS ? Colors.gray400 : Colors.blue700} />
        </TouchableOpacity>
      </View>

      <View style={st.chipRow}>
        <TouchableOpacity
          style={[st.chip, isDefault && st.chipOn]}
          onPress={() => onChange('')}
        >
          <Text style={[st.chipText, isDefault && st.chipTextOn]}>Default</Text>
        </TouchableOpacity>
        {PRESETS.map(p => {
          const on = !isDefault && hours === p;
          return (
            <TouchableOpacity
              key={p}
              style={[st.chip, on && st.chipOn]}
              onPress={() => onChange(String(p))}
            >
              <Text style={[st.chipText, on && st.chipTextOn]}>
                {p === 0 ? 'Off' : `${p}h`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={st.caption}>{caption}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:        { marginBottom: 6 },
  label:       { fontSize: 13, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  timerRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn:     { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  stepBtnOff:  { borderColor: Colors.gray200, backgroundColor: Colors.gray50 },
  readout:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.white },
  time:        { fontSize: 26, fontWeight: '800', color: Colors.blue700, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  timeMuted:   { color: Colors.gray400 },
  colon:       { color: Colors.blue200 },
  unit:        { fontSize: 10, color: Colors.gray400, letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip:        { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.white },
  chipOn:      { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  chipText:    { fontSize: 12, fontWeight: '700', color: Colors.blue700 },
  chipTextOn:  { color: Colors.white },
  caption:     { fontSize: 11.5, color: Colors.gray500, marginTop: 8, lineHeight: 16 },
});
