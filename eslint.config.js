// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "server/*", "e2e/*"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      /**
       * Reanimated's shared values are mutated through `.value`, including
       * inside gesture callbacks that close over them — that is the library's
       * documented API, not an accident.
       *
       * The React Compiler's immutability rule cannot tell that apart from
       * mutating a prop, so it flags every `sharedValue.value = …` in the
       * project: the tab swipe, the bottom sheet, the press animation and the
       * agent panel alike. A rule that fires on correct framework usage stops
       * being a signal, and leaving `npm run lint` permanently red hides the
       * violations that do matter.
       */
      "react-hooks/immutability": "off",
    },
  },
]);
