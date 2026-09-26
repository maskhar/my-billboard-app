// src/app/invoice/layout.tsx
//
// Invoice adalah dokumen yang paling sering ditempelkan pembeli ke tempat lain —
// tiket dukungan, chat, forum. Sekali alamatnya beredar, `robots.txt` tidak
// cukup: ia mencegah perangkakan, bukan pengindeksan alamat yang ditemukan lewat
// tautan. `noindex` di sini yang menutupnya.

import { METADATA_PRIVAT } from '@/lib/metadata-privat';

export const metadata = METADATA_PRIVAT;

export default function InvoiceAreaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
