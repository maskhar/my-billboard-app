// src/app/api/booking/request-refund/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";

export async function POST(req: Request) {
  const body = await req.json();
  const adminEmail = process.env.ADMIN_EMAIL; // Email Bos

  // STEP A: User kirim ALASAN (Tahap Awal)
  if (body.step === 'reason') {
      const order = await prisma.booking.update({
          where: { id: body.orderId },
          data: {
              status: "REVIEW_REFUND",
              cancelReason: body.reason,
          },
          include: { billboard: true, user: true }
      });

      // NOTIFIKASI KE ADMIN
      if (adminEmail) {
          await sendEmail({
              to: adminEmail,
              subject: `⚠️ Permintaan Refund: #${order.id.slice(-6).toUpperCase()}`,
              title: "User Minta Batal",
              message: `User <b>${order.user.name}</b> mengajukan pembatalan untuk billboard <b>${order.billboard.title}</b>.<br/>Alasan: "${body.reason}"`,
              orderDetail: {
                id: order.id,
                total: order.totalPrice,
                status: "REVIEW REFUND",
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration
              }
          });
      }

      return NextResponse.json({ message: "Alasan dikirim" });
  }

  // STEP B: User kirim REKENING (Tahap Kedua)
  if (body.step === 'bank') {
      const orderData = await prisma.booking.findUnique({ where: { id: body.orderId } });
      const refundNominal = (orderData?.totalPrice || 0) * 0.90;

      const order = await prisma.booking.update({
          where: { id: body.orderId },
          data: {
              status: "PROCESS_REFUND",
              userBankName: body.bankName,
              userBankAccount: body.bankAccount,
              refundAmount: refundNominal 
          },
          include: { billboard: true, user: true }
      });

      // NOTIFIKASI KE ADMIN
      if (adminEmail) {
          await sendEmail({
              to: adminEmail,
              subject: `💰 Segera Proses Transfer: #${order.id.slice(-6).toUpperCase()}`,
              title: "Data Rekening Masuk",
              message: `User telah memasukkan data rekening. Mohon segera transfer pengembalian dana Rp ${refundNominal.toLocaleString('id-ID')}.<br/>Bank: ${body.bankName} - ${body.bankAccount}`,
              orderDetail: {
                id: order.id,
                total: refundNominal, // Total yg harus ditransfer
                status: "PROCESS REFUND",
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration
              }
          });
      }

      return NextResponse.json({ message: "Rekening disimpan" });
  }

  return NextResponse.json({ message: "Invalid step" }, { status: 400 });
}