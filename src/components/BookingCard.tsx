// src/components/BookingCard.tsx
'use client';

import { useState, useEffect } from 'react';
import { CreditCard, UploadCloud, MapPin, Clock, Eye, Trash2, AlertTriangle, CornerUpLeft, Banknote, Landmark, CheckCircle2, ExternalLink, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function BookingCard({ order }: { order: any }) {
  const router = useRouter();
  
  // STATE UI & LOGIC
  const [loading, setLoading] = useState(false);
  
  // SEMUA JENIS MODAL KITA DAFTARKAN DI SINI
  const [modalType, setModalType] = useState<'NONE' | 'REASON_FORM' | 'BANK_FORM' | 'PROOF_IMAGE' | 'DESIGN_FORM'>('NONE');
  
  // State Upload
  const [uploadMode, setUploadMode] = useState<'FILE' | 'LINK'>('FILE');
  const [linkInput, setLinkInput] = useState("");

  // State Timer
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  // LOGIKA 1: TIMER HITUNG MUNDUR (Khusus Pending)
  useEffect(() => {
    if (order.status !== 'PENDING_PAYMENT') return;
    const deadline = new Date(order.createdAt).getTime() + (24 * 60 * 60 * 1000);
    const interval = setInterval(() => {
        const now = new Date().getTime();
        const dist = deadline - now;
        if (dist < 0) { setIsExpired(true); setTimeLeft("EXPIRED"); } 
        else { 
            const h = Math.floor(dist / (3600*1000));
            const m = Math.floor((dist % (3600*1000)) / (60*1000));
            setTimeLeft(`${h}j ${m}m`); 
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [order]);


  // LOGIKA 2: HANDLING TOMBOL UTAMA

  // A. Upload File Desain ke Server
    const handleDesignSubmit = async (url: string) => {
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    try {
      const res = await fetch(`${apiUrl}/api/bookings/submit-design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, designUrl: url }),
      });
      const data = await res.json();
      if (res.ok) {
        setModalType('NONE');
        alert('✅ Desain Berhasil Dikirim!');
        router.refresh();
      } else {
        alert('Upload Gagal: ' + data.message);
      }
    } catch (err) {
      alert('Error Server');
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert('File terlalu besar! Maksimal 10MB.');

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('orderId', order.id);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    try {
      const res = await fetch(`${apiUrl}/api/uploads/design`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        await handleDesignSubmit(data.url);
      } else {
        alert('Upload Gagal: ' + data.message);
      }
    } catch (err) {
      alert('Error Server');
    }
    setLoading(false);
  };

  const handleLinkSubmit = async () => {
    if (!linkInput) return alert('Masukkan Link!');
    await handleDesignSubmit(linkInput);
  };

  // D. Batalkan Pesanan (Fase Pending)
  const handleCancelPending = async () => {
      if(!confirm("Yakin mau membatalkan pesanan?")) return;
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      await fetch(`${apiUrl}/api/bookings/cancel`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }) 
      });
      setLoading(false);
      router.refresh(); 
  };

  // E. Simulasi Bayar
  const handlePaySimulation = async () => {
       const confirmed = confirm(`[SIMULASI XENDIT]\n\nBayar tagihan sebesar Rp ${order.totalPrice.toLocaleString('id-ID')}?`);
       if (!confirmed) return;
       setLoading(true);
              const apiUrl = process.env.NEXT_PUBLIC_API_URL;
       try {
        const res = await fetch(`${apiUrl}/api/payments/notify`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id }) 
        });
        if(res.ok) {
            alert("Pembayaran Diterima! Status menunggu verifikasi Admin.");
            router.refresh();
        }
       } catch(e) {}
       setLoading(false);
  };

  // F. Submit Alasan Refund
  const handleSubmitReason = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      setLoading(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      await fetch(`${apiUrl}/api/bookings/request-refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'reason', orderId: order.id, reason: form.get("reason") })
      });
      alert("Permintaan dikirim. Menunggu persetujuan Admin.");
      setLoading(false);
      setModalType('NONE');
      router.refresh();
  }

  // G. Submit Nomor Rekening
  const handleSubmitBank = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      setLoading(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      await fetch(`${apiUrl}/api/bookings/request-refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              step: 'bank', 
              orderId: order.id, 
              bankName: form.get("bankName"), 
              bankAccount: form.get("bankAccount") 
          })
      });
      alert("Rekening disimpan. Dana diproses Admin.");
      setLoading(false);
      setModalType('NONE');
      router.refresh();
  }


  // --- VISUAL UI ---

  // Cek apakah user boleh upload desain?
  const canUploadDesign = ['PAID_CONFIRMED', 'DESIGN_RECEIVED', 'IN_PRODUCTION', 'ACTIVE'].includes(order.status);
  const isImageProof = order.refundProof?.startsWith('data:image');

  // Badge Status Warna-warni
  let statusBadge = <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">{order.status.replace('_', ' ')}</span>;
  if (order.status === 'PENDING_PAYMENT') statusBadge = <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${isExpired ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>{isExpired ? 'EXPIRED' : 'MENUNGGU PEMBAYARAN'}</span>;
  if (order.status === 'PAID_CONFIRMED') statusBadge = <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-bold animate-pulse">MENUNGGU VERIFIKASI</span>;
  if (['DESIGN_RECEIVED', 'IN_PRODUCTION'].includes(order.status)) statusBadge = <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-[10px] font-bold">SEDANG DIPRODUKSI</span>;
  if (order.status === 'INSTALLATION') statusBadge = <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-bold">SEDANG DIPASANG</span>;
  if (order.status === 'ACTIVE') statusBadge = <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-bold">TAYANG (LIVE)</span>;
  if (order.status === 'WAITING_BANK') statusBadge = <span className="bg-orange-100 text-orange-700 border border-orange-200 px-3 py-1 rounded-full text-[10px] font-bold uppercase animate-pulse">INPUT REKENING</span>;

  // --- RETURN HTML ---
  return (
    <>
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6 relative group hover:border-blue-200 transition">
        {/* HEADER */}
        <div className="bg-gray-50 px-6 py-3 flex justify-between items-center border-b border-gray-100">
             <div className='flex items-center gap-2'>
                <span className="text-xs font-bold text-gray-500">ORDER #{order.id.slice(-6).toUpperCase()}</span>
                <Link href={`/dashboard/order/${order.id}`} className="bg-white border p-1 rounded-md text-utero hover:bg-gray-50 transition" title="Lihat Timeline"><ExternalLink size={12}/></Link>
             </div>
             {statusBadge}
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* 1. KOLOM KIRI: INFO PRODUK */}
            <div className="md:col-span-2 flex gap-4">
                <img src={order.billboard?.mainImage || '/placeholder.jpg'} className="w-24 h-24 rounded-lg object-cover bg-gray-200 border border-gray-100" />
                <div className="flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-gray-800 line-clamp-1">{order.billboard?.title || "Billboard Tidak Ditemukan"}</h3>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin size={12}/> {order.billboard?.address?.slice(0,30)}...</p>
                    </div>
                    {order.billboard && (
                        <Link href={`/billboard/${order.billboard.slug}`} className="text-xs text-blue-600 font-bold hover:underline mt-2 flex items-center gap-1"><Eye size={12}/> Detail Billboard</Link>
                    )}
                </div>
            </div>

            {/* 2. KOLOM TENGAH: TOMBOL STATUS */}
            <div className="flex flex-col justify-center border-l border-r border-gray-100 px-6">
                <div className="mb-2">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Total Tagihan</p>
                    <p className="text-lg font-bold text-gray-900">Rp {order.totalPrice.toLocaleString('id-ID')}</p>
                </div>

                {/* Skenario 1: Pending & Belum Expired -> Bayar */}
                {order.status === 'PENDING_PAYMENT' && !isExpired && (
                     <div className='flex gap-2'>
                        <button onClick={handlePaySimulation} className="flex-1 bg-red-600 text-white text-xs py-2 rounded font-bold hover:bg-red-700 shadow-md">Bayar</button>
                        <button onClick={handleCancelPending} className="px-3 bg-gray-100 text-gray-500 text-xs py-2 rounded hover:bg-gray-200 font-bold">Batal</button>
                     </div>
                )}
                
                {/* Skenario 2: Active -> Bisa Minta Refund */}
                {order.status === 'ACTIVE' && (
                    <button onClick={() => setModalType('REASON_FORM')} className="mt-2 w-full border border-orange-200 text-orange-600 text-[10px] py-2 rounded font-bold hover:bg-orange-50 flex items-center justify-center gap-2">
                        <AlertTriangle size={12}/> Refund / Batal
                    </button>
                )}

                {/* Skenario 3: Waiting Bank -> Input Rekening */}
                {order.status === 'WAITING_BANK' && (
                    <button onClick={() => setModalType('BANK_FORM')} className="mt-2 w-full bg-utero text-white text-xs py-2 rounded font-bold shadow-lg hover:bg-red-700 animate-bounce">
                        💰 Input Nomor Rekening
                    </button>
                )}
                
                {/* Status Informasi */}
                {order.status === 'REVIEW_REFUND' && <p className="text-[10px] text-orange-600 mt-2 text-center bg-orange-50 py-1 rounded">Menunggu Review Admin...</p>}
                {order.status === 'PROCESS_REFUND' && <p className="text-[10px] text-blue-600 mt-2 text-center bg-blue-50 py-1 rounded">Dana sedang diproses transfer...</p>}

                {/* Skenario 4: Selesai Refund -> Lihat Bukti */}
                {order.status === 'REFUNDED' && order.refundProof && (
                    isImageProof ? (
                        <button onClick={() => setModalType('PROOF_IMAGE')} className="mt-2 w-full text-[10px] bg-green-50 text-green-700 border border-green-200 font-bold py-2 rounded flex items-center justify-center gap-1 hover:bg-green-100 transition"><CheckCircle2 size={12}/> Lihat Bukti Transfer</button>
                    ) : (
                        <a href={order.refundProof} target='_blank' className="mt-2 w-full text-[10px] bg-blue-50 text-blue-600 border border-blue-200 font-bold py-2 rounded flex items-center justify-center gap-1 hover:bg-blue-100 transition"><ExternalLink size={12}/> Buka Link Bukti</a>
                    )
                )}
            </div>

                                    {/* 3. KOLOM KANAN: AREA DESAIN (LOGIKA DISEMPURNAKAN) */}
            <div className="flex flex-col justify-center items-center">
                 {/* HANYA TAMPILKAN OPSI JIKA STATUS MEMUNGKINKAN */}
                 {canUploadDesign && order.status !== 'INSTALLATION' ? (
                    <>
                    {/* OPSI 1: USER BUTUH JASA DESAIN */}
                    {order.designOption === 'service' ? (
                        <div className="w-full h-full text-center bg-green-50 border-2 border-dashed border-green-200 text-green-800 rounded-xl flex flex-col items-center justify-center p-3">
                            <CheckCircle2 size={20} className="mb-2"/>
                            <p className="text-xs font-bold">Anda menggunakan Jasa Desain.</p>
                            <p className="text-[10px] mt-1">Tim kami akan segera menghubungi Anda via WhatsApp untuk proses kreatif.</p>
                        </div>
                    ) : (
                    // OPSI 2: USER UPLOAD SENDIRI
                    order.designFileUrl ? (
                        // SUDAH UPLOAD
                        <div className="w-full h-full border-2 border-gray-200 bg-gray-50 rounded-xl flex flex-col items-center justify-center p-3 text-center">
                            <div className='mb-3'>
                                {order.designStatus === 'APPROVED' && <span className="bg-green-100 text-green-700 px-2 py-1 text-[10px] font-bold rounded-full">APPROVED BY ADMIN</span>}
                                {order.designStatus === 'REJECTED' && <span className="bg-red-100 text-red-700 px-2 py-1 text-[10px] font-bold rounded-full">REJECTED</span>}
                                {(!order.designStatus || order.designStatus === 'PENDING_REVIEW') && <span className="bg-yellow-100 text-yellow-700 px-2 py-1 text-[10px] font-bold rounded-full animate-pulse">PENDING REVIEW</span>}
                            </div>
                            
                            {order.designStatus === 'REJECTED' && (
                                <p className="text-[10px] text-red-600 mb-2 bg-red-50 border border-red-100 p-1.5 rounded">
                                    <b>Alasan:</b> {order.designRejectionReason}
                                </p>
                            )}

                            <div className="flex gap-2 w-full">
                                <a href={order.designFileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-gray-300 text-gray-700 text-xs py-2 rounded font-bold hover:bg-gray-100 shadow-sm flex items-center justify-center gap-1">
                                    <ImageIcon size={12}/> Lihat
                                </a>
                                <button onClick={() => setModalType('DESIGN_FORM')} className="flex-1 bg-blue-600 text-white text-xs py-2 rounded font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center gap-1">
                                    <UploadCloud size={12}/> Ubah
                                </button>
                            </div>
                        </div>
                    ) : (
                    // BELUM UPLOAD
                    <button 
                        onClick={()=>setModalType('DESIGN_FORM')} 
                        className="w-full h-full border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-xl flex flex-col items-center justify-center text-blue-500 hover:text-utero hover:border-utero hover:bg-white transition p-2 cursor-pointer group"
                    >
                        <div className="bg-white p-2 rounded-full shadow-sm mb-2 group-hover:scale-110 transition"><UploadCloud size={20}/></div>
                        <span className="text-xs font-bold text-center">Upload Materi</span>
                        <span className="text-[9px] text-gray-400 mt-1">Img/PDF Max 10MB</span>
                    </button>
                    ))}
                    </>
                 ) : (
                    // Jika status tidak memungkinkan
                    <div className="text-center opacity-40">
                         {order.status==='INSTALLATION' ? (
                            <><p className='text-xs font-bold'>Sedang Pasang</p><p className='text-[9px]'>(Terkunci)</p></>
                         ) : (
                            <ImageIcon size={32} className='mx-auto'/>
                         )}
                    </div>
                 )}
            </div>
        </div>
    </div>

    {/* ======================= MODAL AREA ======================= */}

    {/* 1. MODAL UPLOAD DESAIN (BARU) */}
    {modalType === 'DESIGN_FORM' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-300">
            <div className="bg-white w-full max-w-md p-0 rounded-2xl shadow-2xl overflow-hidden relative">
                 <div className='bg-gray-50 px-6 py-4 border-b flex justify-between items-center'>
                    <h3 className="font-bold text-lg text-gray-800">Kirim Materi Iklan</h3>
                    <button onClick={()=>setModalType('NONE')} className='text-gray-400 hover:text-red-500'><X size={20}/></button>
                 </div>
                 
                 <div className='p-6'>
                    <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
                        <button onClick={() => setUploadMode('FILE')} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${uploadMode==='FILE' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Upload File</button>
                        <button onClick={() => setUploadMode('LINK')} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${uploadMode==='LINK' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Link Drive</button>
                    </div>

                    {uploadMode === 'FILE' ? (
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-blue-50 hover:border-blue-400 transition relative">
                             {loading ? (
                                <div className='flex flex-col items-center gap-2'><Loader2 className="animate-spin text-blue-500" size={32}/><p className='text-xs font-bold text-gray-600'>Mengupload...</p></div>
                             ) : (
                                <>
                                    <input type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer"/>
                                    <UploadCloud className="mx-auto text-gray-400 mb-2" size={40}/>
                                    <p className="text-sm font-bold text-gray-600">Klik untuk Pilih File</p>
                                    <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP, PDF (Max 10MB)</p>
                                </>
                             )}
                        </div>
                    ) : (
                        <div className='space-y-4'>
                            <label className='text-xs font-bold text-gray-500 uppercase'>Link Google Drive / Canva</label>
                            <input value={linkInput} onChange={e=>setLinkInput(e.target.value)} className='w-full border rounded-lg p-3 text-sm focus:border-blue-500 focus:outline-none' placeholder='https://drive.google.com/...'/>
                            <button onClick={handleLinkSubmit} disabled={loading} className='w-full bg-blue-600 text-white font-bold py-3 rounded-lg shadow-lg hover:bg-blue-700 transition'>
                                {loading ? 'Menyimpan...' : 'Kirim Link'}
                            </button>
                        </div>
                    )}
                 </div>
            </div>
        </div>
    )}

    {/* 2. MODAL REASON FORM (ALASAN BATAL) */}
    {modalType === 'REASON_FORM' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center"><h3 className="font-bold text-gray-800">Kenapa ingin batal?</h3><button onClick={() => setModalType('NONE')} className="text-gray-400 hover:text-red-500">✕</button></div>
                <form onSubmit={handleSubmitReason} className="p-6 space-y-4">
                    <div className="bg-yellow-50 text-yellow-800 text-xs p-3 rounded border border-yellow-200">⚠ Dana refund akan dipotong biaya admin 10%.</div>
                    <textarea name="reason" placeholder="Jelaskan alasan..." className="w-full border rounded-lg p-3 text-sm mt-1 h-24 focus:outline-none focus:border-utero" required></textarea>
                    <button disabled={loading} type="submit" className="w-full bg-utero text-white py-3 rounded-lg font-bold hover:bg-red-700 transition">{loading ? 'Mengirim...' : 'Ajukan Pembatalan'}</button>
                </form>
            </div>
        </div>
    )}

    {/* 3. MODAL BANK FORM (REKENING REFUND) */}
    {modalType === 'BANK_FORM' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-green-50 px-6 py-4 border-b flex justify-between items-center"><h3 className="font-bold text-green-800 flex items-center gap-2"><Landmark size={18}/> Input Rekening</h3><button onClick={() => setModalType('NONE')} className="text-gray-400 hover:text-red-500">✕</button></div>
                <form onSubmit={handleSubmitBank} className="p-6 space-y-4">
                    <p className="text-sm text-gray-600 mb-2">Dana refund 90% akan ditransfer ke:</p>
                    <div className="grid grid-cols-2 gap-4">
                        <input name="bankName" placeholder="Bank (cth: BCA)" className="w-full border rounded-lg p-3 text-sm font-bold" required />
                        <input name="bankAccount" type="number" placeholder="No Rekening" className="w-full border rounded-lg p-3 text-sm font-bold" required />
                    </div>
                    <button disabled={loading} type="submit" className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition">{loading ? 'Menyimpan...' : 'Konfirmasi'}</button>
                </form>
            </div>
        </div>
    )}

    {/* 4. MODAL BUKTI TRANSFER */}
    {modalType === 'PROOF_IMAGE' && order.refundProof && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-2xl max-h-[90vh] relative flex flex-col">
                <div className="bg-white px-4 py-3 border-b flex justify-between items-center sticky top-0 z-10">
                    <div className="flex items-center gap-2"><CheckCircle2 className="text-green-600" size={20}/><span className="font-bold text-gray-800">Bukti Transfer Refund</span></div>
                    <button onClick={() => setModalType('NONE')} className="bg-gray-100 p-1.5 rounded-full text-gray-500 hover:bg-red-500 hover:text-white transition"><X size={20}/></button>
                </div>
                <div className="p-2 bg-gray-200 flex-1 overflow-auto flex items-center justify-center"><img src={order.refundProof} alt="Bukti Transfer" className="max-w-full max-h-[70vh] rounded shadow-sm object-contain" /></div>
            </div>
        </div>
    )}
    </>
  )
}