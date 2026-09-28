// src/lib/sapu-token-reset.ts
//
// Menghapus baris `PasswordResetToken` yang sudah lama tidak berguna.
//
// KENAPA FILE INI ADA
// -------------------
// Migrasi `20260929090000_token_reset_sandi` membuat indeks `[expiresAt]` dengan
// komentar "penyapu token kedaluwarsa" — dan penyapunya tidak pernah ditulis.
// Indeks yang dibuat untuk pembaca yang tidak ada adalah biaya tulis pada setiap
// penerbitan tautan tanpa satu pun manfaat.
//
// Tanpa penyapu, tabel ini hanya bertambah. Tiga permintaan per email per jam
// dikali seluruh pengguna, selamanya, untuk baris yang tidak bisa lagi ditukar
// oleh siapa pun. Bukan bencana, tapi ia menumpuk di tempat yang paling tidak
// enak: tabel kredensial. Yang menumpuk di sana adalah daftar historis
// "siapa saja yang pernah minta reset", dan daftar itu tidak perlu abadi.
//
// KENAPA HAPUS, PADAHAL `usedAt` SENGAJA TIDAK MENGHAPUS
// -----------------------------------------------------
// Dua hal yang berbeda. Komentar di skema menolak penghapusan sebagai cara
// menegakkan SEKALI PAKAI: baris yang dihapus tidak bisa membedakan "token belum
// pernah ada" dari "token sudah dipakai", jadi penukar wajib membaca `usedAt`
// pada baris yang masih ada. Itu tetap berlaku utuh — penyapu ini hanya
// menyentuh baris yang kedaluwarsanya sudah jauh lewat, dan baris seperti itu
// ditolak `tokenMasihBisaDipakai` dengan alasan yang sama, ada atau tidak.
//
// TENGGANG 30 HARI, BUKAN LANGSUNG
// --------------------------------
// Baris yang `usedAt`-nya terisi adalah satu-satunya jejak bahwa sandi sebuah
// akun pernah diganti lewat email, beserta `asalIp` peminta. Itu yang dibaca
// saat pemilik akun melaporkan "akun saya diambil orang". Menghapusnya pada jam
// yang sama dengan kedaluwarsanya berarti pertanyaan itu tidak bisa dijawab
// sama sekali, dan pertanyaannya hampir selalu datang beberapa hari kemudian.
//
// Tenggang dihitung dari `expiresAt`, bukan `createdAt`: keduanya hanya berjarak
// satu jam, dan `expiresAt` yang punya indeksnya.

import { prisma } from '@/lib/prisma';

/**
 * Bentuk minimum tabel yang dibutuhkan fungsi di bawah.
 *
 * Ditulis sebagai tipe sendiri, bukan tipe Prisma, dengan alasan yang sama
 * seperti `TabelPaymentTutup` di `src/lib/tutup-tagihan.ts`: fungsi ini menerima
 * `prisma` maupun client transaksi, dan bisa diuji tanpa database.
 */
export type TabelTokenReset = {
  deleteMany(args: unknown): Promise<{ count: number }>;
};

/**
 * Berapa lama baris token disimpan setelah kedaluwarsa.
 *
 * Bukan angka keamanan — token sudah tidak bisa ditukar sejak `expiresAt` lewat,
 * apa pun isi tabelnya. Ini murni jendela jejak sengketa.
 */
export const TENGGANG_SIMPAN_TOKEN_RESET_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Hapus baris token yang kedaluwarsanya sudah lewat lebih dari tenggang simpan.
 *
 * Aman dijalankan berulang dan aman dijalankan bersamaan: `deleteMany` dengan
 * syarat waktu tidak punya baris "setengah terhapus", dan baris yang sudah
 * hilang tidak dihitung dua kali.
 *
 * Yang MASIH BERLAKU tidak pernah tersentuh, dan itu syaratnya yang penting:
 * menghapus baris yang belum kedaluwarsa berarti mematikan tautan yang sedang
 * berada di kotak masuk seseorang, dan orang itu akan mengira sistemnya rusak.
 *
 * @param tabel Tabel `passwordResetToken`; defaultnya client Prisma global.
 * @param sekarang Waktu acuan, bisa diisi di test.
 * @returns jumlah baris yang terhapus.
 */
export async function sapuTokenResetKedaluwarsa(
  tabel: TabelTokenReset = prisma.passwordResetToken,
  sekarang: Date = new Date()
): Promise<number> {
  const batas = new Date(sekarang.getTime() - TENGGANG_SIMPAN_TOKEN_RESET_MS);

  const { count } = await tabel.deleteMany({
    where: { expiresAt: { lt: batas } },
  });

  return count;
}
