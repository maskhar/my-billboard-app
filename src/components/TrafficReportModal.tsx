'use client';

import { useState } from 'react';
import { BarChart3, X, ExternalLink, Loader2 } from 'lucide-react'; // Tambah Loader

export default function TrafficReportModal({ url }: { url: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Buat URL Proxy
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;

  return (
    <>
        <button 
            onClick={() => setIsOpen(true)} 
            className="w-full mt-4 bg-white text-blue-600 font-bold hover:bg-blue-50 text-xs px-3 py-3 rounded-lg border border-blue-200 flex items-center justify-center gap-2 transition shadow-sm"
        >
            <BarChart3 size={16}/> Cek Laporan Trafik
        </button>

        {isOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-300">
                <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
                    
                    <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            <BarChart3 className="text-blue-600"/> Laporan Trafik
                        </h3>
                        <div className="flex items-center gap-2">
                            <a href={url} target="_blank" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mr-4 font-bold">
                                <ExternalLink size={12}/> Buka di Tab Baru
                            </a>
                            <button onClick={() => setIsOpen(false)} className="bg-gray-200 hover:bg-red-500 hover:text-white p-2 rounded-full transition">
                                <X size={20}/>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 bg-white w-full h-full relative">
                         {/* PANGGIL URL PROXY (Bukan URL Asli) */}
                         <iframe 
                            src={proxyUrl}
                            className="w-full h-full border-none"
                            title="Traffic Report Proxy"
                            sandbox="allow-scripts allow-same-origin allow-forms"
                         />
                         
                         {/* LOADING SCREEN (Muncul sebelum iframe selesai load) */}
                         <div className="absolute inset-0 flex items-center justify-center -z-10 text-gray-400 text-sm">
                            <div className="text-center">
                                 <Loader2 className="animate-spin text-blue-500 mx-auto mb-2" size={32}/>
                                 Memuat data dari <b className="text-blue-600">{new URL(url).hostname}</b>...
                            </div>
                         </div>
                    </div>
                </div>
            </div>
        )}
    </>
  );
}