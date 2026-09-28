// src/lib/riwayat-chat.ts
//
// Paginasi riwayat percakapan, satu sumber untuk KEDUA pembacanya.
//
// Ada dua tempat yang perlu memuat pesan lama, dan keduanya punya cacat yang
// sama tapi dengan wajah berbeda:
//
//  1. Kotak masuk CS memuat 200 pesan terakhir lalu berhenti. Ia sudah
//     mengatakan riwayatnya dipotong (`adaRiwayatLebihLama`), tapi tidak punya
//     satu pun jalur untuk mengambil sisanya — pemberitahuan tanpa jalan
//     keluar.
//  2. Widget tamu tidak memuat riwayat SAMA SEKALI. Tamu yang kembali membawa
//     `utero_chat_token` berhasil `joinRoom` dan melihat kotak KOSONG,
//     walaupun seluruh percakapannya tersimpan di database.
//
// Keduanya adalah pertanyaan yang sama — "berikan pesan yang lebih lama dari
// titik ini" — dan jawabannya ditulis satu kali di sini. Kalau ditulis dua
// kali, yang satu akan memakai OFFSET dan yang lain keyset, lalu keduanya
// menyimpang pada percakapan yang sedang aktif (lihat di bawah).
//
// Modul ini TIDAK mengimpor `server-only`, `@/lib/prisma`, maupun apa pun dari
// `@prisma/client`: chat-server adalah proses Node terpisah tanpa langkah
// build, jadi logika yang sama perlu bisa diuji langsung dan dijelaskan tanpa
// menyeret runtime Prisma ke mana-mana. Yang di sini hanyalah bentuk kuerinya
// dan pemotongnya; yang menjalankan kueri tetap pemanggil.

/** Jumlah pesan per halaman riwayat. */
export const PESAN_PER_HALAMAN = 50;

/**
 * Pesan terakhir yang dimuat saat satu percakapan pertama kali dibuka.
 *
 * Sengaja lebih besar daripada satu halaman: CS yang membuka percakapan
 * hampir selalu cukup dengan ini, dan "muat lebih lama" adalah jalur
 * pengecualian — bukan langkah yang wajib ditempuh setiap kali.
 */
export const PESAN_TERAKHIR = 200;

/**
 * Riwayat yang dimuat sekaligus untuk TAMU di widget.
 *
 * Lebih kecil daripada milik CS dengan alasan yang berbeda dari kecepatan:
 * widget-nya setinggi 500px dan tidak punya tombol muat-lama, jadi pesan yang
 * dikirim melebihi ini tidak akan pernah dibaca siapa pun — ia hanya
 * membengkakkan payload socket pada koneksi seluler.
 */
export const PESAN_RIWAYAT_TAMU = 50;

/** Satu baris pesan sebagaimana tersimpan (`createdAt` masih objek `Date`). */
export type BarisPesanChat = {
  id: string;
  sessionId: string;
  sender: string;
  message: string;
  createdAt: Date;
};

/**
 * Titik potong halaman: pesan TERTUA yang sudah ada di layar.
 *
 * Keduanya dibawa, bukan `createdAt` saja. `ChatMessage.createdAt` berasal
 * dari `@default(now())` dan dua pesan bisa lahir pada milidetik yang sama —
 * satu pesan tamu dan balasan BOT atasnya, misalnya, karena keduanya ditulis
 * dalam satu penanganan `sendMessage`. Dengan `createdAt` saja, salah satunya
 * hilang dari halaman berikutnya atau muncul dua kali, tergantung ke arah mana
 * perbandingannya dibulatkan.
 */
export type KursorRiwayat = {
  id: string;
  createdAt: Date;
};

