// src/lib/snapshot-billboard.ts
//
// Pembaca `BillboardHistory.snapshot` — satu-satunya.
//
// KENAPA FILE INI ADA
// -------------------
// Sebelumnya seluruh pembacaan snapshot tertulis di dalam
// `api/admin/billboards/rollback/route.ts`, dan tidak ada masalah selama hanya
// route itu yang membacanya. Begitu ada PEMBACA KEDUA — pratinjau diff yang
// memperlihatkan admin apa yang akan berubah sebelum ia menyetujui rollback —
// menyalin logikanya menjadi cacat yang jauh lebih berbahaya daripada tidak
// punya pratinjau sama sekali:
//
//   pratinjau berkata "harga: 10.000.000 → 12.000.000", admin menyetujui,
//   dan yang ditulis route ternyata kolom yang lain.
//
// Pratinjau yang bisa menyimpang dari penulisnya adalah pratinjau yang
// MEMBOHONGI orang yang mengandalkannya untuk memutuskan. Karena itu keduanya
// memanggil `bacaSnapshotBillboard()` yang sama: apa yang dipratinjau adalah,
// secara harfiah, objek yang akan dituliskan.
//
// KENAPA TIDAK MENGIMPOR PRISMA
// -----------------------------
// Fungsi di sini hanya membaca teks JSON dan mengembalikan objek biasa. Dengan
// nol impor runtime Prisma, `tests/xendit.test.cjs` bisa me-`require` berkas ini
// langsung tanpa mock, dan route pratinjau tidak menarik apa pun yang tidak
// diperlukannya.

import { safeJsonParse, arrayDariJson } from './safe-json';
import { specsAman } from './spesifikasi-billboard';
import { sahPublishStatus, daftarNilai, PublishStatus } from './enum-guard';
import type { BarisSpesifikasi } from './tipe-billboard';

/**
 * Kolom `Billboard` yang dipulihkan dari snapshot.
 *
 * Bentuknya SENGAJA sama dengan `data` milik `billboard.updateMany` di route
 * rollback, dikurangi tiga kolom yang tidak datang dari snapshot (`title`,
 * `price`, `status` — ketiganya kolom sungguhan di `BillboardHistory`) dan
 * `updatedById`, yang diisi dari sesi.
 */
export type KolomSnapshotBillboard = {
  address: string;
  sku: string | null;
  type: string;
  mainImage: string;
  lat: number;
  lng: number;
  slug: string;
  specs: BarisSpesifikasi[];
  includes: string[];
  excludes: string[];
  gallery: string[];
  smartsucoUrl: string | null;
  videoUrl: string | null;
  publishStatus: PublishStatus;
};

/**
 * Hasil pembacaan snapshot.
 *
 * `ok: false` membawa `status` HTTP dan `pesan` yang sudah siap dikirim, supaya
 * route rollback dan route pratinjau menjawab penolakan yang sama dengan kata
 * yang sama. `log` terpisah dari `pesan`: yang pertama untuk `console.error`,
 * yang kedua untuk admin.
 */
export type HasilSnapshot =
  | { ok: true; kolom: KolomSnapshotBillboard }
  | { ok: false; status: 422; pesan: string; log: string | null };

/**
 * Membaca `BillboardHistory.snapshot` menjadi kolom yang siap dituliskan.
 *
 * SETIAP FIELD DIPERIKSA, BUKAN HANYA OBJEKNYA
 * --------------------------------------------
 * Ini bukan soal kerapian tipe. Snapshot ini teks JSON yang ditulis versi kode
 * mana pun sejak tabel ini ada, jadi field yang hilang adalah keadaan yang nyata
 * — bukan kemungkinan teoretis.
 *
 * Prisma memperlakukan `undefined` di dalam `data` sebagai "JANGAN UBAH kolom
 * ini". Dengan `Record<string, any>`, `details.lat` yang tidak ada lolos
 * compiler, lolos Prisma, dan `update` berhasil — koordinat billboard TIDAK
 * dipulihkan, tapi admin tetap dibalas "Rollback Berhasil". Rollback yang
 * sebagian adalah data yang tercampur antara dua versi, dan tidak ada apa pun
 * yang menandainya.
 *
 * Yang lebih halus: `lat`/`lng` bertipe Float dan `slug` unik. Snapshot lama
 * yang menyimpan koordinat sebagai teks ("-6.2") diterima compiler lewat `any`,
 * lalu ditolak database sebagai galat validasi — 500 "Gagal Rollback" tanpa
 * menyebut field mana yang salah.
 */
