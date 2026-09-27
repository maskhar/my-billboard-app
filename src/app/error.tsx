'use client';

// Batas galat untuk seluruh aplikasi.
//
// Sebelum berkas ini ada, `src/app/` tidak punya satu pun `error.tsx`,
// `loading.tsx`, atau `not-found.tsx` di 21 halamannya. Akibatnya bukan sekadar
// tampilan jelek: karena tidak ada tempat untuk mendaratkan galat, halaman yang
// mengambil data MENELANNYA sendiri dan mengembalikan nilai kosong —
// `src/app/page.tsx:60` mengembalikan `[]` dan `billboard/[slug]/page.tsx`
// mengembalikan `null`. Database mati karena itu terbaca oleh pengunjung sebagai
// "tidak ada billboard sama sekali" dan "Billboard Tidak Ditemukan": inventaris
// yang sebenarnya penuh tampil habis, dan pemilik usaha tidak tahu apa-apa
// karena tidak ada satu pun galat yang muncul.
//
// Dengan batas ini, kegagalan infrastruktur punya tempat mendarat, jadi
// pengambilan data boleh melempar apa adanya dan perbedaan antara "kosong" dan
// "rusak" bertahan sampai ke layar.
//
// Pesan galat teknis TIDAK ditampilkan. `error.message` di Server Component
// bisa memuat potongan query, nama kolom, host database, dan kadang nilai
// parameter; di produksi Next.js sudah menyaringnya menjadi teks generik, tapi
// halaman ini tidak boleh bergantung pada itu. `digest` ditampilkan karena ia
// justru dirancang untuk ini: satu penanda yang bisa dicocokkan pengunjung
// dengan baris log di server tanpa membocorkan isinya.

import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Hanya nama dan digest. Isi pesan tidak ikut: konsol browser adalah
        // tempat yang bisa dibaca siapa pun yang membuka devtools, termasuk di
        // komputer bersama.
        console.error(`Halaman gagal dirender: ${error.name}`, error.digest ?? '');
    }, [error]);

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-lg w-full p-8">
                <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                        <AlertTriangle className="text-utero" size={22} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-gray-900">Halaman ini gagal dimuat</h1>
                        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                            Gangguan terjadi di sisi kami, bukan pada perangkat Anda. Data Anda
                            tidak berubah. Coba muat ulang; bila masih gagal, hubungi kami dan
                            sebutkan kode di bawah.
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
                                href="/"
                                className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition"
                            >
                                Kembali ke peta
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
