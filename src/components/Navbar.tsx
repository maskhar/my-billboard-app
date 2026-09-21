// src/components/Navbar.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, User, LogOut, ChevronDown, LayoutDashboard } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false); // State untuk Menu Mobile
  const [isProfileOpen, setIsProfileOpen] = useState(false); // State Dropdown User
  
  const { data: session, status } = useSession();
  
  const handleLogout = () => {
    signOut({ callbackUrl: '/login' }); 
  };

  const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'USER_AIDA'];
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
      case 'USER_AIDA':
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
              <Link href="/" className="text-sm font-medium text-gray-700 hover:text-utero transition">Home</Link>
              <Link href="/list" className="text-sm font-medium text-gray-700 hover:text-utero transition">List Billboard</Link>
              <Link href="/about" className="text-sm font-medium text-gray-700 hover:text-utero transition">Tentang Kami</Link>
          </div>

          {/* 3. USER AREA DESKTOP (Hidden di Mobile) */}
          <div className="hidden md:flex items-center space-x-4">
            {status === 'loading' ? (
                <div className="w-20 h-8 bg-gray-100 rounded animate-pulse"></div>
            ) : session ? (
                <div className="relative">
                    <button 
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
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
                             <Link href="/dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-utero">Dashboard Saya</Link>
                               <Link href="/dashboard/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-utero">Pengaturan Akun</Link>
                             {isAdmin && (
                                <Link href="/admin" className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50 hover:text-utero">
                                    <LayoutDashboard size={14}/> Admin Panel
                                </Link>
                             )}
                             <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                <LogOut size={14}/> Logout
                             </button>
                        </div>
                    )}
                </div>
            ) : (
                <Link href="/login" className="text-sm font-bold text-gray-600 hover:text-utero transition">Masuk / Daftar</Link>
            )}

            <button className="bg-utero text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-red-700 transition shadow-lg shadow-red-200">
               Sewakan Tempat
            </button>
          </div>

          {/* 4. HAMBURGER BUTTON (Hanya muncul di Mobile) */}
          <div className="flex md:hidden">
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="p-2 rounded-md text-gray-600 hover:text-utero hover:bg-gray-100 transition focus:outline-none"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
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
                        <Link href="/dashboard" className="block text-center w-full bg-white border border-gray-200 py-2 rounded-lg text-xs font-bold text-gray-700 mb-2">
                            Dashboard Saya
                        </Link>
                        {isAdmin && (
                            <Link href="/admin" className="block text-center w-full bg-gray-800 text-white py-2 rounded-lg text-xs font-bold mb-2">
                                Masuk Admin Panel
                            </Link>
                        )}
                        <button onClick={handleLogout} className="w-full text-center text-xs text-red-600 font-bold border border-red-100 py-2 rounded-lg bg-red-50">
                            Keluar
                        </button>
                    </div>
                ) : (
                    <Link href="/login" className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-800 font-bold py-3 rounded-xl mb-4">
                        <User size={18}/> Masuk / Daftar Akun
                    </Link>
                )}

                {/* Link Navigasi Biasa */}
                <Link href="/" className="block px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-utero">🏠 Home</Link>
                <Link href="/list" className="block px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-utero">📍 List Billboard</Link>
                <Link href="/about" className="block px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-utero">🏢 Tentang Kami</Link>
                
                {/* Tombol CTA dipindah kesini untuk mobile */}
                <div className="pt-4 border-t border-gray-100 mt-2">
                    <button className="w-full bg-utero text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-red-100">
                        + Sewakan Tempat Anda
                    </button>
                </div>
            </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;