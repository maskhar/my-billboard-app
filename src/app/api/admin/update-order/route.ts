import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  // 1. Cek Admin
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { orderId, newStatus, reason, refundProof, isLocked } = await req.json();

  try {
      const updateData: any = { 
          status: newStatus,
          ...(reason && { cancelReason: reason }),
          ...(refundProof && { refundProof: refundProof }),
          ...(isLocked !== undefined && { isLocked: isLocked })
      };

      if (newStatus === 'REFUNDED') {
          const currentOrder = await prisma.booking.findUnique({ where: {id: orderId}});
          if (!currentOrder?.refundedAt) {
              updateData.refundedAt = new Date();
          }
      }

      // 2. Update Database & SEKALIGUS AMBIL DATA USER DAN BILLBOARD (Untuk Email)
      // Ini adalah perbaikan utamanya (include user, include billboard)
      const updatedOrder = await prisma.booking.update({
          where: { id: orderId },
          data: updateData,
          include: { 
              user: true, 
              billboard: true // Penting buat template email
          }
      });

      // 3. LOGIC KIRIM EMAIL NOTIFIKASI
      // Pastikan User & Emailnya Ada
      if (updatedOrder && updatedOrder.user && updatedOrder.user.email) {
        
        let subject = "", title = "", message = "";
        
        // Skenario A: Order Aktif (Lunas)
        if (newStatus === 'ACTIVE') {
            subject = `✅ Pembayaran Diterima - Order #${updatedOrder.id.slice(-6).toUpperCase()}`;
            title = "Pembayaran Berhasil! Order Aktif.";
            message = `Halo ${updatedOrder.user.name}, pembayaran Anda telah kami terima. Billboard "${updatedOrder.billboard.title}" sekarang berstatus AKTIF dan siap tayang.`;
        } 
        // Skenario B: Refund Selesai
        else if (newStatus === 'REFUNDED') {
            subject = "💰 Dana Refund Dikembalikan";
            title = "Pengembalian Dana Selesai";
            message = `Halo ${updatedOrder.user.name}, Admin telah mentransfer pengembalian dana ke rekening Anda. Silakan cek bukti transfer di dashboard website.`;
        }

        // Kirim Email jika Subject terisi
        if (subject) {
            console.log("📨 Mengirim notifikasi update ke:", updatedOrder.user.email);
            
            await sendEmail({
                to: updatedOrder.user.email,
                subject: subject,
                title: title,
                message: message,
                orderDetail: {
                    id: updatedOrder.id,
                    // Sekarang data ini pasti ada karena kita sudah 'include' di atas
                    billboardTitle: updatedOrder.billboard.title,
                    billboardAddress: updatedOrder.billboard.address,
                    duration: updatedOrder.duration,
                    total: updatedOrder.totalPrice,
                    status: newStatus
                }
            });
        }
      } else {
          console.warn("⚠️ Data User/Email tidak ditemukan saat update order.");
      }

      return NextResponse.json({ message: "Update Sukses" });
  } catch (error) {
      console.error("Update Error:", error);
      return NextResponse.json({ message: "Gagal Update" }, { status: 500 });
  }
}