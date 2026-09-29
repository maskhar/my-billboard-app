// src/app/register/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useToast } from '@/components/ui/Toast';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';

// TIGA CACAT YANG DITAMBAL DI SINI, dan ketiganya sudah dijelaskan di
// `src/app/sewakan-tempat/FormSewakanTempat.tsx` — berkas itu menolak
// menirunya dari sini dan menuliskan alasannya. Kelas dan bentuk isian di
// bawah mengikuti berkas itu supaya kedua formulir publik tidak menyimpang:
//
//   1. `outline-none` TANPA pengganti. Yang ada sebelumnya `focus:ring-utero`
//      saja — Tailwind memerlukan `ring-2` untuk lebar cincinnya, jadi
//      `ring-utero` sendirian hanya menyetel warna cincin yang lebarnya nol.
//      Hasilnya penanda fokus yang benar-benar tidak terlihat, dan pengguna
//      papan tombol kehilangan jejak posisinya di formulir pendaftaran.
//   2. `type="number"` untuk nomor telepon. Spinner naik-turun tidak berarti
//      apa pun pada nomor telepon, roda tetikus mengubah nilainya tanpa
//      disadari, dan `0` di depan hilang di beberapa peramban — padahal setiap
//      nomor WhatsApp Indonesia dimulai dengan `0`.
//   3. `<label>` tanpa `htmlFor`. Labelnya tidak bisa diklik untuk memfokuskan
//      isiannya, dan pembaca layar menyebut kolomnya tanpa nama.
//
// `autoComplete` ikut ditambahkan: tanpa `new-password` pada kolom sandi,
// pengelola sandi peramban mengisinya dengan sandi yang SUDAH ADA alih-alih
// menawarkan yang baru.
const KELAS_ISIAN =
  'bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg block w-full p-2.5 ' +
  'outline-none focus:ring-2 focus:ring-utero focus:border-utero transition';

