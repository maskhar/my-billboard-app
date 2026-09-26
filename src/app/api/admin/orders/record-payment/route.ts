// src/app/api/admin/orders/record-payment/route.ts
//
// Mencatat pembayaran POKOK yang diterima DI LUAR gerbang pembayaran.
//
// KENAPA ROUTE INI HARUS ADA
// --------------------------
// Sebagian pembeli membayar dengan transfer langsung ke rekening perusahaan,
// bukan lewat Xendit. Sebelum route ini ada, satu-satunya cara admin mengakui
// uang itu adalah menekan "Terima Manual" di dashboard — tombol yang memindahkan
// status pesanan ke tahap cetak TANPA menulis baris `Payment` mana pun.
//
// Akibatnya pesanan berjalan dengan pembukuan KOSONG. `uangMasuk` adalah plafon
// nominal refund, penentu apakah tombol "Tolak" mengarah ke pembatalan atau ke
// alur refund, dan dasar sisa tagihan yang ditagihkan kepada pembeli. Nol di
// sana berarti uang yang sudah ada di rekening perusahaan tidak punya jejak di
// sistem: tidak bisa dikembalikan lewat jalur refund, tidak masuk laporan, dan
// pembeli yang sudah melunasi tetap ditagih.
//
// `update-order` sekarang menolak perpindahan dari `PENDING_PAYMENT` ke tahap
// sesudah pembayaran bila pembukuannya kosong, dan route inilah jalan keluarnya:
// catat uangnya lebih dulu, baru pindahkan statusnya.
//
// APA YANG TIDAK DILAKUKAN ROUTE INI
// ----------------------------------
// Tidak memindahkan status pesanan. Pencatatan uang dan perpindahan tahap adalah
// dua keputusan berbeda — yang satu fakta pembukuan, yang lain keputusan
// operasional — dan menyatukannya di satu tombol adalah sebab bug di atas.
//
// Tidak mencatat biaya TAMBAHAN. Biaya tambahan berada di luar `totalPrice` dan
// punya jalurnya sendiri (`add-charge` + `sisaTambahan`).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PaymentStatus, PaymentTujuan } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { amankanHtml } from "@/lib/html";
import { prisma } from "@/lib/prisma";
import { bulat, keAngka, keDecimal, lebihBesar, rupiah } from "@/lib/money";
import {
  STATUS_BOLEH_BAYAR_LANJUTAN,
  sisaTagihan,
  tujuanSetoranPokok,
} from "@/lib/pembayaran";
import { judulSurat, sendEmail } from "@/lib/mail";
import { nomorPesanan } from "@/lib/nomor-pesanan";

