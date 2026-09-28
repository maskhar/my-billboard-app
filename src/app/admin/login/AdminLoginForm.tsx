// src/app/admin/login/AdminLoginForm.tsx
//
// Bagian interaktif halaman login admin.
//
// Dipisah dari `page.tsx` karena nama usaha sekarang dibaca dari
// `SystemSetting.siteName` — pembacaan database yang hanya bisa dilakukan Server
// Component. Yang butuh `'use client'` di sini cuma formulirnya: satu `useState`
// untuk pesan galat dan satu untuk keadaan memuat.
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    // Login Menggunakan Jalur Utama NextAuth
    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    if (result?.error) {
      setError('Akun tidak ditemukan atau password salah!');
      setLoading(false);
    } else {
      // Setelah Login Sukses, KITA HARUS CEK LAGI di backend atau di layout admin
      // Apakah role-nya admin? Itu akan ditangani otomatis oleh file 'admin/layout.tsx' yang sudah kita buat.
      // Jika dia User biasa, dia akan melihat halaman "Akses Ditolak" yang tadi.

      router.push('/admin'); // Arahkan Paksa ke Admin Panel
      router.refresh();
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleAdminLogin}>
      {error && (
        <div
          role="alert"
          className="bg-red-500/20 border border-red-500 text-red-200 text-sm p-3 rounded text-center"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-xs font-bold uppercase text-gray-500 mb-2">
          Email Admin
        </label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="username"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-utero transition"
          placeholder="admin@utero.com"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-bold uppercase text-gray-500 mb-2">
          Secure Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-utero transition"
          placeholder="••••••••"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-utero hover:bg-red-700 text-white font-bold py-3 rounded-xl transition duration-300 shadow-lg disabled:opacity-60"
      >
        {loading ? 'Verifying...' : 'Buka Dashboard'}
      </button>
    </form>
  );
}
