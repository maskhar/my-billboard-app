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

import { BookingStatus, Prisma, PaymentStatus, PaymentTujuan } from '@prisma/client';
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

/**
 * Sisa biaya tambahan yang belum dibayar.
 *
 * `AdditionalCharge` adalah daftar tagihan, `Payment` bertujuan TAMBAHAN adalah
 * daftar pembayarannya. Tidak ada kolom di skema yang menghubungkan keduanya
 * baris-per-baris — dan memang tidak perlu ada: yang ditagihkan kepada pembeli
 * adalah SELISIHNYA, satu angka.
 *
 * Ditahan di nol dengan alasan yang sama seperti `sisaTagihan`: kelebihan bayar
 * mungkin terjadi, dan "Sisa -Rp 50.000" bukan kalimat yang bisa dibaca siapa
 * pun. Rumus ini sebelumnya ditulis ulang di halaman transaksi admin dan di
 * invoice; dua salinan dari satu aturan adalah dua tempat yang bisa menyimpang.
 */
export function sisaTambahan(
  charges: { amount: Prisma.Decimal | number | string }[],
  payments: BarisPembayaran[]
): Prisma.Decimal {
  const ditagihkan = jumlah(...charges.map((c) => c.amount));
  const dibayar = jumlah(
    ...payments
      .filter((p) => p.status === PaymentStatus.PAID && p.tujuan === PaymentTujuan.TAMBAHAN)
      .map((p) => p.jumlah)
  );
  const sisa = kurang(ditagihkan, dibayar);
  return lebihBesar(sisa, 0) ? sisa : new Prisma.Decimal(0);
}

/**
 * Sisa waktu paling sedikit yang membuat sesi pembayaran masih layak dibuka.
 *
 * Sesi yang hanya berumur beberapa detik tidak berguna: pembeli baru selesai
 * mengisi kartu ketika sesinya sudah mati. Di bawah ambang ini lebih jujur
 * mengatakan tenggatnya habis.
 */
export const SISA_WAKTU_MIN_MS = 2 * 60 * 1000;

/**
 * Status pesanan yang masih boleh menerima pembayaran lanjutan (pelunasan sisa
 * pokok dan biaya tambahan).
 *
 * Daftar ini SENGAJA tidak diturunkan dari `TRANSISI_SAH`. Pelunasan tidak
 * memindahkan status pesanan ke mana pun, jadi tidak ada transisi yang bisa
 * dijadikan acuan; yang ditanyakan di sini adalah pertanyaan lain — apakah
 * pesanan ini masih berjalan.
 *
 * Yang dikecualikan, dan alasannya: `REVIEW_REFUND`, `WAITING_BANK`, dan
 * `PROCESS_REFUND` adalah pesanan yang uangnya sedang dihitung untuk
 * dikembalikan — menerima setoran baru di tengahnya membuat nominal refund yang
 * sudah disetujui admin tidak lagi cocok dengan uang yang masuk. `REFUNDED` dan
 * `CANCELLED` sudah tutup: uang yang masuk ke pesanan tutup tidak punya
 * kewajiban yang bisa dilunasinya.
 */
export const STATUS_BOLEH_BAYAR_LANJUTAN: readonly BookingStatus[] = [
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.PAID_CONFIRMED,
  BookingStatus.DESIGN_RECEIVED,
  BookingStatus.IN_PRODUCTION,
  BookingStatus.INSTALLATION,
  BookingStatus.ACTIVE,
];

/**
 * Apakah tagihan ini pembayaran LANJUTAN pada pesanan yang sudah berjalan?
 *
 * Satu predikat untuk dua keputusan yang harus sepakat: aturan kelayakan
 * (`periksaKelayakanSesi`) dan penjepitan umur sesi (`tenggatSesi` di
 * `sesi-pembayaran.ts`). Kalau keduanya menulis syaratnya sendiri, suatu saat
 * yang satu menganggap pelunasan lanjutan dan yang lain tidak — dan hasilnya
 * sesi yang lolos gerbang lalu langsung mati karena dijepit tenggat 24 jam yang
 * sudah lewat.
 */
