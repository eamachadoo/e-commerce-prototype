import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig({
  // Use the new `ignores` property instead of .eslintignore (flat config requirement)
  ignores: ["src/gen/**", "**/*.d.ts"],
  overrides: [
    {
      files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      plugins: { js },
      extends: ["js/recommended"],
      languageOptions: { globals: globals.node }
    },
    { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
    tseslint.configs.recommended,
    pluginReact.configs.flat.recommended,
    // Backend-specific rule overrides: allow CommonJS require() usage and relax unused-vars
    {
      files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
      rules: {
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
      },
      // Ensure react plugin detects the installed React version when linting frontends
      settings: { react: { version: "detect" } }
    }
  ]
});
