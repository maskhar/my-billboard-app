// src/app/admin/(dashboard)/orders/[id]/page.tsx
'use client';

// Karena logic upload dan update, kita pakai Client Component aja biar cepat
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // Ingat di Next.js 13+ ini dr navigation
import ImageUpload from '@/components/ImageUpload';
import { ArrowLeft, Save } from 'lucide-react';

export default function AdminOrderDetailPage({ params }: { params: { id: string } }) {
    // Kita gunakan trik useEffect fetch data biar tidak ribet server/client mismatch
    // (Sebenarnya bisa Server Component, tapi karena butuh Upload Form, client lebih gampang)
    
    const router = useRouter();
    const [order, setOrder] = useState<any>(null);
    const [proof, setProof] = useState("");

    // Fetch data
    useEffect(() => {
        // Ambil ID dari params (Harus diawait di next 15, tapi krn client, params otomatis resolve biasanya atau bisa diprops)
        // Kita anggap logic fetch:
        fetch(`/api/admin/orders/detail?id=${params.id}`).then(res => res.json()).then(setOrder);
    }, []);

    const handleSave = async () => {
        // Panggil API Update (API Update-order yang tadi kita upgrade)
        await fetch('/api/admin/update-order', {
            method: 'POST',
            body: JSON.stringify({ 
                orderId: params.id, 
                newStatus: order.status, // Status gak berubah
                installationProof: proof  // Kirim Foto
            })
        });
        alert("Bukti Tayang Disimpan!");
        router.refresh();
    };

    if(!order) return <div>Loading...</div>;

    return (
        <div className='p-6 bg-white rounded-xl border border-gray-200'>
             <button onClick={()=>router.back()} className='flex items-center gap-2 text-sm text-gray-500 mb-6'><ArrowLeft size={16}/> Kembali</button>
             
             <h1 className='text-2xl font-bold mb-1'>Order #{order.id.slice(-6).toUpperCase()}</h1>
             <p className='text-sm text-gray-500 mb-8'>Update progres pemasangan untuk klien.</p>

             <div className='grid grid-cols-2 gap-10'>
                 {/* KIRI: Upload */}
                 <div className='bg-gray-50 p-6 rounded-xl border border-dashed border-gray-300'>
                     <h3 className='font-bold text-gray-800 mb-4'>Upload Bukti Tayang (Laporan Lapangan)</h3>
                     {/* Pakai Component ImageUpload yang sudah ada */}
                     <ImageUpload value={proof || order.installationProof || ""} onChange={setProof} label='Foto Lokasi' />
                     
                     <button onClick={handleSave} className='mt-4 w-full bg-utero text-white py-3 rounded-xl font-bold hover:bg-red-700 transition flex justify-center gap-2'>
                        <Save size={18}/> Simpan & Update Timeline
                     </button>
                 </div>

                 {/* KANAN: Data Readonly */}
                 <div className='space-y-4'>
                     {/* Info biasa ... */}
                     <p>Pelanggan: <b>{order.user.name}</b></p>
                     <p>Billboard: <b>{order.billboard.title}</b></p>
                 </div>
             </div>
        </div>
    )
}