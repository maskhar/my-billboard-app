// src/app/admin/login/page.tsx
//
// Server Component supaya nama usaha bisa dibaca dari pengaturan admin.
// Formulirnya ada di `AdminLoginForm.tsx` (`'use client'`).
import { Lock } from 'lucide-react';
import { ambilIdentitasSitus } from '@/lib/identitas-situs';
import AdminLoginForm from './AdminLoginForm';

export default async function AdminLoginPage() {
  // Nama usaha dibaca dari pengaturan, bukan ditulis di kode. Sebelumnya di sini
  // tertulis 'Utero Cloud' dan 'UteroCloud' — dua ejaan berbeda pada satu
  // halaman, keduanya tidak berubah walau admin mengganti nama usahanya.
  const { nama } = await ambilIdentitasSitus();

  // Tahun diambil dari jam server, bukan ditulis '2025'. Catatan hak cipta yang
  // tertinggal di tahun lalu adalah tanda paling murah bahwa sebuah situs tidak
  // dirawat — dan ia muncul tepat di halaman yang dibuka calon pembeli.
  const tahun = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center font-sans text-gray-200">
      {/* `<main>` membungkus judul DAN kartu formulirnya: `<h1>` halaman ini
          berada di blok logo, dan judul utama yang berdiri di luar landmark
          utama membuat pembaca layar yang melompat ke `main` mendarat langsung
          pada kolom sandi tanpa pernah mendengar halaman apa yang dibukanya.
          Baris hak cipta di bawah sengaja ditinggal di luar — itu bukan isi
          utama. Halaman ini tidak memakai `Navbar`, jadi tidak punya tautan
          lewati; landmark inilah satu-satunya pegangan navigasi di sini. */}
      <main className="flex flex-col items-center">
      {/* LOGO EKSKLUSIF

          `duration-500` DIGANTI `durasi-masuk-500`. `duration-*` bawaan
          Tailwind menulis `transition-duration`, dan blok ini tidak punya
          `transition` apa pun — jadi ia tidak berpengaruh sama sekali pada
          `animate-in`. Animasinya berjalan di 150ms bawaan, bukan 500ms yang
          tertulis di sini, dan tidak ada yang menandainya. */}
      <div className="mb-8 text-center animate-in fade-in zoom-in durasi-masuk-500">
        <div className="bg-utero w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-utero/50">
          <Lock color="white" size={32} />
        </div>
        <h1 className="text-3xl font-bold text-white">Admin Portal</h1>
        <p className="text-gray-500 text-sm mt-1">Khusus akses authorized personnel {nama}</p>
      </div>

      <div className="w-full max-w-sm bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8">
        <AdminLoginForm />
      </div>
      </main>

      <p className="mt-8 text-xs text-gray-600">
        System Secured by {nama} V.1.0 &copy; {tahun}
      </p>
    </div>
  );
}
