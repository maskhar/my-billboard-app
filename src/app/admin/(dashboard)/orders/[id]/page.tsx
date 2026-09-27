// src/app/admin/(dashboard)/orders/[id]/page.tsx
//
// Halaman ini punya LIMA cacat yang semuanya berujung pada hal yang sama:
// operator mengira bukti tayang tersimpan padahal tidak ada apa-apa yang
// tertulis.
//
//   1. `params` diperlakukan sebagai objek biasa. Di Next 16 `params` adalah
//      Promise — juga di Client Component — jadi `params.id` bernilai
//      `undefined`. Pembacaannya menjadi `?id=undefined` (dijawab 404 oleh
//      `api/admin/orders/detail`) dan penyimpanannya mengirim
//      `orderId: undefined`, yang dijawab `api/admin/update-order` dengan 400
//      "ID pesanan tidak valid.". Halaman ini tidak pernah bisa bekerja sama
//      sekali; ia satu-satunya halaman di `src/app/admin` yang masih membaca
//      `params` secara sinkron (`users/[userId]/page.tsx` sudah `await`).
//   2. `.then(res => res.json()).then(setOrder)` tanpa `res.ok` dan tanpa
//      `.catch`. Jawaban 401/404 ikut di-`setOrder`, sehingga `order` menjadi
//      `{ message: 'Unauthorized' }` — lalu `order.user.name` melempar dan
//      seluruh halaman jatuh ke error boundary. Kalau `fetch` sendiri gagal,
//      promise-nya ditolak tanpa penangkap dan halaman berhenti di
//      "Loading..." selamanya.
//   3. `handleSave` tidak memeriksa `res.ok` dan langsung
//      `alert("Bukti Tayang Disimpan!")`. Setiap penolakan — 400, 401, 409
//      transisi, 422, 500 — dibacakan sebagai keberhasilan. Ini kerugian
//      nyata: operator menutup halaman, klien tidak pernah menerima bukti
//      tayang, dan tidak ada satu pun jejak bahwa penyimpanannya gagal.
//   4. Dependensi `useEffect` kosong padahal `params` dipakai di dalamnya.
//   5. POST tanpa header `Content-Type: application/json`.
//
// `newStatus: order.status` dipertahankan apa adanya: `transisiSah` di
// `src/lib/transisi-status.ts` memulangkan `true` bila `dari === ke`, jadi
// mengirim status yang sama memang jalur yang sah untuk menulis bukti tanpa
// memindahkan pesanan.

'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ImageUpload from '@/components/ImageUpload';
import { labelPesanan } from '@/lib/nomor-pesanan';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';

type DetailPesanan = {
    id: string;
    status: string;
    installationProof: string | null;
    user: { id: string; name: string | null };
    billboard: { id: string; title: string };
};

