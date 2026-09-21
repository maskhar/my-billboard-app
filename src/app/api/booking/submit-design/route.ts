// src/app/api/booking/submit-design/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Login dulu" }, { status: 401 });

    const { orderId, designUrl, notes } = await req.json();

    // Simpan File URL dan Ubah Status jadi DESIGN_RECEIVED (Siap Cetak)
    await prisma.booking.update({
        where: { id: orderId },
        data: { 
            designFileUrl: designUrl,
            status: "DESIGN_RECEIVED",
            // Simpan catatan tambahan di history atau field lain jika perlu
        }
    });

    return NextResponse.json({ message: "Desain Berhasil Dikirim" });

  } catch (error) {
      return NextResponse.json({ message: "Gagal" }, { status: 500 });
  }
}