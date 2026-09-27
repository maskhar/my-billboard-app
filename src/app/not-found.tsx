// Halaman 404.
//
// Ini Server Component (tanpa 'use client'): tidak ada state dan tidak ada
// penangan peristiwa di sini, jadi tidak ada alasan mengirim JavaScript-nya ke
// browser.
//
// Dibedakan dengan sengaja dari `error.tsx`: "tidak ada" adalah jawaban yang
// benar dan tenang, sedangkan "gagal" adalah gangguan. Sebelum berkas ini ada,
// URL yang salah taip mendapat halaman 404 bawaan Next.js — tanpa Navbar, tanpa
// jalan kembali, dan dalam bahasa Inggris di aplikasi yang seluruhnya berbahasa
// Indonesia.

import Link from 'next/link';
import { MapPin } from 'lucide-react';

export default function NotFound() {
    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mx-auto">
                    <MapPin className="text-gray-400" size={24} />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mt-6">Halaman tidak ditemukan</h1>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                    Alamat yang Anda buka tidak ada, atau titik billboard-nya sudah tidak
                    ditayangkan lagi.
                </p>
                <Link
                    href="/"
                    className="inline-block mt-6 bg-gray-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition"
                >
                    Lihat peta billboard
                </Link>
            </div>
        </main>
    );
}
