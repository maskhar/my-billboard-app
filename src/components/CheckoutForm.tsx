// src/components/CheckoutForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Upload, AlertCircle, Calendar, FileText } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation'; // TAMBAH useSearchParams
import { useSession } from 'next-auth/react'; 

interface CheckoutProps {
  billboard: {
    id: string;
    title: string;
    type: string;
        price: number;
    mainImage: string;
  };
  startDate: string;
  duration: number;
}

export default function CheckoutForm({ billboard, startDate, duration: initialDuration }: CheckoutProps) {
  const router = useRouter();
  
  // STATE LOKAL BARU
  const [duration, setDuration] = useState(initialDuration || 1);
  const [paymentType, setPaymentType] = useState('full');
  const [designOption, setDesignOption] = useState('upload');
  const [needFaktur, setNeedFaktur] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Data User
  const { data: session } = useSession();

  // ==========================================================================
  // PRATINJAU HARGA — angka di bawah hanya untuk DILIHAT.
  //
  // Angka yang MENGIKAT dihitung ulang oleh server di
  // `src/app/api/booking/create/route.ts` dari harga billboard di database.
  // Dulu komponen ini mengirimkan `totalPrice` dan `dpAmount` hasil hitungannya
  // sendiri lewat payload, dan server menyimpannya apa adanya — artinya harga
  // pesanan ditentukan oleh browser pembeli, dan siapa pun bisa memesan
  // billboard Rp 300 juta seharga Rp 1 dengan satu perintah `curl`.
  //
  // Karena itu payload di handlePayment TIDAK BOLEH memuat nominal apa pun
  // lagi. Tarif di bawah wajib sama persis dengan konstanta di route tersebut
  // (PERSEN_PPN, BIAYA_ADMIN, PERSEN_DP) — kalau berbeda, pembeli melihat satu
  // angka di layar lalu ditagih angka lain.
  // ==========================================================================
  const pricePerMonth = billboard.price;
  const adminFee = 50000;

  // Dibulatkan ke rupiah utuh di setiap langkah, meniru pembulatan server.
  // Tanpa ini PPN 11% dan DP 60% meninggalkan pecahan sen yang membuat angka
  // di layar meleset dari angka yang tercatat di database.
  const bulatkan = (n: number) => Math.round(n);

  const subTotalSewa = bulatkan(pricePerMonth * duration);
  const ppn = bulatkan(subTotalSewa * 0.11);
  const grandTotal = bulatkan(subTotalSewa + ppn + adminFee);

  const mustPayNow = paymentType === 'full' ? grandTotal : bulatkan(grandTotal * 0.60);

  const handlePayment = async () => {
      const userRole = session?.user?.role;
      if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
          alert("⛔ MAAF AKSES DITOLAK!\n\nAdmin / Super Admin tidak diperbolehkan melakukan pemesanan.\nSilakan gunakan akun Customer untuk melakukan tes order.");
          return;
      }

      const dateInput = document.getElementById('startDateInput') as HTMLInputElement;
      if(!dateInput || !dateInput.value) {
          alert("⚠️ Harap pilih 'Rencana Mulai Tayang' terlebih dahulu!");
          return;
      }

      setIsLoading(true);

      // TIDAK ADA NOMINAL DI SINI, dan jangan ditambahkan kembali.
      // `paymentType` memilih SKEMA bayar (lunas / DP); besarnya ditentukan
      // server. Lihat catatan pratinjau harga di atas.
      const payload = {
          billboardId: billboard.id,
          duration: duration,
          paymentType: paymentType,
          designOption: designOption,
          startDateString: dateInput.value
      };

      try {
          const response = await fetch('/api/booking/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          // Respons error bisa saja bukan JSON (mis. halaman error), jadi
          // parsing dijaga agar pesan aslinya tidak tertelan oleh catch.
          const result = await response.json().catch(() => ({} as any));

          if (response.ok) {
              // Nominal yang dikonfirmasi diambil dari BALASAN SERVER, bukan
              // dari `mustPayNow` di layar. Keduanya seharusnya sama; kalau
              // suatu saat berbeda (tarif di sini tertinggal dari tarif
              // server), pembeli harus melihat angka yang benar-benar ditagih
              // — bukan angka yang tadi dipajang.
              const tagihan = typeof result.tagihanSekarang === 'number'
                  ? result.tagihanSekarang
                  : null;

              alert(
                  "✅ ORDER DITERIMA!\n\n" +
                  (tagihan !== null
                      ? `Nominal yang harus dibayar: Rp ${tagihan.toLocaleString('id-ID')}\n\n`
                      : "") +
                  "Silakan cek invoice di Dashboard."
              );
              router.push('/dashboard');
          } else {
              alert("❌ Gagal: " + (result.message || `Server menolak (${response.status}).`));
          }

      } catch (err) {
          console.error(err);
          alert("Terjadi kesalahan sistem.");
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* KOLOM KIRI */}
        <div className="lg:col-span-2 space-y-6">
            <button onClick={() => router.back()} className="flex items-center text-gray-500 hover:text-utero mb-2 transition text-sm font-semibold">
              <ArrowLeft size={18} className="mr-1" /> Batal / Kembali
            </button>

            {/* 1. DURASI & TANGGAL */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-utero text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span> 
                    Pilih Durasi Tayang
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[1, 3, 6, 12].map((bulan) => (
                        <div 
                            key={bulan}
                            onClick={() => setDuration(bulan)}
                            className={`cursor-pointer border-2 rounded-xl p-3 flex flex-col items-center justify-center transition ${duration === bulan ? 'border-utero bg-red-50 text-utero' : 'border-gray-200 text-gray-500 hover:border-red-200'}`}
                        >
                            <Calendar size={24} className="mb-2 opacity-80"/>
                            <span className="font-bold text-lg">{bulan} Bulan</span>
                            {/*
                              Badge "Hemat!" pada pilihan 12 bulan DIHAPUS.
                              Tidak ada potongan harga untuk durasi mana pun:
                              tarifnya lurus `harga × durasi`, sehingga 12 bulan
                              dihitung dengan harga per bulan yang sama persis
                              dengan 1 bulan. Badge itu menjanjikan diskon yang
                              tidak pernah diberikan — klaim yang menyesatkan
                              konsumen. Kalau nanti memang ada tarif bertingkat,
                              tambahkan potongannya di server lebih dulu
                              (booking/create), baru tampilkan labelnya di sini.
                            */}
                        </div>
                    ))}
                </div>

                <div className="bg-gray-50 p-4 rounded-xl border border-dashed border-gray-300">
                    <label className="text-xs font-bold text-gray-500 mb-1 block uppercase">Rencana Mulai Tayang</label>
                                        <input 
                        type="date" 
                        id="startDateInput"
                        defaultValue={startDate} // Gunakan defaultValue dari props
                        className="w-full bg-white border border-gray-300 rounded-lg p-2.5 outline-none focus:border-utero focus:ring-1 text-gray-800 font-bold" 
                    />
                </div>
            </div>

            {/* 2. DATA PENYEWA */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-utero text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span> 
                    Data Penyewa
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Nama Lengkap / Perusahaan</label>
                        <input type="text" className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 outline-none focus:border-utero focus:ring-1" placeholder="PT. Maju Jaya" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">WhatsApp</label>
                        <input type="number" className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 outline-none focus:border-utero focus:ring-1" placeholder="08..." />
                    </div>

                    <div className="md:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Email (Untuk Invoice)</label>
                        <input type="email" className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 outline-none focus:border-utero focus:ring-1" placeholder="admin@pt.com" />
                    </div>
                    
                    <div className="md:col-span-2 mt-2 bg-gray-50 p-3 rounded-lg flex items-center gap-3 border border-dashed border-gray-300">
                        <input type="checkbox" id="fakturCheck" className="w-5 h-5 accent-utero cursor-pointer" checked={needFaktur} onChange={(e) => setNeedFaktur(e.target.checked)} />
                        <label htmlFor="fakturCheck" className="text-sm text-gray-700 font-semibold cursor-pointer select-none flex items-center gap-2">
                           <FileText size={16}/> Saya butuh Faktur Pajak
                        </label>
                    </div>

                    {needFaktur && (
                         <div className="md:col-span-2">
                            <label className="text-xs font-bold text-utero">NOMOR NPWP</label>
                            <input type="number" className="w-full mt-1 border border-utero/30 bg-red-50 rounded-lg p-2.5 outline-none text-gray-800 font-bold" placeholder="00.000..." />
                        </div>
                    )}
                </div>
            </div>

            {/* 3. MATERI */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-utero text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span> 
                    Materi Desain
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div onClick={() => setDesignOption('upload')} className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center justify-center transition ${designOption === 'upload' ? 'border-utero bg-red-50' : 'border-gray-200'}`}>
                        <Upload className={designOption === 'upload' ? 'text-utero' : 'text-gray-400'} />
                        <span className={`mt-2 font-bold ${designOption === 'upload' ? 'text-utero' : 'text-gray-500'}`}>Saya Punya File</span>
                        <span className="text-xs text-center text-gray-400 mt-1">Format PDF/TIFF Siap Cetak</span>
                    </div>
                    <div onClick={() => setDesignOption('service')} className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center justify-center transition ${designOption === 'service' ? 'border-utero bg-red-50' : 'border-gray-200'}`}>
                        <AlertCircle className={designOption === 'service' ? 'text-utero' : 'text-gray-400'} />
                        <span className={`mt-2 font-bold ${designOption === 'service' ? 'text-utero' : 'text-gray-500'}`}>Butuh Jasa Desain</span>
                        <span className="text-xs text-center text-gray-400 mt-1">Admin akan menghubungi via WA</span>
                    </div>
                </div>
                 {/* Pesan Tambahan jika pilih Upload */}
                 {designOption === 'upload' && (
                    <div className="mt-4 p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50 text-center">
                        <p className="text-sm text-gray-500">Anda dapat mengupload file berukuran besar di <b>Dashboard Saya</b> setelah melakukan pembayaran.</p>
                    </div>
                )}
            </div>

            {/* 4. METODE BAYAR */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="bg-utero text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">4</span> 
                    Metode Bayar
                </h3>
                <div className="space-y-3">
                    <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition ${paymentType === 'full' ? 'border-utero bg-red-50' : 'border-gray-200'}`}>
                        <input type="radio" className="accent-utero w-5 h-5" checked={paymentType === 'full'} onChange={() => setPaymentType('full')}/>
                        <span className="ml-3 block font-bold text-gray-800">Bayar Full (100%)</span>
                    </label>

                    <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition ${paymentType === 'dp' ? 'border-utero bg-red-50' : 'border-gray-200'}`}>
                        <input type="radio" className="accent-utero w-5 h-5" checked={paymentType === 'dp'} onChange={() => setPaymentType('dp')}/>
                        <div className="ml-3">
                            <span className="block font-bold text-gray-800">Bayar DP (60%)</span>
                            <span className="text-xs text-red-500 font-bold block mt-1">*Sisa 40% dibayar H-3 Tayang</span>
                        </div>
                    </label>
                </div>
            </div>
        </div>

        {/* KOLOM KANAN (RINGKASAN) */}
        <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
                
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                    <div className="flex gap-4 mb-4 pb-4 border-b">
                         <img src={billboard.mainImage} className="w-16 h-16 rounded object-cover" />
                         <div>
                            <h4 className="font-bold text-sm text-gray-800 line-clamp-2">{billboard.title}</h4>
                            <p className="text-xs text-gray-500">{billboard.type}</p>
                        </div>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div className="flex justify-between items-center bg-gray-50 p-2 rounded">
                            <span className="text-gray-500 font-bold">Durasi</span>
                            <span className="font-bold text-utero">{duration} Bulan</span>
                        </div>
                        <div className="flex justify-between pt-2">
                             <span>Harga Pokok</span>
                             <span>Rp {subTotalSewa.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between">
                             <span>PPn 11%</span>
                             <span>Rp {ppn.toLocaleString('id-ID')}</span>
                        </div>
                         <div className="flex justify-between">
                             <span>Admin Fee</span>
                             <span>Rp {adminFee.toLocaleString('id-ID')}</span>
                        </div>
                    </div>

                     <div className="border-t pt-2">
                        <div className="flex justify-between font-bold text-gray-900 text-lg">
                            <span>Total Tagihan</span>
                            <span>Rp {grandTotal.toLocaleString('id-ID')}</span>
                        </div>
                        {needFaktur && <div className="text-[10px] text-right text-green-600 font-bold mt-1">✔ Pakai Faktur Pajak</div>}
                    </div>
                </div>

                <div className="bg-gray-900 p-6 rounded-2xl shadow-xl text-white">
                    <span className="text-gray-400 text-sm">Nominal yang dibayar sekarang:</span>
                    <div className="text-3xl font-bold mt-1 text-utero">
                        Rp {mustPayNow.toLocaleString('id-ID')}
                    </div>
                    <button onClick={handlePayment} disabled={isLoading} className="w-full bg-utero hover:bg-white hover:text-utero font-bold py-3 rounded-xl mt-6 transition duration-300 ring-2 ring-utero shadow-lg shadow-utero/50 disabled:opacity-50">
                        {isLoading ? 'Sedang Memproses...' : 'Bayar via Xendit'}
                    </button>
                </div>
            </div>
        </div>

    </div>
  );
}