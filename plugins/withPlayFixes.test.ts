// eslint-disable-next-line @typescript-eslint/no-require-imports -- a CommonJS config plugin
const { stripScreenOrientation, makePortraitOptional, useOptimizedProguardFile } = require('./withPlayFixes');

describe('stripScreenOrientation', () => {
  it('removes the orientation lock and keeps the rest of the activity', () => {
    const manifest = {
      manifest: {
        application: [
          {
            activity: [
              { $: { 'android:name': '.MainActivity', 'android:screenOrientation': 'portrait', 'android:exported': 'true' } },
            ],
          },
        ],
      },
    };
    const activity = stripScreenOrientation(manifest).manifest.application[0].activity[0];
    expect(activity.$['android:screenOrientation']).toBeUndefined();
    expect(activity.$['android:exported']).toBe('true');
  });

  it('survives a manifest with no application or activity entries', () => {
    expect(() => stripScreenOrientation({ manifest: {} })).not.toThrow();
    expect(() => stripScreenOrientation({ manifest: { application: [{}] } })).not.toThrow();
  });
});

describe('makePortraitOptional', () => {
  const FEATURE = 'android.hardware.screen.portrait';

  it('adds the portrait screen as not required', () => {
    const m = makePortraitOptional({ manifest: {} });
    expect(m.manifest['uses-feature']).toEqual([{ $: { 'android:name': FEATURE, 'android:required': 'false' } }]);
  });

  it('keeps other features and flips an existing required one to false', () => {
    const m = makePortraitOptional({
      manifest: { 'uses-feature': [
        { $: { 'android:name': 'android.hardware.camera', 'android:required': 'false' } },
        { $: { 'android:name': FEATURE, 'android:required': 'true' } },
      ] },
    });
    const f = m.manifest['uses-feature'];
    expect(f).toHaveLength(2);
    expect(f[0].$['android:name']).toBe('android.hardware.camera');
    expect(f[1].$['android:required']).toBe('false');
  });

  it('is idempotent', () => {
    const once = makePortraitOptional({ manifest: {} });
    expect(makePortraitOptional(once).manifest['uses-feature']).toHaveLength(1);
  });
});

describe('useOptimizedProguardFile', () => {
  const line = (file: string) => `        proguardFiles getDefaultProguardFile("${file}"), "proguard-rules.pro"\n`;

  it('swaps in the optimising default file', () => {
    expect(useOptimizedProguardFile(line('proguard-android.txt'))).toBe(line('proguard-android-optimize.txt'));
  });

  it('is idempotent', () => {
    const already = line('proguard-android-optimize.txt');
    expect(useOptimizedProguardFile(already)).toBe(already);
  });

  it('throws instead of silently shipping an unoptimised build', () => {
    expect(() => useOptimizedProguardFile('android { buildTypes { release { } } }')).toThrow(/proguard-android\.txt/);
  });
});

describe('no microphone permission', () => {
  // expo-camera's own library manifest declares RECORD_AUDIO, so its plugin's
  // recordAudioAndroid option can't drop it; only a tools:node="remove" from
  // blockedPermissions does. The app never records sound (QR scan, photos).
  const android = require('../app.json').expo.android;

  it('blocks RECORD_AUDIO and keeps the camera', () => {
    expect(android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
    expect(android.blockedPermissions).not.toContain('android.permission.CAMERA');
  });
});

describe('R8 keep rules for Expo reflection', () => {
  // Optimisation without these blanked every expo-image (1.5.2 preview, 2026-10-02).
  const plugins: unknown[] = require('../app.json').expo.plugins;
  const entry = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties') as [string, { android: { extraProguardRules?: string } }];
  const rules = entry[1].android.extraProguardRules ?? '';

  it.each([
    '-keepattributes Signature',
    '-keep class kotlin.Metadata',
    '-keep class expo.modules.**',
    '-keep class kotlin.reflect.jvm.internal.**',
  ])('keeps %s', (rule) => {
    expect(rules).toContain(rule);
  });
});
