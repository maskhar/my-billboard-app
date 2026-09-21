// import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Plus, MapPin, Tag, Edit, Eye, User, Clock } from 'lucide-react';
import DeleteBillboardBtn from '@/components/admin/DeleteBillboardBtn'; 
import StatusChanger from '@/components/admin/StatusChanger'; 
import { Billboard, User as UserType } from '@prisma/client';

export const dynamic = 'force-dynamic';

type BillboardWithUsers = Billboard & {
  updatedBy: UserType | null;
  createdBy: UserType | null;
}

async function getAdminBillboards(): Promise<BillboardWithUsers[]> {
  try {
    // WARNING: This is now an unauthenticated call for debugging purposes.
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:4001';
    const targetUrl = `${backendUrl}/api/billboards/admin`;

    const res = await fetch(targetUrl, { cache: 'no-store' });

    if (!res.ok) {
      console.error("Gagal mengambil data admin billboards:", res.status, await res.text());
      return [];
    }
    
    const billboards = await res.json();
    return billboards;

  } catch (error) {
    console.error("Gagal mengambil data admin billboards:", error);
    return [];
  }
}

export default async function AdminBillboardsPage() {
  const billboards = await getAdminBillboards();

  return (
    <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Inventory Billboard</h1>
                <p className="text-gray-500 text-sm">Kelola data asset dan detail lokasi.</p>
            </div>
            <Link href="/admin/billboards/form" className="bg-utero hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-lg transition w-fit">
                <Plus size={20}/> Tambah Titik Baru
            </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-100">
                    <tr>
                        <th className="px-6 py-4">Foto</th>
                        <th className="px-6 py-4">Info Produk</th>
                        <th className="px-6 py-4">Audit (Admin)</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                    {billboards.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-gray-400">Belum ada data.</td></tr>
                    ) : billboards.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition group">
                            
                            <td className="px-6 py-3 w-24">
                                <Link href={`/billboard/${item.slug}`} target="_blank">
                                    <img src={item.mainImage} className="w-20 h-12 object-cover rounded bg-gray-200 border hover:scale-110 transition cursor-pointer" />
                                </Link>
                            </td>
                            
                            <td className="px-6 py-3 max-w-[250px]">
                                <div className="font-bold text-gray-800 line-clamp-1">{item.title}</div>
                                <div className="text-[10px] font-mono text-gray-400 mt-0.5">{item.sku || '-'}</div>
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1 line-clamp-1">
                                    <MapPin size={12}/> {item.address}
                                </div>
                            </td>

                            <td className="px-6 py-3">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center text-[9px] font-bold">
                                            {item.updatedBy?.name?.charAt(0) || "S"}
                                        </div>
                                        <span className="text-xs font-bold text-gray-700">{item.updatedBy?.name || "System"}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                        <Clock size={10}/> {new Date(item.updatedAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </td>

                            <td className="px-6 py-3">
                                <StatusChanger billboardId={item.id} currentStatus={item.status} currentPublishStatus={item.publishStatus || 'DRAFT'} />
                                <div className="font-bold text-gray-800 text-xs mt-1">Rp {item.price.toLocaleString('id-ID')}</div>
                            </td>

                            <td className="px-6 py-3">
                                <div className="flex justify-center gap-2">
                                    <Link href={`/billboard/${item.slug}`} target="_blank" className="p-2 text-green-600 hover:bg-green-50 rounded border border-green-200 transition"><Eye size={16}/></Link>
                                    <Link href={`/admin/billboards/form?id=${item.id}`} className="p-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition"><Edit size={16}/></Link>
                                    <DeleteBillboardBtn id={item.id} title={item.title} />
                                </div>
                            </td>

                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
}