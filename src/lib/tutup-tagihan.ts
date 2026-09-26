// src/lib/tutup-tagihan.ts
//
// Menutup tagihan yang tidak akan pernah dibayar, karena pesanannya sudah tutup.
//
// KENAPA PERLU
// ------------
// `PaymentStatus.VOIDED` ada di skema sejak tabel Payment dibuat, dengan
// komentar "dibatalkan sebelum dibayar (mis. pesanannya batal)" — dan sampai
// file ini ada, TIDAK SATU PUN baris kode pernah menulisnya. Akibatnya pesanan
// yang hangus, dibatalkan sendiri pembeli, atau selesai direfund meninggalkan
// baris `Payment` berstatus `PENDING` selamanya: tagihan atas pesanan yang sudah
// tidak berjalan.
//
// Baris seperti itu bukan sekadar sampah. Ia menempati pasangan
// `(bookingId, tujuan)` pada indeks unik bersyarat
// `payment_satu_tagihan_menganggur`, terbaca `tagihanBerikutnya` sebagai tagihan
// yang menunggu dibayar, dan membuat keadaan uang sebuah pesanan tidak bisa
// dibaca apa adanya: `PENDING` seharusnya berarti "menunggu dibayar", bukan
// "menunggu dibayar, kecuali kalau pesanannya sudah batal".
//
// YANG SENGAJA TIDAK DITUTUP
// --------------------------
// Hanya tagihan yang BELUM PERNAH dibukakan checkout yang ditutup
// (`providerSessionId: null`). Baris yang sesinya sudah dibuka mungkin sedang
// menerima uang di sisi gerbang pembayaran pada detik ini, dan webhook hanya
// mencatat uang masuk pada baris yang masih `PENDING` (lihat gerbang
// `status: PENDING` di `pelunasan-webhook.ts`). Menutupnya berarti uang yang
// benar-benar diterima Xendit tidak punya baris yang bisa menampungnya —
// menukar kerapian data dengan uang yang hilang dari pembukuan.
//
// Baris yang karena itu tertinggal memang tetap ada, dan itu disengaja:
// keberadaannya menandai ada sesi pembayaran yang pernah dibuka dan nasibnya
// belum jelas. Menutup sesi di sisi Xendit adalah pekerjaan lain dengan
// panggilan jaringannya sendiri, bukan pekerjaan fungsi ini.

import { PaymentStatus } from '@prisma/client';

/**
 * Bentuk minimum tabel Payment yang dibutuhkan fungsi di bawah.
 *
 * Ditulis sebagai tipe sendiri, bukan tipe Prisma, supaya fungsi ini menerima
 * `prisma` maupun client transaksi (`tx`) — dan bisa diuji tanpa database.
 */
export type TabelPaymentTutup = {
  updateMany(args: unknown): Promise<{ count: number }>;
};

/**
 * Tenggang sebelum tagihan yang sesinya kedaluwarsa benar-benar ditutup.
 *
 * Sesi yang baru saja mati bisa masih menerima uang: bank menyelesaikan
 * transfernya beberapa menit setelah gerbang menyatakan sesinya habis. Jarak ini
 * membuat penyapu tidak berlomba dengan webhook yang sedang berjalan.
 *
 * Bukan jaminan, dan tidak perlu menjadi jaminan: sejak webhook MENCATAT uang
 * yang masuk ke tagihan tertutup lalu menandainya untuk ditinjau admin
 * (`TAGIHAN_SUDAH_DITUTUP` di `pelunasan-webhook.ts`), tagihan yang ditutup
 * terlalu cepat tidak lagi membuat uang hilang dari pembukuan. Tenggang ini
 * hanya mengurangi jumlah setoran yang perlu ditinjau manusia.
 */
export const TENGGANG_SAPU_TAGIHAN_MS = 15 * 60 * 1000;

