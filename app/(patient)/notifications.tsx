/**
 * app/(patient)/notifications.tsx
 *
 * The in-app notification centre (the "panel"). Lists notification history from
 * services/notificationStore.ts. Reused by both audiences: pass ?audience=hospital
 * to show the hospital's notifications (the patient view is the default).
 *
 * Tapping an item marks it read and deep-links to the relevant screen. Header
 * actions: "Read all" and "Clear".
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useI18n } from '../../services/i18n';
import {
  useNotificationCenter,
  type AppNotification,
  type NotificationAudience,
} from '../../services/notificationStore';
import { safeBack } from '../../utils/navigation';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function relativeTime(ts: number, t: TFn): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('nt_just_now');
  if (min < 60) return t('nt_min_ago', { m: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('nt_hr_ago', { h: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t('nt_day_ago', { d: day });
  return new Date(ts).toLocaleDateString();
}

function iconFor(n: AppNotification): string {
  switch (n.type) {
    case 'booking_confirmed':   return '✅';
    case 'appointment_reminder':return '⏰';
    case 'queue_advance':       return '🚶';
    case 'new_booking':         return '🔔';
    default:                    return '🔔';
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ audience?: string }>();
  const audience: NotificationAudience = params.audience === 'hospital' ? 'hospital' : 'patient';

  const { notifications, unreadCount, markRead, markAllRead, clearAll } =
    useNotificationCenter(audience);

  const openItem = (n: AppNotification) => {
    markRead(n.id);
    const screen = n.data?.screen;
    if (screen === 'my-bookings') {
      router.push('/(patient)/my-bookings');
    } else if (screen === 'hospital-dashboard') {
      router.push('/(hospital)/dashboard');
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[styles.card, !item.read && styles.cardUnread]}
      onPress={() => openItem(item)}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.iconText}>{iconFor(item)}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardTitle, !item.read && styles.cardTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {!item.read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.cardText}>{item.body}</Text>
        <Text style={styles.cardTime}>{relativeTime(item.createdAt, t)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => safeBack(router, audience === 'hospital' ? '/(hospital)/dashboard' : '/(patient)/home')}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('nt_title')}</Text>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={markAllRead}
          disabled={unreadCount === 0}
        >
          <Text style={[styles.headerActionText, unreadCount === 0 && styles.headerActionDisabled]}>
            {t('nt_read_all')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyWrap : styles.listContent
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔕</Text>
            <Text style={styles.emptyTitle}>{t('nt_empty_title')}</Text>
            <Text style={styles.emptyText}>
              {audience === 'hospital' ? t('nt_empty_hospital') : t('nt_empty_patient')}
            </Text>
          </View>
        }
        ListFooterComponent={
          notifications.length > 0 ? (
            <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
              <Text style={styles.clearBtnText}>{t('nt_clear_all')}</Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.blue100,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, color: Colors.blue600, lineHeight: 32, marginTop: -4 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.gray900 },
  headerAction: { paddingHorizontal: 8, paddingVertical: 6 },
  headerActionText: { fontSize: 14, fontWeight: '700', color: Colors.blue600 },
  headerActionDisabled: { color: Colors.gray400 },

  listContent: { padding: 14, gap: 10 },

  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.blue100,
  },
  cardUnread: { backgroundColor: Colors.blue50, borderColor: Colors.blue200 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.blue100,
  },
  iconText: { fontSize: 18 },
  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.gray800 },
  cardTitleUnread: { color: Colors.gray900 },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.blue600,
    marginLeft: 8,
  },
  cardText: { fontSize: 13, color: Colors.gray600, marginTop: 3, lineHeight: 18 },
  cardTime: { fontSize: 11, color: Colors.gray400, marginTop: 6, fontWeight: '600' },

  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: Colors.gray800, marginBottom: 6 },
  emptyText: { fontSize: 14, color: Colors.gray500, textAlign: 'center', lineHeight: 20 },

  clearBtn: { alignSelf: 'center', marginTop: 8, marginBottom: 24, paddingVertical: 10, paddingHorizontal: 20 },
  clearBtnText: { fontSize: 14, fontWeight: '700', color: Colors.errorText },
});
