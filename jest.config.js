/** Jest config — unit tests for pure logic (utils/). Uses the Expo preset so
 *  imports that reach expo-* modules (e.g. constants/config → expo-constants)
 *  resolve under the test runner. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
};
