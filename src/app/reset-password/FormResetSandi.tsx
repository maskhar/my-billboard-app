'use client';

// src/app/reset-password/FormResetSandi.tsx
//
// Formulir sandi baru. Tokennya datang sebagai prop dari Server Component
// induknya, bukan dibaca sendiri dari URL — lihat alasannya di `page.tsx`.
//
// KONFIRMASI SANDI DIPERIKSA DI SINI SAJA
// ---------------------------------------
// Route penukar tidak menerima kolom konfirmasi dan tidak perlu: dua kolom yang
// tidak sama adalah salah ketik, bukan serangan, dan memeriksanya di server
// berarti satu perjalanan jaringan untuk memberi tahu pengguna sesuatu yang sudah
// diketahui peramban. Yang TIDAK boleh ditiru di sini adalah aturan panjang dan
// batas byte — itu syarat keamanan, dan tempatnya tetap `periksaSandiBaru` di
// server. Salinan di client hanya akan menyimpang dan memberi kesan sudah
// diperiksa.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';

const KELAS_ISIAN =
  'bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg block w-full p-2.5 font-semibold ' +
  'outline-none focus:ring-2 focus:ring-utero focus:border-utero transition';

const KELAS_LABEL = 'block mb-1 text-sm font-bold text-gray-700';

const KELAS_TOMBOL =
  'w-full text-white bg-utero hover:bg-red-700 font-bold rounded-lg text-sm px-5 py-3 text-center transition ' +
  'shadow-lg shadow-red-100 outline-none focus:ring-2 focus:ring-utero focus:ring-offset-2 ' +
  'disabled:bg-gray-400 disabled:shadow-none';

const KELAS_TAUTAN = 'font-bold text-utero hover:underline rounded outline-none focus:ring-2 focus:ring-utero';

export default function FormResetSandi({ token }: { token: string }) {
  const router = useRouter();
  const [sandi, setSandi] = useState('');
  const [ulangi, setUlangi] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const [berhasil, setBerhasil] = useState('');

  const kirim = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setGalat('');

    if (sandi !== ulangi) {
      setGalat('Kedua sandi tidak sama.');
      return;
    }

    setMemuat(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: sandi }),
      });
      const jawaban = await bacaJawaban(res);

      if (!res.ok) {
        setGalat(alasanPenolakan(res, jawaban));
        return;
      }

      setBerhasil(jawaban.pesan ?? 'Sandi berhasil diubah.');
      // Sandi yang sudah diubah dikosongkan dari state. Nilai itu tidak
      // dibutuhkan lagi dan tidak ada alasan menahannya di memori tab yang
      // mungkin dibiarkan terbuka.
      setSandi('');
      setUlangi('');
      // Tidak mengarahkan otomatis: halaman login yang muncul sendiri membuat
      // pengguna tidak yakin apakah sandinya benar-benar tersimpan. Tombolnya
      // ada di bawah.
      router.prefetch('/login');
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
                Atur Ulang Sandi
              </h1>
              <p className="text-xs text-gray-400 mt-1">Pilih sandi baru untuk akun Anda</p>
            </div>

            {/* Tiga keadaan, dan urutan pemeriksaannya penting: tautan tanpa
                token tidak boleh menampilkan formulir sama sekali, karena
                mengirimnya pasti gagal dan pengguna akan menyangka sandinya
                yang bermasalah. */}
            {!token ? (
              <div className="space-y-4">
                <div className="text-sm p-4 rounded-md border bg-red-50 text-red-600 border-red-100 font-semibold">
                  Tautan ini tidak memuat kode reset. Kemungkinan tautannya terpotong
                  saat disalin dari email.
                </div>
                <Link href="/forgot-password" className={`block text-center ${KELAS_TOMBOL}`}>
                  Minta Tautan Baru
                </Link>
              </div>
            ) : berhasil ? (
              <div className="space-y-4">
                <div className="text-sm p-4 rounded-md border bg-green-50 text-green-700 border-green-100 font-semibold">
                  {berhasil}
                </div>
                <Link href="/login" className={`block text-center ${KELAS_TOMBOL}`}>
                  Masuk Sekarang
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
                    <label htmlFor="reset-sandi" className={KELAS_LABEL}>
                      Sandi Baru
                    </label>
                    <input
                      id="reset-sandi"
                      type="password"
                      // `new-password`, bukan `current-password`: itu yang
                      // memberi tahu pengelola sandi peramban untuk MENAWARKAN
                      // sandi baru dan menyimpan yang tersimpan setelahnya,
                      // alih-alih mengisi yang lama.
                      autoComplete="new-password"
                      required
                      value={sandi}
                      onChange={(e) => setSandi(e.target.value)}
                      className={KELAS_ISIAN}
                      placeholder="••••••••"
                    />
                    <p className="text-xs text-gray-400 mt-1">Minimal 8 karakter.</p>
                  </div>

                  <div>
                    <label htmlFor="reset-ulangi" className={KELAS_LABEL}>
                      Ulangi Sandi Baru
                    </label>
                    <input
                      id="reset-ulangi"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={ulangi}
                      onChange={(e) => setUlangi(e.target.value)}
                      className={KELAS_ISIAN}
                      placeholder="••••••••"
                    />
                  </div>

                  <button type="submit" disabled={memuat} className={KELAS_TOMBOL}>
                    {memuat ? 'Menyimpan...' : 'Simpan Sandi Baru'}
                  </button>

                  <p className="text-sm font-light text-gray-500 text-center">
                    Tautannya kedaluwarsa?{' '}
                    <Link href="/forgot-password" className={KELAS_TAUTAN}>
                      Minta yang baru
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
