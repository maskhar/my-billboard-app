'use client';

// src/components/ui/Modal.tsx
//
// Kulit bersama untuk 11 overlay yang sebelumnya ditulis tangan di lima berkas:
// `TrafficReportModal.tsx` (1), `users/UserFormModal.tsx` (1),
// `SearchFilter.tsx` (1), `admin/OrderActions.tsx` (4), `BookingCard.tsx` (4).
//
// Laporan audit menyebut SATU di antaranya (`TrafficReportModal.tsx`). Sisanya
// ditemukan saat menyapu `fixed inset-0` di seluruh `src/` — cacatnya bukan
// satu berkas, tapi satu pola yang disalin ulang setiap kali modal baru
// dibutuhkan.
//
// APA YANG SALAH DENGAN YANG DITULIS TANGAN
// -----------------------------------------
// Semuanya berbentuk `<div className="fixed inset-0 ...">` — sebuah div biasa.
// Bagi pembaca layar div bukan dialog: tidak ada `role="dialog"`, tidak ada
// `aria-modal`, jadi isi halaman di belakangnya tetap dibacakan dan pengguna
// tidak diberi tahu bahwa ada lapisan yang terbuka. Akibat yang lebih keras:
//
//   · Tab keluar dari modal. Fokus berjalan terus ke tautan di halaman di
//     belakangnya — yang tidak terlihat karena tertutup latar gelap — sehingga
//     pengguna papan tombol menekan Enter pada sesuatu yang tidak ia lihat.
//   · Escape tidak menutup. Satu-satunya jalan keluar adalah menemukan tombol
//     ✕ dengan tetikus.
//   · Fokus tidak dikembalikan. Setelah modal ditutup, fokus kembali ke awal
//     dokumen, bukan ke tombol yang membukanya.
//   · Halaman di belakangnya tetap bisa di-scroll.
//
// Empat di antara modal itu adalah langkah pembayaran dan refund — yang
// nominalnya uang sungguhan.
//
// KENAPA `Dialog` HEADLESS UI, BUKAN JEBAKAN FOKUS SENDIRI
// -------------------------------------------------------
// `@headlessui/react` sudah menjadi dependensi dan sudah dipakai
// `src/components/ui/Konfirmasi.tsx`. `Dialog`-nya menangani keempat hal di
// atas — termasuk jebakan fokus yang benar, yang jauh lebih rumit daripada
// tampaknya (elemen `inert`, iframe, elemen yang muncul belakangan, urutan
// `tabindex`). Menulisnya sendiri dua belas kali, atau bahkan sekali, adalah
// menyalin ulang pekerjaan yang sudah ada di `node_modules`.
//
// `AdminShell.tsx` sengaja TIDAK diubah ke sini: drawer-nya bukan modal yang
// dipanggil dari alur, melainkan navigasi yang ikut menutup saat rute berubah,
// dan ia sudah punya `role="dialog"` + Escape + pengembalian fokus sendiri.

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';

type Varian = 'tengah' | 'bawah';

type Props = {
  terbuka: boolean;
  /**
   * Dipanggil oleh Escape, klik di luar panel, dan tombol ✕.
   *
   * Ketiganya SATU jalur. Sebelumnya hanya tombol ✕ yang ada, jadi setiap
   * pemanggil hanya perlu memikirkan satu cara menutup; sekarang ada tiga, dan
   * semuanya mendarat di sini. Pemanggil yang punya pekerjaan berjalan (unggah
   * berkas) harus memakai `bolehTutup` di bawah, bukan berharap pengguna tidak
   * menekan Escape.
   */
  tutup: () => void;
  /**
   * `false` menonaktifkan Escape dan klik-luar — tombol ✕ juga disembunyikan.
   *
   * Dipakai saat ada unggahan berjalan: menutup modal di tengah unggahan
   * membuang berkas yang sudah separuh terkirim tanpa memberi tahu, dan
   * pengguna tidak punya cara mengetahui apakah berkasnya masuk atau tidak.
   */
  bolehTutup?: boolean;
  /**
   * Judul dialog. WAJIB, dan bukan sekadar hiasan: `DialogTitle` menjadi
   * `aria-labelledby` dialognya, yaitu kalimat yang dibacakan pembaca layar
   * saat modal terbuka. Tanpa itu yang dibacakan hanya "dialog".
   */
  judul: React.ReactNode;
  /** Kelas Tailwind untuk lebar panel, mis. `max-w-sm`. */
  lebar?: string;
  /** Warna bilah judul, mengikuti nada tiap modal yang sudah ada. */
  kelasKepala?: string;
  /** `bawah` untuk lembar yang naik dari dasar layar (filter versi ponsel). */
  varian?: Varian;
  /** Kelas tambahan pada pembungkus terluar, mis. `md:hidden`. */
  kelasLuar?: string;
  /** Isi di sisi kanan bilah judul, sebelum tombol ✕. */
  aksiKepala?: React.ReactNode;
  children: React.ReactNode;
};

export default function Modal({
  terbuka,
  tutup,
  bolehTutup = true,
  judul,
  lebar = 'max-w-md',
  kelasKepala = 'bg-gray-50 text-gray-800',
  varian = 'tengah',
  kelasLuar = '',
  aksiKepala,
  children,
}: Props) {
  const dasar = varian === 'bawah';

  return (
    <Dialog
      open={terbuka}
      // `onClose` menerima Escape DAN klik di luar panel. Saat `bolehTutup`
      // `false`, keduanya menjadi tanpa-akibat — bukan dengan melepas
      // handler-nya, karena `Dialog` mewajibkan prop ini ada.
      onClose={() => {
        if (bolehTutup) tutup();
      }}
      className={`relative z-[9999] ${kelasLuar}`}
    >
      {/* `aria-hidden` pada latar: ia hanya lapisan warna. Tanpa penanda ini
          pembaca layar mengumumkan sebuah elemen kosong sebelum dialognya. */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
        aria-hidden="true"
      />

      <div
        className={`fixed inset-0 flex justify-center p-4 ${
          dasar ? 'items-end' : 'items-center'
        }`}
      >
        <DialogPanel
          className={`flex w-full ${lebar} max-h-[90vh] flex-col overflow-hidden bg-white shadow-2xl motion-safe:animate-in motion-safe:fade-in ${
            dasar
              ? 'rounded-t-3xl motion-safe:slide-in-from-bottom'
              : 'rounded-2xl motion-safe:zoom-in-95'
          }`}
        >
          <div
            className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 font-bold ${kelasKepala}`}
          >
            <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
              {judul}
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-2">
              {aksiKepala}
              {/* Disembunyikan, bukan dinonaktifkan, saat modal tidak boleh
                  ditutup: tombol mati yang tetap terlihat mengundang tekanan
                  berulang pada sesuatu yang tidak akan menjawab. */}
              {bolehTutup && (
                <button
                  type="button"
                  onClick={tutup}
                  // Namanya disebut karena isinya hanya ikon. Tanpa ini pembaca
                  // layar mengumumkannya sebagai "button" tanpa keterangan.
                  aria-label="Tutup"
                  className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-red-500 hover:text-white"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          {/* `overflow-y-auto` di sini, bukan di panel: bilah judulnya harus
              tetap terlihat saat isinya panjang. */}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
