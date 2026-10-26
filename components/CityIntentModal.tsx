/**
 * components/CityIntentModal.tsx
 *
 * The one question a city tap on Home asks: what are you looking for there?
 * The answer only picks which list opens (cityIntentRoute) — nothing is stored
 * or sent. Mirrors the website's CityIntent.js.
 */

import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import { useI18n } from '../services/i18n';
import { SCAN_CENTER } from '../utils/scanCenters';

export type CityIntent = 'doctor' | 'scan' | 'hospital';

type IconName = ComponentProps<typeof Ionicons>['name'];

const OPTIONS: { key: CityIntent; icon: IconName; labelKey: string }[] = [
  { key: 'doctor',   icon: 'medkit-outline',  labelKey: 'city_intent_doctor'   },
  { key: 'scan',     icon: 'pulse-outline',   labelKey: 'city_intent_scan'     },
  { key: 'hospital', icon: 'business-outline', labelKey: 'city_intent_hospital' },
];

/**
 * Where an answer goes. Doctor and Scan or test open the doctors tab with the
 * city typed into the search, as a city tap always did; Hospital opens the
 * hospital list narrowed to the city.
 *
 * The tabs are persistent screens, so the same answer twice sends identical
 * params and the screen would not move off a tab the patient switched to in
 * between. `ts` changes on every pick to make it re-apply.
 *
 * ponytail: Scan or test lands on the Scans tab; Blood tests is one tap away.
 */
export function cityIntentRoute(intent: CityIntent, city: string) {
  if (intent === 'hospital') return { pathname: '/(patient)/hospitals', params: { city } } as const;
  const kind = intent === 'scan' ? SCAN_CENTER : 'doctors';
  return { pathname: '/(patient)/doctors', params: { q: city, kind, ts: String(Date.now()) } } as const;
}

interface Props {
  city: string | null;                    // null = closed
  onClose: () => void;
  onPick: (intent: CityIntent) => void;
}

export default function CityIntentModal({ city, onClose, onPick }: Props) {
  const { t } = useI18n();

  return (
    <Modal visible={!!city} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('city_intent_title', { city: city ?? '' })}</Text>

          {OPTIONS.map(o => (
            <TouchableOpacity
              key={o.key}
              style={styles.row}
              onPress={() => onPick(o.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t(o.labelKey)}
            >
              <Ionicons name={o.icon} size={22} color={Colors.blue600} />
              <Text style={styles.label}>{t(o.labelKey)}</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.blue600} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('city_intent_close')}
          >
            <Text style={styles.closeText}>{t('city_intent_close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,44,83,0.35)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  handle:   { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.blue100, marginBottom: 16 },
  title:    { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 6 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.blue100, marginTop: 10, backgroundColor: Colors.white },
  label:    { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.gray900 },

  closeBtn:  { marginTop: 18, alignItems: 'center', paddingVertical: 12 },
  closeText: { fontSize: 15, fontWeight: '600', color: Colors.gray500 },
});
