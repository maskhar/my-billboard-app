// src/app/dashboard/settings/AccountSettingsForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { InputField } from '@/components/FormField';
import { pesanGalat } from '@/lib/pesan-galat';

// Halaman induk mengirim keempat kolom ini sebagai teks (`?? ''`), jadi tidak
// ada yang `null` di sini. Sebelumnya tipenya `Pick<User, ...>` yang menyatakan
// `name` dan `whatsapp` boleh `null` — pernyataan yang tidak benar dan
// memaksa `|| ''` di tiap pembacaan.
type PlainUser = {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
};

export default function AccountSettingsForm({ user }: { user: PlainUser }) {
    const [profileData, setProfileData] = useState({
        name: user.name,
        whatsapp: user.whatsapp,
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
            // userId diambil dari sesi server di dalam route, tidak dikirim dari client.
            const res = await fetch('/api/user/update-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData),
            });
            if (!res.ok) {
                const error = await res.json().catch(() => null);
                throw new Error(error?.message || 'Gagal memperbarui profil.');
            }
            alert('Profil berhasil diperbarui.');
            router.refresh();
        } catch (error) {
            alert(pesanGalat(error, 'Gagal memperbarui profil.'));
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
            // userId diambil dari sesi server di dalam route, tidak dikirim dari client.
            // confirmPassword hanya dipakai untuk validasi di sisi client.
            const res = await fetch('/api/user/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: passwordData.currentPassword,
                    newPassword: passwordData.newPassword,
                }),
            });
            if (!res.ok) {
                const error = await res.json().catch(() => null);
                throw new Error(error?.message || 'Gagal mengubah password.');
            }
            alert('Password berhasil diubah.');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            alert(pesanGalat(error, 'Gagal mengubah password.'));
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
                    {/*
                      `type="tel"`, bukan `type="number"`: kolom number membuang
                      tanda `+` sehingga nomor bentuk internasional tidak bisa
                      diketik sama sekali.

                      Wajib diisi karena gerbang pembayaran di
                      `sesi-pembayaran.ts` menolak pesanan tanpa nomor WhatsApp
                      yang sah. Dibiarkan opsional di sini, pengguna menyimpan
                      profil "berhasil" lalu ditolak saat membayar.
                    */}
                    <InputField
                        label="Nomor WhatsApp"
                        id="whatsapp"
                        type="tel"
                        inputMode="tel"
                        value={profileData.whatsapp}
                        onChange={handleProfileChange}
                        placeholder="08123456789"
                        required
                    />
                    <p className="text-xs text-gray-500 -mt-2">
                        Dipakai untuk konfirmasi pesanan dan pembayaran. Contoh: 08123456789.
                    </p>
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
