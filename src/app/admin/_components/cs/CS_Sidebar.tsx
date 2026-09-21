'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, Users, BarChart3, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

const csMenus = [
  { name: "Dashboard", icon: LayoutDashboard, link: "/admin" },
  { name: "Inbox", icon: MessageSquare, link: "/admin/live-chat" },
  { name: "Contacts", icon: Users, link: "/admin/users" },
  { name: "Reporting", icon: BarChart3, link: "/admin/reporting" }, 
];

export default function CS_Sidebar({ user }: { user: any }) {
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
