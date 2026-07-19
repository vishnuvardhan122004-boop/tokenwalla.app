// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // Not meaningful in React Native — apostrophes/quotes in <Text> render
      // fine; this rule is a web/HTML (JSX-in-browser) concern.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
