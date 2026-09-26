// src/components/admin/RevenueSection.tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { getRevenueData } from '@/app/admin/(dashboard)/actions';
import RevenueChart from './RevenueChart'; // Komponen Chart yang sudah ada
import { Loader2 } from 'lucide-react';

// Tipe data untuk chart
type ChartData = {
  name: string;
  total: number;
};

// Tipe data untuk filter
type Period = 'daily' | '1m' | '3m' | '6m' | '12m' | 'all';

// Opsi filter yang akan ditampilkan sebagai tombol
const filterOptions: { label: string; value: Period }[] = [
  { label: 'Harian (30d)', value: 'daily' },
  { label: '1 Bulan', value: '1m' },
  { label: '3 Bulan', value: '3m' },
  { label: '6 Bulan', value: '6m' },
  { label: '1 Tahun', value: '12m' },
  { label: 'Semua Waktu', value: 'all' },
];

export default function RevenueSection({ initialData }: { initialData: ChartData[] }) {
  const [data, setData] = useState<ChartData[]>(initialData);
  const [period, setPeriod] = useState<Period>('6m'); // Default ke 6 bulan
  const [isPending, startTransition] = useTransition(); // Hook untuk loading state

  // Fungsi untuk mengambil data baru saat filter diubah
  const handleFilterChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    startTransition(async () => {
      const newData = await getRevenueData(newPeriod);
      setData(newData);
    });
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-gray-800">Tren Uang Masuk</h3>
          {/* Keterangan ini dulu berbunyi "Omzet berdasarkan tanggal pembayaran
              dikonfirmasi" — padahal yang dijumlahkan adalah nilai kontrak
              pesanan, bukan uang yang diterima. Sekarang isinya memang uang,
              dan refund yang sudah ditransfer menguranginya. */}
          <p className="text-sm text-gray-500">
            Pembayaran yang diterima per tanggal terima, dikurangi refund yang sudah ditransfer.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => handleFilterChange(option.value)}
              disabled={isPending}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors duration-200 ${
                period === option.value
                  ? 'bg-white text-utero shadow'
                  : 'text-gray-500 hover:bg-gray-200'
              } disabled:opacity-50`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Tampilkan loader saat data sedang diambil */}
      {isPending ? (
        <div className="h-[350px] flex justify-center items-center">
          <Loader2 className="animate-spin text-gray-300" size={40} />
        </div>
      ) : (
        <RevenueChart data={data} />
      )}
    </div>
  );
}
