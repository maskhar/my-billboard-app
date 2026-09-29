// src/app/kebijakan-privasi/page.tsx
//
// Kebijakan Privasi.
//
// KENAPA HALAMAN INI ADA
// ----------------------
// Aplikasi ini mengumpulkan nama, alamat surel, nomor WhatsApp, alamat kantor,
// NPWP, dan — pada pesanan tertentu — nomor serta alamat KTP, lalu mengirimkan
// sebagian di antaranya ke penyedia pembayaran, penyedia surel, penyimpanan
// gambar, dan satu layanan bahasa. Sebelum halaman ini ada, tidak satu pun dari
// itu diberitahukan kepada orang yang datanya dikumpulkan. Formulir pendaftaran
// meminta nomor WhatsApp tanpa menyebut untuk apa, dan halaman pemesanan
// meminta NPWP tanpa menyebut ke mana perginya.
//
// SELURUH ISINYA DARI `@/lib/kebijakan`, BUKAN DITULIS DI SINI
// -----------------------------------------------------------
// Halaman ini sengaja tidak memuat satu paragraf kebijakan pun sebagai teks
// JSX. Alasannya ada di kepala `src/lib/kebijakan.ts`: isi kebijakan yang
// berupa data bisa diuji terhadap `prisma/schema.prisma`, sehingga kolom data
// pribadi baru menggagalkan test sampai kebijakannya ikut diperbarui. Kalau
// paragrafnya ditulis di sini, tidak ada yang bisa memeriksanya, dan halaman
// ini akan menjadi usang dalam hitungan bulan tanpa ada yang tahu.
//
// YANG SENGAJA TIDAK DITULIS
// --------------------------
// Tidak ada masa retensi dalam angka ("dihapus setelah 2 tahun"): satu-satunya
// pekerjaan terjadwal di aplikasi ini adalah `/api/cron/sweep`, yang
// menghanguskan pesanan kedaluwarsa dan token reset sandi — bukan menghapus
// data pribadi. Menulis angka retensi berarti berjanji sesuatu yang tidak ada
// kodenya. Tidak ada klaim sertifikasi keamanan, tidak ada pemberitahuan cookie
// (satu-satunya cookie yang dipasang aplikasi ini adalah cookie sesi masuk, dan
// nol pelacak terpasang), dan tidak ada nominal apa pun.
//
// Server Component: tidak ada state dan tidak ada penangan peristiwa.

import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Mail, ShieldCheck } from 'lucide-react';
import { ambilIdentitasSitus } from '@/lib/identitas-situs';
import { BADAN_USAHA_PENJUAL, EMAIL_PENJUAL } from '@/lib/penjual';
import {
  HAK_ANDA,
  KATEGORI_DATA,
  PENERIMA_DATA,
  TANGGAL_BERLAKU_KEBIJAKAN,
} from '@/lib/kebijakan';

/**
 * Judul halaman.
 *
 * `title` teks biasa, bukan objek: layout akar sudah menetapkan
 * `template: '%s | {nama}'`. `ambilIdentitasSitus` dibungkus `cache()` React,
 * jadi pemanggilan ini tidak menambah query.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { nama } = await ambilIdentitasSitus();

  return {
    title: 'Kebijakan Privasi',
    description: `Data apa yang dikumpulkan ${nama}, untuk apa dipakai, siapa yang menerimanya, dan bagaimana Anda meminta penghapusannya.`,
  };
}

/**
 * Tanggal berlaku dalam bahasa Indonesia.
 *
 * Diformat dengan `Intl` di server, bukan di browser: hasilnya sama untuk semua
 * pengunjung, dan tidak ada perbedaan render server-klien yang bisa memicu
 * peringatan hidrasi.
 */
