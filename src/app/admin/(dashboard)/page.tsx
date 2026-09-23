import { prisma } from '@/lib/prisma';
import RevenueSection from '@/components/admin/RevenueSection';
import { getRevenueData } from './actions';
import { DollarSign, ShoppingBag, Map as MapIcon, Users, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// [BARU] Impor untuk logika percabangan
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import CS_Dashboard from '../_components/cs/CS_Dashboard';
import { angkaRupiah, rupiah } from '@/lib/money';
import { wherePendapatan } from '@/lib/revenue';

// Supaya data selalu fresh
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  
    // [BARU] Ambil sesi untuk cek role
  const session = await getServerSession(authOptions);

  // Jika role adalah CS, tampilkan dashboard khusus
  if (session?.user?.role === 'CS') {
    return <CS_Dashboard />;
  }

  // --- START: DATA FETCHING & PROCESSING (Hanya untuk Admin) ---

  // 1. Ambil semua data agregat dalam satu panggilan (lebih efisien)
  const totalBillboardsPromise = prisma.billboard.count();
  const totalOrdersPromise = prisma.booking.count();
  const totalCustomersPromise = prisma.user.count({ where: { role: 'USER' } });
  // Daftar status diambil dari `wherePendapatan()`, bukan ditulis ulang di sini.
  //
  // Dulu daftarnya ditulis langsung di baris ini dan memuat `REFUNDED`: uang
  // yang sudah dikembalikan ke pelanggan tetap dihitung sebagai omzet, jadi
  // kartu "Total Omzet" selalu lebih besar dari uang yang benar-benar diterima,
  // persis sebesar seluruh refund yang pernah terjadi. Daftar itu juga
  // melewatkan tahap DESIGN_RECEIVED, IN_PRODUCTION, dan INSTALLATION —
  // pesanan yang sudah dibayar tapi sedang dikerjakan hilang dari omzet sampai
  // ia tayang. Lihat src/lib/revenue.ts untuk alasan lengkapnya.
  const revenueResultPromise = prisma.booking.aggregate({
    _sum: { totalPrice: true },
    where: wherePendapatan()
  });

  const [
    totalBillboards,
    totalOrders,
    totalCustomers,
    revenueResult
  ] = await Promise.all([
    totalBillboardsPromise,
    totalOrdersPromise,
    totalCustomersPromise,
    revenueResultPromise
  ]);

  const totalRevenue = revenueResult._sum.totalPrice || 0;

  // 2. Definisikan kartu statistik menggunakan data yang sudah di-fetch
  const stats = [
    { title: "Total Omzet", value: rupiah(totalRevenue), icon: DollarSign, color: "bg-green-600" },
    { title: "Total Pesanan", value: totalOrders, icon: ShoppingBag, color: "bg-blue-600" },
    { title: "Titik Billboard", value: totalBillboards, icon: MapIcon, color: "bg-orange-500" },
    { title: "Pelanggan", value: totalCustomers, icon: Users, color: "bg-purple-600" },
  ];

    // 3. Ambil data untuk tabel transaksi terkini
  const recentOrders = await prisma.booking.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { user: true, billboard: true }
  });

  // 4. Ambil data awal untuk grafik (default 6 bulan)
  const initialChartData = await getRevenueData('6m');

  // --- END: DATA FETCHING & PROCESSING ---

  return (
    <div className="space-y-8">
        
        {/* HEADER */}
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Ringkasan Bisnis</h1>
            <p className="text-gray-500 text-sm">Pantau kinerja penjualan Utero Cloud.</p>
        </div>

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {stats.map((stat, idx) => (
                <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 hover:translate-y-[-2px] transition duration-200">
                    <div className={`${stat.color} w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md`}>
                        <stat.icon size={24}/>
                    </div>
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{stat.title}</p>
                        <h3 className="text-xl font-extrabold text-gray-800 mt-1">{stat.value}</h3>
                    </div>
                </div>
            ))}
        </div>

        {/* CHART & ACTIVITY (Grid 3:1) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* GRAFIK (KIRI LEBAR) */}
            <div className="lg:col-span-2">
                <RevenueSection initialData={initialChartData} />
            </div>

            {/* QUICK ACTIONS / SIDE WIDGET (KANAN) */}
            <div className="bg-gradient-to-br from-utero to-red-800 rounded-2xl p-6 text-white flex flex-col justify-between shadow-xl">
                <div>
                    <h3 className="font-bold text-lg mb-2">🔥 Fast Action</h3>
                    <p className="text-white/80 text-sm mb-6">Ada orderan yang butuh persetujuan manual.</p>
                </div>
                <div className="space-y-3">
                    <Link href="/admin/orders" className="block bg-white text-red-600 px-4 py-3 rounded-xl font-bold text-sm text-center hover:bg-gray-100 transition shadow-sm">
                        Cek Order Masuk
                    </Link>
                    <Link href="/admin/billboards/form" className="block bg-white/20 text-white border border-white/30 px-4 py-3 rounded-xl font-bold text-sm text-center hover:bg-white/30 transition">
                        + Tambah Lokasi
                    </Link>
                </div>
            </div>
        </div>

        {/* TABLE RECENT ORDER */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Transaksi Terkini</h3>
                <Link href="/admin/orders" className="text-xs text-utero font-bold hover:underline flex items-center gap-1">Lihat Semua <ArrowRight size={12}/></Link>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="text-[10px] uppercase text-gray-400 font-bold border-b border-gray-100 bg-white">
                        <tr>
                            <th className="px-8 py-3 pl-8">Order ID</th>
                            <th className="px-6 py-3">Customer</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Nilai</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {recentOrders.map((order) => (
                            <tr key={order.id} className="hover:bg-gray-50 transition">
                                <td className="px-8 py-4 font-mono text-xs font-bold text-gray-500">#{order.id.slice(-6).toUpperCase()}</td>
                                <td className="px-6 py-4 font-bold text-gray-800">{order.user.name}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                        order.status === 'PENDING_PAYMENT' ? 'bg-yellow-100 text-yellow-700' : 
                                        order.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                        {order.status}
                                    </span>
                                </td>
                                {/* `toLocaleString()` tanpa argumen memakai
                                    format Inggris — "15,000,000" — dengan
                                    titik dan koma terbalik dari kebiasaan di
                                    sini. Pada nilai Decimal ia bahkan tidak
                                    memberi pemisah ribuan sama sekali. */}
                                <td className="px-6 py-4 text-right font-bold text-gray-800">Rp {angkaRupiah(order.totalPrice)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
}