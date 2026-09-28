// src/app/layout.tsx
import type { Metadata } from 'next';
import { Providers } from "@/components/Providers"; // Panggil yang baru dibuat
import './globals.css';
import { ambilIdentitasSitus } from '@/lib/identitas-situs';

/**
 * Judul dan keterangan situs, diambil dari pengaturan admin.
 *
 * Sebelum ini layout akar TIDAK punya `metadata` sama sekali. Akibatnya setiap
 * halaman publik yang tidak menyetel metadata sendiri — beranda, daftar
 * billboard, login, register — dikirim tanpa `<title>` dan tanpa
 * `<meta name="description">`. Di tab peramban judulnya menjadi URL mentah, dan
 * di hasil pencarian Google menyusun sendiri judul serta ringkasannya dari isi
 * halaman. Untuk situs yang menjual ruang iklan, itu bagian yang paling tidak
 * boleh diserahkan ke tebakan mesin pencari.
 *
 * `template` membuat halaman yang punya judul sendiri (`/checkout`, `/invoice`,
 * panel admin) tetap memakainya, dengan nama usaha ditempel di belakang.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { nama, deskripsi } = await ambilIdentitasSitus();

  return {
    title: {
      default: `${nama} — ${deskripsi}`,
      template: `%s | ${nama}`,
    },
    description: deskripsi,
    applicationName: nama,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
         {/* BUNGKUS DENGAN PROVIDER AGAR BISA CEK LOGIN DI SEMUA HALAMAN */}
         <Providers>
            {children}
         </Providers>
      </body>
    </html>
  );
}
