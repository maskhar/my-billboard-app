// src/app/admin/layout.tsx
//
// Layout ini TIDAK menambah tampilan apa pun — kerangka visual panel admin
// tetap di `src/app/admin/(dashboard)/layout.tsx`. Yang ditambahkannya hanya
// satu hal: `robots: noindex, nofollow` untuk SELURUH `/admin`, termasuk
// `/admin/login` yang berada di luar grup `(dashboard)`.
//
// Ditaruh di sini, bukan di layout grup, supaya halaman admin baru mewarisinya
// dengan sendirinya. Satu berkas yang lupa menyetel metadata-nya adalah satu
// alamat panel admin yang boleh muncul di hasil pencarian.

import { METADATA_PRIVAT } from '@/lib/metadata-privat';

export const metadata = METADATA_PRIVAT;

export default function AdminAreaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
