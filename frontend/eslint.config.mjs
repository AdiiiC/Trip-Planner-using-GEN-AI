import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ── Adoption backlog ──────────────────────────────────────────────────────
  // These rules are correct and worth fixing, but they flag pre-existing code.
  // Demoted to warnings so `npm run lint` is a meaningful gate today instead of
  // being switched off entirely. Promote each back to "error" as it is cleared.
  //
  //   react-hooks/set-state-in-effect  (9)  hydrate from localStorage during
  //                                         render or in an event handler, not
  //                                         in an effect that cascades a render
  //   react-hooks/static-components    (1)  component defined inside another
  //                                         component remounts on every render
  //   @typescript-eslint/no-empty-object-type (1)
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
