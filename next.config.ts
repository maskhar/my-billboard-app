// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. SOLUSI PETA CRASH: Matikan Strict Mode
  reactStrictMode: false, 

  // 2. SOLUSI GAMBAR: Izinkan akses ke Unsplash & Google
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'assets.website-files.com',
      }
    ],
  },
  
  // `typescript.ignoreBuildErrors: true` DIBUANG.
  //
  // Selama flag itu menyala, `next build` berhasil walaupun kodenya tidak
  // ter-typecheck. Yang tersembunyi di baliknya bukan "warning kecil": satu
  // galat nyata di `prisma/seed.ts` — `status: "Available"` bertipe `string`,
  // bukan `BillboardStatus` — hidup di sana tanpa terlihat, bersama enam galat
  // deklarasi ganda di `prisma/seed.ts`/`prisma/set-admin.ts` yang membuat
  // `npx tsc --noEmit` selalu merah. Gerbang yang selalu merah adalah gerbang
  // yang berhenti dibaca orang, dan build yang lolos apa pun isinya adalah
  // build yang tidak menjaga apa-apa.
  //
  // Ketujuhnya sudah dibereskan, `tsc` bersih, jadi gerbangnya dinyalakan.
  // Bila nanti ada galat tipe baru, build gagal — itu memang gunanya.
  //
  // Blok `eslint: { ignoreDuringBuilds: true }` juga dibuang, tapi karena
  // alasan berbeda: Next 16 tidak lagi menjalankan ESLint saat build dan tidak
  // lagi mengenal kunci itu. Ia bukan sekadar tidak berguna — ia GALAT TIPE
  // (TS2353) di berkas konfigurasi ini sendiri. Linting sekarang dijalankan
  // lewat `npm run lint`.
};

export default nextConfig;