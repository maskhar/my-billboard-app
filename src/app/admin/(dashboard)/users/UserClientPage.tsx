// src/app/admin/(dashboard)/users/UserClientPage.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Wallet } from 'lucide-react';
import type { User, Booking } from '@prisma/client';
import UserFormModal from './UserFormModal';

const GOOGLE_ICON = "https://cdn.iconscout.com/icon/free/png-256/free-google-1772223-1507807.png";

type UserWithBookings = User & {
    bookings: Booking[];
};

export default function UserClientPage({ users }: { users: UserWithBookings[] }) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="space-y-6">
            <UserFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Manajemen Pengguna</h1>
                    <p className="text-gray-500 text-sm">Kelola pelanggan, hak akses, dan status akun.</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                    + Tambah User Baru
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4">User Info</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Metode Daftar</th>
                            <th className="px-6 py-4">Riwayat Order</th>
                            <th className="px-6 py-4">Total Spending</th>
                            <th className="px-6 py-4 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {users.map((user) => {
                            const totalSpent = user.bookings
                                .filter(b => b.status === 'ACTIVE' || b.status === 'REFUNDED')
                                .reduce((acc, curr) => acc + curr.totalPrice, 0);

                            return (
                                <tr key={user.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm relative overflow-hidden" 
                                                 style={{background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)'}}>
                                                {user.image ? (
                                                    <img src={user.image} className="w-full h-full object-cover"/>
                                                ) : (
                                                    <span>{user.name ? user.name.charAt(0).toUpperCase() : '?'}</span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-800">{user.name}</div>
                                                <div className="text-xs text-gray-500">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${
                                            user.role.includes('ADMIN') ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'
                                        }`}>
                                            {user.role.replace('_', ' ')}
                                        </span>
                                    </td>

                                    <td className="px-6 py-4">
                                         <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
                                             {user.authProvider === 'GOOGLE' ? (
                                                 <>
                                                    <img src={GOOGLE_ICON} width={16} height={16} alt="G"/> 
                                                    <span>Google</span>
                                                 </>
                                             ) : (
                                                 <>
                                                    <div className="w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center text-[8px] text-white">@</div>
                                                    <span>Email Manual</span>
                                                 </>
                                             )}
                                         </div>
                                         <div className="text-[10px] text-gray-400 mt-1">
                                             {new Date(user.createdAt).toLocaleDateString()}
                                         </div>
                                    </td>

                                    <td className="px-6 py-4">
                                        <span className="font-bold text-gray-700">{user.bookings.length}</span> <span className="text-xs text-gray-400">Trx</span>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1 text-green-700 font-bold">
                                            <Wallet size={14} className="opacity-50"/> Rp {totalSpent.toLocaleString('id-ID')}
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-center">
                                        <Link href={`/admin/users/${user.id}`} className="text-blue-600 hover:underline">
                                            <Pencil size={16} />
                                        </Link>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
