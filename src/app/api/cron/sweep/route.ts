// src/app/api/cron/sweep/route.ts
//
// Pemicu berjadwal untuk penyapu pesanan kedaluwarsa.
//
// KENAPA FILE INI ADA
// -------------------
// `sapuPesananKedaluwarsa()` di `src/lib/transisi-status.ts` sampai sekarang
// hanya punya SATU pemanggil: `POST /api/booking/create`. Artinya pesanan
// `PENDING_PAYMENT` yang tenggat 24 jamnya lewat baru benar-benar hangus saat
// ADA pembeli lain membuka checkout billboard yang sama. Billboard yang jarang
// dilihat menahan tanggalnya terkunci selamanya — tanpa seorang pun membayar,
// dan tanpa satu pun baris di dashboard admin yang berubah.
//
// Sapuan tagihan `PENDING` yang sesinya mati menumpang di fungsi yang sama
// (lihat komentarnya di `transisi-status.ts`), jadi tagihan yang mengunci
// pasangan `(bookingId, tujuan)` pada indeks unik bersyarat
// `payment_satu_tagihan_menganggur` juga ikut tergantung pada pemicu yang sama.
//
// Docstring fungsi itu sudah menyebut jalan keluarnya, dan file ini menurutinya
// apa adanya: "kalau nanti dibutuhkan pengekspirasian tepat waktu, jadwalkan
// fungsi yang SAMA ini, jangan tulis logika kedua." Tidak ada satu pun aturan
// penghangusan di file ini — hanya autentikasi, satu pemanggilan, dan hitungan.
//
// DUA HAL YANG TIDAK BOLEH HILANG DARI FILE INI
// ---------------------------------------------
// 1. Tanpa `CRON_SECRET`, SEMUA permintaan ditolak — invariant yang sama yang
//    dipegang webhook Xendit. Endpoint yang terbuka saat rahasianya belum
//    dipasang berarti siapa pun yang menebak URL ini bisa menjalankan
//    pembatalan massal berkali-kali sesukanya.
// 2. Nilai rahasia tidak pernah dicatat, bahkan pada penolakan. Log adalah
//    tempat rahasia paling sering bocor tanpa ada yang menyadarinya.
//
// Endpoint ini TIDAK menegakkan tenggat pelunasan H-3. Keputusan yang sudah
// disetujui: pelunasan yang terlambat ditandai "terlambat" dan tagihannya tetap
// bisa dibayar. Penegak otomatis di sini akan membatalkan pesanan yang uang
// pokoknya sudah masuk.
//
// SAPUAN KEDUA: TOKEN RESET SANDI
// -------------------------------
// Menumpang jadwal yang sama, dengan alasan yang sama seperti sapuan tagihan
// menumpang di `sapuPesananKedaluwarsa`: ini satu-satunya pekerjaan latar yang
// benar-benar dijalankan, dan menambah jadwal kedua berarti menambah satu lagi
// yang harus dipasang dan diawasi.
//
// Keduanya berdiri sendiri: kegagalan salah satu tidak boleh menghentikan yang
// lain. Sapuan pesanan melepas tanggal billboard yang terkunci — pekerjaan yang
// menahan pendapatan. Sapuan token hanya merapikan tabel kredensial. Yang kedua
// gagal bukan alasan yang pertama tidak jalan.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sapuPesananKedaluwarsa } from '@/lib/transisi-status';
import { sapuTokenResetKedaluwarsa } from '@/lib/sapu-token-reset';

/** Nama header yang dikirim penjadwal Vercel saat `CRON_SECRET` terpasang. */
const NAMA_HEADER = 'authorization';

/** Jawaban endpoint ini tidak boleh disimpan cache perantara mana pun. */
const TANPA_SIMPAN = { 'Cache-Control': 'no-store' } as const;

/**
 * Apakah header `Authorization` membawa `CRON_SECRET` yang benar?
 *
 * Gagal tertutup: `false` juga saat variabelnya belum diisi.
 */
export function rahasiaCronCocok(headerDikirim: string | null): boolean {
  const rahasia = process.env.CRON_SECRET;

  if (!rahasia) {
    console.error(
      '[cron] CRON_SECRET belum diisi — semua permintaan sapuan ditolak. ' +
        'Isi variabel itu sebelum memasang jadwal.'
    );
    return false;
  }

  if (!headerDikirim) return false;

  // Penjadwal Vercel mengirim `Bearer <CRON_SECRET>`. Prefiksnya dibuang di
  // sini, bukan di pembanding, supaya yang dibandingkan hanya rahasianya.
  const dikirim = headerDikirim.startsWith('Bearer ') ? headerDikirim.slice(7) : headerDikirim;

  const a = Buffer.from(dikirim, 'utf8');
  const b = Buffer.from(rahasia, 'utf8');
  // Panjang rahasia bukan rahasia, jadi keluar lebih awal di sini tidak
  // membocorkan apa pun. Isinya dibandingkan tanpa membocorkan berapa karakter
  // awal yang sudah cocok lewat lama pembandingan.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Sapuan tidak boleh dijawab dari cache, dan tidak boleh ikut dirender saat
 * build — `force-dynamic` memastikan keduanya.
 */
export const dynamic = 'force-dynamic';

/** Penjadwal Vercel memanggil dengan GET. */
export async function GET(req: Request): Promise<NextResponse> {
  if (!rahasiaCronCocok(req.headers.get(NAMA_HEADER))) {
    console.warn('[cron] rahasia tidak cocok — permintaan sapuan ditolak.');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401, headers: TANPA_SIMPAN });
  }

  // `sapuPesananKedaluwarsa` sudah menangkap galatnya sendiri dan mengembalikan
  // 0 — ia dirancang sebagai pekerjaan sampingan yang tidak boleh menggagalkan
  // pemanggilnya. Di sini itu tetap perilaku yang benar: penjadwal yang
  // menerima 500 akan mengulang, dan mengulang sapuan yang gagal karena
  // database sedang mati tidak memperbaiki apa pun.
  const dihanguskan = await sapuPesananKedaluwarsa();

  // Ditangkap di sini, bukan dibiarkan naik: tabel kredensial yang tidak
  // terapikan adalah kerapian, sementara jawaban 500 membuat penjadwal mengulang
  // seluruh sapuan — termasuk yang di atas, yang sudah berhasil.
  let tokenTerhapus = 0;
  try {
    tokenTerhapus = await sapuTokenResetKedaluwarsa();
    if (tokenTerhapus > 0) {
      console.log(`⌛ [SWEEPER] ${tokenTerhapus} token reset kedaluwarsa dihapus.`);
    }
  } catch {
    // Tanpa objek galatnya: pesan Prisma bisa memuat cuplikan query, dan query
    // di tabel ini menyebut kolom `tokenHash`.
    console.error('[SWEEPER] gagal menyapu token reset kedaluwarsa.');
  }

  return NextResponse.json(
    { status: 'ok', dihanguskan, tokenTerhapus },
    { status: 200, headers: TANPA_SIMPAN }
  );
}