/**
 * Tutup (`EXPIRED`) tagihan yang sesi pembayarannya sudah kedaluwarsa.
 *
 * KENAPA PERLU, DAN APA YANG MACET TANPA INI
 * ------------------------------------------
 * Baris `PENDING` yang `providerSessionId`-nya terisi tidak pernah dibereskan
 * siapa pun kecuali pembeli itu sendiri kembali menekan Bayar — di situ
 * `tutupLaluBukaUlang` di `sesi-pembayaran.ts` menutupnya lalu membuat
 * penggantinya. Pembeli yang tidak pernah kembali meninggalkannya selamanya, dan
 * baris itu:
 *
 * 1. menempati pasangan `(bookingId, tujuan)` pada indeks unik bersyarat
 *    `payment_satu_tagihan_menganggur`, sehingga tagihan pengganti dengan tujuan
 *    yang sama tidak bisa dibuat sama sekali;
 * 2. membuat `add-charge` menolak 409 "pembeli sedang membayar" untuk SELAMANYA
 *    pada pesanan itu, karena gerbangnya membaca `providerSessionId` yang terisi
 *    sebagai bukti ada sesi hidup — padahal sesinya sudah mati berbulan-bulan;
 * 3. terbaca `tagihanBerikutnya` sebagai tagihan yang menunggu dibayar dengan
 *    nominal yang mungkin sudah tidak berlaku.
 *
 * `EXPIRED`, BUKAN `VOIDED`. Keduanya sama-sama "tidak akan dibayar", tapi
 * sebabnya berbeda dan bedanya terbaca di pembukuan: `VOIDED` berarti
 * pesanannya yang tutup (`tutupTagihanMenganggur`), `EXPIRED` berarti hanya
 * sesinya yang mati sementara pesanannya masih berjalan dan masih boleh
 * dibukakan tagihan baru.
 *
 * Aman dijalankan berulang: baris yang sudah tidak `PENDING` tidak ikut tersapu.
 *
 * @param bookingId Bila diisi, hanya menyapu tagihan pesanan itu.
 * @returns jumlah tagihan yang ditutup.
 */
export async function sapuTagihanKedaluwarsa(
  tx: { payment: TabelPaymentTutup },
  sekarang: Date = new Date(),
  bookingId?: string
): Promise<number> {
  const batas = new Date(sekarang.getTime() - TENGGANG_SAPU_TAGIHAN_MS);

  const { count } = await tx.payment.updateMany({
    where: {
      status: PaymentStatus.PENDING,
      // `expiresAt: null` TIDAK ikut tersapu, dan itu bukan kelalaian: nilainya
      // null pada tagihan yang belum pernah dibukakan checkout — kewajiban yang
      // masih sah menunggu pembeli, bukan sesi yang mati. Yang null karena
      // pesanannya tutup ditangani `tutupTagihanMenganggur`.
      expiresAt: { not: null, lt: batas },
      ...(bookingId ? { bookingId } : {}),
    },
    data: {
      status: PaymentStatus.EXPIRED,
      // Alasan sama seperti `tutupTagihanMenganggur`: lease yang tertinggal
      // membuat baris tertutup masih terlihat "sedang dikerjakan".
      sesiClaimToken: null,
      sesiClaimedAt: null,
      sesiClaimExpiresAt: null,
    },
  });

  return count;
}

/**
 * Tutup (`VOIDED`) semua tagihan menganggur milik pesanan-pesanan ini.
 *
 * HARUS dipanggil di dalam transaksi yang sama dengan penulisan yang menutup
 * pesanannya. Kalau tidak, ada jendela waktu di mana pesanan sudah `CANCELLED`
 * sementara tagihannya masih `PENDING`, dan pembaca yang datang di tengah
 * jendela itu melihat keadaan yang tidak pernah dimaksudkan ada — termasuk
 * pembuat sesi pembayaran, yang akan membukakan checkout untuk pesanan batal.
 *
 * @returns jumlah tagihan yang ditutup.
 */
export async function tutupTagihanMenganggur(
  tx: { payment: TabelPaymentTutup },
  bookingIds: readonly string[]
): Promise<number> {
  if (bookingIds.length === 0) return 0;

  const { count } = await tx.payment.updateMany({
    where: {
      bookingId: { in: [...bookingIds] },
      status: PaymentStatus.PENDING,
      // Lihat catatan di kepala file: baris yang checkout-nya pernah dibuka
      // ditinggalkan apa adanya supaya uang yang mungkin sedang masuk tetap
      // punya tempat tercatat.
      providerSessionId: null,
    },
    data: {
      status: PaymentStatus.VOIDED,
      // Lease pembuatan sesi ikut dilepas. Membiarkannya berarti baris yang
      // sudah tertutup masih terlihat "sedang dikerjakan" oleh pencarian claim
      // macet di `sesi-pembayaran.ts`.
      sesiClaimToken: null,
      sesiClaimedAt: null,
      sesiClaimExpiresAt: null,
    },
  });

  return count;
}
