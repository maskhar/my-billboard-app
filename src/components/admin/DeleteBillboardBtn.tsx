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
  const toast = useToast();
  const konfirmasi = useKonfirmasi();

  const handleDelete = async () => {
      const setuju = await konfirmasi({
          judul: `Hapus billboard "${title}"?`,
          pesan:
              'Data billboard beserta seluruh riwayat revisinya dihapus permanen ' +
              'dan tidak bisa dikembalikan.\n\n' +
              'Penghapusan akan ditolak server bila billboard ini masih punya ' +
              'pesanan aktif atau pesanan yang menunggu pembayaran.',
          labelSetuju: 'Hapus Permanen',
          labelTolak: 'Jangan Hapus',
          nada: 'bahaya',
      });
      if (!setuju) return;

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

          // Tiga cacat ditambal bersamaan di sini:
          //
          //   1. `await res.json()` tanpa penjaga. Balasan 500 berbadan HTML
          //      membuatnya melempar, lemparannya mendarat di `catch` di bawah,
          //      dan pesan server yang sebenarnya hilang.
          //   2. `data.message` dibacakan apa adanya. Bila route memulangkan
          //      penolakan tanpa `message`, admin membaca "Gagal: undefined".
          //   3. `catch (err)` membuang galatnya tanpa satu baris log. Route ini
          //      MENOLAK penghapusan billboard yang masih punya booking aktif —
          //      alasan yang menuntut tindakan sama sekali berbeda dari "server
          //      mati" — dan itulah justru pesan yang paling sering hilang.
          const jawaban = await bacaJawaban(res);
          if (res.ok) {
              // Emoji "✅"/"❌" dilepas: nada toast sudah membawa warna dan ikonnya
              // sendiri, dan `role="alert"` pada toast galat membuat pembaca layar
              // menyebutkannya tanpa perlu karakter tambahan yang dibacakan
              // sebagai "tanda centang putih tebal".
              toast.sukses(jawaban.pesan ?? 'Billboard berhasil dihapus.');
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