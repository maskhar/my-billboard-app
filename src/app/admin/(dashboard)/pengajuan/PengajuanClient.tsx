// src/app/admin/(dashboard)/pengajuan/PengajuanClient.tsx
'use client';

// Daftar pengajuan titik beserta penggerak statusnya.
//
// Client Component karena setiap baris punya state terbuka/tertutup dan
// mengirim permintaan. Datanya sudah jadi dari server — tidak ada satu pun
// pemanggilan Prisma di sini, dan tidak ada `Date` maupun `Decimal` yang
// menyeberang.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, MessageCircle, Mail, MapPin, Ruler } from 'lucide-react';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';
import { useToast } from '@/components/ui/Toast';
import { useKonfirmasi } from '@/components/ui/Konfirmasi';

/**
 * Status ditulis sebagai union teks, bukan diimpor dari `@prisma/client`.
 *
 * Mengimpor NILAI enum Prisma ke Client Component menarik runtime Prisma ke
 * bundel browser. Yang dibutuhkan di sini hanya empat teks, dan route
 * `/api/admin/pengajuan-titik` yang memeriksanya terhadap enum sungguhan.
 */
type Status = 'BARU' | 'DIHUBUNGI' | 'SELESAI' | 'DITOLAK';

type Pengajuan = {
  id: string;
  namaPemilik: string;
  nomorWa: string;
  email: string | null;
  alamat: string;
  kota: string;
  ukuran: string | null;
  catatan: string | null;
  status: Status;
  catatanAdmin: string | null;
  createdAt: string;
  namaPenangan: string | null;
  tautanWa: string | null;
};

const WARNA_STATUS: Record<Status, string> = {
  BARU: 'bg-blue-50 text-blue-700 border-blue-200',
  DIHUBUNGI: 'bg-amber-50 text-amber-700 border-amber-200',
  SELESAI: 'bg-green-50 text-green-700 border-green-200',
  DITOLAK: 'bg-gray-100 text-gray-600 border-gray-200',
};

const LABEL_STATUS: Record<Status, string> = {
  BARU: 'Baru',
  DIHUBUNGI: 'Dihubungi',
  SELESAI: 'Selesai',
  DITOLAK: 'Ditolak',
};

const URUTAN: Status[] = ['BARU', 'DIHUBUNGI', 'SELESAI', 'DITOLAK'];

