'use client';

import { ArrowDownRight, ArrowUpRight, BarChart, Clock, Users, MessageSquare, Minus, type LucideIcon } from 'lucide-react';

/**
 * Satu kartu statistik.
 *
 * `: any` dulu tertulis di seluruh daftar prop ini sekaligus, dan itu menutupi
 * dua hal. `change` dipakai dengan `>` — dengan `any`, memanggilnya
 * `change="75"` (teks) lolos `tsc` dan `"75" > 0` di JavaScript memulangkan
 * `true` lewat konversi diam-diam, jadi cacatnya tidak pernah terlihat sampai
 * suatu nilai seperti `"tidak ada"` masuk. Dan `icon` dipanggil sebagai
 * komponen (`<Icon ... />`); prop yang bukan komponen menjatuhkan seluruh
 * dashboard saat render, bukan saat dibangun.
 */
type StatCardProps = {
  title: string;
  /** Sudah diformat untuk dibaca (`"1"`, `"-"`), bukan angka mentah. */
  value: string;
  /** Selisih persen terhadap tujuh hari lalu. Boleh negatif dan boleh nol. */
  change: number;
  icon: LucideIcon;
  /** Hex enam digit; `+ '1A'` di bawah menempelkan alfa ~10%. */
  color: string;
};

// Komponen Kartu Statistik
const StatCard = ({ title, value, change, icon: Icon, color }: StatCardProps) => (
  <div className="bg-white p-5 rounded-lg border border-gray-200 flex items-start justify-between">
    <div>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
      {/*
        Tiga keadaan, bukan dua. Sebelumnya hanya `change > 0` yang diperiksa,
        sehingga perubahan NOL tampil merah dengan panah naik: "0% vs 7 hari
        lalu" dibacakan sebagai penurunan, lengkap dengan ikon yang
        membantahnya sendiri. Dua dari empat kartu di halaman ini bernilai nol.
      */}
      <div
        className={`text-xs flex items-center mt-2 font-semibold ${
          change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'
        }`}
      >
        {change > 0 ? (
          <ArrowUpRight size={14} className="mr-1" />
        ) : change < 0 ? (
          <ArrowDownRight size={14} className="mr-1" />
        ) : (
          <Minus size={14} className="mr-1" />
        )}
        {change > 0 ? '+' : ''}{change}% vs 7 hari lalu
      </div>
    </div>
    <div className={`p-3 rounded-full`} style={{ backgroundColor: color + '1A' }}>
        <Icon className="w-5 h-5" style={{ color: color }}/>
    </div>
  </div>
);

// Komponen Utama Dashboard CS
export default function CS_Dashboard() {
  return (
    <div className="p-8 bg-gray-50/50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Dashboard Pengunjung</h1>
            <p className="text-sm text-gray-500">Analitik real-time untuk interaksi pelanggan.</p>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-green-600 flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Live
            </span>
        </div>
      </div>
      
      {/* Grid Statistik Utama */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Pengunjung Aktif" value="1" change={75} icon={Users} color="#3B82F6"/>
        <StatCard title="Total Obrolan" value="0" change={-100} icon={MessageSquare} color="#10B981"/>
        <StatCard title="Waktu Respon Rata-rata" value="-" change={0} icon={Clock} color="#F59E0B"/>
        <StatCard title="Tingkat Kepuasan" value="-" change={0} icon={BarChart} color="#EF4444"/>
      </div>
      
      {/* Area Konten Tambahan */}
      <div className="grid grid-cols-3 gap-6 mt-6">
        {/* Kolom Kiri: Riwayat Pengunjung */}
        <div className="col-span-3 lg:col-span-2 bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-4">Riwayat Pengunjung</h3>
            <div className="text-center py-16 text-gray-400">
                <p>Data riwayat akan muncul di sini.</p>
            </div>
        </div>
        
        {/* Kolom Kanan: Update & Bantuan */}
        <div className="col-span-3 lg:col-span-1 bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-4">Informasi & Update</h3>
            <div className="space-y-4 text-sm">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <p className="font-semibold text-blue-800">Integrasi AI Telah Aktif</p>
                    <p className="text-blue-600 text-xs mt-1">Gunakan AI Assist untuk mempercepat balasan.</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <p className="font-semibold text-green-800">Update WhatsApp & Dark Mode</p>
                    <p className="text-green-600 text-xs mt-1">Versi 2025 kini mendukung integrasi WA.</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
