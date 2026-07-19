/**
 * components/NotificationBell.tsx
 *
 * A 🔔 button with an unread-count badge, driven by the in-app notification
 * centre (services/notificationStore.ts). Tapping it opens the notifications
 * list. Reused in the patient navbar and the hospital dashboard header.
 */

import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import { useNotificationCenter, type NotificationAudience } from '../services/notificationStore';

export default function NotificationBell({
  audience,
  onPress,
}: {
  audience: NotificationAudience;
  /** Override navigation (e.g. hospital opens a modal). Defaults to the patient list route. */
  onPress?: () => void;
}) {
  const { unreadCount } = useNotificationCenter(audience);

  const handlePress = () => {
    if (onPress) return onPress();
    router.push('/(patient)/notifications');
  };

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={
        unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
      }
    >
      <Text style={styles.icon}>🔔</Text>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.errorText,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  badgeText: { color: Colors.white, fontSize: 10, fontWeight: '800' },
});
