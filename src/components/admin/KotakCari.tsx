// src/components/admin/KotakCari.tsx
//
// Kotak pencarian daftar admin. Formulir GET, bukan `useState`.
//
// KENAPA GET DAN BUKAN STATE CLIENT
// ---------------------------------
// Sebelum ini, pencarian di halaman transaksi adalah `useState` + `Array.filter`
// atas prop `transactions` — yaitu atas 25 baris yang sedang dikirim, bukan atas
// tabelnya. Di halaman yang sama, headernya menulis jumlah SELURUH tabel, dan
// keadaan kosongnya menulis `Tidak ada pesanan yang cocok dengan "…"`.
//
// Jadi pada tabel 4.000 baris, admin mengetik nomor pesanan yang ADA, dan sistem
// menjawab bahwa ia tidak ada. Itu bukan pencarian yang kurang lengkap; itu
// jawaban yang salah pada pertanyaan yang paling sering ditanyakan ke halaman
// ini — dan tidak ada satu pun tanda di layar yang membuat admin curiga.
//
// Sebagai formulir GET, kata kuncinya menjadi bagian URL. Tiga akibatnya:
//
//  1. Servernya yang mencari, jadi jawabannya atas seluruh tabel.
//  2. Hasil pencarian bisa di-bookmark dan dikirim ke rekan.
//  3. Tombol kembali peramban bekerja, dan paginasi bisa membawa kata kuncinya.
//
// `method="get"` eksplisit walau itu bawaan `<form>`: yang membuat komponen ini
// bekerja adalah GET-nya, dan atribut bawaan yang tidak tertulis adalah atribut
// yang akan hilang saat seseorang menambahkan `action` lain.
//
// Saringan yang sedang aktif dibawa sebagai `<input type="hidden">`, bukan
// ditempel ke `action`: query di `action` DIBUANG peramban saat formulir GET
// dikirim — seluruhnya diganti oleh pasangan nama/nilai dari medannya. Menaruh
// `?status=REFUND` di `action` karena itu menghasilkan tab yang diam-diam
// kembali ke "Semua" setiap kali admin menekan Cari.

import { Search } from 'lucide-react';
import { PANJANG_KATA_KUNCI_MAKS } from '@/lib/kueri-daftar';

export default function KotakCari({
  basis,
  nilai,
  label,
  placeholder,
  tersembunyi = {},
}: {
  /** Jalur tanpa query, mis. `/admin/orders`. */
  basis: string;
  /** Kata kunci yang sedang berlaku, supaya kotaknya tidak kosong setelah cari. */
  nilai: string;
  /** Label untuk pembaca layar; kotak ini tidak punya label kasatmata. */
  label: string;
  placeholder: string;
  /**
   * Saringan dan urutan yang sedang aktif. Tanpa dibawa, menekan Cari sambil
   * membuka tab "Refund" melempar admin ke seluruh transaksi — dan ia akan
   * membaca hasilnya sebagai hasil pencarian di dalam tab itu.
   *
   * `halaman` TIDAK perlu dibawa dan memang tidak boleh: pencarian baru selalu
   * dimulai dari halaman 1, dan membawa `halaman=7` mendaratkan admin di luar
   * jangkauan hasil yang baru.
   */
  tersembunyi?: Record<string, string | undefined | null>;
}) {
  return (
    <form method="get" action={basis} className="flex gap-2" role="search">
      {Object.entries(tersembunyi).map(([kunci, isi]) =>
        isi === undefined || isi === null || isi === '' ? null : (
          <input key={kunci} type="hidden" name={kunci} value={String(isi)} />
        )
      )}

      {/* `type="search"`, jadi peramban memberi tombol silang untuk mengosongkan.
          `defaultValue`, bukan `value`: tanpa `onChange`, `value` membuat React
          menjadikan medannya hanya-baca dan admin tidak bisa mengetik apa pun. */}
      <label className="relative flex-1">
        <span className="sr-only">{label}</span>
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          name="q"
          defaultValue={nilai}
          maxLength={PANJANG_KATA_KUNCI_MAKS}
          placeholder={placeholder}
          // `focus:border-utero` sendirian tidak cukup, dan itu bukan soal
          // selera: `focus:outline-none` membuang penanda fokus bawaan peramban,
          // dan yang menggantikannya hanya perubahan WARNA pada batas 1px.
          // Perubahan sehalus itu tidak terlihat pada isian teks — pengguna papan
          // tombol tidak punya cara tahu kursornya sudah masuk ke kotak ini.
          // `focus:ring-2` memberi penanda yang benar-benar kasatmata.
          className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-utero focus:border-utero"
        />
      </label>

      {/* Tombol kirim yang kasatmata, bukan hanya Enter. Kotak cari tanpa tombol
          membuat sebagian orang mengetik lalu menunggu daftarnya berubah sendiri
          — dan di formulir GET, ia tidak akan berubah. */}
      <button
        type="submit"
        className="rounded-md bg-gray-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-gray-900"
      >
        Cari
      </button>

      {nilai !== '' && (
        // Menghapus kata kuncinya lewat tautan, bukan tombol reset: `reset` hanya
        // mengembalikan medannya ke `defaultValue` — yaitu ke kata kunci yang
        // sedang berlaku — sehingga tombolnya tampak tidak melakukan apa pun.
        <a
          href={
            Object.entries(tersembunyi).filter(
              ([, isi]) => isi !== undefined && isi !== null && isi !== ''
            ).length === 0
              ? basis
              : `${basis}?${new URLSearchParams(
                  Object.entries(tersembunyi).filter(
                    (pasangan): pasangan is [string, string] =>
                      pasangan[1] !== undefined && pasangan[1] !== null && pasangan[1] !== ''
                  )
                ).toString()}`
          }
          className="rounded-md border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
        >
          Hapus
        </a>
      )}
    </form>
  );
}
