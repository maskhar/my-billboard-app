// src/components/LocationVisualizer.tsx
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
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

type LocationVisualizerProps = {
  lat: number;
  lng: number;
  address: string;
  apiKey?: string | null;
  panoId?: string | null;
  heading?: number | null;
  pitch?: number | null;
  fov?: number | null;
};

export default function LocationVisualizer({ lat, lng, address, apiKey, panoId, heading, pitch, fov }: LocationVisualizerProps) {
  const [viewMode, setViewMode] = useState<'MAP' | 'STREET'>(panoId ? 'STREET' : 'MAP');
  const resolvedKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || apiKey || '').trim();
  const embedUrl = panoId
    ? resolvedKey
      ? `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(resolvedKey)}&pano=${encodeURIComponent(panoId)}&heading=${heading ?? 0}&pitch=${pitch ?? 0}&fov=${fov ?? 90}`
      : `https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1s${encodeURIComponent(panoId)}!2m2!1d${lat}!2d${lng}!3f${heading ?? 0}!4f${pitch ?? 0}!5f0.7820865974627469`
    : null;
  const streetViewUrl = panoId
    ? `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(panoId)}&heading=${heading ?? 0}&pitch=${pitch ?? 0}&fov=${fov ?? 90}`
    : `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

  // --- SOLUSI BUG ICON HILANG/CRASH DI NEXT.JS ---
  // Kita set icon secara manual di dalam useEffect (Hanya jalan di Client)
  useEffect(() => {
    // `import()` dinamis, bukan `require()`: berkas ini adalah modul ES, dan
    // `require` di dalamnya tidak dikenali bundler mana pun selain lewat
    // interop — sekaligus satu-satunya galat `no-require-imports` di seluruh
    // `src/`. Efeknya sama: Leaflet tetap hanya dimuat di browser, karena effect
    // tidak berjalan saat render server.
    let dibatalkan = false;

    import('leaflet').then((mod) => {
      if (dibatalkan) return;
      const L = mod.default;

      // Hapus default icon yang sering error url-nya. Propertinya tidak ada di
      // tipe publik Leaflet, jadi aksesnya lewat satu penegasan sempit.
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

      // Pasang ulang icon default dengan link CDN yang stabil
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
    });

    return () => {
      dibatalkan = true;
    };
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
            embedUrl ? (
                <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0 }}
                    src={embedUrl ?? streetViewUrl} title={`Street View ${address}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                ></iframe>
            ) : (
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-white relative">
                    <div className="absolute inset-0 opacity-40 grayscale">
                        {/*
                          Satu-satunya `<img>` di repo ini yang BENAR-BENAR bisa
                          menjadi `next/image`, dan karena itu jadi: alamatnya
                          tetap, ditulis di kode ini, dan `images.unsplash.com`
                          memang terdaftar di `remotePatterns` next.config.ts.
                          Tidak ada admin yang bisa menggantinya dengan host
                          yang tidak terdaftar, jadi tidak ada risiko lempar
                          saat dijalankan — sisa `<img>` di repo semuanya
                          menerima URL dari database.

                          `alt=""`, bukan deskripsi: ini latar dekoratif di
                          balik kartu "Street View belum dikonfigurasi", dan
                          pesannya sudah tertulis sebagai teks di atasnya.
                          Mendeskripsikan foto jalan raya acak di sini hanya
                          menambah kebisingan bagi pembaca layar.
                        */}
                        <Image
                            src="https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=800"
                            alt=""
                            fill
                            sizes="100vw"
                            className="object-cover"
                        />
                    </div>
                    <div className="relative z-10 text-center p-6 bg-black/50 rounded-xl backdrop-blur-md border border-white/20">
                        <Layers size={48} className="mx-auto mb-4 text-yellow-400"/>
                        <h3 className="text-lg font-bold mb-2">Street View 360°</h3>
                        <p className="text-xs text-gray-300 max-w-xs mb-4">
                            Fitur Embed belum dikonfigurasi.
                        </p>
                        
                        <a 
                            href={streetViewUrl}
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