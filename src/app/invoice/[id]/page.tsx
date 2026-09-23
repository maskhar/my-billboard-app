// src/app/invoice/[id]/page.tsx
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Image from 'next/image';
import { angkaRupiah, jumlah, kurang, lebihBesar, nol } from '@/lib/money';

// 1. UPDATE TIPE DATA PROPS
type Props = {
  params: Promise<{ id: string }>
}

export default async function InvoicePage(props: Props) {
  // 2. AWAIT PARAMS DULU
  const params = await props.params;
  
  const session = await getServerSession(authOptions);
  
  // Jika belum login, tolak akses
  if (!session) return <div className="text-center p-10 font-bold text-red-500">Access Denied: Harap Login</div>;

  // 3. GUNAKAN ID YANG SUDAH DIAWAIT
  // `additionalCharges` dulu tidak ikut diambil di sini, sehingga biaya
  // tambahan yang ditagihkan admin lewat halaman transaksi tidak pernah muncul
  // di invoice pelanggan. Pelanggan diminta membayar sejumlah uang yang
  // rinciannya tidak pernah ia lihat, dan angka "Total" di invoice tidak cocok
  // dengan "Grand Total" yang dilihat admin di TransactionClient.tsx.
  const order = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { user: true, billboard: true, additionalCharges: true }
  });

  if(!order) return <div className="text-center p-10 font-bold">Invoice Tidak Ditemukan</div>;

  // Hanya pemilik order atau admin yang boleh lihat.
  // SUPER_ADMIN sebelumnya terlewat dari daftar role, sehingga super admin
  // justru tidak bisa membuka invoice.
  if (order.userId !== session.user.id && !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return <div className="text-center p-10 font-bold text-red-500">Anda tidak berhak melihat invoice ini.</div>;
  }

  // RINCIAN TAGIHAN
  // ---------------
  // `basePrice`, `taxAmount`, dan `adminFee` nullable: pesanan yang dibuat
  // sebelum kolom-kolom itu ada tidak menyimpan rinciannya. Nilai null TIDAK
  // diganti nol dan TIDAK dihitung ulang dari tarif yang berlaku sekarang —
  // menghitung ulang berarti invoice lama berubah angkanya setiap kali tarif
  // pajak atau biaya admin diubah, dan invoice yang sudah dikirim ke pelanggan
  // tidak boleh berubah isinya. Yang tidak tercatat cukup tidak ditampilkan,
  // dengan satu keterangan jujur di bawah blok total.
  //
  // `nol()` dipakai untuk memeriksa "ada isinya atau tidak", bukan
  // `if (order.taxAmount)`: Decimal adalah objek, dan setiap objek dianggap
  // "benar" oleh JavaScript — pemeriksaan seperti itu lolos bahkan saat
  // nominalnya nol.
  const adaRincianPajak = order.basePrice !== null && !nol(order.basePrice);
  const adaPpn = order.taxAmount !== null && !nol(order.taxAmount);
  const adaBiayaAdmin = order.adminFee !== null && !nol(order.adminFee);

  // Biaya tambahan yang ditagihkan admin setelah pesanan berjalan. Nominalnya
  // tersimpan terpisah dari `totalPrice`, jadi harus dijumlahkan sendiri —
  // persis seperti yang dilakukan TransactionClient.tsx di sisi admin, supaya
  // angka yang dilihat pelanggan dan yang dilihat admin sama.
  const biayaTambahan = order.additionalCharges;
  const totalBiayaTambahan = jumlah(...biayaTambahan.map((c) => c.amount));

  // `totalPrice` adalah harga yang disepakati saat pemesanan; biaya tambahan
  // muncul belakangan dan berada di luar angka itu.
  const totalTagihan = jumlah(order.totalPrice, totalBiayaTambahan);

  // DP yang sudah dibayar mengurangi sisa tagihan.
  //
  // Sebelumnya baris "DP Masuk" ditulis di layar lengkap dengan tanda minus,
  // tapi angka di baris "Total" tetap `totalPrice` — pengurangnya tidak pernah
  // benar-benar diterapkan. Invoice berbunyi "Subtotal 33.350.000 − DP
  // 20.010.000 = Total 33.350.000", dan pelanggan yang sudah membayar DP
  // diminta membayar seluruh nilai pesanan sekali lagi.
  const adaDp =
    order.dpAmount !== null &&
    !nol(order.dpAmount) &&
    lebihBesar(totalTagihan, order.dpAmount);
  const sisaTagihan = adaDp ? kurang(totalTagihan, order.dpAmount) : totalTagihan;

  return (
    <div className="bg-gray-100 min-h-screen py-10 print:bg-white print:p-0 font-sans">
        <div className="max-w-[21cm] mx-auto bg-white shadow-lg p-12 rounded-xl print:shadow-none print:w-full">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-8 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">INVOICE</h1>
                    <p className="text-gray-500 text-sm font-mono">#{order.id.slice(-8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-extrabold text-utero tracking-tight">Utero<span className='text-gray-800'>Cloud</span></h2>
                    <p className="text-xs text-gray-500 mt-1">Jl. Soekarno Hatta No. 1, Malang</p>
                    <p className="text-xs text-gray-500">support@utero.cloud</p>
                </div>
            </div>

            {/* Info Klien */}
            <div className="grid grid-cols-2 gap-10 mb-10">
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Ditagihkan Kepada</p>
                    <h3 className="font-bold text-gray-800 text-lg">{order.user.name}</h3>
                    <p className="text-gray-600 text-sm">{order.user.email}</p>
                    <p className="text-gray-600 text-sm">{order.user.whatsapp || '-'}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Status Pembayaran</p>
                    <div className={`inline-block px-4 py-2 rounded-lg font-bold uppercase text-xs ${
                        order.status === 'ACTIVE' || order.status === 'REFUNDED' ? 'bg-green-100 text-green-700' : 
                        order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                        {order.status.replace('_',' ')}
                    </div>
                    <p className="text-xs text-gray-400 mt-2 font-mono">Tgl: {new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
            </div>

            {/* Tabel Item */}
            <table className="w-full mb-10 border-collapse">
                <thead className="bg-gray-50 border-y-2 border-gray-100">
                    <tr>
                        <th className="py-3 px-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Deskripsi Item</th>
                        <th className="py-3 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Periode</th>
                        <th className="py-3 px-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Jumlah</th>
                    </tr>
                </thead>
                <tbody className="text-sm text-gray-700">
                    <tr className="border-b border-gray-100">
                        <td className="py-4 px-4">
                            <p className="font-bold text-gray-800">{order.billboard.title}</p>
                            <p className="text-gray-500 text-xs mt-1">{order.billboard.address}</p>
                            {order.designOption === 'service' && <span className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded ml-1 font-bold">+ Jasa Desain</span>}
                        </td>
                        <td className="py-4 px-4 text-right">
                            {order.duration} Bulan
                        </td>
                        <td className="py-4 px-4 text-right font-bold text-gray-800">
                            Rp {angkaRupiah(order.totalPrice)}
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Total */}
            <div className="flex justify-end mb-16">
                <div className="w-1/2">
                    {/*
                      Rincian pajak hanya ditampilkan bila pesanan ini memang
                      menyimpannya. Untuk pesanan lama yang kolomnya masih
                      null, baris-baris ini tidak muncul sama sekali — lebih
                      baik daripada menampilkan "Rp NaN" atau memasang angka
                      nol yang seolah menyatakan pesanan itu bebas pajak.
                    */}
                    {adaRincianPajak && (
                        <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-gray-500 text-sm">Harga Sewa ({order.duration} Bulan)</span>
                            <span className="font-bold text-gray-800">Rp {angkaRupiah(order.basePrice)}</span>
                        </div>
                    )}
                    {adaPpn && (
                        <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-gray-500 text-sm">PPN</span>
                            <span className="font-bold text-gray-800">Rp {angkaRupiah(order.taxAmount)}</span>
                        </div>
                    )}
                    {adaBiayaAdmin && (
                        <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-gray-500 text-sm">Biaya Administrasi</span>
                            <span className="font-bold text-gray-800">Rp {angkaRupiah(order.adminFee)}</span>
                        </div>
                    )}

                    <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-gray-500 text-sm">Subtotal</span>
                        <span className="font-bold text-gray-800">Rp {angkaRupiah(order.totalPrice)}</span>
                    </div>

                    {/*
                      Biaya tambahan ditagihkan admin setelah pesanan berjalan
                      (perpanjangan, revisi cetak, dan sebagainya). Nominalnya
                      di luar `totalPrice`, jadi harus ditulis sebagai baris
                      tersendiri — bukan dilebur — supaya pelanggan tahu apa
                      yang ia bayar.
                    */}
                    {biayaTambahan.map((charge) => (
                        <div key={charge.id} className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-gray-500 text-sm">{charge.description}</span>
                            <span className="font-bold text-gray-800">+ Rp {angkaRupiah(charge.amount)}</span>
                        </div>
                    ))}

                    {/* DP Info (Jika ada) */}
                    {/*
                      Syarat di bawah dulu salah pada dua hal sekaligus, dan
                      keduanya lolos TypeScript tanpa peringatan:

                      1. `order.dpAmount &&` — nominal Decimal adalah objek,
                         dan objek selalu dianggap "ada" oleh JavaScript.
                         Jadi baris "DP Masuk" ikut muncul pada pesanan yang
                         dibayar lunas (dpAmount = 0), memotong nol rupiah
                         dari invoice.
                      2. `dpAmount < totalPrice` — dua objek Decimal
                         dibandingkan sebagai teks, bukan angka. "9000000"
                         dinilai lebih besar dari "10000000" karena huruf '9'
                         datang setelah '1'. DP yang sah justru disembunyikan.

                      Dan yang paling mahal: angkanya tertulis di layar tapi
                      tidak pernah dikurangkan dari "Total" di bawah.
                    */}
                    {adaDp && (
                         <div className="flex justify-between py-2 border-b border-gray-100 text-orange-600 bg-orange-50 px-2 rounded">
                            <span className="text-xs font-bold">DP Masuk</span>
                            <span className="font-bold text-sm">- Rp {angkaRupiah(order.dpAmount)}</span>
                         </div>
                    )}
                    <div className="flex justify-between py-4 mt-2 bg-gray-50 px-4 rounded-xl">
                        <span className="text-lg font-bold text-gray-800">{adaDp ? 'Sisa Tagihan' : 'Total'}</span>
                        <span className="text-lg font-extrabold text-utero">Rp {angkaRupiah(sisaTagihan)}</span>
                    </div>

                    {/*
                      Pesanan lama tidak menyimpan rincian pajaknya. Daripada
                      diam-diam menghitungkan angka yang tidak pernah
                      disepakati, invoice menyatakan apa adanya bahwa
                      rinciannya tidak tercatat.
                    */}
                    {!adaRincianPajak && (
                        <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                            Rincian pajak dan biaya administrasi tidak tercatat untuk pesanan ini.
                            Nilai di atas adalah total yang disepakati saat pemesanan.
                            Hubungi kami bila Anda membutuhkan rinciannya.
                        </p>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="text-center text-[10px] text-gray-400 border-t border-gray-200 pt-8">
                <p className="font-bold mb-1">Terima kasih atas kepercayaan Anda kepada Utero Cloud.</p>
                <p>Dokumen ini diterbitkan secara otomatis oleh sistem komputer dan sah tanpa tanda tangan basah.</p>
                <div className='print:hidden mt-8'>
                     <p className='text-xs text-blue-500'>*Tekan Ctrl + P untuk mencetak atau simpan sebagai PDF.</p>
                </div>
            </div>
        </div>
    </div>
  );
}