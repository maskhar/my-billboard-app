// src/lib/hari-sewa.ts
//
// Hari mulai dan hari selesai satu sewa: dibaca dari browser, diputuskan di WIB,
// disimpan pada konvensi yang sudah dipakai constraint database.
//
// KENAPA BERKAS INI ADA
// --------------------
// `booking/create` dulu memutuskan tanggal dengan tiga baris `date-fns`:
//
//     const startDate = startOfDay(new Date(startDateString));
//     if (isBefore(startDate, startOfDay(new Date()))) → 400
//     const endDate = addMonths(startDate, durasi);
//
// Ketiganya membaca zona waktu PROSES, dan produksi berjalan pada UTC. Tiga
// akibatnya, masing-masing dengan harganya:
//
//  1. **Gerbang "tidak boleh di masa lalu" mundur tujuh jam setiap hari.**
//     Pukul 00.00–07.00 WIB pada hari D adalah pukul 17.00–24.00 UTC pada hari
//     D−1, jadi proses menyimpulkan "hari ini" masih D−1 dan MENERIMA D−1
//     sebagai tanggal mulai. Di Jakarta hari itu sudah lewat. Pesanannya lalu
//     mengunci rentang yang sudah berlalu, dan constraint
//     `booking_tanpa_tumpang_tindih` menolak setiap pembeli sungguhan untuk
//     periode itu selama statusnya masih hidup — billboard menjadi tidak bisa
//     dijual untuk tanggal yang tidak pernah benar-benar terjual. Tujuh jam
//     setiap hari, tanpa satu pun galat.
//
//  2. **`addMonths` menggeser `endDate` sehari, tergantung zona proses.**
//     `addMonths` membaca medan waktu LOKAL. Pada `2027-01-31T00:00:00Z` di
//     zona negatif (mis. UTC−5) instannya terbaca 30 Januari pukul 19.00, jadi
//     hasilnya 28 Februari pukul 19.00 — yaitu `2027-03-01T00:00:00Z`. Satu hari
//     lebih panjang dari yang dibayar pembeli, dan hari itu ikut mengunci
//     pesanan berikutnya.
//
//  3. **Konvensi simpannya ikut berpindah-pindah.** `startOfDay` menghasilkan
//     `T00:00:00Z` di UTC tapi `T17:00:00Z` (hari sebelumnya) di WIB, jadi baris
//     yang ditulis dari mesin pengembang dan baris yang ditulis dari produksi
//     memakai dua konvensi berbeda untuk hari yang sama.
//
// KENAPA YANG DISIMPAN TETAP TENGAH MALAM **UTC**, BUKAN TENGAH MALAM WIB
// ----------------------------------------------------------------------
// Ini batasan yang paling mudah dilewatkan, dan melewatkannya merusak data
// diam-diam. `Booking.startDate` dan `endDate` bertipe `TIMESTAMP(3)` TANPA
// zona waktu (lihat `20251222070417_init_local_db/migration.sql`), dan
// constraint pengunci tanggalnya membandingkan hasil cast `::date`:
//
//     EXCLUDE USING gist (
//       "billboardId" WITH =,
//       daterange("startDate"::date, "endDate"::date, '[)') WITH &&
//     )
//
// `::date` membaca jam dinding yang tersimpan apa adanya. Menyimpan tengah malam
// WIB berarti 1 Oktober tersimpan sebagai `2026-09-30T17:00:00`, dan `::date`
// menjawab **30 September** — seluruh rentang eksklusi setiap pesanan baru
// bergeser satu hari ke belakang, tidak lagi sepakat dengan baris lama maupun
// dengan `where` kalender admin. Memperbaikinya menuntut migrasi yang mengubah
// castnya, dan itu fase sendiri.
//
// Jadi pembagiannya tegas: **hari diputuskan di WIB, instannya disimpan pada
// tengah malam UTC.** Yang diperbaiki adalah keputusannya, bukan konvensi
// simpannya — dan efek sampingnya justru baik, karena kini mesin pengembang
// menulis konvensi yang sama dengan produksi.
//
// KENAPA NOL IMPOR SELAIN DUA MODUL RELATIF
// -----------------------------------------
// Alasan yang sama seperti `rentang-tanggal.ts` dan `saringan-daftar.ts`: berkas
// ini di-`require` langsung di test tanpa satu pun mock, supaya rumusnya diuji
// pada bentuk yang benar-benar dijalankan `booking/create` — bukan pada
// salinannya di dalam test. Salinan yang tetap benar sementara yang dijalankan
// berubah adalah test yang melaporkan hijau atas kode yang salah; terukur pada
// kalender publik, mutasi `<` → `<=` pada versi closure-nya tidak membunuh satu
// pun dari 2139 test yang ada.

