// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Both are generated, not authored: dist/ by the web export and
    // .expo/types by expo-router's typed-routes codegen.
    ignores: ['dist/*', '.expo/*', '.claude/**'],
  },
  {
    rules: {
      // Not meaningful in React Native — apostrophes/quotes in <Text> render
      // fine; this rule is a web/HTML (JSX-in-browser) concern.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
