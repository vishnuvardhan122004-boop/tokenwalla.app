/** Jest config — unit tests for pure logic (utils/). Uses the Expo preset so
 *  imports that reach expo-* modules (e.g. constants/config → expo-constants)
 *  resolve under the test runner. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // Background tasks create git worktrees under .claude/worktrees/. Each holds
  // a full checkout, so testMatch collects every suite a second time and the
  // run reports roughly double the tests — 313 instead of 159 on 2026-08-29,
  // and 277 instead of 144 before that. The count looks like growth rather
  // than an error, which is what makes it worth excluding rather than
  // remembering to prune.
  testPathIgnorePatterns: ['/node_modules/', '/.claude/worktrees/'],
};
