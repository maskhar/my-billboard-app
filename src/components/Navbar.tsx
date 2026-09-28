// src/components/Navbar.tsx
'use client';

// Navigasi publik.
//
// Empat kontrol di sini tidak menuju ke mana pun, dan ketiadaannya baru
// terlihat setelah diklik:
//
//   1. `/list` dan `/about` — kedua rute ini TIDAK ADA di `src/app/`. Keduanya
//      membalas 404. `/list` juga tidak perlu ada: halaman depan sudah berupa
//      peta + pencarian seluruh billboard yang PUBLISHED, jadi "List Billboard"
//      dan "Home" menunjuk hal yang sama. Tautan `/list` dibuang dan "Home"
//      diberi nama yang menjelaskan isinya.
//
//      `/about` SUDAH ADA sekarang (`src/app/about/page.tsx`), jadi tautannya
//      dipasang kembali di menu desktop dan mobile — dalam commit yang sama
//      dengan halamannya, sesuai urutan yang dituntut catatan di bawah.
//      `/list` tetap tidak dipasang: alasannya tidak berubah.
//   2. Dua tombol "Sewakan Tempat" (desktop dan mobile) tidak punya `onClick`,
//      tidak punya `href`, dan tidak ada satu pun alur pendaftaran pemilik
//      lahan di aplikasi ini. Tombol yang tidak melakukan apa pun lebih buruk
//      daripada tidak ada tombolnya: pemilik lahan mengkliknya, tidak terjadi
//      apa-apa, dan ia menyimpulkan situsnya rusak lalu pergi.
//
//      Alurnya SUDAH ADA sekarang: halaman `src/app/sewakan-tempat/page.tsx`,
//      penerima `src/app/api/sewakan-tempat/route.ts`, dan tabel
//      `PengajuanTitik` yang dibaca admin di `/admin/pengajuan`. Karena itu
//      tombolnya dipasang kembali di menu desktop dan mobile — dalam commit
//      yang sama dengan halamannya, urutan yang sama dengan `/about`.
//
// Keempatnya dibuang, bukan ditambal. Menambahkan halaman `/about` dan alur
// "Sewakan Tempat" adalah fitur, dan fitur tidak boleh diselipkan lewat tautan
// yang sudah dipasang sebelum halamannya ditulis. Dua-duanya kini ada, jadi
// keduanya tertaut; `/list` tetap tidak dipasang karena alasannya tidak
// berubah.

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X, User, LogOut, ChevronDown, LayoutDashboard } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false); // State untuk Menu Mobile
  const [isProfileOpen, setIsProfileOpen] = useState(false); // State Dropdown User
  
  const { data: session, status } = useSession();
  
  const profilRef = useRef<HTMLDivElement>(null);

  // Dropdown profil tidak punya cara menutup diri selain mengklik pemicunya
  // lagi. Bila pengguna mengklik di tempat lain atau menekan Escape, ia tetap
  // menggantung di atas halaman — dan navbar ini ber-`z-[9999]`, jadi menu yang
  // menggantung menutupi apa pun yang ada di bawahnya.
  useEffect(() => {
    function klikLuar(event: MouseEvent) {
      if (profilRef.current && !profilRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    function tekanEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', klikLuar);
    document.addEventListener('keydown', tekanEscape);
    return () => {
      document.removeEventListener('mousedown', klikLuar);
      document.removeEventListener('keydown', tekanEscape);
    };
  }, []);

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  // 'USER_AIDA' dihapus: tidak pernah ada satu pun baris di database dengan
  // role itu, dan tidak ada kode yang menuliskannya. CS ditambahkan — ia
  // memang punya halaman sendiri di /admin dan sebelumnya tidak melihat
  // tautan menuju ke sana.
  const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'CS'];
  const isAdmin = session?.user?.role && adminRoles.includes(session.user.role);

  const getRoleClass = (role: string | undefined | null) => {
    if (!role) return 'bg-gray-200 text-gray-600';
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-red-100 text-red-800';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-800';
      case 'OPERATOR':
        return 'bg-green-100 text-green-800';
      case 'CS':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-200 text-gray-600';
    }
  };

  return (
    // Z-INDEX SUPER TINGGI (9999) Agar selalu di atas peta & search bar
    <nav className="fixed top-0 w-full z-[9999] bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* 1. LOGO (Ukuran responsif) */}
          <Link href="/" className="flex-shrink-0 cursor-pointer flex items-center gap-1">
            {/* Di HP text-xl, di Desktop text-2xl */}
            <span className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
                Utero<span className="text-utero">Cloud</span>
            </span>
          </Link>

          {/* 2. MENU DESKTOP (Hanya muncul di layar MD ke atas) */}
          <div className="hidden md:flex items-center space-x-8">
              <Link href="/" className="text-sm font-medium text-gray-700 hover:text-utero transition">Cari Billboard</Link>
              <Link href="/about" className="text-sm font-medium text-gray-700 hover:text-utero transition">Tentang Kami</Link>
              {session && (
                <Link href="/dashboard" className="text-sm font-medium text-gray-700 hover:text-utero transition">Pesanan Saya</Link>
              )}
          </div>

          {/* 3. USER AREA DESKTOP (Hidden di Mobile) */}
          <div className="hidden md:flex items-center space-x-4">
            {/* Tombol pemilik lahan. Ditaruh di sini, bukan di kelompok menu di
                atas, karena tujuannya berbeda: menu di atas untuk pengiklan yang
                mencari billboard, tombol ini untuk orang yang menawarkan
                lahannya. Tampil baik ada sesi maupun tidak — pemilik lahan tidak
                perlu akun untuk mengajukan, dan pengiklan yang sudah masuk pun
                bisa punya lahan. */}
            <Link
              href="/sewakan-tempat"
              className="text-sm font-bold text-utero border border-utero/30 px-4 py-2 rounded-lg hover:bg-utero/5 transition"
            >
              Sewakan Tempat
            </Link>
            {status === 'loading' ? (
                <div className="w-20 h-8 bg-gray-100 rounded animate-pulse"></div>
            ) : session ? (
                <div className="relative" ref={profilRef}>
                    <button
                        type="button"
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        aria-haspopup="menu"
                        aria-expanded={isProfileOpen}
                        className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-utero px-3 py-2 rounded-full border border-gray-200 hover:bg-gray-50 transition"
                    >
                       <User size={16} />
                       <span className='capitalize max-w-[100px] truncate'>{session.user?.name?.split(" ")[0]}</span>
                       <ChevronDown size={14} />
                    </button>

                    {/* DROPDOWN DESKTOP */}
                    {isProfileOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl py-2 border border-gray-100 ring-1 ring-black ring-opacity-5">
                                                          <div className="px-4 py-3 border-b border-gray-50 mb-1 bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Logged as</p>
                                <p className="text-xs font-bold text-gray-800 truncate">{session.user?.email}</p>
                                {session?.user?.role && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1.5 ${getRoleClass(session.user.role)}`}>{session.user.role}</span>}
                             </div>
                             {/* Dropdown ini dulu tetap terbuka setelah tautannya
                                 diklik — melayang di atas halaman tujuan sampai
                                 diklik dua kali. */}
                             <Link href="/dashboard" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-utero">Dashboard Saya</Link>
                               <Link href="/dashboard/settings" onClick={() => setIsProfileOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-utero">Pengaturan Akun</Link>
                             {isAdmin && (
                                <Link href="/admin" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50 hover:text-utero">
                                    <LayoutDashboard size={14}/> Admin Panel
                                </Link>
                             )}
                             <button type="button" onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                <LogOut size={14}/> Logout
                             </button>
                        </div>
                    )}
                </div>
            ) : (
                <Link href="/login" className="text-sm font-bold text-gray-600 hover:text-utero transition">Masuk / Daftar</Link>
            )}
          </div>

          {/* 4. HAMBURGER BUTTON (Hanya muncul di Mobile) */}
          <div className="flex md:hidden">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Tutup menu' : 'Buka menu'}
                // `focus:outline-none` sebelumnya berdiri sendiri: penanda
                // fokus bawaan dibuang tanpa pengganti, dan tombol ini adalah
                // satu-satunya jalan ke seluruh menu di layar ponsel.
                className="p-2 rounded-md text-gray-600 hover:text-utero hover:bg-gray-100 transition outline-none focus:ring-2 focus:ring-utero"
            >
              {/* Ikon saja tidak punya nama yang terbaca: pembaca layar
                  mengumumkannya sebagai "tombol" tanpa keterangan apa pun. */}
              {isOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
      
      {/* 5. MOBILE MENU CONTENT (Slide Down) */}
      {/* Kita pastikan ini muncul di bawah navbar */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-xl absolute w-full left-0 z-50">
            <div className="px-4 pt-4 pb-6 space-y-2">
                
                {/* User Info di Mobile */}
                {session ? (
                    <div className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-100">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-utero/10 text-utero rounded-full flex items-center justify-center font-bold">
                                <User size={20}/>
                            </div>
                                                        <div className='overflow-hidden'>
                                <p className="font-bold text-gray-800 text-sm truncate">{session.user?.name}</p>
                                <p className="text-xs text-gray-500 truncate">{session.user?.email}</p>
                                {session?.user?.role && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${getRoleClass(session.user.role)}`}>{session.user.role}</span>}
                            </div>
                        </div>
                        {/* `setIsOpen(false)` pada setiap tautan: tanpa ini menu
                            mobile tetap terbuka menutupi halaman tujuan setelah
                            navigasi, dan pengguna menyimpulkan kliknya tidak
                            berfungsi lalu mengkliknya lagi. */}
                        <Link href="/dashboard" onClick={() => setIsOpen(false)} className="block text-center w-full bg-white border border-gray-200 py-2 rounded-lg text-xs font-bold text-gray-700 mb-2">
                            Dashboard Saya
                        </Link>
                        <Link href="/dashboard/settings" onClick={() => setIsOpen(false)} className="block text-center w-full bg-white border border-gray-200 py-2 rounded-lg text-xs font-bold text-gray-700 mb-2">
                            Pengaturan Akun
                        </Link>
                        {isAdmin && (
                            <Link href="/admin" onClick={() => setIsOpen(false)} className="block text-center w-full bg-gray-800 text-white py-2 rounded-lg text-xs font-bold mb-2">
                                Masuk Admin Panel
                            </Link>
                        )}
                        <button onClick={handleLogout} className="w-full text-center text-xs text-red-600 font-bold border border-red-100 py-2 rounded-lg bg-red-50">
                            Keluar
                        </button>
                    </div>
                ) : (
                    <Link href="/login" onClick={() => setIsOpen(false)} className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-800 font-bold py-3 rounded-xl mb-4">
                        <User size={18}/> Masuk / Daftar Akun
                    </Link>
                )}

                {/* Link Navigasi Biasa */}
                <Link href="/" onClick={() => setIsOpen(false)} className="block px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-utero">📍 Cari Billboard</Link>
                <Link href="/about" onClick={() => setIsOpen(false)} className="block px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-utero">ℹ️ Tentang Kami</Link>
                {/* `onClick={() => setIsOpen(false)}` sama seperti tautan mobile
                    lainnya: tanpa itu menu tetap terbuka menutupi halaman
                    tujuan. */}
                <Link href="/sewakan-tempat" onClick={() => setIsOpen(false)} className="block px-3 py-3 rounded-lg text-base font-bold text-utero border border-utero/30 mt-3 text-center hover:bg-utero/5">
                    Sewakan Tempat Anda
                </Link>
            </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;