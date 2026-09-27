// src/components/admin/StatusChanger.tsx
'use client';

// Pengubah cepat status billboard dari tabel admin.
//
// Lima pilihan di menu ini dulu ditulis sebagai `<a href="#">` dengan
// `e.preventDefault()`. Tiga akibatnya nyata:
//
//   1. Bagi teknologi bantu itu TAUTAN, bukan tombol. Pembaca layar
//      mengumumkannya sebagai "link" dan menyebutkan tujuannya — `#`, alias
//      halaman ini sendiri. Operator yang memakai pembaca layar tidak diberi
//      tahu bahwa mengkliknya MENGUBAH DATA.
//   2. `href="#"` tetap tujuan navigasi. Klik tengah atau Ctrl+klik membuka tab
//      baru dan tidak menjalankan apa pun; dan bila `preventDefault` sempat
//      gagal, halaman melompat ke atas di tengah penyimpanan.
//   3. Tanpa `type="button"` dan tanpa peran yang benar, Enter/Space tidak
//      berperilaku seragam antar-peramban.
//
// Semuanya kini `<button type="button">`. Perubahan lain di berkas ini yang
// datang dari pembacaan yang sama dicatat di tempatnya masing-masing.

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

interface Props {
  billboardId: string;
  currentStatus: string;
  currentPublishStatus: string;
}

export default function StatusChanger({ billboardId, currentStatus, currentPublishStatus }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Efek untuk menutup dropdown saat klik di luar area
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    // Escape menutup menu. Tanpa ini menu yang dibuka lewat papan ketik hanya
    // bisa ditutup dengan mengklik di luarnya — jalan keluar yang tidak ada
    // bagi orang yang tidak memakai tetikus.
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [wrapperRef]);

  const handleStatusChange = async (type: 'status' | 'publishStatus', value: string) => {
    // Menyetel ulang nilai yang sudah berlaku tidak dikirim ke server. Ia
    // menulis baris yang sama, memicu `router.refresh()`, dan menyalakan
    // hamparan loading atas perubahan yang tidak terjadi.
    const berlaku = type === 'status' ? currentStatus : currentPublishStatus || 'DRAFT';
    if (berlaku === value) {
      setIsOpen(false);
      return;
    }

    // Kunci in-flight. Menu memang tertutup saat klik pertama, tapi tanpa ini
    // pemanggil lain masih bisa menumpuk dua permintaan atas baris yang sama.
    if (loading) return;

    setLoading(true);
    setIsOpen(false);

    try {
      // Dialihkan dari /api/proxy (yang tidak punya autentikasi sama sekali)
      // ke route admin yang memverifikasi sesi dan role.
      const body = { id: billboardId, [type]: value };
      const res = await fetch('/api/admin/billboards/quick-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // `await res.json()` dulu dipanggil tanpa penangkap di jalur galat.
      // Balasan 500 berbadan HTML membuatnya melempar, dan lemparannya
      // mendarat di `catch` di bawah yang mencetak "Terjadi kesalahan pada
      // server." — pesan yang menghapus keterangan asli dari server.
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.message || `Gagal mengubah status (${res.status}).`);
      }

      router.refresh();
    } catch (error: any) {
      alert(`Gagal mengubah status: ${error?.message || 'galat tidak diketahui'}`);
    } finally {
      // `setTimeout(..., 500)` dulu menahan hamparan loading setengah detik
      // SETELAH pekerjaan selesai — jeda kosmetik yang, bila komponen sudah
      // dilepas (baris tabelnya hilang setelah refresh), menyetel state pada
      // komponen yang tidak ada lagi.
      setLoading(false);
    }
  };

  // Satu baris menu. Sebelumnya kelima pilihan ditulis lima kali dengan kelas
  // yang sama disalin ulang, dan tidak satu pun menandai nilai yang sedang
  // berlaku: operator melihat lima baris identik dan harus menebak posisi
  // billboard ini sekarang dari badge di belakang menu yang sedang tertutupi.
  const Pilihan = ({
    type,
    value,
    label,
  }: {
    type: 'status' | 'publishStatus';
    value: string;
    label: string;
  }) => {
    const aktif = (type === 'status' ? currentStatus : currentPublishStatus || 'DRAFT') === value;
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => handleStatusChange(type, value)}
        aria-current={aktif ? 'true' : undefined}
        disabled={aktif}
        className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent ${
          aktif ? 'font-semibold text-gray-900' : 'text-gray-700'
        }`}
      >
        <span>{label}</span>
        {/* Penanda visual PLUS teks tersembunyi: ikon centang saja tidak
            terbaca pembaca layar, dan `aria-current` tidak diumumkan seragam
            oleh semua kombinasi pembaca layar/peramban. */}
        {aktif && (
          <>
            <Check size={14} className="text-utero" aria-hidden="true" />
            <span className="sr-only">(sedang berlaku)</span>
          </>
        )}
      </button>
    );
  };

  const getPublishStatusColor = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return 'bg-blue-100 text-blue-700';
      case 'ARCHIVED': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className='flex flex-col items-start gap-1 cursor-pointer w-full p-1 rounded-md hover:bg-gray-50 transition-colors'
        disabled={loading}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {/* Dua badge di bawah hanya berisi nilai enum mentah. Tanpa keterangan
            ini pembaca layar mengumumkan tombolnya sebagai "Available DRAFT" —
            dua kata tanpa petunjuk bahwa ini kontrol yang mengubah keduanya. */}
        <span className="sr-only">Ubah status billboard. Ketersediaan sekarang {currentStatus}, publikasi {currentPublishStatus || 'DRAFT'}.</span>
        <span aria-hidden="true" className={`text-[10px] px-2 py-1 rounded font-bold uppercase inline-block ${currentStatus === 'Available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {currentStatus}
        </span>
        <span aria-hidden="true" className={`text-[10px] px-2 py-1 rounded font-bold uppercase inline-block ${getPublishStatusColor(currentPublishStatus)}`}>
          {currentPublishStatus || 'DRAFT'}
        </span>
      </button>

      {isOpen && (
        <div
          className="origin-top-left absolute left-0 mt-1 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20 focus:outline-none"
          role="menu" aria-orientation="vertical"
        >
          <div className="py-1" role="none">
            <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Ketersediaan</p>
            <Pilihan type="status" value="Available" label="Available" />
            <Pilihan type="status" value="Booked" label="Booked" />

            <div className='border-t my-1'></div>

            <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Publikasi</p>
            <Pilihan type="publishStatus" value="PUBLISHED" label="Published" />
            <Pilihan type="publishStatus" value="DRAFT" label="Draft" />
            <Pilihan type="publishStatus" value="ARCHIVED" label="Archived" />
          </div>
        </div>
      )}

      {loading && <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center rounded-lg"><Loader2 className="animate-spin text-utero" /></div>}
    </div>
  );
}
