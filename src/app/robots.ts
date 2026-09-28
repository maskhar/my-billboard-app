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
import { originAplikasi } from '@/lib/xendit';

/**
 * Jalur yang tidak boleh dirangkak.
 *
 * Sejalan dengan `matcher` di `src/middleware.ts`: setiap area yang menuntut
 * login di sana masuk ke daftar ini. Kalau satu area baru ditambahkan di sana,
 * tambahkan di sini juga — bukan karena akan bocor (middleware menahannya),
 * tetapi agar pola alamatnya tidak ikut terindeks.
 */
// DIRENDER PER PERMINTAAN, sama alasannya dengan `src/app/sitemap.ts`.
//
// Berkas ini tidak melempar bila `APP_ORIGIN` kosong, jadi build-nya tidak
// gagal — dan itu justru masalahnya: saat build di mesin tanpa `APP_ORIGIN`,
// `robots.txt` dibekukan dalam bentuk TANPA baris `sitemap`, lalu bentuk itu
// yang disajikan selamanya di produksi walaupun variabelnya di sana terisi
// benar. Kegagalannya senyap: tidak ada galat, tidak ada log, hanya sitemap
// yang tidak pernah ditemukan mesin pencari.
export const dynamic = 'force-dynamic';

const TERLARANG = [
  '/admin',
  '/dashboard',
  '/checkout',
  '/invoice',
  '/pembayaran',
  '/api/',
] as const;

export default function robots(): MetadataRoute.Robots {
  // `src/app/sitemap.ts` sekarang ada, jadi barisnya ikut — sesuai catatan yang
  // dulu ada di sini: tambahkan bersamaan dengan sitemap-nya, bukan sebelumnya.
  //
  // Alamatnya absolut karena `robots.txt` dibaca di luar konteks halaman mana
  // pun. Origin-nya dari `originAplikasi()`, sumber yang sama dengan sitemap-nya
  // sendiri: kalau keduanya mengambil dari tempat berbeda, salah satu akan
  // menunjuk ke host yang tidak menjawab dan tidak ada yang memberi tahu.
  //
  // Dibungkus `try`: `originAplikasi()` melempar bila `APP_ORIGIN` belum diisi,
  // dan `robots.txt` yang menjawab 500 membuat crawler berhenti merangkak
  // seluruh situs. Tanpa baris `sitemap` ia masih melakukan tugas utamanya —
  // melarang area yang menuntut login.
  let alamatSitemap: string | undefined;
  try {
    alamatSitemap = `${originAplikasi()}/sitemap.xml`;
  } catch (error) {
    console.error('[robots] APP_ORIGIN belum siap, baris sitemap dilewati:', error);
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...TERLARANG] }],
    ...(alamatSitemap ? { sitemap: alamatSitemap } : {}),
  };
}
