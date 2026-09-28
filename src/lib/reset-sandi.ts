// src/lib/reset-sandi.ts
//
// Aturan token reset sandi: satu tempat, satu umur, satu bentuk hash.
//
// KENAPA MODUL SENDIRI
// --------------------
// Tokennya disentuh dua route (`request-reset` menerbitkan, `reset-password`
// menukar) dan satu halaman. Bila cara meng-hash-nya ditulis dua kali, cukup
// satu penulis memakai `sha512` atau menambah `.trim()` untuk membuat setiap
// token yang diterbitkan tidak pernah bisa ditukar — dan bentuk kegagalannya
// adalah "tautannya tidak berfungsi", yang terbaca seperti masalah email.
//
// KENAPA SHA-256, BUKAN BCRYPT
// ----------------------------
// Bcrypt benar untuk sandi karena sandi berasal dari kepala manusia: ruang
// tebakannya kecil, jadi setiap tebakan harus dibuat mahal. Token di sini 32
// byte dari `randomBytes` — 256 bit acak. Tidak ada kamus yang menjangkaunya,
// jadi memperlambat tebakan tidak menambah keamanan apa pun.
//
// Yang justru DIBUTUHKAN dan tidak bisa diberikan bcrypt: hash-nya harus
// deterministik, supaya barisnya bisa dicari lewat indeks unik. Hash bcrypt
// memuat salt acak per pemanggilan, jadi mencari baris dengannya berarti membaca
// SELURUH tabel token lalu membandingkan satu per satu — biaya yang naik seiring
// tabel dan permukaan yang sama sekali tidak perlu.
//
// KENAPA TIDAK `timingSafeEqual` DI SINI
// --------------------------------------
// `src/lib/xendit.ts` dan `cron/sweep/route.ts` memakai `timingSafeEqual` karena
// keduanya membandingkan rahasia yang diketahui server dengan nilai dari
// pemanggil, di dalam proses ini, byte per byte — dan `===` pada string keluar
// di byte pertama yang berbeda. Di sini tidak ada perbandingan seperti itu:
// barisnya DICARI oleh Postgres lewat indeks unik atas hash, dan yang dikirim ke
// database adalah hash — bukan tokennya. Tidak ada tempat memasang
// `timingSafeEqual` yang berarti, dan memasangnya atas hash yang sudah cocok
// hanya akan menciptakan kesan perlindungan yang tidak ada.
//
// UMUR TOKEN
// ----------
// Satu jam. Tautan reset adalah kunci sementara ke sebuah akun, dan kunci itu
// mendarat di kotak masuk — tempat yang tidak selalu di bawah kendali
// pemiliknya (perangkat bersama, sesi mail yang tertinggal terbuka, arsip yang
// ikut ter-backup). Semakin panjang umurnya, semakin lama kunci itu berlaku bagi
// siapa pun yang membaca kotak masuk itu nanti. Satu jam cukup untuk membuka
// email dan mengetik sandi baru, dan tidak cukup untuk menjadi kunci cadangan.

import { createHash, randomBytes } from 'node:crypto';

/** Umur satu token reset, dalam milidetik. */
export const UMUR_TOKEN_RESET_MS = 60 * 60 * 1000;

/**
 * Jumlah byte acak per token.
 *
 * 32 byte = 256 bit. Dikirim sebagai heksadesimal (64 karakter), bukan base64url:
 * token ini masuk ke query string di dalam tautan email, dan sebagian klien
 * email memotong atau meng-escape karakter di luar `[0-9a-f]`. Panjangnya bukan
 * masalah — tidak ada manusia yang mengetiknya.
 */
const BYTE_TOKEN = 32;

/** Bentuk token yang sah: tepat 64 heksadesimal huruf kecil. */
const POLA_TOKEN = /^[0-9a-f]{64}$/;

/**
 * Terbitkan satu token baru.
 *
 * Mengembalikan keduanya sekaligus, dan itu disengaja: yang MENTAH hanya boleh
 * masuk ke tautan email, yang HASH hanya boleh masuk ke database. Fungsi yang
 * mengembalikan satu nilai lalu meminta pemanggil meng-hash-nya sendiri adalah
 * cara token mentah tersimpan di database tanpa ada yang menyadarinya.
 */
export function terbitkanTokenReset(): { mentah: string; hash: string } {
  const mentah = randomBytes(BYTE_TOKEN).toString('hex');
  return { mentah, hash: hashTokenReset(mentah) };
}

/**
 * Hash yang disimpan untuk sebuah token mentah.
 *
 * TIDAK men-`trim` dan tidak menurunkan huruf: token datang dari query string
 * tautan yang kita susun sendiri, jadi bentuknya pasti. Menormalkannya di sini
 * berarti dua teks berbeda memetakan ke satu baris — persis kelonggaran yang
 * tidak dibutuhkan pembanding kredensial.
 */
export function hashTokenReset(mentah: string): string {
  return createHash('sha256').update(mentah, 'utf8').digest('hex');
}

/**
 * Apakah teks ini berbentuk token yang pernah kita terbitkan.
 *
 * Diperiksa SEBELUM menyentuh database: tanpa ini, setiap teks apa pun di query
 * string menjadi satu query ke tabel token, dan itu jalur yang bisa dipanggil
 * tanpa sesi. Pemeriksaan bentuk tidak mengurangi keamanan — token yang sah
 * selalu lolos — tapi ia membuat sampah berhenti sebelum biayanya keluar.
 */
export function bentukTokenSah(nilai: unknown): nilai is string {
  return typeof nilai === 'string' && POLA_TOKEN.test(nilai);
}

/**
 * Apakah baris token ini masih bisa ditukar pada waktu `sekarang`.
 *
 * Tiga syaratnya ditulis di satu tempat supaya route penukar tidak bisa lupa
 * salah satunya. Yang paling mudah terlupa adalah `usedAt`: tanpa itu, satu
 * tautan reset bisa dipakai berulang kali selama belum kedaluwarsa, sehingga
 * siapa pun yang pernah membaca email itu tetap memegang kunci akun walaupun
 * pemiliknya sudah mengganti sandinya.
 */
export function tokenMasihBisaDipakai(
  baris: { expiresAt: Date; usedAt: Date | null } | null | undefined,
  sekarang: Date
): boolean {
  if (!baris) return false;
  if (baris.usedAt !== null) return false;
  return baris.expiresAt.getTime() > sekarang.getTime();
}

/**
 * Tautan reset yang dikirim lewat email.
 *
 * `origin` datang dari `originAplikasi()` — konfigurasi server, BUKAN header
 * permintaan. Alasannya sama dengan yang ditulis panjang di `src/lib/xendit.ts`,
 * dan di sini akibatnya bahkan lebih langsung: bila origin diambil dari header
 * `Host` atau `X-Forwarded-Host`, penyerang yang memicu reset atas alamat orang
 * lain bisa membuat email resmi kita memuat tautan ke host MILIKNYA — dan
 * korban yang mengklik menyerahkan tokennya. Itu mengubah fitur pemulihan akun
 * menjadi alat pengambilalihan akun.
 */
export function tautanResetSandi(origin: string, tokenMentah: string): string {
  return `${origin}/reset-password?token=${encodeURIComponent(tokenMentah)}`;
}
