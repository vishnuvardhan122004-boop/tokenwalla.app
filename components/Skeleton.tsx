/**
 * components/Skeleton.tsx
 *
 * Placeholder blocks shown while a screen's real content is still loading.
 *
 * The app used a centred spinner everywhere, which tells the patient "something
 * is happening" but not "what is coming" — and on the doctor list, where the
 * cached list paints almost immediately, a full-screen spinner actually made
 * the screen feel slower than it was. A skeleton in the shape of the content
 * reads as the page already arriving.
 *
 * Deliberately plain RN `Animated`, not Reanimated: one looped opacity value on
 * the native driver is the whole effect, and it costs no worklet plumbing.
 * ponytail: single shared pulse per mounted skeleton; if a screen ever shows
 * dozens at once, hoist the Animated.Value to a provider.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { Colors } from '../constants/colors';

/** One pulsing grey block. Width/height/radius come from the caller. */
export function SkeletonBlock({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      // Decorative only — a screen reader should hear the screen's own loading
      // state, not a list of empty boxes.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        s.block,
        style,
        { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
      ]}
    />
  );
}

/** The doctor / centre list card: avatar, three text lines, a footer strip. */
export function SkeletonDoctorCard() {
  return (
    <View style={s.card}>
      <View style={s.cardStrip} />
      <View style={s.cardBody}>
        <SkeletonBlock style={s.avatar} />
        <View style={s.cardText}>
          <SkeletonBlock style={{ width: '38%', height: 9,  borderRadius: 4 }} />
          <SkeletonBlock style={{ width: '68%', height: 14, borderRadius: 5, marginTop: 7 }} />
          <SkeletonBlock style={{ width: '52%', height: 11, borderRadius: 4, marginTop: 8 }} />
          <View style={s.chipRow}>
            <SkeletonBlock style={s.chip} />
            <SkeletonBlock style={s.chip} />
          </View>
        </View>
        <View style={s.cardRight}>
          <SkeletonBlock style={{ width: 58, height: 20, borderRadius: 100 }} />
          <SkeletonBlock style={{ width: 40, height: 16, borderRadius: 5, marginTop: 10 }} />
        </View>
      </View>
      <View style={s.cardFooter}>
        <SkeletonBlock style={{ width: '34%', height: 11, borderRadius: 4 }} />
        <SkeletonBlock style={{ width: 84, height: 26, borderRadius: 9 }} />
      </View>
    </View>
  );
}

/** The bookings card: token column, status pill, two text lines. */
export function SkeletonBookingCard() {
  return (
    <View style={s.card}>
      <View style={s.cardStrip} />
      <View style={s.cardBody}>
        <View style={s.tokenCol}>
          <SkeletonBlock style={{ width: 34, height: 8,  borderRadius: 3 }} />
          <SkeletonBlock style={{ width: 44, height: 18, borderRadius: 5, marginTop: 6 }} />
        </View>
        <View style={s.cardText}>
          <SkeletonBlock style={{ width: 92,    height: 20, borderRadius: 100 }} />
          <SkeletonBlock style={{ width: '72%', height: 14, borderRadius: 5, marginTop: 10 }} />
          <SkeletonBlock style={{ width: '56%', height: 11, borderRadius: 4, marginTop: 8 }} />
        </View>
      </View>
    </View>
  );
}

/** `count` cards of the given shape, spaced like the real list. */
export function SkeletonList({ count = 4, variant = 'doctor' }: {
  count?: number;
  variant?: 'doctor' | 'booking';
}) {
  const Card = variant === 'booking' ? SkeletonBookingCard : SkeletonDoctorCard;
  return (
    <View style={s.list}>
      {Array.from({ length: count }, (_, i) => <Card key={i} />)}
    </View>
  );
}

const s = StyleSheet.create({
  block: { backgroundColor: Colors.blue50 },

  list: { padding: 16, gap: 14 },

  // Mirrors the real card: same radius, border and shadow, so the swap to real
  // content doesn't shift anything on screen.
  card: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.blue100,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardStrip: { height: 3, backgroundColor: Colors.blue50 },
  cardBody:  { flexDirection: 'row', padding: 14, gap: 12 },
  cardText:  { flex: 1, justifyContent: 'center' },
  cardRight: { alignItems: 'flex-end', justifyContent: 'center' },
  avatar:    { width: 62, height: 62, borderRadius: 14 },
  tokenCol:  { width: 58, alignItems: 'center', justifyContent: 'center' },
  chipRow:   { flexDirection: 'row', gap: 6, marginTop: 10 },
  chip:      { width: 56, height: 20, borderRadius: 7 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: Colors.blue50,
  },
});
