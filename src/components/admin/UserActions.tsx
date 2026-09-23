// src/components/admin/UserActions.tsx
'use client';

import { Trash2, UserCog, Loader2, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function UserActions({ user }: { user: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // STATE MODAL EDIT
  const [showModal, setShowModal] = useState(false);
  const [newRole, setNewRole] = useState(user.role);

  // 1. Fungsi Hapus User
  const handleDelete = async () => {
      const confirmMsg = `Hapus User "${user.name}"?\nPerhatian: User yang sedang transaksi tidak bisa dihapus.`;
      if (!confirm(confirmMsg)) return;

      setLoading(true);
      try {
          const res = await fetch('/api/admin/users/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: user.id })
          });
          const json = await res.json();
          if (res.ok) {
              alert("User dihapus.");
              router.refresh();
          } else {
              alert(json.message);
          }
      } catch (err) { alert("System Error"); }
      setLoading(false);
  };

  // 2. Fungsi Simpan Role Baru
  const handleUpdateRole = async () => {
      setLoading(true);
      try {
          const res = await fetch('/api/admin/users/update-role', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id, newRole })
          });

          if(res.ok) {
              alert(`Role ${user.name} berhasil diubah jadi ${newRole}`);
              setShowModal(false);
              router.refresh();
          } else {
              alert("Gagal mengubah role.");
          }
      } catch(e) { alert("Error Server"); }
      setLoading(false);
  }

  return (
    <>
        <div className="flex justify-center gap-2">
            {/* TOMBOL EDIT */}
            <button 
                onClick={() => setShowModal(true)}
                className="p-1.5 text-blue-500 hover:text-blue-700 border border-blue-200 rounded hover:bg-blue-50 transition"
                title="Edit Role / Jabatan"
            >
                <UserCog size={16}/>
            </button>
            
            {/* TOMBOL HAPUS */}
            <button 
                onClick={handleDelete}
                disabled={loading}
                className="p-1.5 text-gray-400 hover:text-red-600 border border-gray-200 rounded hover:bg-red-50 transition"
                title="Hapus User"
            >
                {loading ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16}/>}
            </button>
        </div>

        {/* MODAL POPUP GANTI ROLE */}
        {showModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-xl shadow-2xl border p-6 w-full max-w-sm relative">
                    <button onClick={()=>setShowModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><X size={20}/></button>
                    
                    <h3 className="text-lg font-bold text-gray-800 mb-1">Ubah Hak Akses</h3>
                    <p className="text-xs text-gray-500 mb-4">Mengubah role untuk <b>{user.name}</b></p>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold uppercase text-gray-400">Pilih Role Baru</label>
                            <select 
                                value={newRole} 
                                onChange={(e)=>setNewRole(e.target.value)} 
                                className="w-full mt-1 border p-2 rounded-lg font-bold text-sm bg-gray-50"
                            >
                                <option value="USER">USER (Pelanggan)</option>
                                <option value="ADMIN">ADMIN (Pengelola)</option>
                                <option value="OPERATOR">OPERATOR (Tim Chat/Order)</option>
                                {/* CS sebelumnya tidak ada di sini, padahal peran itu
                                    sah dan punya layoutnya sendiri. Akibatnya CS hanya
                                    bisa diangkat lewat UserFormModal, tidak lewat
                                    dashboard pengguna. */}
                                <option value="CS">CS (Customer Service)</option>
                                <option value="SUPER_ADMIN">SUPER ADMIN (Dewa)</option>
                            </select>
                        </div>
                        
                        <div className="flex gap-2">
                             <button onClick={()=>setShowModal(false)} className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg font-bold text-xs hover:bg-gray-200">Batal</button>
                             <button onClick={handleUpdateRole} disabled={loading} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold text-xs hover:bg-blue-700 flex items-center justify-center gap-1">
                                {loading ? <Loader2 className="animate-spin" size={14}/> : <><Save size={14}/> Simpan</>}
                             </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </>
  );
}