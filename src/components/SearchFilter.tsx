'use client';

import { Search, MapPin, MonitorPlay, Calendar, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Modal from '@/components/ui/Modal';

// Empat isian di berkas ini memakai `outline-none` TANPA pengganti apa pun —
// bukan `focus:ring-utero` yang lebarnya nol seperti di halaman login, tapi
// benar-benar tidak ada. Penanda fokus bawaan peramban dibuang dan tidak ada
// yang menggantikannya, jadi pengguna papan tombol menelusuri bilah pencarian
// utama di halaman depan tanpa satu pun petunjuk kolom mana yang aktif.
//
// Penggantinya cincin di dalam (`ring-inset`), bukan cincin di luar seperti
// pada formulir: isian di sini duduk rapat di dalam satu pil putih tanpa
// batas masing-masing, dan cincin luar akan menembus tepi pil itu.
// Label di berkas ini semuanya tanpa `htmlFor`, dan tidak satu pun isiannya
// punya `id`. Akibatnya: label tidak bisa diklik untuk memfokuskan isiannya,
// dan pembaca layar menyebut keenam kolom ini tanpa nama — "edit text",
// "combo box", "edit text" — di komponen yang justru pintu masuk utama
// seluruh situs. Bilah pencarian versi mobile tidak punya label sama sekali,
// jadi yang dipakai di sana `aria-label`, bukan label yang ditempelkan
// sekadar untuk memenuhi aturan.
const KELAS_FOKUS = 'outline-none focus:ring-2 focus:ring-inset focus:ring-utero rounded-lg';

const SearchFilter = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // STATE DATA SEARCH
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || 'Semua');
  const [date, setDate] = useState('');

  // STATE MOBILE MODAL
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  // LOGIC CARI
  const handleSearch = () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (type && type !== 'Semua') params.set('type', type);
      if (date) params.set('date', date);

      setShowMobileFilter(false); // Tutup modal hp jika terbuka
      router.push(`/?${params.toString()}`); // Update URL
  };

  return (
    <>
        {/* === MOBILE (HP) VIEW === */}
        <div className="md:hidden w-[95%] mx-auto mt-4">
            <div className="bg-white rounded-full shadow-lg border border-gray-100 p-2 flex items-center gap-3">
                <div className="pl-2">
                    <Search className="text-gray-800" size={20}/>
                </div>
                <div className="flex-1">
                    <input 
                        type="text" 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Cari titik di kota / wilayah ..."
                        aria-label="Cari titik billboard di kota atau wilayah"
                        className={`w-full text-sm font-semibold text-gray-700 placeholder-gray-500 bg-transparent ${KELAS_FOKUS}`}
                    />
                </div>
                <button 
                    onClick={() => setShowMobileFilter(true)}
                    className="p-2.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 flex items-center gap-2 active:scale-95 transition"
                >
                    <span className="text-xs font-bold text-gray-700">Filter</span>
                    <SlidersHorizontal size={16} className="text-utero"/>
                </button>
            </div>
        </div>

        {/* === MOBILE FILTER MODAL (Pop Up dari Bawah) ===

            `md:hidden` DIPERTAHANKAN di pembungkus terluar lewat `kelasLuar`.
            Tanpa itu lembar filter ini tetap terpasang di lebar desktop,
            menutupi bilah pencarian versi desktop di bawahnya dengan latar
            hitam — `showMobileFilter` tidak pernah direset saat lebar layar
            berubah, jadi memutar tablet dari tegak ke datar cukup untuk
            memunculkannya di tata letak yang salah.

            Lembar ini dulu div biasa: Tab dari dalamnya berjalan terus ke
            enam isian bilah pencarian desktop yang tersembunyi di belakang
            latar — pengguna papan tombol mengetik ke kolom yang tidak ia
            lihat, lalu menekan Enter dan halaman berpindah. */}
        <Modal
            terbuka={showMobileFilter}
            tutup={() => setShowMobileFilter(false)}
            judul="Filter Pencarian"
            varian="bawah"
            lebar="max-w-none"
            kelasLuar="md:hidden"
        >
            <div className="space-y-6 p-6 pb-10">
                    <div>
                        <label htmlFor="filter-tipe-mobile" className="text-xs font-bold text-gray-500 uppercase mb-2 block">Tipe Media</label>
                        <select 
                            id="filter-tipe-mobile"
                            value={type} 
                            onChange={(e) => setType(e.target.value)} 
                            className="w-full border border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-utero focus:border-utero"
                        >
                            <option>Semua</option>
                            <option>Videotron</option>
                            <option>Baliho</option>
                            <option>Megatron</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="filter-tanggal-mobile" className="text-xs font-bold text-gray-500 uppercase mb-2 block">Mulai Tayang</label>
                        <input 
                            id="filter-tanggal-mobile"
                            type="date" 
                            value={date} 
                            onChange={(e) => setDate(e.target.value)} 
                            className="w-full border border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-utero focus:border-utero"
                        />
                    </div>

                    <button
                        onClick={handleSearch}
                        className="w-full bg-utero text-white py-4 rounded-xl font-bold shadow-lg shadow-red-200 active:scale-95 transition"
                    >
                        Terapkan Filter
                    </button>
            </div>
        </Modal>


        {/* === DESKTOP (LAPTOP) VIEW === */}
        <div className="hidden md:flex w-[800px] mx-auto bg-white/95 backdrop-blur-md rounded-full shadow-2xl border border-gray-100 items-center divide-x divide-gray-100 p-2">
            
            {/* Input Lokasi */}
            <div className="flex-1 px-6 py-3 hover:bg-gray-50/50 rounded-l-full cursor-pointer transition group">
                <div className="flex flex-col">
                    <label htmlFor="filter-lokasi" className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5 group-hover:text-utero flex items-center gap-1"><MapPin size={10} /> Lokasi</label>
                    <input 
                        id="filter-lokasi"
                        type="text" 
                        value={query} 
                        onChange={(e) => setQuery(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Mau pasang di mana?" 
                        className={`text-sm text-gray-800 font-bold bg-transparent w-full placeholder-gray-300 ${KELAS_FOKUS}`}
                    />
                </div>
            </div>

            {/* Input Tipe */}
            <div className="w-[180px] px-6 py-3 hover:bg-gray-50/50 cursor-pointer transition group">
                <div className="flex flex-col">
                    <label htmlFor="filter-tipe" className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5 group-hover:text-utero flex items-center gap-1"><MonitorPlay size={10} /> Tipe Media</label>
                    <select 
                        id="filter-tipe"
                        value={type} 
                        onChange={(e) => setType(e.target.value)} 
                        className={`text-sm text-gray-800 font-bold bg-transparent w-full -ml-1 cursor-pointer truncate ${KELAS_FOKUS}`}
                    >
                        <option>Semua</option>
                        <option>Videotron</option>
                        <option>Baliho</option>
                        <option>Megatron</option>
                    </select>
                </div>
            </div>

            {/* Input Tanggal */}
            <div className="w-[180px] px-6 py-3 hover:bg-gray-50/50 cursor-pointer transition group">
                <div className="flex flex-col">
                    <label htmlFor="filter-tanggal" className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5 group-hover:text-utero flex items-center gap-1"><Calendar size={10} /> Mulai Tayang</label>
                    <input id="filter-tanggal" type="text" placeholder="Kapan?" className={`text-sm text-gray-800 font-bold bg-transparent w-full placeholder-gray-300 ${KELAS_FOKUS}`} onFocus={(e) => e.target.type = 'date'} onBlur={(e) => e.target.type = 'text'} onChange={(e) => setDate(e.target.value)} />
                </div>
            </div>

            {/* Tombol Search Desktop */}
            <div className="pl-4 pr-1">
                <button 
                    onClick={handleSearch}
                    className="w-12 h-12 bg-gradient-to-br from-utero to-red-600 hover:scale-105 active:scale-95 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-red-500/30 transition-all duration-300"
                >
                    <Search size={20} className='stroke-[3px]' />
                </button>
            </div>

        </div>
    </>
  );
};

export default SearchFilter;