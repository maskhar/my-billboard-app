// src/instrumentation.ts
//
// Satu-satunya titik di aplikasi ini yang berjalan SEBELUM permintaan pertama.
//
// Next memanggil `register()` sekali per proses server, di `prepareImpl()`
// (lihat `next/dist/server/next-server.js` → `runInstrumentationHookIfAvailable`).
// Lemparan dari sini dibungkus Next menjadi kegagalan boot yang terbaca, jadi
// ini tempat yang benar untuk memeriksa konfigurasi: server yang salah setel
// tidak pernah sampai menerima pesanan.
//
// Next SENGAJA melewati hook ini saat `NEXT_PHASE === 'phase-production-build'`,
// jadi `npm run build` tidak perlu `.env` produksi yang lengkap — pemeriksaannya
// berjalan saat `next start`, di mesin yang benar, dengan environment yang benar.
//
// Berkas ini dijaga tetap tipis. Apa pun yang diimpor di sini ikut dimuat di
// setiap boot, termasuk `next dev`; aturannya sendiri hidup di `src/lib/env.ts`
// yang tidak mengimpor apa pun.

import { pastikanEnvSiap } from '@/lib/env';

export async function register(): Promise<void> {
  // Hook ini juga dipanggil untuk runtime Edge, yang tidak punya `process.env`
  // lengkap dan tidak menjalankan route mana pun di aplikasi ini.
  if (process.env.NEXT_RUNTIME === 'edge') return;

  pastikanEnvSiap();
}
