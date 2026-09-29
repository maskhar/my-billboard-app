// src/lib/body-json.ts
//
// Membaca body JSON satu permintaan, dengan kegagalannya dijawab 400.
//
// KENAPA FILE INI ADA
// -------------------
// `await req.json()` MELEMPAR untuk body yang bukan JSON — termasuk body yang
// kosong, yang terpotong di tengah jalan, dan `Content-Type` apa pun yang isinya
// bukan JSON. Di enam route, panggilan itu berada DI LUAR `try`:
//
//     src/app/api/admin/chat/close/route.ts
//     src/app/api/admin/chat/join/route.ts
//     src/app/api/admin/chat/reply/route.ts
//     src/app/api/admin/settings/route.ts
//     src/app/api/admin/update-order/route.ts
//     src/app/api/booking/request-refund/route.ts
//
// Lemparan tanpa penangkap dijawab Next sebagai galat runtime, bukan 400, dan
// jejaknya masuk log sebagai KERUSAKAN SERVER. Jadi permintaan yang salah bentuk
// terbaca sama seperti database yang tumbang: tiap body rusak menambah satu
// baris palsu ke tempat yang dilihat orang saat mencari kerusakan sungguhan.
// Catatan yang sama sudah ditulis di
// `src/app/api/admin/billboards/rollback/route.ts`, tempat cacat ini pertama
// ditutup — hanya saja di sana ditutup dengan satu `try` lokal.
//
// KENAPA BUKAN SEKADAR MEMBUNGKUSNYA DENGAN `try` YANG LEBIH BESAR
// ---------------------------------------------------------------
// `try` yang melingkupi seluruh handler memang menahan lemparan ini, tapi ia
// juga menelan SEMUA galat lain di dalamnya ke satu jawaban yang sama. Body
// rusak (salah pengirim, 400) jadi tidak bisa dibedakan dari kegagalan Prisma
// (salah server, 500), dan pemanggil yang melihat 500 akan mengulang permintaan
// yang tidak akan pernah berhasil. Yang dibungkus di sini HANYA pembacaan
// body-nya.
//
// KENAPA BODY YANG BUKAN OBJEK JUGA DITOLAK
// -----------------------------------------
// `"5"`, `"null"`, `"\"teks\""`, dan `"[1,2]"` semuanya JSON yang SAH, jadi
// `req.json()` mengembalikannya tanpa melempar. Lalu:
//
//     const { sessionId } = await req.json();   // body: null
//
// melempar `TypeError: Cannot destructure property ... of null` — persis
// kegagalan tanpa penangkap yang sedang ditutup, hanya lewat pintu lain. Array
// lebih halus lagi: destructuring atas array TIDAK melempar, ia hanya
// menghasilkan `undefined` untuk setiap bidang, jadi route berjalan terus
// seolah-olah semua bidangnya memang tidak dikirim.

import { NextResponse } from 'next/server';

/**
 * Hasil pembacaan body: sudah terbaca, atau sudah punya jawaban penolakannya.
 *
 * Bentuknya bukan `T | null` supaya pemanggil tidak menyusun sendiri pesan dan
 * kode statusnya — enam route yang menuliskannya sendiri akan menulis enam
 * pesan yang berbeda untuk kegagalan yang sama.
 */
export type HasilBody = { ok: true; body: Record<string, unknown> } | { ok: false; jawaban: NextResponse };

/**
 * Body JSON permintaan sebagai objek biasa.
 *
 * Nilainya `unknown` per bidang, bukan `any`: bidang yang dipakai tetap wajib
 * lewat penjaga tipenya sendiri (`idDariBody`, `teksBillboard`, `sahBookingStatus`,
 * dan seterusnya). Helper ini hanya menjamin bahwa ADA objek untuk dibaca.
 *
 * @param req     Permintaan yang masuk.
 * @param context Label untuk log, mis. `"admin/chat/reply"`.
 */
export async function bacaBodyJson(req: Request, context?: string): Promise<HasilBody> {
  let mentah: unknown;

  try {
    mentah = await req.json();
  } catch {
    // Isi body TIDAK dicatat: yang gagal dibaca justru kiriman sembarang, dan
    // menuliskannya ke log adalah cara paling mudah memasukkan isi permintaan
    // orang lain ke berkas log. Alasan yang sama seperti di
    // `src/lib/spesifikasi-billboard.ts`.
    console.error(`[body-json] body bukan JSON yang sah${context ? ` pada ${context}` : ''}`);
    return {
      ok: false,
      jawaban: NextResponse.json({ message: 'Body permintaan bukan JSON yang sah.' }, { status: 400 }),
    };
  }

  // `typeof null === 'object'`, jadi `null` harus ditolak terpisah. Array juga:
  // ia objek menurut `typeof`, tapi destructuring atas array menghasilkan
  // `undefined` untuk setiap bidang tanpa melempar apa pun.
  if (mentah === null || typeof mentah !== 'object' || Array.isArray(mentah)) {
    console.error(`[body-json] body bukan objek${context ? ` pada ${context}` : ''}`);
    return {
      ok: false,
      jawaban: NextResponse.json({ message: 'Body permintaan harus berupa objek JSON.' }, { status: 400 }),
    };
  }

  return { ok: true, body: mentah as Record<string, unknown> };
}
