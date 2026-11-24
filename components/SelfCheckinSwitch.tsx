/**
 * components/SelfCheckinSwitch.tsx — Profile → "Self check-in at reception"
 * (web ROADMAP 59, mirrors src/hospital/SelfCheckinCard.js).
 *
 * One switch, saved on tap: patients scan a poster and take today's token on
 * their own phone; it shows in the queue as "Self check-in". OFF until the
 * hospital turns it on; off is also the pause. The stored login has no
 * `self_checkin_enabled`, so the switch reads it from the server.
 */
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API from '../services/api';

export const posterUrl = (id: number | string) => `https://www.tokenwalla.com/poster/checkin/${id}`;

export default function SelfCheckinSwitch({ hospitalId, segments }: {
  hospitalId: number | string;
  segments?: string[];
}) {
  const [on, setOn] = useState<boolean | null>(null);   // null = loading
  const [busy, setBusy] = useState(false);
  const doctors = (segments || []).includes('CONSULT');

  useEffect(() => {
    if (!doctors) return undefined;
    let live = true;
    API.get(`/hospitals/${hospitalId}/`)
      .then(({ data }) => { if (live) setOn(!!data?.self_checkin_enabled); })
      .catch(() => { if (live) setOn(false); });
    return () => { live = false; };
  }, [hospitalId, doctors]);

  if (!doctors) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      const { data } = await API.patch(`/hospitals/${hospitalId}/`, { self_checkin_enabled: next });
      setOn(!!data?.self_checkin_enabled);
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={st.card}>
      <Text style={st.title}>Self check-in at reception</Text>
      <Text style={st.sub}>
        Patients scan a poster, pick a doctor and get today's token on their phone. It shows in your
        queue as "Self check-in". Your staff don't need to do anything.
      </Text>
      <View style={st.row}>
        <Text style={st.label}>{on ? 'On: patients can take a token' : 'Off'}</Text>
        <Switch value={!!on} disabled={busy || on === null} onValueChange={toggle}
                accessibilityLabel="Self check-in"
                trackColor={{ true: Colors.blue200, false: Colors.gray200 }}
                thumbColor={on ? Colors.blue600 : Colors.gray400} />
      </View>
      <TouchableOpacity style={st.btn} onPress={() => Linking.openURL(posterUrl(hospitalId))}
                        accessibilityRole="button" accessibilityLabel="Print the check-in poster">
        <Text style={st.btnText}>Print the check-in poster</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  // Same card as Profile's other sections (Hprofile styles.section).
  card:    { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16,
             padding: 16, marginBottom: 16, gap: 8 },
  title:   { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  sub:     { fontSize: 12.5, color: Colors.gray500, lineHeight: 18 },
  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label:   { fontSize: 13.5, fontWeight: '600', color: Colors.gray800, flexShrink: 1 },
  btn:     { borderWidth: 1, borderColor: Colors.blue600, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnText: { color: Colors.blue600, fontWeight: '700', fontSize: 13 },
});
