'use client';

// Batas galat khusus area admin.
//
// Ada terpisah dari `src/app/error.tsx` karena ia dirender DI DALAM layout
// dashboard: sidebar dan navigasi admin tetap utuh, jadi galat pada satu
// halaman tidak melempar admin keluar dari panelnya.
//
// Nadanya juga berbeda. Pengunjung publik perlu ditenangkan; admin perlu tahu
// apa yang boleh ia simpulkan. Yang paling penting di sini: angka yang gagal
// dimuat TIDAK BOLEH dibaca sebagai nol. Halaman-halaman ini menampilkan omzet,
// uang masuk, dan jumlah pesanan — dan sebelum ada batas galat, kegagalan
// pengambilan data berakhir sebagai daftar kosong, yang dari kursi admin tidak
// bisa dibedakan dari "hari ini tidak ada transaksi".

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(`Halaman admin gagal dirender: ${error.name}`, error.digest ?? '');
    }, [error]);

    return (
        <div className="max-w-2xl">
            <div className="bg-white border border-red-200 rounded-2xl p-8">
                <div className="flex items-start gap-4">
                    <AlertTriangle className="text-utero shrink-0 mt-0.5" size={22} />
                    <div className="min-w-0">
                        <h2 className="font-bold text-gray-900">Data halaman ini gagal dimuat</h2>
                        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                            Yang tampil di halaman ini tidak lengkap. Jangan membaca angka atau
                            daftar yang kosong sebagai nol — kegagalannya ada pada pengambilan
                            data, bukan pada isinya. Muat ulang setelah beberapa saat.
                        </p>

                        {error.digest && (
                            <p className="mt-4 text-[11px] text-gray-500">
                                Kode kejadian:{' '}
                                <span className="font-mono font-bold text-gray-700">{error.digest}</span>
                            </p>
                        )}

                        <button
                            onClick={reset}
                            className="mt-6 bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition"
                        >
                            <RotateCcw size={15} /> Muat ulang data
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
