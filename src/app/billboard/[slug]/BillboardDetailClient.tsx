// src/app/billboard/[slug]/BillboardDetailClient.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import LocationVisualizer from '@/components/LocationVisualizer';
import AvailabilityCalendar from '@/components/AvailabilityCalendar';
import { MapPin, CheckCircle2, XCircle, ChevronLeft, ShieldCheck, Calendar } from 'lucide-react';
import TrafficReportModal from '@/components/TrafficReportModal';
import { safeJsonArray } from '@/lib/safe-json';
import { rupiahSingkat } from '@/lib/money';

// Tipe properti yang diterima dari Server Component
type DetailPageClientProps = {
  rawData: any;
  setting: any;
  bookedDates: { start: string; end: string }[];
  initialDate: string;
};

export default function BillboardDetailClient({ rawData, setting, bookedDates, initialDate }: DetailPageClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);

  const handleDateSelect = (date: Date) => {
    const dateString = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
    setSelectedDate(dateString);

    const params = new URLSearchParams(currentSearchParams);
    params.set('date', dateString);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Parsing data.
  //
  // Sebelumnya `JSON.parse` mentah: satu billboard dengan kolom rusak membuat
  // SELURUH halaman produk publik gagal dirender — bukan hanya bagian galeri
  // atau spesifikasinya. Sekarang bagian yang rusak tampil kosong, sisanya
  // tetap terbaca, dan penyebabnya tercatat di log server.
  const gallery = safeJsonArray<string>(rawData.gallery, `Billboard.gallery id=${rawData.id}`);
  const specs = safeJsonArray<{ label: string; value: string }>(rawData.specs, `Billboard.specs id=${rawData.id}`);
  const includes = safeJsonArray<string>(rawData.includes, `Billboard.includes id=${rawData.id}`);
  const excludes = safeJsonArray<string>(rawData.excludes, `Billboard.excludes id=${rawData.id}`);
  // Dulu `(rawData.price / 1000000).toFixed(0)` — pembagian pada objek
  // Decimal menghasilkan NaN, dan harga di halaman produk terbaca "NaN Jt".
  // `rupiahSingkat` sudah memuat satuannya sendiri ("15 Jt", "1,5 M"), jadi
  // kata "Jt" yang dulu ditulis terpisah di JSX ikut dihapus.
  const hargaSingkat = rupiahSingkat(rawData.price);

  return (
    <div className="bg-gray-50 min-h-screen font-sans pb-20">
      <Navbar />

      {/* Hero Banner */}
      <div className="relative mt-16 w-full h-[50vh] lg:h-[60vh] bg-gray-900 group overflow-hidden">
        <img src={rawData.mainImage} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition duration-1000" alt={rawData.title} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20"></div>
        <div className="absolute top-6 left-6 z-10">
          <Link href="/" className="bg-white/20 backdrop-blur-md px-5 py-2.5 rounded-full text-white text-sm font-bold hover:bg-white/30 border border-white/20 flex items-center gap-2 transition">
            <ChevronLeft size={18} /> Kembali
          </Link>
        </div>
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-10 lg:p-16 text-white max-w-7xl mx-auto">
          <div className="flex gap-3 mb-4">
            <span className="bg-blue-600 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider shadow-lg">{rawData.type}</span>
            <span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider shadow-lg ${rawData.status === 'Available' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
              {rawData.status}
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-2 drop-shadow-lg max-w-4xl">{rawData.title}</h1>
          <p className="text-gray-300 flex items-center gap-2 text-sm md:text-base drop-shadow-md">
            <MapPin size={18} className="text-utero" /> {rawData.address}
          </p>
        </div>
      </div>

      {/* Konten Utama */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Kolom Kiri */}
          <div className="lg:col-span-2 space-y-10">
            
            {/* GALERI FOTO */}
            {gallery.length > 0 && (
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                    <h3 className="text-xl font-bold mb-6 text-gray-800">📸 Galeri Foto</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {gallery.map((url, idx) => (
                             <img key={idx} src={url} className="w-full aspect-video object-cover rounded-lg hover:scale-[1.02] transition cursor-pointer bg-gray-100 shadow-sm border" />
                        ))}
                    </div>
                </div>
            )}

            {/* LOKASI VISUALIZER */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <h3 className="text-xl font-bold mb-6 text-gray-800 flex items-center gap-2">📍 Lokasi & Street View</h3>
                <LocationVisualizer lat={rawData.lat} lng={rawData.lng} address={rawData.address} apiKey={setting?.googleMapsApiKey} />
            </div>

            {/* SPESIFIKASI */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="text-xl font-bold mb-6 text-gray-800">🛠️ Spesifikasi Media</h3>
                <div className="overflow-hidden border border-gray-100 rounded-xl">
                    <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-gray-100">
                            {specs.length > 0 ? specs.map((spec, i) => (
                                <tr key={i} className="hover:bg-gray-50/50">
                                    <td className="py-4 px-6 font-medium text-gray-500 w-1/3 bg-gray-50/30">{spec.label}</td>
                                    <td className="py-4 px-6 font-bold text-gray-800">{spec.value}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan={2} className="py-8 text-center text-gray-400">Data spesifikasi belum diinput.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* RINCIAN FASILITAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-green-50/30 p-6 rounded-3xl border border-green-100">
                    <h4 className="text-xs uppercase font-bold text-green-700 mb-4 bg-white border border-green-200 w-fit px-3 py-1 rounded-full shadow-sm">Termasuk (Included)</h4>
                    <ul className="space-y-3">
                        {includes.length > 0 ? includes.map((item, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-gray-700 font-medium">
                                <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                                <span>{item}</span>
                            </li>
                        )) : <p className="text-xs text-gray-400 italic">Tidak ada data include.</p>}
                        {rawData.smartsucoUrl && (
                            <div className="mt-2 border-t border-green-200/50 pt-2">
                                <TrafficReportModal url={rawData.smartsucoUrl} />
                            </div>
                        )}
                    </ul>
                </div>
                <div className="bg-red-50/30 p-6 rounded-3xl border border-red-100">
                     <h4 className="text-xs uppercase font-bold text-red-700 mb-4 bg-white border border-red-200 w-fit px-3 py-1 rounded-full shadow-sm">Tidak Termasuk</h4>
                     <ul className="space-y-3">
                        {excludes.length > 0 ? excludes.map((item, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                                <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                                <span>{item}</span>
                            </li>
                        )) : <p className="text-xs text-gray-400 italic">Tidak ada data exclude.</p>}
                    </ul>
                </div>
            </div>

            {/* KALENDER */}
            <div>
              <AvailabilityCalendar
                bookedDates={bookedDates}
                onDateSelect={handleDateSelect}
                initialDate={selectedDate ? new Date(selectedDate) : null}
              />
            </div>
          </div>

          {/* Kolom Kanan (Sticky Card) */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 relative overflow-hidden">
              <div className="mb-6 relative z-10">
                <span className="text-xs text-gray-400 font-bold uppercase tracking-widest block mb-2">Harga Mulai Dari</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-utero">{hargaSingkat}</span>
                  <span className="text-gray-400 text-sm font-medium">/Bulan</span>
                </div>
              </div>
              <div className="space-y-4 mb-8">
                <div className="flex gap-2 items-center text-sm text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <ShieldCheck size={16} className="text-green-500" />
                  <span>Garansi Pemasangan & Perawatan</span>
                </div>
                {selectedDate && (
                  <div className="flex gap-2 items-center text-sm text-blue-700 bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <Calendar size={16} />
                    <span className="font-bold">Mulai: {new Date(selectedDate).toLocaleDateString('id-ID', { dateStyle: 'long' })}</span>
                  </div>
                )}
              </div>
              <Link
                href={`/checkout?id=${rawData.id}${selectedDate ? '&date=' + selectedDate + '&duration=1' : ''}`}
                className={`block w-full ${!selectedDate ? 'pointer-events-none' : ''}`}
                onClick={(e) => !selectedDate && e.preventDefault()}
              >
                <button
                  className="w-full bg-gradient-to-r from-utero to-red-600 hover:to-red-700 text-white font-bold py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 transform active:scale-95 duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedDate}
                >
                  {selectedDate ? 'Lanjut ke Pembayaran' : 'Pilih Tanggal Dulu'}
                </button>
              </Link>
              <button className="w-full mt-3 bg-white border-2 border-gray-100 text-gray-600 font-bold py-4 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition">
                Hubungi Sales (WA)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
