// src/app/layout.tsx (Contoh isi)
import { Providers } from "@/components/Providers"; // Panggil yang baru dibuat
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
         {/* BUNGKUS DENGAN PROVIDER AGAR BISA CEK LOGIN DI SEMUA HALAMAN */}
         <Providers>
            {children}
         </Providers>
      </body>
    </html>
  );
}