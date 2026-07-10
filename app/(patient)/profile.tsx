import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { getUser, logoutUser } from '../../services/api';


interface UserProfile {
  name?: string;
  username?: string;
  mobile: string;
  role?: string;
  whatsapp_opt_in?: boolean;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [waSaving, setWaSaving] = useState(false);

  useFocusEffect(useCallback(() => { getUser().then(setUser); }, []));

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await logoutUser(); setUser(null); } },
    ]);
  };


  if (!user) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.loginPrompt}>
        <Text style={{ fontSize: 56, marginBottom: 16 }}>👤</Text>
        <Text style={styles.title}>Not Logged In</Text>
        <Text style={styles.sub}>Create an account or login to manage your bookings</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.primaryBtnText}>Login →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.outlineBtnText}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const initials = (name: string): string =>
    name ? name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : '??';

  const waEnabled = user.whatsapp_opt_in !== false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* Avatar card */}
        <View style={styles.avatarCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user.name || user.username || '')}</Text>
          </View>
          <Text style={styles.userName}>{user.name || user.username}</Text>
          <Text style={styles.userMobile}>📱 {user.mobile}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{(user.role || 'patient').toUpperCase()}</Text>
          </View>
        </View>

       
      
        {/* Menu Items */}
        <View style={styles.menuSection}>
          {[
            { icon: '🎫', label: 'My Bookings',        onPress: () => router.push('/(patient)/my-bookings') },
            { icon: '🩺', label: 'Find Doctors',       onPress: () => router.push('/(patient)/doctors')     },
            { icon: '📞', label: 'Contact Us',         onPress: () => router.push('/(patient)/contact')     },
            { icon: '📋', label: 'Terms & Conditions', onPress: () => router.push('/(patient)/terms')       },
            { icon: '🔒', label: 'Privacy Policy',     onPress: () => router.push('/(patient)/privacy')     },
            { icon: '💰', label: 'Refund Policy',      onPress: () => router.push('/(patient)/refund')      },
          ].map(({ icon, label, onPress }) => (
            <TouchableOpacity key={label} style={styles.menuItem} onPress={onPress}>
              <View style={styles.menuIconBox}>
                <Text style={{ fontSize: 18 }}>{icon}</Text>
              </View>
              <Text style={styles.menuLabel}>{label}</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* App info */}
        <View style={styles.infoSection}>
          {[
            { label: 'App Version', value: 'v1.1.1'                   },
            { label: 'Platform',    value: 'TokenWalla'                },
            { label: 'Support',     value: 'support@tokenwalla.com'    },
          ].map(({ label, value }) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Logout */}
        <View style={{ padding: 20, paddingBottom: 40 }}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>🚪 Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },

  loginPrompt: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, paddingTop: 80 },
  title:  { fontSize: 22, fontWeight: '800', color: Colors.gray900, marginBottom: 8, textAlign: 'center' },
  sub:    { fontSize: 14, color: Colors.gray500, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  primaryBtn:  { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 12, width: '100%', alignItems: 'center' },
  primaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  outlineBtn:  { borderWidth: 1.5, borderColor: Colors.blue200, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
  outlineBtnText: { color: Colors.blue600, fontWeight: '600', fontSize: 15 },

  header:      { padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.bg },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.gray900 },

  avatarCard: { alignItems: 'center', padding: 28, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  avatar:     { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center', marginBottom: 14, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.white },
  userName:   { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  userMobile: { fontSize: 14, color: Colors.gray500, marginBottom: 12 },
  rolePill:   { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 5 },
  roleText:   { fontSize: 11, fontWeight: '700', color: Colors.blue600, letterSpacing: 1.5 },

  waCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginTop: 16, padding: 16,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.blue100,
    borderRadius: 14,
  },
  waTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray800, marginBottom: 3 },
  waSub:   { fontSize: 12, color: Colors.gray400, lineHeight: 16 },
  waSwitchTrack: {
    width: 46, height: 26, borderRadius: 100, justifyContent: 'center', flexShrink: 0,
  },
  waSwitchThumb: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.white,
    position: 'absolute', top: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },

  menuSection: { paddingHorizontal: 16, paddingTop: 16 },
  menuItem:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  menuIconBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue100, alignItems: 'center', justifyContent: 'center' },
  menuLabel:   { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.gray800 },
  menuArrow:   { fontSize: 22, color: Colors.gray400 },

  infoSection: { margin: 16, backgroundColor: Colors.gray50, borderRadius: 14, borderWidth: 1, borderColor: Colors.gray100, overflow: 'hidden' },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  infoLabel:   { fontSize: 13, color: Colors.gray400 },
  infoValue:   { fontSize: 13, fontWeight: '600', color: Colors.gray700 },

  logoutBtn:     { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  logoutBtnText: { color: Colors.errorText, fontWeight: '700', fontSize: 15 },
});
