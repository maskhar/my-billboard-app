// src/lib/diff-billboard.ts
//
// Perbandingan kolom billboard SEKARANG melawan kolom yang akan dipulihkan
// rollback.
//
// KENAPA DIHITUNG SERVER, BUKAN DI FORM
// -------------------------------------
// Halaman form admin memegang `FormBillboard`, dan bentuk itu BUKAN baris
// billboard: `specs` di sana sudah dipecah menjadi `sizeH`/`sizeW`/
// `orientation`/`lighting`/`material`/`sides`, `includes`/`excludes` sudah
// digabung menjadi `adminOptions`, dan `videoUrl` tidak ada sama sekali. Diff
// yang dihitung dari state itu akan MELEWATKAN perubahan `videoUrl` tanpa
// jejak, dan melaporkan spesifikasi berubah setiap kali penamaan barisnya
// berbeda sedikit.
//
// Lebih buruk: state form ikut berubah saat admin mengetik. Diff yang
// dihitung darinya membandingkan snapshot dengan SUNTINGAN YANG BELUM
// DISIMPAN, bukan dengan data yang benar-benar akan ditimpa — dan itu
// persis angka yang admin pakai untuk memutuskan.
//
// Karena itu pembandingnya berjalan di server, atas baris billboard apa
// adanya, dan sisi "sesudah"-nya adalah objek yang harfiah dituliskan
// `billboard.updateMany` — hasil `bacaSnapshotBillboard()` yang sama.

import type { KolomSnapshotBillboard } from './snapshot-billboard';
import type { BarisSpesifikasi } from './tipe-billboard';

/** Satu baris tabel pratinjau. Sudah jadi teks — dialog tidak menghitung apa pun. */
export type BarisDiffBillboard = {
  /** Nama kolom dalam bahasa admin, bukan nama kolom database. */
  label: string;
  sebelum: string;
  sesudah: string;
};

/**
 * Kolom billboard yang dibutuhkan pembanding.
 *
 * Sengaja bukan tipe Prisma: modul ini tidak mengimpor `@prisma/client`, jadi
 * ia bisa di-`require` langsung di test dan dipakai dari mana pun. `price`
 * diterima sebagai teks/angka karena `Prisma.Decimal` tidak boleh menyeberang
 * ke Client Component — pemanggil sudah melewatkannya lewat `uangUntukClient`
 * atau `String()`.
 */
export type BillboardUntukDiff = {
  title: string;
  price: number | string;
  status: string;
  address: string;
  sku: string | null;
  type: string;
  mainImage: string;
  lat: number;
  lng: number;
  slug: string;
  specs: unknown;
  includes: unknown;
  excludes: unknown;
  gallery: unknown;
  smartsucoUrl: string | null;
  videoUrl: string | null;
  publishStatus: string;
};

/** Nilai kolom `BillboardHistory` yang tidak datang dari snapshot. */
export type PokokRiwayatUntukDiff = {
  title: string;
  price: number | string;
  status: string;
};

const KOSONG = '(kosong)';

function teks(nilai: string | null | undefined): string {
  if (typeof nilai !== 'string') return KOSONG;
  const rapi = nilai.trim();
  return rapi === '' ? KOSONG : rapi;
}

/**
 * Nominal sebagai teks untuk DIBANDINGKAN, bukan untuk dibaca.
 *
 * `Prisma.Decimal` diserialisasi menjadi `"12000000"` sementara snapshot lama
 * bisa memuat `12000000` sebagai angka. `String()` atas keduanya menghasilkan
 * teks yang sama, jadi perbandingannya benar tanpa aritmetika uang apa pun —
 * dan aturan proyek ini melarang `+ - * < >` pada nominal.
 *
 * `"12000000.00"` melawan `"12000000"` adalah nominal yang sama dengan teks
 * yang berbeda, jadi nol di belakang titik desimal dipangkas lebih dulu.
 */
function uangSama(a: number | string, b: number | string): boolean {
  const rapi = (n: number | string) => {
    const s = String(n).trim();
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  };
  return rapi(a) === rapi(b);
}

function daftarTeks(nilai: unknown): string[] {
  if (!Array.isArray(nilai)) return [];
  return nilai
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.trim());
}

function barisSpec(nilai: unknown): BarisSpesifikasi[] {
  if (!Array.isArray(nilai)) return [];
  const hasil: BarisSpesifikasi[] = [];
  for (const baris of nilai) {
    if (!baris || typeof baris !== 'object' || Array.isArray(baris)) continue;
    const o = baris as Record<string, unknown>;
    if (typeof o.label !== 'string' || typeof o.value !== 'string') continue;
    hasil.push({ label: o.label, value: o.value });
  }
  return hasil;
}

