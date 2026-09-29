// src/app/about/page.tsx
//
// Halaman "Tentang Kami" — rute yang selama ini DITAUTKAN tapi tidak ada.
//
// KENAPA HALAMAN INI ADA
// ----------------------
// `src/components/Navbar.tsx` dulu memasang tautan `/about` di menu desktop dan
// mobile, dan `src/app/` tidak punya folder itu. Setiap pengunjung yang
// mengkliknya mendapat 404. Tautannya dibuang lebih dulu (lihat komentar di
// kepala Navbar) dengan alasan yang masih berlaku: halaman dulu, tautan
// kemudian. Berkas ini adalah halamannya, dan tautannya dipasang kembali di
// commit yang sama.
//
// ISINYA HANYA YANG BISA DIBUKTIKAN KODE
// --------------------------------------
// Tidak ada tahun berdiri, jumlah klien, jumlah titik media, nama tim, maupun
// angka "kepuasan pelanggan" di bawah. Semua itu adalah klaim tentang
// perusahaan yang tidak satu pun tersimpan di aplikasi ini, jadi menuliskannya
// berarti mengarang — pada halaman yang justru dibuka orang untuk menilai
// apakah penjualnya bisa dipercaya. Yang ditulis di sini hanya: identitas
// penjual dari `@/lib/penjual`, nama serta keterangan situs yang diatur admin,
// jenis media yang benar-benar ada di filter pencarian, dan urutan tahap
// pesanan yang benar-benar dijalankan `TRANSISI_SAH`.
//
// TIDAK ADA NOMINAL DI HALAMAN INI
// --------------------------------
// PPN, biaya admin, dan porsi DP punya satu sumber di
// `src/app/api/booking/create/route.ts`, dan `CheckoutForm` sudah menjadi
// tempat kedua yang WAJIB sama dengannya (komentar di sana menjelaskan
// akibatnya bila meleset: pembeli melihat satu angka lalu ditagih angka lain).
// Menyebut persentasenya di sini membuat tempat KETIGA yang harus ikut diubah
// setiap kali tarif bergeser — dan halaman tentang perusahaan adalah tempat
// yang paling mungkin terlupakan. Skema bayarnya disebut tanpa angka.
//
// Ini Server Component: tidak ada state dan tidak ada penangan peristiwa, jadi
// tidak ada alasan mengirim JavaScript-nya ke browser.

import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Building2, Mail, MapPin, MessageCircle, MonitorPlay } from 'lucide-react';
import { ambilIdentitasSitus } from '@/lib/identitas-situs';
import { keTautanWa } from '@/lib/telepon';
import { JENIS_MEDIA } from '@/lib/tipe-billboard';
import {
  ALAMAT_PENJUAL,
  BADAN_USAHA_PENJUAL,
  EMAIL_PENJUAL,
  TAGLINE_PENJUAL,
} from '@/lib/penjual';

