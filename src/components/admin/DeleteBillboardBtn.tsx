// src/components/admin/DeleteBillboardBtn.tsx
'use client';

import { Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

export default function DeleteBillboardBtn({ id, title }: { id: string, title: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
      // Konfirmasi agar tidak sengaja kepencet
      const isSure = confirm(`Yakin mau menghapus "${title}"?\nData yang dihapus tidak bisa dikembalikan.`);
      if (!isSure) return;

      if (!session?.user?.email) {
          alert("Gagal: sesi admin tidak ditemukan. Silakan login ulang.");
          return;
      }

      setLoading(true);

      try {
          // Body wajib berisi adminEmail: backend memvalidasi role admin ke database.
          const res = await fetch(`/api/proxy/billboards/${id}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ adminEmail: session.user.email }),
          });

          if (res.ok) {
              alert("✅ Data berhasil dihapus.");
              router.refresh(); 
          } else {
              const data = await res.json().catch(() => null);
              const msg = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message || `Error tidak diketahui (HTTP ${res.status})`);
              alert("❌ Gagal: " + msg);
          }
      } catch (err) {
          alert("Terjadi kesalahan sistem. Pastikan backend sedang berjalan.");
      } finally {
          setLoading(false);
      }
  };

  return (
    <button 
        onClick={handleDelete} 
        disabled={loading}
        className="p-2 text-red-600 hover:bg-red-50 rounded border border-red-200 transition disabled:opacity-50"
        title="Hapus Permanen"
    >
        {loading ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16} />}
    </button>
  );
}