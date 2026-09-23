// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { signIn, signOut, getSession } from 'next-auth/react'; 
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
// Tambahkan Icon Google (Chrome logo-ish)
import { Chrome } from 'lucide-react'; 

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const result = await signIn("credentials", {
        redirect: false,
        email,
        password
    });

    if (result?.error) {
        setError("Email atau Password salah!");
        setLoading(false);
    } else {
        const session = await getSession();
        const userRole = session?.user?.role;
        // 'USER_AIDA' dihapus — role itu tidak ada di daftar role mana pun
        // dan tidak pernah tertulis ke database. 'CS' ditambahkan: tanpa itu,
        // petugas CS bisa masuk lewat pintu pelanggan dan tidak pernah
        // diarahkan ke portal admin.
        const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'CS'];

        if (userRole && adminRoles.includes(userRole)) {
            await signOut({ redirect: false });
            setError("⛔ DETECTED: Anda adalah Admin! Mohon login melalui Portal Khusus Admin.");
            setLoading(false);
            setTimeout(() => { router.push('/admin/login'); }, 2000);
            return;
        }
        router.push('/'); 
        router.refresh(); 
    }
  };

  // HANDLER BARU: LOGIN GOOGLE
  const handleGoogleLogin = () => {
      // Tidak perlu validasi macam-macam, langsung panggil Google
      // Redirect false agar kita bisa kontrol sendiri
      signIn('google', { callbackUrl: '/' }); 
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <Navbar />
      
      <div className="flex flex-col items-center justify-center px-6 py-24 mx-auto md:h-screen lg:py-0">
          <div className="w-full bg-white rounded-xl shadow-lg border border-gray-100 md:mt-0 sm:max-w-md xl:p-0 overflow-hidden">
              <div className="h-1 w-full bg-utero"></div> 

              <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
                  <div className="text-center">
                    <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl">
                        Masuk ke Akun
                    </h1>
                    <p className="text-xs text-gray-400 mt-1">Silakan pilih metode login</p>
                  </div>

                  {error && (
                      <div className={`text-sm p-3 rounded-md text-center border font-semibold animate-pulse ${error.includes('⛔') ? 'bg-black text-yellow-400 border-black' : 'bg-red-50 text-red-600 border-red-100'}`}>
                          {error}
                      </div>
                  )}
                  
                  {/* --- TOMBOL GOOGLE BARU --- */}
                  <button 
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold rounded-lg text-sm px-5 py-3 transition shadow-sm"
                  >
                     <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                     Masuk dengan Google
                  </button>

                  <div className="flex items-center">
                        <div className="flex-1 border-t border-gray-200"></div>
                        <span className="px-3 text-xs text-gray-400">Atau pakai Email</span>
                        <div className="flex-1 border-t border-gray-200"></div>
                  </div>

                  <form className="space-y-4" onSubmit={handleLogin}>
                      <div>
                          <label className="block mb-1 text-sm font-bold text-gray-700">Email</label>
                          <input type="email" name="email" className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-utero focus:border-utero block w-full p-2.5 outline-none font-semibold" placeholder="nama@email.com" />
                      </div>
                      <div>
                          <label className="block mb-1 text-sm font-bold text-gray-700">Password</label>
                          <input type="password" name="password" className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-utero focus:border-utero block w-full p-2.5 outline-none font-semibold" placeholder="••••••••" />
                      </div>
                      
                      <button type="submit" disabled={loading} className="w-full text-white bg-utero hover:bg-red-700 font-bold rounded-lg text-sm px-5 py-3 text-center transition shadow-lg shadow-red-100 disabled:bg-gray-400 disabled:shadow-none">
                          {loading ? 'Memproses...' : 'Login Sekarang'}
                      </button>
                      <p className="text-sm font-light text-gray-500 text-center">
                          Belum punya akun? <Link href="/register" className="font-bold text-utero hover:underline">Daftar dulu</Link>
                      </p>
                  </form>
              </div>
          </div>
          
          <div className="mt-6 text-center">
              <Link href="/admin/login" className="text-[10px] text-gray-400 hover:text-gray-600 font-mono transition">
                  Akses Panel Karyawan (Admin) →
              </Link>
          </div>
      </div>
    </div>
  );
}