// src/lib/money.ts
//
// Satu tempat untuk semua urusan nominal rupiah.
//
// Kolom uang di database bertipe `Decimal`, bukan `number`. Prisma
// mengembalikannya sebagai OBJEK, bukan angka biasa. Akibatnya, kode yang
// terlihat benar justru menghasilkan sampah tanpa pesan error apa pun:
//
//   total + biaya          →  "100000050000"  (disambung, bukan dijumlah)
//   harga * 0.11           →  NaN
//   harga.toLocaleString() →  "15000000"      (titik ribuan hilang)
//   a < b                  →  dibandingkan sebagai teks: "9000000" < "10000000" = false
//
// Tidak satu pun dari empat baris itu ditolak TypeScript. Semuanya lolos ke
// layar pengguna sebagai angka yang salah. Karena itu jangan pernah memakai
// `+ - * /` atau `< >` langsung pada nilai uang dari database — pakai fungsi
// di file ini.

import { Prisma } from '@prisma/client';

/** Apa pun yang mungkin berisi nominal uang: dari DB, dari form, dari JSON. */
export type NilaiUang = Prisma.Decimal | number | string | null | undefined;

/**
 * Ubah apa pun menjadi Decimal yang bisa dihitung.
 * Nilai kosong / bukan angka menjadi 0 — bukan NaN, karena NaN akan
 * ditolak database saat disimpan dan menggagalkan transaksi di titik
 * yang jauh dari sumber masalahnya.
 */
export function keDecimal(nilai: NilaiUang): Prisma.Decimal {
  if (nilai === null || nilai === undefined || nilai === '') {
    return new Prisma.Decimal(0);
  }

  try {
    const d = new Prisma.Decimal(nilai as Prisma.Decimal.Value);
    // Decimal menerima "NaN" sebagai nilai sah; database tidak.
    return d.isNaN() ? new Prisma.Decimal(0) : d;
  } catch {
    return new Prisma.Decimal(0);
  }
}

/** Jumlahkan sejumlah nominal. Aman untuk campuran Decimal, number, string. */
export function jumlah(...nilai: NilaiUang[]): Prisma.Decimal {
  return nilai.reduce<Prisma.Decimal>(
    (total, n) => total.plus(keDecimal(n)),
    new Prisma.Decimal(0)
  );
}

/** Kurangkan: a - b. */
export function kurang(a: NilaiUang, b: NilaiUang): Prisma.Decimal {
  return keDecimal(a).minus(keDecimal(b));
}

/** Kalikan nominal dengan pengali biasa (mis. 0.11 untuk PPN, 1.5 untuk durasi). */
export function kali(nilai: NilaiUang, pengali: number | string): Prisma.Decimal {
  return keDecimal(nilai).times(pengali);
}

/**
 * Ambil persentase dari sebuah nominal.
 * `persen(1_000_000, 11)` → 110000. Dibulatkan ke 2 desimal, arah ke atas
 * pada angka 5 — perlakuan yang sama dengan pembulatan tagihan pada umumnya.
 */
export function persen(nilai: NilaiUang, persentase: number): Prisma.Decimal {
  return keDecimal(nilai)
    .times(persentase)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** a > b */
export function lebihBesar(a: NilaiUang, b: NilaiUang): boolean {
  return keDecimal(a).greaterThan(keDecimal(b));
}

/** a < b */
export function lebihKecil(a: NilaiUang, b: NilaiUang): boolean {
  return keDecimal(a).lessThan(keDecimal(b));
}

/**
 * Apakah nominal ini nol?
 *
 * Perhatikan: `if (order.dpAmount)` TIDAK bisa dipakai untuk ini. Decimal(0)
 * adalah objek, dan setiap objek bernilai "benar" dalam JavaScript — jadi
 * pengecekan seperti itu selalu lolos, termasuk ketika nominalnya nol.
 */
export function nol(nilai: NilaiUang): boolean {
  return keDecimal(nilai).isZero();
}

/**
 * Ubah ke `number` biasa — HANYA untuk dikirim ke komponen client atau ke
 * pustaka grafik yang memang menuntut number.
 *
 * Jangan dipakai untuk menghitung. Angka di atas 9.007.199.254.740.991
 * (sekitar 9 kuadriliun) kehilangan presisi — masih jauh di atas nominal
 * yang wajar di sini, tapi hasil hitung tetap harus dikerjakan sebagai
 * Decimal lalu dikonversi di akhir, bukan sebaliknya.
 */
export function keAngka(nilai: NilaiUang): number {
  return keDecimal(nilai).toNumber();
}

/**
 * Format lengkap untuk ditampilkan: `Rp 15.000.000`.
 * Tanpa angka di belakang koma, karena rupiah tidak dipakai sampai sen.
 */
export function rupiah(nilai: NilaiUang): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(keAngka(nilai));
}

/**
 * Format angka saja, tanpa "Rp": `15.000.000`.
 * Untuk tempat yang sudah menulis "Rp" sendiri di sebelahnya.
 */
export function angkaRupiah(nilai: NilaiUang): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(keAngka(nilai));
}

/**
 * Format ringkas untuk kartu dan penanda peta: `15 Jt`, `1,5 M`.
 * Nominal di bawah satu juta ditulis utuh.
 */
export function rupiahSingkat(nilai: NilaiUang): string {
  const angka = keAngka(nilai);
  const abs = Math.abs(angka);

  if (abs >= 1_000_000_000) {
    return `${(angka / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  }
  if (abs >= 1_000_000) {
    return `${(angka / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Jt`;
  }
  return angkaRupiah(angka);
}

/**
 * Siapkan nilai uang untuk dikirim dari Server Component ke komponen
 * `'use client'`.
 *
 * Ini bukan kerapian — ini keharusan. Next.js mengubah setiap prop menjadi
 * JSON saat menyeberangkan data ke komponen client, dan objek Decimal tidak
 * bisa diubah menjadi JSON. Halaman akan gagal dirender SAAT DIJALANKAN,
 * padahal `tsc` tidak melaporkan apa pun.
 */
export function uangUntukClient(nilai: NilaiUang): number {
  return keAngka(nilai);
}
