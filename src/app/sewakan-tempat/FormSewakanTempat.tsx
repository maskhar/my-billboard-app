// src/app/sewakan-tempat/FormSewakanTempat.tsx
'use client';

// Formulir pengajuan titik. Client Component karena punya state dan penangan
// peristiwa; halaman pembungkusnya tetap Server Component supaya metadata dan
// teks pengantarnya tidak ikut dikirim sebagai JavaScript.
//
// TIGA CACAT YANG SENGAJA TIDAK DIULANG DI SINI
// ---------------------------------------------
// `src/app/register/page.tsx` adalah formulir publik lain di aplikasi ini, dan
// tiga hal di sana tidak ditiru:
//
//   1. `type="number"` untuk nomor telepon. Spinner naik-turun pada nomor
//      telepon tidak berarti apa pun, roda tetikus mengubah nilainya tanpa
//      disadari, dan `0` di depan hilang di beberapa peramban. `type="tel"` yang
//      benar — papan tombol angka di ponsel, teks apa adanya.
//   2. `<label>` tanpa `htmlFor`. Label yang tidak terhubung tidak bisa diklik
//      untuk memfokuskan isiannya, dan pembaca layar menyebut kolomnya tanpa
//      nama.
//   3. `outline-none` tanpa pengganti. Pengguna papan tombol kehilangan jejak
//      fokusnya sepenuhnya. Di bawah dipakai `focus:ring-2` sebagai penanda yang
//      terlihat.
//
// Ketiganya tercatat sebagai temuan terbuka di `docs/audit/`. Memperbaikinya di
// `register/page.tsx` adalah pekerjaan tersendiri; yang jelas, cacat yang sudah
// diketahui tidak disalin ke berkas baru.

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';

const KELAS_ISIAN =
  'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-3 ' +
  'outline-none focus:ring-2 focus:ring-utero focus:border-utero transition';

const KELAS_LABEL = 'block mb-1.5 text-sm font-medium text-gray-900';

