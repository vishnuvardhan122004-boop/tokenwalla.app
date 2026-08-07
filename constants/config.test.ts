import { isTestHospital } from './config';

describe('isTestHospital', () => {
  it('hides marked hospitals regardless of build type', () => {
    expect(isTestHospital('[TEST] Demo Hospital')).toBe(true);
    expect(isTestHospital('[test] demo hospital')).toBe(true);
  });

  it('keeps real hospitals', () => {
    expect(isTestHospital('Apollo Hospital')).toBe(false);
    expect(isTestHospital(null)).toBe(false);
    expect(isTestHospital(undefined)).toBe(false);
  });
});
