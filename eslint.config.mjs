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
    // `no-unused-vars` dikonfigurasi, bukan dimatikan. Aturan defaultnya tidak
    // punya satu pun pengecualian, sehingga DUA idiom yang memang dibutuhkan
    // kode ini terbaca sebagai cacat — dan satu-satunya cara "membersihkan"
    // laporannya adalah membuang kode yang benar:
    //
    //   1. `ignoreRestSiblings` — `orders/page.tsx` membuang `dpAmount` dengan
    //      `({ dpAmount: _dpAmount, ...trx })`. Pencabutan itu WAJIB: `...trx`
    //      menyalin seluruh kolom pesanan, dan kolom `Decimal` yang lolos ke
    //      Client Component mematikan halamannya saat dirender. Binding itu
    //      memang tidak dipakai — tidak dipakai adalah seluruh maksudnya.
    //   2. `argsIgnorePattern` — `PaymentClient.tsx` menerima
    //      `(_event: XenditFatalErrorEvent)` dan sengaja TIDAK membacanya:
    //      isi event SDK bisa memuat data channel, dan aturan di repo ini
    //      adalah tidak menampilkan maupun mencatatnya. Tipe parameternya tetap
    //      ditulis supaya pembaca berikutnya tahu apa yang tersedia dan bahwa
    //      mengabaikannya adalah keputusan.
    //
    // Awalan `_` tetap wajib. Binding tak terpakai TANPA awalan itu tetap
    // dilaporkan, jadi impor mati dan variabel yang benar-benar terlupakan
    // masih tertangkap.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
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
