// src/lib/tugas-admin.ts
//
// Pekerjaan yang benar-benar menunggu admin, dan siapa yang sedang ditunggu.
//
// Panel "Fast Action" di dashboard admin dulu menampilkan satu kalimat tetap:
// "Ada orderan yang butuh persetujuan manual." Tidak ada query di belakangnya.
// Kalimat itu muncul pada hari pertama sistem dipasang, saat belum ada satu pun
// pesanan, dan tetap muncul setelah admin menyelesaikan semuanya. Pemberitahuan
// yang selalu menyala adalah pemberitahuan yang berhenti dibaca — dan begitu ia
// berhenti dibaca, pesanan yang memang menunggu persetujuan ikut tidak terlihat.
// Panel itu bukan sekadar tidak berguna: ia melatih admin mengabaikan tempat
// yang seharusnya memberi tahu.
//
// Modul ini murni: tidak mengimpor `prisma`, jadi test boleh me-`require`
// langsung tanpa mock dan halaman server tetap yang menjalankan query-nya.

import { BookingStatus } from '@prisma/client';

/**
 * Satu jenis pekerjaan yang menunggu admin.
 *
 * `tab` adalah nilai `?status=` di `/admin/orders` yang benar-benar menampilkan
 * status ini. Ditulis di sini supaya setiap angka yang muncul di panel bisa
 * diklik sampai ke barisnya — hitungan yang tidak bisa ditelusuri hanya
 * memberitahu admin bahwa ada pekerjaan, tanpa memberi jalan mengerjakannya.
 */
export type JenisTugasAdmin = {
  status: BookingStatus;
  /** Apa yang harus admin lakukan, bukan nama statusnya. */
  ajakan: string;
  tab: 'PENDING' | 'PROGRESS' | 'REFUND';
};

/**
 * Pekerjaan yang menunggu admin, URUTANNYA ADALAH PRIORITASNYA.
 *
 * Diturunkan dari tombol yang benar-benar ada di
 * `src/components/admin/OrderActions.tsx` — bukan dari daftar status mana pun.
 * Sebuah status masuk ke sini hanya bila ada tombol yang menunggu ditekan admin
 * pada status itu. Kalau tombolnya dihapus atau ditambah, daftar ini ikut
 * berubah; test di `tests/xendit.test.cjs` menuntut keduanya tetap sejalan.
 *
 * Urutannya sengaja tidak mengikuti alur pesanan:
 *
 *   1. `PROCESS_REFUND` di atas karena pembeli sudah mengisi rekening dan
 *      menunggu uangnya benar-benar ditransfer. Ini satu-satunya baris yang
 *      membuat perusahaan berutang uang yang belum bergerak.
 *   2. `PAID_CONFIRMED` berikutnya: uang pembeli sudah diterima dan
 *      pekerjaannya belum dimulai sama sekali.
 *   3. `REVIEW_REFUND`: pembeli menunggu jawaban ya/tidak.
 *   4. Tiga tahap produksi terakhir — pekerjaannya sudah berjalan, jadi
 *      penundaan sehari tidak menahan uang siapa pun.
 */
export const TUGAS_ADMIN: readonly JenisTugasAdmin[] = [
  {
    status: BookingStatus.PROCESS_REFUND,
    ajakan: 'perlu ditransfer pengembaliannya',
    tab: 'REFUND',
  },
  {
    status: BookingStatus.PAID_CONFIRMED,
    ajakan: 'sudah dibayar, menunggu diverifikasi',
    tab: 'PENDING',
  },
  {
    status: BookingStatus.REVIEW_REFUND,
    ajakan: 'mengajukan refund, menunggu diputuskan',
    tab: 'REFUND',
  },
  {
    status: BookingStatus.DESIGN_RECEIVED,
    ajakan: 'desainnya menunggu diperiksa',
    tab: 'PROGRESS',
  },
  {
    status: BookingStatus.IN_PRODUCTION,
    ajakan: 'selesai dicetak, menunggu dikirim pasang',
    tab: 'PROGRESS',
  },
  {
    status: BookingStatus.INSTALLATION,
    ajakan: 'terpasang, menunggu bukti diunggah',
    tab: 'PROGRESS',
  },
];

/**
 * Status yang justru menunggu ORANG LAIN, bukan admin.
 *
 * Ditulis eksplisit supaya ketiganya tidak pernah ikut terhitung sebagai
 * pekerjaan admin — menampilkannya di panel tugas berarti meminta admin
 * mengerjakan sesuatu yang tidak ada tombolnya:
 *
 * - `PENDING_PAYMENT` — menunggu pembeli membayar. Tenggatnya 24 jam dan
 *   disapu sendiri oleh `sapuPesananKedaluwarsa()`.
 * - `WAITING_BANK` — menunggu pembeli mengisi nomor rekening tujuan transfer.
 *   `OrderActions` sendiri hanya menampilkan "Wait User..." di sini.
 * - `ACTIVE` — sedang tayang. Satu-satunya tombolnya adalah batal paksa, dan
 *   itu bukan pekerjaan yang menunggu diselesaikan.
 */
export const STATUS_MENUNGGU_ORANG_LAIN: readonly BookingStatus[] = [
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.WAITING_BANK,
  BookingStatus.ACTIVE,
];

export type BarisTugasAdmin = JenisTugasAdmin & { jumlah: number };

export type RingkasanTugasAdmin = {
  /** Jumlah seluruh pesanan yang menunggu admin. Nol berarti benar-benar kosong. */
  total: number;
  /** Hanya jenis yang jumlahnya di atas nol, urut sesuai prioritas `TUGAS_ADMIN`. */
  rincian: BarisTugasAdmin[];
};

/**
 * Ubah hasil hitungan per status menjadi daftar pekerjaan yang menunggu admin.
 *
 * Yang dikirim pemanggil adalah hasil `prisma.booking.groupBy({ by: ['status'] })`
 * yang sudah dipipihkan. Status yang tidak ada di `TUGAS_ADMIN` diabaikan, jadi
 * status baru di enum tidak pernah diam-diam terhitung sebagai pekerjaan admin
 * sebelum tombolnya ada.
 *
 * Baris berjumlah nol DIBUANG, tidak ditampilkan sebagai "0 pesanan". Panel ini
 * ada untuk memberi tahu apa yang perlu dikerjakan; deretan nol hanya
 * mengembalikan masalah yang sama dalam bentuk lain, yaitu tampilan yang isinya
 * sama setiap hari.
 */
export function ringkasTugasAdmin(
  perStatus: readonly { status: BookingStatus | string; jumlah: number }[]
): RingkasanTugasAdmin {
  const peta = new Map<string, number>();
  for (const baris of perStatus) {
    // Dijumlahkan, tidak ditimpa: pemanggil boleh mengirim dua baris untuk
    // status yang sama tanpa salah satunya hilang tanpa jejak.
    const angka = Number(baris.jumlah);
    if (!Number.isFinite(angka) || angka <= 0) continue;
    peta.set(String(baris.status), (peta.get(String(baris.status)) ?? 0) + angka);
  }

  const rincian: BarisTugasAdmin[] = [];
  for (const jenis of TUGAS_ADMIN) {
    const jumlah = peta.get(jenis.status) ?? 0;
    if (jumlah > 0) rincian.push({ ...jenis, jumlah });
  }

  return {
    total: rincian.reduce((t, b) => t + b.jumlah, 0),
    rincian,
  };
}
