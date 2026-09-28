'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { InputField, SelectField } from '@/components/FormField';
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

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Bila nilai yang tampil adalah samaran, kolomnya TIDAK ikut dikirim.
      // Mengirimnya berarti menimpa nomor asli dengan titik-titik.
      //
      // Muatannya disusun kolom per kolom, bukan `{ ...businessDetails }`:
      // route `update-business` memakai allowlist, jadi kolom asing memang
      // dibuang — tapi daftar eksplisit di sini membuat terlihat persis apa
      // yang dikirim, dan kolom baru di state tidak ikut menyeberang sendiri.
      const muatan = {
        userId: user.id,
        name: businessDetails.name,
        companyName: businessDetails.companyName,
        ktpAddress: businessDetails.ktpAddress,
        officeAddress: businessDetails.officeAddress,
        ...(identitasTersamar
          ? {}
          : { ktp: businessDetails.ktp, npwp: businessDetails.npwp }),
      };

      const res = await fetch('/api/admin/users/update-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(muatan),
      });
      // Pesan dari server dibaca, bukan dibuang. Route ini menolak dengan
      // keterangan yang berguna — "Field name harus berupa teks", "Tidak ada
      // data yang diubah" — dan admin dulu selalu membaca "Failed to update"
      // yang sama untuk semuanya.
      if (!res.ok) {
        const hasil = await res.json().catch(() => null);
        throw new Error(hasil?.message || 'Gagal menyimpan data bisnis.');
      }
      alert('Data bisnis berhasil disimpan.');
      router.refresh();
    } catch (error) {
      alert(pesanGalat(error, 'Gagal menyimpan data bisnis.'));
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
        throw new Error(hasil?.message || 'Gagal menyimpan data akun.');
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
          throw new Error(hasil?.message || 'Gagal mengubah role.');
        }
      }

      alert('Data akun berhasil disimpan.');
      router.refresh();
    } catch (error) {
      alert(pesanGalat(error, 'Gagal menyimpan data akun.'));
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
