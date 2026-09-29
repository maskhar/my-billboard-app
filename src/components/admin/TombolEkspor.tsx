// src/components/admin/TombolEkspor.tsx
//
// Tombol unduh CSV untuk daftar admin.
//
// TAUTAN BIASA, BUKAN `fetch` + `URL.createObjectURL`
// --------------------------------------------------
// Unduhan lewat `fetch` menahan SELURUH berkas di memori tab peramban lebih dulu,
// lalu membuat blob kedua untuk mengunduhnya — dua salinan dari berkas yang bisa
// beberapa megabita, di tab yang juga sedang merender tabelnya. Ia juga
// memerlukan `'use client'`, penanganan galat sendiri, dan keadaan "sedang
// mengunduh" yang harus digambar.
//
// `<a href>` biasa menyerahkan seluruh pekerjaan itu kepada peramban: progres,
// pembatalan, penamaan berkas dari `Content-Disposition`, dan penulisan langsung
// ke disk tanpa melewati memori tab. Komponen ini karena itu Server Component
// tanpa satu baris JavaScript yang dikirim.
//
// SARINGAN YANG SEDANG AKTIF IKUT DIBAWA
// --------------------------------------
// `parameter` adalah `kueriAktif` yang sama yang dipakai kotak cari, kepala urut,
// dan navigasi halaman — bukan salinannya. Tombol yang tidak membawanya akan
// mengunduh SELURUH tabel sementara layar menampilkan hasil pencarian, dan
// berkasnya tidak punya satu pun tanda bahwa isinya lebih luas daripada yang
// diminta. Itu jenis kesalahan yang paling sulit ditemukan, karena berkasnya
// terbuka dengan sempurna.
//
// `halaman` TIDAK ikut dibawa, dan itu disengaja: yang diekspor adalah seluruh
// hasil saringan, bukan 25 baris yang sedang tampak. Ekspor sehalaman adalah
// salinan layar yang sudah ada di layar.

import { Download } from 'lucide-react';

export default function TombolEkspor({
  daftar,
  parameter = {},
  label = 'Unduh CSV',
}: {
  /** Nama daftar di `?daftar=` — harus salah satu yang dikenal route ekspor. */
  daftar: 'billboards' | 'orders' | 'users' | 'pengajuan';
  /**
   * Saringan dan urutan yang sedang berlaku (`kueriAktif` halamannya).
   *
   * Nilai kosong dibuang, jadi pemanggil boleh menyerahkan saringan yang sedang
   * tidak aktif tanpa menghasilkan `?q=&urut=`.
   */
  parameter?: Record<string, string | undefined | null>;
  label?: string;
}) {
  // Disusun lewat `URLSearchParams`, bukan template teks: kata kunci pencarian
  // bisa memuat `&` dan `=`, dan yang ditempel apa adanya akan memecah URL-nya
  // menjadi parameter tambahan — sehingga berkas yang terunduh bukan yang diminta.
  const query = new URLSearchParams({ daftar });
  for (const [kunci, nilai] of Object.entries(parameter)) {
    if (nilai === undefined || nilai === null || nilai === '') continue;
    query.set(kunci, String(nilai));
  }

  return (
    <a
      href={`/api/admin/ekspor?${query.toString()}`}
      // `download` TIDAK dipasang, dan itu bukan kelalaian: atribut itu memaksa
      // nama berkas dari sisi klien dan MENGABAIKAN `Content-Disposition` milik
      // server — termasuk tanggal yang sengaja ditaruh di nama berkasnya. Tanpa
      // atribut ini, nama yang dipakai peramban adalah nama yang ditentukan
      // route, satu tempat, dengan tanggalnya utuh.
      className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-utero"
    >
      <Download size={16} aria-hidden="true" />
      {label}
    </a>
  );
}
