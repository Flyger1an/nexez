import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "apps/seller-mobile/**",
    // Supabase CLI bundles local edge-runtime code under this ignored directory.
    // It is generated vendor output, not application source.
    "supabase/.temp/**",
  ]),
  {
    rules: {
      // Launch lint policy: keep ESLint focused on errors that affect correctness.
      // Nexez intentionally uses dynamic integration payloads, route-test mocks,
      // public crawlable anchors, and effect-driven UI hydration in several flows.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@next/next/no-html-link-for-pages": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/no-unescaped-entities": "off",
      "prefer-const": "warn",
      // Structured-data blocks must escape through lib/safe-json, never by a
      // hand-rolled JSON.stringify. The inline form was copy-pasted across a
      // dozen pages and one copy silently dropped the escape, so the shared
      // helper is now the only sanctioned way to fill dangerouslySetInnerHTML.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name='dangerouslySetInnerHTML'] CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
          message:
            "Use safeJsonScript() from lib/safe-json instead of JSON.stringify inside dangerouslySetInnerHTML.",
        },
      ],
    },
  },
]);

export default eslintConfig;
