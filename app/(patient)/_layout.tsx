import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useI18n } from '../../services/i18n';

// ── SVG Icon Components ──────────────────────────────────────────────────────

function HomeIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V9.5Z"
        fill={color}
        opacity={0.15}
      />
      <Path
        d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V9.5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DoctorIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Head */}
      <Circle cx="12" cy="7" r="3.5" fill={color} opacity={0.15} stroke={color} strokeWidth={1.8} />
      {/* Body / coat */}
      <Path
        d="M5 21C5 17.134 8.13401 14 12 14C15.866 14 19 17.134 19 21"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* Stethoscope */}
      <Path
        d="M10 16.5C10 16.5 10 18.5 12 18.5C14 18.5 14 16.5 14 16.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx="12" cy="19.5" r="1" fill={color} />
    </Svg>
  );
}

function TicketIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 9C2 7.89543 2.89543 7 4 7H20C21.1046 7 22 7.89543 22 9V10.5C21.1716 10.5 20.5 11.1716 20.5 12C20.5 12.8284 21.1716 13.5 22 13.5V15C22 16.1046 21.1046 17 20 17H4C2.89543 17 2 16.1046 2 15V13.5C2.82843 13.5 3.5 12.8284 3.5 12C3.5 11.1716 2.82843 10.5 2 10.5V9Z"
        fill={color}
        opacity={0.12}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M9 7V17" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="2 2" />
      <Path d="M13 10.5H17" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M13 12H16" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M13 13.5H17" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function ProfileIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" fill={color} opacity={0.15} stroke={color} strokeWidth={1.8} />
      <Path
        d="M4 20C4 16.6863 7.58172 14 12 14C16.4183 14 20 16.6863 20 20"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Tab Icon Wrapper ──────────────────────────────────────────────────────────

interface TabIconProps {
  icon: React.ReactNode;
  focused: boolean;
}