import { geserBulan, kunciTanggalSah } from './rentang-tanggal';
import { kunciTanggal } from './tanggal';

/**
 * Instan yang DISIMPAN untuk hari `kunci`: tengah malam UTC.
 *
 * Bukan tengah malam WIB — lihat komentar kepala berkas. Mengubah baris ini
 * menggeser `daterange("startDate"::date, "endDate"::date)` setiap pesanan baru
 * satu hari ke belakang, tanpa satu pun galat saat penulisan.
 */
export function awalHariTersimpan(kunci: string): Date {
  return new Date(`${kunci}T00:00:00.000Z`);
}

/**
 * Kunci hari `YYYY-MM-DD` dari `startDateString` yang datang mentah dari
 * browser, atau `null` bila bentuknya tidak bisa dipercaya.
 *
 * DUA BENTUK DITERIMA, DAN KEDUANYA DITAFSIRKAN BERBEDA — dengan sengaja:
 *
 *   · `YYYY-MM-DD` — yang dikirim `<input type="date">` di `CheckoutForm`.
 *     Ini hari kalender yang DIKLIK pembeli, tanpa makna waktu, jadi diambil
 *     apa adanya TANPA satu pun konversi zona. Itu yang membuat pengunjung di
 *     Auckland (+13) atau Los Angeles (−7) memesan tanggal yang tertulis di
 *     layarnya, bukan tanggal tetangganya. Diperiksa BOLAK-BALIK: `2026-02-30`
 *     lolos regex dan diterima `new Date`, yang menggulungnya menjadi 2 Maret —
 *     hari yang tidak pernah bisa muncul di `<input type="date">` mana pun, jadi
 *     bentuk bare yang menggulung ditolak.
 *   · Instan ISO penuh (memuat `T`) — ditafsirkan di WIB, konvensi yang sama
 *     dengan seluruh pembaca tanggal di repo ini (`billboard/[slug]/page.tsx`
 *     memetakan `kunciTanggal(b.startDate)`, kalender admin memotong per kunci).
 *     Di sini penggulungan justru TIDAK ditolak, dan asimetri itu disengaja:
 *     `2026-02-30T00:00:00Z` adalah satu instan yang sah, dan hari WIB-nya
 *     memang 2 Maret. Tidak ada kunci hari yang hilang — yang datang sudah
 *     berupa titik waktu, bukan hari yang diketik orang.
 *
 * Bentuk lain DITOLAK, termasuk yang `new Date` sendiri mau menerima: `'2026'`
 * menjadi 1 Januari 2026 dan `'2026-10'` menjadi 1 Oktober — tanggal sah menurut
 * setiap gerbang berikutnya, dan tanggal yang tidak pernah diketik siapa pun.
 * Karena itu cabang instan menuntut `T`, bukan sekadar "bukan NaN".
 *
 * Pemeriksaan TIPE mendahului `new Date`, dan itu bukan kerapian. Selama body
 * bertipe `any`, `new Date(1e15)` adalah tanggal sah di tahun 33658: bukan NaN,
 * bukan masa lalu. Satu angka yang tersasar di payload menjadi sewa ribuan tahun
 * yang menolak setiap pembeli sungguhan lewat constraint.
 */