export default function AdminOrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    // `use()` membuka Promise `params` di Client Component. Tanpa ini `id`
    // bernilai `undefined` dan kedua permintaan di bawah ditolak server.
    const { id } = use(params);

    const router = useRouter();
    const [order, setOrder] = useState<DetailPesanan | null>(null);
    const [galat, setGalat] = useState<string | null>(null);
    const [proof, setProof] = useState('');
    const [menyimpan, setMenyimpan] = useState(false);

    useEffect(() => {
        // `dibatalkan` menjaga agar jawaban yang datang setelah komponen
        // dilepas tidak memanggil `setState` pada komponen yang sudah mati.
        let dibatalkan = false;

        const muat = async () => {
            setGalat(null);
            try {
                const res = await fetch(
                    `/api/admin/orders/detail?id=${encodeURIComponent(id)}`
                );

                // Diperiksa SEBELUM hasilnya dipakai: badan 401/404 juga JSON
                // yang sah, dan tanpa pemeriksaan ini `{ message: '...' }`
                // masuk ke `order` lalu `order.user.name` melempar.
                if (!res.ok) {
                    const isi = await res.json().catch(() => null);
                    throw new Error(isi?.message || `Gagal memuat pesanan (${res.status}).`);
                }

                const data = (await res.json()) as DetailPesanan;
                if (!dibatalkan) setOrder(data);
            } catch (e: any) {
                if (!dibatalkan) setGalat(e?.message || 'Gagal memuat pesanan.');
            }
        };

        muat();
        return () => {
            dibatalkan = true;
        };
        // `id` ikut dalam dependensi: sebelumnya array kosong padahal `params`
        // dipakai di dalam efek.
    }, [id]);

    const handleSave = useCallback(async () => {
        if (!order) return;

        // Tanpa ini satu klik ganda mengirim dua permintaan, dan yang kedua
        // kalah pada CAS `updateMany` di `update-order` lalu dijawab 409.
        if (menyimpan) return;

        const bukti = proof.trim();
        if (bukti === '') {
            alert('Pilih foto bukti tayang lebih dulu.');
            return;
        }

        setMenyimpan(true);
        try {
            const res = await fetch('/api/admin/update-order', {
                method: 'POST',
                // Tanpa header ini badan permintaan terkirim sebagai
                // `text/plain`.
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: id,
                    // Status tidak dipindahkan; `transisiSah` mengizinkan
                    // `dari === ke`.
                    newStatus: order.status,
                    installationProof: bukti,
                }),
            });

            const isi = await res.json().catch(() => null);

            // Keberhasilan diumumkan HANYA setelah server menyatakannya.
            if (!res.ok) {
                throw new Error(isi?.message || `Gagal menyimpan (${res.status}).`);
            }

            setOrder({ ...order, installationProof: bukti });
            alert(isi?.message || 'Bukti tayang disimpan.');
            router.refresh();
        } catch (e: any) {
            alert(`Gagal menyimpan: ${e?.message || 'galat tidak diketahui'}`);
        } finally {
            setMenyimpan(false);
        }
    }, [order, proof, id, menyimpan, router]);

    if (galat) {
        return (
            <div className="p-6 bg-white rounded-xl border border-gray-200">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-sm text-gray-500 mb-6"
                >
                    <ArrowLeft size={16} /> Kembali
                </button>
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="font-bold">Pesanan tidak bisa dimuat</p>
                        <p className="mt-1">{galat}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6 bg-white rounded-xl border border-gray-200 flex items-center gap-3 text-sm text-gray-500">
                <Loader2 size={18} className="animate-spin" /> Memuat pesanan...
            </div>
        );
    }

    return (
        <div className='p-6 bg-white rounded-xl border border-gray-200'>
             <button onClick={()=>router.back()} className='flex items-center gap-2 text-sm text-gray-500 mb-6'><ArrowLeft size={16}/> Kembali</button>

             <h1 className='text-2xl font-bold mb-1'>Order {labelPesanan(order.id)}</h1>
             <p className='text-sm text-gray-500 mb-8'>Update progres pemasangan untuk klien.</p>

             <div className='grid grid-cols-1 md:grid-cols-2 gap-10'>
                 {/* KIRI: Upload */}
                 <div className='bg-gray-50 p-6 rounded-xl border border-dashed border-gray-300'>
                     <h3 className='font-bold text-gray-800 mb-4'>Upload Bukti Tayang (Laporan Lapangan)</h3>
                     {/* Pakai Component ImageUpload yang sudah ada */}
                     <ImageUpload value={proof || order.installationProof || ""} onChange={setProof} label='Foto Lokasi' />

                     <button
                        onClick={handleSave}
                        disabled={menyimpan}
                        className='mt-4 w-full bg-utero text-white py-3 rounded-xl font-bold hover:bg-red-700 transition flex justify-center items-center gap-2 disabled:bg-gray-400'
                     >
                        {menyimpan ? <Loader2 size={18} className='animate-spin'/> : <Save size={18}/>}
                        {menyimpan ? 'Menyimpan...' : 'Simpan & Update Timeline'}
                     </button>
                 </div>

                 {/* KANAN: Data Readonly */}
                 <div className='space-y-4'>
                     {/* Info biasa ... */}
                     <p>Pelanggan: <b>{order.user?.name ?? '-'}</b></p>
                     <p>Billboard: <b>{order.billboard?.title ?? '-'}</b></p>
                 </div>
             </div>
        </div>
    )
}