function TabIcon({ icon, focused }: TabIconProps) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      {icon}
      {focused && <View style={styles.activePill} />}
    </View>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function PatientLayout() {
  const { t } = useI18n();   // the icon-only tabs still need a name for screen readers
  // A hospital account has no business browsing or booking, and it still lands
  // here: app launch boots into Home, and it opens notifications from its
  // dashboard bell. HomeScreen redirects it to its own Dashboard | Scanner bar
  // (app/(hospital)/(tabs)/_layout.tsx), and this bar is hidden for it, so it
  // never sees a Home or Profile tab.
  //
  // The role is re-read on FOCUS, not on mount, and that is the whole fix.
  // This layout mounts at app launch, before anyone logs in (app/index.tsx
  // redirects to /(patient)/home), and hospital login is pushed ON TOP of it.
  // A mount-only read therefore answered "not a hospital" once and kept that
  // answer all session, so after login + back the four tabs were still there
  // — exactly what a device showed while every test was green. Every login
  // and logout navigates out of (patient) and back, so a focus re-read catches
  // a role change in both directions (a hospital logging out and a patient
  // logging in no longer inherits hidden tabs either).
  //
  // useCurrentUser is safe here: this layout is the root Stack's (patient)
  // screen, so useFocusEffect has a route to listen to — HomeScreen uses it
  // the same way.
  //
  // ponytail: on a fresh mount the role arrives after one AsyncStorage read,
  // so a hospital with a saved session can see the guarded tabs for a frame
  // on cold start. Cache the role at module level if that is ever visible.
  const { user } = useCurrentUser<{ role?: string; hospital?: unknown }>({ refetchOnFocus: true });
  // The bar sits above the system nav bar (Android 3-button / gesture area).
  const insets = useSafeAreaInsets();
  const isHospital = user?.role === 'hospital';
  // The bar is hidden only for a hospital Home actually sends to its dashboard
  // (HomeScreen: role AND user.hospital). One whose hospital object failed to
  // attach stays on Home, and keeps Profile -> Logout as its way out.
  const hasHospitalBar = isHospital && !!user?.hospital;

  return (
    <Tabs
      // Back returns to the screen the patient was actually on, not Home.
      // The default ('firstRoute') sends every hidden screen — doctor/[id],
      // payment, my-qr, edit-profile — back to the first tab, which is Home.
      // 'history' (not 'fullHistory') drops duplicate entries, so browsing
      // doctors -> a doctor -> back -> another doctor doesn't pile up.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: hasHospitalBar ? { display: 'none' } : [styles.tabBar, { height: 72 + insets.bottom, paddingBottom: 10 + insets.bottom }],
        tabBarActiveTintColor: Colors.blue600,
        tabBarInactiveTintColor: Colors.gray400,
      }}
    >
      {/* ── Visible tabs: 4 for a patient; the bar is hidden for a hospital ── */}
      <Tabs.Screen
        name="home"
        options={{
          tabBarAccessibilityLabel: t('tab_home'),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<HomeIcon color={focused ? Colors.blue600 : Colors.gray400} />}
            />
          ),
        }}
      />

      {/* Protected, not href:null. href:null only hides a tab's BUTTON — the
          route stays registered, and Home alone pushes into these from seven
          places. A false guard removes the routes from the navigator outright
          (expo-router useScreens.js filters protectedScreens), so a push from
          anywhere — Home, About, a notification, a deep link — has nowhere to
          go, and a hospital already on one of them falls back to Home. */}
      <Tabs.Protected guard={!isHospital}>
        <Tabs.Screen
          name="doctors"
          options={{
          tabBarAccessibilityLabel: t('tab_doctors'),
            tabBarIcon: ({ focused }) => (
              <TabIcon
                focused={focused}
                icon={<DoctorIcon color={focused ? Colors.blue600 : Colors.gray400} />}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="my-bookings"
          options={{
          tabBarAccessibilityLabel: t('my_bookings'),
            tabBarIcon: ({ focused }) => (
              <TabIcon
                focused={focused}
                icon={<TicketIcon color={focused ? Colors.blue600 : Colors.gray400} />}
              />
            ),
          }}
        />
      </Tabs.Protected>

      <Tabs.Screen
        name="profile"
        options={{
          tabBarAccessibilityLabel: t('profile'),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<ProfileIcon color={focused ? Colors.blue600 : Colors.gray400} />}
            />
          ),
        }}
      />

      {/* ── Hidden screens — NOT shown as tabs ────────────────────────────── */}
      {/* The booking flow behind the two tabs above, under the same guard:
          hiding the tabs while leaving these registered is the gap that let
          Home's "Book appointment" reach payment. */}
      <Tabs.Protected guard={!isHospital}>
        <Tabs.Screen name="doctor/[id]"      options={{ href: null }} />
        <Tabs.Screen name="scan-center/[id]" options={{ href: null }} />
        <Tabs.Screen name="hospitals"        options={{ href: null }} />
        <Tabs.Screen name="hospital/[id]"    options={{ href: null }} />
        <Tabs.Screen name="my-qr"            options={{ href: null }} />
        <Tabs.Screen name="payment"          options={{ href: null }} />
        <Tabs.Screen name="booking-token"    options={{ href: null }} />
      </Tabs.Protected>
      {/* notifications stays OUTSIDE the guard: the hospital dashboard opens
          it as /(patient)/notifications?audience=hospital. */}
      <Tabs.Screen name="notifications"  options={{ href: null }} />
      <Tabs.Screen name="my-documents"   options={{ href: null }} />
      <Tabs.Screen name="edit-profile"   options={{ href: null }} />
      <Tabs.Screen name="about"          options={{ href: null }} />
      <Tabs.Screen name="contact"        options={{ href: null }} />
      <Tabs.Screen name="terms"          options={{ href: null }} />
      <Tabs.Screen name="privacy"        options={{ href: null }} />
      <Tabs.Screen name="refund"         options={{ href: null }} />
    </Tabs>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.blue100,
    height: 72,
    paddingBottom: 10,
    paddingTop: 8,
    // iOS shadow
    shadowColor: Colors.blue600,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    // Android shadow
    elevation: 12,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 44,
    borderRadius: 14,
    position: 'relative',
  },
  iconWrapActive: {
    backgroundColor: Colors.blue50,
  },
  activePill: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.blue600,
  },
});