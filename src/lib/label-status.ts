// src/lib/label-status.ts
//
// Warna dan label status pesanan — satu tabel untuk seluruh aplikasi.
//
// Dua tempat mewarnai status pesanan, dan KEDUANYA menyesatkan:
//
//   1. `admin/(dashboard)/orders/TransactionClient.tsx:231` memakai
//      `bg-green-100 text-green-700` SECARA TETAP, tanpa melihat statusnya sama
//      sekali. `CANCELLED` hijau. `REFUNDED` hijau. `PENDING_PAYMENT` hijau.
//      Warna adalah hal pertama yang dibaca mata sebelum tulisannya, jadi badge
//      ini bukan sekadar tidak informatif — ia aktif menyatakan "aman" pada
//      pesanan yang dibatalkan dan pada pesanan yang belum dibayar sepeser pun.
//   2. `admin/(dashboard)/page.tsx:196-197` memakai rantai tiga cabang:
//      `PENDING_PAYMENT` kuning, `ACTIVE` hijau, SISANYA MERAH. Sembilan status
//      jatuh ke cabang terakhir, jadi `PAID_CONFIRMED` — pesanan sehat yang
//      uangnya sudah masuk — tampil merah persis seperti `CANCELLED`. Admin
//      membuka dashboard dan melihat deretan merah pada pekerjaan yang sedang
//      berjalan normal.
//
// Modul ini murni: tidak mengimpor `prisma` dan tidak mengimpor nilai dari
// `@prisma/client`, jadi Client Component boleh memakainya dan test boleh
// me-`require` langsung tanpa mock. Kuncinya `string`, bukan `BookingStatus`,
// karena status tiba di Client Component sebagai teks hasil serialisasi.

/** Kelas Tailwind untuk latar dan teks badge, per status. */
const WARNA_STATUS: Record<string, string> = {
  // Belum ada uang. Kuning: perlu tindakan, belum gagal.
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-700',

  // Uang sudah masuk dan pekerjaan berjalan. Biru, bukan hijau: hijau
  // disimpan untuk pesanan yang benar-benar selesai atau sedang tayang.
  PAID_CONFIRMED: 'bg-blue-100 text-blue-700',
  DESIGN_RECEIVED: 'bg-blue-100 text-blue-700',
  IN_PRODUCTION: 'bg-indigo-100 text-indigo-700',
  INSTALLATION: 'bg-indigo-100 text-indigo-700',

  // Tayang.
  ACTIVE: 'bg-green-100 text-green-700',

  // Jalur refund. Oranye: uang sedang bergerak keluar dan menunggu orang.
  REVIEW_REFUND: 'bg-orange-100 text-orange-700',
  WAITING_BANK: 'bg-orange-100 text-orange-700',
  PROCESS_REFUND: 'bg-orange-100 text-orange-700',

  // Tutup.
  REFUNDED: 'bg-gray-200 text-gray-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

/**
 * Kelas Tailwind untuk status pesanan.
 *
 * Status yang tidak dikenal mendapat abu-abu, BUKAN hijau dan bukan merah:
 * status baru yang belum terdaftar di sini tidak boleh muncul sebagai "aman"
 * maupun sebagai "gagal" — keduanya klaim yang tidak dimiliki tabel ini.
 */
export function warnaStatusPesanan(status: string): string {
  return WARNA_STATUS[status] ?? 'bg-gray-100 text-gray-600';
}

/** Status pesanan dalam bentuk yang dibaca manusia: `IN_PRODUCTION` → `IN PRODUCTION`. */
export function labelStatusPesanan(status: string): string {
  if (typeof status !== 'string') return '-';
  return status.replace(/_/g, ' ');
}
