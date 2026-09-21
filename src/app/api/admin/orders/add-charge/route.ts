// src/app/api/admin/orders/add-charge/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
        return NextResponse.json({ message: "Jumlah biaya tidak valid" }, { status: 400 });
    }

    await prisma.additionalCharge.create({
      data: {
        bookingId: orderId,
        description: description,
        amount: amountFloat,
      },
    });

    // Perbarui juga `updatedAt` di booking utama untuk trigger revalidasi
    await prisma.booking.update({
        where: { id: orderId },
        data: { updatedAt: new Date() }
    });

    return NextResponse.json({ message: "Biaya tambahan berhasil dicatat!" });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Gagal menambah biaya" }, { status: 500 });
  }
}