export function bacaSnapshotBillboard(snapshot: string, historyId: string): HasilSnapshot {
  // Snapshot yang rusak dulu melempar ke `catch` di route dan muncul sebagai
  // "Gagal Rollback" generik.
  const details = safeJsonParse<unknown>(
    snapshot,
    null,
    `BillboardHistory.snapshot id=${historyId}`
  );

  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return {
      ok: false,
      status: 422,
      pesan: 'Data snapshot rusak, rollback dibatalkan agar data tidak tercampur.',
      log: null,
    };
  }

  const isi = details as Record<string, unknown>;

  const teks = (kunci: string): string | null => {
    const nilai = isi[kunci];
    if (typeof nilai !== 'string') return null;
    const rapi = nilai.trim();
    return rapi === '' ? null : rapi;
  };

  const angka = (kunci: string): number | null => {
    const nilai = isi[kunci];
    // `Number.isFinite`, bukan `typeof === 'number'`: `NaN` dan `Infinity`
    // bertipe number dan ditolak kolom Float.
    return typeof nilai === 'number' && Number.isFinite(nilai) ? nilai : null;
  };

  const address = teks('address');
  const type = teks('type');
  const mainImage = teks('mainImage');
  const slug = teks('slug');
  const lat = angka('lat');
  const lng = angka('lng');

  const hilang: string[] = [];
  // Daftar ini hanya untuk PESANnya. Penyempitan tipenya dilakukan terpisah di
  // bawah lewat satu `if` eksplisit: TypeScript tidak bisa menyimpulkan bahwa
  // `address` bukan `null` dari `hilang.length === 0`, dan memaksanya dengan `!`
  // akan mengembalikan tepat lubang yang pemeriksaan ini dibuat untuk menutup.
  if (address === null) hilang.push('address');
  if (type === null) hilang.push('type');
  if (mainImage === null) hilang.push('mainImage');
  if (slug === null) hilang.push('slug');
  if (lat === null) hilang.push('lat');
  if (lng === null) hilang.push('lng');

  if (
    address === null ||
    type === null ||
    mainImage === null ||
    slug === null ||
    lat === null ||
    lng === null
  ) {
    return {
      ok: false,
      status: 422,
      pesan:
        `Snapshot ini tidak memuat ${hilang.join(', ')}, jadi rollback ` +
        `dibatalkan — memulihkan sebagian akan mencampur data dua versi.`,
      log:
        `Snapshot id=${historyId} tidak lengkap: ${hilang.join(', ')}. ` +
        `Rollback dibatalkan.`,
    };
  }

  // `sku` opsional di schema (`String?`), jadi ketidakhadirannya sah dan
  // dipulihkan sebagai `null` — BUKAN `undefined`, yang akan membiarkan sku
  // versi sekarang tertinggal setelah rollback.
  const sku = teks('sku');

  // ENAM KOLOM YANG DULU TIDAK PERNAH IKUT DIPULIHKAN
  // -------------------------------------------------
  // Snapshot ditulis dengan `JSON.stringify({ ...sebelum })` — SELURUH baris
  // billboard, termasuk `specs`, `includes`, `excludes`, `gallery`,
  // `smartsucoUrl`, `videoUrl`, dan `publishStatus`. Tapi `updateMany` dulu
  // hanya menulis 11 kolom, jadi ketujuh sisanya tetap memakai nilai versi
  // SEKARANG setelah rollback selesai.
  //
  // Kolom JSON dibaca lewat `arrayDariJson`, bukan langsung: snapshot lama
  // menyimpan `gallery` sebagai TEKS JSON (ditulis sebelum kolomnya menjadi
  // jsonb), yang baru menyimpannya sebagai array sungguhan. `arrayDariJson`
  // menerima kedua bentuk itu, jadi riwayat lama tetap bisa dipulihkan alih-alih
  // membuat baris jsonb yang ganda-encode.
  const specs = specsAman(
    arrayDariJson<unknown>(isi.specs, `BillboardHistory.snapshot.specs id=${historyId}`)
  );
  const daftarTeks = (kunci: string): string[] =>
    arrayDariJson<unknown>(isi[kunci], `BillboardHistory.snapshot.${kunci} id=${historyId}`)
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.trim());

  const includes = daftarTeks('includes');
  const excludes = daftarTeks('excludes');
  const gallery = daftarTeks('gallery');

  // Keduanya `String?`, jadi `null` adalah pemulihan yang benar — bukan
  // `undefined`, yang berarti "jangan ubah" bagi Prisma.
  const smartsucoUrl = teks('smartsucoUrl');
  const videoUrl = teks('videoUrl');

  // `publishStatus` diperiksa terhadap enum-nya, bukan diteruskan. Snapshot
  // ditulis kode versi mana pun sejak tabel ini ada: baris yang lahir sebelum
  // kolom ini menjadi enum bisa memuat teks bebas, dan nilai asing ditolak di
  // lapisan database sebagai 500 "Gagal Rollback" tanpa menyebut kolom mana yang
  // salah.
  //
  // Ketidakhadirannya BUKAN kegagalan: snapshot yang lebih tua daripada kolom
  // ini memang tidak memuatnya. Baris seperti itu dipulihkan ke `DRAFT` —
  // pilihan yang aman, karena menerbitkan billboard yang status terbitnya tidak
  // diketahui berarti memajangnya ke publik atas dasar dugaan.
  const publishStatusMentah = isi.publishStatus;
  if (publishStatusMentah !== undefined && !sahPublishStatus(publishStatusMentah)) {
    return {
      ok: false,
      status: 422,
      pesan:
        `Status terbit di snapshot ini tidak dikenali, jadi rollback dibatalkan. ` +
        `Nilai yang sah: ${daftarNilai(PublishStatus)}.`,
      log: `Snapshot id=${historyId} memuat publishStatus asing. Rollback dibatalkan.`,
    };
  }
  const publishStatus = sahPublishStatus(publishStatusMentah)
    ? publishStatusMentah
    : PublishStatus.DRAFT;

  return {
    ok: true,
    kolom: {
      address,
      sku,
      type,
      mainImage,
      lat,
      lng,
      slug,
      specs,
      includes,
      excludes,
      gallery,
      smartsucoUrl,
      videoUrl,
      publishStatus,
    },
  };
}
