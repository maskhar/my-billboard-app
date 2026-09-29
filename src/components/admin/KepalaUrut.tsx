// src/components/admin/KepalaUrut.tsx
//
// Satu sel kepala tabel yang bisa diklik untuk mengurutkan.
//
// BUKAN Client Component. Seluruh keadaan urut ada di URL, jadi sel ini hanya
// perlu `<Link>` — tidak satu pun hook, dan nol byte tambahan di bundel browser.
// Itu juga yang membuat urutan bisa di-bookmark dan tombol kembali peramban
// bekerja, dua hal yang hilang begitu urutan disimpan di `useState`.
//
// APA YANG SEL INI JAGA, DAN KENAPA IA TIDAK SEKADAR `<th onClick>`
// -----------------------------------------------------------------
//  1. **Yang diklik adalah `<a>`, bukan `<th>`.** `<th>` dengan `onClick` tidak
//     bisa dicapai lewat Tab, tidak bisa ditekan Enter, dan tidak dibacakan
//     pembaca layar sebagai sesuatu yang bisa ditekan. Satu tabel yang hanya
//     bisa diurutkan dengan tetikus adalah tabel yang tidak bisa diurutkan oleh
//     sebagian operator.
//  2. **`aria-sort` ada di `<th>`, bukan di `<a>`.** Atribut itu hanya berarti
//     pada sel kepala; pembaca layar mengumumkan "diurutkan naik" saat kursor
//     masuk ke kolomnya, bukan saat ia menemukan tautannya.
//  3. **Panah arah punya `aria-hidden`.** Arahnya sudah diumumkan `aria-sort`;
//     tanpa `aria-hidden`, pembaca layar membacakan karakter panahnya juga, dan
//     operator mendengar arah urut dua kali dengan kata yang berbeda.
//  4. **Nomor halaman TIDAK dibawa.** Mengubah urutan menyusun ulang seluruh
//     daftar, jadi "halaman 7 menurut harga" tidak punya hubungan apa pun dengan
//     "halaman 7 menurut nama" — membawa nomor halamannya akan mendaratkan admin
//     di tengah daftar yang belum pernah ia lihat awalnya. `urlHalaman` selalu
//     menulis `halaman`, jadi tautan di sini menyerahkan `1` secara eksplisit.

import Link from 'next/link';
import { urlHalaman } from '@/lib/paginasi';

export default function KepalaUrut({
  label,
  basis,
  urutAktif,
  naik,
  turun,
  parameter = {},
  className = '',
}: {
  /** Teks kepala kolom, apa adanya seperti kolom yang tidak bisa diurutkan. */
  label: string;
  /** Jalur tanpa query, mis. `/admin/billboards`. */
  basis: string;
  /** Kunci urut yang sedang berlaku menurut URL. */
  urutAktif: string;
  /** Kunci urut untuk arah naik (A→Z, murah→mahal, lama→baru). */
  naik: string;
  /** Kunci urut untuk arah turun. */
  turun: string;
  /** Saringan dan kata kunci yang sedang aktif; ikut dibawa. */
  parameter?: Record<string, string | undefined | null>;
  className?: string;
}) {
  const sedangNaik = urutAktif === naik;
  const sedangTurun = urutAktif === turun;

  // Kolom yang belum aktif menuju arah NAIK lebih dulu. Untuk nama dan judul itu
  // A→Z, yaitu arah yang orang harapkan dari klik pertama pada kolom teks.
  // Kolom yang sudah aktif membalik arahnya, sehingga klik kedua pada kolom yang
  // sama tidak menghasilkan tautan yang tidak mengubah apa pun.
  const tujuan = sedangNaik ? turun : naik;

  const ariaSort = sedangNaik ? 'ascending' : sedangTurun ? 'descending' : 'none';

  return (
    <th className={className} aria-sort={ariaSort}>
      <Link
        href={urlHalaman(basis, 1, { ...parameter, urut: tujuan })}
        className="inline-flex items-center gap-1 rounded transition hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-utero"
      >
        {label}
        <span aria-hidden="true" className={sedangNaik || sedangTurun ? 'text-utero' : 'text-gray-300'}>
          {sedangNaik ? '▲' : sedangTurun ? '▼' : '↕'}
        </span>
      </Link>
    </th>
  );
}
