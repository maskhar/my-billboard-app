'use client';

import dynamic from 'next/dynamic';
import type { PenandaPeta } from '@/lib/tipe-billboard';

// Import HeroMap secara dinamis (Lazy Loading) agar tidak error di server
const HeroMap = dynamic(() => import('./HeroMap'), { 
  ssr: false, // Matikan server-side rendering untuk peta
  loading: () => <div className="flex h-screen w-full items-center justify-center text-gray-500">Memuat Peta...</div>
});

// Wrapper menerima props 'data' dari halaman server
export default function MapWrapper({ data }: { data: PenandaPeta[] }) {
  // Lalu meneruskannya ke HeroMap sebagai props 'billboards'
  return <HeroMap billboards={data} />;
}