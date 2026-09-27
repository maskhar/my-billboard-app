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
  {
    // `no-require-imports` ditujukan ke sumber TypeScript/ESM yang di-bundle.
    // Ketiga kelompok di bawah adalah skrip Node CommonJS asli yang dijalankan
    // langsung, bukan di-bundle: `require` di situ BUKAN cacat, itu satu-satunya
    // cara memuat modul di sana.
    //
    // Sebelum pengecualian ini, aturan itu melapor 71 kali — 71 dari 165 galat
    // lint, semuanya di berkas yang memang tidak bisa diubah. Laporan yang
    // didominasi temuan tidak bisa ditindaklanjuti adalah laporan yang berhenti
    // dibaca, dan galat sungguhan tenggelam di dalamnya.
    files: ["**/*.cjs", "chat-server/**/*.js", "manager.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
