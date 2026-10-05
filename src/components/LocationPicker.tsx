'use client';

import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';
import L from 'leaflet';

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface LocationPickerProps {
  value: {
    lat: number;
    lng: number;
  };
  onChange: (location: { lat: number; lng: number }) => void;
}

function ClickHandler({
  onChange,
}: {
  onChange: (location: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      onChange({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    },
  });
  return null;
}

// `center` pada MapContainer hanya dibaca saat mount, jadi mengetik koordinat
// manual di form tidak membuat viewpoint ikut bergeser. Tombol ini yang
// menyediakan cara memindahkan kamera secara eksplisit.
function RecenterButton({ position }: { position: [number, number] }) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={() => map.flyTo(position, Math.max(map.getZoom(), 15))}
      className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-md transition hover:bg-gray-50"
    >
      <LocateFixed size={14} />
      Pusatkan
    </button>
  );
}

export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  const position: [number, number] = [value.lat, value.lng];

  return (
    <div className="relative w-full h-[360px] rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <MapContainer
        center={position}
        zoom={15}
        scrollWheelZoom={true}
        zoomControl={true}
        className="h-full w-full outline-none"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} />
        <Marker
          position={position}
          icon={icon}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const latlng = e.target.getLatLng();
              onChange({
                lat: latlng.lat,
                lng: latlng.lng,
              });
            },
          }}
        />
        <RecenterButton position={position} />
      </MapContainer>
    </div>
  );
}
