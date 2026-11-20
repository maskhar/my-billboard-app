import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";

const VALID_ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID_CONFIRMED',
  'DESIGN_RECEIVED',
  'IN_PRODUCTION',
  'INSTALLATION',
  'ACTIVE',
  'WAITING_BANK',
  'REVIEW_REFUND',
  'PROCESS_REFUND',
  'REFUNDED',
  'CANCELLED',
] as const;

const TERMINAL_ORDER_STATUSES = ['CANCELLED', 'REFUNDED'] as const;

const ALLOWED_ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['CANCELLED', 'PAID_CONFIRMED', 'DESIGN_RECEIVED', 'IN_PRODUCTION'],
  PAID_CONFIRMED: ['CANCELLED', 'DESIGN_RECEIVED', 'IN_PRODUCTION', 'REVIEW_REFUND'],
  DESIGN_RECEIVED: ['IN_PRODUCTION', 'REVIEW_REFUND'],
  IN_PRODUCTION: ['INSTALLATION', 'REVIEW_REFUND'],
  INSTALLATION: ['ACTIVE', 'REVIEW_REFUND'],
  ACTIVE: ['WAITING_BANK', 'REVIEW_REFUND'],
  WAITING_BANK: ['PROCESS_REFUND'],
  REVIEW_REFUND: ['WAITING_BANK', 'ACTIVE'],
  PROCESS_REFUND: ['REFUNDED'],
  REFUNDED: [],
  CANCELLED: [],
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  // 1. Cek Admin
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { orderId, newStatus, reason, refundProof, installationProof, isLocked } = await req.json();

  if (!orderId) {
      return NextResponse.json({ message: "orderId wajib diisi" }, { status: 400 });
  }

  if (newStatus !== undefined && newStatus !== null) {
      if (!VALID_ORDER_STATUSES.includes(newStatus as (typeof VALID_ORDER_STATUSES)[number])) {
          return NextResponse.json(
              { message: `Status order tidak valid. Gunakan salah satu: ${VALID_ORDER_STATUSES.join(', ')}.` },
              { status: 400 },
          );
      }
  }

  try {
      if (newStatus !== undefined && newStatus !== null) {
          const currentOrder = await prisma.booking.findUnique({
              where: { id: orderId },
              select: { status: true, refundedAt: true },
          });
          if (!currentOrder) {
              return NextResponse.json({ message: "Order tidak ditemukan" }, { status: 404 });
          }
          if (newStatus !== currentOrder.status) {
              if (TERMINAL_ORDER_STATUSES.includes(currentOrder.status as (typeof TERMINAL_ORDER_STATUSES)[number])) {
                  return NextResponse.json({ message: "Status akhir (CANCELLED/REFUNDED) tidak dapat diubah lagi." }, { status: 400 });
              }
              const allowed = ALLOWED_ORDER_TRANSITIONS[currentOrder.status] ?? [];
              if (!allowed.includes(newStatus)) {
                  return NextResponse.json(
                      { message: `Transisi status tidak diizinkan: ${currentOrder.status} -> ${newStatus}.` },
                      { status: 400 },
                  );
              }
          }
          if (newStatus === 'REFUNDED' && !currentOrder.refundedAt) {
              // handled below
          }
      }

      const updateData: any = { 
          ...(newStatus !== undefined && newStatus !== null && { status: newStatus }),
          ...(reason && { cancelReason: reason }),
          ...(refundProof && { refundProof: refundProof }),
          ...(installationProof && { installationProof: installationProof }),
          ...(isLocked !== undefined && { isLocked: isLocked })
      };

      if (newStatus === 'REFUNDED') {
          const currentOrder = await prisma.booking.findUnique({ where: {id: orderId}, select: { refundedAt: true } });
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