function tanggalBerlakuTerbaca(): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${TANGGAL_BERLAKU_KEBIJAKAN}T00:00:00+07:00`));
}

export default async function KebijakanPrivasiPage() {
  const { nama } = await ambilIdentitasSitus();

  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />

      {/* Tanpa `id="isi"`: Navbar sudah memasang sasaran lompat-ke-isi itu
          sendiri di akhir render-nya. Menambahkannya di sini membuat dua elemen
          dengan id yang sama, dan tautan "Lewati ke isi" selalu melompat ke yang
          pertama — bukan ke yang dimaksud. */}
      <main className="max-w-3xl mx-auto px-4 pt-24">
        <header>
          <div className="inline-flex items-center gap-2 text-utero">
            <ShieldCheck size={18} />
            <span className="text-[11px] font-bold tracking-widest uppercase">
              Kebijakan Privasi
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3 leading-tight">
            Data Anda di {nama}
          </h1>
          <p className="text-base text-gray-600 mt-4 leading-relaxed">
            Halaman ini menjelaskan data apa yang kami kumpulkan, untuk apa
            dipakai, siapa saja yang menerimanya, dan bagaimana Anda memintanya
            dihapus. Ditulis sesuai apa yang benar-benar dilakukan sistem kami —
            termasuk bagian yang tidak menyenangkan.
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Berlaku sejak {tanggalBerlakuTerbaca()}. Pengelola data:{' '}
            {BADAN_USAHA_PENJUAL}.
          </p>
        </header>

        {/* DATA YANG DIKUMPULKAN */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Data yang kami kumpulkan
          </h2>
          <div className="mt-4 space-y-3">
            {KATEGORI_DATA.map((kategori) => (
              <article
                key={kategori.judul}
                className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
              >
                <h3 className="font-bold text-gray-900">{kategori.judul}</h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {kategori.tujuan}
                </p>
                <p className="text-xs text-gray-500 mt-3">
                  Diminta: {kategori.kapan}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* PENERIMA */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Siapa yang menerima data Anda
          </h2>
          <p className="text-sm text-gray-600 mt-3 leading-relaxed">
            Kami tidak menjual data Anda dan tidak memasang satu pun layanan
            pelacak atau analitik iklan. Pihak di bawah menerima data karena
            layanannya dibutuhkan untuk menjalankan pesanan Anda, dan hanya
            sebatas yang disebutkan.
          </p>
          <div className="mt-4 divide-y divide-gray-100 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {PENERIMA_DATA.map((penerima) => (
              <div key={penerima.nama} className="p-6">
                <h3 className="font-bold text-gray-900">{penerima.nama}</h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {penerima.data}
                </p>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  {penerima.alasan}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* PENYIMPANAN */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Berapa lama data disimpan
          </h2>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mt-4 space-y-3">
            <p className="text-sm text-gray-600 leading-relaxed">
              Data akun dan pesanan Anda disimpan selama akun Anda aktif. Kami
              tidak menetapkan batas waktu otomatis, dan kami tidak akan menulis
              angka di sini yang tidak dijalankan sistem kami.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Yang terhapus otomatis: pesanan yang tidak dibayar sampai
              tenggatnya, dan tautan reset kata sandi yang kedaluwarsa.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Catatan transaksi yang sudah dibayar kami simpan selama masih
              dibutuhkan untuk kewajiban pembukuan dan perpajakan, walaupun akun
              Anda dihapus. Catatan itu juga bukti hak Anda atas ruang iklan
              yang sudah Anda bayar.
            </p>
          </div>
        </section>

        {/* HAK */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Hak Anda
          </h2>
          <div className="mt-4 space-y-3">
            {HAK_ANDA.map((hak) => (
              <article
                key={hak.judul}
                className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
              >
                <h3 className="font-bold text-gray-900">{hak.judul}</h3>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {hak.isi}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* KONTAK */}
        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Menghubungi kami soal data Anda
          </h2>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mt-4">
            <a
              href={`mailto:${EMAIL_PENJUAL}`}
              className="flex items-center gap-3 text-gray-900 font-medium hover:text-utero transition"
            >
              <Mail size={18} className="text-utero flex-shrink-0" />
              <span className="break-all">{EMAIL_PENJUAL}</span>
            </a>
            <p className="text-sm text-gray-500 mt-3 leading-relaxed">
              Kirim dari alamat surel akun Anda supaya kami bisa memastikan
              permintaan itu benar dari Anda. Permintaan penghapusan dan
              permintaan salinan dilayani manual oleh tim kami.
            </p>
          </div>

          <p className="text-sm text-gray-500 mt-6 leading-relaxed">
            Ketentuan pemesanan, pembayaran, dan pembatalan ada di halaman{' '}
            <Link
              href="/syarat-ketentuan"
              className="text-utero font-medium hover:underline"
            >
              Syarat &amp; Ketentuan
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
