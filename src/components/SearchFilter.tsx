'use client';

import { Search, MapPin, MonitorPlay, Calendar, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
                        className="w-full text-sm font-semibold text-gray-700 placeholder-gray-500 outline-none bg-transparent"
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

        {/* === MOBILE FILTER MODAL (Pop Up dari Bawah) === */}
        {showMobileFilter && (
            <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end md:hidden animate-in fade-in">
                <div className="bg-white w-full rounded-t-3xl p-6 pb-10 space-y-6 animate-in slide-in-from-bottom duration-300">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                        <h3 className="font-bold text-lg text-gray-800">Filter Pencarian</h3>
                        <button onClick={() => setShowMobileFilter(false)} className="bg-gray-100 p-2 rounded-full"><X size={20}/></button>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Tipe Media</label>
                        <select 
                            value={type} 
                            onChange={(e) => setType(e.target.value)} 
                            className="w-full border border-gray-200 p-3 rounded-xl font-bold text-gray-700 focus:outline-none focus:border-utero"
                        >
                            <option>Semua</option>
                            <option>Videotron</option>
                            <option>Baliho</option>
                            <option>Megatron</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Mulai Tayang</label>
                        <input 
                            type="date" 
                            value={date} 
                            onChange={(e) => setDate(e.target.value)} 
                            className="w-full border border-gray-200 p-3 rounded-xl font-bold text-gray-700 focus:outline-none focus:border-utero" 
                        />
                    </div>

                    <button 
                        onClick={handleSearch}
                        className="w-full bg-utero text-white py-4 rounded-xl font-bold shadow-lg shadow-red-200 active:scale-95 transition"
                    >
                        Terapkan Filter
                    </button>
                </div>
            </div>
        )}


        {/* === DESKTOP (LAPTOP) VIEW === */}
        <div className="hidden md:flex w-[800px] mx-auto bg-white/95 backdrop-blur-md rounded-full shadow-2xl border border-gray-100 items-center divide-x divide-gray-100 p-2">
            
            {/* Input Lokasi */}
            <div className="flex-1 px-6 py-3 hover:bg-gray-50/50 rounded-l-full cursor-pointer transition group">
                <div className="flex flex-col">
                    <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5 group-hover:text-utero flex items-center gap-1"><MapPin size={10} /> Lokasi</label>
                    <input 
                        type="text" 
                        value={query} 
                        onChange={(e) => setQuery(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Mau pasang di mana?" 
                        className="outline-none text-sm text-gray-800 font-bold bg-transparent w-full placeholder-gray-300" 
                    />
                </div>
            </div>

            {/* Input Tipe */}
            <div className="w-[180px] px-6 py-3 hover:bg-gray-50/50 cursor-pointer transition group">
                <div className="flex flex-col">
                    <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5 group-hover:text-utero flex items-center gap-1"><MonitorPlay size={10} /> Tipe Media</label>
                    <select 
                        value={type} 
                        onChange={(e) => setType(e.target.value)} 
                        className="outline-none text-sm text-gray-800 font-bold bg-transparent w-full -ml-1 cursor-pointer truncate"
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
                    <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5 group-hover:text-utero flex items-center gap-1"><Calendar size={10} /> Mulai Tayang</label>
                    <input type="text" placeholder="Kapan?" className="outline-none text-sm text-gray-800 font-bold bg-transparent w-full placeholder-gray-300" onFocus={(e) => e.target.type = 'date'} onBlur={(e) => e.target.type = 'text'} onChange={(e) => setDate(e.target.value)} />
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