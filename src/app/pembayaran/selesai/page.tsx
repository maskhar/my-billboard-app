// src/app/pembayaran/selesai/page.tsx
//
// Tempat pembeli dipulangkan oleh kanal pembayaran yang memindahkan halaman
// (e-wallet, internet banking, kartu dengan 3DS).
//
// KENAPA HALAMAN INI ADA, DAN KENAPA ISINYA SEDIKIT
// ------------------------------------------------
// Alamat pulang yang dikirim saat sesi dibuat adalah satu alamat tetap tanpa
// nomor pesanan di dalamnya. Itu disengaja: alamat pulang ikut ke sisi penyedia
// dan ke riwayat browser, jadi semakin sedikit yang ditulis di sana semakin
// sedikit pula yang bisa dibaca orang lain dari layar atau dari riwayat. Karena
// itu halaman ini tidak tahu — dan tidak boleh menebak — pesanan mana yang baru
// saja dibayar.
//
// HALAMAN INI TIDAK MENYATAKAN PEMBAYARAN BERHASIL.
// Pembeli sampai ke sini setelah menutup halaman penyedia, bukan setelah dana
// dipastikan masuk. Yang memastikannya adalah pemberitahuan dari sisi penyedia ke
// server kami. Menulis "pembayaran berhasil" di sini akan membuat pembeli yang
// membatalkan di tengah jalan pulang membawa keyakinan yang salah.

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Clock3, LayoutDashboard } from 'lucide-react';

export const metadata = {
  title: 'Status Pembayaran',
  // Halaman ini hanya berarti bagi satu orang pada satu saat; tidak ada yang
  // pantas diindeks mesin pencari.
  robots: { index: false, follow: false },
};

export default function PembayaranSelesaiPage() {
  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />

      <div className="max-w-xl mx-auto px-4 pt-24">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-5">
            <Clock3 className="text-amber-600" size={26} />
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Status pembayaran sedang diperiksa
          </h1>

          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            Status pembayaran Anda sedang diperiksa. Status pesanan diperbarui
            otomatis setelah hasilnya dikonfirmasi — biasanya beberapa menit,
            tanpa perlu Anda lakukan apa pun.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left mb-6">
            <p className="text-xs text-gray-600 leading-relaxed">
              Jika Anda membatalkan pembayaran di tengah jalan, tagihan pesanan
              tetap terbuka dan bisa dibayar ulang dari Dashboard selama tenggat
              pesanan belum lewat.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-utero text-white text-sm font-bold rounded-xl hover:opacity-90 transition shadow-sm"
          >
            <LayoutDashboard size={16} /> Lihat Status di Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
