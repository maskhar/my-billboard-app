// src/app/api/admin/orders/add-charge/route.ts
//
// Mencatat biaya tambahan SEKALIGUS menerbitkan tagihannya.
//
// Sebelumnya route ini hanya menulis `AdditionalCharge`. Akibatnya biaya
// tambahan menjadi kewajiban yang tidak punya jalur bayar: pembeli melihat
// nominalnya di invoice tanpa tombol, dan kolom "tambahan dibayar" di dashboard
// admin selamanya nol karena tidak ada kode mana pun yang pernah membuat baris
// `Payment` bertujuan TAMBAHAN.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PaymentStatus, PaymentTujuan } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { keAngka, keDecimal, lebihBesar, rupiah } from "@/lib/money";
import { sisaTambahan } from "@/lib/pembayaran";
import { sendEmail } from "@/lib/mail";

/** Penolakan yang sudah punya status HTTP-nya, dilempar dari dalam transaksi. */
class GalatBiayaTambahan extends Error {
  constructor(
    readonly status: number,
    pesan: string
  ) {
    super(pesan);
    this.name = 'GalatBiayaTambahan';
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { orderId, description, amount } = body;

    if (!orderId || !description || !amount) {
      return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });
    }

    // `parseFloat` mengubah nominal menjadi angka pecahan basis 2 sebelum
    // disimpan ke kolom `Decimal(15, 2)` — persis kebalikan dari alasan kolom
    // itu dibuat Decimal. Nilai seperti 1.005 dibulatkan ke arah yang tidak
    // bisa diduga. `keDecimal` menjaga angkanya apa adanya sampai ke database.
    const nominal = keDecimal(amount);
    if (!lebihBesar(nominal, 0)) {
        return NextResponse.json({ message: "Jumlah biaya tidak valid" }, { status: 400 });
    }

    // Seluruh penulisan di bawah harus berhasil atau gagal bersama.
    //
    // Kalau biaya tercatat tapi `booking.update` gagal — misalnya `orderId`
    // tidak ada — tagihan itu menjadi yatim: menempel pada booking yang tidak
    // ada, tidak muncul di layar mana pun, tapi tetap terhitung di query
    // agregat. Admin melihat "Gagal menambah biaya" lalu mencoba lagi, dan
    // baris yatim kedua ikut tertinggal.
    //
    // Sejak tagihannya ikut diterbitkan di sini, satu kegagalan lagi harus
    // dicakup transaksi yang sama: biaya yang tercatat tanpa tagihan adalah
    // kewajiban yang tidak bisa dibayar siapa pun.
    const hasil = await prisma.$transaction(async (tx) => {
      await tx.additionalCharge.create({
        data: {
          bookingId: orderId,
          description: description,
          amount: nominal,
        },
      });

      // Perbarui juga `updatedAt` di booking utama untuk trigger revalidasi.
      // Sekaligus mengambil data pembeli untuk suratnya — satu query, dan bila
      // `orderId` tidak ada seluruh transaksi ini gagal di sini.
      const pesanan = await tx.booking.update({
          where: { id: orderId },
          data: { updatedAt: new Date() },
          select: {
            id: true,
            duration: true,
            user: { select: { email: true, name: true } },
            billboard: { select: { title: true, address: true } },
            additionalCharges: { select: { amount: true } },
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

      // Nominal tagihan adalah SISA — seluruh biaya tambahan dikurangi yang
      // sudah dibayar — bukan `nominal` yang baru dicatat. Indeks unik bersyarat
      // `payment_satu_tagihan_menganggur` hanya mengizinkan satu baris PENDING
      // per (bookingId, tujuan), jadi tidak ada tempat untuk satu tagihan per
      // biaya; dan memang tidak perlu ada, karena yang ditagihkan kepada pembeli
      // adalah satu angka.
      const sisa = sisaTambahan(pesanan.additionalCharges, pesanan.payments);

      const tagihanMenganggur = pesanan.payments.find(
        (p) => p.tujuan === PaymentTujuan.TAMBAHAN && p.status === PaymentStatus.PENDING
      );

      if (tagihanMenganggur) {
        // SESI YANG SUDAH DIBUKA MENGUNCI NOMINALNYA.
        //
        // Sesi Xendit dibuat atas nominal tertentu, dan webhook menolak
        // pembayaran yang nominalnya tidak sama dengan tagihan
        // (`NOMINAL_TIDAK_SESUAI`). Menaikkan `jumlah` baris yang sesinya
        // sedang hidup berarti uang pembeli diterima gerbang lalu ditolak
        // sistem kita — masuk ke Xendit, tidak pernah tercatat di sini.
        if (tagihanMenganggur.providerSessionId) {
          throw new GalatBiayaTambahan(
            409,
            'Pembeli sedang membayar biaya tambahan yang sudah ada. ' +
              'Coba lagi setelah pembayaran itu selesai atau sesinya kedaluwarsa.'
          );
        }

        const tertulis = await tx.payment.updateMany({
          where: {
            id: tagihanMenganggur.id,
            status: PaymentStatus.PENDING,
            providerSessionId: null,
          },
          data: { jumlah: sisa },
        });

        // Pembuatan sesi menang balapan di antara pembacaan di atas dan
        // penulisan ini. Nominalnya sudah terkunci; batalkan seluruhnya.
        if (tertulis.count === 0) {
          throw new GalatBiayaTambahan(
            409,
            'Pembeli baru saja membuka pembayaran biaya tambahan. Coba lagi sebentar.'
          );
        }
      } else if (lebihBesar(sisa, 0)) {
        await tx.payment.create({
          data: {
            bookingId: orderId,
            tujuan: PaymentTujuan.TAMBAHAN,
            jumlah: sisa,
            status: PaymentStatus.PENDING,
          },
          select: { id: true },
        });
      }

      return { pesanan, sisa };
    });

    // Surat dikirim SETELAH commit, di luar transaksi. Kegagalan SMTP tidak
    // boleh membatalkan biaya yang sudah sah tercatat, dan transaksi yang
    // menunggu jawaban SMTP menahan baris pesanan selama itu.
    if (hasil.pesanan.user?.email && lebihBesar(hasil.sisa, 0)) {
      try {
        const nomor = hasil.pesanan.id.slice(-6).toUpperCase();
        await sendEmail({
          to: hasil.pesanan.user.email,
          subject: `Biaya tambahan — Order #${nomor}`,
          title: 'Ada Biaya Tambahan',
          message:
            `Biaya tambahan <b>${description}</b> sebesar <b>${rupiah(nominal)}</b> ` +
            `dicatat untuk pesanan #${nomor}.<br/>` +
            `Total biaya tambahan yang perlu dibayar saat ini <b>${rupiah(hasil.sisa)}</b>. ` +
            'Buka Dashboard untuk membayarnya.',
          orderDetail: {
            id: hasil.pesanan.id,
            billboardTitle: hasil.pesanan.billboard?.title,
            billboardAddress: hasil.pesanan.billboard?.address,
            duration: hasil.pesanan.duration,
            total: keAngka(hasil.sisa),
            status: 'MENUNGGU PEMBAYARAN',
          },
        });
      } catch {
        console.error('[add-charge] gagal mengirim notifikasi biaya tambahan.');
      }
    }

    return NextResponse.json({ message: "Biaya tambahan berhasil dicatat!" });

  } catch (error) {
    if (error instanceof GalatBiayaTambahan) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);
    return NextResponse.json({ message: "Gagal menambah biaya" }, { status: 500 });
  }
}
