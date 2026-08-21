import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // design/** holds Claude Design prototype exports, kept byte-identical to the
    // export so they can be re-synced; they are not part of the built app.
    ignores: [".next/**", "node_modules/**", "data/**", ".data/**", "design/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
