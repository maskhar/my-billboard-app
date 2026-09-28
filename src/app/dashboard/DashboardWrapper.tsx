// src/app/dashboard/DashboardWrapper.tsx
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from 'next/navigation';
import DashboardClientPage from './DashboardClientPage'; // Impor komponen client yang baru kita buat
import { keAngka, kurang, lebihBesar, lebihKecil, persen, uangUntukClient } from '@/lib/money';
import {
  masihAdaSisa,
  periksaKelayakanSesi,
  sisaTagihan,
  sisaTambahan,
  sudahLunas,
  tagihanBerikutnya,
  tenggatPelunasan,
  tenggatPelunasanLewat,
  uangMasuk,
} from '@/lib/pembayaran';
import { STATUS_MENGUNCI_TANGGAL } from '@/lib/transisi-status';
/**
 * Bagian dari uang masuk yang dikembalikan bila pesanan direfund.
 *
 * Dibaca dari `src/lib/tarif.ts`, TIDAK disalin lagi. Angka di layar ini hanya
 * PERKIRAAN untuk pembeli sebelum ia mengajukan; nominal yang mengikat tetap
 * dihitung server di `src/app/api/booking/request-refund/route.ts`, yang membaca
 * tarif yang sama. Dulu angkanya ditulis ulang di sini — dan salinan yang
 * menyimpang berarti pembeli dijanjikan satu porsi lalu menerima porsi lain,
 * tanpa satu pun galat yang muncul.
 */
import { PERSEN_REFUND } from '@/lib/tarif';

// Status yang dianggap "Aktif / Berjalan".
//
// Daftarnya dulu disalin tangan di sini sebagai sembilan literal string.
// Isinya kebetulan sama persis dengan `STATUS_MENGUNCI_TANGGAL` — semua status
// kecuali CANCELLED dan REFUNDED — dan memang seharusnya: pesanan "masih
// berjalan" dan pesanan "masih mengunci tanggal" adalah pertanyaan yang sama.
//
// Karena disalin, keduanya bisa berbeda tanpa ada yang menyadari. Status baru
// yang ditambahkan ke `TRANSISI_SAH` masuk ke daftar turunan dengan
// sendirinya, tapi tidak ke salinan ini: pelanggan lalu membuka dashboard dan
// pesanannya yang masih berjalan sudah pindah ke tab "Riwayat", seolah sudah
// selesai. Tidak ada galat, hanya dua daftar yang diam-diam berbeda.
const activeStatuses: readonly BookingStatus[] = STATUS_MENGUNCI_TANGGAL;

/**
 * Pesanan terbaru yang dimuat per tab.
 *
 * Tanpa batas, halaman ini mengambil SELURUH pesanan yang pernah dibuat akun
 * ini — beserta seluruh baris `Payment` dan `AdditionalCharge` masing-masing —
 * lalu menanamkan semuanya ke HTML sebagai props komponen client. Pembeli baru
 * tidak merasakannya; penyewa yang sudah tiga tahun memesan tiap bulan
 * membuka halaman yang payload-nya tumbuh selamanya dan tidak pernah membaca
 * pesanan di bawah baris ke-50 pada tab mana pun.
 *
 * Dibatasi PER TAB, bukan sekali untuk keduanya: satu `take` di query gabungan
 * yang diurutkan `createdAt desc` akan terpakai habis oleh riwayat lama pada
 * akun yang ramai, dan pesanan yang sedang berjalan — satu-satunya yang perlu
 * ditindak — justru hilang dari layar.
 */
const PESANAN_TERBARU = 50;

