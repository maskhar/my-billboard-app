import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Plus, MapPin, Tag, Edit, Eye, User, Clock } from 'lucide-react';
import DeleteBillboardBtn from '@/components/admin/DeleteBillboardBtn';
import StatusChanger from '@/components/admin/StatusChanger';
import { Billboard } from '@prisma/client';
import { angkaRupiah } from '@/lib/money';

export const dynamic = 'force-dynamic';

// Hanya `name` yang dirender (inisial + nama pengubah terakhir). Kolom User
// lainnya — email, hash password, KTP, NPWP — tidak ikut dikirim ke browser.
type BillboardWithUsers = Billboard & {
  updatedBy: { id: string; name: string | null } | null;
  createdBy: { id: string; name: string | null } | null;
}

// Sebelumnya lewat HTTP ke backend NestJS. Halaman ini Server Component dan
// akses ke halaman admin sudah dijaga middleware, jadi query langsung sudah
// cukup — dan menghilangkan ketergantungan pada proses kedua yang harus hidup.
// Tanpa batas, query ini mengambil SELURUH inventori setiap kali halaman
// dibuka — beserta gambar, spesifikasi, dan dua relasi User per baris. Dengan
// 30 billboard itu tidak terasa; dengan 3.000 halaman ini berhenti terbuka
// sama sekali, dan tidak ada satu pun pesan yang menjelaskan kenapa.
const PER_HALAMAN = 25;

async function getAdminBillboards(halaman: number): Promise<{ data: BillboardWithUsers[]; total: number }> {
  try {
    const [data, total] = await prisma.$transaction([
      prisma.billboard.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
        skip: (halaman - 1) * PER_HALAMAN,
        take: PER_HALAMAN,
      }),
      prisma.billboard.count(),
    ]);
    return { data, total };
  } catch (error) {
    console.error('Gagal mengambil data admin billboards:', error);
    return { data: [], total: 0 };
  }
}

export default async function AdminBillboardsPage({
  searchParams,
}: {
  searchParams?: { halaman?: string };
}) {
  // `Number("abc")` menghasilkan NaN dan `Number("-5")` menghasilkan skip
  // negatif — keduanya membuat query gagal. Dinormalkan ke 1.
  const halamanMentah = Number(searchParams?.halaman);
  const halaman = Number.isFinite(halamanMentah) && halamanMentah >= 1 ? Math.floor(halamanMentah) : 1;

  const { data: billboards, total } = await getAdminBillboards(halaman);
  const totalHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));

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
                                <div className="font-bold text-gray-800 text-xs mt-1">Rp {angkaRupiah(item.price)}</div>
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

            {totalHalaman > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 text-sm">
                <span className="text-gray-500">
                  Halaman {halaman} dari {totalHalaman} · {total} titik
                </span>
                <div className="flex gap-2">
                  {halaman > 1 && (
                    <Link
                      href={`/admin/billboards?halaman=${halaman - 1}`}
                      className="rounded border border-gray-200 px-3 py-1.5 font-bold text-gray-600 transition hover:bg-gray-50"
                    >
                      Sebelumnya
                    </Link>
                  )}
                  {halaman < totalHalaman && (
                    <Link
                      href={`/admin/billboards?halaman=${halaman + 1}`}
                      className="rounded border border-gray-200 px-3 py-1.5 font-bold text-gray-600 transition hover:bg-gray-50"
                    >
                      Berikutnya
                    </Link>
                  )}
                </div>
              </div>
            )}
        </div>
    </div>
  );
}