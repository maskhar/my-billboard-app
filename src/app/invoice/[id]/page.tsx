// src/app/invoice/[id]/page.tsx
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { angkaRupiah, jumlah, lebihBesar, nol } from '@/lib/money';
import { labelPesanan } from '@/lib/nomor-pesanan';
import {
  sisaTagihan as sisaPokokLedger,
  sisaTambahan as sisaTambahanLedger,
  sudahLunas,
  uangMasuk,
} from '@/lib/pembayaran';
import { PaymentStatus, PaymentTujuan } from '@prisma/client';

/**
 * Kolom Payment yang cukup untuk menyusun riwayat pembayaran di invoice.
 *
 * Invoice ini dibuka pelanggan. Baris Payment juga memuat kaitan ke gerbang
 * pembayaran (`providerSessionId`, `providerPaymentId`, `callbackPayload`) —
 * tidak satu pun boleh ikut tertanam di halaman yang dilihat pelanggan.
 */
const PILIH_PEMBAYARAN = {
  id: true,
  tujuan: true,
  status: true,
  jumlah: true,
  paidAt: true,
} as const;

const LABEL_TUJUAN: Record<PaymentTujuan, string> = {
  DP: 'Pembayaran DP',
  FULL: 'Pembayaran penuh',
  PELUNASAN: 'Pelunasan sisa',
  TAMBAHAN: 'Pembayaran biaya tambahan',
};

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
      include: {
          user: true,
          billboard: true,
          additionalCharges: true,
          payments: { select: PILIH_PEMBAYARAN, orderBy: { createdAt: 'asc' } },
      }
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

  // PEMBAYARAN YANG SUDAH MASUK
  // ---------------------------
  // Sumbernya baris `Payment` berstatus PAID, bukan `order.dpAmount`.
  //
  // `dpAmount` adalah RENCANA yang dicatat saat pesanan dibuat: berapa yang
  // hendak dibayar di muka. Ia tidak berubah ketika pelanggan melunasi sisanya,
  // jadi invoice pesanan DP yang sudah lunas tetap menampilkan sisa tagihan
  // penuh — pelanggan diminta membayar dua kali. Lebih buruk lagi, baris "DP
  // Masuk" dulu ditulis lengkap dengan tanda minus sementara angka "Total" tetap
  // `totalPrice`: pengurangnya tidak pernah benar-benar diterapkan.
  //
  // Pokok dan tambahan dihitung terpisah. `uangMasuk()` mengecualikan
  // `TAMBAHAN` justru supaya pembayaran biaya tambahan tidak pernah membuat
  // sisa pokok terlihat lunas.
  const riwayatPembayaran = order.payments.filter((p) => p.status === PaymentStatus.PAID);

  const pokokMasuk = uangMasuk(order.payments);
  const sisaPokok = sisaPokokLedger(order.totalPrice, order.payments);
  const pokokLunas = sudahLunas(order.totalPrice, order.payments);

  const tambahanDibayar = jumlah(
    ...order.payments
      .filter((p) => p.status === PaymentStatus.PAID && p.tujuan === PaymentTujuan.TAMBAHAN)
      .map((p) => p.jumlah)
  );
  // Rumus sisanya dibaca dari `src/lib/pembayaran.ts`, bukan ditulis ulang di
  // sini. Salinan kedua ada di halaman transaksi admin, dan dua salinan dari satu
  // aturan berarti invoice pelanggan dan layar admin bisa menyebut sisa yang
  // berbeda untuk pesanan yang sama.
  const sisaTambahan = sisaTambahanLedger(order.additionalCharges, order.payments);

  const sisaTotal = jumlah(sisaPokok, sisaTambahan);
  const adaPembayaran = lebihBesar(jumlah(pokokMasuk, tambahanDibayar), 0);
  const lunasSeluruhnya = pokokLunas && nol(sisaTambahan);

  return (
    <div className="bg-gray-100 min-h-screen py-10 print:bg-white print:p-0 font-sans">
        <div className="max-w-[21cm] mx-auto bg-white shadow-lg p-12 rounded-xl print:shadow-none print:w-full">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-8 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">INVOICE</h1>
                    <p className="text-gray-500 text-sm font-mono">{labelPesanan(order.id)}</p>
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
                    {/*
                      Badge ini dulu menampilkan `order.status` — status
                      PENGERJAAN, bukan status pembayaran. `ACTIVE` diwarnai
                      hijau sebagai "sudah dibayar", padahal billboard bisa
                      tayang sementara sisa pokoknya belum masuk; `IN_PRODUCTION`
                      diwarnai kuning walau pesanannya sudah lunas. Sekarang
                      isinya diturunkan dari ledger, dan status pengerjaan
                      ditulis di bawahnya dengan label sendiri.
                    */}
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Status Pembayaran</p>
                    <div className={`inline-block px-4 py-2 rounded-lg font-bold uppercase text-xs ${
                        lunasSeluruhnya ? 'bg-green-100 text-green-700' :
                        adaPembayaran ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                        {lunasSeluruhnya ? 'Lunas' : adaPembayaran ? 'Dibayar Sebagian' : 'Belum Dibayar'}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                        Status pesanan: <span className="font-bold">{order.status.replace(/_/g, ' ')}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1 font-mono">Tgl: {new Date(order.createdAt).toLocaleDateString('id-ID')}</p>
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

                    <div className="flex justify-between py-2 border-b-2 border-gray-200">
                        <span className="text-gray-700 text-sm font-bold">Total Tagihan</span>
                        <span className="font-bold text-gray-900">Rp {angkaRupiah(totalTagihan)}</span>
                    </div>

                    {/* RIWAYAT PEMBAYARAN
                        Satu baris per `Payment` berstatus PAID — uang yang
                        benar-benar diterima, bukan rencana pembayaran.

                        Blok ini menggantikan satu baris "DP Masuk" yang dulu
                        dihitung dari `order.dpAmount` dan salah pada tiga hal
                        sekaligus, ketiganya lolos TypeScript tanpa peringatan:

                        1. `order.dpAmount &&` — Decimal adalah objek, dan
                           objek selalu dianggap "ada" oleh JavaScript. Baris
                           itu ikut muncul pada pesanan yang dibayar lunas
                           (dpAmount = 0), memotong nol rupiah dari invoice.
                        2. `dpAmount < totalPrice` — dua objek Decimal
                           dibandingkan sebagai teks. "9000000" dinilai lebih
                           besar dari "10000000" karena '9' datang setelah '1',
                           jadi DP yang sah justru disembunyikan.
                        3. `dpAmount` adalah RENCANA saat pesanan dibuat dan
                           tidak berubah ketika pelanggan melunasi sisanya.
                           Invoice pesanan DP yang sudah lunas tetap menagih
                           sisa penuh.

                        Dan yang paling mahal: angkanya tertulis di layar tapi
                        tidak pernah dikurangkan dari "Total" di bawahnya. */}
                    {riwayatPembayaran.length > 0 ? (
                        riwayatPembayaran.map((p) => (
                            <div key={p.id} className="flex justify-between py-2 border-b border-gray-100 text-green-700">
                                <span className="text-xs">
                                    {LABEL_TUJUAN[p.tujuan]}
                                    {p.paidAt && (
                                        <span className="text-gray-400 ml-1">
                                            · {new Date(p.paidAt).toLocaleDateString('id-ID')}
                                        </span>
                                    )}
                                </span>
                                <span className="font-bold text-sm whitespace-nowrap">- Rp {angkaRupiah(p.jumlah)}</span>
                            </div>
                        ))
                    ) : (
                        <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-gray-400 text-xs italic">Belum ada pembayaran yang diterima</span>
                            <span className="font-bold text-sm text-gray-400">- Rp 0</span>
                        </div>
                    )}

                    {/* Sisa pokok dan sisa tambahan ditulis terpisah karena
                        memang dua tagihan yang berbeda: pokok sudah disepakati
                        saat pemesanan, tambahan ditagihkan admin belakangan.
                        Pembayaran bertujuan TAMBAHAN tidak boleh membuat sisa
                        pokok terlihat lunas, dan sebaliknya. */}
                    {lebihBesar(totalBiayaTambahan, 0) && (
                        <>
                            <div className="flex justify-between py-2 border-b border-gray-100">
                                <span className="text-gray-500 text-xs">Sisa pokok sewa</span>
                                <span className="font-bold text-sm text-gray-700">Rp {angkaRupiah(sisaPokok)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-gray-100">
                                <span className="text-gray-500 text-xs">Sisa biaya tambahan</span>
                                <span className="font-bold text-sm text-gray-700">Rp {angkaRupiah(sisaTambahan)}</span>
                            </div>
                        </>
                    )}

                    <div className="flex justify-between py-4 mt-2 bg-gray-50 px-4 rounded-xl">
                        <span className="text-lg font-bold text-gray-800">
                            {lunasSeluruhnya ? 'Lunas' : 'Sisa Tagihan'}
                        </span>
                        <span className={`text-lg font-extrabold ${lunasSeluruhnya ? 'text-green-600' : 'text-utero'}`}>
                            Rp {angkaRupiah(sisaTotal)}
                        </span>
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