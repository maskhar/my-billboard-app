// src/app/reset-password/page.tsx
//
// Tujuan tautan yang dikirim lewat email. Tokennya ada di query string.
//
// SERVER COMPONENT, BUKAN `useSearchParams`
// -----------------------------------------
// Token dibaca di sini lalu diserahkan sebagai prop ke formulirnya. Dua
// alasannya:
//
//   1. `useSearchParams` di komponen client wajib berada di dalam batas
//      `<Suspense>` saat Next merender halaman ini di luar permintaan, dan
//      melupakannya menggagalkan `next build` — bukan runtime, jadi cacatnya
//      baru muncul saat rilis.
//   2. Halaman ini butuh `metadata`, dan `metadata` tidak bisa diekspor dari
//      berkas `'use client'`. Yang dibutuhkannya bukan sekadar judul — lihat
//      `referrer` di bawah.
//
// KENAPA `referrer: 'no-referrer'`
// --------------------------------
// Token ada di URL, dan URL ikut terkirim sebagai header `Referer` pada setiap
// permintaan yang berangkat dari halaman ini — termasuk ke host lain. Navbar di
// halaman ini memuat tautan keluar, dan satu klik sudah cukup untuk menyerahkan
// tautan reset yang masih bisa ditukar kepada pihak ketiga, di dalam log
// server mereka. `no-referrer` menutupnya untuk seluruh halaman.
//
// `noindex` ikut lewat `METADATA_PRIVAT`: alamat dengan token tidak boleh masuk
// indeks mesin pencari.

import type { Metadata } from 'next';
import { METADATA_PRIVAT } from '@/lib/metadata-privat';
import FormResetSandi from './FormResetSandi';

export const metadata: Metadata = {
  ...METADATA_PRIVAT,
  title: 'Atur Ulang Sandi',
  referrer: 'no-referrer',
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  // Sejak Next 16 `searchParams` adalah Promise dan wajib di-`await`. Dibaca
  // langsung dari objeknya, nilainya SELALU `undefined` — dan di halaman ini
  // akibatnya adalah setiap pemilik tautan yang sah diberi tahu tautannya rusak.
  searchParams?: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;

  // `?token=a&token=b` membuat Next memberi array. Yang seperti itu tidak pernah
  // kami terbitkan, jadi diperlakukan sebagai tidak ada — mengambil elemen
  // pertamanya berarti menerima bentuk yang tidak pernah kami kirim.
  const token = typeof params?.token === 'string' ? params.token : '';

  // Bentuk token TIDAK diperiksa di sini. Yang berwenang menilainya adalah
  // `bentukTokenSah` di route penukar, dan halaman ini memeriksanya sekali lagi
  // hanya akan menjadi salinan kedua dari aturan yang sama — yang bisa menyimpang.
  // Yang dibedakan di sini hanyalah "tidak ada token sama sekali", karena itu
  // menentukan formulirnya dirender atau tidak.
  return <FormResetSandi token={token} />;
}
