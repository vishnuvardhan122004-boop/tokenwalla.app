import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API, { logoutUser } from '../../services/api';
import { runningVersion } from '../../services/appUpdate';
import { useI18n } from '../../services/i18n';
import { useCurrentUser } from '../../hooks/useCurrentUser';


type IconName = ComponentProps<typeof Ionicons>['name'];

interface UserProfile {
  name?: string;
  username?: string;
  mobile: string;
  role?: string;
  whatsapp_opt_in?: boolean;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, setUser } = useCurrentUser<UserProfile>({ refetchOnFocus: true });

  // Read the opt-in from the server, not the cached user: the same account can
  // flip this on the website, and a switch that shows the wrong state is worse
  // than no switch at all.
  const [waOptIn, setWaOptIn] = useState(true);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    API.get('/auth/me/')
      .then(({ data }) => { if (alive) setWaOptIn(data.whatsapp_opt_in ?? true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // Optimistic so the switch moves under the finger; rolled back if the PATCH
  // fails, otherwise the UI claims a preference the server never stored.
  const toggleWaOptIn = async (next: boolean) => {
    setWaOptIn(next);
    try {
      await API.patch('/auth/me/whatsapp-opt-in/', { whatsapp_opt_in: next });
    } catch {
      setWaOptIn(!next);
      Alert.alert(t('wa_updates'), t('wa_update_failed'));
    }
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: async () => { await logoutUser(); setUser(null); } },
    ]);
  };


  if (!user) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.loginPrompt}>
        <Ionicons name="person-circle-outline" size={64} color={Colors.blue200} style={{ marginBottom: 12 }} />
        <Text style={styles.title}>{t('not_logged_in')}</Text>
        <Text style={styles.sub}>{t('not_logged_in_sub')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.primaryBtnText}>{t('login_arrow')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.outlineBtnText}>{t('create_account')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.altLink} onPress={() => router.push('/(hospital)/login')}>
          <Text style={styles.altLinkText}>{t('hospital_login')} →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const initials = (name: string): string =>
    name ? name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : '??';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile')}</Text>
        </View>

        {/* Avatar card */}
        <View style={styles.avatarCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user.name || user.username || '')}</Text>
          </View>
          <Text style={styles.userName}>{user.name || user.username}</Text>
          <View style={styles.userMobileRow}>
            <Ionicons name="call-outline" size={13} color={Colors.gray500} />
            <Text style={styles.userMobile}>{user.mobile}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{(user.role || 'patient').toUpperCase()}</Text>
          </View>
        </View>

       
      
        {/* Notification preferences. The only place an app-only user can stop
            WhatsApp messages — previously this existed on the website alone. */}
        <View style={styles.menuSection}>
          <View style={styles.menuItem}>
            <View style={styles.menuIconBox}>
              <Ionicons name="logo-whatsapp" size={18} color={Colors.blue600} />
            </View>
            <Text style={styles.menuLabel}>{t('wa_updates')}</Text>
            <Switch value={waOptIn} onValueChange={toggleWaOptIn} />
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {([
            { icon: 'create-outline',            label: t('menu_edit_profile'),    onPress: () => router.push(user.role === 'hospital' ? '/(hospital)/profile' : '/(patient)/edit-profile') },
            { icon: 'key-outline',               label: t('menu_change_password'), onPress: () => router.push(user.role === 'hospital' ? '/(hospital)/Hforgotpassword' : '/(auth)/forgot-password') },
            // Hospital-only: live queue + doctor management lives on the hospital dashboard.
            ...(user.role === 'hospital'
              ? [{ icon: 'grid-outline' as IconName, label: t('menu_dashboard'), onPress: () => router.push('/(hospital)/dashboard') }]
              : []),
            { icon: 'ticket-outline',            label: t('menu_my_bookings'),  onPress: () => router.push('/(patient)/my-bookings') },
            { icon: 'medkit-outline',            label: t('menu_find_doctors'), onPress: () => router.push('/(patient)/doctors')     },
            { icon: 'information-circle-outline', label: t('menu_about'),        onPress: () => router.push('/(patient)/about')       },
            { icon: 'call-outline',              label: t('menu_contact'),      onPress: () => router.push('/(patient)/contact')     },
            { icon: 'document-text-outline',     label: t('menu_terms'),        onPress: () => router.push('/(patient)/terms')       },
            { icon: 'lock-closed-outline',       label: t('menu_privacy'),      onPress: () => router.push('/(patient)/privacy')     },
            { icon: 'cash-outline',              label: t('menu_refund'),       onPress: () => router.push('/(patient)/refund')      },
            // Profile is the only menu on every page, so it's the one place a
            // patient can reach the hospital side. Hospitals are already in.
            ...(user.role === 'hospital'
              ? []
              : [{ icon: 'business-outline' as IconName, label: t('hospital_login'), onPress: () => router.push('/(hospital)/login') }]),
          ] as { icon: IconName; label: string; onPress: () => void }[]).map(({ icon, label, onPress }) => (
            <TouchableOpacity key={label} style={styles.menuItem} onPress={onPress}>
              <View style={styles.menuIconBox}>
                <Ionicons name={icon} size={18} color={Colors.blue600} />
              </View>
              <Text style={styles.menuLabel}>{label}</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          ))}
        </View>

        {/* App info */}
        <View style={styles.infoSection}>
          {[
            // Read from app.json via expo-constants — a hardcoded string here
            // said v1.1.2 for three releases.
            { label: t('app_version'), value: `v${runningVersion()}` },
            { label: t('platform'),    value: 'TokenWalla'            },
            { label: t('support'),     value: 'support@tokenwalla.com' },
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
            <Ionicons name="log-out-outline" size={18} color={Colors.errorText} />
            <Text style={styles.logoutBtnText}>{t('logout')}</Text>
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
  altLink:     { marginTop: 20, paddingVertical: 8 },
  altLinkText: { color: Colors.blue600, fontWeight: '700', fontSize: 14 },

  header:      { padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.bg },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.gray900 },

  avatarCard: { alignItems: 'center', padding: 28, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  avatar:     { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center', marginBottom: 14, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.white },
  userName:   { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  userMobileRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 },
  userMobile: { fontSize: 14, color: Colors.gray500 },
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

  logoutBtn:     { flexDirection: 'row', gap: 8, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 13, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  logoutBtnText: { color: Colors.errorText, fontWeight: '700', fontSize: 15 },
});
