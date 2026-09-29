// src/app/forgot-password/page.tsx
'use client';

// Halaman yang meminta tautan reset.
//
// Bentuknya mengikuti `src/app/login/page.tsx` — kartu putih, garis merah di
// atasnya, `KELAS_ISIAN`/`KELAS_LABEL` yang sama. Itu bukan soal selera: pengguna
// yang tiba di sini datang dari halaman login satu klik sebelumnya, dan halaman
// yang tampak lain membuatnya ragu apakah ia masih di situs yang sama — keraguan
// yang tepat sekali dilatih justru oleh halaman phishing.
//
// SATU JAWABAN SAJA
// -----------------
// Route penerbit menjawab 200 dengan pesan yang sama untuk alamat terdaftar dan
// tidak terdaftar, dan halaman ini TIDAK mencoba memperbaikinya dengan pesan yang
// lebih membantu: "email tidak ditemukan" di sini akan membatalkan seluruh alasan
// jawaban seragam itu ada. Yang ditampilkan adalah pesan dari server, apa adanya.

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';

const KELAS_ISIAN =
  'bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg block w-full p-2.5 font-semibold ' +
  'outline-none focus:ring-2 focus:ring-utero focus:border-utero transition';

const KELAS_LABEL = 'block mb-1 text-sm font-bold text-gray-700';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [memuat, setMemuat] = useState(false);
  // Dua keadaan terpisah, bukan satu string dengan awalan. `galat` berwarna
  // merah dan formnya tetap bisa dicoba lagi; `berhasil` menggantikan formnya,
  // karena mengirim permintaan kedua hanya memakan satu dari tiga jatah per jam
  // tanpa mengubah apa pun.
  const [galat, setGalat] = useState('');
  const [berhasil, setBerhasil] = useState('');

  const kirim = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMemuat(true);
    setGalat('');

    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const jawaban = await bacaJawaban(res);

      if (!res.ok) {
        setGalat(alasanPenolakan(res, jawaban));
        return;
      }

      setBerhasil(jawaban.pesan ?? 'Tautan reset sudah dikirim bila alamat itu terdaftar.');
    } catch (kesalahan) {
      setGalat(pesanGalat(kesalahan, 'Gagal menghubungi server. Periksa koneksi Anda.'));
    } finally {
      setMemuat(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <Navbar />

      {/* `<main>`: landmark utama halaman, pintasan pembaca layar yang
          terpisah dari Tab. */}
      <main className="flex flex-col items-center justify-center px-6 py-24 mx-auto md:h-screen lg:py-0">
        <div className="w-full bg-white rounded-xl shadow-lg border border-gray-100 md:mt-0 sm:max-w-md xl:p-0 overflow-hidden">
          <div className="h-1 w-full bg-utero"></div>

          <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
            <div className="text-center">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl">
                Lupa Sandi
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                Masukkan email akun Anda, kami kirim tautan untuk mengatur ulang sandi
              </p>
            </div>

            {berhasil ? (
              // Form diganti, tidak hanya diberi pesan di atasnya. Langkah
              // berikutnya pengguna ada di kotak masuknya, bukan di halaman ini.
              <div className="space-y-4">
                <div className="text-sm p-4 rounded-md border bg-green-50 text-green-700 border-green-100 font-semibold">
                  {berhasil}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Tautannya berlaku satu jam dan hanya bisa dipakai sekali. Bila surat
                  tidak sampai dalam beberapa menit, periksa folder spam.
                </p>
                <Link
                  href="/login"
                  className="block w-full text-center text-white bg-utero hover:bg-red-700 font-bold rounded-lg text-sm px-5 py-3 transition shadow-lg shadow-red-100 outline-none focus:ring-2 focus:ring-utero focus:ring-offset-2"
                >
                  Kembali ke Login
                </Link>
              </div>
            ) : (
              <>
                {galat && (
                  <div className="text-sm p-3 rounded-md text-center border font-semibold bg-red-50 text-red-600 border-red-100">
                    {galat}
                  </div>
                )}

                <form className="space-y-4" onSubmit={kirim}>
                  <div>
                    <label htmlFor="lupa-email" className={KELAS_LABEL}>
                      Email
                    </label>
                    <input
                      id="lupa-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={KELAS_ISIAN}
                      placeholder="nama@email.com"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={memuat}
                    className="w-full text-white bg-utero hover:bg-red-700 font-bold rounded-lg text-sm px-5 py-3 text-center transition shadow-lg shadow-red-100 outline-none focus:ring-2 focus:ring-utero focus:ring-offset-2 disabled:bg-gray-400 disabled:shadow-none"
                  >
                    {memuat ? 'Mengirim...' : 'Kirim Tautan Reset'}
                  </button>

                  {/* Akun Google disebut di sini, bukan sebagai pesan galat
                      setelah pengguna menunggu email yang tidak akan datang.
                      Route penerbit sengaja tidak membedakannya dalam
                      jawabannya, jadi tempat yang benar untuk memberitahunya
                      adalah sebelum ia mengirim. */}
                  <p className="text-xs text-gray-500 text-center leading-relaxed">
                    Mendaftar dengan Google? Akun seperti itu tidak punya sandi —
                    gunakan tombol{' '}
                    <Link
                      href="/login"
                      className="font-bold text-utero hover:underline rounded outline-none focus:ring-2 focus:ring-utero"
                    >
                      Masuk dengan Google
                    </Link>
                    .
                  </p>

                  <p className="text-sm font-light text-gray-500 text-center">
                    Ingat sandinya?{' '}
                    <Link
                      href="/login"
                      className="font-bold text-utero hover:underline rounded outline-none focus:ring-2 focus:ring-utero"
                    >
                      Masuk
                    </Link>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
