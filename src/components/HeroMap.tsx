// src/components/HeroMap.tsx
'use client';

import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet'; // 1. Tambah Import ZoomControl
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Link from 'next/link';
import { rupiahSingkat } from '@/lib/money';
import type { PenandaPeta } from '@/lib/tipe-billboard';

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface HeroMapProps {
  billboards: PenandaPeta[];
}

const HeroMap = ({ billboards }: HeroMapProps) => {
  return (
    <div className="h-screen w-full relative z-0">
      <MapContainer 
        center={[-7.9666, 112.6326]} 
        zoom={13} 
        scrollWheelZoom={true} 
        zoomControl={false} // 2. MATIKAN Zoom Bawaan (Kiri Atas)
        // Leaflet memasang `tabindex="0"` pada `.leaflet-container` supaya
        // petanya bisa digeser dengan tombol panah. Jadi wadah ini BENAR-BENAR
        // menerima fokus papan tombol — dan `outline-none` sendirian membuang
        // satu-satunya petunjuk bahwa fokus sedang berada di peta, tepat pada
        // kontrol yang tombol panahnya baru berfungsi setelah difokuskan.
        className="h-full w-full outline-none focus:ring-2 focus:ring-inset focus:ring-utero"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 3. PASANG Zoom Baru di Bawah Kiri */}
        <ZoomControl position="bottomleft" />

        {billboards.map((board) => (
          <Marker 
            key={board.id} 
            position={[board.lat, board.lng]} 
            icon={icon}
          >
            <Popup className="request-popup">
              <div className="w-[220px] font-sans">
                <div className="w-full h-28 overflow-hidden rounded-t-lg relative">
                    {/*
                      `<img>` biasa, bukan `next/image`: `mainImage` diisi admin
                      dan boleh menunjuk ke penyimpanan mana pun, sedangkan
                      `remotePatterns` di next.config.ts hanya memuat tiga host.
                      `next/image` MELEMPAR saat dijalankan untuk sumber di luar
                      daftar itu — satu billboard dengan URL host baru akan
                      mengosongkan peta halaman depan.

                      `alt` dulu tidak ada sama sekali. Pembaca layar membacakan
                      nama berkasnya (atau diam), padahal judul billboardnya
                      tertulis tepat di bawah gambar ini.
                    */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={board.mainImage}
                        alt={`Foto ${board.title}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.src = "https://via.placeholder.com/300"; }}
                    />
                    <div className="absolute top-2 right-2 bg-white/90 px-2 py-0.5 rounded text-[10px] font-bold uppercase text-gray-600 shadow-sm">
                        {board.type}
                    </div>
                </div>
                
                <div className="p-3">
                    <h3 className="font-bold text-sm text-gray-900 leading-tight mb-1 line-clamp-2">
                        {board.title}
                    </h3>
                    
                    <div className="flex justify-between items-center mt-3">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-500">Mulai dari</span>
                            <span className="font-bold text-utero text-sm">
                                Rp {rupiahSingkat(board.price)}
                            </span>
                        </div>
                        <Link href={`/billboard/${board.slug}`} className="bg-utero text-white text-xs px-4 py-2 rounded-lg hover:bg-red-700 transition font-semibold">
                           Detail
                        </Link>
                    </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default HeroMap;