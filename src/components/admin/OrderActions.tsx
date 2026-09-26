// src/components/admin/OrderActions.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    CheckCircle, XCircle, Loader2, AlertTriangle, UploadCloud,
    Eye, Printer, Hammer, Palette, Truck, Banknote, Wallet
} from 'lucide-react';
import Link from 'next/link';
import { rupiah } from '@/lib/money';

export default function OrderActions({
  order,
  currentUserRole,
  adaUangMasuk,
  nominalRefund,
  sisaPokok,
}: {
  order: any;
  currentUserRole: string;
  /**
   * Apakah pesanan ini punya `Payment PAID` pokok — dihitung server dari ledger.
   *
   * Dulu disimpulkan di sini sebagai `order.status === 'PAID_CONFIRMED'`. Status
   * bukan fakta uang: pesanan yang sudah dibayar lalu masuk produksi tidak lagi
   * berstatus `PAID_CONFIRMED`, sehingga tombol Tolak menghanguskannya sebagai
   * `CANCELLED` — status buntu yang bukan titik awal refund. Uangnya ada di
   * rekening perusahaan tanpa satu pun tombol yang bisa mengeluarkannya.
   */
  adaUangMasuk: boolean;
  /** Nominal refund yang sudah tercatat server, atau null bila belum ada. */
  nominalRefund: number | null;
  /**
   * Sisa tagihan POKOK menurut ledger, dihitung server (`sisaTagihan`).
   *
   * Dipakai modal pencatatan pembayaran manual sebagai nominal awal dan sebagai
   * batas atasnya. Server tetap memeriksanya sendiri di dalam transaksi — angka
   * di sini hanya supaya admin tidak perlu menghitungnya di kepala.
   */
  sisaPokok: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // STATE MODALS
  const [showTransferModal, setShowTransferModal] = useState(false); // Buat upload bukti trf
  const [showInstallModal, setShowInstallModal] = useState(false); // BUAT UPLOAD BUKTI TAYANG
  const [showDesignModal, setShowDesignModal] = useState(false); // BUAT LIHAT DESAIN USER
  const [showCatatModal, setShowCatatModal] = useState(false); // CATAT PEMBAYARAN MANUAL

  const [proofData, setProofData] = useState<string>("");
  const [installData, setInstallData] = useState<string>(""); // Data Foto Tayang
  const [nominalCatat, setNominalCatat] = useState<string>("");
  const [keteranganCatat, setKeteranganCatat] = useState<string>("");

  useEffect(() => {
      setProofData(order.refundProof || "");
      setInstallData(order.installationProof || "");
  }, [order]);

  const updateStatus = async (newStatus: string, extraData: any = {}) => {
      setLoading(true);
      try {
          const res = await fetch('/api/admin/update-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: order.id, newStatus, ...extraData })
          });
          const data = await res.json().catch(() => ({} as any));
          if (!res.ok) {
              alert('Gagal memperbarui status: ' + (data.message || `Server menolak (${res.status}).`));
              return;
          }
          setShowTransferModal(false);
          setShowInstallModal(false);
          router.refresh();
      } catch (err) {
          alert('Error Server: status tidak berubah.');
      } finally {
          setLoading(false);
      }
  };

  // --- HANDLERS HELPER ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: any) => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 2 * 1024 * 1024) { alert("Max 2MB"); return; }
          const reader = new FileReader();
          reader.onloadend = () => setter(reader.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleForceCancel = () => {
      const reason = prompt("Alasan Pembatalan Paksa?");
      if(reason) updateStatus('WAITING_BANK', { reason });
  };

  // Tombol "Tolak" dulu selalu mengirim `CANCELLED`, baik pesanannya sudah
  // dibayar maupun belum — dan itu menjebak uang pembeli. `CANCELLED` adalah
  // status buntu yang juga bukan titik awal pengajuan refund, jadi pesanan
  // `PAID_CONFIRMED` yang ditolak berakhir tanpa satu pun jalur pengembalian
  // dana: uangnya ada di rekening perusahaan, tapi tidak ada tombol mana pun
  // yang bisa mengeluarkannya lagi. Lihat catatan di src/lib/transisi-status.ts.
  //
  // Sekarang jalurnya ditentukan oleh ada-tidaknya uang yang sudah masuk
  // menurut ledger `Payment PAID` — dihitung server, dikirim sebagai
  // `adaUangMasuk`. Pesanan yang belum dibayar benar-benar dibatalkan, pesanan
  // yang sudah dibayar masuk ke alur refund yang sudah ada.
  const handleReject = () => {
      const sudahDibayar = adaUangMasuk;

      const reason = prompt(
          sudahDibayar
              ? 'Pesanan ini SUDAH DIBAYAR. Menolaknya berarti dananya harus dikembalikan.\n\nAlasan penolakan?'
              : 'Alasan tolak?'
      );
      if (!reason) return;

      if (sudahDibayar) {
          if (!confirm(
              'Pesanan akan masuk alur pengembalian dana: pembeli diminta mengisi ' +
              'rekening, lalu Anda mentransfer 90% dari uang yang sudah diterima ' +
              '(dipotong biaya admin 10%).\n\nLanjutkan?'
          )) return;
          updateStatus('WAITING_BANK', { reason });
          return;
      }

      updateStatus('CANCELLED', { reason });
  };

  // CATAT PEMBAYARAN MANUAL — uang yang masuk di luar gerbang pembayaran.
  //
  // Satu-satunya cara menulis `Payment PAID` selain webhook Xendit. Ada karena
  // tombol "Terima Manual" di bawah hanya memindahkan STATUS: sebelum route
  // pencatatan ini ada, pesanan yang dibayar lewat transfer langsung memasuki
  // tahap cetak dengan pembukuan kosong — uangnya tidak punya jejak, tidak masuk
  // laporan, dan tidak bisa dikembalikan lewat alur refund.
  //
  // `router.refresh()` dipanggil setelah berhasil supaya `adaUangMasuk` dan
  // `sisaPokok` yang dihitung server ikut diperbarui sebelum admin menekan
  // "Terima Manual".
  const handleCatatPembayaran = async () => {
      const nominal = Number(nominalCatat);
      if (!Number.isFinite(nominal) || nominal <= 0) {
          return alert("Nominal pembayaran harus angka lebih dari nol.");
      }
      if (!Number.isInteger(nominal)) {
          return alert("Nominal harus rupiah bulat, tanpa pecahan sen.");
      }
      if (nominal > sisaPokok) {
          return alert(
              `Nominal ${rupiah(nominal)} melebihi sisa tagihan pokok ${rupiah(sisaPokok)}.`
          );
      }

      if (!confirm(
          `Catat pembayaran masuk sebesar ${rupiah(nominal)}?\n\n` +
          `Nominal ini akan tercatat sebagai uang yang sudah diterima perusahaan ` +
          `dan menjadi batas atas pengembalian dana bila pesanan ini direfund. ` +
          `Pastikan uangnya benar-benar sudah ada di rekening.`
      )) return;

      setLoading(true);
      try {
          const res = await fetch('/api/admin/orders/record-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  orderId: order.id,
                  amount: nominalCatat,
                  keterangan: keteranganCatat,
              }),
          });
          const data = await res.json().catch(() => ({} as any));
          if (!res.ok) {
              alert('Gagal mencatat pembayaran: ' + (data.message || `Server menolak (${res.status}).`));
              return;
          }
          alert(data.message || 'Pembayaran tercatat.');
          setShowCatatModal(false);
          setNominalCatat("");
          setKeteranganCatat("");
          router.refresh();
      } catch {
          alert('Error Server: pembayaran tidak tercatat.');
      } finally {
          setLoading(false);
      }
  };

  // --- HANDLER PROSES PRODUKSI (ALUR BARU) ---

  // 1. TERIMA BAYAR
  //
  // Tombol ini hanya memindahkan TAHAP, tidak mencatat uang. Server menolak
  // perpindahan dari `PENDING_PAYMENT` ke tahap sesudah pembayaran bila belum ada
  // `Payment PAID` (422 `UANG_BELUM_TERCATAT`), jadi jalurnya diperiksa di sini
  // lebih dulu — supaya admin diberi tahu langkah yang benar, bukan sekadar
  // ditolak setelah menekan `confirm()`.
  const handleApprovePayment = () => {
      if (order.status === 'PENDING_PAYMENT' && !adaUangMasuk) {
          alert(
              'Pesanan ini belum punya pembayaran yang tercatat, jadi belum bisa ' +
              'dipindahkan ke tahap produksi.\n\n' +
              'Bila uangnya sudah diterima di luar gerbang pembayaran (mis. transfer ' +
              'langsung), catat dulu lewat tombol "Catat Pembayaran Manual" agar ' +
              'nominalnya masuk pembukuan dan bisa dikembalikan lewat alur refund ' +
              'bila perlu.'
          );
          return;
      }

      if(!confirm('Verifikasi pembayaran diterima?')) return;
      // Jika user pilih "Jasa Desain", langsung masuk Produksi.
      // Jika user "Upload Sendiri", masuk status menunggu desain / review desain.
      if (order.designOption === 'service') {
          updateStatus('IN_PRODUCTION'); // Langsung cetak karena kita yang desain
      } else {
          // Tunggu user upload atau kita verifikasi file mereka
          // Jika file sudah ada, masuk produksi. Jika belum, biarkan di fase desain.
          updateStatus(order.designFileUrl ? 'IN_PRODUCTION' : 'DESIGN_RECEIVED');
      }
  };

  // 2. VERIFIKASI DESAIN & MULAI CETAK
  const handleStartPrinting = () => {
      if(!confirm("File desain sudah OK? Mulai proses cetak?")) return;
      updateStatus('IN_PRODUCTION');
  };

  // 3. MULAI PEMASANGAN
  const handleStartInstall = () => {
      if(!confirm("Banner sudah dicetak? Mulai pengiriman & pemasangan?")) return;
      updateStatus('INSTALLATION');
  };

  // 4. SELESAI TAYANG (Upload Bukti)
  const handleFinishInstall = () => {
      if(!installData) return alert("Wajib upload foto bukti tayang!");
      updateStatus('ACTIVE', { installationProof: installData });
  };

  // 5. SELESAIKAN REFUND (Upload Bukti Transfer)
  //
  // `setShowTransferModal(true)` sudah dipanggil sejak lama, tapi modalnya tidak
  // pernah dirender — jadi tidak ada jalur mana pun untuk mengirim
  // `refundProof`. Sekarang server menolak `REFUNDED` tanpa bukti transfer (422),
  // sehingga tanpa modal ini alur refund tidak punya langkah terakhir.
  //
  // Hanya URL http/https yang diterima: `refundProof` dirender sebagai `src`
  // gambar di dashboard pelanggan, dan server menolak skema lain — termasuk
  // `data:` hasil unggah berkas.
  const handleFinishRefund = () => {
      const bukti = proofData.trim();
      if (!bukti) return alert("Wajib isi tautan bukti transfer.");

      let sah = false;
      try {
          const url = new URL(bukti);
          sah = url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
          sah = false;
      }
      if (!sah) {
          return alert("Tautan bukti transfer harus berupa URL http:// atau https://.");
      }

      if (!confirm(
          `Tandai refund SELESAI sebesar ${rupiah(nominalRefund)}?\n\n` +
          `Pastikan transfer sudah benar-benar dilakukan — status REFUNDED tidak bisa dibatalkan.`
      )) return;

      updateStatus('REFUNDED', { refundProof: bukti });
  };


  if (loading) return <Loader2 className="animate-spin text-gray-400 mx-auto" size={18} />;

  // Daftar yang sama dipakai server (`STATUS_BOLEH_BAYAR_LANJUTAN` di
  // `src/lib/pembayaran.ts`) untuk memutuskan bolehkah setoran dicatat. Ditulis
  // ulang di sini sebagai teks karena komponen client tidak pernah menerima enum
  // Prisma; server tetap yang memutuskan — ini hanya menyembunyikan tombol yang
  // pasti ditolak.
  const bolehCatatSetoran =
      sisaPokok > 0 &&
      ['PENDING_PAYMENT', 'PAID_CONFIRMED', 'DESIGN_RECEIVED', 'IN_PRODUCTION', 'INSTALLATION', 'ACTIVE']
          .includes(order.status);

  // ===============================================
  // BAGIAN UI TOMBOL DINAMIS
  // ===============================================
  
  const renderButtons = () => {
    // 1. BELUM BAYAR / KONFIRMASI BAYAR
    if (order.status === 'PENDING_PAYMENT' || order.status === 'PAID_CONFIRMED') {
        const isPaid = order.status === 'PAID_CONFIRMED';
        return (
            <div className="flex gap-2 justify-center">
                <button 
                    onClick={handleApprovePayment} 
                    className={`p-1.5 rounded transition flex items-center gap-1 ${isPaid ? 'bg-green-600 text-white shadow-lg animate-pulse' : 'bg-green-50 text-green-700 hover:bg-green-200'}`}
                    title={isPaid ? "Klik untuk Verifikasi" : "Terima Manual"}
                >
                    <CheckCircle size={16} strokeWidth={isPaid ? 3 : 2}/>
                    {isPaid && <span className="text-[10px] font-bold">Verifikasi</span>}
                </button>
                
                {/* Pesanan yang sudah dibayar diarahkan ke alur refund, bukan
                    dihanguskan — lihat `handleReject`. */}
                <button onClick={handleReject} className="bg-red-50 text-red-700 p-1.5 rounded hover:bg-red-600 hover:text-white transition" title={isPaid ? "Tolak & Kembalikan Dana" : "Tolak"}>
                    <XCircle size={16} />
                </button>
            </div>
        );
    }

    // 2. TAHAP DESAIN (User sudah bayar, tapi file belum dicek/diproses)
    if (order.status === 'DESIGN_RECEIVED') {
         return (
             <div className="flex gap-2">
                 <button onClick={() => setShowDesignModal(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded border border-blue-200" title="Lihat Desain User"><Eye size={16}/></button>
                 <button onClick={handleStartPrinting} className="flex items-center gap-1 bg-purple-100 text-purple-700 px-3 py-1.5 rounded text-[10px] font-bold hover:bg-purple-600 hover:text-white transition">
                     <Palette size={14}/> Acc & Cetak
                 </button>
             </div>
         )
    }

    // 3. TAHAP CETAK (Sedang Produksi)
    if (order.status === 'IN_PRODUCTION') {
        return (
             <button onClick={handleStartInstall} className="flex items-center gap-1 bg-orange-100 text-orange-700 px-3 py-1.5 rounded text-[10px] font-bold hover:bg-orange-600 hover:text-white transition w-full justify-center">
                 <Truck size={14}/> Kirim Pasang
             </button>
        )
    }

    // 4. TAHAP PEMASANGAN (Sedang di lapangan)
    if (order.status === 'INSTALLATION') {
        return (
             <button onClick={() => setShowInstallModal(true)} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition w-full justify-center shadow-md animate-bounce">
                 <Hammer size={14}/> Selesai & Upload
             </button>
        )
    }

    // 5. SUDAH TAYANG / REFUND (Flow selesai)
    if (order.status === 'ACTIVE') return (
        <button onClick={handleForceCancel} className="text-gray-400 hover:text-red-600 border border-gray-100 p-2 rounded flex gap-1 items-center transition text-[10px] bg-white shadow-sm hover:shadow" title="Batal Paksa"><AlertTriangle size={14}/> Batal</button>
    );

    // Flow Refund (Tetap Sama)
    if (order.status === 'WAITING_BANK') return <span className="text-[10px] text-orange-600 bg-orange-100 px-2 py-1 rounded">Wait User...</span>;
    if (order.status === 'REVIEW_REFUND') return (<div className="flex gap-2"><button onClick={() => updateStatus('WAITING_BANK')} className="bg-blue-50 text-blue-600 px-2 text-[10px] font-bold rounded">✅ OK</button><button onClick={() => updateStatus('ACTIVE')} className="bg-red-50 text-red-600 px-2 text-[10px] font-bold rounded">❌</button></div>);
    
    if (order.status === 'REFUNDED') {
        // Bukti refund yang tersimpan selalu URL http/https — server menolak
        // skema lain — jadi cukup dibuka di tab baru.
        return (
            <div className='flex gap-1'>
                <span className="p-1 text-green-600 bg-green-50 border rounded text-[10px]">Refunded</span>
                {order.refundProof && (
                    <a
                        href={order.refundProof}
                        target="_blank"
                        rel="noopener noreferrer"
                        className='p-1 border rounded text-gray-500 hover:text-gray-800'
                        title="Lihat bukti transfer"
                    >
                        <Eye size={14}/>
                    </a>
                )}
            </div>
        );
    }

    if (order.status === 'PROCESS_REFUND') {
        return (
            <button
                onClick={() => { setProofData(order.refundProof || ""); setShowTransferModal(true); }}
                className="bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-green-700 transition"
            >
                Trf Sekarang
            </button>
        );
    }
    
    return <span className="text-gray-300">-</span>;
  };


  return (
    <>
        <div className="flex items-center justify-center gap-2">
            {renderButtons()}

            {/* Tersedia di SETIAP tahap yang masih menerima pembayaran, bukan
                hanya `PENDING_PAYMENT`: pembeli DP yang melunasi sisanya lewat
                transfer langsung bisa melakukannya kapan saja selama pesanannya
                berjalan, dan tanpa tombol ini uang itu tidak punya jalur masuk
                pembukuan. */}
            {bolehCatatSetoran && (
                <button
                    onClick={() => { setNominalCatat(String(sisaPokok)); setShowCatatModal(true); }}
                    className="p-1.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition"
                    title={`Catat Pembayaran Manual (sisa ${rupiah(sisaPokok)})`}
                >
                    <Wallet size={16} />
                </button>
            )}

            {order.status !== 'CANCELLED' && (
                <div className="h-6 w-px bg-gray-200 mx-1"></div>
            )}

            {order.status !== 'CANCELLED' && (
                <Link href={`/invoice/${order.id}`} target="_blank" className="p-2 text-gray-400 hover:text-utero hover:bg-gray-50 rounded transition"><Printer size={16}/></Link>
            )}
        </div>

        {/* MODAL INSTALLATION PROOF (BARU) */}
        {showInstallModal && (
            <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-0 overflow-hidden">
                    <div className="bg-indigo-50 px-4 py-3 border-b flex justify-between items-center text-indigo-900 font-bold">
                        <span><Hammer size={16} className='inline mr-2'/>Bukti Pemasangan</span>
                        <button onClick={() => setShowInstallModal(false)}>✕</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="border-2 border-dashed p-6 text-center rounded-xl cursor-pointer hover:bg-indigo-50 transition relative">
                             <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setInstallData)} className="absolute inset-0 opacity-0 cursor-pointer"/>
                             {installData ? <img src={installData} className="max-h-32 mx-auto rounded shadow-sm"/> : <><UploadCloud className="mx-auto text-indigo-300 mb-2"/><p className="text-xs text-gray-500">Upload Foto Hasil Pasang</p></>}
                        </div>
                        <button onClick={handleFinishInstall} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-indigo-700">Tayangkan & Aktifkan</button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL BUKTI TRANSFER REFUND
            Langkah terakhir alur refund: admin sudah mentransfer, lalu mencatat
            buktinya. Unggah berkas TIDAK disediakan di sini — `refundProof`
            hanya menerima URL http/https, dan hasil `FileReader` adalah
            `data:` URL yang ditolak server tanpa jejak. */}
        {showTransferModal && (
            <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-0 overflow-hidden">
                    <div className="bg-green-50 px-4 py-3 border-b flex justify-between items-center text-green-900 font-bold">
                        <span><Banknote size={16} className='inline mr-2'/>Bukti Transfer Refund</span>
                        <button onClick={() => setShowTransferModal(false)}>✕</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs space-y-1 text-gray-600">
                            <div className="flex justify-between">
                                <span>Nominal transfer</span>
                                <span className="font-bold text-gray-900">{rupiah(nominalRefund)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Bank tujuan</span>
                                <span className="font-bold text-gray-900">{order.userBankName || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>No. rekening</span>
                                <span className="font-mono font-bold text-gray-900">{order.userBankAccount || '-'}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Tautan bukti transfer
                            </label>
                            <input
                                type="url"
                                value={proofData}
                                onChange={(e) => setProofData(e.target.value)}
                                placeholder="https://drive.google.com/..."
                                className="w-full border rounded-md p-2 text-xs"
                            />
                            <p className="mt-1 text-[10px] text-gray-400">
                                Unggah tangkapan layar transfer ke penyimpanan Anda, lalu tempel tautannya di sini.
                            </p>
                        </div>

                        <button
                            onClick={handleFinishRefund}
                            disabled={!proofData.trim()}
                            className="w-full bg-green-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-green-700 disabled:bg-gray-300 transition"
                        >
                            Tandai Refund Selesai
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL CATAT PEMBAYARAN MANUAL
            Menulis `Payment PAID` untuk uang yang masuk di luar gerbang
            pembayaran. Tidak memindahkan status pesanan: pencatatan uang dan
            perpindahan tahap adalah dua keputusan berbeda, dan menyatukannya di
            satu tombol adalah sebab pesanan bisa memasuki produksi dengan
            pembukuan kosong. */}
        {showCatatModal && (
            <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-0 overflow-hidden">
                    <div className="bg-amber-50 px-4 py-3 border-b flex justify-between items-center text-amber-900 font-bold">
                        <span><Wallet size={16} className='inline mr-2'/>Catat Pembayaran Manual</span>
                        <button onClick={() => setShowCatatModal(false)}>✕</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <p className="text-[11px] leading-relaxed text-gray-500">
                            Untuk uang yang diterima <b>di luar</b> gerbang pembayaran — mis. transfer
                            langsung ke rekening perusahaan. Nominal yang dicatat di sini menjadi
                            batas atas pengembalian dana bila pesanan direfund, jadi isi sesuai uang
                            yang benar-benar masuk.
                        </p>

                        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs space-y-1 text-gray-600">
                            <div className="flex justify-between">
                                <span>Harga pokok</span>
                                <span className="font-bold text-gray-900">{rupiah(order.totalPrice)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Sisa tagihan pokok</span>
                                <span className="font-bold text-gray-900">{rupiah(sisaPokok)}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Nominal diterima (Rp)
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={sisaPokok}
                                step={1}
                                value={nominalCatat}
                                onChange={(e) => setNominalCatat(e.target.value)}
                                className="w-full border rounded-md p-2 text-sm font-mono"
                            />
                            <p className="mt-1 text-[10px] text-gray-400">
                                Rupiah bulat, tanpa pecahan sen. Setoran sebagian akan tercatat sebagai
                                DP dan sisanya otomatis diterbitkan tagihan pelunasannya.
                            </p>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Keterangan (opsional)
                            </label>
                            <input
                                type="text"
                                value={keteranganCatat}
                                onChange={(e) => setKeteranganCatat(e.target.value)}
                                placeholder="Transfer BCA a/n Budi, 27 Sep"
                                className="w-full border rounded-md p-2 text-xs"
                            />
                        </div>

                        <button
                            onClick={handleCatatPembayaran}
                            disabled={!nominalCatat.trim()}
                            className="w-full bg-amber-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-amber-700 disabled:bg-gray-300 transition"
                        >
                            Catat Pembayaran
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL LIHAT DESAIN USER */}
        {showDesignModal && (
            <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-0 overflow-hidden">
                    <div className="bg-blue-50 px-4 py-3 border-b flex justify-between items-center text-blue-900 font-bold">
                        <span><Eye size={16} className='inline mr-2'/>Desain dari User</span>
                        <button onClick={() => setShowDesignModal(false)}>✕</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="bg-gray-100 p-4 rounded-lg flex justify-center items-center">
                            <img src={order.designFileUrl} alt="Desain User" className="max-w-full max-h-[60vh] rounded shadow-md"/>
                        </div>
                        <a 
                            href={order.designFileUrl} 
                            download={`design-${order.id}.jpg`} // Anda bisa sesuaikan nama filenya
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-blue-700 flex items-center justify-center gap-2"
                        >
                            <UploadCloud size={14} />
                            Download Desain
                        </a>
                    </div>
                </div>
            </div>
        )}
    </>
  );
}