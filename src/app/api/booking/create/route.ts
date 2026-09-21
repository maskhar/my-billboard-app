import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next"; 
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ message: "Sesi Habis." }, { status: 401 });
    }

    // Blokir Admin Booking
    if (session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN') {
        return NextResponse.json({ message: "Admin dilarang membuat pesanan." }, { status: 403 });
    }

    const body = await req.json();
    const { 
        billboardId, duration, totalPrice, dpAmount, 
        paymentType, designOption, startDateString
    } = body;

    // 1. Ambil Data Billboard untuk Nama & Alamat di Email
    const targetBillboard = await prisma.billboard.findUnique({
        where: { id: billboardId }
    });

    if (!targetBillboard || targetBillboard.status !== 'Available') {
         return NextResponse.json({ message: "Billboard tidak tersedia." }, { status: 400 });
    }

    // 2. Simpan
    const startDate = new Date(startDateString);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + duration); 

    const newBooking = await prisma.booking.create({
        data: {
            userId: session.user.id,
            billboardId, startDate, endDate, duration, totalPrice,
            dpAmount: paymentType === 'dp' ? dpAmount : 0, 
            status: "PENDING_PAYMENT", 
            designOption,
        }
    });

    // 3. KIRIM EMAIL KE USER
    // Pastikan session.user.email ada isinya
    if (session.user.email) {
        await sendEmail({
            to: session.user.email,
            subject: `Tagihan Order #${newBooking.id.slice(-6).toUpperCase()}`,
            title: "Pesanan Diterima",
            message: `Halo ${session.user.name}, pesanan Anda telah kami terima.`,
            orderDetail: {
                id: newBooking.id,
                billboardTitle: targetBillboard.title,     // <-- DATA PENTING
                billboardAddress: targetBillboard.address, // <-- DATA PENTING
                duration: duration,
                total: totalPrice,
                status: "PENDING_PAYMENT"
            }
        });
    }

    // 4. KIRIM EMAIL KE ADMIN (Jika ada di .env)
    const adminEmail = process.env.ADMIN_EMAIL; 
    
    // Debug: Cek apakah env terbaca
    console.log("📨 Mengirim notif ke Admin:", adminEmail || "TIDAK ADA ADMIN_EMAIL DI .ENV");

    if (adminEmail) {
        await sendEmail({
            to: adminEmail,
            subject: `[ADMIN] Order Masuk: ${targetBillboard.title}`,
            title: "Ada Cuan Masuk! 💰",
            message: `User ${session.user.name} baru saja membuat pesanan. Mohon cek dashboard.`,
            orderDetail: {
                id: newBooking.id,
                billboardTitle: targetBillboard.title,
                billboardAddress: targetBillboard.address,
                duration: duration,
                total: totalPrice,
                status: "PENDING VERIFICATION"
            }
        });
    }

    return NextResponse.json({ message: "Sukses", orderId: newBooking.id });

  } catch (error: any) {
    console.error("🔥 Server Error:", error);
    return NextResponse.json({ message: "Error Server" }, { status: 500 });
  }
}