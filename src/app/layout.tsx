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

  const judul = `${nama} — ${deskripsi}`;

  return {
    title: {
      default: judul,
      template: `%s | ${nama}`,
    },
    description: deskripsi,
    applicationName: nama,

    // KARTU BAGIKAN, UNTUK SEMUA HALAMAN YANG TIDAK PUNYA MILIKNYA SENDIRI
    //
    // Sebelum ini nol berkas di repo menyetel `openGraph` atau `twitter`.
    // Akibatnya tautan ke situs ini — dibagikan sales lewat WhatsApp, ditempel
    // di grup, dikirim di email — muncul sebagai alamat telanjang tanpa judul
    // dan tanpa keterangan. `/billboard/[slug]` menimpanya dengan foto papan dan
    // harganya; yang di sini adalah dasar untuk beranda, `/about`, dan
    // `/sewakan-tempat`.
    //
    // Nilainya mengikuti pengaturan admin, sama dengan `title` di atas: nama
    // usaha yang diganti di `/admin/settings` juga berubah di kartu bagikan,
    // bukan hanya di tab peramban.
    openGraph: {
      title: judul,
      description: deskripsi,
      siteName: nama,
      type: 'website',
      // `locale` disebut karena seluruh isi situs ini Bahasa Indonesia dan
      // `<html lang="id">` di bawah sudah menyatakannya. Pengambil pratinjau
      // membaca atribut ini, bukan `<html>`.
      locale: 'id_ID',
      // TIDAK ada `images` di sini, dan itu disengaja. Repo ini belum punya satu
      // gambar bagikan yang dirancang untuk keperluan ini, dan menunjuk ke logo
      // kecil atau ke foto pertama yang kebetulan ada akan menghasilkan kartu
      // dengan gambar terpotong atau meregang — lebih buruk daripada kartu teks
      // yang rapi. Tambahkan bersamaan dengan gambarnya, bukan sebelumnya.
    },
    twitter: {
      // `summary`, bukan `summary_large_image`: tanpa gambar, kartu besar
      // dirender sebagai blok kosong dengan teks di bawahnya.
      card: 'summary',
      title: judul,
      description: deskripsi,
    },
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
