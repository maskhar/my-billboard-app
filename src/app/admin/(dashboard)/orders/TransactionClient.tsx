'use client';

// src/app/admin/(dashboard)/orders/TransactionClient.tsx

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PaymentStatus, PaymentTujuan } from '@prisma/client';
import { X, Check, ThumbsDown, UploadCloud, Loader2, PlusCircle } from 'lucide-react';
import OrderActions from '@/components/admin/OrderActions';
import { arrayDariJson } from '@/lib/safe-json';
import { rupiah } from '@/lib/money';

/**
 * Bentuk satu pesanan SETELAH diserialisasi oleh `page.tsx`.
 *
 * Tipe ini dulu `Booking & { user: User; billboard: Billboard; ... }` — tipe
 * Prisma utuh, yang dua kali salah. Pertama, ia mengklaim nominal di sini masih
 * `Prisma.Decimal`, padahal Next.js sudah mengubahnya menjadi number saat
 * menyeberang ke komponen client; setiap `rupiah()` di bawah bekerja pada number.
 * Kedua, ia mengklaim relasi `user` lengkap — termasuk hash password, otpCode,
 * dan otpExpires — sehingga tidak ada yang menahan kode di sini kalau suatu saat
 * membacanya, dan `page.tsx` butuh cast `as unknown as` untuk lolos.
 */
export type TransaksiUntukClient = {
  id: string;
  status: string;
  createdAt: Date;
  duration: number;
  designOption: string | null;
  designFileUrl: string | null;
  designStatus: string | null;
  designRejectionReason: string | null;
  isLocked: boolean;
  refundProof: string | null;
  refundedAt: Date | null;
  installationProof: string | null;
  userBankName: string | null;
  userBankAccount: string | null;
  totalPrice: number;
  refundAmount: number | null;
  user: { id: string; name: string | null; email: string | null; whatsapp: string | null };
  billboard: { id: string; title: string; address: string; type: string; specs: unknown };
  additionalCharges: { id: string; description: string; amount: number }[];
  payments: {
    id: string;
    tujuan: PaymentTujuan;
    status: PaymentStatus;
    jumlah: number;
    paidAt: Date | null;
  }[];
  /** Fakta ledger yang sudah dihitung server sebagai Decimal. */
  uang: {
    pokokMasuk: number;
    sisaPokok: number;
    totalTambahan: number;
    tambahanDibayar: number;
    sisaTambahan: number;
    grandTotal: number;
    adaUangMasuk: boolean;
  };
};

interface Props {
  transactions: TransaksiUntukClient[];
  currentUserRole: string;
}

const LABEL_TUJUAN: Record<string, string> = {
  DP: 'DP',
  FULL: 'Pelunasan penuh',
  PELUNASAN: 'Pelunasan sisa',
  TAMBAHAN: 'Biaya tambahan',
};

// Helper component for internal design uploads
const InternalDesignUploader = ({ orderId }: { orderId: string }) => {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [linkInput, setLinkInput] = useState("");

    const handleInternalUpload = async (url: string) => {
        if (!url) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/orders/upload-internal-design', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, designUrl: url }),
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                setLinkInput("");
                router.refresh();
            } else {
                alert('Gagal: ' + data.message);
            }
        } catch (error) {
            alert('Terjadi kesalahan pada server.');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="space-y-2">
            <input 
                type="text" 
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="Paste URL Desain (G-Drive, etc)" 
                className="w-full border rounded-md p-2 text-xs"
                disabled={loading}
            />
            <button 
                onClick={() => handleInternalUpload(linkInput)} 
                disabled={loading || !linkInput}
                className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg text-xs hover:bg-blue-700 disabled:bg-gray-300 transition flex items-center justify-center gap-2"
            >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                Kirim Desain ke User
            </button>
        </div>
    );
};

