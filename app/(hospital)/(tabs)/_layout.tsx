import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';

// A logged-in hospital's own bottom bar: Dashboard | Scanner, the two things a
// front desk does all day. Profile, Payments and Analytics stay plain stack
// screens in (hospital)/_layout.tsx, pushed over this bar with their own back
// arrow — so they keep remounting (and refetching) on every visit, as they
// were written to. Profile and Logout are in the dashboard header.
//
// The group folder doesn't change a URL: '/(hospital)/dashboard' and
// '/(hospital)/scanner' still resolve here, because route groups are optional
// segments when expo-router matches an href.
export default function HospitalTabsLayout() {
  // The bar sits above the system nav bar (Android 3-button / gesture area).
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      // Back from Scanner is Dashboard; back from Dashboard leaves. NOT
      // 'history': Dashboard -> Scanner -> Dashboard leaves [scanner, dashboard],
      // so back on Dashboard opened Scanner, whose safeBack fallback jumped to
      // Dashboard again — an Android back button that never let you out.
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 72 + insets.bottom, paddingBottom: 10 + insets.bottom }],
        tabBarActiveTintColor: Colors.blue600,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'qr-code' : 'qr-code-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// Same bar as app/(patient)/_layout.tsx, plus labels: two tabs have room.
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.blue100,
    height: 72,
    paddingBottom: 10,
    paddingTop: 8,
    shadowColor: Colors.blue600,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
