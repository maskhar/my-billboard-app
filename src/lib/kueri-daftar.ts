// src/lib/kueri-daftar.ts
//
// Pembaca parameter URL untuk daftar admin: pilihan dari daftar tertutup, dan
// kata kunci pencarian.
//
// KENAPA FILE INI ADA
// -------------------
// Butir audit 5.20 berbunyi "filter & sort pada tabel admin". Premisnya sudah
// sebagian basi — dua dari empat daftar sudah punya saringan status — tapi yang
// ditemukan saat memeriksanya lebih buruk daripada fitur yang belum ada:
//
//  1. **Saringan status di `orders` tidak diperiksa terhadap daftar yang sah.**
//     `paramsQuery.status || 'ALL'` diterima apa adanya lalu dibandingkan dengan
//     deretan `if`. `?status=SELESAI` (nama tab dalam Bahasa Indonesia, yang
//     wajar diketik orang) tidak cocok dengan satu pun `if`, jadi `whereClause`
//     tetap kosong dan SELURUH transaksi ditampilkan — sementara tidak satu pun
//     tab tersorot. Admin membaca daftar itu sebagai "hasil saringan", padahal
//     ia adalah seluruh tabel. `pengajuan` sudah memeriksanya lewat
//     `nilaiEnumSah`; `orders` tidak, karena nilainya bukan enum Prisma
//     melainkan gabungan status buatan tab.
//
//  2. **Pencarian di `orders` hanya memeriksa 25 baris halaman ini.** Butir 5.19
//     ("search box yang mati") ditandai tuntas dengan `useState` + `filter` di
//     komponen client — dan itu berlaku HANYA atas baris yang sedang dikirim.
//     Di halaman yang sama, headernya menulis jumlah SELURUH tabel dan keadaan
//     kosongnya menulis `Tidak ada pesanan yang cocok dengan "…"` setelah
//     memeriksa 25 dari, katakanlah, 4.000 baris. Itu bukan pencarian yang
//     kurang lengkap, itu jawaban yang salah: pesanan yang dicari ADA, dan
//     sistem menyatakan ia tidak ada.
//
// Aturannya disatukan di sini karena empat halaman daftar akan membacanya, dan
// aturan yang ditulis empat kali adalah aturan yang akan menyimpang — cacat
// yang persis sama sudah terjadi pada nomor halaman (lihat `src/lib/paginasi.ts`).
//
// KENAPA NOL IMPOR
// ----------------
// Sama seperti `src/lib/paginasi.ts` dan `src/lib/tanggal.ts`: modul ini dipakai
// dari Server Component dan bisa di-`require` langsung di test tanpa satu pun
// mock. Menarik `@prisma/client` ke sini membuat itu tidak mungkin — dan
// `bacaPilihan` di bawah memang TIDAK boleh terikat ke enum Prisma, karena nilai
// yang dijaganya (`PENDING`, `PROGRESS`, `judul-naik`) bukan enum apa pun.

/**
 * Batas panjang kata kunci pencarian.
 *
 * Bukan soal keamanan — Prisma memparameterkan nilainya, jadi tidak ada yang
 * bisa disuntikkan. Dua alasan lain:
 *
 *  - Kata kunci ikut DIBAWA ke setiap tautan paginasi dan setiap tautan urut.
 *    Kata kunci 8 KB menjadikan setiap tombol di halaman itu URL 8 KB, dan
 *    server HTTP menolak URL panjang dengan 431 — tombol "Berikutnya" berhenti
 *    bekerja tanpa satu pun pesan.
 *  - `contains` atas teks sepanjang itu adalah pekerjaan database yang tidak
 *    mungkin dimaksudkan siapa pun.
 *
 * 80 karakter: lebih panjang daripada nama terpanjang, alamat email terpanjang,
 * dan judul billboard terpanjang yang masuk akal.
 */
export const PANJANG_KATA_KUNCI_MAKS = 80;

/**
 * Ambil satu nilai dari parameter yang mungkin diserahkan Next sebagai array.
 *
 * Next menyerahkan ARRAY untuk parameter ganda (`?status=A&status=B`). Kode yang
 * mengira nilainya selalu teks akan membandingkan array dengan teks — hasilnya
 * selalu `false`, jadi saringannya diam-diam jatuh ke nilai baku. Cacat yang
 * sama pada nomor halaman menghasilkan `Number(['2','5']) === NaN`.
 */
function satuNilai(mentah: string | string[] | undefined | null): string | undefined {
  const satu = Array.isArray(mentah) ? mentah[0] : mentah;
  if (satu === undefined || satu === null) return undefined;
  return String(satu);
}

/**
 * Terima `mentah` hanya bila ia anggota `pilihan`; kalau tidak, kembalikan
 * `baku`.
 *
 * `pilihan` adalah daftar TERTUTUP — nama tab, kunci urut — bukan enum Prisma.
 * Itu sebabnya fungsi ini ada di samping `nilaiEnumSah` alih-alih menggantinya:
 * `nilaiEnumSah` membaca `Object.values` sebuah objek enum, dan tidak satu pun
 * nilai yang dijaga di sini punya objek enum.
 *
 * Nilai asing DIJATUHKAN KE BAKU, bukan dilempar sebagai galat. Alasannya: URL
 * daftar admin disalin ke chat dan di-bookmark, dan satu karakter yang tercemar
 * tidak boleh menghasilkan layar galat penuh. Yang harus dihindari bukan
 * galatnya, melainkan keadaan di mana nilai asing membuat saringannya HILANG
 * tanpa suara — dan nilai baku yang eksplisit justru menutup itu, karena tab
 * yang tersorot selalu cocok dengan baris yang ditampilkan.
 */
export function bacaPilihan<T extends string>(
  mentah: string | string[] | undefined | null,
  pilihan: readonly T[],
  baku: T,
): T {
  const satu = satuNilai(mentah);
  if (satu === undefined) return baku;

  // `includes` atas array yang disempitkan `readonly T[]` menolak `string`,
  // jadi perbandingannya dikerjakan lewat `find` pada nilai yang sudah teks.
  const cocok = pilihan.find((p) => p === satu);
  return cocok === undefined ? baku : cocok;
}

/**
 * Bersihkan kata kunci pencarian dari URL.
 *
 * Yang dikerjakan dan kenapa:
 *
 *  - Array → nilai pertama (alasan di `satuNilai`).
 *  - Spasi di ujung dibuang. Kata kunci yang disalin dari spreadsheet hampir
 *    selalu membawa spasi ikutan, dan `contains: 'Budi '` tidak cocok dengan
 *    satu baris pun.
 *  - Spasi berurutan di tengah diringkas menjadi satu. `'Budi   Santoso'`
 *    dan `'Budi Santoso'` adalah pencarian yang sama menurut orang yang
 *    mengetiknya.
 *  - Dipotong di `PANJANG_KATA_KUNCI_MAKS`.
 *  - Teks kosong menjadi `''`, BUKAN `undefined`: pemanggil memakai `''` sebagai
 *    "tidak ada pencarian", dan `urlHalaman` sudah membuang nilai kosong dari
 *    tautan, jadi `?q=` tidak pernah ikut tertulis.
 */
export function bacaKataKunci(
  mentah: string | string[] | undefined | null,
  maks: number = PANJANG_KATA_KUNCI_MAKS,
): string {
  const satu = satuNilai(mentah);
  if (satu === undefined) return '';

  const batas = Number.isFinite(maks) && maks >= 1 ? Math.floor(maks) : PANJANG_KATA_KUNCI_MAKS;

  return satu.replace(/\s+/g, ' ').trim().slice(0, batas);
}
