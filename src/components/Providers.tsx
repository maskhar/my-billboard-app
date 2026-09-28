'use client';

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/Toast";
import { KonfirmasiProvider } from "@/components/ui/Konfirmasi";

/**
 * Dipasang di layout akar, jadi ketiganya tersedia di SETIAP Client Component —
 * halaman publik, dashboard pembeli, dan panel admin.
 *
 * `ToastProvider` berada di LUAR `KonfirmasiProvider`: sebuah aksi yang baru
 * disetujui di dialog konfirmasi hampir selalu dilanjutkan dengan pemberitahuan
 * hasilnya, dan urutan ini membuat toast dirender di atas dialog yang baru
 * tertutup, bukan di bawahnya.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <KonfirmasiProvider>{children}</KonfirmasiProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
