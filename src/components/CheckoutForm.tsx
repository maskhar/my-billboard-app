// src/components/CheckoutForm.tsx
'use client';

import { useState } from 'react';
import { ArrowLeft, Upload, AlertCircle, Calendar, FileText } from 'lucide-react';
// `useEffect` dan `useSearchParams` dibuang dari impor: keduanya sudah tidak
// dipakai sejak `startDate` dan `duration` menjadi props yang dihitung server.
// Impor menganggur bukan sekadar berkas yang lebih panjang — `useSearchParams`
// yang masih terimpor membuat pembaca berikutnya menyimpulkan komponen ini
// masih membaca query string, lalu mencari-cari di mana.
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { bacaBadan } from '@/lib/baca-jawaban';
import { useToast } from '@/components/ui/Toast';
import { BIAYA_ADMIN, PERSEN_DP, PERSEN_PPN, persenAngka } from '@/lib/tarif';

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
  /** Identitas yang sudah tersimpan di akun, untuk mengisi formulir di bawah. */
  penyewa: {
    name: string;
    email: string;
    whatsapp: string;
    companyName: string;
    npwp: string;
  };
}

export default function CheckoutForm({ billboard, startDate, duration: initialDuration, penyewa }: CheckoutProps) {
  const router = useRouter();
  const toast = useToast();

  // STATE LOKAL BARU
  const [duration, setDuration] = useState(initialDuration || 1);
  const [paymentType, setPaymentType] = useState('full');
  const [designOption, setDesignOption] = useState('upload');
  const [needFaktur, setNeedFaktur] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ==========================================================================
  // DATA PENYEWA — dulu empat kolom yang isinya dibuang.
  //
  // Keempat `<input>` di blok "Data Penyewa" tidak punya `value` maupun
  // `onChange`, dan payload di `handlePayment` tidak pernah memuat satu pun di
  // antaranya. Pembeli mengisi nama, WhatsApp, email, dan NPWP-nya, menekan
  // tombol, dan seluruh isian itu hilang tanpa jejak — lalu halaman pembayaran
  // berikutnya MENOLAK dengan "Lengkapi nama lengkap, nomor WhatsApp di
  // Pengaturan Akun sebelum membayar", tepat untuk kolom yang baru saja diisi.
  //
  // Nilai awalnya datang dari server (`penyewa`), bukan dari `useSession()`:
  // token JWT dibuat saat login dan tidak memuat `whatsapp`, `companyName`,
  // maupun `npwp` sama sekali.
  // ==========================================================================
  const [nama, setNama] = useState(penyewa.name);
  const [whatsapp, setWhatsapp] = useState(penyewa.whatsapp);
  const [perusahaan, setPerusahaan] = useState(penyewa.companyName);
  const [npwp, setNpwp] = useState(penyewa.npwp);
  const [galatIdentitas, setGalatIdentitas] = useState<string | null>(null);

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
  // lagi.
  //
  // Tarifnya sekarang DIIMPOR dari `src/lib/tarif.ts`, berkas yang sama yang
  // dibaca route di atas — dulu `11`, `50000`, dan `0.60` ditulis ulang di sini
  // sebagai angka telanjang, dengan komentar yang hanya MEMINTA keduanya tetap
  // sama. Permintaan itu tidak diperiksa siapa pun: satu tarif dinaikkan di
  // route dan tidak di sini, dan pembeli melihat satu angka di layar lalu
  // ditagih angka lain.
  //
  // `tarif.ts` sengaja nol impor, jadi membacanya dari Client Component ini
  // tidak menarik runtime Prisma ke bundel browser.
  // ==========================================================================
  const pricePerMonth = billboard.price;
  const adminFee = BIAYA_ADMIN;

  // Dibulatkan ke rupiah utuh di setiap langkah, meniru pembulatan server.
  // Tanpa ini PPN dan DP meninggalkan pecahan sen yang membuat angka di layar
  // meleset dari angka yang tercatat di database.
  const bulatkan = (n: number) => Math.round(n);

  const subTotalSewa = bulatkan(pricePerMonth * duration);
  const ppn = persenAngka(subTotalSewa, PERSEN_PPN);
  const grandTotal = bulatkan(subTotalSewa + ppn + adminFee);

  const mustPayNow = paymentType === 'full' ? grandTotal : persenAngka(grandTotal, PERSEN_DP);

  const handlePayment = async () => {
      const userRole = session?.user?.role;
      if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
          toast.galat(
              'Akses ditolak. Akun admin tidak diperbolehkan memesan.\n' +
              'Gunakan akun customer untuk mencoba alur pemesanan.'
          );
          return;
      }

      const dateInput = document.getElementById('startDateInput') as HTMLInputElement;
      if(!dateInput || !dateInput.value) {
          toast.galat("Pilih 'Rencana Mulai Tayang' terlebih dahulu.");
          return;
      }

      // Pemeriksaan di sini hanya untuk MENGHEMAT satu perjalanan ke server dan
      // menandai kolomnya di layar. Yang mengikat tetap `bacaIdentitasPenyewa`
      // di server — pemeriksaan browser bisa dilewati dengan `curl`.
      if (nama.trim() === '') {
          setGalatIdentitas('Nama lengkap penyewa wajib diisi.');
          return;
      }
      if (whatsapp.trim() === '') {
          setGalatIdentitas('Nomor WhatsApp wajib diisi. Contoh: 08123456789.');
          return;
      }
      if (needFaktur && npwp.replace(/\D/g, '').length === 0) {
          setGalatIdentitas('Faktur pajak membutuhkan NPWP 15 atau 16 digit.');
          return;
      }
      setGalatIdentitas(null);

      setIsLoading(true);

      // TIDAK ADA NOMINAL DI SINI, dan jangan ditambahkan kembali.
      // `paymentType` memilih SKEMA bayar (lunas / DP); besarnya ditentukan
      // server. Lihat catatan pratinjau harga di atas.
      //
      // `email` SENGAJA tidak dikirim. Kolom itu kunci login dan `@unique`;
      // mengizinkan satu permintaan pemesanan menggantinya berarti pesanan bisa
      // memindahkan akun ke alamat lain — atau menabrak alamat orang lain dan
      // gagal dengan galat unique yang tidak menyebut email sama sekali.
      const payload = {
          billboardId: billboard.id,
          duration: duration,
          paymentType: paymentType,
          designOption: designOption,
          startDateString: dateInput.value,
          name: nama,
          whatsapp: whatsapp,
          companyName: perusahaan,
          // NPWP tetap dikirim walau centang faktur dilepas: satu-satunya jejak
          // bahwa pembeli punya NPWP adalah nomor itu sendiri, dan server hanya
          // menimpanya bila terisi.
          npwp: npwp,
          needFaktur: needFaktur,
      };

      try {
          const response = await fetch('/api/booking/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          // Respons error bisa saja bukan JSON (mis. halaman error), jadi
          // parsing dijaga agar pesan aslinya tidak tertelan oleh catch.
          //
          // `bacaBadan` memulangkan `Record<string, unknown>`, bukan `any`.
          // Bedanya nyata di sini: ketiga kolom di bawah (`tagihanSekarang`,
          // `orderId`, `message`) memang sudah diperiksa `typeof`, tapi dengan
          // `any` satu nama yang salah tulis — `result.orderID` — lolos `tsc`
          // dan jatuh ke cabang "halaman pembayaran belum dapat dibuka" pada
          // SETIAP pesanan yang berhasil. Pembeli membacanya sebagai kegagalan
          // dan memesan lagi.
          const result = await bacaBadan(response);

          if (response.ok) {
              // Nominal yang dikonfirmasi diambil dari BALASAN SERVER, bukan
              // dari `mustPayNow` di layar. Keduanya seharusnya sama; kalau
              // suatu saat berbeda (tarif di sini tertinggal dari tarif
              // server), pembeli harus melihat angka yang benar-benar ditagih
              // — bukan angka yang tadi dipajang.
              const tagihan = typeof result.tagihanSekarang === 'number'
                  ? result.tagihanSekarang
                  : null;

              const orderId = typeof result.orderId === 'string' ? result.orderId.trim() : '';
              if (!orderId) {
                  // Booking sudah mungkin tersimpan, tetapi tanpa ID yang tervalidasi
                  // browser tidak boleh mengarang URL pembayaran.
                  toast.galat('Pesanan dibuat, tetapi halaman pembayaran belum dapat dibuka. Buka Dashboard untuk melihat pesanan.');
                  router.push('/dashboard');
                  return;
              }

              // `alert` di sini MEMBEKUKAN tab sampai pembeli menekan OK, jadi
              // navigasi ke halaman pembayaran di baris berikutnya tertunda
              // tepat pada saat ia paling ingin dilanjutkan. Toast tidak
              // menahan apa pun, dan tetap terbaca di halaman tujuan karena
              // `ToastProvider` dipasang di layout akar.
              toast.sukses(
                  'Pesanan diterima.' +
                  (tagihan !== null
                      ? `\nNominal yang harus dibayar: Rp ${tagihan.toLocaleString('id-ID')}`
                      : '')
              );
              router.push(`/dashboard/order/${encodeURIComponent(orderId)}/payment`);
          } else {
              // Pesan server ditampilkan juga di dekat formulirnya, tidak hanya
              // di `alert` yang hilang begitu ditutup. Pesan penolakan identitas
              // menyebut kolom mana yang salah; membuangnya memaksa pembeli
              // menebak dari empat kolom.
              const pesan = typeof result.message === 'string' && result.message.trim() !== ''
                  ? result.message
                  : `Server menolak (${response.status}).`;
              setGalatIdentitas(pesan);
              toast.galat('Gagal membuat pesanan: ' + pesan);
          }

      } catch (err) {
          console.error('Gagal membuat pesanan:', err);
          toast.galat('Server tidak dapat dihubungi. Pesanan belum dibuat.');
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
                        <label htmlFor="namaPenyewa" className="text-xs font-bold text-gray-500 uppercase">Nama Lengkap</label>
                        <input
                            type="text"
                            id="namaPenyewa"
                            value={nama}
                            onChange={(e) => setNama(e.target.value)}
                            maxLength={120}
                            required
                            className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 outline-none focus:border-utero focus:ring-1"
                            placeholder="Budi Santoso"
                        />
                    </div>
                    <div>
                        {/*
                          `type="tel"`, bukan `type="number"`. Kolom number
                          membuang karakter `+` sehingga `+628…` tidak bisa
                          diketik, dan di beberapa browser memperlakukan nomor
                          panjang sebagai bilangan — `081200000000000000` pulang
                          dalam notasi eksponen. Nomor telepon bukan bilangan
                          yang dihitung.
                        */}
                        <label htmlFor="whatsappPenyewa" className="text-xs font-bold text-gray-500 uppercase">WhatsApp</label>
                        <input
                            type="tel"
                            id="whatsappPenyewa"
                            inputMode="tel"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value)}
                            maxLength={20}
                            required
                            className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 outline-none focus:border-utero focus:ring-1"
                            placeholder="08123456789"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label htmlFor="perusahaanPenyewa" className="text-xs font-bold text-gray-500 uppercase">Nama Perusahaan <span className="normal-case font-semibold text-gray-400">(opsional)</span></label>
                        <input
                            type="text"
                            id="perusahaanPenyewa"
                            value={perusahaan}
                            onChange={(e) => setPerusahaan(e.target.value)}
                            maxLength={160}
                            className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 outline-none focus:border-utero focus:ring-1"
                            placeholder="PT. Maju Jaya"
                        />
                    </div>

                    {/*
                      Email hanya DITAMPILKAN, tidak diterima.
                      `User.email` adalah kunci login dan `@unique`, dan halaman
                      Pengaturan Akun sudah menyatakannya tidak dapat diubah.
                      Kolom yang bisa diketik di sini akan menjanjikan perubahan
                      yang tidak pernah dikirim — atau, kalau dikirim, memindahkan
                      akun pembeli ke alamat lain lewat satu permintaan pemesanan.
                    */}
                    <div className="md:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Email (Untuk Invoice)</label>
                        <input
                            type="email"
                            value={penyewa.email}
                            readOnly
                            aria-describedby="catatanEmail"
                            className="w-full mt-1 border border-gray-200 bg-gray-100 text-gray-500 rounded-lg p-2.5 outline-none cursor-not-allowed"
                        />
                        <p id="catatanEmail" className="text-xs text-gray-400 mt-1">
                            Invoice dikirim ke alamat akun Anda. Alamat ini tidak dapat diubah.
                        </p>
                    </div>

                    <div className="md:col-span-2 mt-2 bg-gray-50 p-3 rounded-lg flex items-center gap-3 border border-dashed border-gray-300">
                        <input type="checkbox" id="fakturCheck" className="w-5 h-5 accent-utero cursor-pointer" checked={needFaktur} onChange={(e) => setNeedFaktur(e.target.checked)} />
                        <label htmlFor="fakturCheck" className="text-sm text-gray-700 font-semibold cursor-pointer select-none flex items-center gap-2">
                           <FileText size={16}/> Saya butuh Faktur Pajak
                        </label>
                    </div>

                    {needFaktur && (
                         <div className="md:col-span-2">
                            {/*
                              `type="text"`, bukan number: NPWP ditulis dengan
                              titik dan tanda hubung (`09.254.294.3-407.000`),
                              dan kolom number menolak keduanya. Tanda bacanya
                              dibuang server sebelum disimpan.
                            */}
                            <label htmlFor="npwpPenyewa" className="text-xs font-bold text-utero">NOMOR NPWP</label>
                            <input
                                type="text"
                                id="npwpPenyewa"
                                inputMode="numeric"
                                value={npwp}
                                onChange={(e) => setNpwp(e.target.value)}
                                maxLength={30}
                                className="w-full mt-1 border border-utero/30 bg-red-50 rounded-lg p-2.5 outline-none text-gray-800 font-bold"
                                placeholder="09.254.294.3-407.000"
                            />
                            <p className="text-xs text-gray-500 mt-1">15 digit (NPWP lama) atau 16 digit (NIK).</p>
                        </div>
                    )}

                    {galatIdentitas && (
                        <div className="md:col-span-2 flex items-start gap-2 bg-red-50 border border-utero/30 text-utero rounded-lg p-3">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <p className="text-sm font-semibold">{galatIdentitas}</p>
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
                         {/*
                           `<img>` biasa, bukan `next/image`: `mainImage` diisi
                           admin dan hostnya belum tentu ada di `remotePatterns`
                           next.config.ts — `next/image` melempar saat dijalankan
                           untuk sumber di luar daftar itu, dan halaman inilah
                           tempat uang masuk.

                           `alt` dikosongkan dengan sengaja: judul dan tipe
                           billboard tertulis tepat di sebelah gambar ini, jadi
                           foto kecil ini tidak membawa informasi baru.
                           `alt=""` memberi tahu pembaca layar untuk
                           melewatinya, bukan membacakan URL berkasnya.
                         */}
                         {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img src={billboard.mainImage} alt="" className="w-16 h-16 rounded object-cover" />
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
                    {/*
                      LABEL MENGIKUTI APA YANG BENAR-BENAR TERJADI.
                      Tombol ini membuat pesanan lalu mengantar pembeli ke halaman
                      Pembayaran Otomatis miliknya. Nama gerbang pembayaran tidak
                      pernah tampil ke pembeli. Label tidak boleh menyatakan bahwa
                      pembayaran sudah terjadi: yang terjadi di sini hanya pesanan
                      dibuat dan pilihan pembayaran dibuka.
                    */}
                    <button onClick={handlePayment} disabled={isLoading} className="w-full bg-utero hover:bg-white hover:text-utero font-bold py-3 rounded-xl mt-6 transition duration-300 ring-2 ring-utero shadow-lg shadow-utero/50 disabled:opacity-50">
                        {isLoading ? 'Membuat pesanan...' : 'Lanjut ke Pembayaran Otomatis'}
                    </button>
                </div>
            </div>
        </div>

    </div>
  );
}