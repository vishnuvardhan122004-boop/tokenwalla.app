/**
 * components/DeskPicker.tsx — "who handled this patient?" (web ROADMAP 71,
 * mirrors src/hospital/DeskPicker.js).
 *
 * Opens after a QR scan is accepted (auto-mark included) and when Done is
 * pressed in the queue. The staff incentive goes to the person picked: the
 * choice rides the scan / Complete as `staff_id` (null = main desk). No PIN
 * (Vishnu's call); the admin Payouts page shows every booking per person and
 * can move a wrong pick before paying. One tap on a name saves it (web ROADMAP
 * 71b); the last person picked on this device is marked "last time". With no
 * desk staff, or a booking that earns nothing, the callers skip this entirely.
 *
 * Needs the server from web PR #253: an older server ignores `staff_id` and
 * credits the main desk, so this must not ship in a store build before that
 * is live.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API from '../services/api';

export type DeskPerson = { id: number; name: string; active?: boolean };

/** The message after a pick, from the server's `staff_today`: "Lata +₹7 · 5 today · ₹35", or "Lata · 5 today" while the incentive is off. */
export const staffTodayMessage = (t?: { name: string; count: number; amount: number; per_booking?: number } | null): string =>
  !t ? 'Saved.'
  : t.amount > 0 ? `${t.name} +₹${t.per_booking ?? t.amount / t.count} · ${t.count} today · ₹${t.amount}`
  : `${t.name} · ${t.count} today`;
/** The 10-second "Change" after a pick (web ROADMAP 71c). A 409 = the nightly ledger has it: only admin can move it. */
export async function changeHandledBy(bookingId: number | string, staffId: number | null):
  Promise<{ ok: boolean; msg: string; tooLate?: boolean }> {
  try {
    const { data } = await API.patch(`/bookings/handled-by/${bookingId}/`, { staff_id: staffId });
    return { ok: true, msg: staffTodayMessage(data?.staff_today) };
  } catch (e: any) {
    const tooLate = e?.response?.status === 409;
    return { ok: false, tooLate,
      msg: tooLate ? 'Too late to change it here. Ask admin to move it (Payouts).'
        : e?.response?.data?.message || 'Could not change it. Try again.' };
  }
}
const lastKey = (hid: number | string) => `tw_lastpick_${hid}`;

/** The hospital's active desk people; null until the first answer (so a caller can
 *  tell "not loaded yet" from "none"), [] with none or on an older server.
 *  `refresh` re-reads them when it changes. */
export function useDeskStaff(hospitalId?: number | string | null, refresh?: unknown): DeskPerson[] | null {
  const [staff, setStaff] = useState<DeskPerson[] | null>(null);
  useEffect(() => {
    if (hospitalId == null) return undefined;
    let live = true;
    API.get(`/hospitals/${hospitalId}/staff/`)
      .then(({ data }) => { if (live) setStaff(Array.isArray(data) ? data.filter((s: DeskPerson) => s.active) : []); })
      .catch(() => { if (live) setStaff(prev => prev ?? []); });
    return () => { live = false; };
  }, [hospitalId, refresh]);
  return staff;
}

export default function DeskPicker({ visible, hospitalId, staff, patient, mainName, initial, busy, onPick, onCancel }: {
  visible: boolean;
  hospitalId: number | string;
  staff: DeskPerson[];
  patient?: string;
  /** The hospital's payee name, shown as "<name> (main desk)". */
  mainName?: string;
  /** The person already on the booking (picked at the scan), if any. */
  initial?: number | null;
  busy?: boolean;
  onPick: (staffId: number | null) => void;
  onCancel: () => void;
}) {
  const [last, setLast] = useState<number | null>(null);
  const valid = (id: unknown): id is number | null =>
    id === null || staff.some(s => s.id === id);

  // Each time it opens: the booking's own person, else the last pick here, else main desk.
  useEffect(() => {
    if (!visible) return;
    if (initial != null && valid(initial)) { setLast(initial); return; }
    setLast(null);
    AsyncStorage.getItem(lastKey(hospitalId))
      .then(v => { const id = v ? Number(v) : null; if (id !== null && valid(id)) setLast(id); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial, hospitalId, staff]);

  const pick = (id: number | null) => {
    (id ? AsyncStorage.setItem(lastKey(hospitalId), String(id)) : AsyncStorage.removeItem(lastKey(hospitalId)))
      .catch(() => {});
    onPick(id);
  };
  const people: DeskPerson[] = [{ id: 0, name: mainName ? `${mainName} (main desk)` : 'Main desk' }, ...staff];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={st.backdrop}>
        <View style={st.card} accessibilityLabel="Who handled this patient">
          <Text style={st.title}>Who handled {patient || 'this patient'}?</Text>
          <Text style={st.sub}>
            The staff incentive for this booking goes to this person. Online-paid bookings earn it;
            walk-ins and free pass visits don&apos;t.
          </Text>
          {people.map(p => {
            const id = p.id === 0 ? null : p.id;
            const on = last === id;
            return (
              <TouchableOpacity key={p.id} style={[st.option, on && st.optionOn]} onPress={() => pick(id)}
                                disabled={busy} accessibilityRole="button" accessibilityState={{ selected: on }}
                                accessibilityLabel={p.name}>
                <Text style={[st.optionText, on && st.optionTextOn]}>{p.name}{on ? ' · last time' : ''}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={st.row}>
            <TouchableOpacity style={st.cancel} onPress={onCancel} disabled={busy} accessibilityRole="button"
                              accessibilityLabel="Cancel">
              <Text style={st.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 18 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
  sub: { fontSize: 12, color: Colors.gray500, marginBottom: 12 },
  option: { borderWidth: 1, borderColor: Colors.blue700, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 8 },
  optionOn: { backgroundColor: Colors.blue700 },
  optionText: { fontSize: 15, color: Colors.blue700 },
  optionTextOn: { color: Colors.white, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 10 },
  cancel: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray200 },
  cancelText: { color: Colors.gray700, fontWeight: '600' },
});
