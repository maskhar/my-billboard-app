// src/lib/baca-jawaban.ts
//
// Membaca badan JSON sebuah `Response` dari route di repo ini, TANPA `any`.
//
// KENAPA ADA
// ---------
// Pola ini tertulis sembilan kali di komponen client:
//
//     const data = await res.json().catch(() => ({} as any));
//     alert('Gagal: ' + (data.message || `Server menolak (${res.status}).`));
//
// `({} as any)` melakukan dua hal buruk sekaligus. Pertama, ia membuat
// `data.message`, `data.url`, dan setiap salah-tulis nama field lolos dari
// `tsc` — `data.mesage` berjalan mulus dan selalu memunculkan pesan cadangan,
// jadi pesan server yang sebenarnya tidak pernah terlihat oleh siapa pun.
// Kedua, `catch` di sana hanya menjaga badan yang BUKAN JSON; badan JSON yang
// sah tapi bentuknya lain (mis. `{ error: '...' }` atau sebuah array) tetap
// lolos dan `data.message` menjadi `undefined` tanpa peringatan.
//
// BENTUK YANG BENAR-BENAR DIPULANGKAN ROUTE DI REPO INI
// ----------------------------------------------------
// Setiap route menjawab `{ message: string }` — `admin/update-order`,
// `admin/orders/record-payment`, `booking/submit-design`, `booking/cancel`,
// `booking/request-refund`. Satu-satunya tambahan adalah `url` pada respons
// sukses `upload/design`. Dua kolom itulah yang dibaca di bawah, dan
// tipenya diperiksa saat dijalankan: nilai yang bukan teks diperlakukan sama
// dengan tidak ada, karena `alert(objek)` mencetak "[object Object]" dan
// `<img src={objek}>` memicu permintaan ke URL yang tidak masuk akal.

/** Kolom yang dibaca dari badan JSON route. `null` berarti tidak ada atau bukan teks. */
export type JawabanServer = {
  /** Pesan untuk ditampilkan kepada pengguna. */
  pesan: string | null;
  /** Hanya `/api/upload/design` yang mengisinya pada respons sukses. */
  url: string | null;
};

/** Teks yang sudah dipangkas, atau `null` bila nilainya bukan teks berisi. */
function teksAtauNull(nilai: unknown): string | null {
  if (typeof nilai !== 'string') return null;
  const bersih = nilai.trim();
  return bersih === '' ? null : bersih;
}

/**
 * Baca badan JSON sebuah respons tanpa pernah melempar.
 *
 * Respons 500 dari Next.js berisi halaman HTML, bukan JSON, dan `res.json()`
 * melemparkan SyntaxError pada badan seperti itu. Bila galat itu dibiarkan
 * naik, ia MENGGANTIKAN pesan server: pengguna membaca "Unexpected token <"
 * untuk setiap kegagalan yang tidak sempat menulis badan JSON.
 */
export async function bacaJawaban(res: Response): Promise<JawabanServer> {
  let isi: unknown;
  try {
    isi = await res.json();
  } catch {
    return { pesan: null, url: null };
  }
  if (typeof isi !== 'object' || isi === null) {
    return { pesan: null, url: null };
  }
  const rekaman = isi as Record<string, unknown>;
  return {
    pesan: teksAtauNull(rekaman.message),
    url: teksAtauNull(rekaman.url),
  };
}

/**
 * Alasan penolakan yang layak ditampilkan: pesan server bila ada, kalau tidak
 * kode statusnya.
 *
 * Kode statusnya disebut karena tanpa itu semua kegagalan tanpa badan JSON
 * terlihat identik, dan 403 (tidak berhak) perlu ditangani pengguna dengan cara
 * yang berbeda dari 500 (server rusak).
 */
export function alasanPenolakan(res: Response, jawaban: JawabanServer): string {
  return jawaban.pesan ?? `Server menolak (${res.status}).`;
}
