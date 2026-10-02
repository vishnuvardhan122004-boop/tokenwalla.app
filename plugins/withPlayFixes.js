// Play Console recommendation that can only be fixed in the generated native
// project — android/ is gitignored and rebuilt by prebuild on every EAS build,
// so this has to be a mod, not a hand edit.
//
// "Remove resizability and orientation restrictions" — Android 16 ignores
// android:screenOrientation on large screens regardless, so the lock buys
// nothing there and the app's layouts are flex/safe-area based. iOS stays
// portrait (the `orientation` key in app.json still drives it).
//
// NOT done here, deliberately: "Optimisation isn't enabled". The template
// passes proguard-android.txt, which contains -dontoptimize, so R8 only
// shrinks and obfuscates. Swapping in proguard-android-optimize.txt does
// enable optimisation — and breaks expo-image on the resulting build:
//
//   Cannot set prop 'source' on view 'expo.modules.image.ExpoImageViewWrapper'
//   Cannot cast 'DynamicFromMap' to 'Either<List<SourceMap>, SharedRef<..>>'
//
// expo-modules-core resolves view props through Kotlin type reflection, and
// optimisation erases the generic signatures it needs; every remote image
// then renders as an empty box (verified on an Android 16 emulator with the
// 1.5.2 preview build, 2026-10-02). expo-modules-core's own consumer rules
// don't cover it, and every Expo module uses the same prop path — so the
// blast radius is wider than the one module we happened to catch. Revisit
// with an SDK bump, with a full on-device pass before it ships.
const { withAndroidManifest } = require('expo/config-plugins');

/** Drops android:screenOrientation from the activities in our own manifest. */
function stripScreenOrientation(manifest) {
  for (const app of manifest.manifest.application ?? []) {
    for (const activity of app.activity ?? []) {
      delete activity.$?.['android:screenOrientation'];
    }
  }
  return manifest;
}

module.exports = function withPlayFixes(config) {
  return withAndroidManifest(config, (c) => {
    c.modResults = stripScreenOrientation(c.modResults);
    return c;
  });
};

module.exports.stripScreenOrientation = stripScreenOrientation;
