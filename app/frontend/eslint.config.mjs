import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Custom Memento ESLint rules for Windows deployment safety
import mementoPlugin from "./eslint-rules/index.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Custom Memento rules
  {
    plugins: {
      memento: mementoPlugin,
    },
    rules: {
      // #3 — Block raw process.env in invoke() payloads
      // Forces use of isDesktopProductionMode() helper
      "memento/no-raw-process-env-invoke": "error",
    },
  },
]);

export default eslintConfig;
