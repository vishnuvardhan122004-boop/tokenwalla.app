/**
 * components/UnnamedRewards.tsx — rewards waiting for a name (web ROADMAP 85b,
 * mirrors src/hospital/UnnamedRewards.js).
 *
 * With STAFF_NAMED_ONLY on there is no "main desk": a visit that earns the
 * staff reward but has nobody named is held. This card lists them
 * (GET /hospitals/<id>/staff/unnamed/) so the desk can name who handled each
 * one (PATCH /bookings/handled-by/<id>/). Not named within the window (30
 * days), it is lost. Renders nothing while the switch is off or nothing is held.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API from '../services/api';
import DeskPicker, { changeHandledBy, type DeskPerson } from './DeskPicker';

export type HeldReward = { id: number; token: string; date: string; slot: string; patient_name: string; provider_name: string };

/** The card's heading: "1 reward needs a name" / "3 rewards need a name". */
export const heldHeading = (n: number) => `${n} reward${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} a name`;

export default function UnnamedRewards({ hospitalId, staff, namedOnly, refresh, onManage }: {
  hospitalId: number | string;
  staff: DeskPerson[];
  namedOnly: boolean;
  /** Changes when the queue's completed list does, so a new held visit shows up. */
  refresh?: unknown;
  onManage?: () => void;
}) {
  const [rows, setRows] = useState<HeldReward[]>([]);
  const [days, setDays] = useState(30);
  const [naming, setNaming] = useState<HeldReward | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!namedOnly) { setRows([]); return undefined; }
    let live = true;
    API.get(`/hospitals/${hospitalId}/staff/unnamed/`)
      .then(({ data }) => {
        if (!live) return;
        setRows(Array.isArray(data?.bookings) ? data.bookings : []);
        if (data?.window_days) setDays(data.window_days);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [hospitalId, namedOnly, refresh]);

  if (!namedOnly || rows.length === 0) return null;

  const name = async (staffId: number | null) => {
    if (!naming || staffId === null) return;
    setBusy(true);
    const r = await changeHandledBy(naming.id, staffId);
    setBusy(false);
    if (r.ok) {
      setRows(all => all.filter(x => x.id !== naming.id));
      // Not the desk's "+₹7 · N today": this visit may be from another day.
      setMsg(`Saved. ${staff.find(s => s.id === staffId)?.name || 'They'} gets the reward for ${naming.patient_name}.`);
    } else {
      setMsg(r.msg);
    }
    setNaming(null);
  };

  return (
    <View style={st.card} accessibilityLabel="Rewards that need a name">
      <Text style={st.title}>🎯 {heldHeading(rows.length)}</Text>
      <Text style={st.sub}>Pick who handled each patient so they get their reward. Not named within {days} days, it is lost.</Text>
      {msg ? <Text style={st.msg} accessibilityRole="alert">{msg}</Text> : null}
      {staff.length === 0 ? (
        <TouchableOpacity style={st.add} onPress={onManage} accessibilityRole="button" accessibilityLabel="Add your staff to reward them">
          <Text style={st.addText}>Add your staff to reward them</Text>
        </TouchableOpacity>
      ) : rows.map(b => (
        <View key={b.id} style={st.row}>
          <Text style={st.rowText}><Text style={st.bold}>{b.patient_name}</Text> · {b.provider_name} · {b.date} {b.slot}</Text>
          <TouchableOpacity style={st.name} onPress={() => { setMsg(''); setNaming(b); }}
                            accessibilityRole="button" accessibilityLabel={`Name who handled ${b.patient_name}`}>
            <Text style={st.nameText}>Name</Text>
          </TouchableOpacity>
        </View>
      ))}
      <DeskPicker visible={naming !== null} hospitalId={hospitalId} staff={staff} namedOnly
                  patient={naming?.patient_name} busy={busy} onPick={name} onCancel={() => setNaming(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  card:     { marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F0C36D', backgroundColor: Colors.white, gap: 6 },
  title:    { fontSize: 16, fontWeight: '700', color: Colors.gray700 },
  sub:      { fontSize: 13, color: Colors.gray500 },
  msg:      { fontSize: 13, color: Colors.successText, fontWeight: '600' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: Colors.blue100, paddingTop: 8 },
  rowText:  { flex: 1, fontSize: 13, color: Colors.gray700 },
  bold:     { fontWeight: '700' },
  name:     { borderWidth: 1, borderColor: Colors.blue700, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  nameText: { color: Colors.blue700, fontWeight: '700', fontSize: 13 },
  add:      { backgroundColor: '#F0C36D', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start' },
  addText:  { color: Colors.gray700, fontWeight: '700', fontSize: 13 },
});
