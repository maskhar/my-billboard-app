// src/app/dashboard/DashboardClientPage.tsx
'use client'; 
import { useState } from 'react'; 
import DashboardLayout from './DashboardLayout'; // Impor layout baru
import Navbar from '@/components/Navbar';
import BookingCard from '@/components/BookingCard';
import { User, Wallet, Briefcase, History } from 'lucide-react';
import { rupiahSingkat } from '@/lib/money';

type DashboardPageProps = {
  session: any;
  activeOrders: any[];
  historyOrders: any[];
  totalSpent: number;
};

// ====================================================================
// KOMPONEN UTAMA DASHBOARD BARU (CLIENT)
// ====================================================================
export default function DashboardClientPage({ session, activeOrders, historyOrders, totalSpent }: DashboardPageProps) {

  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">

        <div className="md:col-span-2 lg:col-span-3">
           <OrderTabs 
              activeOrders={activeOrders} 
              historyOrders={historyOrders}
           />
        </div>

        <div className="md:col-span-1 lg:col-span-1">
           <ProfileCard 
              session={session} 
              activeOrderCount={activeOrders.length}
              totalSpent={totalSpent}
           />
        </div>

      </div>
    </DashboardLayout>
  );
}

// ====================================================================
// SUB-KOMPONEN 1: KARTU PROFIL (Samping Kanan)
// ====================================================================
const ProfileCard = ({ session, activeOrderCount, totalSpent }: any) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-24">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-gray-700 to-gray-900 flex items-center justify-center text-2xl font-bold text-white shadow-md flex-shrink-0">
            {session.user?.name?.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-800 truncate">{session.user?.name}</h1>
            <p className="text-gray-500 text-sm flex items-center gap-1 truncate">
                <User size={12}/> {session.user?.email}
            </p>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className='bg-blue-50 border border-blue-100 p-4 rounded-lg'>
          <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-1">Pesanan Aktif</p>
          <p className="text-2xl font-extrabold text-blue-700">{activeOrderCount}</p>
        </div>
        <div className='bg-green-50 border border-green-100 p-4 rounded-lg'>
            <p className="text-[10px] text-green-500 font-bold uppercase tracking-wider mb-1">Total Pengeluaran</p>
            <p className="text-xl font-bold text-green-700 flex items-center gap-2">
                <Wallet size={16}/>
                Rp {rupiahSingkat(totalSpent)}
            </p>
        </div>
      </div>
    </div>
  );
}


// ====================================================================
// SUB-KOMPONEN 2: TABS UNTUK ORDER (Konten Utama Kiri)
// ====================================================================
const OrderTabs = ({ activeOrders, historyOrders }: any) => {
  const [activeTab, setActiveTab] = useState('active');

  const tabs = [
    { id: 'active', label: 'Sedang Berjalan', icon: Briefcase, count: activeOrders.length, data: activeOrders },
    { id: 'history', label: 'Riwayat Transaksi', icon: History, count: historyOrders.length, data: historyOrders }
  ];

  const currentTabData = tabs.find(tab => tab.id === activeTab)?.data || [];

  return (
    <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-200">
            {tabs.map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 md:px-4 py-3 font-bold text-sm transition-colors duration-200 ${
                        activeTab === tab.id 
                        ? 'border-b-2 border-utero text-utero' 
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <tab.icon size={14}/>
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        activeTab === tab.id ? 'bg-utero/10 text-utero' : 'bg-gray-100 text-gray-500'
                    }`}>
                        {tab.count}
                    </span>
                </button>
            ))}
        </div>

        <div className="p-1 md:p-4">
            {currentTabData.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-gray-400">Tidak ada data untuk ditampilkan di sini.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {currentTabData.map((order: any) => <BookingCard key={order.id} order={order} />)}
                </div>
            )}
        </div>
    </div>
  )
}