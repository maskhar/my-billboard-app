// src/app/api/admin/users/delete/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  // Hanya Super Admin atau Admin yang boleh hapus
  if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
      const { id } = await req.json();

      // Cek apakah User ini punya pesanan Aktif/Pending?
      const activeBookings = await prisma.booking.findFirst({
          where: { 
              userId: id,
              status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'PROCESS_REFUND'] } 
          }
      });

      if (activeBookings) {
          return NextResponse.json({ message: "Gagal: User ini sedang memiliki transaksi aktif." }, { status: 400 });
      }

      // Hapus data booking yang statusnya sudah selesai/batal dulu (clean up)
      await prisma.booking.deleteMany({ where: { userId: id } });

      // Hapus Usernya
      await prisma.user.delete({ where: { id: id } });

      return NextResponse.json({ message: "User Berhasil Dihapus" });

  } catch (error) {
      return NextResponse.json({ message: "Gagal menghapus user" }, { status: 500 });
  }
}