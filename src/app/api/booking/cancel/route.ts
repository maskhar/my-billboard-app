// src/app/api/booking/cancel/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { amankanHtml } from "@/lib/html";
import { judulSurat, sendEmail } from "@/lib/mail";
import { keAngka } from "@/lib/money";
import { tutupTagihanMenganggur } from "@/lib/tutup-tagihan";
import { BookingStatus } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Login dulu" }, { status: 401 });

    const { orderId } = await req.json();
    const adminEmail = process.env.ADMIN_EMAIL;

    // Kepemilikan ditegakkan di tingkat query: sebelumnya order diambil
    // berdasarkan id saja, sehingga user mana pun bisa membatalkan pesanan
    // milik orang lain. updateMany dipakai karena update() hanya menerima
    // field unik pada `where`.
    //
    // `status` ikut disyaratkan. Rute ini adalah pembatalan MANDIRI oleh user
    // pada pesanan yang belum dibayar, dan judul emailnya sendiri berbunyi
    // "(Fase Pending)". Tanpa syarat status, user bisa memanggilnya atas
    // pesanan yang sudah dibayar dan menghanguskan pesanannya sendiri tanpa
    // satu pun jalur pengembalian dana terbuka — uangnya sudah di rekening
    // perusahaan, tapi statusnya CANCELLED, yang bukan status sah untuk
    // mengajukan refund. Pembatalan setelah pembayaran lewat
    // `booking/request-refund`.
    // Penghangusan pesanan dan penutupan tagihannya satu transaksi. Di antara
    // keduanya pesanan sudah CANCELLED sementara tagihannya masih PENDING, dan
    // pembuat sesi pembayaran yang membaca persis di celah itu akan membukakan
    // checkout untuk pesanan yang baru saja dibatalkan pemiliknya sendiri.
    const count = await prisma.$transaction(async (tx) => {
        const { count } = await tx.booking.updateMany({
            where: {
                id: orderId,
                userId: session.user.id,
                status: BookingStatus.PENDING_PAYMENT,
            },
            data: { status: "CANCELLED" },
        });

        // Tagihan hanya ditutup bila pesanannya benar-benar berubah. `count: 0`
        // berarti pesanan itu bukan miliknya, tidak ada, atau sudah dibayar —
        // dan tagihan pesanan yang sudah dibayar masih harus bisa dilunasi.
        if (count > 0) await tutupTagihanMenganggur(tx, [orderId]);

        return count;
    });

    if (count === 0) {
        // Dibedakan agar user tidak melihat "tidak ditemukan" untuk pesanan
        // yang jelas terpampang di layarnya.
        const milikUser = await prisma.booking.findFirst({
            where: { id: orderId, userId: session.user.id },
            select: { status: true },
        });

        if (!milikUser) {
            return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
        }

        return NextResponse.json(
            {
                message:
                    `Pesanan berstatus ${milikUser.status} tidak bisa dibatalkan sendiri. ` +
                    `Pembatalan mandiri hanya berlaku sebelum pembayaran; setelah itu ajukan refund.`,
            },
            { status: 409 }
        );
    }

    const order = await prisma.booking.findUniqueOrThrow({
        where: { id: orderId },
        include: { billboard: true, user: true }
    });

    // KIRIM EMAIL KE ADMIN
    if (adminEmail) {
         await sendEmail({
            to: adminEmail,
            subject: judulSurat({
                topik: 'Dibatalkan pembeli',
                idPesanan: order.id,
                untukAdmin: true,
            }),
            title: "Pesanan Batal",
            message: `User <b>${amankanHtml(order.user.name)}</b> membatalkan pesanan (Fase Pending) untuk billboard <b>${amankanHtml(order.billboard.title)}</b>.`,
            orderDetail: {
                id: order.id,
                // Decimal tidak boleh diserahkan apa adanya ke template email:
                // `Intl.NumberFormat` menerimanya diam-diam dan mencetak
                // "Rp NaN" — lihat catatan di lib/mail.ts.
                total: keAngka(order.totalPrice),
                status: "CANCELLED",
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration
            }
        });
    }

    return NextResponse.json({ message: "Pesanan dibatalkan" });
  } catch (error) {
    return NextResponse.json({ message: "Gagal membatalkan" }, { status: 500 });
  }
}