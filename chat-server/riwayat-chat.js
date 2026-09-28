// chat-server/riwayat-chat.js
//
// Salinan CommonJS dari `src/lib/riwayat-chat.ts`.
//
// Kenapa disalin, bukan diimpor: chat-server berjalan sebagai proses Node
// terpisah tanpa langkah build, jadi ia tidak bisa memuat modul TypeScript di
// `src/`. Antarmukanya sengaja dibuat sama persis.
//
// KALAU SALAH SATU DIUBAH, UBAH JUGA YANG LAIN.
//
// Yang disalin di sini bukan kerapian, melainkan satu keputusan yang harus
// SAMA di kedua sisi: paginasinya keyset `(createdAt, id)`, bukan OFFSET.
// Kotak masuk CS dan widget tamu membaca tabel yang sama, dan pada percakapan
// yang sedang aktif kedua cara itu memberi hasil yang berbeda — OFFSET
// dihitung dari ujung daftar, jadi setiap pesan baru yang masuk selagi
// halaman berikutnya diminta membuatnya MENGULANG satu pesan yang sudah
// terbaca dan MELEWATKAN satu yang belum. Kalau satu sisi memakai keyset dan
// sisi lain OFFSET, cacatnya hanya muncul di percakapan tersibuk.

/** Jumlah pesan per halaman riwayat. */
const PESAN_PER_HALAMAN = 50;

/**
 * Riwayat yang dimuat sekaligus untuk TAMU di widget.
 *
 * Lebih kecil daripada milik CS dengan alasan yang berbeda dari kecepatan:
 * widget-nya setinggi 500px dan tidak punya tombol muat-lama, jadi pesan yang
 * dikirim melebihi ini tidak akan pernah dibaca siapa pun — ia hanya
 * membengkakkan payload socket pada koneksi seluler.
 */
const PESAN_RIWAYAT_TAMU = 50;

/** Kolom pesan yang memang dipakai layar, ditulis eksplisit. */
const PILIH_PESAN = {
  id: true,
  sessionId: true,
  sender: true,
  message: true,
  createdAt: true,
};

/**
 * Klausa `where` untuk mengambil pesan yang LEBIH LAMA dari kursor.
 *
 * `OR` di bawah adalah perbandingan leksikografis `(createdAt, id)`: lebih
 * lama, atau sama waktunya tapi id-nya lebih kecil. `id` ikut karena
 * `ChatMessage.createdAt` berasal dari `@default(now())` dan dua pesan bisa
 * lahir pada milidetik yang sama — pesan tamu dan balasan BOT atasnya ditulis
 * dalam satu penanganan `sendMessage` di file ini, jadi ini bukan kasus
 * teoretis.
 */
function syaratLebihLama(sessionId, kursor) {
  return {
    sessionId,
    OR: [
      { createdAt: { lt: kursor.createdAt } },
      { createdAt: kursor.createdAt, id: { lt: kursor.id } },
    ],
  };
}

/** `orderBy` yang HARUS dipakai bersama `syaratLebihLama`. */
function urutanTerbaruDulu() {
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}

/**
 * Ambil `take` untuk kueri berbatas `batas`.
 *
 * `+ 1` adalah cara mengetahui masih ada riwayat yang lebih lama tanpa `count`
 * kedua: kalau yang kembali lebih banyak daripada batasnya, baris kelebihannya
 * dibuang dan pemanggil diberi tahu.
 */
function takeDenganPengintip(batas) {
  return batas + 1;
}

/** Potong hasil kueri `desc` menjadi satu halaman urut lama-ke-baru. */
function potongHalaman(baris, batas) {
  const adaLagi = baris.length > batas;
  const terpakai = adaLagi ? baris.slice(0, batas) : baris;
  // `slice()` sebelum `reverse()`: `reverse()` membalik array DI TEMPAT, dan
  // `baris` masih milik pemanggil.
  return { pesan: terpakai.slice().reverse(), adaLagi };
}

module.exports = {
  PESAN_PER_HALAMAN,
  PESAN_RIWAYAT_TAMU,
  PILIH_PESAN,
  syaratLebihLama,
  urutanTerbaruDulu,
  takeDenganPengintip,
  potongHalaman,
};
