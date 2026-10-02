// Play Console recommendations that can only be fixed in the generated native
// project — android/ is gitignored and rebuilt by prebuild on every EAS build,
// so these have to be mods, not hand edits.
//
// 1. "Remove resizability and orientation restrictions" — Android 16 ignores
//    android:screenOrientation on large screens regardless, so the lock buys
//    nothing there and the app's layouts are flex/safe-area based. iOS stays
//    portrait (the `orientation` key in app.json still drives it).
// 2. "Optimisation isn't enabled" — the template passes the default
//    proguard-android.txt, which contains -dontoptimize, so R8 shrinks and
//    obfuscates but never optimises. The -optimize variant is the same file
//    with optimisation left on.
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
    c.modResults = stripScreenOrientation(c.modResults);
    return c;
  });
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = useOptimizedProguardFile(c.modResults.contents);
    return c;
  });
};

module.exports.stripScreenOrientation = stripScreenOrientation;
module.exports.useOptimizedProguardFile = useOptimizedProguardFile;
