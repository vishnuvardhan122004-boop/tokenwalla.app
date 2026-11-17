// eslint-disable-next-line @typescript-eslint/no-require-imports -- a CommonJS config plugin
const { stripScreenOrientation, useOptimizedProguardFile } = require('./withPlayFixes');

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
