// src/lib/transisi-status.ts
//
// Peta perpindahan status pesanan yang sah, dan penyapu pesanan kedaluwarsa.
//
// Sebelum file ini ada, `admin/update-order` menerima status APA PUN asalkan
// nilainya anggota enum. Enum hanya menjawab "apakah kata ini dikenal", bukan
// "apakah perpindahan ini masuk akal". Akibatnya satu salah klik di dashboard
// bisa memindahkan pesanan yang sudah `REFUNDED` kembali ke `ACTIVE`: uangnya
// sudah ditransfer keluar, tapi di sistem pesanan itu hidup lagi, tanggalnya
// terkunci lagi, dan pelanggan menerima email "Pembayaran Berhasil! Order
// Aktif." untuk pesanan yang justru baru saja dikembalikan dananya. Hal yang
// sama berlaku untuk `CANCELLED → ACTIVE`.
//
// Peta di bawah menyalin alur yang memang dijalankan kode yang ada:
// `OrderActions.tsx` (tombol admin), `booking/cancel`, `booking/request-refund`
// dan `payment/notify`. Kalau sebuah tombol baru butuh perpindahan yang belum
// terdaftar, tambahkan di sini — jangan lewati pemeriksaannya.

import { addHours, isAfter } from 'date-fns';
import { BookingStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Untuk setiap status: daftar status berikutnya yang boleh dituju.
 *
 * Daftar kosong = status akhir. `REFUNDED` dan `CANCELLED` sengaja buntu:
 * keduanya menandai pesanan yang sudah selesai secara uang, dan menghidupkan
 * kembali pesanan seperti itu berarti menagih atau mengunci tanggal atas dasar
 * transaksi yang sudah ditutup.
 */
export const TRANSISI_SAH: Record<BookingStatus, readonly BookingStatus[]> = {
  // Belum ada uang masuk. Admin bisa menerima pembayaran manual dan langsung
  // melompat ke tahap produksi (lihat OrderActions.handleApprovePayment), atau
  // menolak pesanannya.
  PENDING_PAYMENT: [
    BookingStatus.PAID_CONFIRMED,
    BookingStatus.DESIGN_RECEIVED,
    BookingStatus.IN_PRODUCTION,
    BookingStatus.CANCELLED,
  ],

  // Uang sudah masuk, menunggu admin menekan "Verifikasi". Percabangan ke
  // DESIGN_RECEIVED / IN_PRODUCTION ditentukan `designOption`.
  //
  // `CANCELLED` SENGAJA TIDAK ADA di sini dan di dua status berikutnya, dan ini
  // perbaikan atas jebakan uang yang nyata. Ketiga status ini berarti uang
  // pembeli sudah diterima, sementara `CANCELLED` adalah status buntu yang juga
  // BUKAN titik awal pengajuan refund (lihat `STATUS_BOLEH_AJUKAN_REFUND` di
  // bawah). Jadi satu klik tombol "Tolak" di dashboard admin memindahkan
  // pesanan yang uangnya sudah di rekening perusahaan ke keadaan tanpa satu pun
  // jalur pengembalian: tidak bisa maju, tidak bisa refund, tidak bisa
  // dikembalikan ke status sebelumnya. Uang pembeli terkunci permanen.
  //
  // Penggantinya `WAITING_BANK` — jalur batal paksa oleh admin yang memang
  // sudah dipakai dari `ACTIVE` (`OrderActions.handleForceCancel`). Dari sana
  // pesanan hanya bisa ke PROCESS_REFUND lalu REFUNDED, dan
  // `booking/request-refund` STEP B menghitung nominal kembalian dari uang yang
  // benar-benar diterima. Membatalkan pesanan yang sudah dibayar karena itu
  // selalu berujung pada pengembalian dana, bukan pada uang yang menggantung.
  PAID_CONFIRMED: [
    BookingStatus.DESIGN_RECEIVED,
    BookingStatus.IN_PRODUCTION,
    BookingStatus.REVIEW_REFUND,
    BookingStatus.WAITING_BANK,
  ],

  DESIGN_RECEIVED: [
    BookingStatus.IN_PRODUCTION,
    BookingStatus.REVIEW_REFUND,
    BookingStatus.WAITING_BANK,
  ],

  IN_PRODUCTION: [
    BookingStatus.INSTALLATION,
    BookingStatus.REVIEW_REFUND,
    BookingStatus.WAITING_BANK,
  ],

  // Sudah di lapangan. Pembatalan di titik ini lewat jalur refund, bukan
  // CANCELLED, karena uangnya sudah diterima dan harus dikembalikan.
  INSTALLATION: [
    BookingStatus.ACTIVE,
    BookingStatus.REVIEW_REFUND,
  ],

  // Tayang. `WAITING_BANK` adalah jalur batal paksa oleh admin
  // (OrderActions.handleForceCancel), `REVIEW_REFUND` jalur pengajuan user.
  ACTIVE: [
    BookingStatus.REVIEW_REFUND,
    BookingStatus.WAITING_BANK,
  ],

  // Admin menyetujui (→ minta rekening) atau menolak (→ kembali tayang).
  REVIEW_REFUND: [
    BookingStatus.WAITING_BANK,
    BookingStatus.ACTIVE,
  ],

  // Menunggu user mengisi rekening tujuan transfer.
  WAITING_BANK: [BookingStatus.PROCESS_REFUND],

  // Menunggu admin benar-benar mentransfer dan mengunggah buktinya.
  PROCESS_REFUND: [BookingStatus.REFUNDED],

  // Status akhir — lihat catatan di atas.
  REFUNDED: [],
  CANCELLED: [],
};

/**
 * Status-status yang boleh dijadikan titik awal pengajuan refund.
 *
 * Diturunkan dari peta di atas: semua status yang punya `REVIEW_REFUND` di
 * daftar tujuannya. Ditulis sebagai turunan, bukan daftar kedua yang disalin
 * tangan, supaya tidak ada kemungkinan dua daftar itu berbeda isi.
 */
export const STATUS_BOLEH_AJUKAN_REFUND: readonly BookingStatus[] = (
  Object.keys(TRANSISI_SAH) as BookingStatus[]
).filter((dari) => TRANSISI_SAH[dari].includes(BookingStatus.REVIEW_REFUND));

/**
 * Status yang membuat sebuah pesanan MENGUNCI tanggal billboard.
 *
 * Dipakai pemeriksaan tumpang-tindih tanggal di `booking/create`. Yang tidak
 * masuk daftar hanya `CANCELLED` dan `REFUNDED`: dua-duanya berarti pesanan
 * sudah lepas, jadi tanggalnya kembali bisa dijual.
 *
 * PENTING: daftar ini harus sama persis dengan daftar status di constraint
 * `booking_tanpa_tumpang_tindih` (lihat migrasi
 * `20260923140000_samakan_status_pengunci_tanggal`). Daftar di sini diturunkan
 * otomatis dari `TRANSISI_SAH`, daftar di SQL ditulis tangan — jadi setiap
 * status baru yang ditambahkan ke `TRANSISI_SAH` masuk ke sini dengan
 * sendirinya, tapi HARUS ditambahkan ke migrasi baru secara manual. Kalau
 * tidak, status itu mengunci tanggal di aplikasi tapi tidak di database, dan
 * celah balapan yang ditutup constraint itu terbuka lagi persis di sana.
 */
export const STATUS_MENGUNCI_TANGGAL: readonly BookingStatus[] = (
  Object.keys(TRANSISI_SAH) as BookingStatus[]
).filter(
  (s) => s !== BookingStatus.CANCELLED && s !== BookingStatus.REFUNDED
);

/** Apakah pesanan boleh berpindah dari `dari` ke `ke`? */
export function transisiSah(dari: BookingStatus, ke: BookingStatus): boolean {
  // Menyimpan ulang status yang sama bukan perpindahan — mis. admin menekan
  // tombol yang sama dua kali, atau hanya menambahkan foto bukti tanpa
  // mengubah tahap. Ditolaknya akan terbaca admin sebagai kegagalan, padahal
  // tidak ada yang berubah.
  if (dari === ke) return true;
  return TRANSISI_SAH[dari]?.includes(ke) ?? false;
}

/** Pesan yang menyebut apa yang sebenarnya boleh dilakukan dari status saat ini. */
export function pesanTransisiDitolak(dari: BookingStatus, ke: BookingStatus): string {
  const tujuan = TRANSISI_SAH[dari] ?? [];
  if (tujuan.length === 0) {
    return `Pesanan berstatus ${dari} sudah selesai dan tidak bisa diubah lagi (permintaan: ${ke}).`;
  }
  return `Status tidak bisa berpindah dari ${dari} ke ${ke}. Dari ${dari} hanya bisa ke: ${tujuan.join(', ')}.`;
}

/** Berapa lama pesanan baru boleh menunggu pembayaran sebelum hangus. */
export const JAM_TENGGAT_PEMBAYARAN = 24;

/** Tenggat pembayaran untuk pesanan yang dibuat pada `sejak`. */
export function hitungTenggatPembayaran(sejak: Date = new Date()): Date {
  return addHours(sejak, JAM_TENGGAT_PEMBAYARAN);
}

/**
 * Batalkan semua pesanan `PENDING_PAYMENT` yang tenggatnya sudah lewat.
 *
 * Kenapa perlu: hitung mundur 24 jam di `BookingCard.tsx` hanya hidup di
 * browser. Kartunya berubah menjadi "EXPIRED" di layar, tapi barisnya tetap
 * `PENDING_PAYMENT` di database — dan pesanan `PENDING_PAYMENT` ikut mengunci
 * tanggal billboard. Satu orang yang membuka checkout lalu menghilang akan
 * memblokir tanggal itu selamanya, tanpa seorang pun membayar.
 *
 * Kenapa dipanggil dari route, bukan cron: sistem ini belum punya penjadwal,
 * dan menambah satu berarti menambah proses yang harus dipasang dan diawasi.
 * Menyapu di depan pemeriksaan ketersediaan sudah cukup untuk tujuannya —
 * tanggal yang sudah hangus tidak boleh menghalangi pembeli berikutnya, dan
 * pembeli berikutnya persis orang yang memicu pemeriksaan itu.
 *
 * Batasannya jujur disebut di sini: pesanan yang hangus baru benar-benar
 * berubah status saat ADA orang lain memeriksa billboard yang sama. Sampai
 * saat itu barisnya masih PENDING_PAYMENT di dashboard admin. Itu tidak
 * merugikan siapa pun — yang dilindungi adalah ketersediaan tanggal — tapi
 * kalau nanti dibutuhkan pengekspirasian tepat waktu, jadwalkan fungsi yang
 * sama ini, jangan tulis logika kedua.
 *
 * @param billboardId Bila diisi, hanya menyapu pesanan billboard itu.
 * @returns jumlah pesanan yang dihanguskan.
 */
export async function sapuPesananKedaluwarsa(billboardId?: string): Promise<number> {
  const sekarang = new Date();

  try {
    const { count } = await prisma.booking.updateMany({
      where: {
        status: BookingStatus.PENDING_PAYMENT,
        // `expiresAt: null` sengaja TIDAK ikut disapu. Baris yang dibuat
        // sebelum kolom ini ada tidak punya tenggat tercatat, dan menebak
        // tenggatnya dari `createdAt` berarti menghanguskan pesanan lama
        // secara massal pada deploy pertama.
        expiresAt: { not: null, lt: sekarang },
        ...(billboardId ? { billboardId } : {}),
      },
      data: {
        status: BookingStatus.CANCELLED,
        cancelReason: 'Dibatalkan otomatis: batas waktu pembayaran 24 jam terlewat.',
      },
    });

    if (count > 0) {
      console.log(`⌛ [SWEEPER] ${count} pesanan hangus karena melewati tenggat bayar.`);
    }
    return count;
  } catch (error) {
    // Penyapuan adalah pekerjaan sampingan dari permintaan yang sedang
    // berjalan. Kalau gagal, permintaan utamanya (mis. pembuatan pesanan)
    // tidak boleh ikut gagal — paling buruk ada tanggal yang masih terkunci
    // sampai sapuan berikutnya.
    console.error('🔥 [SWEEPER] Gagal menyapu pesanan kedaluwarsa:', error);
    return 0;
  }
}

/**
 * Apakah pesanan ini sudah melewati tenggat bayarnya?
 * Dipakai tampilan yang perlu tahu tanpa menunggu sapuan berjalan.
 */
export function sudahLewatTenggat(expiresAt: Date | string | null | undefined): boolean {
  if (!expiresAt) return false;
  return isAfter(new Date(), new Date(expiresAt));
}
