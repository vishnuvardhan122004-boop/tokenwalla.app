/**
 * components/PosterModal.tsx — the poster a clinic puts on its wall, on a phone. The
 * app mirror of the website's /poster page (ROADMAP item 58). A phone cannot print
 * directly, so "Share poster" sends a picture of it through the same share sheet the
 * token and the receipt use (a print shop, a printer app, WhatsApp), and "Share link"
 * sends the plain booking link. No new native package: the QR, the capture and the
 * share sheet are all already in the app.
 *
 * The poster itself is for patients, so its two lines go through t(); the buttons are
 * the hospital dashboard's, which is English like the screens around it.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { useI18n } from '../services/i18n';
import { providerLabel } from '../utils/booking';
import { posterPath, posterQrValue, posterShareText, type PosterTarget } from '../utils/poster';
import { shareCapturedView } from '../utils/shareCapture';

export default function PosterModal({ target, onClose }: { target: PosterTarget; onClose: () => void }) {
  const { t } = useI18n();
  const sheetRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const label  = target.kind === 'doctor' ? providerLabel(target.name) : target.name;
  const detail = [target.specialization, target.hospital].filter(Boolean).join(' · ');

  const sharePoster = async () => {
    try {
      setBusy(true);
      if (!(await shareCapturedView(sheetRef, label))) {
        Alert.alert(t('mb_not_available'), t('mb_save_unavailable'));
      }
    } catch {
      Alert.alert(t('error'), t('pt_failed'));
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    try {
      await Share.share({ message: posterShareText(target, t('pt_share_text')) });
    } catch {
      Alert.alert(t('error'), t('pt_failed'));
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
        <View style={s.header}>
          <Text style={s.title}>Poster</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('sc_close')}>
            <Ionicons name="close" size={22} color={Colors.gray600} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* collapsable={false}: Android drops a plain wrapper View, and then there is nothing to capture. */}
          <View ref={sheetRef} collapsable={false} style={s.sheet}>
            <Text style={s.brand}>TokenWalla</Text>
            <Text style={s.name}>{label}</Text>
            {!!detail && <Text style={s.detail}>{detail}</Text>}
            {!!target.city && <Text style={s.city}>{target.city}</Text>}
            <View style={s.qr}>
              <QRCode value={posterQrValue(target.kind, target.id)} size={230} />
            </View>
            <Text style={s.tagline}>{t('pt_tagline')}</Text>
            <Text style={s.url}>{t('pt_or_visit')} {`tokenwalla.com${posterPath(target.kind, target.id)}`}</Text>
          </View>
        </ScrollView>

        <View style={s.actions}>
          <TouchableOpacity style={s.ghost} onPress={shareLink} accessibilityRole="button">
            <Text style={s.ghostText}>Share link</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.primary, busy && { opacity: 0.5 }]} onPress={sharePoster}
            disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={s.primaryText}>Share poster</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  title:  { fontSize: 16, fontWeight: '800', color: Colors.gray900 },

  sheet:   { alignItems: 'center', backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.blue700, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 18 },
  brand:   { fontSize: 18, fontWeight: '800', color: Colors.blue700 },
  name:    { fontSize: 26, fontWeight: '800', color: Colors.gray900, textAlign: 'center', marginTop: 14 },
  detail:  { fontSize: 15, color: Colors.gray700, textAlign: 'center', marginTop: 6 },
  city:    { fontSize: 14, color: Colors.gray500, textAlign: 'center', marginTop: 2 },
  qr:      { marginVertical: 18, padding: 10, backgroundColor: Colors.white },
  tagline: { fontSize: 21, fontWeight: '800', color: Colors.blue700, textAlign: 'center' },
  url:     { fontSize: 13, color: Colors.gray600, textAlign: 'center', marginTop: 6 },

  actions: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  ghost:   { flex: 1, borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  ghostText: { fontSize: 14, fontWeight: '700', color: Colors.blue700 },
  primary: { flex: 1, backgroundColor: Colors.blue600, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  primaryText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