/** Penolakan yang sudah punya status HTTP-nya, dilempar dari dalam transaksi. */
class GalatCatatPembayaran extends Error {
  constructor(
    readonly status: number,
    pesan: string
  ) {
    super(pesan);
    this.name = 'GalatCatatPembayaran';
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { orderId, amount } = body;

    // Keterangan cara pembayaran ikut tercetak di surat ke pembeli. Dipotong dan
    // dibersihkan di sini dengan alasan yang sama seperti `add-charge`: teks
    // bebas tanpa batas ikut tersimpan lalu terkirim.
    const keterangan =
      typeof body.keterangan === 'string' ? body.keterangan.trim().slice(0, 200) : '';

    // Tipe `orderId` diperiksa, bukan hanya keberadaannya. Nilai selain teks
    // lolos `!orderId` lalu jatuh ke Prisma sebagai 500 yang terbaca admin
    // sebagai "Gagal" tanpa keterangan apa pun.
    if (typeof orderId !== 'string' || orderId.trim() === '') {
      return NextResponse.json({ message: "ID pesanan tidak valid." }, { status: 400 });
    }

    // `parseFloat` akan mengubah nominal menjadi pecahan basis 2 sebelum masuk
    // kolom `Decimal(15,2)` — persis kebalikan dari alasan kolom itu Decimal.
    const nominal = keDecimal(amount);
    if (!lebihBesar(nominal, 0)) {
      return NextResponse.json({ message: "Nominal pembayaran tidak valid." }, { status: 400 });
    }

    // Rupiah bulat, alasan sama seperti `add-charge`: nominal pecahan ikut ke
    // dalam `sisaTagihan`, dan tagihan pelunasan yang diterbitkan di bawah
    // menjadi pecahan pula — nominal yang tidak akan pernah bisa dibayar lewat
    // gerbang pembayaran (`nominalUntukXendit` menolaknya).
    if (!bulat(nominal)) {
      return NextResponse.json(
        { message: "Nominal harus rupiah bulat, tanpa pecahan sen." },
        { status: 400 }
      );
    }

    const sekarang = new Date();

    // Pembacaan pembukuan dan penulisannya harus satu transaksi. Sisa tagihan
    // yang divalidasi di luar transaksi belum tentu sisa yang berlaku saat
    // barisnya ditulis: sebuah webhook bisa mendaratkan pelunasan di antaranya,
    // dan hasilnya pesanan tercatat lebih bayar tanpa seorang pun tahu.
    const hasil = await prisma.$transaction(async (tx) => {
      const pesanan = await tx.booking.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          duration: true,
          totalPrice: true,
          user: { select: { email: true, name: true } },
          billboard: { select: { title: true, address: true } },
          payments: {
            select: {
              id: true,
              tujuan: true,
              status: true,
              jumlah: true,
              providerSessionId: true,
            },
          },
        },
      });

      if (!pesanan) throw new GalatCatatPembayaran(404, "Pesanan tidak ditemukan.");

      // Daftar yang sama dipakai `periksaKelayakanSesi` dan `add-charge`.
      // Pesanan yang sedang direfund atau sudah tutup tidak boleh menerima
      // setoran baru: nominal refund yang sudah disetujui admin tidak lagi cocok
      // dengan uang yang masuk, dan pesanan tutup tidak punya kewajiban yang
      // bisa dilunasi.
      if (!STATUS_BOLEH_BAYAR_LANJUTAN.includes(pesanan.status)) {
        throw new GalatCatatPembayaran(
          409,
          `Pesanan berstatus ${pesanan.status} tidak lagi menerima pembayaran, ` +
            'jadi setoran tidak bisa dicatat padanya.'
        );
      }

      const sisaSebelum = sisaTagihan(pesanan.totalPrice, pesanan.payments);

      if (!lebihBesar(sisaSebelum, 0)) {
        throw new GalatCatatPembayaran(
          409,
          'Pokok pesanan ini sudah lunas, jadi tidak ada sisa yang bisa dicatat. ' +
            'Bila ini biaya di luar kontrak, catat lewat Biaya Tambahan.'
        );
      }

      // NOMINAL DITOLAK, BUKAN DIPANGKAS DIAM-DIAM.
      //
      // Memangkasnya ke sisa tagihan akan membuat baris `Payment` menyebut angka
      // yang berbeda dari uang yang benar-benar masuk ke rekening — dan angka di
      // pembukuan itulah plafon refund. Kelebihan bayar yang nyata harus terlihat
      // sebagai kelebihan, bukan diam-diam hilang; admin yang salah ketik harus
      // tahu bahwa ia salah ketik.
      if (lebihBesar(nominal, sisaSebelum)) {
        throw new GalatCatatPembayaran(
          400,
          `Nominal ${rupiah(nominal)} melebihi sisa tagihan pokok ` +
            `${rupiah(sisaSebelum)}. Periksa kembali nominal transfernya.`
        );
      }

