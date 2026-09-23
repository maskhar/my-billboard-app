// src/lib/safe-json.ts
//
// Beberapa kolom di database menyimpan JSON sebagai teks biasa: `gallery`,
// `specs`, `includes`, `excludes`, dan `snapshot`. Semua kode yang membacanya
// memanggil `JSON.parse` langsung tanpa pengaman.
//
// Akibatnya satu baris database yang rusak — teks kosong, kutip yang hilang,
// data yang pernah disimpan dengan format lama — membuat `JSON.parse` melempar
// error. Di React Server Component error itu tidak tertangkap komponen mana
// pun, jadi SELURUH halaman gagal dirender. Satu billboard cacat mematikan
// halaman produk publik, bukan cuma bagian spesifikasinya.
//
// Helper ini mengembalikan nilai cadangan alih-alih melempar, dan mencatat
// masalahnya ke log server supaya tetap bisa ditelusuri — diam-diam
// mengembalikan array kosong tanpa jejak justru menyembunyikan data rusak.

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
 * Varian untuk kolom yang seharusnya berisi array.
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
