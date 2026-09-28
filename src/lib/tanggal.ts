// src/lib/tanggal.ts
//
// Satu tempat untuk memformat tanggal yang dilihat pengguna.
//
// KENAPA FILE INI ADA
// -------------------
// Tanggal diformat di 15 berkas dengan 6 varian argumen berbeda, dan dua di
// antaranya SALAH dengan cara yang tidak terlihat sampai kode itu naik ke
// produksi:
//
// 1. `toLocaleDateString()` TANPA locale — empat pemanggil. Locale-nya diambil
//    dari sistem. Di laptop admin berbahasa Inggris tanggalnya keluar
//    "9/29/2026"; di peramban berbahasa Indonesia "29/9/2026"; dan pada Server
//    Component yang dirender di Vercel, locale runtime Node adalah apa pun
//    yang dipasang kontainernya. Dua admin membaca tabel yang sama dan melihat
//    urutan hari/bulan yang bertukar.
//
// 2. `toLocaleDateString('id-ID')` di SERVER Component tanpa `timeZone`. Zona
//    waktunya diambil dari proses, dan proses di Vercel berjalan pada UTC.
//    Pesanan yang dibuat pukul 00.30 WIB tersimpan sebagai 17.30 UTC HARI
//    SEBELUMNYA, jadi invoice-nya mencetak tanggal yang lebih awal satu hari
//    daripada tanggal yang dilihat pembeli saat memesan. Tidak ada satu pun
//    `Asia/Jakarta` di seluruh repo sebelum berkas ini.
//
// Yang kedua itu bukan soal kerapian. Invoice adalah dokumen yang dicetak dan
// diarsipkan, dan tanggalnya jadi acuan saat pembeli menagih balik.
//
// KENAPA ZONA DIPAKU, BUKAN DIBIARKAN IKUT PERAMBAN
// ------------------------------------------------
// Penyewa, admin, dan servernya berada di Indonesia, dan seluruh tenggat di
// aplikasi ini — tenggat bayar 24 jam, tenggat pelunasan H-3 — dihitung server
// dalam UTC lalu dibandingkan dengan `Date.now()`. Menampilkannya di zona
// peramban berarti admin yang sedang di luar negeri melihat tenggat bergeser
// sementara penegaknya tidak. Satu zona untuk semua pembaca membuat yang
// terlihat sama dengan yang ditegakkan.
//
// Konsekuensi yang disengaja: render server dan render client menghasilkan teks
// yang SAMA, jadi tidak ada lagi ketidakcocokan hidrasi pada tanggal.
//
// KENAPA NOL IMPOR
// ----------------
// Alasan yang sama seperti `src/lib/tarif.ts`: `money.ts` dan `pembayaran.ts`
// mengimpor `@prisma/client`, dan mengimpor modul itu ke Client Component
// menarik runtime Prisma ke bundel browser. Berkas ini dipakai dari kedua sisi,
// jadi ia tidak mengimpor apa pun.

/**
 * Zona waktu yang dipakai untuk SEMUA tampilan tanggal.
 *
 * Bukan preferensi pengguna — lihat komentar di atas. Mengubahnya di sini
 * mengubah seluruh aplikasi sekaligus, yang justru tujuannya.
 */
export const ZONA_WAKTU = 'Asia/Jakarta';

/** Locale yang dipakai untuk semua tampilan tanggal. */
export const LOKAL = 'id-ID';

/**
 * Terima apa pun yang bisa menjadi tanggal, tolak yang tidak.
 *
 * Nilai tanggal menyeberang dari server ke client sebagai teks ISO (objek
 * `Date` tidak bisa jadi props Client Component), jadi pemanggil bisa memegang
 * `Date`, `string`, atau `number`. Yang tidak valid mengembalikan `null` alih-
 * alih "Invalid Date" — teks itu pernah tampil di layar admin.
 */
function keTanggal(nilai: Date | string | number | null | undefined): Date | null {
  if (nilai === null || nilai === undefined) return null;

  const d = nilai instanceof Date ? nilai : new Date(nilai);

  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Tanggal ringkas: `29 Sep 2026`.
 *
 * Bentuk baku untuk tabel dan daftar — cukup pendek untuk kolom sempit dan
 * tidak pernah ambigu soal urutan hari/bulan, yang justru masalah
 * `29/9/2026` versus `9/29/2026`.
 */
export function tanggalRingkas(nilai: Date | string | number | null | undefined): string {
  const d = keTanggal(nilai);
  if (!d) return '—';

  return d.toLocaleDateString(LOKAL, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: ZONA_WAKTU,
  });
}

/**
 * Tanggal panjang: `29 September 2026`.
 *
 * Untuk dokumen yang dibaca sekali dan diarsipkan — invoice, surat, badge
 * tenggat — di mana ruangnya ada dan kejelasannya lebih penting.
 */
export function tanggalPanjang(nilai: Date | string | number | null | undefined): string {
  const d = keTanggal(nilai);
  if (!d) return '—';

  return d.toLocaleDateString(LOKAL, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: ZONA_WAKTU,
  });
}

/**
 * Tanggal dengan jam: `29 Sep 2026, 14.30`.
 *
 * Untuk jejak waktu yang jamnya bermakna: pesan masuk, perubahan status,
 * pembayaran diterima.
 */
export function tanggalJam(nilai: Date | string | number | null | undefined): string {
  const d = keTanggal(nilai);
  if (!d) return '—';

  return d.toLocaleString(LOKAL, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA_WAKTU,
  });
}

/**
 * Kunci tanggal `YYYY-MM-DD` di zona WIB.
 *
 * BUKAN untuk ditampilkan — ini yang masuk ke `?date=` dan dibandingkan dengan
 * tanggal pesanan. `toISOString().slice(0, 10)` salah untuk keperluan ini
 * karena ia memotong di UTC: tanggal 1 Oktober pukul 06.00 WIB menjadi
 * `2026-09-30`, dan kalender ketersediaan lalu menyorot hari yang salah.
 *
 * `en-CA` dipakai karena ia satu-satunya locale baku yang memformat
 * `YYYY-MM-DD`. Locale-nya tidak pernah terlihat pengguna; hanya urutannya
 * yang dipakai.
 */
export function kunciTanggal(nilai: Date | string | number | null | undefined): string {
  const d = keTanggal(nilai);
  if (!d) return '';

  return d.toLocaleDateString('en-CA', { timeZone: ZONA_WAKTU });
}
