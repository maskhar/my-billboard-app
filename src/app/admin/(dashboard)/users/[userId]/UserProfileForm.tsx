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

const getApiErrorMessage = async (res: Response) => {
  try {
    const data = await res.json();
    return typeof data?.message === 'string' ? data.message : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
};

export default function UserProfileForm({ user }: { user: User }) {
  const [businessDetails, setBusinessDetails] = useState({
    name: user.name || '',
    companyName: user.companyName || '',
    ktp: user.ktp || '',
    npwp: user.npwp || '',
    ktpAddress: user.ktpAddress || '',
    officeAddress: user.officeAddress || '',
  });

  const [userAccount, setUserAccount] = useState({
    username: user.username || '',
    email: user.email || '',
    whatsapp: user.whatsapp || '',
    role: user.role || 'USER', // Tambahkan role di sini
    newPassword: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/users/${user.id}/admin-business`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(businessDetails),
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
    if (userAccount.newPassword !== userAccount.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    const roleChanged = userAccount.role !== user.role;

    const updateAccount = async () => {
      const data: any = {
        username: userAccount.username,
        whatsapp: userAccount.whatsapp,
      };
      if (userAccount.newPassword) {
        data.password = userAccount.newPassword;
      }
      try {
        const res = await fetch(`/api/proxy/users/${user.id}/admin-account`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        return { ok: res.ok, message: res.ok ? '' : await getApiErrorMessage(res) };
      } catch {
        return { ok: false, message: 'Tidak dapat menghubungi server.' };
      }
    };

    const updateRole = async () => {
      try {
        const res = await fetch(`/api/proxy/users/${user.id}/admin-role`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newRole: userAccount.role }),
        });
        return { ok: res.ok, message: res.ok ? '' : await getApiErrorMessage(res) };
      } catch {
        return { ok: false, message: 'Tidak dapat menghubungi server.' };
      }
    };

    setLoading(true);
    try {
      const rolePromise: Promise<{ ok: boolean; message: string } | null> = roleChanged
        ? updateRole()
        : Promise.resolve(null);
      const [accountResult, roleResult] = await Promise.all([updateAccount(), rolePromise]);

      const failures: string[] = [];
      if (!accountResult.ok) {
        failures.push(`Gagal memperbarui data akun: ${accountResult.message}`);
      }
      if (roleResult && !roleResult.ok) {
        failures.push(`Gagal mengubah role: ${roleResult.message}`);
        setUserAccount(prev => ({ ...prev, role: user.role }));
      }

      if (failures.length > 0) {
        const successes: string[] = [];
        if (accountResult.ok) successes.push('data akun berhasil diperbarui');
        if (roleResult?.ok) successes.push('role berhasil diubah');

        alert(`${failures.join('\n')}${successes.length > 0 ? `\n\nNamun ${successes.join(' dan ')}.` : ''}`);
        if (accountResult.ok || roleResult?.ok) {
          router.refresh();
        }
        return;
      }

      alert(roleChanged ? 'Account details and role updated successfully!' : 'Account details updated successfully!');
      router.refresh();
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
          <InputField label="KTP" id="ktp" value={businessDetails.ktp} onChange={(e: any) => setBusinessDetails({ ...businessDetails, ktp: e.target.value })} />
          <InputField label="NPWP" id="npwp" value={businessDetails.npwp} onChange={(e: any) => setBusinessDetails({ ...businessDetails, npwp: e.target.value })} />
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
          <InputField label="New Password" id="newPassword" type="password" value={userAccount.newPassword} onChange={(e: any) => setUserAccount({ ...userAccount, newPassword: e.target.value })} placeholder="Leave blank to keep current" />
          <InputField label="Confirm Password" id="confirmPassword" type="password" value={userAccount.confirmPassword} onChange={(e: any) => setUserAccount({ ...userAccount, confirmPassword: e.target.value })} placeholder="Confirm new password" />
          <button type="submit" disabled={loading} className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-300">
            {loading ? <Loader2 className="animate-spin" /> : 'Update Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

