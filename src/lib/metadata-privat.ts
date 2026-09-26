// src/lib/metadata-privat.ts
//
// Metadata untuk halaman yang tidak boleh masuk indeks mesin pencari.
//
// `src/app/robots.ts` sudah meminta crawler menjauhi area privat, tetapi
// robots.txt hanya mencegah PERANGKAKAN — bukan pengindeksan. Alamat yang
// ditemukan lewat tautan di tempat lain (pembeli menempelkan tautan invoice di
// forum, di tiket dukungan, di riwayat chat) masih bisa muncul di hasil
// pencarian sebagai judul tanpa isi. Meta tag `noindex` adalah yang menutup
// jalur itu, dan keduanya dibutuhkan bersama.
//
// Ditulis sebagai satu konstanta karena tiga area memakainya; tiga salinan
// literal akan menyimpang begitu salah satunya diubah.

import type { Metadata } from 'next';

/**
 * `robots: noindex, nofollow` — sebar lewat `export const metadata` di layout
 * area privat.
 *
 * `nofollow` ikut karena halaman-halaman ini memuat tautan ke alamat privat
 * lain (invoice, berkas desain di `/uploads/`); merangkak keluar dari sini sama
 * saja memetakan area yang baru saja ditandai terlarang.
 */
export const METADATA_PRIVAT: Metadata = {
  robots: { index: false, follow: false },
};
