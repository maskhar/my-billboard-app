// src/app/admin/login/page.tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

export default function AdminLoginPage() {
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
    const result = await signIn("credentials", {
        redirect: false,
        email,
        password
    });

    if (result?.error) {
        setError("Akun tidak ditemukan atau password salah!");
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
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center font-sans text-gray-200">
        
        {/* LOGO EKSKLUSIF */}
        <div className="mb-8 text-center animate-in fade-in zoom-in duration-500">
            <div className="bg-utero w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-utero/50">
                <Lock color='white' size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white">Admin Portal</h1>
            <p className="text-gray-500 text-sm mt-1">Khusus akses authorized personnel Utero Cloud</p>
        </div>

        <div className="w-full max-w-sm bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8">
            <form className="space-y-6" onSubmit={handleAdminLogin}>
                
                {error && (
                    <div className="bg-red-500/20 border border-red-500 text-red-200 text-sm p-3 rounded text-center">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Email Admin</label>
                    <input 
                        type="email" name="email" 
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-utero transition"
                        placeholder="admin@utero.com" 
                        required 
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Secure Password</label>
                    <input 
                        type="password" name="password" 
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-utero transition"
                        placeholder="••••••••" 
                        required 
                    />
                </div>

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-utero hover:bg-red-700 text-white font-bold py-3 rounded-xl transition duration-300 shadow-lg"
                >
                    {loading ? 'Verifying...' : 'Buka Dashboard'}
                </button>
            </form>
        </div>

        <p className="mt-8 text-xs text-gray-600">
            System Secured by UteroCloud V.1.0 &copy; 2025
        </p>
    </div>
  );
}