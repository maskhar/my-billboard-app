// src/app/admin/login/page.tsx
import { Lock } from 'lucide-react';
import { ambilIdentitasSitus } from '@/lib/identitas-situs';
import AdminLoginForm from './AdminLoginForm';
import Link from 'next/link';

export default async function AdminLoginPage() {
  const { nama } = await ambilIdentitasSitus();
  const tahun = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center font-sans text-gray-200">
      <main className="w-full flex flex-col items-center">
        <div className="mb-8 text-center animate-in fade-in zoom-in duration-500">
          <div className="bg-utero w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-utero/50">
            <Lock color="white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white">Admin Portal</h1>
          <p className="text-gray-500 text-sm mt-1">Khusus akses authorized personnel {nama}</p>
        </div>

        <div className="w-full max-w-sm bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8">
          <AdminLoginForm />
        </div>
        <Link href="/login" className="mt-6 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-gray-300 hover:text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-utero">
          Kembali ke login biasa
        </Link>
      </main>

      <p className="mt-8 text-xs text-gray-600">
        System Secured by {nama} V.1.0 &copy; {tahun}
      </p>
    </div>
  );
}
