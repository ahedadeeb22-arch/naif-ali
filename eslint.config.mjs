import js from "@eslint/js";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";

const tsPlugin = Array.isArray(tseslint.plugin) ? tseslint.plugin[0] : tseslint.plugin;

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "node_modules.partial/**",
      "node_modules.partial.bak/**",
      ".tmp-audit/**",
      "*.cjs",
      "next-env.d.ts",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...next,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { React: "readonly" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    settings: {},
    rules: {
      "no-unused-vars": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
