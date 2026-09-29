// src/app/admin/(dashboard)/orders/page.tsx
import { prisma } from '@/lib/prisma';
import { jumlah, lebihBesar, uangUntukClient } from '@/lib/money';
import {
  sisaTagihan,
  sisaTambahan,
  tenggatPelunasan,
  tenggatPelunasanLewat,
  uangMasuk,
} from '@/lib/pembayaran';
import { PaymentStatus, PaymentTujuan, Prisma, Role } from '@prisma/client';
import TransactionClient, { type TransaksiUntukClient } from './TransactionClient';
import Link from 'next/link';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bacaHalaman, hitungPaginasi, PER_HALAMAN, urlHalaman } from '@/lib/paginasi';
import { bacaKataKunci, bacaPilihan } from '@/lib/kueri-daftar';
import NavigasiHalaman from '@/components/admin/NavigasiHalaman';
import KotakCari from '@/components/admin/KotakCari';
import { PANJANG_NOMOR_PESANAN } from '@/lib/nomor-pesanan';
import { redirect } from 'next/navigation';

/**
 * Tab saringan yang sah. `ALL` bukan saringan — ia berarti tidak menyaring.
 *
 * Daftarnya dituliskan, bukan disimpulkan dari deretan `if` di bawah, karena
 * nilai dari URL kini DIPERIKSA terhadapnya. Sebelumnya `paramsQuery.status`
 * diterima apa adanya: `?status=SELESAI` (nama tab dalam Bahasa Indonesia —
 * wajar diketik orang yang menyalin tulisan di tombolnya) tidak cocok dengan
 * satu pun `if`, jadi `whereClause` tetap kosong dan SELURUH transaksi
 * ditampilkan sementara tidak ada tab yang tersorot. Admin membacanya sebagai
 * hasil saringan.
 */
const TAB_STATUS = ['ALL', 'PENDING', 'PROGRESS', 'ACTIVE', 'REFUND', 'DONE'] as const;

// Label dan warna dipisah dari daftar kuncinya supaya `Record<…>` di bawah
// memaksa setiap kunci baru punya keduanya. Sebelumnya keenam tab ditulis satu
// per satu sebagai `<Link>`: menambah tab ketujuh berarti menyalin satu baris
// panjang, dan satu tab pernah lahir dengan `status` yang tidak pernah ditulis
// database (`REFUND_REQUESTED`) tanpa satu pun galat.
const LABEL_TAB: Record<(typeof TAB_STATUS)[number], string> = {
  ALL: 'Semua',
  PENDING: 'Pending',
  PROGRESS: 'Dikerjakan',
  ACTIVE: 'Aktif',
  REFUND: 'Refund',
  DONE: 'Selesai',
};

const WARNA_TAB_AKTIF: Record<(typeof TAB_STATUS)[number], string> = {
  ALL: 'bg-gray-800',
  PENDING: 'bg-yellow-500',
  PROGRESS: 'bg-purple-600',
  ACTIVE: 'bg-green-600',
  REFUND: 'bg-blue-600',
  DONE: 'bg-red-500',
};

const WARNA_TAB_HOVER: Record<(typeof TAB_STATUS)[number], string> = {
  ALL: 'hover:bg-gray-50',
  PENDING: 'hover:bg-yellow-50',
  PROGRESS: 'hover:bg-purple-50',
  ACTIVE: 'hover:bg-green-50',
  REFUND: 'hover:bg-blue-50',
  DONE: 'hover:bg-red-50',
};

/**
 * Kolom Payment yang boleh menyeberang ke komponen client.
 *
 * Baris Payment juga memuat kaitan ke gerbang pembayaran (`providerSessionId`,
 * `providerReferenceId`, `providerPaymentId`, `callbackPayload`). Tidak satu pun
 * dibutuhkan untuk menampilkan riwayat pembayaran, dan `callbackPayload` memuat
 * balasan mentah dari Xendit — jangan pernah ditanam ke HTML halaman admin.
 */
