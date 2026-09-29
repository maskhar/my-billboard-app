// src/app/admin/(dashboard)/users/UserFormModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { InputField, SelectField } from '@/components/FormField';
import { useToast } from '@/components/ui/Toast';
import { bacaJawaban, alasanPenolakan } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';
import { OPSI_ROLE, sahRolePengguna, type RolePengguna } from '@/lib/tipe-pengguna';

// `InputField` dan `SelectField` dulu ditulis ulang di file ini, dengan
// `required` dipasang paksa pada SETIAP kolom. Keduanya sekarang datang dari
// `@/components/FormField`, dan `required` disebutkan per kolom — lihat
// komentar di modul itu.

const FORM_KOSONG: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: RolePengguna;
} = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'USER',
};

export default function UserFormModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) {
  const [formData, setFormData] = useState(FORM_KOSONG);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    // Reset form when modal is opened
    if (isOpen) {
      setFormData(FORM_KOSONG);
    }
  }, [isOpen]);

  // `if (!isOpen) return null` DIHAPUS: `Modal` di bawah yang memutuskan
  // visibilitas lewat prop `terbuka`, dan `Dialog` headless UI perlu tetap
  // dipasang agar ia bisa memulihkan fokus ke tombol pemicunya saat ditutup.
  // Pengembalian dini di sini melepas seluruh subtree sebelum pemulihan itu
  // terjadi.

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const dipilih = e.target.value;
    if (sahRolePengguna(dipilih)) {
      setFormData((prev) => ({ ...prev, role: dipilih }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.galat('Password dan konfirmasinya tidak cocok.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        }),
      });

      if (!res.ok) {
        // `await res.json()` tanpa penjaga adalah cacat kedua di jalur ini:
        // respons 500 dari Next.js berisi halaman HTML, bukan JSON, dan
        // `res.json()` melemparkan SyntaxError. Galat itu menggantikan pesan
        // server yang sebenarnya, jadi admin membaca "Unexpected token <"
        // untuk setiap kegagalan yang tidak sempat menulis badan JSON.
        // Penjaga itu sekarang hidup di `bacaJawaban`, satu tempat untuk
        // seluruh repo, dan hasilnya bertipe — bukan `any` seperti
        // `hasil?.message` yang dulu ada di sini.
        const jawaban = await bacaJawaban(res);
        throw new Error(alasanPenolakan(res, jawaban));
      }

      toast.sukses('Pengguna baru berhasil dibuat.');
      onClose(); // Close the modal on success
      router.refresh(); // Refresh the user list page
    } catch (error) {
      // Password tidak ikut tercatat: yang di-log hanya galatnya.
      console.error('Gagal membuat pengguna baru:', error);
      toast.galat(pesanGalat(error, 'Gagal membuat pengguna.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    // `bolehTutup={!loading}`: Escape dan klik di luar dimatikan selagi
    // permintaan berjalan. Menutup modal di tengah `POST` tidak membatalkan
    // permintaannya — akunnya tetap dibuat — sementara admin melihat modalnya
    // hilang tanpa pesan dan menyangka pembuatannya gagal, lalu mencobanya
    // lagi. Email-nya unik di database, jadi percobaan kedua ditolak dan yang
    // ia baca adalah galat untuk akun yang sebenarnya berhasil dibuat.
    <Modal
      terbuka={isOpen}
      tutup={onClose}
      bolehTutup={!loading}
      judul={<><UserPlus size={18} className="text-red-600"/> Tambah Pengguna Baru</>}
      lebar="max-w-2xl"
    >
      <div className="p-6">
        <p className="text-sm text-gray-500 mb-6">Buat akun baru dan tentukan hak aksesnya.</p>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField label="Nama Lengkap" id="name" value={formData.name} onChange={handleChange} required />
            <InputField label="Alamat Email" id="email" type="email" value={formData.email} onChange={handleChange} required />
            {/*
              `minLength` disebut di sini, bukan hanya di server. Aturannya
              tetap ditegakkan `periksaSandiBaru` di
              `/api/admin/users/create` — ini semata supaya admin tahu
              panjangnya sebelum menekan Simpan, bukan setelah.
            */}
            <InputField
              label="Password"
              id="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
            <InputField
              label="Konfirmasi Password"
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
            <div className="md:col-span-2">
                <SelectField label="Role Pengguna" id="role" value={formData.role} onChange={handleRoleChange} required>
                    {OPSI_ROLE.map((opsi) => (
                      <option key={opsi.nilai} value={opsi.nilai}>
                        {opsi.label}
                      </option>
                    ))}
                </SelectField>
            </div>
            <div className="md:col-span-2 text-right mt-4">
            <button type="button" onClick={onClose} disabled={loading} className="mr-2 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Batal
            </button>
            <button type="submit" disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400">
                {loading ? <Loader2 className="animate-spin" /> : 'Simpan Pengguna'}
            </button>
            </div>
        </form>
      </div>
    </Modal>
  );
}
