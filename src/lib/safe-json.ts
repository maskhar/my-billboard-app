// src/lib/safe-json.ts
//
// Pembaca JSON yang tidak pernah mematikan halaman.
//
// Ada DUA bentuk penyimpanan JSON di database ini, dan masing-masing punya
// pembacanya sendiri di bawah. Memakai yang salah tidak akan ditolak compiler,
// jadi bedanya disebut terang di sini:
//
//   - `Billboard.gallery`, `.specs`, `.includes`, `.excludes` bertipe **jsonb**.
//     Prisma sudah menguraikannya, jadi yang diterima kode SUDAH berupa array
//     atau objek JavaScript. Pakai `arrayDariJson`.
//   - `BillboardHistory.snapshot` masih bertipe **String** berisi teks JSON.
//     Pakai `safeJsonArray`/`safeJsonParse`.
//
// Kenapa keduanya tetap perlu pengaman: satu baris database yang rusak membuat
// `JSON.parse` melempar, dan di React Server Component error itu tidak
// tertangkap komponen mana pun — jadi SELURUH halaman gagal dirender. Satu
// billboard cacat mematikan halaman produk publik, bukan cuma bagian
// spesifikasinya. Helper di bawah mengembalikan nilai cadangan alih-alih
// melempar, dan mencatat masalahnya ke log server supaya tetap bisa ditelusuri
// — diam-diam mengembalikan array kosong tanpa jejak justru menyembunyikan data
// rusak.

/**
 * Mengurai JSON dan mengembalikan `fallback` bila gagal.
 *
 * @param raw     Teks JSON dari database. Boleh `null`/`undefined`.
 * @param fallback Nilai yang dikembalikan bila penguraian gagal.
 * @param context Label untuk log, mis. `"Billboard.specs id=abc123"`.
 */
export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  context?: string
): T {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }

  try {
    const hasil = JSON.parse(raw);

    // `JSON.parse("null")` menghasilkan null tanpa melempar. Memperlakukannya
    // sebagai sukses akan meneruskan null ke kode yang mengharapkan array,
    // lalu `.map` gagal beberapa baris kemudian — jauh dari sumbernya.
    if (hasil === null || hasil === undefined) {
      return fallback;
    }

    return hasil as T;
  } catch (error) {
    console.error(
      `[safe-json] Gagal mengurai JSON${context ? ` pada ${context}` : ''}:`,
      error instanceof Error ? error.message : error
    );
    return fallback;
  }
}

/**
 * Varian untuk kolom TEKS yang seharusnya berisi array JSON.
 *
 * Hanya untuk kolom bertipe `String` — satu-satunya yang tersisa adalah
 * `BillboardHistory.snapshot`. Untuk kolom jsonb pakai `arrayDariJson`.
 *
 * Melindungi dari kasus yang lolos dari `safeJsonParse`: JSON yang sah tapi
 * bentuknya salah. `JSON.parse('{"a":1}')` berhasil dan mengembalikan objek,
 * lalu `.map()` di komponen gagal dengan "is not a function" — pesan yang
 * tidak menunjukkan bahwa masalahnya ada di data.
 */
export function safeJsonArray<T>(
  raw: string | null | undefined,
  context?: string
): T[] {
  const hasil = safeJsonParse<unknown>(raw, [], context);

  if (!Array.isArray(hasil)) {
    console.error(
      `[safe-json] Nilai${context ? ` pada ${context}` : ''} bukan array:`,
      typeof hasil
    );
    return [];
  }

  return hasil as T[];
}

/**
 * Pembaca untuk kolom **jsonb** yang seharusnya berisi array.
 *
 * Kenapa masih perlu diperiksa padahal Prisma sudah menguraikannya:
 *
 *   1. Kolom Json TIDAK bertipe di TypeScript. Prisma mengetiknya
 *      `Prisma.JsonValue` — teks, angka, boolean, objek, array, atau null.
 *      Jadi menurut compiler `billboard.specs` bisa apa saja, sementara `.map()`
 *      di JSX butuh jaminan runtime bahwa ia benar-benar array.
 *   2. Nilai yang SAH menurut jsonb tapi salah bentuk tetap mungkin masuk:
 *      `{}`, `"teks"`, `5`, `null` semuanya jsonb yang sah.
 *   3. Baris peninggalan bisa ganda-encode — lihat cabang `string` di bawah.
 *
 * @param nilai   Nilai dari kolom jsonb, apa adanya dari Prisma.
 * @param context Label untuk log, mis. `"Billboard.specs id=abc123"`.
 */
export function arrayDariJson<T>(nilai: unknown, context?: string): T[] {
  // Baris yang ditulis SEBELUM kolomnya menjadi jsonb, atau oleh kode yang lupa
  // membuang `JSON.stringify`, menyimpan sebuah STRING yang di dalamnya ada
  // JSON — ganda-encode. Itu jsonb yang sah, jadi database menerimanya tanpa
  // keluhan dan `tsc` pun diam (tipe `InputJsonValue` memuat `string`). Diurai
  // sekali lagi di sini supaya data seperti itu tetap terbaca alih-alih hilang
  // diam-diam, dan tetap tercatat di log supaya penyebabnya bisa dikejar.
  if (typeof nilai === 'string') {
    console.error(
      `[safe-json] Kolom jsonb${context ? ` pada ${context}` : ''} berisi teks, ` +
      `bukan array — kemungkinan ditulis dengan JSON.stringify yang belum dibuang.`
    );
    return safeJsonArray<T>(nilai, context);
  }

  // `null` adalah keadaan yang wajar untuk baris lama, jadi tidak perlu dicatat
  // sebagai galat — bedakan dari bentuk yang benar-benar salah di bawah.
  if (nilai === null || nilai === undefined) {
    return [];
  }

  if (!Array.isArray(nilai)) {
    console.error(
      `[safe-json] Kolom jsonb${context ? ` pada ${context}` : ''} bukan array:`,
      typeof nilai
    );
    return [];
  }

  return nilai as T[];
}
