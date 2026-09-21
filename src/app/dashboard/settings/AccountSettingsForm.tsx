// src/app/dashboard/settings/AccountSettingsForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { User } from '@prisma/client';

type PlainUser = Pick<User, 'id' | 'name' | 'whatsapp' | 'email'>;

const InputField = ({ label, id, value, onChange, ...props }: any) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={props.type || "text"}
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        {...props}
      />
    </div>
  );

export default function AccountSettingsForm({ user }: { user: PlainUser }) {
    const [profileData, setProfileData] = useState({
        name: user.name || '',
        whatsapp: user.whatsapp || '',
    });
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [loading, setLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const router = useRouter();

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setProfileData({ ...profileData, [e.target.name]: e.target.value });
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPasswordData({ ...passwordData, [e.target.name]: e.target.value });
    };

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            const res = await fetch(`${apiUrl}/api/users/${user.id}/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || 'Gagal memperbarui profil.');
            }
            alert('Profil berhasil diperbarui!');
            router.refresh();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            alert('Password baru dan konfirmasi tidak cocok.');
            return;
        }
        setPasswordLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            const res = await fetch(`${apiUrl}/api/users/${user.id}/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(passwordData),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || 'Gagal mengubah password.');
            }
            alert('Password berhasil diubah!');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <div className="space-y-10">
            {/* Form Profil */}
            <div className="bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="text-lg font-semibold mb-4">Informasi Personal</h2>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                    <InputField label="Nama Lengkap" id="name" value={profileData.name} onChange={handleProfileChange} required />
                    <InputField label="Nomor WhatsApp" id="whatsapp" value={profileData.whatsapp} onChange={handleProfileChange} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <p className="text-sm text-gray-500 mt-1">{user.email} (tidak dapat diubah)</p>
                    </div>
                    <div className="text-right">
                        <button type="submit" disabled={loading} className="w-40 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400">
                            {loading ? <Loader2 className="animate-spin" /> : 'Simpan Perubahan'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Form Password */}
            <div className="bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="text-lg font-semibold mb-4">Ubah Password</h2>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <InputField label="Password Saat Ini" id="currentPassword" type="password" value={passwordData.currentPassword} onChange={handlePasswordChange} required />
                    <InputField label="Password Baru" id="newPassword" type="password" value={passwordData.newPassword} onChange={handlePasswordChange} required />
                    <InputField label="Konfirmasi Password Baru" id="confirmPassword" type="password" value={passwordData.confirmPassword} onChange={handlePasswordChange} required />
                    <div className="text-right">
                        <button type="submit" disabled={passwordLoading} className="w-40 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-black disabled:bg-gray-400">
                            {passwordLoading ? <Loader2 className="animate-spin" /> : 'Ubah Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
