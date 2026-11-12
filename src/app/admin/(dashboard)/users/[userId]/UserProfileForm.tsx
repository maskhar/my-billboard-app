'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { InputField, SelectField } from '@/components/FormField';
import { useToast } from '@/components/ui/Toast';
import { bacaJawaban, alasanPenolakan } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';
import {
  OPSI_ROLE,
  sahRolePengguna,
  type PenggunaUntukForm,
  type RolePengguna,
} from '@/lib/tipe-pengguna';

export default function UserProfileForm({ user }: { user: PenggunaUntukForm }) {
  // KTP/NPWP hanya dikirim utuh kepada SUPER_ADMIN. Untuk peran lain,
  // halaman induk mengirim bentuk tersamar dan menyalakan penanda ini.
  // Tanpa memeriksanya, penyimpanan biasa akan menulis balik string
  // bertitik-titik itu ke database dan menghapus nomor aslinya.
  const identitasTersamar = user.identitasTersamar;

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

  // Kolom `newPassword`/`confirmPassword` dihapus. Tidak ada satu pun endpoint
  // yang menerima admin menyetel password orang lain — `update-account`
  // menolak tegas body yang memuat `password` (400), jadi dua kotak isian itu
  // membuat SELURUH form ini selalu gagal, bahkan saat admin hanya mengubah
  // nomor telepon. Pengguna mengganti passwordnya sendiri lewat
  // `/api/user/change-password`.
  //
  // `role` dilewatkan `sahRolePengguna` lebih dulu. Nilai asing di sana
  // membuat `<select value={...}>` kehilangan kendali — React memperlakukan
  // `value={undefined}` sebagai input TAK TERKENDALI, menampilkan pilihan
  // pertama ("User") sementara state tetap kosong. Admin lalu menyimpan dan
  // role akun berubah menjadi USER tanpa ia pernah menyentuh kolom itu.
  const [userAccount, setUserAccount] = useState<{
    username: string;
    email: string;
    whatsapp: string;
    role: RolePengguna;
  }>({
    username: user.username || '',
    email: user.email,
    whatsapp: user.whatsapp || '',
    role: sahRolePengguna(user.role) ? user.role : 'USER',
  });

  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/users/${user.id}/admin-business`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(businessDetails),
      });
      // Pesan dari server dibaca, bukan dibuang. Route ini menolak dengan
      // keterangan yang berguna — "Field name harus berupa teks", "Tidak ada
      // data yang diubah" — dan admin dulu selalu membaca "Failed to update"
      // yang sama untuk semuanya.
      if (!res.ok) {
        // `res.json().catch(() => null)` mentah membuat `hasil?.message`
        // bertipe `any`, jadi salah tulis nama kolom lolos `tsc` dan pesan
        // server yang berguna itu justru tidak pernah terlihat.
        const jawaban = await bacaJawaban(res);
        throw new Error(alasanPenolakan(res, jawaban));
      }
      toast.sukses('Data bisnis berhasil disimpan.');
      router.refresh();
    } catch (error) {
      // KTP dan NPWP tidak ikut tercatat: yang di-log hanya galatnya, dan
      // galatnya hanya membawa pesan server.
      console.error('Gagal menyimpan data bisnis pengguna:', error);
      toast.galat(pesanGalat(error, 'Gagal menyimpan data bisnis.'));
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
        <h2 className="text-lg font-semibold mb-4">Data Bisnis</h2>
        <form onSubmit={handleBusinessSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField
            label="Nama Lengkap"
            id="name"
            value={businessDetails.name}
            onChange={(e) => setBusinessDetails({ ...businessDetails, name: e.target.value })}
          />
          <InputField
            label="Nama Perusahaan"
            id="companyName"
            value={businessDetails.companyName}
            onChange={(e) => setBusinessDetails({ ...businessDetails, companyName: e.target.value })}
          />
          <InputField
            label="KTP"
            id="ktp"
            value={businessDetails.ktp}
            onChange={(e) => setBusinessDetails({ ...businessDetails, ktp: e.target.value })}
            disabled={identitasTersamar}
          />
          <InputField
            label="NPWP"
            id="npwp"
            value={businessDetails.npwp}
            onChange={(e) => setBusinessDetails({ ...businessDetails, npwp: e.target.value })}
            disabled={identitasTersamar}
          />
          {identitasTersamar && (
            <p className="md:col-span-2 text-xs text-gray-500">
              KTP dan NPWP disamarkan. Hanya Super Admin yang bisa melihat dan mengubah nomor lengkapnya.
            </p>
          )}
          <div className="md:col-span-2">
            <InputField
              label="Alamat KTP"
              id="ktpAddress"
              value={businessDetails.ktpAddress}
              onChange={(e) => setBusinessDetails({ ...businessDetails, ktpAddress: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <InputField
              label="Alamat Kantor"
              id="officeAddress"
              value={businessDetails.officeAddress}
              onChange={(e) =>
                setBusinessDetails({ ...businessDetails, officeAddress: e.target.value })
              }
            />
          </div>
          <div className="md:col-span-2 text-right">
            <button type="submit" disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-300">
              {loading ? <Loader2 className="animate-spin" /> : 'Simpan Data Bisnis'}
            </button>
          </div>
        </form>
      </div>

      {/* User Account Form */}
      <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border">
        <h2 className="text-lg font-semibold mb-4">Akun Pengguna</h2>
        <form onSubmit={handleAccountSubmit} className="space-y-4">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-blue-500 mx-auto flex items-center justify-center text-white text-3xl font-bold">
              {user.name ? user.name.charAt(0).toUpperCase() : ''}
            </div>
            {/*
              Tombol "Change Picture" dihapus: ia tidak punya `onClick` sama
              sekali dan tidak ada endpoint yang menerima foto profil. Tombol
              yang tidak melakukan apa pun membuat admin menyangka gambarnya
              gagal terunggah, lalu mencobanya berulang.
            */}
          </div>
          <InputField
            label="Username"
            id="username"
            value={userAccount.username}
            onChange={(e) => setUserAccount({ ...userAccount, username: e.target.value })}
          />
          <InputField label="Email" id="email" value={userAccount.email} onChange={() => {}} disabled />
          <SelectField
            label="Role"
            id="role"
            value={userAccount.role}
            onChange={(e) => {
              // Nilai dari `<select>` selalu teks, dan `value` di tiap opsi
              // berasal dari `OPSI_ROLE` — tapi guard-nya tetap dipasang
              // supaya state tidak bisa menampung role yang tidak dikenal
              // bila daftar opsinya berubah kelak.
              const dipilih = e.target.value;
              if (sahRolePengguna(dipilih)) {
                setUserAccount({ ...userAccount, role: dipilih });
              }
            }}
          >
            {OPSI_ROLE.map((opsi) => (
              <option key={opsi.nilai} value={opsi.nilai}>
                {opsi.label}
              </option>
            ))}
          </SelectField>
          <InputField
            label="Nomor WhatsApp"
            id="whatsapp"
            type="tel"
            inputMode="tel"
            value={userAccount.whatsapp}
            onChange={(e) => setUserAccount({ ...userAccount, whatsapp: e.target.value })}
          />
          <p className="text-xs text-gray-500">
            Password tidak bisa diubah dari sini. Pengguna mengganti sendiri lewat halaman profilnya.
          </p>
          <button type="submit" disabled={loading} className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-300">
            {loading ? <Loader2 className="animate-spin" /> : 'Simpan Akun'}
          </button>
        </form>
      </div>
    </div>
  );
}
