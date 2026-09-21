// src/app/admin/(dashboard)/users/UserFormModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';

// Re-usable InputField and SelectField components from the previous design
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
        required
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
      required
    >
      {children}
    </select>
  </div>
);

export default function UserFormModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'USER',
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Reset form when modal is opened
    if (isOpen) {
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'USER',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Password dan konfirmasi password tidak cocok!");
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
            const errorData = await res.json();
            throw new Error(errorData.message || 'Gagal membuat pengguna.');
          }
    
          alert('Pengguna baru berhasil dibuat!');
          onClose(); // Close the modal on success
          router.refresh(); // Refresh the user list page
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Tambah Pengguna Baru</h2>
        <p className="text-sm text-gray-500 mb-6">Buat akun baru dan tentukan hak aksesnya.</p>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField label="Nama Lengkap" id="name" value={formData.name} onChange={handleChange} />
            <InputField label="Alamat Email" id="email" type="email" value={formData.email} onChange={handleChange} />
            <InputField label="Password" id="password" type="password" value={formData.password} onChange={handleChange} />
            <InputField label="Konfirmasi Password" id="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} />
            <div className="md:col-span-2">
                <SelectField label="Role Pengguna" id="role" value={formData.role} onChange={handleChange}>
                    <option value="USER">User</option>
                    <option value="OPERATOR">Operator</option>
                    <option value="CS">Customer Service</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                </SelectField>
            </div>
            <div className="md:col-span-2 text-right mt-4">
            <button type="button" onClick={onClose} className="mr-2 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                Batal
            </button>
            <button type="submit" disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400">
                {loading ? <Loader2 className="animate-spin" /> : 'Simpan Pengguna'}
            </button>
            </div>
        </form>
      </div>
    </div>
  );
}
