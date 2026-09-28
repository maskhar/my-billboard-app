'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, Users, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

// Setiap tautan di sini WAJIB punya halamannya.
//
// Menu "Reporting" dulu menaut ke `/admin/reporting`, dan rute itu tidak ada:
// tidak ada `src/app/admin/(dashboard)/reporting/`, dan tidak ada satu pun
// berkas lain di `src/` yang menyebutnya. Satu dari empat ikon di rel sidebar
// CS karena itu adalah 404 — bukan halaman kosong yang bisa dimaklumi, tapi
// layar galat Next yang membuat CS mengira panelnya rusak. Ia juga tidak
// pernah menjadi tugas yang tertunda: tidak ada TODO, tidak ada rancangan
// halamannya.
//
// Dibuang, bukan ditambahi halaman kosong. Menu yang tidak menuju ke mana pun
// lebih buruk daripada menu yang tidak ada, dan laporan untuk CS belum
// diputuskan bentuknya. Kalau nanti dibuat, barisnya kembali bersama
// halamannya — bukan sebelumnya.
const csMenus = [
  { name: "Dashboard", icon: LayoutDashboard, link: "/admin" },
  { name: "Inbox", icon: MessageSquare, link: "/admin/live-chat" },
  { name: "Contacts", icon: Users, link: "/admin/users" },
];

/**
 * Yang dibaca sidebar dari sesi: huruf pertama nama, untuk avatar dan tooltip.
 *
 * Hanya satu kolom, dan itulah alasannya ditulis begini alih-alih `any`. Nama
 * kolom yang salah tulis di sini tidak melempar apa pun — pembacaannya sudah
 * `user?.name`, jadi hasilnya hanya avatar "C" yang terlihat wajar. Cacat
 * seperti itu tidak pernah dilaporkan siapa pun.
 */
export type PenggunaSidebar = {
  name?: string | null;
};

export default function CS_Sidebar({ user }: { user: PenggunaSidebar }) {
  const pathname = usePathname();

  return (
    <aside className="w-16 bg-[#F8F9FA] border-r border-gray-200 flex flex-col items-center py-4 flex-shrink-0 z-50 h-screen sticky top-0">
      {/* Logo Kecil */}
      <div className="mb-6 w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md">
        UB
      </div>

      <nav className="flex-1 space-y-2 w-full px-2">
        {csMenus.map((item, idx) => {
          const isActive = pathname === item.link;
          return (
            <Link 
                key={idx} 
                href={item.link} 
                className={`flex flex-col items-center justify-center w-full aspect-square rounded-lg transition-all group relative
                    ${isActive ? 'bg-white text-green-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}
                `}
                title={item.name}
            >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                {/* Tooltip Hover */}
                <span className="absolute left-14 bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                    {item.name}
                </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 w-full px-2">
         {/* Logout Button */}
         <button 
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="flex flex-col items-center justify-center w-full aspect-square text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition"
            title="Logout"
         >
            <LogOut size={20} />
         </button>
         
         {/* User Avatar */}
         <div className="w-full flex justify-center py-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold border border-blue-200 cursor-help" title={`Logged in as ${user?.name || 'CS'}`}>
                {user?.name?.charAt(0).toUpperCase() || 'C'}
            </div>
         </div>
      </div>
    </aside>
  );
}
