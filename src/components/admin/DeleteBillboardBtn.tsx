// src/components/admin/DeleteBillboardBtn.tsx
'use client';

import { Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteBillboardBtn({ id, title }: { id: string, title: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
      // Konfirmasi agar tidak sengaja kepencet
      const isSure = confirm(`Yakin mau menghapus "${title}"?\nData yang dihapus tidak bisa dikembalikan.`);
      if (!isSure) return;

      setLoading(true);

      try {
          // Dialihkan dari `/api/proxy/billboards/:id` ke route Next yang ber-auth.
          // Proxy lama meneruskan DELETE ke backend tanpa sesi sama sekali, sehingga
          // siapa pun bisa menghapus billboard. Route di bawah memeriksa sesi +
          // role ADMIN/SUPER_ADMIN dan menolak penghapusan bila billboard masih
          // punya booking ACTIVE / PENDING_PAYMENT.
          const res = await fetch('/api/admin/billboards/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
          });

          if (res.ok) {
              alert("✅ Data berhasil dihapus.");
              router.refresh(); 
          } else {
              const data = await res.json();
              alert("❌ Gagal: " + data.message);
          }
      } catch (err) {
          alert("Terjadi kesalahan sistem.");
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