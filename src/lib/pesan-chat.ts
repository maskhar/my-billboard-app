// src/lib/pesan-chat.ts
//
// Isi satu pesan percakapan, dipastikan berupa teks yang layak disimpan.
//
// KENAPA FILE INI ADA
// -------------------
// `src/app/api/admin/chat/send/route.ts` memeriksa `sessionId` dengan `typeof`
// tetapi `message` hanya dengan `!message`:
//
//     if (typeof sessionId !== 'string' || sessionId.trim() === '' || !message)
//
// Komentar dua baris di atasnya justru sudah menjelaskan kenapa pemeriksaan tipe
// dibutuhkan — penjelasan itu hanya diterapkan pada satu dari dua bidangnya.
// Objek selalu truthy, jadi `{"sessionId":"<sesi nyata>","message":{"a":1}}`
// lolos gerbang itu utuh, sampai ke `chatMessage.create` pada kolom String, dan
// Prisma menolaknya sebagai galat validasi — yang muncul ke petugas sebagai 500
// "Gagal kirim" yang bisa dipicu siapa pun yang punya satu id sesi.
//
// KENAPA ADA BATAS PANJANG
// ------------------------
// `chat-server/index.js:339` memotong isi pesan pada 4000 karakter
// (`BATAS_PANJANG_PESAN`), tapi kedua route Next (`send` dan `reply`) tidak
// membatasinya sama sekali. Jadi jalur socket menahan pesan sepanjang megabyte
// sementara jalur HTTP di sebelahnya menyimpannya utuh — satu kolom `String`
// tanpa batas di database, lalu dikirim ke setiap petugas yang membuka
// percakapan itu.
//
// Angkanya SENGAJA sama dengan `BATAS_PANJANG_PESAN` di chat-server. Keduanya
// menulis ke kolom `ChatMessage.message` yang sama, dan batas yang berbeda
// berarti pesan yang ditolak di satu jalur diterima di jalur lain untuk
// percakapan yang sama. KALAU SALAH SATU DIUBAH, UBAH JUGA YANG LAIN — sama
// seperti pasangan `src/lib/rate-limit.ts` dan `chat-server/rate-limit.js`.
//
// Bedanya perlakuan, dan itu disengaja: chat-server MEMOTONG karena ia melayani
// socket tamu yang tidak punya jalur membalas galat per pesan, sedangkan route
// HTTP MENOLAK dengan 400 karena ia punya. Menyimpan pesan yang dipotong diam-
// diam pada jalur yang bisa menjawab berarti petugas membaca pesan yang bukan
// pesan yang dikirim orang itu.

/**
 * Batas panjang isi satu pesan.
 *
 * Kembaran `BATAS_PANJANG_PESAN` di `chat-server/index.js`. Lihat catatan di
 * kepala berkas sebelum mengubahnya.
 */
export const PANJANG_PESAN_CHAT_MAKS = 4000;

/**
 * Isi pesan yang layak disimpan, atau `null`.
 *
 * Yang ditolak: nilai bukan teks (objek — termasuk filter Prisma —, angka,
 * `null`, `undefined`, array, boolean), teks yang hanya berisi spasi, dan teks
 * yang melewati batas panjang. Yang diterima dipangkas spasi tepinya.
 *
 * Pemanggilnya membalas 400, bukan 500: bentuk permintaannya yang salah, bukan
 * server yang rusak.
 */
export function teksPesanChat(nilai: unknown): string | null {
  if (typeof nilai !== 'string') return null;

  const rapi = nilai.trim();
  if (rapi === '') return null;
  if (rapi.length > PANJANG_PESAN_CHAT_MAKS) return null;

  return rapi;
}