export function kunciHariSewa(mentah: unknown): string | null {
  if (typeof mentah !== 'string') return null;

  const teks = mentah.trim();
  if (teks === '') return null;

  // `kunciTanggalSah` memeriksa bolak-balik, bukan hanya polanya.
  //
  // Hasilnya disalin ke `boolean` lebih dulu karena tanda tangannya adalah
  // type guard `mentah is string`. Dipakai langsung sebagai kondisi, TypeScript
  // menyempitkan `teks` — yang sudah `string` — menjadi `never` di cabang
  // negatifnya, dan setiap baris di bawah ini berhenti bisa dikompilasi.
  const berupaKunci: boolean = kunciTanggalSah(teks);
  if (berupaKunci) return teks;

  // Bentuk tanpa `T` yang sampai ke sini sudah gagal pemeriksaan bolak-balik
  // di atas — `2026-02-30`, `2026-1-1`, `2026-10`. Tidak diserahkan ke
  // `new Date`, yang akan menerima dua di antaranya.
  if (!teks.includes('T')) return null;

  const d = new Date(teks);
  if (Number.isNaN(d.getTime())) return null;

  return kunciTanggal(d);
}

/** Alasan satu tanggal mulai ditolak. Dipetakan ke pesan oleh pemanggilnya. */
export type AlasanTolakMulai = 'bentuk' | 'lampau';

export type HasilMulaiSewa =
  | { sah: true; kunci: string; mulai: Date }
  | { sah: false; alasan: AlasanTolakMulai };

/**
 * Putuskan hari mulai sewa: bentuknya sah, dan harinya belum lewat di WIB.
 *
 * `sekarang` adalah parameter, bukan `new Date()` di dalam badan fungsi. Tanpa
 * itu satu-satunya cara menguji cacat nomor 1 di komentar kepala berkas adalah
 * menjalankan test pada pukul tertentu di zona tertentu — yaitu tidak menguji
 * apa pun. Dengan itu, "permintaan pukul 02.00 WIB untuk tanggal yang di Jakarta
 * sudah lewat" bisa ditulis sebagai satu instan.
 *
 * Perbandingannya `<`, BUKAN `<=`: hari ini sendiri masih boleh dipesan.
 * Membuatnya `<=` menolak penjualan yang sah setiap hari, dan kalender publik
 * (`petakTerpakai`) sudah menawarkan hari ini sebagai bisa dipilih.
 */
export function periksaMulaiSewa(mentah: unknown, sekarang: Date): HasilMulaiSewa {
  const kunci = kunciHariSewa(mentah);
  if (kunci === null) return { sah: false, alasan: 'bentuk' };

  // Kunci hari dibandingkan sebagai TEKS. Urutan leksikografis `YYYY-MM-DD`
  // sama dengan urutan kronologisnya, dan membandingkan objek `Date` di sini
  // justru memasukkan kembali zona proses yang baru saja dihindari.
  if (kunci < kunciTanggal(sekarang)) return { sah: false, alasan: 'lampau' };

  return { sah: true, kunci, mulai: awalHariTersimpan(kunci) };
}

/**
 * Instan `endDate` untuk sewa `durasi` bulan yang mulai pada hari `kunci`.
 *
 * EKSKLUSIF: ia adalah hari pertama yang sudah bebas lagi. Gerbang
 * tumpang-tindih memakai `endDate: { gt: startDate }` dan constraint
 * `booking_tanpa_tumpang_tindih` memakai `'[)'`; keduanya sepakat.
 *
 * `geserBulan`, bukan `addMonths`. Keduanya menjepit ke hari terakhir bulan
 * tujuan (31 Januari + 1 bulan → 28 Februari, bukan 3 Maret), tapi `addMonths`
 * melakukannya lewat medan waktu LOKAL — lihat cacat nomor 2 di komentar kepala
 * berkas. `geserBulan` bekerja atas kunci hari, jadi jawabannya sama dari zona
 * proses mana pun.
 *
 * Tandanya NEGATIF karena `geserBulan` menghitung ke BELAKANG; itu bagian dari
 * kontraknya, bukan salah tulis. Lihat docstring-nya.
 */
export function akhirSewa(kunci: string, durasi: number): Date {
  return awalHariTersimpan(geserBulan(kunci, -durasi));
}
