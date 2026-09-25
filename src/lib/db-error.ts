// src/lib/db-error.ts
//
// Pengenal galat database yang PUNYA ARTI BAGI PENGGUNA.
//
// Dua jenis kegagalan di bawah bukan "server rusak" — keduanya adalah jawaban
// yang sah dan sudah diperhitungkan: "tanggal itu keburu diambil orang lain"
// dan "email itu sudah terdaftar". Keduanya muncul justru pada kasus yang
// paling sulit ditiru saat menguji, yaitu ketika dua permintaan tiba pada saat
// yang bersamaan dan pemeriksaan di kode aplikasi sama-sama lolos sebelum
// salah satunya menyimpan. Hanya database yang melihat keduanya sekaligus, jadi
// hanya database yang bisa menolak yang kedua.
//
// Tanpa pengenal ini, penolakan itu jatuh ke penanganan galat umum dan pembeli
// membaca "Error Server" — padahal pesan yang benar sudah ditulis, hanya tidak
// pernah sampai. Pembeli lalu menghubungi CS mengira situsnya rusak.

import { Prisma } from "@prisma/client";

/** Nama constraint EXCLUDE yang mencegah dua sewa bertabrakan tanggal. */
const CONSTRAINT_TUMPANG_TINDIH = "booking_tanpa_tumpang_tindih";

/** Kode galat PostgreSQL untuk pelanggaran constraint EXCLUDE. */
const KODE_PG_EXCLUSION = "23P01";

/**
 * Kumpulkan seluruh teks yang mungkin memuat keterangan galat dari database.
 *
 * Prisma membungkus galat PostgreSQL dengan cara yang berbeda-beda tergantung
 * jenisnya: kadang di `message`, kadang di `meta`, kadang hanya di `cause`.
 * Pelanggaran constraint EXCLUDE khususnya tidak punya kode galat Prisma
 * sendiri (tidak ada "P2xxx" untuknya), jadi satu-satunya penanda yang bisa
 * diandalkan adalah nama constraint atau kode PostgreSQL di dalam teks itu.
 */
function teksGalat(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");

  const bagian: string[] = [];
  const e = error as { message?: unknown; meta?: unknown; cause?: unknown };

  if (typeof e.message === "string") bagian.push(e.message);
  if (e.meta) bagian.push(JSON.stringify(e.meta));
  // `cause` bisa berlapis — galat asli dari driver sering ada di lapisan dalam.
  if (e.cause && e.cause !== error) bagian.push(teksGalat(e.cause));

  return bagian.join(" ");
}

/**
 * Apakah galat ini penolakan database karena tanggal billboard sudah terkunci
 * pesanan lain?
 *
 * Ini adalah pasangan dari pemeriksaan tumpang-tindih di `booking/create`:
 * pemeriksaan itu menangkap kasus biasa dan bisa menyebutkan tanggal mana yang
 * bentrok, sementara constraint database menangkap kasus balapan yang lolos
 * darinya. Keduanya harus berujung pada jawaban 409 yang sama untuk pembeli.
 */
export function adalahBentrokTanggal(error: unknown): boolean {
  const teks = teksGalat(error);
  return (
    teks.includes(CONSTRAINT_TUMPANG_TINDIH) || teks.includes(KODE_PG_EXCLUSION)
  );
}

/**
 * Apakah galat ini penolakan database karena nilai yang seharusnya unik sudah
 * dipakai baris lain (mis. dua pendaftaran dengan email yang sama)?
 *
 * `target` berisi nama kolom yang bertabrakan bila Prisma melaporkannya;
 * dipakai pemanggil untuk memastikan yang bentrok memang kolom yang ia duga,
 * bukan unique index lain yang kebetulan ikut terlanggar.
 */
export function adalahDuplikatUnik(error: unknown, kolom?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  if (!kolom) return true;

  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes(kolom);
  if (typeof target === "string") return target.includes(kolom);

  // Prisma tidak selalu menyertakan `target`. Lebih baik menjawab "ya" dan
  // memberi pesan yang tepat daripada menjatuhkannya ke galat 500 umum.
  return true;
}
