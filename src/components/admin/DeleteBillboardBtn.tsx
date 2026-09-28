// src/components/admin/DeleteBillboardBtn.tsx
'use client';

import { Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useKonfirmasi } from '@/components/ui/Konfirmasi';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';

export default function DeleteBillboardBtn({ id, title }: { id: string, title: string }) {
  const router = useRouter();
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
              toast.galat('Gagal menghapus: ' + alasanPenolakan(res, jawaban));
          }
      } catch (galat) {
          console.error('Gagal menghapus billboard:', galat);
          toast.galat(pesanGalat(galat, 'Server tidak dapat dihubungi. Billboard TIDAK dihapus.'));
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