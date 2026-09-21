// src/app/api/admin/billboards/quick-update/route.ts
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
      const { id, status, publishStatus } = body;

      if (!id) {
          return NextResponse.json({ message: "ID Billboard dibutuhkan" }, { status: 400 });
      }

      const dataToUpdate: { status?: string, publishStatus?: string } = {};
      if (status) dataToUpdate.status = status;
      if (publishStatus) dataToUpdate.publishStatus = publishStatus;

      if (Object.keys(dataToUpdate).length === 0) {
          return NextResponse.json({ message: "Tidak ada data untuk diupdate" }, { status: 400 });
      }

      await prisma.billboard.update({
          where: { id: id },
          data: {
              ...dataToUpdate,
              updatedById: session.user.id
          }
      });

      return NextResponse.json({ message: "Status berhasil diupdate!" });

  } catch (error) {
      console.error(error);
      return NextResponse.json({ message: "Gagal mengupdate status" }, { status: 500 });
  }
}
