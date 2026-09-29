'use client';

// src/components/AvailabilityCalendar.tsx
//
// Kalender ketersediaan pada halaman produk publik: pengunjung memilih tanggal
// mulai tayang.
//
// DUA CACAT YANG DIPERBAIKI DI SINI, KEDUANYA SUDAH ADA DI PRODUKSI
// -----------------------------------------------------------------
//  1. **`endDate` diperlakukan INKLUSIF.** Rumus lamanya
//     `end.setHours(23,59,59,999)` lalu `date <= end`. Tapi di database
//     `Booking.endDate` adalah batas EKSKLUSIF — gerbang tumpang-tindih di
//     `booking/create` memakai `endDate: { gt: startDate }`, bukan `gte`, dan
//     constraint `booking_tanpa_tumpang_tindih` sepakat dengannya. Jadi satu
//     hari yang MASIH BISA DIJUAL ditandai terpakai, sekali per pesanan,
//     selamanya, tanpa satu pun galat. Itu kehilangan pendapatan yang diam.
//
//  2. **Batas hari dihitung di zona peramban, bukan WIB.** Server mengirim
//     instan ISO, dan `new Date(iso).setHours(0,0,0,0)` mengubahnya menjadi
//     tengah malam LOKAL PERAMBAN. Pada peramban di UTC, pesanan yang mulai
//     1 Oktober WIB tersimpan `2026-09-30T17:00:00Z` dan tergeser menjadi
//     30 September — seluruh blok terbaca maju sehari. `new Date()` untuk
//     "hari ini" punya cacat yang sama pada arah sebaliknya.
//
// Keduanya sekarang diselesaikan dengan cara yang sama seperti kalender admin:
// perbandingan dilakukan atas KUNCI HARI `YYYY-MM-DD` di WIB, bukan atas
// instan. Server mengirim kuncinya langsung (lihat `billboard/[slug]/page.tsx`)
// supaya tidak ada satu pun konversi zona yang terjadi di peramban.

import { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { kunciTanggal } from '@/lib/tanggal';
import {
  batasBawahNavigasi,
  kunciPetak,
  petakTerpakai,
  type RentangTerpakai,
} from '@/lib/petak-kalender';

// `RentangTerpakai` diteruskan, bukan didefinisikan di sini: tipenya dipakai
// bersama tiga berkas, dan bentuk yang ditulis dua kali akan menyimpang. Tetap
// diekspor dari sini supaya pemanggil komponen tidak perlu tahu modul mana yang
// memiliki tipenya.
export type { RentangTerpakai };

// Tipe properti baru, termasuk callback onDateSelect
type AvailabilityCalendarProps = {
  bookedDates: RentangTerpakai[];
  onDateSelect: (date: Date) => void; // Callback untuk mengirim tanggal terpilih ke parent
  initialDate: Date | null;
};

export default function AvailabilityCalendar({ bookedDates, onDateSelect, initialDate }: AvailabilityCalendarProps) {
    const [view, setView] = useState<'month' | 'year'>('month');
    const [activeDate, setActiveDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);

    // "Hari ini" menurut WIB, bukan menurut peramban pengunjung. Pengunjung di
    // zona lain yang melihat tanggal 1 masih bisa dipesan padahal di Jakarta
    // sudah tanggal 2 akan ditolak `booking/create` setelah mengisi formulir.
    const kunciHariIni = kunciTanggal(new Date());

    // Rumus keduanya tinggal di `src/lib/petak-kalender.ts`, bukan sebagai
    // closure di sini. Sebagai closure di dalam komponen ber-JSX-dan-hook,
    // keduanya hanya bisa diuji dengan MENYALIN rumusnya ke dalam test — dan
    // salinan yang tetap benar sementara yang dirender berubah adalah test yang
    // melaporkan hijau atas kode yang salah. Terukur: mutasi `<` → `<=` pada
    // versi closure-nya tidak membunuh satu pun test dari 2139 yang ada.
    const tileDisabled = ({ date }: { date: Date }) =>
        petakTerpakai(bookedDates, kunciHariIni, kunciPetak(date));

    const batasBawah = batasBawahNavigasi(kunciHariIni);

    const handleDateClick = (value: Date) => {
        setSelectedDate(value);
        onDateSelect(value); // Panggil callback
    };
    
    const handlePrev = () => {
        if (view === 'month') {
            setActiveDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
        } else {
            setActiveDate(prev => new Date(prev.getFullYear() - 1, 0, 1));
        }
    };

    const handleNext = () => {
        if (view === 'month') {
            setActiveDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
        } else {
            setActiveDate(prev => new Date(prev.getFullYear() + 1, 0, 1));
        }
    };
    
    // Fungsi untuk menyorot tanggal yang dipilih
    const tileClassName = ({ date }: { date: Date }) => {
        if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
            return 'bg-utero text-white rounded-md';
        }
        return null;
    };
    
    const formatMonthYear = (date: Date) => {
        return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    };

    const renderMonthCalendars = () => {
        return Array.from({ length: 12 }).map((_, i) => {
            const monthDate = new Date(activeDate.getFullYear(), i, 1);
            return (
                <div key={i} className="p-2">
                    <h5 className="text-center font-bold text-sm mb-2">{monthDate.toLocaleDateString('id-ID', { month: 'long' })}</h5>
                    <Calendar
                        activeStartDate={monthDate}
                        minDate={batasBawah}
                        tileDisabled={tileDisabled}
                        onClickDay={handleDateClick}
                        tileClassName={tileClassName}
                        locale="id-ID"
                        className="w-full border-none font-sans"
                        showNavigation={false}
                        next2Label={null} prev2Label={null}
                    />
                </div>
            );
        });
    };

    return (
        <div className="w-full bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            {/* Header Kalender */}
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-800">Availability</h4>
                <div className="flex items-center gap-4">
                    <div className="flex items-center">
                        <button onClick={handlePrev} className="p-1 rounded-md hover:bg-gray-100"><ChevronLeft size={20}/></button>
                        <h5 className="font-bold w-32 text-center">
                            {view === 'month' ? formatMonthYear(activeDate) : activeDate.getFullYear()}
                        </h5>
                        <button onClick={handleNext} className="p-1 rounded-md hover:bg-gray-100"><ChevronRight size={20}/></button>
                    </div>
                    <div className="flex items-center bg-gray-100 p-0.5 rounded-md text-xs font-bold">
                        <button onClick={() => setView('year')} className={`px-3 py-1 rounded ${view === 'year' ? 'bg-white text-utero shadow' : 'text-gray-500'}`}>year</button>
                        <button onClick={() => setView('month')} className={`px-3 py-1 rounded ${view === 'month' ? 'bg-white text-utero shadow' : 'text-gray-500'}`}>month</button>
                    </div>
                </div>
            </div>

            {/* Legenda */}
            <div className="flex gap-4 mb-4 text-xs">
                {/* ... (legenda yang sudah ada) ... */}
            </div>

            {/* Konten Kalender */}
            {view === 'month' ? (
                <Calendar
                    activeStartDate={activeDate}
                    minDate={batasBawah}
                    tileDisabled={tileDisabled}
                    onClickDay={handleDateClick}
                    tileClassName={tileClassName}
                    locale="id-ID"
                    className="w-full border-none font-sans"
                    showNavigation={false}
                    next2Label={null} prev2Label={null}
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {renderMonthCalendars()}
                </div>
            )}
            
            <p className="text-[10px] text-gray-400 mt-3 text-center">
                *Klik tanggal untuk memilih mulai tayang.
            </p>
        </div>
    );
}