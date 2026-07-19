import { Redirect } from 'expo-router';

// Root route ("/") — the standalone landing page was removed; boot straight
// into the app's home tab. Auth-aware routing happens from there.
export default function Index() {
  return <Redirect href="/(patient)/home" />;
}
