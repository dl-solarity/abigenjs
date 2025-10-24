import globals from "globals";

import js from "@eslint/js";
import n from "eslint-plugin-n";

import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,

  // TypeScript rules applied only to TS files
  ...tseslint.configs.recommended,

  // Node environment and Node plugin across repo
  {
    files: ["**/*.{ts,cts,mts}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
    },
    plugins: { n },
    rules: {
      ...n.configs["flat/recommended"].rules,
      // Allow redeclaring built-in globals like `Generator` in CLI files
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },

  // CommonJS sources (CJS/CTS scripts)
  {
    files: ["**/*.cjs", "**/*.cts"],
    languageOptions: {
      sourceType: "commonjs",
    },
    rules: {
      // TS import style rule should not apply to CJS files
      "@typescript-eslint/no-require-imports": "off",
      // Hashbangs are fine in scripts run via node/tsx
      "n/hashbang": "off",
      // Release scripts intentionally use process.exit
      "n/no-process-exit": "off",
    },
  },

  // Allow shebang in the CLI entry file
  {
    files: ["src/index.ts"],
    rules: {
      "n/hashbang": "off",
    },
  },

  // Ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/*.min.js",
      "packages/abigen/src/wasm/**",
      "**/src/abigen/**",
    ],
  },
];
