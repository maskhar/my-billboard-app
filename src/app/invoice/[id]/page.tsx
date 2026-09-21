// src/app/invoice/[id]/page.tsx
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Image from 'next/image';

// 1. UPDATE TIPE DATA PROPS
type Props = {
  params: Promise<{ id: string }>
}

export default async function InvoicePage(props: Props) {
  // 2. AWAIT PARAMS DULU
  const params = await props.params;
  
  const session = await getServerSession(authOptions);
  
  // Jika belum login, tolak akses
  if (!session) return <div className="text-center p-10 font-bold text-red-500">Access Denied: Harap Login</div>;

  // 3. GUNAKAN ID YANG SUDAH DIAWAIT
  const order = await prisma.booking.findUnique({
      where: { id: params.id }, 
      include: { user: true, billboard: true }
  });

  if(!order) return <div className="text-center p-10 font-bold">Invoice Tidak Ditemukan</div>;

  // Hanya pemilik order atau admin yang boleh lihat
  if (order.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return <div className="text-center p-10 font-bold text-red-500">Anda tidak berhak melihat invoice ini.</div>;
  }

  return (
    <div className="bg-gray-100 min-h-screen py-10 print:bg-white print:p-0 font-sans">
        <div className="max-w-[21cm] mx-auto bg-white shadow-lg p-12 rounded-xl print:shadow-none print:w-full">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-8 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">INVOICE</h1>
                    <p className="text-gray-500 text-sm font-mono">#{order.id.slice(-8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-extrabold text-utero tracking-tight">Utero<span className='text-gray-800'>Cloud</span></h2>
                    <p className="text-xs text-gray-500 mt-1">Jl. Soekarno Hatta No. 1, Malang</p>
                    <p className="text-xs text-gray-500">support@utero.cloud</p>
                </div>
            </div>

            {/* Info Klien */}
            <div className="grid grid-cols-2 gap-10 mb-10">
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Ditagihkan Kepada</p>
                    <h3 className="font-bold text-gray-800 text-lg">{order.user.name}</h3>
                    <p className="text-gray-600 text-sm">{order.user.email}</p>
                    <p className="text-gray-600 text-sm">{order.user.whatsapp || '-'}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Status Pembayaran</p>
                    <div className={`inline-block px-4 py-2 rounded-lg font-bold uppercase text-xs ${
                        order.status === 'ACTIVE' || order.status === 'REFUNDED' ? 'bg-green-100 text-green-700' : 
                        order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                        {order.status.replace('_',' ')}
                    </div>
                    <p className="text-xs text-gray-400 mt-2 font-mono">Tgl: {new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
            </div>

            {/* Tabel Item */}
            <table className="w-full mb-10 border-collapse">
                <thead className="bg-gray-50 border-y-2 border-gray-100">
                    <tr>
                        <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Deskripsi Item</th>
                        <th className="py-3 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Periode</th>
                        <th className="py-3 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Jumlah</th>
                    </tr>
                </thead>
                <tbody className="text-sm text-gray-700">
                    <tr className="border-b border-gray-100">
                        <td className="py-4 px-4">
                            <p className="font-bold text-gray-800">{order.billboard.title}</p>
                            <p className="text-gray-500 text-xs mt-1">{order.billboard.address}</p>
                            {order.designOption === 'service' && <span className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded ml-1 font-bold">+ Jasa Desain</span>}
                        </td>
                        <td className="py-4 px-4 text-right">
                            {order.duration} Bulan
                        </td>
                        <td className="py-4 px-4 text-right font-bold text-gray-800">
                            Rp {order.totalPrice.toLocaleString('id-ID')}
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Total */}
            <div className="flex justify-end mb-16">
                <div className="w-1/2">
                    <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-gray-500 text-sm">Subtotal</span>
                        <span className="font-bold text-gray-800">Rp {order.totalPrice.toLocaleString('id-ID')}</span>
                    </div>
                    {/* DP Info (Jika ada) */}
                    {order.dpAmount && order.dpAmount < order.totalPrice && (
                         <div className="flex justify-between py-2 border-b border-gray-100 text-orange-600 bg-orange-50 px-2 rounded">
                            <span className="text-xs font-bold">DP Masuk</span>
                            <span className="font-bold text-sm">- Rp {order.dpAmount.toLocaleString('id-ID')}</span>
                         </div>
                    )}
                    <div className="flex justify-between py-4 mt-2 bg-gray-50 px-4 rounded-xl">
                        <span className="text-lg font-bold text-gray-800">Total</span>
                        <span className="text-lg font-extrabold text-utero">Rp {order.totalPrice.toLocaleString('id-ID')}</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center text-[10px] text-gray-400 border-t border-gray-200 pt-8">
                <p className="font-bold mb-1">Terima kasih atas kepercayaan Anda kepada Utero Cloud.</p>
                <p>Dokumen ini diterbitkan secara otomatis oleh sistem komputer dan sah tanpa tanda tangan basah.</p>
                <div className='print:hidden mt-8'>
                     <p className='text-xs text-blue-500'>*Tekan Ctrl + P untuk mencetak atau simpan sebagai PDF.</p>
                </div>
            </div>
        </div>
    </div>
  );
}