/**
 * Judul halaman, dengan nama usaha dari pengaturan admin.
 *
 * `title` di sini adalah teks biasa, bukan objek: layout akar sudah menetapkan
 * `template: '%s | {nama}'`, jadi nama usaha ditempel di belakang tanpa perlu
 * ditulis ulang. Yang perlu dibaca dari database hanyalah `deskripsi`, untuk
 * ringkasan hasil pencarian.
 *
 * `ambilIdentitasSitus` dibungkus `cache()` React, jadi pemanggilan di sini
 * tidak menambah satu pun query: `generateMetadata` layout akar sudah
 * memanggilnya pada permintaan yang sama.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { nama, deskripsi } = await ambilIdentitasSitus();

  return {
    title: 'Tentang Kami',
    description: `${nama} — ${deskripsi}. Sewa videotron, baliho, dan megatron dengan tahap pesanan yang bisa diikuti dari dashboard.`,
  };
}

// Jenis media yang ditawarkan — sekarang DIIMPOR, tidak lagi ditulis di sini.
//
// Komentar yang dulu di tempat ini sudah menuliskan kontraknya: "Ketiganya sama
// dengan pilihan di `SearchFilter`, dan itu syarat: jenis yang disebut di sini
// tapi tidak bisa disaring di peta adalah janji yang tidak punya jalan untuk
// ditelusuri pengunjung." Kontrak itu ditegakkan tangan atas TIGA salinan — dua
// di `SearchFilter` dan satu di sini — jadi ia adalah kontrak yang menunggu
// dilanggar. Sekarang satu daftar di `@/lib/tipe-billboard` yang dibaca ketiga
// pembacanya sekaligus, dan daftar yang sama itulah yang menjadi gerbang
// `?type=` di server. Jenis keempat karena itu tidak bisa lagi muncul di sini
// tanpa bisa disaring.

// Tahap pesanan.
//
// Ini memang urutan — bukan daftar yang dinomori supaya terlihat rapi — dan
// urutannya mengikuti `TRANSISI_SAH` di `src/lib/transisi-status.ts`: menunggu
// pembayaran, pembayaran terverifikasi, materi diterima, produksi, pemasangan,
// tayang. Nama tahapnya ditulis dalam bahasa yang dipakai pembeli, bukan nama
// enum-nya.
const TAHAP_PESANAN = [
  {
    judul: 'Pilih titik di peta',
    isi: 'Halaman depan adalah peta seluruh media yang sedang ditayangkan. Setiap titik punya kalender ketersediaan, jadi tanggal yang sudah terjual terlihat sebelum Anda memesan.',
  },
  {
    judul: 'Isi pesanan dan bayar',
    isi: 'Anda memilih durasi sewa, menentukan materi iklan diunggah sendiri atau dikerjakan tim desain kami, lalu membayar lunas atau dengan uang muka. Seluruh nominal dihitung server dari harga media yang tersimpan.',
  },
  {
    judul: 'Materi disiapkan dan diproduksi',
    isi: 'Setelah pembayaran tercatat, materi masuk ke tahap produksi. Status pesanan bergerak di dashboard Anda pada setiap perpindahan tahap.',
  },
  {
    judul: 'Pemasangan dan tayang',
    isi: 'Media dipasang di titik yang Anda pilih, lalu pesanan berstatus tayang sampai masa sewanya berakhir. Bukti pemasangan dan laporan lalu lintas tersedia di dashboard.',
  },
] as const;

export default async function AboutPage() {
  const { nama, deskripsi, nomorWa } = await ambilIdentitasSitus();

  // Tanpa pesan pembuka: halaman ini tidak sedang menunjukkan satu titik media,
  // jadi tidak ada konteks yang bisa disebut. Menuliskan "Halo" saja lalu
  // mengirimkannya membuat sales menerima pesan yang tidak menambah apa pun di
  // atas pesan yang ditulis pengunjung sendiri.
  const tautanWa = keTautanWa(nomorWa);

  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 pt-24">
        {/* HERO */}
        <header>
          <p className="text-[11px] font-bold text-utero tracking-widest uppercase">
            {TAGLINE_PENJUAL}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3 leading-tight">
            {nama}
          </h1>
          <p className="text-base text-gray-600 mt-4 leading-relaxed max-w-2xl">
            {deskripsi}. Kami menyewakan ruang iklan luar ruang dan mengerjakan
            seluruh tahapnya — dari pemilihan titik sampai media terpasang dan
            tayang — dalam satu pesanan yang bisa Anda ikuti sendiri.
          </p>
        </header>

        {/* JENIS MEDIA */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Yang kami sewakan
          </h2>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            {JENIS_MEDIA.map((media) => (
              <Link
                key={media.nama}
                // `/billboards`, bukan `/`. Keduanya menerima `?type=` yang sama
                // lewat `wherePublikBillboard`, tapi yang dituju kartu ini adalah
                // "tunjukkan media jenis ini" — dan di beranda jawabannya berupa
                // penanda di peta yang harus diklik satu per satu untuk dibaca.
                // Katalog menjawabnya sebagai daftar yang bisa dibaca langsung,
                // beserta jumlah hasilnya.
                href={`/billboards?type=${encodeURIComponent(media.nama)}`}
                className="block bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:border-utero transition"
              >
                <MonitorPlay className="text-utero" size={22} />
                <h3 className="font-bold text-gray-900 mt-4">{media.nama}</h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {media.keterangan}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* TAHAP PESANAN */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Bagaimana pesanan berjalan
          </h2>
          <ol className="mt-4 space-y-3">
            {TAHAP_PESANAN.map((tahap, nomor) => (
              <li
                key={tahap.judul}
                className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex gap-5"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold flex items-center justify-center">
                  {nomor + 1}
                </span>
                <div>
                  <h3 className="font-bold text-gray-900">{tahap.judul}</h3>
                  <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                    {tahap.isi}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* KONTAK */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Hubungi kami
          </h2>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mt-4 space-y-4">
            <div className="flex gap-4">
              <Building2 className="text-gray-400 flex-shrink-0" size={18} />
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">
                  Badan usaha
                </p>
                <p className="text-sm text-gray-800 font-medium mt-0.5">
                  {BADAN_USAHA_PENJUAL}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <MapPin className="text-gray-400 flex-shrink-0" size={18} />
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Kantor</p>
                <p className="text-sm text-gray-800 font-medium mt-0.5">
                  {ALAMAT_PENJUAL}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Mail className="text-gray-400 flex-shrink-0" size={18} />
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Surel</p>
                {/* `mailto:` dan bukan formulir kontak: formulir menuntut
                    endpoint, penyimpanan, dan penjaga spam yang belum ada —
                    dan formulir yang kirimannya tidak sampai ke siapa pun
                    lebih buruk daripada alamat surel biasa. */}
                <a
                  href={`mailto:${EMAIL_PENJUAL}`}
                  className="text-sm text-utero font-medium mt-0.5 block hover:underline"
                >
                  {EMAIL_PENJUAL}
                </a>
              </div>
            </div>

            {/* WhatsApp hanya muncul bila admin sudah mengaturnya. Halaman ini
                tidak pernah menampilkan baris kontak kosong: baris "WhatsApp:
                —" adalah janji jalur kontak yang tidak ada. */}
            {tautanWa && (
              <div className="flex gap-4">
                <MessageCircle className="text-gray-400 flex-shrink-0" size={18} />
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase">WhatsApp</p>
                  <a
                    href={tautanWa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-utero font-medium mt-0.5 block hover:underline"
                  >
                    {nomorWa}
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="mt-10">
          <Link
            href="/"
            className="inline-block bg-gray-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition"
          >
            Lihat peta billboard
          </Link>
        </div>
      </main>
    </div>
  );
}
