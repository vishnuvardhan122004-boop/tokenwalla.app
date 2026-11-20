// Play Console recommendations that can only be fixed in the generated native
// project — android/ is gitignored and rebuilt by prebuild on every EAS build,
// so these have to be mods, not hand edits.
//
// 1. "Remove resizability and orientation restrictions" — Android 16 ignores
//    android:screenOrientation on large screens regardless, so the lock buys
//    nothing there and the app's layouts are flex/safe-area based. iOS stays
//    portrait (the `orientation` key in app.json still drives it).
// 2. "Optimisation isn't enabled" — the template passes proguard-android.txt,
//    which contains -dontoptimize, so R8 only shrinks and obfuscates. The
//    -optimize variant is the same file with optimisation left on.
//
//    The first try (#32, 1.5.2 preview, 2026-10-02) broke expo-image: every
//    remote image rendered as an empty box, with
//      Cannot set prop 'source' on view 'expo.modules.image.ExpoImageViewWrapper'
//      Cannot cast 'DynamicFromMap' to 'Either<List<SourceMap>, SharedRef<..>>'
//    expo-modules-core resolves view props and Records through Kotlin
//    reflection, and optimisation erased the signatures and metadata it reads.
//    It was backed out in #34. This second try keeps those (the
//    extraProguardRules in app.json) and must pass a device check with photos
//    on screen before it ships.
//
// 3. "Required hardware feature declarations are restricting your app's
//    availability: android.hardware.screen.portrait" (Play Console, 1.13.0).
//    Not our activity: the Google code scanner that expo-camera pulls in
//    (GmsBarcodeScanningDelegateActivity) is locked to portrait, and Play turns
//    any portrait-locked activity in the merged manifest into a REQUIRED
//    portrait screen. Declaring the feature with required="false" overrides it.
//
// Not covered here: optimised resource shrinking needs AGP >= 8.12
// (react-native 0.81 pins 8.11), and AGP 9 needs a newer Expo SDK.
const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const DEFAULT_PROGUARD = /getDefaultProguardFile\((['"])proguard-android\.txt\1\)/;

/** Drops android:screenOrientation from the activities in our own manifest. */
function stripScreenOrientation(manifest) {
  for (const app of manifest.manifest.application ?? []) {
    for (const activity of app.activity ?? []) {
      delete activity.$?.['android:screenOrientation'];
    }
  }
  return manifest;
}

const PORTRAIT_FEATURE = 'android.hardware.screen.portrait';

/** Declares the portrait screen as optional so Play stops treating it as required.
 *  Idempotent; leaves any other uses-feature alone. */
function makePortraitOptional(manifest) {
  const m = manifest.manifest;
  const features = (m['uses-feature'] = m['uses-feature'] ?? []);
  const existing = features.find((f) => f.$?.['android:name'] === PORTRAIT_FEATURE);
  if (existing) existing.$['android:required'] = 'false';
  else features.push({ $: { 'android:name': PORTRAIT_FEATURE, 'android:required': 'false' } });
  return manifest;
}

/** proguard-android.txt -> proguard-android-optimize.txt. Throws rather than
 *  no-op if the template moves, so the optimisation can't silently vanish. */
function useOptimizedProguardFile(contents) {
  if (contents.includes('proguard-android-optimize.txt')) return contents;
  if (!DEFAULT_PROGUARD.test(contents)) {
    throw new Error(
      'withPlayFixes: no getDefaultProguardFile("proguard-android.txt") in app/build.gradle — ' +
        'the Expo template changed; re-check R8 optimisation by hand.'
    );
  }
  return contents.replace(DEFAULT_PROGUARD, 'getDefaultProguardFile("proguard-android-optimize.txt")');
}

module.exports = function withPlayFixes(config) {
  config = withAndroidManifest(config, (c) => {
    c.modResults = makePortraitOptional(stripScreenOrientation(c.modResults));
    return c;
  });
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = useOptimizedProguardFile(c.modResults.contents);
    return c;
  });
};

module.exports.stripScreenOrientation = stripScreenOrientation;
module.exports.makePortraitOptional = makePortraitOptional;
module.exports.useOptimizedProguardFile = useOptimizedProguardFile;
