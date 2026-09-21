// src/app/api/admin/billboards/delete/route.ts
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
      const { id } = await req.json();

      // Cek apakah sedang ada yang sewa?
      const hasActiveOrder = await prisma.booking.findFirst({
          where: { 
              billboardId: id,
              status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } 
          }
      });

      if (hasActiveOrder) {
          return NextResponse.json({ message: "Gagal: Billboard ini sedang disewa!" }, { status: 400 });
      }

      // Hapus dari Database
      await prisma.billboard.delete({
          where: { id: id }
      });

      return NextResponse.json({ message: "Billboard Berhasil Dihapus" });

  } catch (error) {
      return NextResponse.json({ message: "Gagal menghapus data" }, { status: 500 });
  }
}