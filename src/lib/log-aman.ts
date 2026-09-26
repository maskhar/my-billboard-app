// src/lib/log-aman.ts
//
// Penyamar data pribadi untuk log aplikasi.
//
// KENAPA INI PERLU
// ----------------
// Log adalah salinan data yang paling mudah dilupakan. Ia mengalir ke stdout
// proses, lalu ke penampung log penyedia hosting, lalu ke siapa pun yang punya
// akses ke dashboard itu — termasuk pihak ketiga yang tidak pernah
// dipertimbangkan saat barisnya ditulis. Ia juga bertahan jauh lebih lama
// daripada masa simpan yang dijanjikan kebijakan privasi, karena tidak ada
// seorang pun yang menghapus log lama satu per satu.
//
// Alamat email pembeli adalah data pribadi. Mencetaknya utuh pada setiap surat
// yang terkirim berarti membangun daftar seluruh pelanggan di tempat yang tidak
// pernah dimaksudkan menyimpan daftar pelanggan.
//
// YANG DILAKUKAN DAN TIDAK DILAKUKAN
// ----------------------------------
// Hasilnya masih cukup untuk pekerjaan yang membuat log itu ditulis: menelusuri
// "surat ke pembeli mana yang gagal" pada satu rentang waktu, dengan alamat yang
// sudah diketahui dari database. Yang hilang justru kemampuan MEMBACA daftarnya
// dari log saja.
//
// Ini bukan hashing dan bukan enkripsi. Nilai asli tidak bisa dipulihkan dari
// hasilnya, tapi nilai yang sudah diketahui bisa dicocokkan — persis sifat yang
// dibutuhkan untuk menelusuri, dan alasan ia tidak boleh dipakai untuk apa pun
// selain log.

/**
 * Alamat email yang aman dicetak ke log.
 *
 * `budi.santoso@contoh.test` → `b***o@contoh.test`
 *
 * Domain dibiarkan utuh: ia bukan pengenal satu orang, dan justru bagian yang
 * berguna saat menelusuri kegagalan SMTP yang mengelompok pada satu penyedia
 * surat.
 *
 * Nilai yang bukan teks atau bukan alamat dikembalikan sebagai penanda, bukan
 * dilempar: pemanggilnya sedang menulis log, dan log yang menggagalkan
 * permintaan adalah kerugian yang jauh lebih besar daripada log yang kabur.
 */
export function samarkanEmail(nilai: unknown): string {
  if (typeof nilai !== 'string') return '(bukan-teks)';

  const rapi = nilai.trim();
  if (rapi === '') return '(kosong)';

  const pemisah = rapi.lastIndexOf('@');
  // Tanpa `@` nilainya bukan alamat dan tidak diketahui isinya. Menyamarkan
  // seluruhnya lebih aman daripada menebak bagian mana yang tidak sensitif.
  if (pemisah <= 0 || pemisah === rapi.length - 1) return '***';

  const nama = rapi.slice(0, pemisah);
  const domain = rapi.slice(pemisah + 1);

  // Nama sependek satu atau dua karakter tidak punya bagian yang bisa dibuang
  // tanpa menjadi alamat kosong; disamarkan seluruhnya.
  if (nama.length <= 2) return `***@${domain}`;

  return `${nama[0]}***${nama[nama.length - 1]}@${domain}`;
}
