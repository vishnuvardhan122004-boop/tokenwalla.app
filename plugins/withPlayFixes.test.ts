const { stripScreenOrientation } = require('./withPlayFixes');

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