/**
 * Ringkasan daftar untuk dibaca sebaris.
 *
 * Bukan seluruh isinya: galeri sepuluh URL Cloudinary membuat satu sel tabel
 * lebih panjang daripada seluruh dialognya. Jumlahnya adalah yang menjawab
 * "apa yang berubah"; isinya dibaca di formnya sendiri sesudah rollback.
 */
function ringkasDaftar(daftar: readonly string[]): string {
  if (daftar.length === 0) return KOSONG;
  if (daftar.length <= 3) return daftar.join(', ');
  return `${daftar.slice(0, 3).join(', ')} +${daftar.length - 3} lagi`;
}

function ringkasSpec(daftar: readonly BarisSpesifikasi[]): string {
  if (daftar.length === 0) return KOSONG;
  const potong = daftar.slice(0, 3).map((s) => `${s.label}: ${s.value}`);
  return daftar.length <= 3 ? potong.join(' · ') : `${potong.join(' · ')} +${daftar.length - 3} lagi`;
}

/**
 * Baris yang BERUBAH bila revisi ini dipulihkan — kolom yang nilainya sama
 * tidak ikut.
 *
 * Daftar kosong adalah jawaban yang sah dan penting: ia berarti revisi yang
 * dipilih identik dengan data sekarang, dan rollback tidak akan mengubah apa
 * pun. Tanpa pratinjau, admin menekan "Pulihkan", membaca "Berhasil", lalu
 * bertanya-tanya mengapa layarnya tidak berubah.
 *
 * `formatUang` disuntikkan, tidak diimpor: modul ini tidak menarik
 * `src/lib/money.ts` (yang mengimpor `@prisma/client`) supaya tetap bisa
 * di-`require` langsung di test tanpa mock Prisma.
 */
export function diffRollbackBillboard(
  sekarang: BillboardUntukDiff,
  pokok: PokokRiwayatUntukDiff,
  snapshot: KolomSnapshotBillboard,
  formatUang: (nilai: number | string) => string
): BarisDiffBillboard[] {
  const baris: BarisDiffBillboard[] = [];

  const tambah = (label: string, sebelum: string, sesudah: string) => {
    if (sebelum !== sesudah) baris.push({ label, sebelum, sesudah });
  };

  tambah('Nama', teks(sekarang.title), teks(pokok.title));

  // Uang dibandingkan sebagai nominal, tapi DITAMPILKAN terformat. Kalau
  // dibandingkan setelah diformat, `"Rp 12.000.000"` melawan
  // `"Rp 12.000.000"` bisa sama sementara nominalnya berbeda di sen — dan
  // selisih sen pada kolom `Decimal(15,2)` adalah perubahan yang nyata.
  if (!uangSama(sekarang.price, pokok.price)) {
    baris.push({
      label: 'Harga',
      sebelum: formatUang(sekarang.price),
      sesudah: formatUang(pokok.price),
    });
  }

  tambah('Status', teks(sekarang.status), teks(pokok.status));
  tambah('Status terbit', teks(sekarang.publishStatus), teks(snapshot.publishStatus));
  tambah('Slug (URL)', teks(sekarang.slug), teks(snapshot.slug));
  tambah('SKU', teks(sekarang.sku), teks(snapshot.sku));
  tambah('Alamat', teks(sekarang.address), teks(snapshot.address));
  tambah('Tipe', teks(sekarang.type), teks(snapshot.type));
  tambah('Foto utama', teks(sekarang.mainImage), teks(snapshot.mainImage));

  // Koordinat dibandingkan sebagai angka lewat teksnya: `-6.2` dan `-6.20`
  // adalah titik yang sama, dan `String(-6.2)` menormalkannya.
  tambah('Koordinat', `${sekarang.lat}, ${sekarang.lng}`, `${snapshot.lat}, ${snapshot.lng}`);

  tambah('Video', teks(sekarang.videoUrl), teks(snapshot.videoUrl));
  tambah('Smartsuco', teks(sekarang.smartsucoUrl), teks(snapshot.smartsucoUrl));

  tambah('Spesifikasi', ringkasSpec(barisSpec(sekarang.specs)), ringkasSpec(snapshot.specs));
  tambah('Termasuk harga', ringkasDaftar(daftarTeks(sekarang.includes)), ringkasDaftar(snapshot.includes));
  tambah('Tidak termasuk', ringkasDaftar(daftarTeks(sekarang.excludes)), ringkasDaftar(snapshot.excludes));

  // Galeri dibandingkan per URL, bukan per jumlah: dua galeri berisi tiga foto
  // yang berbeda adalah perubahan, dan `3 foto` melawan `3 foto` akan
  // menyembunyikannya.
  const galeriSekarang = daftarTeks(sekarang.gallery);
  if (galeriSekarang.join('\u0000') !== snapshot.gallery.join('\u0000')) {
    baris.push({
      label: 'Galeri',
      sebelum: `${galeriSekarang.length} foto`,
      sesudah: `${snapshot.gallery.length} foto`,
    });
  }

  return baris;
}
