// src/components/LocationVisualizer.tsx
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Map, Eye, Layers } from 'lucide-react';
// HAPUS import L from 'leaflet' di sini agar server tidak error!
import 'leaflet/dist/leaflet.css';

// Import Komponen Leaflet secara Dinamis (No SSR)
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false } // Kunci biar gak error "window not defined"
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

export default function LocationVisualizer({ lat, lng, address, apiKey }: { lat: number, lng: number, address: string, apiKey?: string | null }) {
  const [viewMode, setViewMode] = useState<'MAP' | 'STREET'>('MAP');

  // --- SOLUSI BUG ICON HILANG/CRASH DI NEXT.JS ---
  // Kita set icon secara manual di dalam useEffect (Hanya jalan di Client)
  useEffect(() => {
    // Trik memanggil Leaflet hanya di browser
    const L = require("leaflet");

    // Hapus default icon yang sering error url-nya
    delete L.Icon.Default.prototype._getIconUrl;

    // Pasang ulang icon default dengan link CDN yang stabil
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  return (
    <div className="relative w-full h-[400px] bg-gray-100 rounded-xl overflow-hidden shadow-inner border border-gray-200 group">
        
        {/* TABS SWITCHER */}
        <div className="absolute top-4 right-4 z-[500] flex bg-white rounded-lg shadow-lg border border-gray-200 p-1">
            <button 
                onClick={() => setViewMode('MAP')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition ${viewMode === 'MAP' ? 'bg-utero text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
                <Map size={14} /> Peta
            </button>
            <button 
                onClick={() => setViewMode('STREET')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition ${viewMode === 'STREET' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
                <Eye size={14} /> Street View
            </button>
        </div>

        {/* --- VIEW 1: MAP --- */}
        {viewMode === 'MAP' && (
            <MapContainer 
                center={[lat, lng]} 
                zoom={15} 
                scrollWheelZoom={false} 
                className="w-full h-full z-0"
            >
                <TileLayer
                    attribution='&copy; OpenStreetMap'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {/* Marker tidak perlu prop icon={}, karena sudah di-fix di useEffect */}
                <Marker position={[lat, lng]}>
                    <Popup>{address}</Popup>
                </Marker>
            </MapContainer>
        )}

        {/* --- VIEW 2: STREET VIEW --- */}
        {viewMode === 'STREET' && (
            apiKey ? (
                <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0 }}
                    src={`https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${lat},${lng}&heading=210&pitch=10&fov=35`}
                    allowFullScreen
                ></iframe>
            ) : (
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-white relative">
                    <div className="absolute inset-0 opacity-40 grayscale">
                        <img src="https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=800" className="w-full h-full object-cover" />
                    </div>
                    <div className="relative z-10 text-center p-6 bg-black/50 rounded-xl backdrop-blur-md border border-white/20">
                        <Layers size={48} className="mx-auto mb-4 text-yellow-400"/>
                        <h3 className="text-lg font-bold mb-2">Street View 360°</h3>
                        <p className="text-xs text-gray-300 max-w-xs mb-4">
                            Fitur Embed belum dikonfigurasi.
                        </p>
                        
                        <a 
                            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`} 
                            target="_blank"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-full font-bold text-sm inline-flex items-center gap-2 transition shadow-lg"
                        >
                            Buka Aplikasi Maps <Eye size={16}/>
                        </a>
                    </div>
                </div>
            )
        )}
    </div>
  );
}