const PILIH_PEMBAYARAN = {
  id: true,
  tujuan: true,
  status: true,
  jumlah: true,
  paidAt: true,
} as const;

// Sejak Next 16, `searchParams` adalah sebuah Promise dan harus di-`await`
// dulu. Sebelumnya propertinya dibaca langsung dari objek Promise, sehingga
// `searchParams.status` dan `searchParams.halaman` SELALU `undefined`: filter
// tab jatuh ke 'ALL' dan halaman selalu 1. Tombol "Berikutnya" mengubah URL
// tapi tidak mengubah isi tabel, dan tab Refund menampilkan semua transaksi.
// Tidak ada error yang muncul — baik di `tsc` maupun saat dijalankan.
export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; halaman?: string; q?: string }>;
}) {
  const paramsQuery = await searchParams;
  const session = await getServerSession(authOptions);
  // `?? Role.USER`, bukan `|| 'USER'`. Dua bedanya:
  //
  // 1. Nilai bakunya diambil dari enum Prisma, jadi salah tulis ditolak
  //    compiler. Teks `'USER'` di sini melebar menjadi `string`, dan `string`
  //    yang diteruskan ke prop bertipe `Role` baru terasa sebagai gerbang yang
  //    selalu tertutup — tanpa satu pun galat kompilasi. Lihat
  //    `src/lib/gerbang-peran.ts` untuk cacat yang sama di 25 route.
  // 2. `??` hanya menangkap `null`/`undefined`. `||` juga menangkap teks
  //    kosong — yang kebetulan tidak bisa terjadi pada enum, tapi menyamarkan
  //    maksudnya: yang ditangani di sini adalah sesi yang tidak ada.
  const currentUserRole: Role = session?.user?.role ?? Role.USER;

  // `bacaPilihan`, bukan `|| 'ALL'`. Nilai asing kini jatuh ke `ALL` SECARA
  // EKSPLISIT, sehingga tab yang tersorot selalu cocok dengan baris yang
  // ditampilkan. Sebelumnya nilai asing tetap tersimpan di `filterStatus`: tidak
  // satu pun `if` di bawah cocok, `whereClause` tetap kosong, seluruh transaksi
  // ditampilkan, dan tidak ada tab yang tersorot untuk memberi tahu itu.
  const filterStatus = bacaPilihan(paramsQuery.status, TAB_STATUS, 'ALL');

  // Kata kunci pencarian. DI SERVER, bukan di komponen client.
  //
  // Sebelumnya pencarian halaman ini adalah `useState` + `Array.filter` di
  // `TransactionClient` atas prop `transactions` — yaitu atas 25 baris halaman
  // ini. Pada tabel 4.000 baris, admin mengetik nomor pesanan yang ADA dan
  // membaca `Tidak ada pesanan yang cocok dengan "…"`. Butir audit 5.19
  // ditandai tuntas atas pencarian yang menjawab salah.
  const kataKunci = bacaKataKunci(paramsQuery.q);

  // `Prisma.BookingWhereInput`, bukan `any`. Dengan `any`, nama status yang
  // salah tulis di kanan (`'REFUND_REQUESTED'` — persis cacat yang dicatat
  // beberapa baris di bawah) lolos pemeriksaan tipe, dan Prisma tidak
  // mengeluhkannya saat dijalankan: ia hanya tidak cocok dengan satu baris pun,
  // jadi tabnya tampil kosong dan terbaca sebagai "tidak ada pengajuan refund".
  // Nama KOLOM yang salah tulis pun dulu lolos dan menjadi query yang melempar
  // saat dijalankan, bukan saat dibangun.
  const whereClause: Prisma.BookingWhereInput = {};
  if (filterStatus === 'PENDING') whereClause.status = { in: ['PENDING_PAYMENT', 'PAID_CONFIRMED'] };
  if (filterStatus === 'ACTIVE') whereClause.status = 'ACTIVE';
  // Dulu tertulis 'REFUND_REQUESTED' — status yang tidak pernah ditulis
  // ke database oleh kode mana pun. Yang sebenarnya dipakai saat user
  // mengajukan refund adalah 'REVIEW_REFUND' (request-refund/route.ts).
  // Akibatnya: pengajuan refund yang baru masuk TIDAK MUNCUL di tab Refund,
  // dan baru terlihat setelah user mengisi nomor rekening. Permintaan yang
  // berhenti sebelum itu tidak pernah terlihat admin.
  if (filterStatus === 'REFUND') whereClause.status = { in: ['REVIEW_REFUND', 'PROCESS_REFUND', 'WAITING_BANK'] };

  // DESIGN_RECEIVED, IN_PRODUCTION, dan INSTALLATION dulu ikut masuk tab
  // "Selesai". Ketiganya justru pesanan yang sedang DIKERJAKAN: desain baru
  // masuk, bahan sedang dicetak, tim sedang memasang. Akibatnya pekerjaan
  // yang sedang berjalan terkubur di antara pesanan yang sudah tutup, dan
  // tidak muncul di tab mana pun yang berarti "sedang dikerjakan".
  if (filterStatus === 'PROGRESS') whereClause.status = { in: ['DESIGN_RECEIVED', 'IN_PRODUCTION', 'INSTALLATION'] };
  if (filterStatus === 'DONE') whereClause.status = { in: ['REFUNDED', 'CANCELLED'] };

  if (kataKunci !== '') {
    // `AND`-nya implisit: `whereClause.status` dan `whereClause.OR` berdampingan
    // di objek yang sama, dan Prisma menggabungkan properti sekerabat dengan
    // AND. Jadi pencarian TIDAK membocorkan baris dari tab lain — admin yang
    // mencari di tab "Refund" tetap hanya melihat pesanan refund.
    //
    // Nomor pesanan dicari dengan `endsWith`, bukan `contains`, dan itu bukan
    // sekadar optimasi: yang tertera di layar, di invoice, dan yang dibacakan
    // pembeli lewat telepon adalah `labelPesanan(id)` — 8 KARAKTER TERAKHIR id,
    // dalam huruf besar (lihat `src/lib/nomor-pesanan.ts`). `contains` atas
    // potongan itu mencocokkan juga bagian TENGAH cuid pesanan lain, sehingga
    // satu nomor yang dicari memunculkan beberapa pesanan yang tidak ada
    // hubungannya — dan admin tidak punya cara membedakan mana yang ia maksud.
    //
    // Awalan `#` dibuang lebih dulu: nomor yang dibaca admin di layar
    // memuatnya, jadi ia akan ikut tersalin saat disalin-tempel.
    //
    // `mode: 'insensitive'` pada kolom `id` bukan kelalaian: nomor tampilannya
    // huruf besar sedangkan cuid di database huruf kecil, jadi tanpa itu
    // menyalin nomor dari layar TIDAK menemukan satu baris pun.
    const nomor = kataKunci.replace(/^#/, '').trim();

    whereClause.OR = [
      // Potongan yang lebih panjang daripada nomor tampilannya tidak mungkin
      // menjadi nomor pesanan, dan `endsWith` atasnya hanya membebani database.
      ...(nomor !== '' && nomor.length <= PANJANG_NOMOR_PESANAN
        ? [{ id: { endsWith: nomor, mode: Prisma.QueryMode.insensitive } }]
        : []),
      { billboard: { title: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } } },
      { user: { name: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } } },
      { user: { email: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } } },
      // Nomor WA dicari apa adanya, TANPA normalisasi. Kolomnya menyimpan bentuk
      // `628…` (lihat `src/lib/telepon.ts`), jadi `contains` atas `812…` yang
      // diketik admin tetap menemukannya — sementara menormalkan kata kuncinya
      // lebih dulu akan mengubah `0812` menjadi `62812` dan membuat pencarian
      // atas potongan tengah nomor gagal.
      { user: { whatsapp: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } } },
    ];
  }

  // Relasi `user` sebelumnya diambil utuh (`user: true`), sehingga hash
  // password, otpCode, dan otpExpires milik tiap pemesan ikut terkirim ke
  // komponen client dan tertanam di HTML halaman. TransactionClient hanya
  // memakai name, email, dan whatsapp — jadi hanya itu yang dilewatkan.
  // Tanpa `take`, query ini mengambil SELURUH riwayat transaksi setiap kali
  // halaman dibuka — beserta relasi user, billboard penuh, dan seluruh biaya
  // tambahan per baris. Semuanya lalu diserialisasi dan ditanam ke dalam HTML.
  // Dengan 50 pesanan itu tidak terasa; setelah setahun beroperasi, halaman
  // yang paling sering dipakai admin justru yang paling lambat terbuka.
  const halamanDiminta = bacaHalaman(paramsQuery.halaman);

  const [transactions, totalTransaksi] = await prisma.$transaction([
    prisma.booking.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              whatsapp: true,
            },
          },
          billboard: true,
          additionalCharges: true, // <-- MENAMBAHKAN DATA BIAYA TAMBAHAN
          payments: { select: PILIH_PEMBAYARAN, orderBy: { createdAt: 'asc' } },
        },
        skip: (halamanDiminta - 1) * PER_HALAMAN,
        take: PER_HALAMAN,
    }),
    prisma.booking.count({ where: whereClause }),
  ]);

  const paginasi = hitungPaginasi(halamanDiminta, totalTransaksi);

  // Saringan yang sedang aktif dikumpulkan SEKALI lalu dipakai oleh pengalihan,
  // navigasi halaman, dan kotak cari. Tiga salinan dari daftar yang sama adalah
  // tiga tempat yang akan menyimpang — dan yang menyimpang di sini adalah
  // saringan yang hilang tanpa suara saat admin menekan salah satu tombolnya.
  const kueriAktif = {
    status: filterStatus === 'ALL' ? undefined : filterStatus,
    q: kataKunci === '' ? undefined : kataKunci,
  };

  // Saringan status IKUT dibawa ke pengalihan. Tanpa itu, admin yang membuka
  // `?status=REFUND&halaman=99` mendarat di seluruh transaksi — tabnya
  // berganti tanpa satu pun petunjuk, dan itu justru tab yang paling mendesak.
  // Kata kuncinya ikut karena alasan yang sama: jumlah halaman HASIL PENCARIAN
  // jauh lebih kecil, jadi `?q=budi&halaman=9` adalah URL yang biasa terjadi.
  if (paginasi.terlaluJauh) {
    redirect(urlHalaman('/admin/orders', paginasi.totalHalaman, kueriAktif));
  }

  const { halaman, totalHalaman } = paginasi;

  // Semua nominal di bawah bertipe Decimal, dan objek Decimal tidak bisa
  // diubah menjadi JSON. Sebelumnya hasil query di atas diteruskan apa adanya
  // ke TransactionClient (`'use client'`), jadi halaman transaksi ini mati
  // saat dijalankan — seluruh pesanan tidak bisa dikelola.
  //
  // Seluruh hitungan uang diselesaikan DI SINI, sebagai Decimal, lalu dikirim
  // sebagai number. Komponen client tidak pernah menghitung uang sendiri: di
  // sana Decimal sudah menjadi number biasa, sehingga rumus apa pun di sana
  // kehilangan jaminan presisi yang dijaga `src/lib/money.ts`.
  // Satu jam untuk seluruh tabel. `new Date()` per baris membuat dua pesanan
  // dengan tanggal tayang sama dinilai berbeda soal keterlambatannya.
  const sekarang = new Date();

  const transactionsUntukClient: TransaksiUntukClient[] = transactions.map(({ dpAmount: _dpAmount, ...trx }) => {
    // `dpAmount` dicabut di sini, di destructuring, BUKAN sekadar tidak ditulis
    // ulang di bawah. `...trx` menyalin seluruh kolom pesanan, jadi kolom uang
    // apa pun yang tidak diambil alih secara eksplisit akan menyeberang sebagai
    // objek Decimal — dan objek Decimal tidak bisa diserialisasi, sehingga
    // halaman transaksi mati saat dirender. Ia juga memang tidak diperlukan:
    // rencana DP bukan bukti uang diterima, dan yang dibaca layar adalah
    // `uang.pokokMasuk`/`uang.sisaPokok` dari `Payment PAID`.
    const pokokMasuk = uangMasuk(trx.payments);
    const sisaPokok = sisaTagihan(trx.totalPrice, trx.payments);

    // `TAMBAHAN` berada DI LUAR `totalPrice`, jadi punya pasangan angkanya
    // sendiri: tagihannya dari `AdditionalCharge`, pembayarannya dari baris
    // Payment bertujuan TAMBAHAN. Keduanya tidak pernah dicampur ke pokok.
    //
    // Rumus sisanya dulu ditulis ulang di sini, dan salinan kedua ada di halaman
    // invoice. Sekarang keduanya membaca `sisaTambahan` di
    // `src/lib/pembayaran.ts` — dua salinan dari satu aturan adalah dua tempat
    // yang bisa menyimpang, dan yang menyimpang adalah angka yang ditagihkan.
    const totalTambahan = jumlah(...trx.additionalCharges.map((c) => c.amount));
    const belumDibayarTambahan = sisaTambahan(trx.additionalCharges, trx.payments);

    // `tambahanDibayar` TIDAK diturunkan dari `totalTambahan - sisaTambahan`:
    // sisanya ditahan di nol, jadi pada pesanan yang kelebihan bayar selisih itu
    // melaporkan uang masuk lebih kecil daripada yang benar-benar diterima.
    // Angka ini dibaca admin sebagai kas, jadi ia dijumlahkan dari barisnya.
    const tambahanDibayar = jumlah(
      ...trx.payments
        .filter((p) => p.status === PaymentStatus.PAID && p.tujuan === PaymentTujuan.TAMBAHAN)
        .map((p) => p.jumlah)
    );

    return {
      ...trx,
      totalPrice: uangUntukClient(trx.totalPrice),
      refundAmount: trx.refundAmount === null ? null : uangUntukClient(trx.refundAmount),
      unitPrice: trx.unitPrice === null ? null : uangUntukClient(trx.unitPrice),
      basePrice: trx.basePrice === null ? null : uangUntukClient(trx.basePrice),
      taxAmount: trx.taxAmount === null ? null : uangUntukClient(trx.taxAmount),
      adminFee: trx.adminFee === null ? null : uangUntukClient(trx.adminFee),
      billboard: { ...trx.billboard, price: uangUntukClient(trx.billboard.price) },
      additionalCharges: trx.additionalCharges.map(charge => ({
        ...charge,
        amount: uangUntukClient(charge.amount),
      })),
      payments: trx.payments.map(p => ({ ...p, jumlah: uangUntukClient(p.jumlah) })),
      // Fakta ledger yang sudah dihitung server; label di UI hanya membacanya.
      uang: {
        pokokMasuk: uangUntukClient(pokokMasuk),
        sisaPokok: uangUntukClient(sisaPokok),
        totalTambahan: uangUntukClient(totalTambahan),
        tambahanDibayar: uangUntukClient(tambahanDibayar),
        sisaTambahan: uangUntukClient(belumDibayarTambahan),
        grandTotal: uangUntukClient(jumlah(trx.totalPrice, totalTambahan)),
        adaUangMasuk: lebihBesar(pokokMasuk, 0),
        // Tenggat H-3 (`tenggatPelunasan` atas `startDate`) dihitung di sini,
        // bukan di komponen client: tenggat yang dihitung browser mengikuti zona
        // waktu perangkat admin, dan dua admin akan melihat batas yang berbeda
        // untuk pesanan yang sama. Ia DITANDAI, tidak ditegakkan — pelunasan
        // tetap diterima setelahnya (lihat `periksaKelayakanSesi`).
        tenggatPelunasanISO: tenggatPelunasan(trx.startDate).toISOString(),
        terlambatLunas:
          lebihBesar(sisaPokok, 0) && tenggatPelunasanLewat(trx.startDate, sekarang),
      },
    };
  });

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Transactions</h1>
            {/* Dulu tertulis `transactions.length` — sejak ada paginasi, itu
                jumlah baris DI HALAMAN INI, bukan jumlah transaksi. Admin
                akan membaca "25 transaksi" untuk usaha yang punya ribuan.

                Sejak pencarian pindah ke server, angka ini adalah jumlah baris
                YANG COCOK, bukan jumlah seluruh tabel — jadi kalimatnya ikut
                menyebutkan itu. "Total: 3 transaksi" pada tabel 4.000 baris
                adalah angka yang benar dengan label yang salah. */}
            <p className="text-gray-500 text-sm">
              {kataKunci === '' ? 'Total: ' : 'Cocok: '}
              <span className="font-bold text-utero">{totalTransaksi}</span> transaksi
              {kataKunci !== '' && <> untuk &ldquo;{kataKunci}&rdquo;</>}
            </p>
        </div>

        {/* Filter Tabs. Tautannya lewat `urlHalaman` supaya kata kunci pencarian
            ikut terbawa saat tab berganti — dan supaya nilainya di-encode.
            Sebelumnya tautannya dirangkai dengan tangan (`?status=PENDING`),
            yang tidak punya tempat untuk membawa apa pun selain status. */}
        <div className="flex flex-wrap gap-2 p-1 bg-white border border-gray-200 rounded-lg shadow-sm">
            {TAB_STATUS.map((kunci) => {
              const aktif = filterStatus === kunci;
              return (
                <Link
                  key={kunci}
                  href={urlHalaman('/admin/orders', 1, {
                    status: kunci === 'ALL' ? undefined : kunci,
                    q: kataKunci === '' ? undefined : kataKunci,
                  })}
                  className={`px-4 py-2 rounded-md text-xs font-bold transition ${
                    aktif ? `${WARNA_TAB_AKTIF[kunci]} text-white shadow` : `text-gray-500 ${WARNA_TAB_HOVER[kunci]}`
                  }`}
                >
                  {LABEL_TAB[kunci]}
                </Link>
              );
            })}
        </div>
      </div>

      {/* Kotak cari DI ATAS daftar, bukan di dalam kolom kirinya seperti
          sebelumnya: yang disaringnya sekarang adalah seluruh tabel, jadi
          menaruhnya di dalam panel daftar akan menyarankan cakupan yang lebih
          sempit daripada yang sebenarnya. */}
      <div className="mb-6">
        <KotakCari
          basis="/admin/orders"
          nilai={kataKunci}
          label="Cari pesanan berdasarkan nomor, billboard, nama, email, atau nomor WhatsApp"
          placeholder="Cari nomor pesanan, billboard, penyewa…"
          tersembunyi={{ status: kueriAktif.status }}
        />
      </div>

      <TransactionClient
        transactions={transactionsUntukClient}
        currentUserRole={currentUserRole}
        kataKunci={kataKunci}
      />

      {/* Jumlah barisnya sekarang ikut tertulis. Sebelumnya halaman ini
          satu-satunya dari empat daftar admin yang hanya menulis "Halaman 2 dari
          7" tanpa memberi tahu ada berapa transaksi — tanpa alasan. */}
      <div className="mt-6">
        <NavigasiHalaman
          basis="/admin/orders"
          halaman={halaman}
          totalHalaman={totalHalaman}
          total={totalTransaksi}
          satuan="transaksi"
          parameter={kueriAktif}
        />
      </div>
    </div>
  );
}