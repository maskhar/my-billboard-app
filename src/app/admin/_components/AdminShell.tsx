'use client';

// src/app/admin/_components/AdminShell.tsx
//
// Kerangka panel admin: sidebar tetap di layar lebar, drawer di layar sempit.
//
// KENAPA ADA
// ----------
// Sidebar admin sebelumnya `hidden md:flex` TANPA pengganti apa pun di bawah
// 768px — tidak ada tombol menu, tidak ada drawer, dan `LogoutButton` berada DI
// DALAM aside yang tersembunyi itu. Di ponsel, ADMIN, SUPER_ADMIN, dan OPERATOR
// hanya bisa berpindah halaman dengan mengetik URL: Transaksi, Inventory,
// Pengajuan Titik, Manage Users, Live Chat, Pengaturan, dan tombol keluar akun
// semuanya tidak terjangkau. (Layout CS punya rel ikon `w-16` yang selalu
// tampak, jadi CS tidak terkena.)
//
// KENAPA IKONNYA BERUPA TEKS
// --------------------------
// Daftar menu disusun di `layout.tsx`, sebuah Server Component. Komponen ikon
// lucide-react adalah fungsi, dan fungsi tidak bisa diserialisasi melewati batas
// server→client — mengirimnya sebagai prop membuat render gagal saat dijalankan,
// bukan saat `tsc`. Jadi yang menyeberang hanya KUNCI-nya, dan pemetaan
// kunci→komponen tinggal di berkas ini. `IkonAdmin` adalah union teks, sehingga
// kunci yang salah tulis tertangkap `tsc`, bukan muncul sebagai menu tanpa ikon.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Inbox,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageCircle,
  Settings,
  ShoppingCart,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import LogoutButton from './LogoutButton';

/** Kunci ikon yang boleh dipakai menu admin. */
export type IkonAdmin =
  | 'overview'
  | 'transaksi'
  | 'inventory'
  | 'kalender'
  | 'pengajuan'
  | 'users'
  | 'chat'
  | 'pengaturan';

const PETA_IKON: Record<IkonAdmin, LucideIcon> = {
  overview: LayoutDashboard,
  transaksi: ShoppingCart,
  inventory: Map,
  kalender: CalendarDays,
  pengajuan: Inbox,
  users: Users,
  chat: MessageCircle,
  pengaturan: Settings,
};

/** Satu baris menu, dalam bentuk yang bisa menyeberang dari Server Component. */
export type MenuAdmin = {
  name: string;
  ikon: IkonAdmin;
  link: string;
};

type Props = {
  children: React.ReactNode;
  menus: MenuAdmin[];
  nama: string | null;
  peran: string;
};

