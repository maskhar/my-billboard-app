// src/app/checkout/layout.tsx
//
// Halaman checkout memuat form identitas penyewa dan nominal yang akan dibayar.
// Ditandai `noindex, nofollow` seperti area privat lainnya.

import { METADATA_PRIVAT } from '@/lib/metadata-privat';

export const metadata = METADATA_PRIVAT;

export default function CheckoutAreaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
