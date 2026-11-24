// src/components/LocationVisualizer.tsx
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Map, Eye, Layers } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
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

// Faktor zoom untuk format pb (tidak resmi). Google memakai nilai tetap ini
// pada embed yang dibagikan; disimpan di satu tempat agar mudah digeser.
const PB_ZOOM = 0.7820865974627469;

function buildStreetViewEmbed({
  lat,
  lng,
  apiKey,
  panoId,
  heading,
  pitch,
  fov,
}: {
  lat: number;
  lng: number;
  apiKey?: string | null;
  panoId?: string | null;
  heading?: number | null;
  pitch?: number | null;
  fov?: number | null;
}): string | null {
  const trimmedPanoId = panoId?.trim();
  if (!trimmedPanoId) return null;

  const h = heading ?? 0;
  const p = pitch ?? 0;
  const f = fov ?? 90;
  const resolvedKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || apiKey || '').trim();

  // Mode A: ada key + panoId -> Embed API resmi.
  if (resolvedKey) {
    return `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(
      resolvedKey
    )}&pano=${encodeURIComponent(trimmedPanoId)}&heading=${h}&pitch=${p}&fov=${f}`;
  }

  // Mode B: tanpa key, ada panoId -> format pb (tidak resmi).
  // format pb tidak resmi; angka tuning di sini: PB_ZOOM; pitch positif = menengadah;
  // kalau tampilan terlalu zoom/jauh geser PB_ZOOM, kalau menunduk/menengadah
  // salah balik tanda pitch. !4v pakai nilai tetap 1 agar tidak mismatch SSR.
  return `https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1s${encodeURIComponent(
    trimmedPanoId
  )}!2m2!1d${lat}!2d${lng}!3f${h}!4f${p}!5f${PB_ZOOM}`;
}

export default function LocationVisualizer({
  lat,
  lng,
  address,
  apiKey,
  panoId,
  heading,
  pitch,
  fov,
}: LocationVisualizerProps) {
  const trimmedPanoId = panoId?.trim();
  const [viewMode, setViewMode] = useState<'MAP' | 'STREET'>(() =>
    trimmedPanoId ? 'STREET' : 'MAP'
  );

  const streetViewUrl = trimmedPanoId
    ? `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(
        trimmedPanoId
      )}&heading=${heading ?? 0}&pitch=${pitch ?? 0}&fov=${fov ?? 90}`
    : `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

  const embedUrl = buildStreetViewEmbed({
    lat,
    lng,
    apiKey,
    panoId,
    heading,
    pitch,
    fov,
  });

  useEffect(() => {
    let active = true;

    import('leaflet').then((L) => {
      if (!active) return;

      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative w-full h-[400px] bg-gray-100 rounded-xl overflow-hidden shadow-inner border border-gray-200 group">
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

      {viewMode === 'MAP' && (
        <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} className="w-full h-full z-0">
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[lat, lng]}>
            <Popup>{address}</Popup>
          </Marker>
        </MapContainer>
      )}

      {viewMode === 'STREET' && (
        embedUrl ? (
          <iframe
            width="100%"
            height="100%"
            frameBorder="0"
            style={{ border: 0 }}
            src={embedUrl}
            title={`Street View ${address}`}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          ></iframe>
        ) : (
          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-white relative">
            <div className="absolute inset-0 opacity-40 grayscale">
              <img src="https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=800" className="w-full h-full object-cover" alt="" />
            </div>
            <div className="relative z-10 text-center p-6 bg-black/50 rounded-xl backdrop-blur-md border border-white/20">
              <Layers size={48} className="mx-auto mb-4 text-yellow-400" />
              <h3 className="text-lg font-bold mb-2">Street View 360°</h3>
              <p className="text-xs text-gray-300 max-w-xs mb-4">
                Pratinjau embed belum tersedia untuk billboard ini.
              </p>
              <a
                href={streetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-full font-bold text-sm inline-flex items-center gap-2 transition shadow-lg"
              >
                Buka di tab baru <Eye size={16} />
              </a>
              <p className="text-[10px] text-gray-400 mt-3 max-w-xs">
                Jika pratinjau kosong, gunakan tautan di atas.
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
