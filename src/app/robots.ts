// src/app/robots.ts
//
// Sebelum file ini ada, repo tidak punya `robots.txt` maupun `robots.ts` sama
// sekali, dan hanya dua halaman yang menyetel `robots: noindex` di metadata-nya.
//
// Apa yang SUDAH aman tanpa file ini: `src/middleware.ts` menuntut token untuk
// `/admin`, `/dashboard`, `/checkout`, dan `/invoice`, jadi crawler tidak bisa
// MEMBACA isinya. Yang tersisa adalah kebocoran STRUKTUR: tanpa arahan apa pun,
// mesin pencari tetap boleh merangkak ke alamat-alamat itu, mencatat pola URL
// beserta id pesanan yang pernah bocor di tautan, dan menampilkan hasil
// "halaman login" atas kata kunci nama pelanggan. Halaman invoice juga kerap
// dibagikan lewat tautan; sekali terindeks, alamatnya beredar di luar kendali.
//
// Yang TIDAK dilakukan file ini: robots.txt bukan kontrol akses. Ia arahan
// sukarela yang dipatuhi crawler jujur dan diabaikan yang tidak. Gerbangnya
// tetap middleware plus pemeriksaan kepemilikan di tiap route.

import type { MetadataRoute } from 'next';

/**
 * Jalur yang tidak boleh dirangkak.
 *
 * Sejalan dengan `matcher` di `src/middleware.ts`: setiap area yang menuntut
 * login di sana masuk ke daftar ini. Kalau satu area baru ditambahkan di sana,
 * tambahkan di sini juga — bukan karena akan bocor (middleware menahannya),
 * tetapi agar pola alamatnya tidak ikut terindeks.
 */
const TERLARANG = [
  '/admin',
  '/dashboard',
  '/checkout',
  '/invoice',
  '/pembayaran',
  '/api/',
] as const;

export default function robots(): MetadataRoute.Robots {
  // Baris `sitemap` SENGAJA tidak ada: repo ini belum punya `src/app/sitemap.ts`
  // maupun `public/sitemap.xml`, dan menunjuk ke berkas yang menjawab 404
  // membuat crawler mencatat situs ini sebagai salah konfigurasi. Tambahkan
  // barisnya bersamaan dengan sitemap-nya, bukan sebelumnya.
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...TERLARANG] }],
  };
}