const KELAS_LABEL = 'block mb-2 text-sm font-medium text-gray-900';

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Ambil data dari form
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name');
    const email = formData.get('email');
    const phone = formData.get('phone');
    const password = formData.get('password');

    // Tiga cacat ditambal sekaligus di sini:
    //
    //   1. Tidak ada `try` sama sekali. `fetch` melempar saat jaringan mati atau
    //      permintaannya dibatalkan, lemparannya tidak ditangani siapa pun, dan
    //      `setLoading(false)` di bawahnya TIDAK PERNAH dijalankan: tombol
    //      tertinggal berbunyi "Mendaftar..." selamanya dan calon pengguna
    //      pergi tanpa akun.
    //   2. `await res.json()` tanpa penjaga. Balasan 500 berbadan HTML
    //      membuatnya melempar — di jalur yang sama, tanpa penangkap.
    //   3. `setLoading(false)` di akhir badan fungsi, bukan di `finally`.
    //
    // Dialihkan dari backend NestJS (`/api/users/register`) ke route Next.
    // Endpoint lama membalas "Sukses mendaftar" tanpa pernah membuat user,
    // karena method `create()` di sisi sana tidak pernah diimplementasikan.
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password })
        });

        const jawaban = await bacaJawaban(res);

        if (res.ok) {
            // `alert` di sini MEMBEKUKAN tab sampai OK ditekan, jadi navigasi ke
            // halaman login di baris berikutnya tertunda tepat pada saat calon
            // pengguna paling ingin dilanjutkan. Toast tidak menahan apa pun, dan
            // tetap terbaca di halaman login karena `ToastProvider` dipasang di
            // layout akar.
            toast.sukses(jawaban.pesan ?? 'Pendaftaran berhasil. Silakan masuk.');
            router.push('/login'); // Arahkan ke login
        } else {
            // "Email sudah terpakai" dan "Password terlalu pendek" menuntut
            // tindakan berbeda; keduanya dulu bisa terbaca "Gagal mendaftar".
            setError(alasanPenolakan(res, jawaban));
        }
    } catch (galat) {
        console.error('Gagal mendaftar:', galat);
        setError(pesanGalat(galat, "Gagal menghubungi server. Coba lagi."));
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <Navbar />
      
      {/* `<main>`: landmark utama halaman, pintasan pembaca layar yang
          terpisah dari Tab. */}
      <main className="flex flex-col items-center justify-center px-6 py-24 mx-auto md:h-screen lg:py-0">
          <div className="w-full bg-white rounded-lg shadow border md:mt-0 sm:max-w-md xl:p-0">
              <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
                  <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl text-center">
                      Buat Akun Baru
                  </h1>
                  
                  {error && (
                      <div className="bg-red-50 text-red-500 text-sm p-3 rounded-md text-center border border-red-200">
                          {error}
                      </div>
                  )}

                  <form className="space-y-4 md:space-y-6" onSubmit={handleRegister}>
                      <div>
                          <label htmlFor="daftar-nama" className={KELAS_LABEL}>Nama Lengkap</label>
                          <input id="daftar-nama" type="text" name="name" autoComplete="name" className={KELAS_ISIAN} placeholder="Risma..." required />
                      </div>
                      <div>
                          <label htmlFor="daftar-email" className={KELAS_LABEL}>Email</label>
                          <input id="daftar-email" type="email" name="email" autoComplete="email" className={KELAS_ISIAN} placeholder="nama@email.com" required />
                      </div>
                      <div>
                          <label htmlFor="daftar-telepon" className={KELAS_LABEL}>No. WhatsApp</label>
                          <input id="daftar-telepon" type="tel" name="phone" inputMode="tel" autoComplete="tel" className={KELAS_ISIAN} placeholder="08..." required />
                      </div>
                      <div>
                          <label htmlFor="daftar-sandi" className={KELAS_LABEL}>Password</label>
                          <input id="daftar-sandi" type="password" name="password" autoComplete="new-password" className={KELAS_ISIAN} placeholder="••••••••" required />
                      </div>

                      {/* Pemberitahuan data, DI ATAS tombol kirim.
                          Formulir ini meminta nomor WhatsApp tanpa pernah
                          menyebut untuk apa. Menaruh tautannya di bawah tombol
                          berarti pengunjung menyetujui sesuatu yang kalimatnya
                          belum ia lewati.

                          Ini teks, BUKAN kotak centang wajib: menambah gerbang
                          baru pada satu-satunya jalan membuat akun akan menolak
                          pendaftar yang lupa mencentang — dan tidak ada satu pun
                          kotak centang persetujuan di aplikasi ini hari ini,
                          jadi memasangnya di sini saja hanya membuat satu
                          formulir berperilaku lain dari yang lain. */}
                      <p className="text-xs text-gray-500 leading-relaxed">
                          Dengan mendaftar, Anda menyetujui{' '}
                          <Link href="/syarat-ketentuan" className="text-utero hover:underline rounded outline-none focus:ring-2 focus:ring-utero">Syarat &amp; Ketentuan</Link>
                          {' '}dan mengetahui bagaimana data Anda dipakai sesuai{' '}
                          <Link href="/kebijakan-privasi" className="text-utero hover:underline rounded outline-none focus:ring-2 focus:ring-utero">Kebijakan Privasi</Link>.
                          Nomor WhatsApp dipakai untuk mengabari status pesanan Anda.
                      </p>

                      <button type="submit" disabled={loading} className="w-full text-white bg-utero hover:bg-red-700 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition outline-none focus:ring-2 focus:ring-utero focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed">
                          {loading ? 'Sedang Mendaftar...' : 'Daftar Sekarang'}
                      </button>
                      <p className="text-sm font-light text-gray-500">
                          Sudah punya akun? <Link href="/login" className="font-medium text-utero hover:underline rounded outline-none focus:ring-2 focus:ring-utero">Login disini</Link>
                      </p>
                  </form>
              </div>
          </div>
      </main>
    </div>
  );
}