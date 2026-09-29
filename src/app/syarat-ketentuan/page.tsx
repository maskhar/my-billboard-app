// src/app/syarat-ketentuan/page.tsx
//
// Syarat & Ketentuan.
//
// KENAPA HALAMAN INI ADA
// ----------------------
// Aplikasi ini menerima uang. Sebelum halaman ini ada, aturan yang mengikat
// pembeli — tenggat bayar, apa yang terjadi bila tenggat lewat, siapa yang
// menang saat dua pesanan memperebutkan tanggal yang sama, ke rekening mana
// pengembalian dana dikirim — hanya hidup di dalam kode dan di kepala orang yang
// menulisnya. Pembeli yang pesanannya hangus karena terlambat bayar tidak punya
// satu pun halaman yang bisa ia baca untuk mengerti kenapa.
//
// ISINYA MENGIKUTI PERILAKU SISTEM, BUKAN TEMPLAT HUKUM
// ----------------------------------------------------
// Setiap butir di `BUTIR_SYARAT` (`src/lib/kebijakan.ts`) menggambarkan sesuatu
// yang benar-benar dilakukan kode: harga dihitung server dari harga media yang
// tersimpan, tanggal dikunci constraint database `booking_tanpa_tumpang_tindih`
// sehingga pesanan kedua ditolak saat itu juga alih-alih diterima lalu
// dibatalkan, pembayaran baru dinyatakan masuk ketika webhook penyedia
// mengonfirmasinya, dan pengembalian dana dikirim ke rekening bank yang diisi
// pembeli di pengajuan pembatalan. Tidak ada pasal yang mengatur sesuatu yang
// tidak punya kodenya.
//
// TIDAK ADA NOMINAL DAN TIDAK ADA PERSENTASE
// ------------------------------------------
// PPN, biaya admin, porsi uang muka, dan persentase pengembalian dana punya
// sumbernya masing-masing di kode dan sudah ditampilkan di halaman pemesanan
// serta halaman pembatalan. Menyalinnya ke sini membuat tempat tambahan yang
// harus ikut diubah setiap kali tarif bergeser — pada dokumen yang paling
// mungkin terlupakan dan yang paling merugikan bila keliru, karena inilah
// dokumen yang akan dibaca saat terjadi sengketa. Aturannya disebut, angkanya
// ditunjuk ke tempat yang menghitungnya.
//
// Server Component: tidak ada state dan tidak ada penangan peristiwa.

import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Mail, ScrollText } from 'lucide-react';
import { ambilIdentitasSitus } from '@/lib/identitas-situs';
import { BADAN_USAHA_PENJUAL, EMAIL_PENJUAL } from '@/lib/penjual';
import { BUTIR_SYARAT, TANGGAL_BERLAKU_KEBIJAKAN } from '@/lib/kebijakan';

export async function generateMetadata(): Promise<Metadata> {
  const { nama } = await ambilIdentitasSitus();

  return {
    title: 'Syarat & Ketentuan',
    description: `Ketentuan pemesanan, pembayaran, materi iklan, dan pembatalan untuk penyewaan media luar ruang di ${nama}.`,
  };
}

/** Tanggal berlaku dalam bahasa Indonesia, diformat di server. */
function tanggalBerlakuTerbaca(): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${TANGGAL_BERLAKU_KEBIJAKAN}T00:00:00+07:00`));
}

export default async function SyaratKetentuanPage() {
  const { nama } = await ambilIdentitasSitus();

  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />

      {/* Tanpa `id="isi"`: sasaran lompat-ke-isi dipasang Navbar sendiri. */}
      <main className="max-w-3xl mx-auto px-4 pt-24">
        <header>
          <div className="inline-flex items-center gap-2 text-utero">
            <ScrollText size={18} />
            <span className="text-[11px] font-bold tracking-widest uppercase">
              Syarat &amp; Ketentuan
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3 leading-tight">
            Ketentuan penyewaan di {nama}
          </h1>
          <p className="text-base text-gray-600 mt-4 leading-relaxed">
            Dengan membuat pesanan, Anda menyetujui ketentuan di bawah.
            Ketentuan ini menggambarkan cara kerja sistem kami yang sebenarnya —
            bukan daftar pasal yang tidak dijalankan.
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Berlaku sejak {tanggalBerlakuTerbaca()}. Penyelenggara:{' '}
            {BADAN_USAHA_PENJUAL}.
          </p>
        </header>

        <section className="mt-12 space-y-3">
          {BUTIR_SYARAT.map((butir) => (
            <article
              key={butir.judul}
              className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
            >
              <h2 className="font-bold text-gray-900">{butir.judul}</h2>
              <div className="mt-2 space-y-2">
                {butir.isi.map((paragraf) => (
                  <p
                    key={paragraf}
                    className="text-sm text-gray-600 leading-relaxed"
                  >
                    {paragraf}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Pertanyaan dan keberatan
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
              Sebutkan nomor pesanan Anda supaya kami bisa langsung memeriksanya.
            </p>
          </div>

          <p className="text-sm text-gray-500 mt-6 leading-relaxed">
            Penjelasan tentang data pribadi yang kami kumpulkan ada di halaman{' '}
            <Link
              href="/kebijakan-privasi"
              className="text-utero font-medium hover:underline"
            >
              Kebijakan Privasi
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
