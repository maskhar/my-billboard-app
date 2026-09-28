// src/app/sewakan-tempat/page.tsx
//
// Halaman "Sewakan Tempat" — tujuan tombol yang selama ini tidak menuju ke mana
// pun.
//
// KENAPA HALAMAN INI ADA
// ----------------------
// `src/components/Navbar.tsx` dulu punya dua tombol "Sewakan Tempat" (desktop
// dan mobile) tanpa `onClick`, tanpa `href`, dan tanpa `type`. Diklik, tidak
// terjadi apa pun. Keduanya dibuang, bukan ditambal, dengan alasan yang masih
// berlaku dan tercatat di kepala Navbar: alur dulu, tombol kemudian. Berkas ini
// adalah alurnya, dan tombolnya dipasang kembali di commit yang sama —
// urutan yang sama dengan `/about`.
//
// ISINYA HANYA YANG BISA DIBUKTIKAN KODE
// --------------------------------------
// Tidak ada "500+ mitra", "bagi hasil sampai 40%", jangka waktu kontrak, maupun
// angka pendapatan di bawah. Semua itu klaim tentang perjanjian komersial yang
// tidak satu pun tersimpan di aplikasi ini, jadi menuliskannya berarti
// mengarang — pada halaman yang justru dibuka orang untuk menilai apakah
// penawarannya serius. Yang ditulis hanya urutan langkah yang benar-benar
// dijalankan `StatusPengajuanTitik` dan kontak yang benar-benar ada.
//
// Ini Server Component; formulirnya sendiri (`FormSewakanTempat`) yang Client,
// karena hanya formulir itu punya state.

import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ambilIdentitasSitus } from '@/lib/identitas-situs';
import { keTautanWa } from '@/lib/telepon';
import FormSewakanTempat from './FormSewakanTempat';

/**
 * `title` adalah teks biasa, bukan objek: layout akar sudah menetapkan
 * `template: '%s | {nama}'`.
 *
 * `ambilIdentitasSitus` dibungkus `cache()` React, jadi pemanggilan di sini dan
 * di komponen halaman tidak menambah satu pun query — `generateMetadata` layout
 * akar sudah memanggilnya pada permintaan yang sama.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { nama } = await ambilIdentitasSitus();

  return {
    title: 'Sewakan Tempat Anda',
    description: `Punya lahan atau bidang kosong yang strategis? Ajukan lokasinya ke ${nama} dan tim kami akan menghubungi Anda untuk membahasnya.`,
  };
}

// Langkah setelah pengajuan masuk.
//
// Ini memang urutan — bukan daftar yang dinomori supaya terlihat rapi — dan
// urutannya mengikuti `enum StatusPengajuanTitik` di `prisma/schema.prisma`:
// `BARU`, `DIHUBUNGI`, lalu `SELESAI` atau `DITOLAK`. Namanya ditulis dalam
// bahasa yang dipakai pemilik lahan, bukan nama enum-nya.
const LANGKAH = [
  {
    judul: 'Anda kirim lokasinya',
    isi: 'Cukup nama, nomor WhatsApp, dan di mana lokasinya. Tidak perlu membuat akun, dan tidak perlu menyiapkan dokumen apa pun dulu.',
  },
  {
    judul: 'Kami menghubungi Anda',
    isi: 'Tim kami menghubungi nomor WhatsApp yang Anda tulis untuk menanyakan detail lokasi dan meminta fotonya bila ada. Nilai sewa dibicarakan pada tahap ini.',
  },
  {
    judul: 'Survei dan kesepakatan',
    isi: 'Bila lokasinya cocok, kami survei langsung untuk mengukur bidangnya dan memeriksa perizinannya. Kesepakatan dibuat setelah itu, bukan sebelum.',
  },
  {
    judul: 'Titik Anda masuk ke katalog',
    isi: 'Setelah media terpasang, lokasi Anda muncul di peta kami dan mulai ditawarkan ke pengiklan.',
  },
] as const;

export default async function SewakanTempatPage() {
  const { nomorWa } = await ambilIdentitasSitus();

  // Pesan pembuka menyebut konteksnya: sales yang menerima pesan ini langsung
  // tahu percakapannya soal penawaran lahan, bukan soal pemesanan billboard.
  const tautanWa = keTautanWa(
    nomorWa,
    'Halo, saya punya lokasi yang ingin saya sewakan.'
  );

  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 pt-24">
        {/* HERO */}
        <header>
          <p className="text-[11px] font-bold text-utero tracking-widest uppercase">
            Untuk pemilik lahan
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3 leading-tight">
            Punya lokasi strategis yang belum terpakai?
          </h1>
          <p className="text-base text-gray-600 mt-4 leading-relaxed max-w-2xl">
            Kirimkan lokasinya, dan tim kami akan menghubungi Anda untuk
            membahasnya. Tidak perlu membuat akun, dan mengirim pengajuan belum
            mengikat Anda pada apa pun.
          </p>
        </header>

        {/* FORMULIR — didahulukan di atas penjelasan langkah.
            Pengunjung halaman ini datang untuk mengajukan lokasi, bukan untuk
            membaca prosesnya; prosesnya ada di bawah bagi yang ingin tahu. */}
        <section className="mt-10">
          <FormSewakanTempat tautanWa={tautanWa} />
        </section>

        {/* LANGKAH */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Apa yang terjadi setelah Anda kirim
          </h2>
          <ol className="mt-4 space-y-3">
            {LANGKAH.map((langkah, nomor) => (
              <li
                key={langkah.judul}
                className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex gap-5"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold flex items-center justify-center">
                  {nomor + 1}
                </span>
                <div>
                  <h3 className="font-bold text-gray-900">{langkah.judul}</h3>
                  <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                    {langkah.isi}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link
            href="/about"
            className="inline-block bg-gray-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition text-center"
          >
            Tentang kami
          </Link>
          {/* Hanya bila admin sudah mengatur nomornya — halaman ini tidak pernah
              menampilkan tombol kontak yang tidak menuju ke siapa pun. */}
          {tautanWa && (
            <a
              href={tautanWa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-bold text-sm hover:bg-white transition text-center"
            >
              Tanya dulu lewat WhatsApp
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
