// src/app/api/payment/notify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";

// API NOTIFIKASI PEMBAYARAN MASUK
export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    console.log("💰 [NOTIFY] Menerima sinyal bayar untuk order:", orderId);

    // 1. Ambil Data
    const order = await prisma.booking.findUnique({
        where: { id: orderId },
        include: { user: true, billboard: true }
    });

    if (!order) {
        console.error("❌ Order tidak ditemukan!");
        return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }

        // 2. Update Status & Catat Waktu Bayar
    const nextStatus = order.designOption === 'service' ? 'IN_PRODUCTION' : 'DESIGN_RECEIVED';

    await prisma.booking.update({
        where: { id: orderId },
        data: { 
            status: nextStatus,
            paidAt: new Date() // <-- PENGISIAN TIMESTAMP KUNCI
        }
    });
    console.log(`✅ Status Updated: ${nextStatus} & Waktu bayar dicatat`);

    // 3. LOGIKA KIRIM EMAIL (ADMIN FIRST)
    
    // PERHATIAN: Pastikan ADMIN_EMAIL ada isinya
    const adminEmail = process.env.ADMIN_EMAIL;
    console.log("📨 Target Email Admin:", adminEmail);

    if (adminEmail) {
        const successAdmin = await sendEmail({
            to: adminEmail,
            subject: `[LUNAS] Uang Masuk: Rp ${order.totalPrice.toLocaleString('id-ID')}`,
            title: "Ada Pembayaran Masuk! 💰",
            message: `User <b>${order.user.name}</b> sudah membayar lunas. Total: Rp ${order.totalPrice.toLocaleString('id-ID')}.<br/>Segera cek dashboard dan Klik Terima.`,
            orderDetail: {
                id: order.id,
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration,
                total: order.totalPrice,
                status: "MENUNGGU VERIFIKASI ADMIN"
            }
        });
        
        if (!successAdmin) console.error("⚠️ Gagal kirim ke Admin!");
    } else {
        console.error("⚠️ ADMIN_EMAIL di file .env kosong/tidak terbaca!");
    }

    // Jeda 1 detik biar SMTP tidak ngambek (Rate Limit Prevention)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 4. KIRIM EMAIL KE USER (CONFIRMATION)
    if (order.user.email) {
        await sendEmail({
            to: order.user.email,
            subject: `Pembayaran Berhasil! Order #${order.id.slice(-6).toUpperCase()}`,
            title: "Dana Telah Diterima",
            message: `Terima kasih! Dana sebesar Rp ${order.totalPrice.toLocaleString('id-ID')} sudah masuk ke sistem kami. Tim Admin akan memverifikasi dalam waktu singkat.`,
            orderDetail: {
                id: order.id,
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration,
                total: order.totalPrice,
                status: "SEDANG DIVERIFIKASI"
            }
        });
        console.log("📨 Konfirmasi terkirim ke User:", order.user.email);
    }

    return NextResponse.json({ status: 'ok' });

  } catch (error: any) {
    console.error("🔥 Server Error (Notify):", error.message);
    return NextResponse.json({ message: "Server Error" }, { status: 500 });
  }
}