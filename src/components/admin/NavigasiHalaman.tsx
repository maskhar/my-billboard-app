// src/components/admin/NavigasiHalaman.tsx
//
// Navigasi halaman bersama untuk keempat daftar admin: inventori, transaksi,
// pengguna, dan pengajuan.
//
// BUKAN Client Component. Tautannya `<Link>` biasa dan seluruh keadaan ada di
// URL, jadi ia tidak butuh satu pun hook — dan karena itu tidak menambah satu
// byte pun ke bundel browser.
//
// APA YANG BERUBAH DARI EMPAT SALINAN YANG DIGANTINYA
// ---------------------------------------------------
//  1. **Tombolnya tidak lagi hilang.** Sebelumnya "Sebelumnya" hanya dirender
//     saat `halaman > 1` dan "Berikutnya" hanya saat `halaman < totalHalaman`,
//     jadi tombolnya berpindah-pindah posisi setiap kali admin menekan salah
//     satunya: di halaman 1 hanya ada satu tombol di kanan, di halaman 2 ada
//     dua, di halaman terakhir satu lagi. Sekarang keduanya selalu ada dan yang
//     tidak berlaku dinonaktifkan, jadi sasaran kliknya tidak bergerak.
//  2. **Yang dinonaktifkan adalah `<span>`, bukan `<a>`.** `<a>` tanpa `href`
//     tetap bisa difokus di sebagian peramban dan tidak punya arti bagi pembaca
//     layar; `aria-disabled` pada tautan yang tetap bisa diklik justru lebih
//     buruk daripada tidak ada penanda.
//  3. **Jumlah baris ikut ditulis.** "Halaman 2 dari 7" tidak memberi tahu ada
//     berapa. Tiga dari empat salinan lama sudah menuliskannya, satu (transaksi)
//     tidak — jadi satu halaman admin memberi tahu lebih sedikit daripada tiga
//     lainnya tanpa alasan.
//
// KENAPA IA TIDAK MENYEMBUNYIKAN DIRI SAAT HANYA ADA SATU HALAMAN
// --------------------------------------------------------------
// Keempat salinan lama membungkus dirinya dengan `totalHalaman > 1 && (…)`.
// Itu menghilangkan ringkasan jumlahnya juga, padahal "12 titik" pada daftar
// yang tidak perlu dipaginasi tetap informasi yang dicari admin. Yang
// disembunyikan sekarang hanya tombolnya (lewat `sembunyikanTombolTunggal`),
// bukan seluruh barisnya.

import Link from 'next/link';
import { urlHalaman } from '@/lib/paginasi';

const KELAS_TOMBOL =
  'rounded border border-gray-200 bg-white px-3 py-1.5 font-bold text-gray-600 transition hover:bg-gray-50';
const KELAS_TOMBOL_MATI =
  'rounded border border-gray-100 bg-gray-50 px-3 py-1.5 font-bold text-gray-300 cursor-not-allowed select-none';

export default function NavigasiHalaman({
  basis,
  halaman,
  totalHalaman,
  total,
  satuan,
  parameter = {},
}: {
  /** Jalur tanpa query, mis. `/admin/billboards`. */
  basis: string;
  halaman: number;
  totalHalaman: number;
  /** Jumlah SELURUH baris menurut `count`, bukan jumlah baris di halaman ini. */
  total: number;
  /** Kata benda jamak: `titik`, `transaksi`, `pengguna`, `pengajuan`. */
  satuan: string;
  /**
   * Saringan yang sedang aktif, dibawa ke halaman berikutnya. Tanpa ini tombol
   * "Berikutnya" melompat keluar dari tab yang sedang dibuka — kehilangan
   * konteks yang tidak diumumkan di mana pun.
   */
  parameter?: Record<string, string | undefined | null>;
}) {
  const adaSebelum = halaman > 1;
  const adaSesudah = halaman < totalHalaman;

  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-gray-500">
        Halaman {halaman} dari {totalHalaman} · {total} {satuan}
      </span>

      {/* `aria-label` pada `<nav>`, bukan pada tiap tombol: pembaca layar
          menyebut wilayahnya sekali lalu membacakan kedua tombolnya, alih-alih
          mengulang kata "paginasi" dua kali. */}
      {totalHalaman > 1 && (
        <nav aria-label="Navigasi halaman" className="flex gap-2">
          {adaSebelum ? (
            <Link href={urlHalaman(basis, halaman - 1, parameter)} className={KELAS_TOMBOL} rel="prev">
              Sebelumnya
            </Link>
          ) : (
            <span className={KELAS_TOMBOL_MATI} aria-disabled="true">
              Sebelumnya
            </span>
          )}

          {adaSesudah ? (
            <Link href={urlHalaman(basis, halaman + 1, parameter)} className={KELAS_TOMBOL} rel="next">
              Berikutnya
            </Link>
          ) : (
            <span className={KELAS_TOMBOL_MATI} aria-disabled="true">
              Berikutnya
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