/** Isi navigasi, dipakai sidebar lebar DAN drawer sempit. */
function IsiNavigasi({
  menus,
  pathAktif,
  onPilih,
}: {
  menus: MenuAdmin[];
  pathAktif: string;
  onPilih?: () => void;
}) {
  return (
    <nav className="flex-1 p-4 space-y-2 mt-4">
      <div className="px-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
        Menu Utama
      </div>
      {menus.map((item) => {
        const Ikon = PETA_IKON[item.ikon];
        // Halaman yang sedang dibuka ditandai. Tanpa penanda, drawer di ponsel
        // hanyalah daftar tujuh tautan seragam dan pengguna kehilangan jejak
        // posisinya. `/admin` diperlakukan khusus: sebagai awalan ia cocok
        // dengan setiap halaman admin lainnya.
        const aktif =
          item.link === '/admin' ? pathAktif === '/admin' : pathAktif.startsWith(item.link);
        return (
          <Link
            key={item.link}
            href={item.link}
            onClick={onPilih}
            aria-current={aktif ? 'page' : undefined}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition group ${
              aktif
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Ikon
              size={20}
              aria-hidden="true"
              className={aktif ? 'text-red-500' : 'group-hover:text-red-500 transition-colors'}
            />
            <span className="font-medium text-sm">{item.name}</span>
          </Link>
        );
      })}
      <div className="pt-4 mt-4 border-t border-gray-800">
        <LogoutButton />
      </div>
    </nav>
  );
}

function KartuAkun({ nama, peran }: { nama: string | null; peran: string }) {
  return (
    <div className="p-4 border-t border-gray-800 bg-[#020617]">
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-red-600 to-orange-500 flex items-center justify-center font-bold shadow-lg">
          {nama?.charAt(0).toUpperCase()}
        </div>
        <div className="overflow-hidden">
          <p className="text-xs font-bold text-white truncate max-w-[120px]">{nama}</p>
          <p className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded w-fit mt-1">
            {peran}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminShell({ children, menus, nama, peran }: Props) {
  const pathAktif = usePathname() ?? '';
  const tombolRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Yang disimpan adalah HALAMAN tempat drawer dibuka, bukan sebuah boolean.
  //
  // Drawer harus tertutup begitu halaman berpindah: kalau tidak, ia tetap
  // menutupi halaman yang baru dimuat dan pengguna harus menutupnya sendiri
  // setiap kali menekan menu. Menutupnya lewat `useEffect` atas `pathAktif`
  // berarti memanggil setState di dalam effect — satu render tambahan di mana
  // drawer masih terbuka di atas halaman baru, dan `react-hooks/set-state-in-effect`
  // menolaknya. Dibandingkan di sini, keadaannya benar sejak render pertama.
  //
  // Menutup lewat tautan saja tidak cukup: navigasi juga datang dari tombol
  // kembali peramban dan dari redirect, yang tidak melewati `onClick` mana pun.
  const [dibukaPada, setDibukaPada] = useState<string | null>(null);
  const drawerTerbuka = dibukaPada === pathAktif;

  const tutupDrawer = () => setDibukaPada(null);

  // Escape menutup drawer, dan fokus dikembalikan ke tombol pemicunya.
  //
  // Tanpa pengembalian fokus, pengguna papan tunjuk yang menutup drawer
  // kehilangan posisinya: fokus tertinggal pada elemen yang baru saja
  // disembunyikan, dan Tab berikutnya mulai dari awal dokumen.
  useEffect(() => {
    if (!drawerTerbuka) return;

    function tekan(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDibukaPada(null);
        tombolRef.current?.focus();
      }
    }
    document.addEventListener('keydown', tekan);
    return () => document.removeEventListener('keydown', tekan);
  }, [drawerTerbuka]);

  // Fokus dipindah ke dalam drawer saat ia terbuka. Drawer yang muncul tanpa
  // memindahkan fokus tidak terjangkau pembaca layar sama sekali.
  useEffect(() => {
    if (drawerTerbuka) drawerRef.current?.focus();
  }, [drawerTerbuka]);

  return (
    <div className="flex min-h-screen bg-gray-100 font-sans text-slate-800">
      {/*
        LEWATI KE ISI, untuk seluruh panel admin.

        Sidebar di bawah ini memuat tujuh tautan menu ditambah kartu akun, dan
        ia berdiri sebelum isi halaman dalam urutan dokumen di SETIAP halaman
        admin. Tanpa tautan ini, operator yang bekerja dengan papan tombol
        menekan Tab melewati kedelapan kontrol itu lagi setiap kali berpindah
        halaman.

        Di bawah 768px sidebar-nya `hidden` (jadi tidak bisa di-Tab) dan
        drawer hanya dirender saat terbuka, tapi tautan ini tetap berguna: header
        di layar sempit masih memuat pemicu drawer dan tautan "Keluar ke Web
        Utama" sebelum isinya.
      */}
      <a href="#isi-admin" className="lewati-ke-isi">
        Lewati ke isi halaman
      </a>

      {/* Sidebar layar lebar. Tetap `hidden md:flex` — yang hilang dulu adalah
          penggantinya di bawah 768px, bukan sidebar ini. */}
      <aside className="w-64 bg-[#0F172A] text-white flex-shrink-0 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <span className="text-2xl font-bold tracking-tight text-white">
            Utero<span className="text-red-500">Admin</span>
          </span>
        </div>
        <IsiNavigasi menus={menus} pathAktif={pathAktif} />
        <KartuAkun nama={nama} peran={peran} />
      </aside>

      {/* Drawer layar sempit. Dirender hanya saat terbuka: menu yang selalu ada
          di DOM tetap bisa dijangkau Tab walau tak terlihat, dan pengguna papan
          tunjuk menemui tujuh tautan tersembunyi sebelum mencapai isi halaman. */}
      {drawerTerbuka && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Latar gelap. `aria-hidden` karena tombol tutup di dalam panel sudah
              menjadi jalan keluar yang terbaca pembaca layar. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={tutupDrawer}
            className="absolute inset-0 bg-black/60"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu panel admin"
            tabIndex={-1}
            // `outline-none` DIPERTAHANKAN di sini, dan ini satu-satunya
            // pemakaian tanpa pengganti yang memang benar di seluruh `src/`:
            // `tabIndex={-1}` membuat wadah ini tidak bisa dijangkau Tab, dan
            // fokusnya dipindah ke sini oleh kode (baris 189) semata-mata
            // supaya pembaca layar mulai membaca dari dalam dialog. Tidak ada
            // pengguna papan tombol yang "berhenti" di kotak ini, jadi kotak
            // fokus setebal layar di seputar drawer hanya akan membingungkan.
            // Tombol dan tautan DI DALAMNYA tetap memakai penanda bawaan.
            className="relative w-72 max-w-[85vw] bg-[#0F172A] text-white flex flex-col h-full shadow-2xl outline-none"
          >
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <span className="text-2xl font-bold tracking-tight text-white">
                Utero<span className="text-red-500">Admin</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setDibukaPada(null);
                  tombolRef.current?.focus();
                }}
                aria-label="Tutup menu"
                className="p-2 -mr-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <IsiNavigasi menus={menus} pathAktif={pathAktif} onPilih={tutupDrawer} />
            </div>
            <KartuAkun nama={nama} peran={peran} />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden h-screen">
        <header className="bg-white shadow-sm border-b h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-8 z-20">
          <div className="flex items-center gap-3">
            {/* Pemicu drawer. Hanya tampil di bawah 768px, tepat di tempat
                sidebar menghilang. */}
            <button
              ref={tombolRef}
              type="button"
              onClick={() => setDibukaPada(pathAktif)}
              aria-expanded={drawerTerbuka}
              aria-label="Buka menu panel admin"
              className="md:hidden p-2 -ml-2 rounded-lg text-gray-600 hover:text-red-600 hover:bg-gray-100 transition"
            >
              <Menu size={22} aria-hidden="true" />
            </button>
            <h1 className="font-bold text-gray-700 text-lg">Panel Kontrol</h1>
          </div>
          <Link
            href="/"
            className="text-xs font-bold text-gray-500 hover:text-red-600 flex items-center gap-2 border border-gray-200 px-3 md:px-4 py-2 rounded-full hover:bg-red-50 transition"
          >
            <LogOut size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Keluar ke Web Utama</span>
          </Link>
        </header>
        {/* `id`/`tabIndex` adalah sasaran tautan lewati di atas. `tabIndex={-1}`
            wajib: tanpa itu fokus papan tombol tertinggal di tautannya dan Tab
            berikutnya kembali ke menu pertama. Kotak fokusnya ditahan aturan
            `[tabindex='-1']:focus-visible` di `globals.css`. */}
        <div id="isi-admin" tabIndex={-1} className="flex-1 overflow-y-auto p-4 md:p-8 pb-32">
          {children}
        </div>
      </main>
    </div>
  );
}