export default function PengajuanClient({ daftar }: { daftar: Pengajuan[] }) {
  const router = useRouter();
  const toast = useToast();
  const konfirmasi = useKonfirmasi();

  const [terbuka, setTerbuka] = useState<string | null>(null);
  // Per-id, bukan satu boolean global: dengan satu boolean, mengklik satu baris
  // mematikan tombol di seluruh daftar dan admin menyimpulkan layarnya hang.
  const [sibuk, setSibuk] = useState<string | null>(null);

  const ubahStatus = async (p: Pengajuan, status: Status) => {
    let catatanAdmin: string | undefined;

    // `DITOLAK` menuntut alasan, dan route-nya menolak 422 tanpa alasan. Dialog
    // ini menanyakannya lebih dulu supaya admin tidak bertemu penolakan setelah
    // mengklik — kecuali alasannya sudah tersimpan dari penanganan sebelumnya.
    if (status === 'DITOLAK') {
      const jawaban = await konfirmasi({
        judul: 'Tolak pengajuan ini?',
        pesan: `Pengajuan dari ${p.namaPemilik} (${p.kota}) akan ditandai ditolak. Alasannya disimpan sebagai catatan internal dan tidak dikirim ke pengaju.`,
        labelSetuju: 'Tolak pengajuan',
        nada: 'bahaya',
        isian: {
          label: 'Alasan penolakan',
          placeholder: 'Mis. lokasi di luar jangkauan pemasangan.',
          panjang: true,
          wajib: !p.catatanAdmin,
        },
      });

      // Dijaga dengan pemeriksaan TIPE, bukan truthiness. Dengan `isian`,
      // dialognya memulangkan `null` saat ditutup dan TEKS saat disetujui —
      // dan teks itu boleh kosong, karena `wajib: false` di atas berlaku
      // tepat ketika alasan lama sudah tersimpan. `!jawaban` akan menelan
      // kasus itu sebagai pembatalan, jadi admin menekan "Tolak pengajuan"
      // dan tidak terjadi apa pun.
      if (typeof jawaban !== 'string') return;

      // Teks kosong berarti "pakai alasan yang sudah ada", bukan "kosongkan".
      // Mengirim `undefined` membuat route tidak menyentuh kolomnya; mengirim
      // `''` akan menghapus alasan lama, lalu ditolak 422 oleh gerbang yang
      // sama.
      catatanAdmin = jawaban.trim() === '' ? undefined : jawaban;
    }

    setSibuk(p.id);
    try {
      const res = await fetch('/api/admin/pengajuan-titik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `catatanAdmin` hanya dikirim bila dialognya mengisinya. Mengirim
        // `undefined` di JSON berarti kuncinya hilang sama sekali, dan route
        // memperlakukan kunci yang hilang sebagai "jangan sentuh kolomnya" —
        // jadi catatan lama tidak terhapus saat status digeser tanpa dialog.
        body: JSON.stringify({ id: p.id, status, catatanAdmin }),
      });

      const jawaban = await bacaJawaban(res);

      if (!res.ok) {
        toast.galat(alasanPenolakan(res, jawaban));
        return;
      }

      toast.sukses(`Pengajuan ditandai "${LABEL_STATUS[status]}".`);
      // Daftarnya dibaca ulang di server; tidak ada salinan status di state
      // client yang bisa menyimpang dari database.
      router.refresh();
    } catch (galat) {
      console.error('Gagal memperbarui pengajuan:', galat);
      toast.galat(pesanGalat(galat, 'Gagal menghubungi server. Coba lagi.'));
    } finally {
      setSibuk(null);
    }
  };

  return (
    <div className="space-y-3">
      {daftar.map((p) => {
        const dibuka = terbuka === p.id;

        return (
          <div
            key={p.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            {/* Kepala baris. `<button>`, bukan `<div onClick>`: pengguna papan
                tombol harus bisa membukanya dengan Enter, dan pembaca layar
                harus menyebutnya sebagai kontrol. */}
            <button
              type="button"
              onClick={() => setTerbuka(dibuka ? null : p.id)}
              aria-expanded={dibuka}
              className="w-full text-left p-5 flex items-start gap-4 hover:bg-gray-50 transition"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900">{p.namaPemilik}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${WARNA_STATUS[p.status]}`}
                  >
                    {LABEL_STATUS[p.status]}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1.5 truncate">
                  {p.kota} · {p.alamat}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {/* `toLocaleDateString` di client dengan zona peramban admin.
                      Nilainya teks ISO dari server, jadi tidak ada `Date` yang
                      menyeberang sebagai props. */}
                  Masuk {new Date(p.createdAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {p.namaPenangan && ` · ditangani ${p.namaPenangan}`}
                </p>
              </div>
              <ChevronDown
                size={20}
                aria-hidden="true"
                className={`text-gray-400 flex-shrink-0 transition ${dibuka ? 'rotate-180' : ''}`}
              />
            </button>

            {dibuka && (
              <div className="border-t border-gray-100 p-5 bg-gray-50/50 space-y-5">
                <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Nomor WhatsApp
                    </dt>
                    <dd className="text-gray-800 mt-1">{p.nomorWa}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Email
                    </dt>
                    <dd className="text-gray-800 mt-1">{p.email ?? '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin size={12} aria-hidden="true" /> Alamat
                    </dt>
                    <dd className="text-gray-800 mt-1 whitespace-pre-wrap break-words">
                      {p.alamat}, {p.kota}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Ruler size={12} aria-hidden="true" /> Perkiraan ukuran
                    </dt>
                    <dd className="text-gray-800 mt-1">{p.ukuran ?? '—'}</dd>
                  </div>
                  {p.catatan && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        Keterangan dari pengaju
                      </dt>
                      {/* `whitespace-pre-wrap` supaya baris baru yang ia tulis
                          tetap terbaca, dan `break-words` supaya teks tanpa spasi
                          tidak melebarkan kartunya. Ini teks di dalam JSX, jadi
                          React yang meng-escape-nya — bukan `innerHTML`. */}
                      <dd className="text-gray-800 mt-1 whitespace-pre-wrap break-words">
                        {p.catatan}
                      </dd>
                    </div>
                  )}
                  {p.catatanAdmin && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        Catatan internal
                      </dt>
                      <dd className="text-gray-800 mt-1 whitespace-pre-wrap break-words">
                        {p.catatanAdmin}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="flex flex-wrap gap-2">
                  {/* Hanya bila nomornya sah. `keTautanWa` di server sudah
                      mengembalikan `null` untuk nomor yang tidak bisa dipanggil,
                      dan tombol yang membuka wa.me tanpa nomor hanya membuang
                      waktu admin. */}
                  {p.tautanWa && (
                    <a
                      href={p.tautanWa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-green-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-green-700 transition"
                    >
                      <MessageCircle size={14} aria-hidden="true" /> Hubungi via WhatsApp
                    </a>
                  )}
                  {p.email && (
                    <a
                      href={`mailto:${p.email}`}
                      className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-white transition"
                    >
                      <Mail size={14} aria-hidden="true" /> Email
                    </a>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Ubah status penanganan
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {URUTAN.map((status) => (
                      <button
                        key={status}
                        type="button"
                        // Status yang sedang berlaku dimatikan, bukan
                        // disembunyikan: admin tetap melihat posisi baris ini di
                        // antara empat pilihan yang ada.
                        disabled={sibuk === p.id || p.status === status}
                        onClick={() => ubahStatus(p, status)}
                        className={`text-xs font-bold px-4 py-2.5 rounded-lg border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                          p.status === status
                            ? WARNA_STATUS[status]
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {p.status === status ? `● ${LABEL_STATUS[status]}` : LABEL_STATUS[status]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                    Tandai <b>Selesai</b> setelah titiknya dibuat sebagai billboard
                    di menu Inventory. Baris ini adalah catatan penjajakan, bukan
                    inventaris — menandainya selesai tidak membuat billboard apa
                    pun.
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
