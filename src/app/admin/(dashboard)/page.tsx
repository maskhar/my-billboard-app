import { prisma } from '@/lib/prisma';
import RevenueSection from '@/components/admin/RevenueSection';
import { getRevenueData } from './actions';
import {
  DollarSign, ShoppingBag, Map as MapIcon, Users, ArrowRight, Undo2, Wallet,
} from 'lucide-react';
import Link from 'next/link';

// [BARU] Impor untuk logika percabangan
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import CS_Dashboard from '../_components/cs/CS_Dashboard';
import { angkaRupiah, kurang, rupiah } from '@/lib/money';
import { labelPesanan } from '@/lib/nomor-pesanan';
import { BookingStatus, PaymentStatus } from '@prisma/client';

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

  // UANG MASUK DIHITUNG DARI LEDGER PEMBAYARAN, BUKAN DARI STATUS PESANAN.
  //
  // Kartu ini dulu menjumlahkan `Booking.totalPrice` atas pesanan yang
  // statusnya masuk daftar pendapatan. Dua hal salah pada rumus itu, dan
  // keduanya membuat angkanya lebih besar dari uang yang benar-benar ada:
  //
  //   1. `totalPrice` adalah nilai KONTRAK, bukan uang yang diterima. Pesanan
  //      DP yang baru menyetor 40% tetap dihitung 100%.
  //   2. Status bukan bukti pembayaran. `PAID_CONFIRMED` hanya berarti admin
  //      menandainya; ia bisa disetel tanpa satu rupiah pun masuk.
  //
  // Sekarang sumbernya baris `Payment` berstatus PAID — satu baris per uang
  // yang benar-benar diterima. `TAMBAHAN` ikut dijumlahkan karena pembeli
  // memang membayarnya, dan label kartunya menyebut "Uang Masuk", bukan omzet.
  const uangMasukPromise = prisma.payment.aggregate({
    _sum: { jumlah: true },
    where: { status: PaymentStatus.PAID },
  });

  // Refund yang benar-benar sudah ditransfer keluar. Hanya `REFUNDED`:
  // pesanan di tengah alur refund (REVIEW_REFUND, WAITING_BANK,
  // PROCESS_REFUND) uangnya masih di rekening perusahaan hari ini.
  const refundPromise = prisma.booking.aggregate({
    _sum: { refundAmount: true },
    where: { status: BookingStatus.REFUNDED },
  });

  const [
    totalBillboards,
    totalOrders,
    totalCustomers,
    hasilUangMasuk,
    hasilRefund
  ] = await Promise.all([
    totalBillboardsPromise,
    totalOrdersPromise,
    totalCustomersPromise,
    uangMasukPromise,
    refundPromise
  ]);

  // `_sum` mengembalikan null bila tidak ada baris yang cocok. Dibiarkan
  // masuk ke helper money.ts, yang memperlakukan null sebagai nol.
  const uangMasuk = hasilUangMasuk._sum.jumlah;
  const refundSelesai = hasilRefund._sum.refundAmount;
  const omzetBersih = kurang(uangMasuk, refundSelesai);

  // 2. Definisikan kartu statistik menggunakan data yang sudah di-fetch
  //
  // Tiga angka uang ditulis terpisah supaya definisinya tidak bisa
  // disalahpahami: bruto, pengurang, dan hasilnya.
  const stats = [
    { title: "Omzet Bersih", value: rupiah(omzetBersih), icon: DollarSign, color: "bg-green-600" },
    { title: "Uang Masuk", value: rupiah(uangMasuk), icon: Wallet, color: "bg-emerald-600" },
    { title: "Refund Selesai", value: rupiah(refundSelesai), icon: Undo2, color: "bg-rose-600" },
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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

        {/* Definisi ditulis di layar, bukan hanya di komentar kode. Tanpa ini
            "Omzet Bersih" tetap bisa dibaca sebagai nilai seluruh pesanan yang
            pernah masuk — yang justru rumus lamanya. */}
        <p className="text-[11px] text-gray-400 leading-relaxed -mt-4">
            <b>Uang Masuk</b> = seluruh pembayaran yang benar-benar diterima, termasuk biaya tambahan.
            <b> Refund Selesai</b> = dana yang sudah ditransfer kembali ke pelanggan.
            <b> Omzet Bersih</b> = Uang Masuk − Refund Selesai.
            Nilai pesanan yang belum dibayar tidak dihitung di sini.
        </p>

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
                            {/* "Nilai Pesanan", bukan "Nilai": kolom ini
                                menampilkan `totalPrice` — nilai kontrak saat
                                pemesanan, bukan uang yang sudah diterima.
                                Uang yang diterima per pesanan ada di halaman
                                Transaksi. */}
                            <th className="px-6 py-3 text-right">Nilai Pesanan</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {recentOrders.map((order) => (
                            <tr key={order.id} className="hover:bg-gray-50 transition">
                                <td className="px-8 py-4 font-mono text-xs font-bold text-gray-500">{labelPesanan(order.id)}</td>
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