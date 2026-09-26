// src/lib/id-dari-body.ts
//
// Pengenal yang datang dari body permintaan, dipastikan berupa teks.
//
// KENAPA INI BUKAN SOAL KERAPIAN
// ------------------------------
// Prisma memperlakukan objek di dalam `where` sebagai FILTER, bukan sebagai
// nilai. Artinya:
//
//     const { id } = await req.json();            // { "not": "" }
//     await tx.booking.deleteMany({ where: { userId: id } });
//
// tidak menghapus satu baris milik satu pengguna, melainkan SETIAP baris yang
// `userId`-nya bukan teks kosong — yaitu seluruh tabel. Yang dikirim penyerang
// bukan id yang salah; yang ia kirim adalah kueri.
//
// `if (!id) return 400` TIDAK menahan ini. Objek selalu truthy, jadi
// pemeriksaan keberadaan meloloskannya utuh. Yang menahannya hanya pemeriksaan
// TIPE.
//
// Akibatnya berbeda menurut operasinya, dan keduanya perlu ditutup:
//
//   - `findMany`, `findFirst`, `updateMany`, `deleteMany`, dan field apa pun
//     yang bersarang di bawah `NOT`/`AND`/`OR` menerima filter. Di sini objek
//     berarti PENULISAN ATAU PEMBACAAN MASSAL.
//   - `findUnique`, `update`, `delete` menuntut nilai skalar, jadi objek
//     ditolak validator Prisma sebagai `PrismaClientValidationError`. Itu
//     bukan aman — hasilnya 500 yang bisa dipicu siapa pun, dan sekali operasi
//     itu diganti ke bentuk `*Many` (hal yang wajar terjadi saat menambahkan
//     syarat balapan) batasnya hilang tanpa ada yang menyadarinya.
//
// Karena itu penjagaannya dipasang di SETIAP jalur, bukan hanya di yang hari
// ini bisa dieksploitasi.

/** Batas panjang yang wajar untuk id: `cuid()` 25 karakter, `uuid` 36. */
const PANJANG_ID_MAKS = 128;

/**
 * Pengenal dari body, atau `null` bila nilainya bukan teks yang terpakai.
 *
 * Yang ditolak: objek (filter Prisma), angka, `null`, `undefined`, array, dan
 * teks yang hanya berisi spasi. Yang diterima dipangkas spasinya.
 *
 * Panjangnya dibatasi karena id masuk ke kueri database: teks sepanjang
 * megabyte bukan id yang salah ketik, ia beban yang dikirim dengan sengaja.
 *
 * Pemanggilnya membalas 400, bukan 500 — bentuk permintaannya yang salah,
 * bukan server yang rusak.
 */
export function idDariBody(nilai: unknown): string | null {
  if (typeof nilai !== 'string') return null;

  const rapi = nilai.trim();
  if (rapi === '') return null;
  if (rapi.length > PANJANG_ID_MAKS) return null;

  return rapi;
}

/**
 * `true` bila nilainya layak dipakai sebagai pengenal di dalam `where`.
 *
 * Untuk pemanggil yang hanya perlu memutuskan tolak-atau-lanjut dan sudah
 * memakai nilai aslinya, misalnya karena nilai itu juga ikut ditulis ke kolom
 * lain.
 */
export function idSah(nilai: unknown): nilai is string {
  return idDariBody(nilai) !== null;
}
