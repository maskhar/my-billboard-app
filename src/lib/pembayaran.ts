// src/lib/pembayaran.ts
//
// Satu tempat untuk menjawab: berapa uang yang sudah masuk, berapa sisanya,
// dan kapan sisa itu paling lambat dibayar.
//
// KENAPA HARUS TERPUSAT
// ---------------------
// Sebelum ini jawabannya DITEBAK di beberapa tempat sekaligus, masing-masing
// dengan rumusnya sendiri: `nol(order.dpAmount) ? order.totalPrice : order.dpAmount`
// di api/booking/request-refund, `!nol(dpAmount) && lebihKecil(dpAmount, totalPrice)`
// di api/payment/notify, dan sebuah salinan lagi di BookingCard. Tiga tempat,
// satu aturan tersirat — dan begitu pelunasan sisa DP ada, ketiganya salah
// dengan cara yang sama: pesanan yang sudah lunas penuh tetap dihitung baru
// menyetor DP.
//
// Perhitungan salah pada refund bukan sekadar tampilan: nominal yang keluar ke
// rekening pembeli dihitung dari angka itu.
//
// SATUAN YANG DIPAKAI
// -------------------
// Semua nominal di sini `Prisma.Decimal` — jangan pernah `+ - * < >` padanya
// (lihat catatan panjang di `src/lib/money.ts`).

import { Prisma, PaymentStatus, PaymentTujuan } from '@prisma/client';
import { jumlah, keDecimal, kurang, lebihBesar } from './money';

/** Hari sebelum tanggal tayang saat pelunasan paling lambat diterima. */
export const HARI_TENGGAT_PELUNASAN = 3;

/**
 * Bentuk minimum baris Payment yang dibutuhkan fungsi-fungsi di sini.
 *
 * Sengaja tidak memakai tipe `Payment` milik Prisma secara utuh: dengan begini
 * pemanggil boleh mengambil hanya kolom yang perlu lewat `select`, dan fungsi
 * ini tetap bisa dipakai pada data yang sudah menyeberang ke komponen client
 * (di mana Decimal sudah menjadi number).
 */
export type BarisPembayaran = {
  tujuan: PaymentTujuan;
  status: PaymentStatus;
  jumlah: Prisma.Decimal | number | string;
};

/**
 * Total uang yang benar-benar sudah diterima untuk sebuah pesanan.
 *
 * Hanya baris berstatus PAID yang dihitung. PENDING adalah tagihan yang belum
 * dibayar — memasukkannya berarti menganggap uang sudah masuk hanya karena
 * tautan pembayarannya pernah dibuat.
 *
 * `TAMBAHAN` DIKECUALIKAN, dan ini bagian yang paling mudah salah. Biaya
 * tambahan (`AdditionalCharge`) berada DI LUAR `totalPrice`. Kalau ikut
 * dijumlahkan, sebuah pesanan yang baru menyetor DP tapi sudah membayar biaya
 * tambahan bisa terlihat "lunas" — padahal sisa pokoknya belum masuk sepeser
 * pun. Untuk kebutuhan akuntansi (total uang masuk apa pun jenisnya), pakai
 * `uangMasukSemua`.
 */
export function uangMasuk(payments: BarisPembayaran[]): Prisma.Decimal {
  return jumlah(
    ...payments
      .filter((p) => p.status === PaymentStatus.PAID && p.tujuan !== PaymentTujuan.TAMBAHAN)
      .map((p) => p.jumlah)
  );
}

/**
 * Total uang masuk TERMASUK biaya tambahan.
 *
 * Untuk laporan pendapatan dan rekonsiliasi kas — bukan untuk menghitung sisa
 * tagihan pokok maupun nominal refund.
 */
export function uangMasukSemua(payments: BarisPembayaran[]): Prisma.Decimal {
  return jumlah(
    ...payments.filter((p) => p.status === PaymentStatus.PAID).map((p) => p.jumlah)
  );
}

/**
 * Sisa tagihan pokok: `totalPrice` dikurangi uang yang sudah masuk.
 *
 * Dibatasi minimum 0. Lebih bayar memang mungkin terjadi — webhook pembayaran
 * menerima kelebihan nominal alih-alih menahan pesanan yang uangnya sudah masuk
 * (lihat api/payment/notify) — dan tanpa batas ini sisanya menjadi angka
 * negatif yang tampil di layar pembeli sebagai "Sisa -Rp 50.000".
 */
export function sisaTagihan(
  totalPrice: Prisma.Decimal | number | string,
  payments: BarisPembayaran[]
): Prisma.Decimal {
  const sisa = kurang(totalPrice, uangMasuk(payments));
  return lebihBesar(sisa, 0) ? sisa : new Prisma.Decimal(0);
}

/** Apakah pokok pesanan sudah lunas? */
export function sudahLunas(
  totalPrice: Prisma.Decimal | number | string,
  payments: BarisPembayaran[]
): boolean {
  return keDecimal(sisaTagihan(totalPrice, payments)).isZero();
}

/**
 * Apakah pesanan ini memakai skema DP — yaitu sudah ada uang masuk, tapi belum
 * seluruhnya?
 *
 * Perhatikan bedanya dengan aturan lama `!nol(dpAmount) && dpAmount < totalPrice`:
 * aturan lama membaca RENCANA (kolom `dpAmount` diisi saat pesanan dibuat),
 * sedangkan fungsi ini membaca KENYATAAN. Pesanan yang direncanakan pakai DP
 * lalu dilunasi seluruhnya tidak lagi dianggap "pakai DP" — dan itulah justru
 * yang membuat email dan panel sisa tagihan berhenti menagih uang yang sudah
 * dibayar.
 */
export function masihAdaSisa(
  totalPrice: Prisma.Decimal | number | string,
  payments: BarisPembayaran[]
): boolean {
  return lebihBesar(uangMasuk(payments), 0) && !sudahLunas(totalPrice, payments);
}

/**
 * Tenggat pelunasan: H-3 sebelum tanggal tayang, pada akhir hari.
 *
 * Acuannya `startDate` — tanggal tayang yang dijanjikan — BUKAN `installedAt`.
 * `installedAt` baru terisi setelah pemasangan benar-benar dilakukan, jadi
 * memakainya berarti tenggat pelunasan tidak pernah ada sampai billboard
 * terpasang; padahal uangnya dibutuhkan justru untuk mencetak dan memasang.
 *
 * Dipatok ke akhir hari (23:59:59.999 waktu setempat server) supaya pembeli
 * yang membayar pada pagi hari H-3 tidak dianggap terlambat hanya karena
 * pesanannya dahulu dibuat sore.
 */
export function tenggatPelunasan(startDate: Date): Date {
  const tenggat = new Date(startDate);
  tenggat.setDate(tenggat.getDate() - HARI_TENGGAT_PELUNASAN);
  tenggat.setHours(23, 59, 59, 999);
  return tenggat;
}

/** Apakah tenggat pelunasan sudah terlewat? */
export function tenggatPelunasanLewat(startDate: Date, sekarang: Date = new Date()): boolean {
  return sekarang.getTime() > tenggatPelunasan(startDate).getTime();
}
