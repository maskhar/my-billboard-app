// src/lib/sandi.ts
//
// Aturan password: satu tempat, satu biaya hash.
//
// KENAPA INI DIKUMPULKAN
// ----------------------
// Ada tiga tempat di repo ini yang menulis hash password, dan ketiganya menulis
// aturannya sendiri:
//
//   - `api/register`            → cost 12, minimal 8 karakter, batas 72 byte
//   - `api/admin/users/create`  → cost 12, minimal 8 karakter, batas 72 byte
//   - `api/user/change-password`→ cost 10, TANPA batas minimal, TANPA batas 72
//
// Yang ketiga itu bukan kelonggaran yang disengaja, dan akibatnya berjalan
// searah: setiap pengguna yang MENGGANTI passwordnya diturunkan diam-diam dari
// cost 12 ke cost 10 — empat kali lebih murah ditebak secara offline bila
// database bocor — dan sekaligus diizinkan memasang password satu karakter yang
// ditolak saat ia mendaftar. Jadi tindakan yang dianjurkan kepada pengguna
// ("ganti password Anda secara berkala") justru melemahkan akunnya.
//
// Aturan yang hidup di tiga tempat akan menyimpang lagi. Di sini ia satu.
//
// BIAYA HASH TIDAK BOLEH DITURUNKAN
// ---------------------------------
// Cost 12 memakan ratusan milidetik CPU per hash, dan itu memang harganya:
// angka itulah yang membuat penebakan offline atas database yang bocor menjadi
// mahal. Menurunkannya untuk "mempercepat login" berarti mempercepat penyerang
// dengan faktor yang sama. Bila suatu saat dinaikkan, hash lama tetap sah —
// `bcrypt.compare` membaca cost dari hash itu sendiri — jadi kenaikan tidak
// perlu memaksa siapa pun mengganti passwordnya.

/**
 * Biaya bcrypt untuk SETIAP hash password baru di aplikasi ini.
 *
 * Diimpor, tidak pernah ditulis ulang sebagai angka di tempat pemakaian.
 */
export const BIAYA_HASH_SANDI = 12;

/** Panjang minimum password. */
export const PANJANG_SANDI_MIN = 8;

/**
 * Batas keras bcrypt: input dipotong di 72 byte.
 *
 * Ini bukan pilihan kami. Password yang lebih panjang diterima tanpa galat oleh
 * bcrypt, tetapi byte ke-73 dan seterusnya DIABAIKAN — artinya pengguna yang
 * mengetik kalimat panjang sebenarnya dilindungi hanya oleh 72 byte pertamanya,
 * dan bisa login dengan potongan itu saja. Menolaknya lebih jujur daripada
 * menyimpan hash atas potongan yang tidak pernah ia sebut.
 *
 * Dihitung dalam BYTE, bukan karakter: satu emoji memakan 4 byte, jadi batas
 * berbasis `.length` akan meloloskan password yang tetap terpotong.
 */
export const BYTE_SANDI_MAKS = 72;

export type HasilSandi =
  | { sah: true; nilai: string }
  | { sah: false; pesan: string };

/**
 * Periksa password yang akan disimpan.
 *
 * Tipenya dibuktikan lebih dulu, bukan hanya keberadaannya: `if (!password)`
 * meloloskan `{ "not": "" }` karena objek selalu truthy, dan nilai itu lalu
 * sampai ke `bcrypt.hash` — yang menolaknya dengan galat internal, jadi
 * pengguna membaca "Terjadi kesalahan pada server" untuk masalah pada isian
 * yang ia ketik sendiri.
 */
export function periksaSandiBaru(nilai: unknown): HasilSandi {
  if (typeof nilai !== 'string' || nilai === '') {
    return { sah: false, pesan: 'Password baru wajib diisi.' };
  }

  // TIDAK di-trim. Spasi di awal atau akhir adalah bagian dari password yang
  // pengguna ketik; membuangnya di sini berarti hash disimpan atas teks lain
  // daripada yang ia kira, dan `compare` saat login (yang tidak men-trim) tidak
  // akan pernah cocok.
  if (nilai.length < PANJANG_SANDI_MIN) {
    return { sah: false, pesan: `Password minimal ${PANJANG_SANDI_MIN} karakter.` };
  }

  if (Buffer.byteLength(nilai, 'utf8') > BYTE_SANDI_MAKS) {
    return {
      sah: false,
      pesan: `Password terlalu panjang (maksimal ${BYTE_SANDI_MAKS} karakter).`,
    };
  }

  return { sah: true, nilai };
}
