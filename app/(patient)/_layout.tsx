import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.blue600,
        tabBarInactiveTintColor: Colors.gray400,
      }}
    >
      {/* ── Visible tabs (exactly 4) ───────────────────────────────────────── */}
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<HomeIcon color={focused ? Colors.blue600 : Colors.gray400} />}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="doctors"
        options={{
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
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<TicketIcon color={focused ? Colors.blue600 : Colors.gray400} />}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<ProfileIcon color={focused ? Colors.blue600 : Colors.gray400} />}
            />
          ),
        }}
      />

      {/* ── Hidden screens — NOT shown as tabs ────────────────────────────── */}
      <Tabs.Screen name="doctor/[id]"    options={{ href: null }} />
      <Tabs.Screen name="notifications"  options={{ href: null }} />
      <Tabs.Screen name="my-qr"          options={{ href: null }} />
      <Tabs.Screen name="edit-profile"   options={{ href: null }} />
      <Tabs.Screen name="payment"        options={{ href: null }} />
      <Tabs.Screen name="booking-token"  options={{ href: null }} />
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
    shadowColor: '#185FA5',
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
    backgroundColor: '#E6F1FB', // blue-50
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