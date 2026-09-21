// src/app/api/admin/orders/upload-internal-design/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// API ini mirip dengan /api/booking/submit-design
// Tapi khusus untuk Admin, dan otomatis approve

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { orderId, designUrl } = body;

    if (!orderId || !designUrl) {
      return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });
    }

    await prisma.booking.update({
      where: { id: orderId },
      data: {
        designFileUrl: designUrl,
        designStatus: 'APPROVED', // Otomatis approve karena dari internal
        designApprovedAt: new Date(), // Catat waktunya
      },
    });

    return NextResponse.json({ message: "Desain internal berhasil diunggah dan disetujui!" });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Gagal mengunggah desain" }, { status: 500 });
  }
}