// KOLOM DIPILIH SATU PER SATU, BUKAN `include: { billboard: true }`.
//
// Sebelumnya seluruh baris Booking dan Billboard dikirim ke komponen client,
// lalu disebar dengan `...b`. Artinya setiap kolom baru pada kedua tabel ikut
// menyeberang ke browser dengan sendirinya — termasuk kolom yang tidak pernah
// ditampilkan. Pada tabel pembayaran kolom seperti itu bukan hal sepele:
// id sesi provider, id customer, dan payload webhook tidak boleh pernah
// sampai ke browser. Daftar di bawah adalah tepat apa yang dipakai layar.
const PILIH_PESANAN = {
        id: true,
        status: true,
        expiresAt: true,
        // Acuan tenggat pelunasan H-3 (`tenggatPelunasan`). Bukan `installedAt`:
        // itu baru terisi setelah pemasangan, sedangkan uang pelunasannya justru
        // dibutuhkan untuk mencetak dan memasang.
        startDate: true,
        totalPrice: true,
        // `dpAmount` tetap diambil, tapi hanya sebagai catatan RENCANA: berapa
        // yang hendak dibayar di muka saat pesanan dibuat. Ia TIDAK dipakai
        // sebagai bukti uang diterima — bukti itu hanya ada di `payments`.
        dpAmount: true,
        refundAmount: true,
        designOption: true,
        designFileUrl: true,
        designStatus: true,
        designRejectionReason: true,
        refundProof: true,
        billboard: {
          select: {
            slug: true,
            title: true,
            address: true,
            mainImage: true,
          },
        },
        // Seluruh baris pembayaran diambil, bukan hanya satu baris PENDING.
        // Kartu pesanan perlu menjawab dua hal berbeda: "masih ada tagihan yang
        // bisa dibayar?" (baris PENDING) dan "berapa uang yang sudah benar-benar
        // masuk?" (baris PAID). Yang kedua dulu dijawab dari `dpAmount`, yaitu
        // rencana — bukan fakta.
        //
        // `select` tetap dipersempit ke empat kolom. Baris Payment juga memuat
        // `providerSessionId`, `providerReferenceId`, `providerPaymentId`, dan
        // `callbackPayload`; tidak satu pun boleh menyeberang ke browser.
        payments: {
          // `createdAt` ikut karena tagihan mana yang dibayar berikutnya ikut
          // ditentukan urutan pembuatannya — dibaca `tagihanBerikutnya` di
          // `src/lib/pembayaran.ts`. Tanpa itu kartu pesanan bisa memberi label
          // "Lunasi Sekarang" pada pesanan yang sebenarnya akan membuka tagihan
          // biaya tambahan.
          select: { tujuan: true, status: true, jumlah: true, createdAt: true },
        },
        // Pasangan angka untuk biaya tambahan: tagihannya di sini,
        // pembayarannya pada baris Payment bertujuan TAMBAHAN. Keduanya berada
        // DI LUAR `totalPrice` dan tidak pernah dicampur ke pokok.
        additionalCharges: { select: { amount: true } },
} as const;

