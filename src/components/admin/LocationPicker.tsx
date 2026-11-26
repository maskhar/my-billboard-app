// src/components/admin/LocationPicker.tsx
'use client';

import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';
import L from 'leaflet';
import { LAT_DEFAULT, LNG_DEFAULT, koordinat } from '@/lib/bidang-billboard';

// Impor `react-leaflet` dan `leaflet` di sini STATIS, sama seperti
// `HeroMap.tsx` — dan dengan syarat yang sama: berkas ini tidak boleh dirender
// di server. `L.icon()` di bawah berjalan saat modul dimuat dan menyentuh
// `window`. Pemanggilnya WAJIB memuatnya lewat `dynamic(..., { ssr: false })`;
// form billboard admin melakukannya.
//
// Pola `LocationVisualizer.tsx` (empat `dynamic()` per subkomponen) tidak bisa
// dipakai di sini: `useMapEvents` dan `useMap` adalah hook yang membaca context
// Leaflet, dan context itu tidak menyeberang batas komponen yang dibungkus
// `dynamic()` satu per satu.
const ikon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

/**
 * Pembulatan koordinat ke enam angka desimal (~11 cm di ekuator).
 *
 * Satu klik di peta menghasilkan lintang 15 angka desimal. Tanpa pembulatan
 * angka itu masuk ke state form dan dirender apa adanya di kedua `<input>`
 * koordinat di sebelah peta, sehingga kolomnya menampilkan
 * `-7.966612345678901` — tidak terbaca, dan tidak ada satu pun digit setelah
 * yang keenam yang berarti untuk sebuah billboard.
 */
const DESIMAL = 1e6;
function bulatkan(nilai: number): number {
  return Math.round(nilai * DESIMAL) / DESIMAL;
}

/**
 * Posisi yang pasti bisa dirender Leaflet.
 *
 * Form menyimpan `lat`/`lng` sebagai `number | string` karena kedua kolomnya
 * juga bisa diketik tangan. Admin yang mengosongkan kolom Lat memberi `''`
 * ke sini, dan `position={[NaN, NaN]}` membuat Leaflet MELEMPAR DI DALAM
 * RENDER — bukan satu penanda yang hilang, tapi seluruh form yang sedang diisi
 * ikut hilang bersama isinya. Kegagalan yang sama sudah tercatat untuk peta
 * halaman depan di `src/lib/tipe-billboard.ts`.
 *
 * `koordinat()` dipakai, bukan `Number()`: ia menolak `NaN` dan `Infinity`
 * sekaligus, dan ia pembaca koordinat yang sama yang dipakai route create dan
 * update — jadi yang terlihat di peta adalah yang akan tersimpan.
 */
function posisiAman(lat: number | string, lng: number | string): [number, number] {
  return [koordinat(lat) ?? LAT_DEFAULT, koordinat(lng) ?? LNG_DEFAULT];
}

/** Menerjemahkan klik di peta menjadi satu pembaruan koordinat. */
function PenangkapKlik({ onChange }: { onChange: (titik: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: bulatkan(e.latlng.lat), lng: bulatkan(e.latlng.lng) });
    },
  });
  return null;
}

/**
 * Tombol yang memindahkan kamera ke koordinat yang sedang dipegang form.
 *
 * `center` pada `MapContainer` HANYA dibaca saat mount, jadi mengetik
 * koordinat di kedua `<input>` di sebelah peta tidak menggeser viewport sama
 * sekali — penandanya pindah keluar layar dan admin tidak punya cara menemukan
 * kembali tanpa menggeser peta dengan tangan. Tombol ini satu-satunya jalan
 * eksplisit untuk itu.
 */
function TombolPusatkan({ posisi }: { posisi: [number, number] }) {
  const peta = useMap();
  return (
    <button
      type="button"
      onClick={() => peta.flyTo(posisi, Math.max(peta.getZoom(), 15))}
      className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-md transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-utero"
    >
      <LocateFixed size={14} aria-hidden="true" />
      Pusatkan
    </button>
  );
}

type LocationPickerProps = {
  lat: number | string;
  lng: number | string;
  onChange: (titik: { lat: number; lng: number }) => void;
};

/**
 * Peta pemilih koordinat billboard: klik di mana pun, atau geser penandanya.
 *
 * BUKAN satu-satunya cara mengisi koordinat, dan tidak dimaksudkan menjadi
 * satu-satunya. Kedua `<input>` Lat/Lng di sebelahnya tetap ada karena peta
 * Leaflet tidak bisa dioperasikan dengan papan tombol untuk MEMILIH sebuah
 * titik — tombol panah hanya menggeser viewport, dan tidak ada padanan papan
 * tombol untuk "klik di sini". Admin yang tidak memakai tetikus mengetik
 * angkanya; keduanya menulis ke state form yang sama.
 */
export default function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  const posisi = posisiAman(lat, lng);

  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm">
      <MapContainer
        center={posisi}
        zoom={15}
        scrollWheelZoom={true}
        zoomControl={true}
        // Leaflet memasang `tabindex="0"` pada `.leaflet-container`, jadi wadah
        // ini benar-benar menerima fokus papan tombol. `outline-none`
        // sendirian akan membuang satu-satunya petunjuk bahwa fokus sedang di
        // peta — alasan yang sama tertulis di `HeroMap.tsx`.
        className="h-full w-full outline-none focus:ring-2 focus:ring-inset focus:ring-utero"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PenangkapKlik onChange={onChange} />
        <Marker
          position={posisi}
          icon={ikon}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const titik = e.target.getLatLng();
              onChange({ lat: bulatkan(titik.lat), lng: bulatkan(titik.lng) });
            },
          }}
        />
        <TombolPusatkan posisi={posisi} />
      </MapContainer>
    </div>
  );
}
