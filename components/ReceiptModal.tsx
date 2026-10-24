/**
 * components/ReceiptModal.tsx — the GST receipt for a paid booking. The app
 * mirror of the website's ReceiptModal.jsx, for GET /api/payment/receipt/<id>/.
 *
 * The backend already computes and marks up every line (SAC codes, the
 * consultation fee's GST exemption, the combined GST on platform + gateway); this
 * only renders it. The chrome and alerts go through t(); the line descriptions and
 * notes come from the server in English and stay that way (it is a tax document).
 * "Save" shares a PNG of the receipt through the same share sheet the token ticket
 * uses, so no PDF library is needed.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { Colors } from '../constants/colors';
import API from '../services/api';
import { useI18n } from '../services/i18n';

interface LineItem {
  description: string;
  note?: string;
  sac_code?: string | null;
  taxable_value: string;
  gst_rate: string;
  gst_amount?: string | null;
}

interface Receipt {
  seller: { gstin?: string | null };
  receipt_no: string;
  issued_at: string;
  payment_id?: string;
  booking: { patient: string; doctor: string; hospital: string; date: string; slot: string; token: string | number };
  line_items: LineItem[];
  taxable_value: string;
  gst: { rate: string; amount: string };
  total: string;
  pass?: { id: number | string; role: 'purchase' | 'redeemed' } | null;
  note?: string;
}

export default function ReceiptModal({ booking, onClose }: {
  booking: { id: number | string };
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<Receipt | null>(null);
  // null = fine; '' = failed with no server message (the fallback is applied at
  // render, so the effect does not depend on t, which changes every render).
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    API.get(`/payment/receipt/${booking.id}/`)
      .then(res => { if (alive) setData(res.data); })
      .catch(err => { if (alive) setError(err?.response?.data?.message || ''); });
    return () => { alive = false; };
  }, [booking.id]);

  const save = async () => {
    try {
      setSaving(true);
      // The scroll view's whole content, not just the part on screen: a long receipt
      // (a pass note, several lines) must not lose its Total below the fold.
      const uri = await captureRef(scrollRef, { format: 'png', quality: 1, result: 'tmpfile', snapshotContentContainer: true });
      const shareUri = uri.startsWith('file') ? uri : `file://${uri}`;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, { mimeType: 'image/png', dialogTitle: t('rc_save_title'), UTI: 'public.png' });
      } else {
        Alert.alert(t('mb_not_available'), t('mb_save_unavailable'));
      }
    } catch {
      Alert.alert(t('error'), t('rc_save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const b = data?.booking;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
        <View style={s.header}>
          <Text style={s.title}>{t('mb_receipt')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('sc_close')}>
            <Ionicons name="close" size={22} color={Colors.gray600} />
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, backgroundColor: Colors.white }}>
          {!data && error === null && <ActivityIndicator style={{ marginTop: 40 }} color={Colors.blue600} />}
          {error !== null && <Text style={s.error}>{error || t('rc_load_failed')}</Text>}
          {data && b && (
            <View style={s.sheet}>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={s.brand}>TokenWalla</Text>
                  {!!data.seller?.gstin && <Text style={s.small}>GSTIN: {data.seller.gstin}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.receiptNo}>{data.receipt_no}</Text>
                  <Text style={s.small}>{data.issued_at}</Text>
                </View>
              </View>

              {([
                [t('bt_patient'), b.patient], [t('rc_provider'), b.doctor], [t('bt_hospital'), b.hospital],
                [t('rc_date_slot'), `${b.date} · ${b.slot}`], [t('mb_token_caps'), String(b.token)],
                [t('bt_payment_id'), data.payment_id || '—'],
              ] as const).map(([label, value]) => (
                <View key={label} style={s.row}>
                  <Text style={s.label}>{label}</Text>
                  <Text style={s.value}>{value}</Text>
                </View>
              ))}

              <View style={s.rule} />
              {data.line_items.map((li, i) => (
                <View key={i} style={s.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>{li.description}</Text>
                    {!!li.note && <Text style={s.small}>{li.note}</Text>}
                    {!!li.sac_code && <Text style={s.small}>SAC {li.sac_code}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.itemName}>₹{li.taxable_value}</Text>
                    <Text style={s.small}>GST {li.gst_rate}{li.gst_amount == null ? '' : ` · ₹${li.gst_amount}`}</Text>
                  </View>
                </View>
              ))}

              <View style={s.rule} />
              <View style={s.sum}><Text style={s.sumText}>{t('rc_taxable')}</Text><Text style={s.sumText}>₹{data.taxable_value}</Text></View>
              <View style={s.sum}><Text style={s.sumText}>{t('rc_gst', { rate: data.gst.rate })}</Text><Text style={s.sumText}>₹{data.gst.amount}</Text></View>
              <View style={s.sum}><Text style={s.total}>{t('rc_total')}</Text><Text style={s.total}>₹{data.total}</Text></View>

              {!!data.pass && (
                <Text style={s.passNote}>
                  {t(data.pass.role === 'purchase' ? 'rc_pass_buy' : 'rc_pass_redeem', { id: data.pass.id })}
                </Text>
              )}
              {!!data.note && <Text style={s.passNote}>{data.note}</Text>}
              <Text style={s.footer}>{t('rc_footer')}</Text>
            </View>
          )}
        </ScrollView>

        <View style={s.actions}>
          <TouchableOpacity style={s.ghost} onPress={onClose} accessibilityRole="button">
            <Text style={s.ghostText}>{t('sc_close')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.primary, (!data || saving) && { opacity: 0.5 }]} onPress={save}
            disabled={!data || saving} accessibilityRole="button" accessibilityLabel={t('rc_save')}>
            {saving ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Text style={s.primaryText}>{t('rc_save')}</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  title:  { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  error:  { marginTop: 40, textAlign: 'center', color: Colors.errorText, fontSize: 14, lineHeight: 20 },

  sheet:     { backgroundColor: Colors.white, padding: 4 },
  head:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, borderStyle: 'dashed', marginBottom: 14 },
  brand:     { fontSize: 18, fontWeight: '800', color: Colors.blue700 },
  receiptNo: { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  small:     { fontSize: 11.5, color: Colors.gray500, marginTop: 2 },

  row:   { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 5 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: '600', color: Colors.gray800 },

  rule: { height: 1, backgroundColor: Colors.blue100, marginVertical: 12 },
  item: { flexDirection: 'row', gap: 12, paddingVertical: 6 },
  itemName: { fontSize: 13.5, fontWeight: '600', color: Colors.gray800 },

  sum:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  sumText: { fontSize: 13, color: Colors.gray600 },
  total:   { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginTop: 4 },

  passNote: { fontSize: 12, color: Colors.blue700, backgroundColor: Colors.blue50, borderRadius: 9, padding: 10, marginTop: 12 },
  footer:   { textAlign: 'center', fontSize: 11, color: Colors.gray400, marginTop: 14 },

  actions: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  ghost:   { flex: 1, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.gray50, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  ghostText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  primary: { flex: 1, backgroundColor: Colors.blue600, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  primaryText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