/**
 * Klausa `where` untuk mengambil pesan yang LEBIH LAMA dari kursor.
 *
 * Keyset, bukan `skip`/OFFSET. Bedanya nyata justru di percakapan yang sedang
 * berlangsung: OFFSET dihitung dari ujung daftar, dan setiap pesan baru yang
 * masuk selagi CS membaca menggeser seluruh daftar satu langkah — halaman
 * berikutnya lalu MENGULANG satu pesan yang sudah terbaca dan MELEWATKAN satu
 * yang belum. Kursor menunjuk baris tertentu, jadi pesan baru di ujung lain
 * daftar tidak menggesernya.
 *
 * `OR` di bawah adalah perbandingan leksikografis `(createdAt, id)`: lebih
 * lama, atau sama waktunya tapi id-nya lebih kecil. Urutan kueri wajib
 * `[{ createdAt: 'desc' }, { id: 'desc' }]` agar cocok dengan ini — kalau
 * `id` dihilangkan dari `orderBy`, dua pesan berwaktu sama bisa datang dalam
 * urutan berbeda antar-panggilan dan kursornya menunjuk ke tempat yang salah.
 */
export function syaratLebihLama(sessionId: string, kursor: KursorRiwayat) {
  return {
    sessionId,
    OR: [
      { createdAt: { lt: kursor.createdAt } },
      { createdAt: kursor.createdAt, id: { lt: kursor.id } },
    ],
  };
}

/**
 * `orderBy` yang HARUS dipakai bersama `syaratLebihLama`.
 *
 * Fungsi, bukan konstanta. Dua alasan, dan keduanya praktis. Pertama, Prisma
 * menuntut array yang BOLEH diubah (`OrderByInput[]`), sedangkan konstanta
 * `as const` adalah tuple `readonly` dan ditolak compiler. Kedua, array yang
 * dibagi ke semua pemanggil adalah array yang bisa disortir ulang oleh salah
 * satunya — dan urutan ini adalah pasangan wajib kursornya, bukan preferensi.
 */
export function urutanTerbaruDulu(): [
  { createdAt: 'desc' },
  { id: 'desc' },
] {
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}

/** Kolom pesan yang memang dipakai layar, ditulis eksplisit. */
export const PILIH_PESAN = {
  id: true,
  sessionId: true,
  sender: true,
  message: true,
  createdAt: true,
} as const;

/**
 * Satu halaman riwayat, sudah dalam urutan lama-ke-baru.
 *
 * `adaLagi` diturunkan dari baris KELEBIHAN, bukan dari `count` kedua: kueri
 * mengambil `batas + 1` baris, dan kalau yang kembali lebih banyak daripada
 * batasnya berarti masih ada yang lebih lama. Satu kueri, bukan dua.
 */
export type HalamanRiwayat<T> = {
  pesan: T[];
  adaLagi: boolean;
};

/**
 * Ambil pesan `take` untuk kueri berbatas `batas`.
 *
 * Dipisah menjadi fungsi sendiri supaya `+ 1` tidak ditulis ulang di setiap
 * pemanggil — tepat satu tempat yang lupa menambahkannya sudah cukup untuk
 * membuat `adaLagi` selamanya `false`, dan tombol "muat lama" hilang di
 * percakapan yang justru paling panjang.
 */
export function takeDenganPengintip(batas: number): number {
  return batas + 1;
}

/**
 * Potong hasil kueri `desc` menjadi satu halaman urut lama-ke-baru.
 *
 * `baris` adalah hasil apa adanya dari kueri berurutan terbaru-duluan dengan
 * `take: takeDenganPengintip(batas)`.
 */
export function potongHalaman<T>(baris: T[], batas: number): HalamanRiwayat<T> {
  const adaLagi = baris.length > batas;
  const terpakai = adaLagi ? baris.slice(0, batas) : baris;
  // `slice()` sebelum `reverse()`: `reverse()` membalik array DI TEMPAT, dan
  // `baris` masih milik pemanggil — membaliknya diam-diam berarti pemanggil
  // yang membaca `baris[0]` setelah ini mendapat baris yang berbeda.
  return { pesan: terpakai.slice().reverse(), adaLagi };
}

/**
 * Bentuk kursor dari pesan tertua yang sudah tampil.
 *
 * Mengembalikan `null` bila belum ada pesan sama sekali — halaman pertama
 * tidak punya kursor, dan itu bukan galat.
 */
export function kursorDari(pesan: BarisPesanChat[]): KursorRiwayat | null {
  const tertua = pesan[0];
  return tertua ? { id: tertua.id, createdAt: tertua.createdAt } : null;
}
