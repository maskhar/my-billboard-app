// src/components/admin/PetaPemilihLokasi.tsx
'use client';

import dynamic from 'next/dynamic';

/**
 * Pembungkus yang memuat `LocationPicker` hanya di browser.
 *
 * `dynamic(..., { ssr: false })` tidak bisa dipanggil di dalam form billboard
 * itu sendiri: berkas itu Client Component, dan `dynamic()` di dalam badan
 * komponen akan membuat ulang komponennya setiap render — peta di-mount ulang
 * setiap kali admin menekan satu tombol di kolom mana pun, dan posisi
 * viewport-nya hilang bersamaan. Jadi batas `ssr: false`-nya tinggal di
 * modulnya sendiri, seperti `MapWrapper.tsx` untuk peta halaman depan.
 */
const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-500">
      Memuat peta...
    </div>
  ),
});

export default LocationPicker;
