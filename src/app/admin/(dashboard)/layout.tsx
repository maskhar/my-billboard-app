// src/app/admin/layout.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

// [PEMBARUAN] Impor komponen-komponen layout
import LogoutButton from '../_components/LogoutButton';
import CS_Layout from "../_components/cs/CS_Layout"; // Layout Baru untuk CS
import { LayoutDashboard, Map, ShoppingCart, Users, Settings, LogOut, MessageCircle, ShieldAlert } from 'lucide-react';

// [OPSIONAL] Komponen untuk menjaga konsistensi
const AccessDenied = ({ session }: { session: any }) => (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50 font-sans p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center border border-gray-100 max-w-md">
            <ShieldAlert className="w-20 h-20 text-red-500 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-800">Akses Ditolak</h2>
            <div className="bg-red-50 text-red-600 text-sm font-semibold p-3 rounded-lg mt-4 border border-red-200">
                Role Akun: {session.user.role} (Tidak diizinkan)
            </div>
            <p className="text-gray-500 mt-4 text-sm leading-relaxed">
                Mohon maaf, akun Anda <b>{session.user.email}</b> tidak memiliki izin untuk mengakses Panel Admin ini.
            </p>
            <div className="flex flex-col gap-3 mt-8">
                <Link href="/dashboard" className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition shadow-lg">
                    Ke Dashboard User
                </Link>
                <Link href="/" className="w-full py-3 text-gray-500 font-bold hover:text-utero transition">
                    Kembali ke Home
                </Link>
            </div>
        </div>
    </div>
);

// [REFAKTOR] Layout Admin Standar
const StandardAdminLayout = ({ children, session, menus }: { children: React.ReactNode, session: any, menus: any[] }) => (
    <div className="flex min-h-screen bg-gray-100 font-sans text-slate-800">
        <aside className="w-64 bg-[#0F172A] text-white flex-shrink-0 hidden md:flex flex-col">
            <div className="p-6 border-b border-gray-800">
                <span className="text-2xl font-bold tracking-tight text-white">Utero<span className="text-red-500">Admin</span></span>
            </div>
            <nav className="flex-1 p-4 space-y-2 mt-4">
                <div className="px-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Menu Utama</div>
                {menus.map((item, idx) => (
                    <Link key={idx} href={item.link} className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl transition group">
                        <item.icon size={20} className="group-hover:text-red-500 transition-colors"/>
                        <span className="font-medium text-sm">{item.name}</span>
                    </Link>
                ))}
                <div className="pt-4 mt-4 border-t border-gray-800">
                    <LogoutButton />
                </div>
            </nav>
            <div className="p-4 border-t border-gray-800 bg-[#020617]">
                 <div className="flex items-center gap-3 px-2 py-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-red-600 to-orange-500 flex items-center justify-center font-bold shadow-lg">
                        {session.user.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-xs font-bold text-white truncate max-w-[120px]">{session.user.name}</p>
                        <p className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded w-fit mt-1">{session.user.role}</p>
                    </div>
                </div>
            </div>
        </aside>
        <main className="flex-1 flex flex-col overflow-hidden h-screen">
            <header className="bg-white shadow-sm border-b h-16 flex-shrink-0 flex items-center justify-between px-8 z-20">
                <h1 className="font-bold text-gray-700 text-lg">Panel Kontrol</h1>
                <Link href="/" className="text-xs font-bold text-gray-500 hover:text-red-600 flex items-center gap-2 border border-gray-200 px-4 py-2 rounded-full hover:bg-red-50 transition">
                    <LogOut size={14}/> Keluar ke Web Utama
                </Link>
            </header>
            <div className="flex-1 overflow-y-auto p-8 pb-32">
                {children}
            </div>
        </main>
    </div>
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/admin/login');
  }

    const userRole = session.user.role;
  const allowedRoles = ['ADMIN', 'SUPER_ADMIN'];

  if (!userRole || !allowedRoles.includes(userRole)) {
      return <AccessDenied session={session} />;
  }

  // === LOGIKA PERCABANGAN LAYOUT ===
  if (userRole === 'CS') {
      return <CS_Layout session={session}>{children}</CS_Layout>;
  }
  
  // --- Untuk Role Selain CS ---
  let menus = [
      { name: "Overview", icon: LayoutDashboard, link: "/admin" },
      { name: "Transaksi", icon: ShoppingCart, link: "/admin/orders" },
      { name: "Inventory Billboard", icon: Map, link: "/admin/billboards" },
      { name: "Manage Users", icon: Users, link: "/admin/users" },
      { name: "Live Chat CS", icon: MessageCircle, link: "/admin/live-chat" },
  ];

  if (userRole === 'SUPER_ADMIN') {
      menus.push({ name: "Pengaturan Website", icon: Settings, link: "/admin/settings" });
  }

  return <StandardAdminLayout session={session} menus={menus}>{children}</StandardAdminLayout>;
}

