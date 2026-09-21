// src/components/admin/StatusChanger.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface Props {
  billboardId: string;
  currentStatus: string;
  currentPublishStatus: string;
}

export default function StatusChanger({ billboardId, currentStatus, currentPublishStatus }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Efek untuk menutup dropdown saat klik di luar area
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const handleStatusChange = async (type: 'status' | 'publishStatus', value: string) => {
    // if (type !== 'publishStatus') {
    //   alert("Untuk saat ini hanya bisa mengubah status publikasi.");
    //   return;
    // }

    setLoading(true);
    setIsOpen(false);
    
    try {
      const body = { [type]: value }; // Correctly set the key based on the 'type'
      const res = await fetch(`/api/proxy/billboards/${billboardId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.refresh(); 
      } else {
        const data = await res.json();
        alert(`Gagal mengupdate status: ${data.message || 'Error tidak diketahui'}`);
      }
    } catch (error) {
      alert('Terjadi kesalahan pada server.');
    } finally {
        setTimeout(() => setLoading(false), 500);
    }
  };

  const getPublishStatusColor = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return 'bg-blue-100 text-blue-700';
      case 'ARCHIVED': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className='flex flex-col items-start gap-1 cursor-pointer w-full p-1 rounded-md hover:bg-gray-50 transition-colors'
        disabled={loading}
      >
        <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase inline-block ${currentStatus === 'Available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {currentStatus}
        </span>
        <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase inline-block ${getPublishStatusColor(currentPublishStatus)}`}>
          {currentPublishStatus || 'DRAFT'}
        </span>
      </button>

      {isOpen && (
        <div
          className="origin-top-left absolute left-0 mt-1 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20 focus:outline-none"
          role="menu" aria-orientation="vertical"
        >
          <div className="py-1" role="none">
            <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Ketersediaan</p>
            <a href="#" onClick={(e) => { e.preventDefault(); handleStatusChange('status', 'Available'); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Available</a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleStatusChange('status', 'Booked'); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Booked</a>
            
            <div className='border-t my-1'></div>

            <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Publikasi</p>
            <a href="#" onClick={(e) => { e.preventDefault(); handleStatusChange('publishStatus', 'PUBLISHED'); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Published</a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleStatusChange('publishStatus', 'DRAFT'); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Draft</a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleStatusChange('publishStatus', 'ARCHIVED'); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Archived</a>
          </div>
        </div>
      )}

      {loading && <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center rounded-lg"><Loader2 className="animate-spin text-utero" /></div>}
    </div>
  );
}