// Helper component for adding new charges
const AddChargeForm = ({ orderId }: { orderId: string }) => {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [description, setDescription] = useState("");
    const [amount, setAmount] = useState("");

    const handleAddCharge = async () => {
        if (!description || !amount) {
            return alert("Harap isi deskripsi dan jumlah biaya.");
        }
        setLoading(true);
        try {
            const res = await fetch('/api/admin/orders/add-charge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, description, amount }),
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                setDescription("");
                setAmount("");
                router.refresh();
            } else {
                alert('Gagal: ' + data.message);
            }
        } catch (error) {
            alert('Terjadi kesalahan pada server.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mt-4 pt-4 border-t space-y-2">
            <input 
                type="text" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Deskripsi (cth: Revisi Desain 2x)" 
                className="w-full border rounded-md p-2 text-xs"
                disabled={loading}
            />
            <div className="flex gap-2">
                <input 
                    type="number" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Jumlah (cth: 50000)" 
                    className="flex-1 border rounded-md p-2 text-xs"
                    disabled={loading}
                />
                <button 
                    onClick={handleAddCharge} 
                    disabled={loading || !description || !amount}
                    className="bg-gray-800 text-white font-bold p-2 rounded-lg text-xs hover:bg-black disabled:bg-gray-300 transition"
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                </button>
            </div>
        </div>
    );
};

export default function TransactionClient({ transactions, currentUserRole }: Props) {
  const [selected, setSelected] = useState<TransaksiUntukClient | null>(transactions.length > 0 ? transactions[0] : null);
  const router = useRouter();

  const handleDesignStatusUpdate = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selected) return;

    let reason = '';
    if (status === 'REJECTED') {
      reason = prompt('Harap masukkan alasan penolakan desain:') || '';
      if (!reason) return; // User membatalkan prompt
    }

    try {
      const res = await fetch('/api/admin/orders/update-design-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selected.id, status, reason }),
      });
      
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        router.refresh();
      } else {
        alert('Gagal: ' + data.message);
      }
    } catch (error) {
      alert('Terjadi kesalahan pada server.');
    }
  };

  const StatusBadge = ({ status }: { status: string }) => (
    <span className="px-2 py-1 text-[10px] font-bold rounded bg-green-100 text-green-700 uppercase">
      {status.replace(/_/g, ' ')}
    </span>
  );

  const DetailSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="mb-6">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
  
  const InfoPair = ({ label, value }: { label: string, value: string | undefined | null }) => (
    <div className="flex justify-between items-center text-sm mb-1.5 text-gray-700">
      <span>{label}</span>
      <span className="font-bold text-right">{value || '-'}</span>
    </div>
  );

  // Dulu dihitung di sini: `totalPrice + charges.reduce((s, c) => s + c.amount, 0)`.
  // Nominal dari database bertipe Decimal, jadi `+` menyambung teks alih-alih
  // menjumlah — Grand Total muncul sebagai deretan digit menempel, tanpa error
  // apa pun. Sekarang seluruh hitungannya dikerjakan server sebagai Decimal
  // (`orders/page.tsx`) dan tiba di sini sebagai angka jadi.
  const grandTotal = selected?.uang.grandTotal ?? 0;

  // Dibaca sekali, bukan tiga kali di dalam JSX. Selain memboroskan pekerjaan,
  // `JSON.parse` mentah di tengah render membuat satu baris DB rusak
  // menjatuhkan seluruh halaman transaksi admin.
  //
  // `arrayDariJson`, BUKAN `safeJsonArray`: kolom `specs` bertipe jsonb dan
  // Prisma sudah menguraikannya (lihat catatan di `src/lib/safe-json.ts`).
  const specsBillboard = arrayDariJson<{ label: string; value: string }>(
    selected?.billboard?.specs,
    `Billboard.specs order=${selected?.id ?? '-'}`
  );
  const cariSpec = (kataKunci: string) =>
    specsBillboard.find((s) => typeof s?.label === 'string' && s.label.includes(kataKunci))?.value;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-200px)]">
      
      {/* Kolom Kiri: Daftar Transaksi */}
      <div className="lg:col-span-4 bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col">
        <input type="search" placeholder="Search..." className="w-full px-3 py-2 rounded-md border text-sm mb-4" />
        <div className="flex-1 overflow-y-auto">
          {transactions.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={`w-full text-left p-4 rounded-lg mb-2 transition ${selected?.id === t.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-mono text-xs font-bold text-gray-700">#{t.id.slice(-8).toUpperCase()}</span>
                <span className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-sm font-semibold text-gray-800 line-clamp-1">{t.billboard.title}</p>
              <p className="text-xs text-gray-500">{t.user.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Kolom Kanan: Detail Transaksi */}
      <div className="lg:col-span-8">
        {selected ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full p-8 relative overflow-y-auto">
              <button onClick={() => setSelected(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition"><X size={20}/></button>

              {/* Header Detail */}
              <div className="flex justify-between items-start pb-4 border-b mb-6">
                <div>
                  <p className="font-mono text-gray-500">Transaction ID</p>
                  <h2 className="text-2xl font-bold text-gray-800">#{selected.id.slice(-8).toUpperCase()}</h2>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="text-right">
                  <p className="text-gray-500">Total Amount</p>
                  <p className="text-3xl font-bold text-utero">{rupiah(grandTotal)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Buyer & Seller */}
                  <div>
                    <DetailSection title="Buyer">
                        <InfoPair label="Name" value={selected.user.name} />
                        <InfoPair label="Contact" value={selected.user.email} />
                        <InfoPair label="Phone" value={selected.user.whatsapp} />
                    </DetailSection>
                    <DetailSection title="Seller">
                        <InfoPair label="Company Name" value="Iklan Jaya Group" />
                        <InfoPair label="Office Address" value="Jl. Melati No. 10, Jakarta" />
                    </DetailSection>
                    <DetailSection title="Actions">
                        <OrderActions
                            order={selected}
                            currentUserRole={currentUserRole}
                            adaUangMasuk={selected.uang.adaUangMasuk}
                            nominalRefund={selected.refundAmount}
                        />
                    </DetailSection>
                    
                    <DetailSection title="Billing Details">
                        <div className="space-y-1 text-sm border-b pb-2 mb-2">
                            <InfoPair label="Harga Pokok" value={rupiah(selected.totalPrice)} />
                            {selected.additionalCharges.map(charge => (
                                <InfoPair key={charge.id} label={charge.description} value={`+ ${rupiah(charge.amount)}`} />
                            ))}
                        </div>
                        <InfoPair label="Grand Total" value={rupiah(grandTotal)} />

                        {/* Panel ini dulu hanya menampilkan apa yang DITAGIHKAN.
                            Admin yang memutuskan refund tidak punya satu pun
                            angka tentang apa yang sudah DITERIMA — dan itu dasar
                            perhitungan nominal yang keluar ke rekening pembeli. */}
                        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                Uang Diterima
                            </p>
                            <InfoPair label="Pokok diterima" value={rupiah(selected.uang.pokokMasuk)} />
                            <InfoPair label="Sisa pokok" value={rupiah(selected.uang.sisaPokok)} />
                            {selected.uang.totalTambahan > 0 && (
                                <>
                                    <InfoPair label="Tambahan dibayar" value={rupiah(selected.uang.tambahanDibayar)} />
                                    <InfoPair label="Sisa tambahan" value={rupiah(selected.uang.sisaTambahan)} />
                                </>
                            )}

                            {selected.payments.length > 0 && (
                                <div className="mt-3 border-t border-gray-200 pt-2 space-y-1">
                                    {selected.payments.map(p => (
                                        <div key={p.id} className="flex items-center justify-between text-xs text-gray-600">
                                            <span>
                                                {LABEL_TUJUAN[p.tujuan] ?? p.tujuan}
                                                <span className={`ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold ${p.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                                    {p.status}
                                                </span>
                                            </span>
                                            <span className="text-right">
                                                {rupiah(p.jumlah)}
                                                {p.paidAt && (
                                                    <span className="ml-2 text-gray-400">
                                                        {new Date(p.paidAt).toLocaleDateString('id-ID')}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <AddChargeForm orderId={selected.id} />
                    </DetailSection>
                  </div>

                  {/* Spek Billboard & Desain */}
                  <div>
                    <DetailSection title="Billboard Specification">
                        <p className="font-bold text-gray-800 mb-2">{selected.billboard.title}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
                           <span>Location:</span><span className="font-medium text-gray-800">{selected.billboard.address}</span>
                           <span>Type:</span><span className="font-medium text-gray-800">{selected.billboard.type}</span>
                           <span>Lighting:</span><span className="font-medium text-gray-800">{cariSpec("Penerangan") || '-'}</span>
                           <span>Size:</span><span className="font-medium text-gray-800">{cariSpec("Ukuran") || '-'}</span>
                           <span>Orientation:</span><span className="font-medium text-gray-800">{cariSpec("Layout") || '-'}</span>
                        </div>
                    </DetailSection>

                    {/* --- LOGIKA DESAIN YANG DISEMPURNAKAN --- */}

                    {/* JIKA USER MEMILIH JASA DESAIN */}
                    {selected.designOption === 'service' && (
                        <DetailSection title="Jasa Desain Internal">
                            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-lg text-sm space-y-2">
                                <p className="font-bold">⚠️ Perhatian: Pesanan ini menggunakan Jasa Desain.</p>
                                
                                {selected.designFileUrl ? (
                                    <div>
                                        <p className="text-xs mb-2">Desain telah dikirim ke user. Anda bisa mengubahnya di bawah.</p>
                                        <a href={selected.designFileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold text-sm hover:underline">
                                            Lihat Desain yang Terkirim
                                        </a>
                                    </div>
                                ) : (
                                    <p className="text-xs">Tim internal perlu membuat dan mengunggah hasil desain di bawah ini agar bisa dilihat oleh user.</p>
                                )}
                            </div>
                            <div className="mt-3">
                                <InternalDesignUploader orderId={selected.id} />
                            </div>
                        </DetailSection>
                    )}

                    {/* JIKA USER UPLOAD SENDIRI */}
                    {selected.designOption !== 'service' && selected.designFileUrl && (
                      <DetailSection title="Design Review">
                          <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                              <a href={selected.designFileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold text-sm hover:underline">
                                  Lihat File Desain
                              </a>
                              <p className="text-xs text-gray-500 mt-1">
                                  Status: <span className="font-bold">{selected.designStatus || 'PENDING_REVIEW'}</span>
                              </p>
                              {selected.designStatus === 'REJECTED' && (
                                  <p className="text-xs text-red-500 mt-1">Alasan: {selected.designRejectionReason}</p>
                              )}
                          </div>
                          {selected.designStatus !== 'APPROVED' && (
                              <div className="flex gap-2 mt-2">
                                  <button onClick={() => handleDesignStatusUpdate('APPROVED')} className="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition">
                                      <Check size={14}/> Approve
                                  </button>
                                  <button onClick={() => handleDesignStatusUpdate('REJECTED')} className="flex-1 bg-red-500 hover:bg-red-600 text-white px-3 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition">
                                      <ThumbsDown size={14}/> Reject
                                  </button>
                              </div>
                          )}
                      </DetailSection>
                    )}
                  </div>
              </div>
        </div>
      ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex items-center justify-center text-gray-400">
            <p>Select a transaction to see the details.</p>
          </div>
        )}
      </div>

    </div>
  );
}