export default function FormSewakanTempat({ tautanWa }: { tautanWa: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [terkirim, setTerkirim] = useState(false);

  const kirim = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const data = new FormData(e.currentTarget);

    try {
      const res = await fetch('/api/sewakan-tempat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namaPemilik: data.get('namaPemilik'),
          nomorWa: data.get('nomorWa'),
          email: data.get('email'),
          alamat: data.get('alamat'),
          kota: data.get('kota'),
          ukuran: data.get('ukuran'),
          catatan: data.get('catatan'),
        }),
      });

      const jawaban = await bacaJawaban(res);

      if (!res.ok) {
        // "Nomor WhatsApp tidak valid" dan "Terlalu banyak pengajuan dari
        // jaringan ini" menuntut tindakan yang berbeda. Pesan server dipakai apa
        // adanya, bukan diganti satu teks umum.
        setError(alasanPenolakan(res, jawaban));
        return;
      }

      // Formulirnya diganti layar konfirmasi, bukan dikosongkan. Formulir yang
      // kembali kosong setelah dikirim terbaca seperti kiriman yang hilang, dan
      // pengaju mengirimnya lagi.
      setTerkirim(true);
    } catch (galat) {
      console.error('Gagal mengirim pengajuan titik:', galat);
      setError(pesanGalat(galat, 'Gagal menghubungi server. Coba lagi sebentar.'));
    } finally {
      // Di `finally`, bukan di akhir badan fungsi: bila `fetch` melempar,
      // tombolnya harus tetap hidup kembali. Tanpa ini tombol tertinggal
      // berbunyi "Mengirim..." selamanya.
      setLoading(false);
    }
  };

  if (terkirim) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
        <CheckCircle2 className="text-green-600 mx-auto" size={44} />
        <h2 className="text-xl font-bold text-gray-900 mt-4">Pengajuan terkirim</h2>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed max-w-md mx-auto">
          Tim kami akan menghubungi nomor WhatsApp yang Anda tulis untuk membahas
          lokasinya. Siapkan foto lokasi bila ada — kirimkan lewat WhatsApp saat
          kami menghubungi Anda.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
          <Link
            href="/"
            className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition"
          >
            Lihat peta billboard
          </Link>
          {/* Hanya muncul bila admin sudah mengatur nomornya. Tombol WhatsApp
              yang menunjuk ke nomor kosong lebih buruk daripada tidak ada
              tombolnya. */}
          {tautanWa && (
            <a
              href={tautanWa}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-50 transition"
            >
              Chat sales sekarang
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={kirim} className="bg-white p-6 md:p-8 rounded-2xl border border-gray-100 shadow-sm">
      {error && (
        <div
          // `role="alert"` supaya pembaca layar menyebutkan galatnya saat muncul.
          // Tanpa ini pengguna papan tombol menekan kirim, tidak terjadi apa pun
          // yang terdengar, dan ia menyimpulkan tombolnya rusak.
          role="alert"
          className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200 mb-6"
        >
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="namaPemilik" className={KELAS_LABEL}>
            Nama Anda <span className="text-utero">*</span>
          </label>
          <input
            id="namaPemilik"
            name="namaPemilik"
            type="text"
            required
            maxLength={120}
            autoComplete="name"
            className={KELAS_ISIAN}
            placeholder="Nama pemilik atau pengelola lahan"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="nomorWa" className={KELAS_LABEL}>
              Nomor WhatsApp <span className="text-utero">*</span>
            </label>
            <input
              id="nomorWa"
              name="nomorWa"
              type="tel"
              required
              autoComplete="tel"
              className={KELAS_ISIAN}
              placeholder="08123456789"
            />
            <p className="text-xs text-gray-500 mt-1.5">Nomor inilah yang kami hubungi.</p>
          </div>
          <div>
            <label htmlFor="email" className={KELAS_LABEL}>
              Email <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              maxLength={200}
              autoComplete="email"
              className={KELAS_ISIAN}
              placeholder="nama@email.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="alamat" className={KELAS_LABEL}>
            Alamat atau patokan lokasi <span className="text-utero">*</span>
          </label>
          <input
            id="alamat"
            name="alamat"
            type="text"
            required
            maxLength={500}
            className={KELAS_ISIAN}
            placeholder="Jl. Contoh No. 10, depan minimarket"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="kota" className={KELAS_LABEL}>
              Kota <span className="text-utero">*</span>
            </label>
            <input
              id="kota"
              name="kota"
              type="text"
              required
              maxLength={80}
              className={KELAS_ISIAN}
              placeholder="Surabaya"
            />
          </div>
          <div>
            <label htmlFor="ukuran" className={KELAS_LABEL}>
              Perkiraan ukuran <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            {/* Teks bebas, bukan dua kolom angka: pemilik lahan menulis "4x6 m",
                "sekitar 5 meteran", atau "bekas baliho lama". Memaksa angka
                berarti menolak pengajuan yang sah karena formatnya — dan
                ukurannya diukur ulang saat survei. */}
            <input
              id="ukuran"
              name="ukuran"
              type="text"
              maxLength={60}
              className={KELAS_ISIAN}
              placeholder="4x6 m, atau perkiraan kasar"
            />
          </div>
        </div>

        <div>
          <label htmlFor="catatan" className={KELAS_LABEL}>
            Keterangan tambahan <span className="text-gray-400 font-normal">(opsional)</span>
          </label>
          <textarea
            id="catatan"
            name="catatan"
            rows={4}
            maxLength={2000}
            className={KELAS_ISIAN}
            placeholder="Kondisi lahan, arah hadap, akses listrik, atau hal lain yang perlu kami tahu."
          />
        </div>
      </div>

      {/* Tidak ada kolom harga di formulir ini. Angka yang diisi pemilik lahan
          sebelum lokasinya disurvei bukan kesepakatan, dan menyimpannya sebagai
          nominal membuat baris yang terlihat resmi padahal belum pernah
          disetujui siapa pun. Harganya dibicarakan saat kami menghubungi. */}
      {/* Kalimat kedua sudah berupa janji tentang data ("hanya kami pakai
          untuk menghubungi Anda"), dan sampai halaman kebijakan ada, janji itu
          tidak punya satu pun tempat yang bisa dibuka untuk memeriksanya.
          Tautannya dipasang di kalimat yang sudah ada, bukan sebagai paragraf
          baru: formulir ini diisi tamu tanpa akun, dan menambah blok hukum di
          bawah tombol hanya membuatnya terlihat lebih berat dari isinya. */}
      <p className="text-xs text-gray-500 mt-6 leading-relaxed">
        Nilai sewanya dibicarakan setelah kami melihat lokasinya, jadi tidak ada
        kolom harga di sini. Data Anda hanya kami pakai untuk menghubungi Anda
        soal lokasi ini — selengkapnya di{' '}
        <Link
          href="/kebijakan-privasi"
          className="text-utero hover:underline rounded outline-none focus:ring-2 focus:ring-utero"
        >
          Kebijakan Privasi
        </Link>
        .
      </p>

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-6 bg-utero text-white font-bold text-sm px-5 py-3.5 rounded-xl hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-wait transition"
      >
        {loading ? 'Mengirim...' : 'Kirim pengajuan'}
      </button>
    </form>
  );
}
