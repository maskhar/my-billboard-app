'use client';

// Batas galat halaman invoice.
//
// Ada terpisah dari `src/app/error.tsx` karena batas akar mengarahkan pengguna
// "Kembali ke peta" — tautan yang benar untuk pengunjung yang tersesat, dan
// salah untuk orang yang sedang mencoba mencetak tagihannya. Dari sini yang
// dibutuhkan adalah jalan kembali ke pesanan.
//
// SATU KALIMAT YANG TIDAK BOLEH HILANG
// ------------------------------------
// Invoice adalah dokumen. Orang menyimpannya, mengirimkannya ke bagian
// keuangan, dan memakainya sebagai bukti. Halaman invoice yang gagal dimuat
// karena itu harus menyatakan dengan jelas bahwa yang gagal adalah
// PENAMPILANNYA, bukan tagihannya — tanpa itu, pembeli yang melihat layar rusak
// menyimpulkan tagihannya batal, dan pembeli yang menyimpulkan sebaliknya
// membayar dua kali.
//
// Tidak ada satu pun nominal di halaman ini, dan itu satu-satunya pilihan yang
// benar: angka apa pun yang ditampilkan batas galat adalah angka yang TIDAK
// berhasil dibaca dari database.
//
// `error.message` tidak ditampilkan — parameter rute di segmen ini adalah id
// pesanan. Hanya `digest`, alasan lengkapnya di `src/app/error.tsx`.

import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

export default function InvoiceError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(`Halaman invoice gagal dirender: ${error.name}`, error.digest ?? '');
    }, [error]);

    return (
        // Latar kelabu yang sama dengan halaman invoice, supaya galat mendarat di
        // tempat yang masih dikenali sebagai halaman yang sama.
        <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6 font-sans">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-lg w-full p-8">
                <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                        <AlertTriangle className="text-utero" size={22} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-gray-900">Invoice gagal dimuat</h1>

                        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                            Yang gagal adalah penampilan dokumennya, bukan tagihannya.
                            Nominal, status pembayaran, dan pesanan Anda tidak berubah karena
                            halaman ini tidak terbuka.
                        </p>

                        <p className="text-sm text-gray-600 mt-3 leading-relaxed">
                            Jangan mencetak atau menyimpan halaman ini sebagai bukti — ia tidak
                            memuat angka apa pun. Muat ulang setelah beberapa saat, atau buka
                            rincian pesanan Anda.
                        </p>

                        {error.digest && (
                            <p className="mt-4 text-[11px] text-gray-500">
                                Kode kejadian:{' '}
                                <span className="font-mono font-bold text-gray-700">{error.digest}</span>
                            </p>
                        )}

                        <div className="flex flex-wrap gap-3 mt-6">
                            <button
                                onClick={reset}
                                className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition"
                            >
                                <RotateCcw size={15} /> Coba lagi
                            </button>
                            <Link
                                href="/dashboard"
                                className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition"
                            >
                                Rincian pesanan
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
