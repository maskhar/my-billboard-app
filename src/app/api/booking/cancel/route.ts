// src/app/api/booking/cancel/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Login dulu" }, { status: 401 });

    const { orderId } = await req.json();
    const adminEmail = process.env.ADMIN_EMAIL;

    // Update Database
    const order = await prisma.booking.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
        include: { billboard: true, user: true }
    });

    // KIRIM EMAIL KE ADMIN
    if (adminEmail) {
         await sendEmail({
            to: adminEmail,
            subject: `🚫 Order Dibatalkan User: #${order.id.slice(-6).toUpperCase()}`,
            title: "Pesanan Batal",
            message: `User <b>${order.user.name}</b> membatalkan pesanan (Fase Pending) untuk billboard <b>${order.billboard.title}</b>.`,
            orderDetail: {
                id: order.id,
                total: order.totalPrice,
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