export default async function DashboardWrapper() {
  const session = await getServerSession(authOptions);

  if (!session) {
      redirect('/login');
  }

  const userId = session.user.id;

  // Dua query, satu per tab, masing-masing dengan batasnya sendiri. Keduanya
  // dijalankan bersamaan: tidak ada yang membutuhkan hasil yang lain.
  //
  // TOTAL PENGELUARAN TIDAK LAGI DIHITUNG DARI BARIS-BARIS INI. Dulu ia
  // menjumlahkan `payments` dari seluruh pesanan yang terambil, dan itu hanya
  // benar selama tidak ada batas. Dengan `take`, menjumlahkan baris yang
  // terambil berarti angka "Total Pengeluaran" ikut mengecil begitu pesanan
  // ke-51 lahir — pembeli melihat uang yang pernah ia setorkan hilang dari
  // layarnya. Jadi agregatnya dipindah ke database, yang memang tidak dibatasi.
  const [
    pesananAktif,
    pesananRiwayat,
    jumlahAktif,
    jumlahRiwayat,
    agregatMasuk,
    agregatRefund,
  ] = await Promise.all([
    prisma.booking.findMany({
      where: { userId, status: { in: [...activeStatuses] } },
      orderBy: { createdAt: 'desc' },
      take: PESANAN_TERBARU,
      select: PILIH_PESANAN,
    }),
    prisma.booking.findMany({
      where: { userId, status: { notIn: [...activeStatuses] } },
      orderBy: { createdAt: 'desc' },
      take: PESANAN_TERBARU,
      select: PILIH_PESANAN,
    }),
    // Jumlah SEBENARNYA per tab, dihitung database. Tanpa ini angka pada tab
    // dan pada kartu "Pesanan Aktif" ikut terjepit `take` dan berhenti di 50 —
    // pembeli dengan 60 pesanan berjalan membaca "50" dan menyangka sepuluh
    // pesanannya lenyap.
    prisma.booking.count({ where: { userId, status: { in: [...activeStatuses] } } }),
    prisma.booking.count({ where: { userId, status: { notIn: [...activeStatuses] } } }),
    // Seluruh `Payment PAID` milik akun ini, TERMASUK `TAMBAHAN` — pembeli
    // memang membayarnya. Ini padanan `uangMasukSemua`, dijalankan di database.
    // `PENDING` sengaja tidak ikut: tagihan yang belum dibayar bukan uang.
    prisma.payment.aggregate({
      where: { status: PaymentStatus.PAID, booking: { userId } },
      _sum: { jumlah: true },
    }),
    // Hanya `REFUNDED` yang dihitung: pesanan di tengah alur refund
    // (REVIEW_REFUND, WAITING_BANK, PROCESS_REFUND) belum menerima uangnya,
    // jadi mengurangkannya berarti mengaku sudah membayar sesuatu yang belum
    // dikirim.
    prisma.booking.aggregate({
      where: { userId, status: BookingStatus.REFUNDED },
      _sum: { refundAmount: true },
    }),
  ]);

  // Nominal uang di database bertipe Decimal — sebuah objek, bukan angka.
  // Next.js mengubah setiap prop menjadi JSON sebelum menyeberangkannya ke
  // komponen 'use client', dan objek Decimal tidak bisa diubah menjadi JSON:
  // halaman dashboard gagal dirender saat dijalankan. Jadi nominal diubah ke
  // angka biasa di sini, sebelum menyeberang.
  //
  // Seluruh hitungan uang diselesaikan DI SINI sebagai Decimal, lalu dikirim
  // sebagai angka jadi. Kartu pesanan tidak menghitung uang sendiri: begitu
  // Decimal menjadi angka biasa, rumus apa pun di browser kehilangan jaminan
  // presisi yang dijaga `src/lib/money.ts`.
  // Satu jam untuk seluruh kartu di halaman ini. Memanggil `new Date()` per
  // pesanan membuat dua kartu bisa menilai tenggat yang sama secara berbeda.
  const sekarang = new Date();

  const siapkanPesanan = (b: (typeof pesananAktif)[number]) => {
    const pokokMasuk = uangMasuk(b.payments);
    const sisaPokok = sisaTagihan(b.totalPrice, b.payments);

    // Apakah pesanan ini DIRENCANAKAN dibayar bertahap? `dpAmount` bernilai nol
    // pada pesanan yang memang dibayar lunas di muka, jadi syaratnya "ada
    // isinya DAN lebih kecil dari total". Keduanya lewat money.ts: `dpAmount`
    // masih Decimal di sini, dan `<` atas dua objek Decimal membandingkannya
    // sebagai teks — "9000000" dinilai lebih besar dari "10000000".
    const rencanaDp =
      b.dpAmount !== null &&
      lebihBesar(b.dpAmount, 0) &&
      lebihKecil(b.dpAmount, b.totalPrice);

    // Sisa menurut RENCANA, dipakai hanya pada pesanan yang belum dibayar
    // sepeser pun — di sana belum ada fakta yang bisa dipakai. Dihitung di sini
    // supaya kartu pesanan tidak perlu mengurangkan dua nominal sendiri.
    const sisaSetelahDpRencana = rencanaDp ? kurang(b.totalPrice, b.dpAmount) : null;

    // TAGIHAN BERIKUTNYA DIPUTUSKAN DI SINI, bukan di browser — dan lewat fungsi
    // yang sama yang dipakai endpoint sesi (`tagihanBerikutnya` di
    // `src/lib/pembayaran.ts`), supaya label tombol di kartu menyebut tagihan
    // yang benar-benar akan dibuka. Satu pesanan bisa punya pelunasan dan biaya
    // tambahan menganggur bersamaan.
    const tagihan = tagihanBerikutnya(b.payments);

    // Boleh-tidaknya membayar adalah keputusan SERVER, dan aturannya dibaca dari
    // satu tempat. Gerbang lama di kartu pesanan ("PENDING_PAYMENT dan expiresAt
    // masih hidup") menyembunyikan tombol dari setiap pelunasan yang sah:
    // pesanan yang sudah dibayar DP tidak lagi PENDING_PAYMENT, dan `expiresAt`
    // -nya — tenggat 24 jam waktu pesanan masih baru — sudah lewat.
    const bolehBayar = tagihan
      ? periksaKelayakanSesi({
          statusPesanan: b.status,
          tujuanTagihan: tagihan.tujuan,
          tenggatPesanan: b.expiresAt,
          sekarang,
        }).boleh
      : false;

    const sisaBiayaTambahan = sisaTambahan(b.additionalCharges, b.payments);

    return {
      id: b.id,
      status: b.status,
      // Diserialisasi eksplisit: `Date` menyeberang sebagai string, dan kartu
      // pesanan memang membacanya lewat `new Date(...)`.
      expiresAt: b.expiresAt === null ? null : b.expiresAt.toISOString(),
      totalPrice: uangUntukClient(b.totalPrice),
      // Rencana pembayaran bertahap, dipakai hanya pada pesanan yang belum
      // dibayar sama sekali. Tidak pernah menjadi dasar hitungan sisa tagihan.
      rencanaDp,
      dpRencana: b.dpAmount === null ? null : uangUntukClient(b.dpAmount),
      sisaSetelahDpRencana:
        sisaSetelahDpRencana === null ? null : uangUntukClient(sisaSetelahDpRencana),
      designOption: b.designOption,
      designFileUrl: b.designFileUrl,
      designStatus: b.designStatus,
      designRejectionReason: b.designRejectionReason,
      refundProof: b.refundProof,
      billboard: b.billboard,
      // Tujuan tagihan sebagai teks biasa, BUKAN nilai enum Prisma: mengimpor
      // `PaymentTujuan` di komponen client menarik runtime Prisma ke bundle
      // browser. Tipe union di sisi kartu pesanan menjaga nilainya tetap benar.
      tujuanTagihan: (tagihan?.tujuan ?? null) as string | null,
      /** Kesimpulan `periksaKelayakanSesi` di server; kartu hanya membacanya. */
      bolehBayar,
      // Biaya tambahan punya panelnya sendiri. Dicampur ke sisa pokok, pesanan
      // yang pokoknya sudah lunas akan terlihat belum lunas.
      sisaTambahan: uangUntukClient(sisaBiayaTambahan),
      // Tenggat H-3 ditandai, TIDAK ditegakkan: tagihan tetap bisa dibayar
      // setelahnya. Uangnya dibutuhkan untuk mencetak dan memasang, jadi
      // menolaknya hanya membuat pesanan mandek tanpa jalan keluar.
      tenggatPelunasanISO: tenggatPelunasan(b.startDate).toISOString(),
      terlambatLunas:
        lebihBesar(sisaPokok, 0) && tenggatPelunasanLewat(b.startDate, sekarang),
      // Fakta ledger. `pokokMasuk` adalah uang yang benar-benar diterima untuk
      // pokok sewa; `sisaPokok` sisanya. `masihAdaSisa` sengaja terpisah dari
      // "sisaPokok > 0": pesanan yang belum dibayar sepeser pun juga punya sisa
      // penuh, tapi ia bukan pesanan DP yang menggantung.
      pokokMasuk: uangUntukClient(pokokMasuk),
      sisaPokok: uangUntukClient(sisaPokok),
      adaUangMasuk: lebihBesar(pokokMasuk, 0),
      dibayarSebagian: masihAdaSisa(b.totalPrice, b.payments),
      pokokLunas: sudahLunas(b.totalPrice, b.payments),
      // Perkiraan refund, untuk ditampilkan sebelum pembeli mengajukan.
      // Nominal yang mengikat dihitung ulang server saat pengajuan diproses.
      perkiraanRefund: uangUntukClient(persen(pokokMasuk, PERSEN_REFUND)),
      // Refund yang sudah ditetapkan server, bila pengajuannya sudah diproses.
      refundAmount: b.refundAmount === null ? null : uangUntukClient(b.refundAmount),
    };
  };

  const activeOrders = pesananAktif.map(siapkanPesanan);
  const historyOrders = pesananRiwayat.map(siapkanPesanan);

  // TOTAL PENGELUARAN
  // -----------------
  // Uang yang benar-benar keluar dari kantong pembeli, bukan nilai pesanan yang
  // pernah ia buat.
  //
  // Rumus ini sebelumnya menjumlahkan `totalPrice` dari pesanan yang statusnya
  // masuk daftar pendapatan. Tiga hal salah sekaligus:
  //
  //   1. Nilai KONTRAK dianggap uang yang sudah dibayar. Pembeli DP yang baru
  //      menyetor 60% melihat 100% tercatat sebagai pengeluarannya — angka yang
  //      belum pernah meninggalkan rekeningnya.
  //   2. Status dipakai sebagai bukti pembayaran. `PAID_CONFIRMED` hanya
  //      berarti admin menandainya; ia bisa disetel tanpa satu pun rupiah masuk.
  //   3. Refund yang sudah ditransfer keluar tidak dikurangkan sama sekali —
  //      hanya disembunyikan dengan mengecualikan status `REFUNDED`. Refund
  //      SEBAGIAN atas pesanan yang tetap berjalan tidak pernah terlihat.
  //
  // Sekarang: seluruh `Payment PAID` (termasuk `TAMBAHAN` — pembeli memang
  // membayarnya), dikurangi refund yang sudah benar-benar selesai ditransfer.
  // Keduanya dijumlahkan database, atas SELURUH riwayat akun — bukan atas 100
  // baris yang kebetulan muat di layar.
  //
  // `_sum` mengembalikan `null` bila tidak ada satu pun baris yang cocok, dan
  // itu memang berarti nol; `keDecimal` lewat `?? 0` menjaganya tetap Decimal
  // sehingga pengurangan di bawah tidak pernah menyentuh aritmetika biasa.
  const selisih = kurang(
    agregatMasuk._sum.jumlah ?? 0,
    agregatRefund._sum.refundAmount ?? 0
  );
  const totalSpent = keAngka(lebihBesar(selisih, 0) ? selisih : 0);

  // Hanya nama dan email yang ditampilkan kartu profil. Objek sesi NextAuth
  // memuat lebih dari itu (id, role, dan apa pun yang ditambahkan callback di
  // kemudian hari); tidak ada alasan semuanya menyeberang ke browser.
  return (
    <DashboardClientPage
        session={{
          user: {
            name: session.user?.name ?? null,
            email: session.user?.email ?? null,
          },
        }}
        activeOrders={activeOrders}
        historyOrders={historyOrders}
        // Jumlah seluruhnya, terpisah dari panjang array: yang dikirim hanya 50
        // terbaru per tab, sedangkan angka ini menghitung semuanya.
        jumlahAktif={jumlahAktif}
        jumlahRiwayat={jumlahRiwayat}
        batasPerTab={PESANAN_TERBARU}
        totalSpent={totalSpent}
    />
  );
}