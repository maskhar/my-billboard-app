'use client';

// Batas galat area dashboard pembeli.
//
// Ada terpisah dari `src/app/error.tsx` karena satu kalimat di sana salah untuk
// halaman-halaman ini: "Data Anda tidak berubah" benar di halaman publik, tapi
// di bawah `/dashboard` pembeli bisa saja baru menekan tombol bayar atau
// mengunggah bukti — dan yang ia butuhkan bukan penenangan, melainkan
// pernyataan tegas tentang apa yang boleh ia simpulkan dari layar yang gagal.
//
// Dua hal yang ditegaskan di sini dan tidak di batas akar:
//
//   1. **Angka yang tidak tampil bukan nol.** Halaman-halaman ini menampilkan
//      total belanja, sisa pokok, dan nominal tagihan. Kegagalan pengambilan
//      data yang berakhir sebagai kotak kosong, dari kursi pembeli, tidak bisa
//      dibedakan dari "tagihan sudah lunas". Alasan yang sama ditulis di
//      `src/app/admin/(dashboard)/error.tsx`.
//   2. **Galat di sini tidak pernah berarti uang berpindah.** Yang menyatakan
//      uang masuk hanya webhook Xendit, bukan halaman ini. Pembeli yang
//      menyangka pembayarannya batal karena layarnya rusak akan membayar kedua
//      kali.
//
// `error.message` TIDAK ditampilkan, sama seperti di batas akar: pesan galat
// Server Component bisa memuat potongan query dan nilai parameter — dan di
// segmen ini parameternya adalah id pesanan milik pembeli. Hanya `digest`.
//
// Tautan tidak memakai `Navbar`: komponen itu memanggil `useSession()`, dan
// batas galat harus tetap bisa dirender walau penyebab galatnya justru ada di
// jalur sesi. Dua tautan eksplisit menggantikannya.

import { AlertTriangle, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(`Halaman dashboard gagal dirender: ${error.name}`, error.digest ?? '');
    }, [error]);

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-lg w-full p-8">
                <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                        <AlertTriangle className="text-utero" size={22} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-gray-900">Data pesanan Anda gagal dimuat</h1>

                        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                            Kegagalannya ada pada pengambilan data, bukan pada pesanan Anda.
                            Jangan membaca angka atau daftar yang tidak tampil sebagai nol atau
                            sebagai pesanan yang hilang — tidak ada yang berubah karena halaman
                            ini gagal dibuka.
                        </p>

                        <p className="text-sm text-gray-600 mt-3 leading-relaxed">
                            Bila Anda baru saja melakukan pembayaran, pembayaran itu tetap
                            diproses. Status lunas ditentukan dari konfirmasi penyedia
                            pembayaran, bukan dari halaman ini, jadi{' '}
                            <span className="font-bold text-gray-800">jangan membayar ulang</span>{' '}
                            — muat ulang halaman ini setelah beberapa saat.
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
                                <RotateCcw size={15} /> Muat ulang data
                            </button>
                            <Link
                                href="/dashboard"
                                className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition"
                            >
                                Daftar pesanan
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
