// src/lib/telepon.ts
//
// Satu tempat untuk menafsirkan nomor telepon yang diketik pengguna.
//
// Nomor Indonesia ditulis dengan tiga cara yang semuanya benar menurut orang
// yang mengetiknya: `08123456789`, `628123456789`, `+62 812-3456-789`. Selama
// tiap tempat menafsirkannya sendiri, satu orang bisa tercatat tiga kali, dan
// nomor yang sama bisa diterima di satu halaman lalu ditolak di halaman lain.

/** Bentuk penyimpanan internal: kode negara tanpa tanda plus (`628123456789`). */
export function normalisasiNomorLokal(input: string): string {
  const digit = input.replace(/\D/g, '');
  if (digit.startsWith('0')) return '62' + digit.slice(1);
  if (digit.startsWith('62')) return digit;
  if (digit.startsWith('8')) return '62' + digit;
  return digit;
}

/** Nomor dalam format E.164: tanda plus, kode negara, lalu 7–14 digit. */
const POLA_E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Bentuk yang masih dianggap "orang mengetik nomor telepon": angka, dan pemisah
 * yang biasa dipakai orang untuk membaca nomornya sendiri. Tanda plus hanya sah
 * di awal.
 *
 * Huruf sengaja TIDAK masuk. Membuang huruf lalu memakai sisa angkanya berarti
 * `+62812ABC4567` pulang sebagai nomor yang kelihatan sah — nomor tebakan yang
 * mungkin milik orang lain, dan pembeli tidak pernah diberi tahu bahwa yang
 * dipakai bukan yang ia tulis.
 */
const POLA_KETIKAN = /^\+?[\d\s().-]+$/;

/**
 * Ubah nomor apa pun bentuknya menjadi E.164, atau `null` bila tidak mungkin.
 *
 * `null` dikembalikan, bukan nomor "usaha terbaik", karena satu-satunya pemakai
 * di luar tampilan adalah gerbang pembayaran — dan nomor yang bentuknya salah
 * di sana menggagalkan seluruh pembayaran, bukan cuma kolom nomornya. Lebih
 * baik pemanggil tahu nomornya tidak bisa dipakai dan meminta pembeli
 * memperbaikinya, daripada pembeli menekan Bayar lalu membaca galat yang tidak
 * menyebut nomor telepon sama sekali.
 */
export function keE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const teks = input.trim();
  if (!teks || !POLA_KETIKAN.test(teks)) return null;

  // Pemisah baca dibuang; tanda plus di awal tidak. Yang tersisa hanya dua
  // bentuk: internasional eksplisit, atau nomor lokal.
  const rapi = teks.replace(/[\s().-]/g, '');

  // Tanda plus menyatakan pemanggil sengaja menulis bentuk internasional. Bentuk
  // itu dinilai apa adanya, tidak pernah ditafsirkan ulang sebagai nomor
  // Indonesia: `+15551234567` bukan `+6215551234567`, dan `+0123456789` adalah
  // nomor yang salah, bukan `0123456789` milik operator lokal.
  if (rapi.startsWith('+')) return POLA_E164.test(rapi) ? rapi : null;

  const e164 = '+' + normalisasiNomorLokal(rapi);
  return POLA_E164.test(e164) ? e164 : null;
}
