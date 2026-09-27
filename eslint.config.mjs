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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // `.claude/worktrees/` berisi SALINAN LENGKAP repo ini. Tanpa pola di bawah
    // `eslint` tanpa argumen melintasinya dan melaporkan setiap temuan dua kali
    // — 140 galat dari berkas yang bahkan tidak ter-track Git (`.claude/` ada di
    // `.gitignore`). Laporan yang isinya separuh gaung tidak bisa dipakai
    // sebagai gerbang.
    ".claude/**",
  ]),
]);

export default eslintConfig;