      // TAGIHAN POKOK YANG MASIH MENGANGGUR HARUS DIBERESKAN LEBIH DULU.
      //
      // Baris `PENDING` bertujuan pokok adalah tagihan atas kewajiban yang baru
      // saja dibayar di luar gerbang. Membiarkannya berarti pembeli masih
      // melihat tombol Bayar untuk uang yang sudah ia transfer — dan kalau ia
      // menekannya, ia membayar dua kali. Ia juga menempati pasangan
      // `(bookingId, tujuan)` pada indeks unik bersyarat
      // `payment_satu_tagihan_menganggur`, sehingga tagihan pelunasan atas sisa
      // yang baru tidak bisa dibuat.
      const pokokMenganggur = pesanan.payments.filter(
        (p) => p.status === PaymentStatus.PENDING && p.tujuan !== PaymentTujuan.TAMBAHAN
      );

      // Sesi yang sudah dibuka SENGAJA menghentikan pencatatan ini.
      //
      // Baris itu mungkin sedang menerima uang di sisi gerbang pada detik ini.
      // Menutupnya berarti uang yang benar-benar diterima Xendit tidak punya
      // baris yang bisa menampungnya; membiarkannya terbuka sambil mencatat
      // setoran manual berarti satu kewajiban dibayar dua kali. Satu-satunya
      // jawaban yang tidak menghilangkan uang siapa pun adalah menunggu.
      const sedangDibayar = pokokMenganggur.find((p) => p.providerSessionId !== null);
      if (sedangDibayar) {
        throw new GalatCatatPembayaran(
          409,
          'Pembeli sedang membayar tagihan pokok pesanan ini lewat gerbang pembayaran. ' +
            'Tunggu pembayaran itu selesai atau sesinya kedaluwarsa, lalu coba lagi.'
        );
      }

      if (pokokMenganggur.length > 0) {
        const ditutup = await tx.payment.updateMany({
          where: {
            id: { in: pokokMenganggur.map((p) => p.id) },
            status: PaymentStatus.PENDING,
            providerSessionId: null,
          },
          data: {
            status: PaymentStatus.VOIDED,
            // Lease pembuatan sesi ikut dilepas, alasan sama seperti
            // `tutupTagihanMenganggur`: baris tertutup yang masih memegang lease
            // terlihat "sedang dikerjakan" oleh pencari claim macet.
            sesiClaimToken: null,
            sesiClaimedAt: null,
            sesiClaimExpiresAt: null,
          },
        });

        // Pembuatan sesi menang balapan di antara pembacaan di atas dan
        // penulisan ini. Batalkan seluruhnya daripada mencatat setoran di
        // samping tagihan hidup atas kewajiban yang sama.
        if (ditutup.count !== pokokMenganggur.length) {
          throw new GalatCatatPembayaran(
            409,
            'Pembeli baru saja membuka pembayaran pokok pesanan ini. Coba lagi sebentar.'
          );
        }
      }

      // Tujuannya diputuskan `tujuanSetoranPokok`, aturan yang sama yang dipakai
      // webhook: setoran pertama `DP` bila sebagian, `FULL` bila menutup seluruh
      // `totalPrice`; setoran berikutnya selalu `PELUNASAN`.
      const tujuan = tujuanSetoranPokok(pesanan.totalPrice, pesanan.payments, nominal);

      // Kolom provider dibiarkan kosong — dan itu justru maknanya: baris tanpa
      // `providerPaymentId` adalah uang yang masuk di luar gerbang pembayaran.
      // `paidAt` diisi karena baris ini memang sudah dibayar; ia yang menjadi
      // jejak waktu setoran.
      const dicatat = await tx.payment.create({
        data: {
          bookingId: pesanan.id,
          tujuan,
          jumlah: nominal,
          status: PaymentStatus.PAID,
          paidAt: sekarang,
        },
        select: { id: true, tujuan: true },
      });

      // Sisa dihitung ulang dari pembukuan, bukan dengan mengurangi angka di
      // memori: baris yang baru ditulis sudah terbaca `PAID` di transaksi ini,
      // dan `sisaTagihan` adalah satu-satunya tempat aturannya tinggal.
      const sisaSesudah = sisaTagihan(pesanan.totalPrice, [
        ...pesanan.payments,
        { tujuan: dicatat.tujuan, status: PaymentStatus.PAID, jumlah: nominal },
      ]);

