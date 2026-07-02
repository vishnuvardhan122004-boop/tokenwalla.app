import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#F4F9FF" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}