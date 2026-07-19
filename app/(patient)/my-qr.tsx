import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API from '../../services/api';
import { useI18n } from '../../services/i18n';
import { useCurrentUser } from '../../hooks/useCurrentUser';

interface Booking {
  id: string | number;
  token?: string;
  status?: string;
  doctor_name?: string;
  hospital_name?: string;
  date?: string;
  slot?: string;
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  waiting:     { label: 'Waiting',         bg: Colors.warningBg, text: Colors.warningText },
  in_progress: { label: 'In Consultation', bg: Colors.blue50,    text: Colors.blue600     },
};

export default function MyQRScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useCurrentUser();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [activeQR, setActiveQR] = useState<string | number | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await API.get('/bookings/my/');
        const list: Booking[] = Array.isArray(data) ? data : (data?.results || []);
        // Only active bookings (waiting / in_progress) have a usable QR
        const active = list.filter(b => b.status === 'waiting' || b.status === 'in_progress');
        setBookings(active);
        if (active.length > 0) setActiveQR(active[0].id);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []));

  if (!user) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
        <Text style={styles.emptyTitle}>{t('login_required')}</Text>
        <Text style={styles.emptySub}>{t('login_see_qr')}</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.loginBtnText}>{t('login_arrow')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{t('back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('my_qr_codes')}</Text>
        <Text style={styles.sub}>{t('my_qr_sub')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.blue600} />
          <Text style={{ marginTop: 12, color: Colors.gray400 }}>{t('loading_ellipsis')}</Text>
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🎫</Text>
          <Text style={styles.emptyTitle}>{t('no_active_bookings')}</Text>
          <Text style={styles.emptySub}>{t('book_to_get_qr')}</Text>
          <TouchableOpacity style={styles.bookBtn} onPress={() => router.push('/(patient)/doctors')}>
            <Text style={styles.bookBtnText}>{t('find_doctors_arrow')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* How to use info */}
          <View style={styles.infoBox}>
            <Text style={{ fontSize: 18, marginRight: 10 }}>💡</Text>
            <Text style={styles.infoText}>{t('qr_info')}</Text>
          </View>

          {/* Booking selector if multiple */}
          {bookings.length > 1 && (
            <View style={styles.selectorRow}>
              <Text style={styles.selectorLabel}>{t('select_booking')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                {bookings.map(b => (
                  <TouchableOpacity
                    key={String(b.id)}
                    style={[styles.selectorChip, activeQR === b.id && styles.selectorChipActive]}
                    onPress={() => setActiveQR(b.id)}
                  >
                    <Text style={[styles.selectorChipText, activeQR === b.id && styles.selectorChipTextActive]}>
                      {b.token?.replace('TW-', '#')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* QR Code Cards */}
          {bookings.filter(b => b.id === activeQR || bookings.length === 1).map(booking => {
            const st = STATUS_MAP[booking.status ?? 'waiting'] || STATUS_MAP.waiting;
            const qrData = JSON.stringify({
              token_code:  booking.token,
              doctor_name: booking.doctor_name,
              hospital:    booking.hospital_name,
              date:        booking.date,
              slot:        booking.slot,
            });

            return (
              <View key={String(booking.id)} style={styles.qrCard}>
                {/* Card top gradient bar */}
                <View style={styles.qrCardBar} />

                {/* Header */}
                <View style={styles.qrCardHeader}>
                  <View style={styles.qrBrand}>
                    <View style={styles.qrLogoBox}><Text style={styles.qrLogoText}>TW</Text></View>
                    <Text style={styles.qrBrandName}><Text style={styles.accent}>Token</Text>walla</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.text, marginRight: 5 }} />
                    <Text style={[styles.statusText, { color: st.text }]}>{t(booking.status === 'in_progress' ? 'status_in_consult' : 'status_waiting')}</Text>
                  </View>
                </View>

                {/* QR Code */}
                <View style={styles.qrWrapper}>
                  <View style={styles.qrBox}>
                    <QRCode
                      value={qrData}
                      size={200}
                      color="#0F172A"
                      backgroundColor="#FFFFFF"
                    />
                  </View>
                  <Text style={styles.qrScanHint}>{t('scan_to_verify')}</Text>
                </View>

                {/* Token Number */}
                <View style={styles.tokenSection}>
                  <Text style={styles.tokenLabel}>{t('token_number')}</Text>
                  <Text style={styles.tokenNumber}>{booking.token}</Text>
                </View>

                <View style={styles.qrDivider} />

                {/* Booking Details */}
                <View style={styles.qrDetails}>
                  {[
                    { icon: '🩺', label: 'Doctor',   value: `Dr. ${booking.doctor_name}` },
                    { icon: '🏥', label: 'Hospital', value: booking.hospital_name         },
                    { icon: '📅', label: 'Date',     value: booking.date                  },
                    { icon: '🕐', label: 'Slot',     value: booking.slot                  },
                  ].map(({ icon, label, value }) => (
                    <View key={label} style={styles.detailRow}>
                      <Text style={styles.detailIcon}>{icon}</Text>
                      <Text style={styles.detailLabel}>{label}</Text>
                      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
                    </View>
                  ))}
                </View>

                {/* Footer note */}
                <View style={styles.qrFooter}>
                  <Text style={styles.qrFooterText}>
                    🔒 Valid for this appointment only · tokenwalla.com
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Go to My Bookings */}
          <TouchableOpacity style={styles.viewAllBtn} onPress={() => router.push('/(patient)/my-bookings')}>
            <Text style={styles.viewAllBtnText}>{t('view_all_bookings')}</Text>
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },

  header: { padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.white },
  backBtn: { marginBottom: 10 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.blue600 },
  title:  { fontSize: 22, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  sub:    { fontSize: 13, color: Colors.gray500 },

  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray600, marginBottom: 8, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: Colors.gray400, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  loginBtn:   { backgroundColor: Colors.blue600, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
  loginBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  bookBtn:    { backgroundColor: Colors.blue600, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
  bookBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 14, margin: 16, padding: 14 },
  infoText: { flex: 1, fontSize: 13, color: Colors.blue700, lineHeight: 19 },

  selectorLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray500, paddingHorizontal: 16, marginBottom: 8 },
  selectorRow:   { marginBottom: 8 },
  selectorChip:      { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8 },
  selectorChipActive: { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  selectorChipText:   { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  selectorChipTextActive: { color: Colors.white },

  qrCard:    { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 24, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden', shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 5 },
  qrCardBar: { height: 4, backgroundColor: Colors.blue600 },

  qrCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue50 },
  qrBrand:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qrLogoBox:    { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center' },
  qrLogoText:   { color: Colors.white, fontWeight: '800', fontSize: 11 },
  qrBrandName:  { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  accent:       { color: Colors.blue600 },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:   { fontSize: 11, fontWeight: '700' },

  qrWrapper:  { alignItems: 'center', paddingVertical: 28, backgroundColor: Colors.bg },
  qrBox:      { backgroundColor: Colors.white, padding: 16, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: Colors.blue100 },
  qrScanHint: { fontSize: 12, color: Colors.gray400, marginTop: 14, fontWeight: '500' },

  tokenSection: { alignItems: 'center', paddingBottom: 16 },
  tokenLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: Colors.gray400, textTransform: 'uppercase', marginBottom: 6 },
  tokenNumber:  { fontSize: 26, fontWeight: '700', color: Colors.blue600, fontFamily: 'monospace', letterSpacing: 2 },

  qrDivider: { height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.blue100, marginHorizontal: 20 },

  qrDetails:  { padding: 20 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  detailIcon: { fontSize: 16, width: 26 },
  detailLabel: { fontSize: 12, color: Colors.gray500, width: 64 },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.gray900, textAlign: 'right' },

  qrFooter:     { backgroundColor: Colors.bg, padding: 14, alignItems: 'center' },
  qrFooterText: { fontSize: 11, color: Colors.gray400, textAlign: 'center' },

  viewAllBtn:     { marginHorizontal: 16, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  viewAllBtnText: { color: Colors.blue600, fontWeight: '700', fontSize: 14 },
});