      // Sisa yang masih ada langsung mendapat tagihannya, sama seperti yang
      // dilakukan webhook saat pokok pertama menjadi `PAID`. Tanpa ini pembeli
      // yang baru menyetor DP lewat transfer tidak punya jalur melunasi sisanya.
      if (lebihBesar(sisaSesudah, 0)) {
        await tx.payment.create({
          data: {
            bookingId: pesanan.id,
            tujuan: PaymentTujuan.PELUNASAN,
            jumlah: sisaSesudah,
            status: PaymentStatus.PENDING,
          },
          select: { id: true },
        });
      }

      // Menyentuh `updatedAt` supaya halaman yang di-cache ikut divalidasi, sama
      // seperti `add-charge`.
      await tx.booking.update({
        where: { id: pesanan.id },
        data: { updatedAt: sekarang },
        select: { id: true },
      });

      return { pesanan, tujuan: dicatat.tujuan, sisaSesudah };
    });

    // Surat dikirim SETELAH commit, di luar transaksi. Kegagalan SMTP tidak boleh
    // membatalkan pencatatan uang yang sudah sah, dan transaksi yang menunggu
    // jawaban SMTP menahan baris pesanan selama itu.
    if (hasil.pesanan.user?.email) {
      try {
        const nomor = nomorPesanan(hasil.pesanan.id);
        const adaSisa = lebihBesar(hasil.sisaSesudah, 0);

        await sendEmail({
          to: hasil.pesanan.user.email,
          subject: judulSurat({
            topik: adaSisa ? 'Pembayaran diterima, sisa tagihan' : 'Pembayaran diterima, lunas',
            idPesanan: hasil.pesanan.id,
            nominal: adaSisa ? hasil.sisaSesudah : nominal,
          }),
          title: 'Pembayaran Anda Sudah Kami Catat',
          message:
            `Pembayaran sebesar <b>${rupiah(nominal)}</b> untuk pesanan #${nomor} sudah kami ` +
            `terima dan catat.` +
            (keterangan ? ` Keterangan: ${amankanHtml(keterangan)}.` : '') +
            (adaSisa
              ? `<br/><br/>Sisa tagihan pokok <b>${rupiah(hasil.sisaSesudah)}</b> masih perlu ` +
                'dilunasi. Tagihannya sudah tersedia di Dashboard Anda dan bisa dibayar ' +
                'langsung dari sana.'
              : '<br/><br/>Pokok pesanan Anda kini <b>LUNAS</b>. Terima kasih.'),
          orderDetail: {
            id: hasil.pesanan.id,
            billboardTitle: hasil.pesanan.billboard?.title,
            billboardAddress: hasil.pesanan.billboard?.address,
            duration: hasil.pesanan.duration,
            total: keAngka(adaSisa ? hasil.sisaSesudah : nominal),
            status: adaSisa ? 'MENUNGGU PELUNASAN' : 'LUNAS',
          },
        });
      } catch {
        console.error('[record-payment] gagal mengirim notifikasi pembayaran manual.');
      }
    }

    return NextResponse.json({
      message: lebihBesar(hasil.sisaSesudah, 0)
        ? `Pembayaran ${rupiah(nominal)} tercatat sebagai ${hasil.tujuan}. ` +
          `Sisa pokok ${rupiah(hasil.sisaSesudah)} sudah diterbitkan tagihannya.`
        : `Pembayaran ${rupiah(nominal)} tercatat sebagai ${hasil.tujuan}. Pokok pesanan lunas.`,
    });
  } catch (error) {
    if (error instanceof GalatCatatPembayaran) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error('[record-payment]', error);
    return NextResponse.json({ message: "Gagal mencatat pembayaran." }, { status: 500 });
  }
}
