'use client';

import { useState } from 'react';
import { BarChart3, ExternalLink, Loader2 } from 'lucide-react'; // Tambah Loader
import Modal from '@/components/ui/Modal';

export default function TrafficReportModal({ url }: { url: string }) {
  const [isOpen, setIsOpen] = useState(false);

  // Sebelumnya konten dimuat lewat /api/proxy?url=... Cara itu dibuang karena
  // proxy tersebut menerima URL apa pun tanpa daftar izin (bisa menjangkau
  // jaringan internal) dan memantulkan HTML asing sebagai dokumen dari origin
  // kita sendiri — sehingga script pihak ketiga berjalan seolah-olah milik
  // situs ini.
  //
  // Sekarang URL laporan dimuat langsung. Karena berasal dari origin pihak
  // ketiga, script di dalamnya terisolasi oleh browser. `allow-same-origin`
  // sengaja tidak disertakan agar isolasi itu tidak dilonggarkan.
  // `new URL()` melempar bila alamatnya tidak valid. Sebelumnya dipanggil
  // langsung di dalam JSX, sehingga satu baris data yang rusak di database
  // cukup untuk membuat seluruh halaman produk gagal dirender.
  let hostname = '';
  let isSafeUrl = false;
  try {
    const parsed = new URL(url);
    isSafeUrl = parsed.protocol === 'https:';
    hostname = parsed.hostname;
  } catch {
    isSafeUrl = false;
  }

  return (
    <>
        <button 
            onClick={() => setIsOpen(true)} 
            className="w-full mt-4 bg-white text-blue-600 font-bold hover:bg-blue-50 text-xs px-3 py-3 rounded-lg border border-blue-200 flex items-center justify-center gap-2 transition shadow-sm"
        >
            <BarChart3 size={16}/> Cek Laporan Trafik
        </button>

        {/* Modal ini dulu `<div className="fixed inset-0">` biasa: tanpa
            `role="dialog"`, tanpa Escape, dan tanpa jebakan fokus. Di sini
            akibatnya paling terasa dari semua modal di repo ini, karena isinya
            IFRAME pihak ketiga — begitu fokus masuk ke dalamnya, satu-satunya
            jalan keluar dengan papan tombol adalah menelusuri seluruh dokumen
            asing itu sampai habis. Escape tidak menutupnya, dan tombol ✕ ada di
            atas iframe sehingga tidak bisa dijangkau balik dengan Tab.

            `aksiKepala` dipakai untuk tautan "Buka di Tab Baru" supaya ia tetap
            di bilah judul dan tetap terjangkau SEBELUM fokus memasuki iframe. */}
        <Modal
            terbuka={isOpen}
            tutup={() => setIsOpen(false)}
            judul={<><BarChart3 size={18} className="text-blue-600"/> Laporan Trafik</>}
            lebar="max-w-5xl"
            aksiKepala={
                // `rel="noopener noreferrer"`: tanpa `noopener`, halaman pihak
                // ketiga yang dibuka menerima `window.opener` dan bisa
                // menavigasi tab ini ke alamat lain.
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mr-2 flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                >
                    <ExternalLink size={12}/> Buka di Tab Baru
                </a>
            }
        >
            <div className="relative h-[70vh] w-full bg-white">
                 {isSafeUrl ? (
                    <iframe
                       src={url}
                       className="w-full h-full border-none"
                       title="Laporan Trafik"
                       sandbox="allow-scripts allow-forms allow-popups"
                       referrerPolicy="no-referrer"
                    />
                 ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm p-6 text-center">
                       Laporan trafik tidak dapat ditampilkan karena alamatnya tidak valid.
                    </div>
                 )}

                 {/* Tampilan sementara selagi iframe dimuat */}
                 {isSafeUrl && (
                    <div className="absolute inset-0 flex items-center justify-center -z-10 text-gray-400 text-sm">
                       <div className="text-center">
                            <Loader2 className="animate-spin text-blue-500 mx-auto mb-2" size={32}/>
                            Memuat data dari <b className="text-blue-600">{hostname}</b>...
                       </div>
                    </div>
                 )}
            </div>
        </Modal>
    </>
  );
}