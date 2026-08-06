import js from "@eslint/js";
import tseslint from "typescript-eslint";

const policyRules = {
  complexity: ["error", 5],
  "max-lines": ["error", { max: 150, skipBlankLines: true, skipComments: true }],
  "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true }],
  "max-params": ["error", 3],
  "no-empty": ["error", { allowEmptyCatch: false }],
  "no-restricted-syntax": [
    "error",
    {
      selector: "CallExpression[callee.property.name='only']",
      message: "Focused tests must not be committed.",
    },
  ],
};

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", ".pi/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["extensions/permission/**/*.ts"],
    rules: {
      ...policyRules,
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["extensions/permission/**/*.test.ts", "extensions/permission/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // TS control-flow can't track values captured via side-effecting callbacks
      // in test harnesses (e.g. registerCommand(name, def) { captured = def }),
      // so the non-null assertion is the correct tool there, not a double-cast.
      "@typescript-eslint/no-non-null-assertion": "off",
      // Underscore-prefixed names are intentionally unused stub params/fixtures.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // This codebase predates these size limits and its test suite is large.
      // Size limits apply to source; tests are exempt from file/function line
      // caps but still held to the other policy rules (complexity, max-params).
      "max-lines": "off",
      "max-lines-per-function": "off",
    },
  },
);
