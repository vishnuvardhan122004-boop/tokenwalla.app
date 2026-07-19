/**
 * components/LanguageModal.tsx
 *
 * Bottom-sheet language picker. Used from the landing screen's globe button.
 */

import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import { LANGUAGES, useI18n } from '../services/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function LanguageModal({ visible, onClose }: Props) {
  const { lang, setLang, t } = useI18n();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('choose_language')}</Text>
          <Text style={styles.sub}>{t('choose_language_sub')}</Text>

          <View style={{ marginTop: 8 }}>
            {LANGUAGES.map(l => {
              const active = l.code === lang;
              return (
                <TouchableOpacity
                  key={l.code}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => { setLang(l.code); onClose(); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.flag}>{l.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.native, active && styles.nativeActive]}>{l.native}</Text>
                    <Text style={styles.label}>{l.label}</Text>
                  </View>
                  {active && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
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
  title:    { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  sub:      { fontSize: 13, color: Colors.gray500, marginBottom: 8 },

  row:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.blue100, marginTop: 10, backgroundColor: Colors.white },
  rowActive: { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  flag:      { fontSize: 24 },
  native:    { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  nativeActive: { color: Colors.blue700 },
  label:     { fontSize: 12, color: Colors.gray400, marginTop: 1 },
  check:     { fontSize: 18, fontWeight: '800', color: Colors.blue600 },

  closeBtn:  { marginTop: 18, alignItems: 'center', paddingVertical: 12 },
  closeText: { fontSize: 15, fontWeight: '600', color: Colors.gray500 },
});