export function bayarLanjutan(tujuan: PaymentTujuan): boolean {
  return tujuan === PaymentTujuan.PELUNASAN || tujuan === PaymentTujuan.TAMBAHAN;
}

export type KelayakanSesi =
  | { boleh: true }
  | { boleh: false; status: number; kode: string; pesan: string };

/**
 * Bolehkah tagihan ini dibukakan sesi pembayaran sekarang?
 *
 * Aturannya berbeda menurut tujuan tagihan, dan perbedaannya bukan detail kecil:
 *
 * - `DP`/`FULL` adalah pembayaran PERTAMA. Pesanannya masih menahan tanggal
 *   tayang tanpa satu rupiah pun masuk, jadi ia hidup di bawah tenggat 24 jam
 *   (`Booking.expiresAt`) dan sesi tidak boleh hidup melampauinya — kalau boleh,
 *   pembeli bisa membayar pesanan yang tanggalnya sudah dilepas ke orang lain.
 *
 * - `PELUNASAN`/`TAMBAHAN` adalah pembayaran LANJUTAN pada pesanan yang uangnya
 *   sudah sebagian masuk dan tanggalnya sudah benar-benar dipegang.
 *   `Booking.expiresAt` di sini tidak berlaku sama sekali: nilainya adalah
 *   tenggat 24 jam waktu pesanan masih baru, dan pada pesanan yang sudah dibayar
 *   DP nilai itu hampir pasti sudah lewat. Memakainya berarti menolak setiap
 *   pelunasan yang sah. Tenggat yang berlaku bagi pelunasan adalah H-3
 *   (`tenggatPelunasan`), dan itu ditandai di layar — bukan dijadikan penghalang
 *   (lihat `tenggatPelunasanLewat`).
 *
 * Fungsi ini murni supaya modul sesi, halaman pembayaran, dan kartu pesanan
 * menjawab pertanyaan yang sama dengan jawaban yang sama. Kode galatnya
 * dipertahankan apa adanya karena halaman pembayaran memetakannya menjadi pesan
 * untuk pembeli.
 */
export function periksaKelayakanSesi(input: {
  statusPesanan: BookingStatus;
  tujuanTagihan: PaymentTujuan;
  tenggatPesanan: Date | null;
  sekarang: Date;
}): KelayakanSesi {
  if (bayarLanjutan(input.tujuanTagihan)) {
    if (!STATUS_BOLEH_BAYAR_LANJUTAN.includes(input.statusPesanan)) {
      return {
        boleh: false,
        status: 409,
        kode: 'STATUS_TIDAK_MENERIMA_BAYAR',
        pesan: 'Pesanan ini tidak lagi menerima pembayaran.',
      };
    }
    return { boleh: true };
  }

  if (input.statusPesanan !== BookingStatus.PENDING_PAYMENT) {
    return {
      boleh: false,
      status: 409,
      kode: 'STATUS_TIDAK_MENUNGGU_BAYAR',
      pesan: 'Pesanan ini tidak sedang menunggu pembayaran.',
    };
  }

  // Tenggat null tidak berarti "selamanya". Tanpa tenggat, sesi tidak bisa
  // dijepit ke umur pesanan dan pembeli dapat membayar setelah slot dilepas.
  if (!input.tenggatPesanan) {
    return {
      boleh: false,
      status: 409,
      kode: 'TENGGAT_TIDAK_TERSEDIA',
      pesan: 'Tenggat pembayaran pesanan ini tidak tersedia. Silakan buat pesanan baru.',
    };
  }

  const sisaMs = input.tenggatPesanan.getTime() - input.sekarang.getTime();

  if (sisaMs <= 0) {
    return {
      boleh: false,
      status: 409,
      kode: 'TENGGAT_LEWAT',
      pesan: 'Tenggat pembayaran pesanan ini sudah lewat. Silakan buat pesanan baru.',
    };
  }

  if (sisaMs < SISA_WAKTU_MIN_MS) {
    return {
      boleh: false,
      status: 409,
      kode: 'TENGGAT_TERLALU_DEKAT',
      pesan:
        'Sisa waktu pembayaran tidak cukup untuk menyelesaikan transaksi. Silakan buat pesanan baru.',
    };
  }

  return { boleh: true };
}
