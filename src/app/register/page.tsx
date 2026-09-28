// src/app/register/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';

export default function RegisterPage() {
  const router = useRouter();
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
            alert(jawaban.pesan ?? "Pendaftaran Berhasil! Silakan Login.");
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
      
      <div className="flex flex-col items-center justify-center px-6 py-24 mx-auto md:h-screen lg:py-0">
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
                          <label className="block mb-2 text-sm font-medium text-gray-900">Nama Lengkap</label>
                          <input type="text" name="name" className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-utero focus:border-utero block w-full p-2.5 outline-none" placeholder="Risma..." required />
                      </div>
                      <div>
                          <label className="block mb-2 text-sm font-medium text-gray-900">Email</label>
                          <input type="email" name="email" className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-utero focus:border-utero block w-full p-2.5 outline-none" placeholder="nama@email.com" required />
                      </div>
                      <div>
                          <label className="block mb-2 text-sm font-medium text-gray-900">No. WhatsApp</label>
                          <input type="number" name="phone" className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-utero focus:border-utero block w-full p-2.5 outline-none" placeholder="08..." required />
                      </div>
                      <div>
                          <label className="block mb-2 text-sm font-medium text-gray-900">Password</label>
                          <input type="password" name="password" className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-utero focus:border-utero block w-full p-2.5 outline-none" placeholder="••••••••" required />
                      </div>
                      
                      <button type="submit" disabled={loading} className="w-full text-white bg-utero hover:bg-red-700 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition">
                          {loading ? 'Sedang Mendaftar...' : 'Daftar Sekarang'}
                      </button>
                      <p className="text-sm font-light text-gray-500">
                          Sudah punya akun? <Link href="/login" className="font-medium text-utero hover:underline">Login disini</Link>
                      </p>
                  </form>
              </div>
          </div>
      </div>
    </div>
  );
}