/**
 * components/RewardCard.tsx — the moment a desk person earns the incentive.
 *
 * After Done (queue) or a QR scan, the server sends `staff_today`
 * ({ name, count, amount, per_booking }). This used to be one line of text in
 * a green bar ("Lata +₹7 · 5 today · ₹35" + Change) that ran off a phone
 * screen. Now it is a card that bounces in: the ₹ amount big, the person's
 * name, today's total under it, and Change for a mis-tap. Vishnu's call
 * (2026-11-23): bottom card, pop / bounce, no new animation library.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Colors } from '../constants/colors';

export type StaffToday = { name: string; count: number; amount: number; per_booking?: number };

/** The card's words. `amount` is null while the incentive is off (₹0): then it
 *  only counts, with no ₹ promise. */
export function rewardLines(t: StaffToday): { amount: string | null; name: string; line: string } {
  const patients = `${t.count} patient${t.count === 1 ? '' : 's'} today`;
  if (!(t.amount > 0)) return { amount: null, name: t.name, line: patients };
  const each = t.per_booking ?? t.amount / t.count;
  return { amount: `+₹${each}`, name: t.name, line: `${patients} · ₹${t.amount}` };
}

export default function RewardCard({ today, onChange, style }: {
  today: StaffToday;
  /** Shown as Change while a mis-tap can still be moved. */
  onChange?: () => void;
  style?: ViewStyle;
}) {
  const pop = useRef(new Animated.Value(0.6)).current;
  const { amount, name, line } = rewardLines(today);

  // Bounce in each time the figures change (a new booking, or a Change).
  useEffect(() => {
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [pop, today.name, today.count, today.amount]);

  return (
    <Animated.View style={[st.card, style, { transform: [{ scale: pop }] }]}
                   accessibilityLiveRegion="polite" accessibilityRole="alert"
                   accessibilityLabel={`${amount ? `${amount} for ` : ''}${name}. ${line}`}>
      <View style={st.top}>
        <Text style={st.party}>🎉</Text>
        {amount ? <Text style={st.amount}>{amount}</Text> : null}
        <Text style={st.name} numberOfLines={1}>{name}</Text>
      </View>
      <View style={st.bottom}>
        <Text style={st.line}>{line}</Text>
        {onChange ? (
          <TouchableOpacity style={st.change} onPress={onChange} accessibilityRole="button"
                            accessibilityLabel="Change who handled it">
            <Text style={st.changeText}>Change</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  card:       { backgroundColor: Colors.successText, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 6,
                shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  top:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  party:      { fontSize: 24 },
  amount:     { color: Colors.white, fontSize: 28, fontWeight: '800' },
  name:       { color: Colors.white, fontSize: 18, fontWeight: '700', flexShrink: 1 },
  bottom:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  line:       { color: Colors.white, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  change:     { backgroundColor: Colors.white, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  changeText: { color: Colors.successText, fontSize: 14, fontWeight: '700' },
});
