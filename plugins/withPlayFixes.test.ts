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
