// src/app/dashboard/layout.tsx
//
// Tidak menambah tampilan — hanya menandai seluruh `/dashboard` sebagai
// `noindex, nofollow`. Alamat di bawahnya memuat id pesanan
// (`/dashboard/order/{id}`), dan halamannya memuat data pembeli.
//
// `/dashboard/order/{id}/payment` sudah punya metadata sendiri (judul + noindex)
// dan itu MENIMPA nilai dari layout ini, bukan menghapusnya: halaman yang
// menyetel `robots` sendiri tetap noindex, halaman yang tidak menyetel apa pun
// mewarisi dari sini.

import { METADATA_PRIVAT } from '@/lib/metadata-privat';

export const metadata = METADATA_PRIVAT;

export default function DashboardAreaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
