// src/lib/revenue.ts
//
// Satu definisi untuk pertanyaan "pesanan ini uangnya sudah masuk atau belum?".
//
// Sebelumnya pertanyaan itu dijawab tiga kali di tiga berkas, dan ketiganya
// menjawab berbeda:
//
//   admin/(dashboard)/page.tsx     → PAID_CONFIRMED, ACTIVE, REFUNDED
//   admin/(dashboard)/actions.ts   → PAID_CONFIRMED, ACTIVE, REFUNDED
//   admin/.../users/UserClientPage → ACTIVE, REFUNDED
//   dashboard/DashboardWrapper.tsx → ACTIVE, REFUNDED
//
// Akibatnya kartu "Total Omzet", grafik omzet, "Total Spending" per pelanggan,
// dan "Total Pengeluaran" di dashboard pelanggan menampilkan empat angka yang
// tidak pernah bisa dicocokkan satu sama lain — padahal keempatnya mengaku
// menjumlahkan hal yang sama. Sekarang semuanya memanggil fungsi di sini, jadi
// perubahan definisi cukup dilakukan di satu tempat dan otomatis konsisten.
//
// DUA KESALAHAN YANG DIPERBAIKI OLEH DEFINISI DI BAWAH
// ----------------------------------------------------
// 1. REFUNDED ikut dihitung sebagai pendapatan. Uangnya sudah dikembalikan ke
//    pelanggan, tapi tetap ditambahkan ke omzet — jadi omzet yang dilihat
//    pemilik usaha selalu lebih besar dari uang yang benar-benar ada, persis
//    sebesar total seluruh refund yang pernah terjadi. Setiap refund justru
//    menaikkan angka yang seharusnya diturunkannya.
//
// 2. Tahap tengah alur produksi terlewat. Urutan status sebuah pesanan adalah
//    PENDING_PAYMENT → PAID_CONFIRMED → DESIGN_RECEIVED → IN_PRODUCTION →
//    INSTALLATION → ACTIVE. Pesanan pada tiga status di tengah itu SUDAH
//    dibayar — pembayarannya justru syarat untuk masuk ke sana. Karena dulu
//    hanya PAID_CONFIRMED dan ACTIVE yang dihitung, omzet sebuah pesanan
//    menghilang dari laporan begitu desainnya masuk, dan baru muncul kembali
//    berminggu-minggu kemudian saat pesanan tayang. Pemilik usaha melihat
//    omzet turun tepat ketika pekerjaannya sedang paling ramai.

// `import type`, bukan impor biasa.
//
// Berkas ini dipakai juga oleh UserClientPage.tsx yang bertanda 'use client'.
// Mengimpor `BookingStatus` sebagai NILAI akan menyeret paket @prisma/client
// ikut masuk ke bundel browser — paket server yang tidak bisa berjalan di
// sana. Dengan `import type`, nama itu hilang sepenuhnya saat kompilasi:
// TypeScript tetap memeriksa bahwa setiap teks di bawah benar-benar anggota
// enum, tapi tidak ada satu pun kode Prisma yang ikut terkirim ke browser.
import type { BookingStatus } from '@prisma/client';

/**
 * Status pesanan yang uangnya sudah diterima dan belum dikembalikan.
 *
 * Yang sengaja TIDAK masuk daftar ini:
 *
 *   PENDING_PAYMENT  — belum ada uang yang masuk sama sekali.
 *   CANCELLED        — batal sebelum dibayar.
 *   REFUNDED         — uangnya sudah keluar lagi ke rekening pelanggan.
 *   REVIEW_REFUND,
 *   WAITING_BANK,
 *   PROCESS_REFUND   — refund sedang berjalan. Uangnya memang masih ada di
 *                      rekening perusahaan hari ini, tapi sudah dipastikan
 *                      akan keluar. Menghitungnya sebagai pendapatan berarti
 *                      omzet naik lalu turun lagi tanpa ada penjualan baru.
 *                      Bila pemilik usaha lebih suka angka kas apa adanya,
 *                      ketiganya cukup ditambahkan di sini — dan seluruh
 *                      halaman ikut berubah bersamaan.
 */
export const STATUS_PENDAPATAN: readonly BookingStatus[] = [
  'PAID_CONFIRMED',
  'DESIGN_RECEIVED',
  'IN_PRODUCTION',
  'INSTALLATION',
  'ACTIVE',
] as const;

/**
 * Apakah pesanan berstatus ini boleh dihitung sebagai uang masuk?
 *
 * Menerima `string` supaya tetap bisa dipakai pada data yang sudah
 * diserialisasi untuk komponen client — di sana tipe enum Prisma sering
 * sudah luruh menjadi teks biasa. Nilai di luar daftar, termasuk status
 * asing yang tidak dikenal, dijawab `false`: lebih baik omzet kurang
 * sedikit daripada melaporkan uang yang tidak pernah diterima.
 */
export function isRevenueStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (STATUS_PENDAPATAN as readonly string[]).includes(status);
}

/**
 * Potongan `where` siap pakai untuk query Prisma.
 *
 * Dipakai supaya penyaringan di sisi database memakai daftar yang sama persis
 * dengan penyaringan di sisi JavaScript. Dulu keduanya ditulis terpisah, dan
 * itulah cara ketiga definisi berbeda tadi bisa muncul tanpa ketahuan.
 *
 * Hanya untuk kode server — `prisma` tidak tersedia di browser.
 */
export function wherePendapatan(): { status: { in: BookingStatus[] } } {
  // Sengaja sebuah fungsi yang membuat salinan baru, bukan objek tetap.
  //
  // Dua sebab. Pertama, tipe `where` Prisma menuntut array yang bisa diubah,
  // sedangkan `STATUS_PENDAPATAN` sengaja `readonly` agar tidak ada pemanggil
  // yang diam-diam menambah status ke daftar bersama ini. Kedua, objek yang
  // dipakai bersama antar-query berisiko ikut termodifikasi saat disebar
  // dengan `...` lalu ditimpa — salinan baru membuat tiap query berdiri
  // sendiri.
  return { status: { in: [...STATUS_PENDAPATAN] } };
}
