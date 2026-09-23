'use client';

import { useState } from 'react';
import type { User } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const InputField = ({ label, id, value, onChange, ...props }: any) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
    <input
      type={props.type || "text"}
      id={id}
      value={value}
      onChange={onChange}
      className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
      {...props}
    />
  </div>
);

const SelectField = ({ label, id, value, onChange, children }: any) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
      >
        {children}
      </select>
    </div>
  );

export default function UserProfileForm({ user }: { user: User & { identitasTersamar?: boolean } }) {
  // KTP/NPWP hanya dikirim utuh kepada SUPER_ADMIN. Untuk peran lain,
  // halaman induk mengirim bentuk tersamar dan menyalakan penanda ini.
  // Tanpa memeriksanya, penyimpanan biasa akan menulis balik string
  // bertitik-titik itu ke database dan menghapus nomor aslinya.
  const identitasTersamar = !!user.identitasTersamar;

  const [businessDetails, setBusinessDetails] = useState({
    name: user.name || '',
    companyName: user.companyName || '',
    ktp: user.ktp || '',
    npwp: user.npwp || '',
    ktpAddress: user.ktpAddress || '',
    officeAddress: user.officeAddress || '',
  });

  // Kolom `newPassword`/`confirmPassword` dihapus. Tidak ada satu pun endpoint
  // yang menerima admin menyetel password orang lain — `update-account`
  // menolak tegas body yang memuat `password` (400), jadi dua kotak isian itu
  // membuat SELURUH form ini selalu gagal, bahkan saat admin hanya mengubah
  // nomor telepon. Pengguna mengganti passwordnya sendiri lewat
  // `/api/user/change-password`.
  const [userAccount, setUserAccount] = useState({
    username: user.username || '',
    email: user.email || '',
    whatsapp: user.whatsapp || '',
    role: user.role || 'USER',
  });

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Bila nilai yang tampil adalah samaran, kolomnya TIDAK ikut dikirim.
      // Mengirimnya berarti menimpa nomor asli dengan titik-titik.
      const { ktp, npwp, ...sisanya } = businessDetails;
      const muatan = identitasTersamar
        ? { userId: user.id, ...sisanya }
        : { userId: user.id, ...businessDetails };

      const res = await fetch('/api/admin/users/update-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(muatan),
      });
      if (!res.ok) throw new Error('Server error');
      alert('Business details updated successfully!');
      router.refresh();
    } catch (error) {
      alert('Failed to update business details.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Role TIDAK ikut dikirim ke sini. `update-account` sengaja menolak body
      // yang memuat `role` (400) karena naik-turun pangkat punya aturan
      // sendiri: hanya SUPER_ADMIN boleh mengangkat SUPER_ADMIN, dan ADMIN
      // tidak boleh menurunkan SUPER_ADMIN. Aturan itu hidup di
      // `/api/admin/users/update-role`, jadi perubahan role dikirim ke sana.
      const res = await fetch('/api/admin/users/update-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          username: userAccount.username,
          whatsapp: userAccount.whatsapp,
        }),
      });
      if (!res.ok) {
        const hasil = await res.json().catch(() => null);
        throw new Error(hasil?.message || 'Server error');
      }

      // Kirim role hanya bila memang diubah, supaya penyimpanan biasa tidak
      // menyentuh endpoint yang lebih sensitif ini sama sekali.
      if (userAccount.role !== user.role) {
        const resRole = await fetch('/api/admin/users/update-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, newRole: userAccount.role }),
        });
        if (!resRole.ok) {
          const hasil = await resRole.json().catch(() => null);
          throw new Error(hasil?.message || 'Gagal mengubah role');
        }
      }

      alert('Account details updated successfully!');
      router.refresh();
    } catch (error: any) {
      alert(error?.message || 'Failed to update account details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Business Details Form */}
      <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border">
        <h2 className="text-lg font-semibold mb-4">Business Details</h2>
        <form onSubmit={handleBusinessSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField label="Full Name" id="name" value={businessDetails.name} onChange={(e: any) => setBusinessDetails({ ...businessDetails, name: e.target.value })} />
          <InputField label="Company Name" id="companyName" value={businessDetails.companyName} onChange={(e: any) => setBusinessDetails({ ...businessDetails, companyName: e.target.value })} />
          <InputField label="KTP" id="ktp" value={businessDetails.ktp} onChange={(e: any) => setBusinessDetails({ ...businessDetails, ktp: e.target.value })} disabled={identitasTersamar} />
          <InputField label="NPWP" id="npwp" value={businessDetails.npwp} onChange={(e: any) => setBusinessDetails({ ...businessDetails, npwp: e.target.value })} disabled={identitasTersamar} />
          {identitasTersamar && (
            <p className="md:col-span-2 text-xs text-gray-500">
              KTP dan NPWP disamarkan. Hanya Super Admin yang bisa melihat dan mengubah nomor lengkapnya.
            </p>
          )}
          <div className="md:col-span-2">
            <InputField label="KTP Address" id="ktpAddress" value={businessDetails.ktpAddress} onChange={(e: any) => setBusinessDetails({ ...businessDetails, ktpAddress: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <InputField label="Office Address" id="officeAddress" value={businessDetails.officeAddress} onChange={(e: any) => setBusinessDetails({ ...businessDetails, officeAddress: e.target.value })} />
          </div>
          <div className="md:col-span-2 text-right">
            <button type="submit" disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-300">
              {loading ? <Loader2 className="animate-spin" /> : 'Save Business Details'}
            </button>
          </div>
        </form>
      </div>

      {/* User Account Form */}
      <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border">
        <h2 className="text-lg font-semibold mb-4">User Account</h2>
        <form onSubmit={handleAccountSubmit} className="space-y-4">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-blue-500 mx-auto flex items-center justify-center text-white text-3xl font-bold">
              {user.name ? user.name.charAt(0).toUpperCase() : ''}
            </div>
            <button type="button" className="text-sm text-blue-600 hover:underline mt-2">Change Picture</button>
          </div>
          <InputField label="Username" id="username" value={userAccount.username} onChange={(e: any) => setUserAccount({ ...userAccount, username: e.target.value })} />
          <InputField label="Email" id="email" value={userAccount.email} onChange={(e: any) => setUserAccount({ ...userAccount, email: e.target.value })} disabled />
          <SelectField label="Role" id="role" value={userAccount.role} onChange={(e: any) => setUserAccount({ ...userAccount, role: e.target.value })}>
            <option value="USER">User</option>
            <option value="OPERATOR">Operator</option>
            <option value="CS">Customer Service</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </SelectField>
          <InputField label="Phone" id="whatsapp" value={userAccount.whatsapp} onChange={(e: any) => setUserAccount({ ...userAccount, whatsapp: e.target.value })} />
          <p className="text-xs text-gray-500">
            Password tidak bisa diubah dari sini. Pengguna mengganti sendiri lewat halaman profilnya.
          </p>
          <button type="submit" disabled={loading} className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-300">
            {loading ? <Loader2 className="animate-spin" /> : 'Update Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

