// src/components/BookingCard.tsx
'use client';

import { useState, useEffect } from 'react';
import { CreditCard, UploadCloud, MapPin, Clock, Eye, Trash2, AlertTriangle, CornerUpLeft, Banknote, Landmark, CheckCircle2, ExternalLink, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// Komponen ini TIDAK menghitung uang. Setiap nominal yang dipakainya sudah
// dihitung server sebagai `Prisma.Decimal` lalu diserialisasi lewat
// `uangUntukClient` — lihat `src/app/dashboard/DashboardWrapper.tsx`.
//
// Dulu sisa tagihan dan perkiraan refund dihitung di sini dari `dpAmount` dan
// `totalPrice`. Dua alasan itu dipindahkan ke server:
//
//   1. `dpAmount` adalah RENCANA, bukan bukti uang masuk. Ia tidak berubah saat
//      pembeli melunasi sisanya, jadi kartu pesanan DP yang sudah lunas tetap
//      menagih sisa penuh selamanya.
//   2. Begitu Decimal menjadi angka biasa, operator `<` dan `-` bekerja tanpa
//      jaminan presisi yang dijaga money.ts — dan bila konversi di server suatu
//      saat lepas, `<` membandingkan dua objek sebagai teks ("900000000" lebih
//      kecil dari "99000000") sementara `-` menghasilkan NaN, keduanya tanpa
//      satu pun peringatan dari tsc.
//
// `angkaRupiah` tetap dipakai: ia memformat, bukan menghitung.
import { angkaRupiah } from '@/lib/money';

/**
 * Bentuk pesanan yang BOLEH menyeberang ke browser.
 *
 * Sebelumnya prop ini bertipe `any` dan halaman induk mengirim seluruh baris
 * Booking apa adanya. Akibatnya dua hal: kolom baru ikut menyeberang tanpa ada
 * yang memutuskan, dan salah tulis nama field tidak pernah tertangkap `tsc`.
 * Sejak tabel pembayaran ada, kolom yang menyeberang tanpa diputuskan bukan lagi
 * urusan kerapian — id sesi provider dan payload webhook tidak boleh sampai ke
 * browser. Daftar di bawah adalah kontraknya; menambah field berarti menambahnya
 * di sini lebih dulu.
 *
 * Nominal sudah berupa `number` karena halaman induk mengubahnya dengan
 * `uangUntukClient`, dan setiap angka turunan sudah dihitung di sana sebagai
 * Decimal. Komponen ini hanya menampilkannya — lihat catatan di kepala berkas.
 */
export type PesananUntukKartu = {
  id: string;
  status: string;
  /** ISO string; `null` pada pesanan lama yang tenggatnya tidak pernah dicatat. */
  expiresAt: string | null;
  totalPrice: number;
  /**
   * Pesanan ini direncanakan dibayar bertahap (DP), menurut catatan saat dibuat.
   *
   * Kesimpulan server, bukan hasil membandingkan dua nominal di sini. Ia BUKAN
   * bukti uang diterima — itu selalu `pokokMasuk`, dari baris `Payment` PAID.
   */
  rencanaDp: boolean;
  /** Nominal yang direncanakan dibayar di muka; `null` bila tidak tercatat. */
  dpRencana: number | null;
  /** Sisa menurut RENCANA setelah DP; `null` bila pesanan bukan skema DP. */
  sisaSetelahDpRencana: number | null;
  designOption: string | null;
  designFileUrl: string | null;
  designStatus: string | null;
  designRejectionReason: string | null;
  refundProof: string | null;
  billboard: {
    slug: string;
    title: string;
    address: string;
    mainImage: string;
  } | null;
  /**
   * Tujuan tagihan yang akan dibuka berikutnya, atau `null` bila tidak ada.
   *
   * Sengaja `string`, bukan enum `PaymentTujuan` milik Prisma: mengimpor enum itu
   * ke berkas `'use client'` menarik runtime Prisma ke bundle browser.
   */
  tujuanTagihan: string | null;
  /**
   * Bolehkah tagihan itu dibayar sekarang?
   *
   * Kesimpulan `periksaKelayakanSesi` di server — SATU aturan untuk kartu ini,
   * halaman pembayaran, dan endpoint sesi. Sebelumnya kartu ini menebaknya dari
   * empat syarat hardcode yang menyembunyikan tombol dari setiap pelunasan yang
   * sah, karena pesanan yang sudah dibayar DP bukan lagi `PENDING_PAYMENT`.
   */
  bolehBayar: boolean;
  /** Sisa biaya tambahan yang belum dibayar; di luar `totalPrice`. */
  sisaTambahan: number;
  /** ISO string tenggat pelunasan H-3 sebelum tanggal tayang. */
  tenggatPelunasanISO: string;
  /** Masih ada sisa pokok DAN tenggat H-3 sudah lewat. Ditandai, tidak diblokir. */
  terlambatLunas: boolean;
  /** Uang pokok yang sudah benar-benar diterima (`Payment PAID`, tanpa TAMBAHAN). */
  pokokMasuk: number;
  /** Sisa pokok sewa yang belum dibayar; nol bila lunas. */
  sisaPokok: number;
  /** Sudah ada setidaknya satu rupiah pokok yang diterima. */
  adaUangMasuk: boolean;
  /** Sudah ada uang masuk TAPI belum lunas — pesanan DP yang menggantung. */
  dibayarSebagian: boolean;
  /** Pokok sewa sudah lunas menurut ledger. */
  pokokLunas: boolean;
  /** Perkiraan refund dari uang yang sudah masuk; nominal pasti dihitung server. */
  perkiraanRefund: number;
  /** Refund yang sudah ditetapkan server, atau `null` bila belum diproses. */
  refundAmount: number | null;
};

export default function BookingCard({ order }: { order: PesananUntukKartu }) {
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
  //
  // Dulu tenggatnya dihitung di sini sebagai `createdAt + 24 jam` — angka tetap
  // yang hanya hidup di browser. Dua akibatnya:
  //
  //   1. Tenggat yang ditampilkan adalah TEBAKAN komponen ini, bukan tenggat
  //      yang ditegakkan sistem. Kalau aturan 24 jam berubah di server, layar
  //      tetap menghitung 24 jam.
  //   2. Hitung mundur habis, kartunya berubah "EXPIRED" — tapi barisnya tetap
  //      PENDING_PAYMENT di database, dan pesanan PENDING_PAYMENT ikut mengunci
  //      tanggal billboard. Inventori terkunci selamanya oleh pesanan yang
  //      menurut layarnya sendiri sudah mati.
  //
  // Sekarang tenggatnya dibaca dari kolom `expiresAt`, fakta yang ditulis
  // server saat pesanan dibuat. Pengekspirasian sesungguhnya dikerjakan
  // `sapuPesananKedaluwarsa` di `src/lib/transisi-status.ts`, yang dipanggil
  // dari jalur pembuatan pesanan — timer ini hanya menampilkannya.
  useEffect(() => {
    if (order.status !== 'PENDING_PAYMENT') return;

    // Pesanan lama dibuat sebelum kolom `expiresAt` ada, jadi tenggatnya tidak
    // pernah tercatat. Menebaknya dari `createdAt` berarti menampilkan
    // "EXPIRED" untuk pesanan yang tidak akan dihanguskan penyapu mana pun
    // (penyapu sengaja melewati baris ber-`expiresAt` kosong). Lebih jujur
    // tidak menampilkan hitung mundur sama sekali.
    if (!order.expiresAt) {
        setTimeLeft("");
        setIsExpired(false);
        return;
    }

    const deadline = new Date(order.expiresAt).getTime();

    const hitung = () => {
        const dist = deadline - new Date().getTime();
        if (dist <= 0) {
            setIsExpired(true);
            setTimeLeft("EXPIRED");
            return;
        }
        setIsExpired(false);
        const h = Math.floor(dist / (3600 * 1000));
        const m = Math.floor((dist % (3600 * 1000)) / (60 * 1000));
        const s = Math.floor((dist % (60 * 1000)) / 1000);
        setTimeLeft(`${h}j ${m}m ${s}d`);
    };

    // Dipanggil sekali di depan: tanpa ini layar kosong selama satu detik
    // pertama, dan pesanan yang sudah lewat tenggat sempat terlihat hidup.
    hitung();
    const interval = setInterval(hitung, 1000);
    return () => clearInterval(interval);
  }, [order.status, order.expiresAt]);


  // LOGIKA 2: HANDLING TOMBOL UTAMA

  // A. Upload File Desain ke Server
    const handleDesignSubmit = async (url: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/booking/submit-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, designUrl: url }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok) {
        setModalType('NONE');
        alert('✅ Desain Berhasil Dikirim!');
        router.refresh();
      } else {
        alert('Upload Gagal: ' + (data.message || `Server menolak (${res.status}).`));
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

    try {
      // Sengaja TANPA header Content-Type: browser harus menyusunnya sendiri
      // lengkap dengan boundary multipart.
      const res = await fetch('/api/upload/design', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok) {
        await handleDesignSubmit(data.url);
      } else {
        alert('Upload Gagal: ' + (data.message || `Server menolak (${res.status}).`));
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
      try {
        const res = await fetch('/api/booking/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id })
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          alert('Gagal membatalkan: ' + (data.message || `Server menolak (${res.status}).`));
          return;
        }
        router.refresh();
      } catch (err) {
        alert('Error Server');
      } finally {
        setLoading(false);
      }
  };

  // E. Bayar: tautan ke halaman Pembayaran Otomatis milik pembeli.
  //
  // Sebelumnya tombol di kartu ini memanggil `/api/payment/notify` — endpoint
  // WEBHOOK, yang hanya boleh dipanggil server gerbang pembayaran dengan token
  // rahasia. Panggilan dari browser selalu ditolak, jadi tombolnya tidak pernah
  // membayar apa pun; yang lebih berbahaya adalah bentuknya, karena ia
  // memperlakukan browser sebagai sumber kebenaran soal uang masuk.
  //
  // Sekarang kartu ini tidak lagi memiliki jalur pembayaran sendiri. Ia hanya
  // menavigasi ke halaman pembayaran; sesi dibuat server, dan pelunasan tetap
  // ditetapkan webhook.

  // F. Submit Alasan Refund
  const handleSubmitReason = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      setLoading(true);
      try {
        const res = await fetch('/api/booking/request-refund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: 'reason', orderId: order.id, reason: form.get("reason") })
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) {
            alert("Gagal mengirim permintaan: " + (data.message || `Server menolak (${res.status}).`));
            return;
        }
        alert("Permintaan dikirim. Menunggu persetujuan Admin.");
        setModalType('NONE');
        router.refresh();
      } catch (err) {
        alert('Error Server');
      } finally {
        setLoading(false);
      }
  }

  // G. Submit Nomor Rekening
  const handleSubmitBank = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      setLoading(true);
      try {
        const res = await fetch('/api/booking/request-refund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                step: 'bank',
                orderId: order.id,
                bankName: form.get("bankName"),
                bankAccount: form.get("bankAccount")
            })
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) {
            alert("Gagal menyimpan rekening: " + (data.message || `Server menolak (${res.status}).`));
            return;
        }
        alert("Rekening disimpan. Dana diproses Admin.");
        setModalType('NONE');
        router.refresh();
      } catch (err) {
        alert('Error Server');
      } finally {
        setLoading(false);
      }
  }


  // --- VISUAL UI ---

  // Cek apakah user boleh upload desain?
  const canUploadDesign = ['PAID_CONFIRMED', 'DESIGN_RECEIVED', 'IN_PRODUCTION', 'ACTIVE'].includes(order.status);
  const isImageProof = order.refundProof?.startsWith('data:image');

  // Pesanan yang uangnya sudah keluar lagi, atau tidak akan pernah masuk, tidak
  // punya sisa tagihan yang perlu ditagih. Menampilkan "sisa" pada pesanan yang
  // sedang direfund berarti menagih orang yang justru sedang menunggu uangnya
  // kembali.
  const tagihanSudahSelesai = ['CANCELLED', 'REFUNDED', 'REVIEW_REFUND', 'WAITING_BANK', 'PROCESS_REFUND']
      .includes(order.status);

  // Pembayaran PERTAMA (`DP`/`FULL`) adalah satu-satunya yang hidup di bawah
  // hitung mundur 24 jam. Pelunasan dan biaya tambahan terjadi pada pesanan yang
  // tanggalnya sudah benar-benar dipegang, jadi timer di kartu ini tidak berlaku
  // bagi keduanya — menampilkannya berarti mengancam pembeli dengan tenggat yang
  // sudah lewat sejak lama.
  const bayarPertama =
    order.tujuanTagihan === 'DP' || order.tujuanTagihan === 'FULL';

  const labelTombolBayar =
    order.tujuanTagihan === 'PELUNASAN'
      ? 'Lunasi Sekarang'
      : order.tujuanTagihan === 'TAMBAHAN'
        ? 'Bayar Biaya Tambahan'
        : 'Bayar';

  // Tenggat pelunasan ditampilkan tanpa jam: ia jatuh pada 23:59:59.999, dan
  // menuliskan jamnya membuat pembeli mengira ada hitungan menit yang dikejar.
  const tenggatLunas = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' })
    .format(new Date(order.tenggatPelunasanISO));

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
                    <p className="text-lg font-bold text-gray-900">Rp {angkaRupiah(order.totalPrice)}</p>

                    {/*
                      Pesanan DP yang BELUM dibayar: yang harus disetor sekarang
                      bukan totalnya. Tanpa baris ini pembeli hanya melihat nilai
                      penuh dan mengira itulah tagihannya — padahal ia memilih DP.

                      Syaratnya sengaja mencakup "belum ada uang masuk": begitu
                      pembayaran pertama diterima, panel di bawah yang berlaku,
                      karena angkanya berasal dari fakta dan bukan rencana lagi.
                    */}
                    {order.rencanaDp && order.status === 'PENDING_PAYMENT' && !order.adaUangMasuk && (
                        <div className="mt-1 bg-orange-50 border border-orange-100 rounded px-2 py-1">
                            <p className="text-[9px] text-orange-600 font-bold uppercase">Dibayar Sekarang (DP)</p>
                            <p className="text-sm font-bold text-orange-700">Rp {angkaRupiah(order.dpRencana)}</p>
                            <p className="text-[9px] text-orange-500">
                                Sisa Rp {angkaRupiah(order.sisaSetelahDpRencana)} dibayar H-3 tayang
                            </p>
                        </div>
                    )}

                    {/*
                      Sisa tagihan setelah sebagian uang diterima.

                      Angka di panel ini dulu `totalPrice - dpAmount`, yaitu sisa
                      MENURUT RENCANA. `dpAmount` tidak pernah berubah ketika
                      pembeli melunasi sisanya, jadi pesanan DP yang sudah lunas
                      tetap menampilkan sisa penuh — pembeli ditagih untuk kedua
                      kalinya atas uang yang sudah ia kirim. Sekarang angkanya
                      `sisaPokok`, hasil `totalPrice` dikurangi seluruh
                      `Payment PAID`, dan panelnya hilang dengan sendirinya
                      begitu pesanan lunas.

                      Syarat `dibayarSebagian` juga menutup celah kedua: panel
                      "Dibayar Sekarang" di atas hanya hidup saat
                      PENDING_PAYMENT, sehingga tanpa panel ini pembeli DP tidak
                      pernah melihat sisa tagihannya lagi sepanjang alur pesanan.
                    */}
                    {order.dibayarSebagian && !tagihanSudahSelesai && (
                        <div
                          className={`mt-1 rounded px-2 py-1 border ${
                            order.terlambatLunas
                              ? 'bg-red-50 border-red-200'
                              : 'bg-amber-50 border-amber-200'
                          }`}
                        >
                            <p className={`text-[9px] font-bold uppercase ${order.terlambatLunas ? 'text-red-700' : 'text-amber-700'}`}>
                                Sisa Yang Harus Dilunasi
                            </p>
                            <p className={`text-sm font-bold ${order.terlambatLunas ? 'text-red-800' : 'text-amber-800'}`}>
                                Rp {angkaRupiah(order.sisaPokok)}
                            </p>
                            {/*
                              Tenggat H-3 ditandai, TIDAK ditegakkan: tagihannya
                              tetap bisa dibayar setelah tanggal itu. Uangnya
                              dibutuhkan untuk mencetak dan memasang, jadi menolak
                              pembayaran hanya membuat pesanan mandek tanpa jalan
                              keluar. Teksnya karena itu menyebut keterlambatan
                              sekaligus menegaskan pembayaran masih dibuka.

                              Tanggalnya dihitung server (`tenggatPelunasan` atas
                              `startDate`), bukan di sini: tenggat yang dihitung
                              browser mengikuti zona waktu perangkat pembeli, dan
                              dua pembeli akan melihat batas yang berbeda untuk
                              tagihan yang sama.
                            */}
                            {order.terlambatLunas ? (
                                <p className="text-[9px] text-red-600">
                                    Terlambat sejak {tenggatLunas}. Pembayaran masih dibuka — Rp {angkaRupiah(order.pokokMasuk)} sudah kami terima.
                                </p>
                            ) : (
                                <p className="text-[9px] text-amber-600">
                                    Rp {angkaRupiah(order.pokokMasuk)} sudah kami terima. Pelunasan paling lambat {tenggatLunas}.
                                </p>
                            )}
                        </div>
                    )}

                    {/*
                      Biaya tambahan punya panelnya sendiri, TIDAK dicampur ke
                      sisa pokok di atas. `AdditionalCharge` berada di luar
                      `totalPrice`, jadi menjumlahkannya ke pokok membuat pesanan
                      yang pokoknya sudah lunas terlihat belum lunas — dan pembeli
                      tidak bisa tahu angka mana yang sedang ditagih.
                    */}
                    {order.sisaTambahan > 0 && !tagihanSudahSelesai && (
                        <div className="mt-1 bg-sky-50 border border-sky-200 rounded px-2 py-1">
                            <p className="text-[9px] text-sky-700 font-bold uppercase">Biaya Tambahan</p>
                            <p className="text-sm font-bold text-sky-800">Rp {angkaRupiah(order.sisaTambahan)}</p>
                            <p className="text-[9px] text-sky-600">Di luar total tagihan sewa.</p>
                        </div>
                    )}

                    {/*
                      Pesanan lunas perlu dinyatakan lunas. Tanpa ini pembeli
                      yang sudah membayar penuh tidak pernah melihat konfirmasi
                      apa pun di kartunya — hanya "Total Tagihan" yang terlihat
                      sama saja dengan pesanan yang belum dibayar sepeser pun.
                    */}
                    {order.adaUangMasuk && order.pokokLunas && !tagihanSudahSelesai && (
                        <div className="mt-1 bg-green-50 border border-green-200 rounded px-2 py-1">
                            <p className="text-[9px] text-green-700 font-bold uppercase">Lunas</p>
                            <p className="text-[9px] text-green-600">Rp {angkaRupiah(order.pokokMasuk)} sudah kami terima.</p>
                        </div>
                    )}
                </div>

                {/* Skenario 1: tagihan aktif -> buka Pembayaran Otomatis.
                    `bolehBayar` berasal dari `periksaKelayakanSesi` di server.
                    Browser tidak menebak syaratnya: gerbang lama di sini —
                    `status === 'PENDING_PAYMENT' && expiresAt masih hidup` —
                    menyembunyikan tombol dari setiap pelunasan yang sah, karena
                    pesanan yang sudah dibayar DP bukan lagi PENDING_PAYMENT dan
                    tenggat 24 jamnya sudah lewat. Pembeli DP melihat panel
                    "Sisa Yang Harus Dilunasi" tanpa satu pun tombol.

                    `isExpired` hanya menutup tombol pada pembayaran PERTAMA,
                    karena hitung mundur itu memang menghitung tenggat 24 jam
                    pesanan baru — bukan tenggat pelunasan. */}
                {order.bolehBayar && !(bayarPertama && isExpired) && (
                     <div className='flex flex-col gap-2'>
                        {/* Sisa waktu dibaca dari kolom expiresAt — lihat catatan timer di atas. */}
                        {bayarPertama && timeLeft && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
                                <Clock size={11} /> Sisa waktu bayar: {timeLeft}
                            </div>
                        )}
                        <div className='flex gap-2'>
                            <Link
                              href={`/dashboard/order/${encodeURIComponent(order.id)}/payment`}
                              className="flex-1 bg-utero text-white text-xs py-2 rounded font-bold text-center hover:opacity-90 transition"
                            >
                              {labelTombolBayar}
                            </Link>
                            {/* Pembatalan hanya berlaku pada pesanan yang belum
                                dibayar sepeser pun. Pesanan yang uangnya sudah
                                masuk dibatalkan lewat jalur refund, bukan lewat
                                tombol ini. */}
                            {order.status === 'PENDING_PAYMENT' && !order.adaUangMasuk && (
                                <button onClick={handleCancelPending} disabled={loading} className="px-3 bg-gray-100 text-gray-500 text-xs py-2 rounded hover:bg-gray-200 font-bold disabled:opacity-50">Batal</button>
                            )}
                        </div>
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
                    {/*
                      Dasar refund disebut lengkap: 90% dari UANG YANG SUDAH
                      MASUK, bukan dari nilai pesanan. Pada pesanan DP dua
                      angka itu jauh berbeda, dan kalimat lama ("dipotong
                      biaya admin 10%") membuat pembeli mengira ia akan
                      menerima 90% dari total pesanan — termasuk bagian yang
                      belum pernah ia bayarkan.

                      Angkanya dulu dihitung di sini sebagai `persen(dpAmount, 90)`
                      — 90% dari RENCANA DP. Pembeli DP yang sudah melunasi
                      sisanya diberi tahu bahwa ia hanya akan menerima 90% dari
                      DP-nya, padahal server menghitung dari seluruh uang yang
                      masuk: angka di layar jauh lebih kecil dari yang
                      sebenarnya ia terima. Sekarang `perkiraanRefund` dihitung
                      server dari `Payment PAID`.
                    */}
                    <div className="bg-yellow-50 text-yellow-800 text-xs p-3 rounded border border-yellow-200">
                        ⚠ Dana yang dikembalikan adalah <b>90% dari pembayaran yang sudah Anda lakukan</b> (dipotong biaya admin 10%).
                        {order.adaUangMasuk && (
                            <>
                                {' '}Pembayaran yang sudah kami terima <b>Rp {angkaRupiah(order.pokokMasuk)}</b>,
                                sehingga perkiraan refund <b>Rp {angkaRupiah(order.perkiraanRefund)}</b>.
                                Nominal pastinya dihitung ulang saat pengajuan Anda diproses.
                            </>
                        )}
                    </div>
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
                    {/* `refundAmount` ditetapkan server saat pengajuan disetujui.
                        Bila sudah ada, itulah angka yang akan ditransfer — bukan
                        perkiraan. Bila belum, hanya dasarnya yang disebut. */}
                    <p className="text-sm text-gray-600 mb-2">
                        {order.refundAmount === null ? (
                            <>Dana refund (90% dari pembayaran yang sudah masuk) akan ditransfer ke:</>
                        ) : (
                            <>
                                Dana refund <b>Rp {angkaRupiah(order.refundAmount)}</b> akan ditransfer ke:
                            </>
                        )}
                    </p>
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