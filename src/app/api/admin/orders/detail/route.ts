// src/app/api/admin/orders/detail/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json(null, { status: 400 });

  const order = await prisma.booking.findUnique({
      where: { id: id },
      include: {
          user: true,
          billboard: true,
      }
  });

  if (!order) return NextResponse.json({ message: "Order tidak ditemukan" }, { status: 404 });

  return NextResponse.json(order);
}
