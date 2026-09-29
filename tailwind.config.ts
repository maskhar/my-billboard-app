// tailwind.config.ts
import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// ANIMASI MASUK: 24 KELAS YANG SELAMA INI TIDAK MENGHASILKAN CSS APA PUN
// --------------------------------------------------------------------
// Tujuh berkas memakai `animate-in`, `fade-in`, `zoom-in`, dan
// `slide-in-from-*` — kelas milik plugin `tailwindcss-animate`. Plugin itu
// TIDAK terpasang (`plugins: []`, dan tidak ada di `package.json`), jadi
// Tailwind tidak mengenali satu pun nama itu dan tidak menuliskan aturan
// apa-apa untuknya.
//
// Kelas yang tidak dikenal BUKAN galat build. Tailwind melewatinya tanpa
// keluhan, kelasnya tetap tercetak di atribut `class` di HTML, dan tidak ada
// yang menunjukkan bahwa ia kosong. Itu sebabnya ini bertahan: di layar
// hasilnya hanya "modalnya muncul begitu saja" — yang mudah dikira memang
// begitu desainnya, bukan animasi yang hilang.
//
// Kelas `duration-300` dan `duration-500` di sebelahnya BUKAN bagian dari
// plugin itu (keduanya utilitas Tailwind bawaan untuk `transition-duration`),
// jadi keduanya tetap menghasilkan CSS — tanpa animasi yang dijalankan.
//
// KENAPA DIDEFINISIKAN DI SINI, BUKAN DENGAN MEMASANG PLUGIN-NYA
// --------------------------------------------------------------
// Memasang `tailwindcss-animate` berarti menambah dependensi di
// `package.json`, dan berkas itu tidak ikut di-stage pada fase ini. Ketiga
// keyframe di bawah ditulis langsung — hanya sub-kumpulan yang benar-benar
// dipakai repo ini, bukan seluruh permukaan plugin.
//
// `prefers-reduced-motion: reduce` DIIKUTKAN ke dalam `.animate-in` sendiri.
// Dua pemanggil (`Konfirmasi.tsx`) sudah menuliskan awalan `motion-safe:`, tapi
// sebelas pemanggil lainnya tidak. Menghormati setelan itu tidak boleh
// bergantung pada setiap pemanggil mengingatnya.
//
// `duration-*` DI SEBELAH `animate-in` TIDAK MENGATUR PANJANG ANIMASI
// -------------------------------------------------------------------
// Empat pemanggil menulis `animate-in ... duration-300` atau `duration-500`,
// dan bentuk itu terbaca seolah mengatur animasinya. Tidak: `duration-*`
// bawaan Tailwind hanya menulis `transition-duration`, properti untuk
// `transition`, bukan `animation`. Berapa pun angkanya, animasi di bawah tetap
// berjalan pada durasi bakunya.
//
// Karena itu ada utilitas terpisah `durasi-masuk-*` yang menulis
// `--utero-durasi`. Nama Indonesianya disengaja: seandainya bernama
// `duration-*` ia akan bertabrakan dengan utilitas bawaan Tailwind, dan yang
// menang tergantung urutan pemuatan — persis jenis kebingungan yang membuat
// cacat ini bertahan. Pemanggil yang sudah ada dibiarkan memakai durasi baku;
// `duration-*` yang menempel di sana tidak dihapus karena beberapa di antaranya
// juga mengatur `transition` pada elemen yang sama (`hover:scale-110`).
const animasiMasuk = plugin(({ addUtilities, matchUtilities, theme }) => {
  addUtilities({
    '@keyframes utero-masuk': {
      from: {
        opacity: 'var(--utero-opasitas-awal, 1)',
        transform:
          'translate3d(var(--utero-geser-x, 0), var(--utero-geser-y, 0), 0) scale3d(var(--utero-skala, 1), var(--utero-skala, 1), 1)',
      },
    },

    // Nilai bakunya sengaja singkat: animasi masuk yang panjang menahan
    // perhatian pada gerakannya, bukan pada isi dialognya. Pemanggil yang
    // butuh lain menimpanya dengan `duration-*`.
    '.animate-in': {
      animationName: 'utero-masuk',
      animationDuration: 'var(--utero-durasi, 150ms)',
      animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      animationFillMode: 'both',
      '@media (prefers-reduced-motion: reduce)': {
        animation: 'none',
      },
    },

    '.fade-in': { '--utero-opasitas-awal': '0' },
    '.zoom-in': { '--utero-skala': '0.95' },
  });

  // `fade-in-0`, `zoom-in-95`, `slide-in-from-bottom-4`: angka di belakang
  // nama adalah bagian dari sintaksis plugin aslinya, dan tiga pemanggil
  // memakainya (`zoom-in-95`, `slide-in-from-bottom-4`,
  // `slide-in-from-bottom-10`). Tanpa varian berangka ini, ketiganya tetap
  // kelas kosong seperti sebelumnya.
  matchUtilities(
    { 'fade-in': (nilai) => ({ '--utero-opasitas-awal': String(Number(nilai) / 100) }) },
    { values: { 0: '0', 5: '5', 10: '10', 20: '20', 50: '50' } }
  );

  matchUtilities(
    { 'zoom-in': (nilai) => ({ '--utero-skala': String(Number(nilai) / 100) }) },
    { values: { 50: '50', 75: '75', 90: '90', 95: '95' } }
  );

  // Arah geser memakai skala spasi Tailwind, sama seperti plugin aslinya,
  // supaya `slide-in-from-bottom-4` berarti 1rem — bukan angka yang hanya
  // berlaku di berkas ini.
  const jarak = theme('spacing') as Record<string, string>;

  matchUtilities(
    {
      'slide-in-from-top': (nilai) => ({ '--utero-geser-y': `-${nilai}` }),
      'slide-in-from-bottom': (nilai) => ({ '--utero-geser-y': nilai }),
      'slide-in-from-left': (nilai) => ({ '--utero-geser-x': `-${nilai}` }),
      'slide-in-from-right': (nilai) => ({ '--utero-geser-x': nilai }),
    },
    { values: jarak }
  );

  // `slide-in-from-bottom` TANPA angka dipakai di `SearchFilter.tsx:80` —
  // panel filter yang naik dari dasar layar. Plugin aslinya tidak punya
  // bentuk tanpa angka itu, jadi kelas tersebut kosong di sana bahkan
  // seandainya plugin-nya terpasang. Diberi nilai baku `100%` supaya panelnya
  // benar-benar naik dari luar layar, bukan bergeser sedikit.
  addUtilities({
    '.slide-in-from-bottom': { '--utero-geser-y': '100%' },
    '.slide-in-from-top': { '--utero-geser-y': '-100%' },
  });

  // Panjang animasi masuk. Lihat catatan di atas: `duration-*` bawaan Tailwind
  // TIDAK mengaturnya.
  matchUtilities(
    { 'durasi-masuk': (nilai) => ({ '--utero-durasi': nilai }) },
    { values: theme('transitionDuration') as Record<string, string> }
  );
});

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ini Warna Branding Utero (Merah)
        utero: {
          DEFAULT: '#ce181e',
          hover: '#a61318' // Merah lebih gelap untuk efek hover
        }
      }
    },
  },
  plugins: [animasiMasuk],
};
export default config;
