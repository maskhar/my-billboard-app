// src/lib/gerbang-peran.ts
//
// Gerbang peran untuk route admin, dengan daftar peran yang divalidasi compiler.
//
// MASALAH YANG DITUTUP MODUL INI
// ------------------------------
// Gerbang di 25 route ditulis sebagai array literal di tempat:
//
//     if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
//
// `session.user.role` sudah bertipe `Role` (lihat `src/types/next-auth.d.ts`),
// jadi kelihatannya aman. Tapi TypeScript melebarkan `['ADMIN', 'SUPER_ADMIN']`
// menjadi `string[]`, dan `string[].includes()` menerima `Role` tanpa keluhan.
// Akibatnya baris ini **lolos kompilasi**:
//
//     ['ADMIN', 'SUPER_ADMINN'].includes(session.user.role)   // nol galat tsc
//
// Salah tulis satu huruf membuat gerbangnya selalu `false` untuk peran itu —
// artinya `SUPER_ADMIN` terkunci dari route yang seharusnya ia kelola, dan
// tidak ada yang memberi tahu sampai seseorang mengeluh. Diverifikasi: probe
// dengan `'SUPER_ADMINN'` dan `'SUPERADMIN'` dijalankan lewat `tsc --noEmit`
// dan keduanya menghasilkan **nol galat**.
//
// Arah salahnya penting: gerbang yang rusak karena salah tulis TIDAK membuka
// pintu, ia menutupnya terlalu rapat. Jadi ini bukan lubang keamanan, melainkan
// cara aplikasi mengunci adminnya sendiri secara diam-diam.
//
// NAMA YANG SAMA, ISI YANG BERBEDA
// --------------------------------
// Dua berkas mendefinisikan `ROLE_ADMIN` dengan anggota yang tidak sama:
//
//   - `api/admin/billboards/detail/route.ts` → ADMIN, SUPER_ADMIN, CS, OPERATOR
//   - `api/admin/orders/detail/route.ts`     → ADMIN, SUPER_ADMIN, OPERATOR
//
// Keduanya konstanta lokal, jadi tidak ada yang bertabrakan saat kompilasi —
// tapi siapa pun yang membaca satu berkas lalu berasumsi tentang yang lain akan
// salah. Konstanta di bawah diberi nama menurut **siapa yang boleh**, bukan
// menurut "admin", supaya perbedaan itu tampak dari namanya.
//
// YANG SENGAJA TIDAK DILAKUKAN
// ---------------------------
// Modul ini tidak menyatukan semua gerbang menjadi satu daftar. Perbedaan
// peran antar-route sebagian besar **memang disengaja**: `settings` hanya
// `SUPER_ADMIN` karena ia menyimpan kunci API, `upload-internal-design`
// mengikutkan `OPERATOR` karena operator lapangan yang mengunggahnya, dan
// route billboard yang menulis harga tidak mengikutkan `CS`. Menyeragamkannya
// akan memperluas izin, bukan memperbaiki apa pun.

import { Role } from '@prisma/client';

/**
 * Peran yang boleh MENULIS data billboard dan pesanan: harga, jadwal, status.
 * Tidak mengikutkan `CS` dan `OPERATOR` — keduanya tidak menyentuh nominal.
 */
export const PERAN_PENGELOLA: readonly Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

/**
 * Peran yang boleh MEMBACA seluruh panel admin, termasuk yang hanya melihat.
 * Dipakai `billboards/detail` — CS perlu membacanya untuk menjawab pembeli.
 */
export const PERAN_PEMBACA_PANEL: readonly Role[] = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.CS,
  Role.OPERATOR,
];

/**
 * Peran yang boleh membaca rincian pesanan. Sengaja **tanpa `CS`**: rincian
 * pesanan memuat nominal dan data perusahaan pembeli, dan CS tidak
 * membutuhkannya untuk menjawab percakapan.
 */
export const PERAN_PEMBACA_PESANAN: readonly Role[] = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.OPERATOR,
];

/**
 * Peran yang boleh melihat angka keuangan perusahaan (omzet, rekap uang masuk).
 *
 * Anggotanya kebetulan sama dengan `PERAN_PENGELOLA`, tapi **sengaja tidak
 * dijadikan satu**: yang satu soal siapa yang boleh MENULIS harga, yang ini
 * soal siapa yang boleh MELIHAT pendapatan. Kalau nanti ada peran keuangan yang
 * boleh membaca omzet tanpa boleh menyunting billboard, perubahannya cukup di
 * satu baris ini dan tidak diam-diam ikut membuka route penulis.
 */
export const PERAN_OMZET: readonly Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

/**
 * Peran staf yang boleh mengunggah berkas untuk pesanan **milik orang lain**.
 *
 * Dipakai di `api/upload` dan `api/upload/design` sebagai jalan pintas dari
 * pemeriksaan kepemilikan — bukan sebagai gerbang tunggal. Pembeli tetap boleh
 * mengunggah ke pesanannya sendiri.
 */
export const PERAN_UNGGAH_STAF: readonly Role[] = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.OPERATOR,
];

/** Peran yang menangani percakapan pelanggan. */
export const PERAN_CHAT: readonly Role[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.CS];

/**
 * Peran yang boleh mengunggah berkas desain internal — mengikutkan `OPERATOR`
 * karena operator lapangan yang mengerjakannya.
 */
export const PERAN_DESAIN_INTERNAL: readonly Role[] = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.OPERATOR,
];

/**
 * Apakah `peran` termasuk salah satu anggota `daftar`.
 *
 * Parameternya `Role`, bukan `string`, dan itu seluruh gunanya: daftar yang
 * memuat teks bukan-`Role` **ditolak compiler**, dan salah tulis seperti
 * `'SUPER_ADMINN'` tidak akan pernah sampai ke produksi.
 *
 * `peran` boleh `undefined` supaya pemanggil tidak perlu memeriksa sesi dua
 * kali — sesi yang tidak ada menghasilkan `false`, sama seperti peran yang
 * tidak berizin.
 */
export function peranBoleh(
  daftar: readonly Role[],
  peran: Role | undefined | null
): boolean {
  return peran != null && daftar.includes(peran);
}
