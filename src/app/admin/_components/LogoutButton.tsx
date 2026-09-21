'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/admin/login' })}
      className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-red-900 hover:text-white rounded-xl transition group w-full"
    >
      <LogOut size={20} className="text-red-500 group-hover:text-white transition-colors"/>
      <span className="font-medium text-sm">Logout Akun</span>
    </button>
  );
}
