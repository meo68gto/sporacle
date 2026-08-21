import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

// Claude Design export artifacts under design/. These are kept byte-identical to
// the export so the project can be re-synced, so they cannot be edited to satisfy
// lint rules. Scoped to the export's own shapes rather than all of design/ so that
// anything hand-written added there later is still linted.
const designExportArtifacts = [
  "design/**/*.dc.html",
  "design/support.js",
  "design/_ds/**",
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "data/**",
      ".data/**",
      ...designExportArtifacts,
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
