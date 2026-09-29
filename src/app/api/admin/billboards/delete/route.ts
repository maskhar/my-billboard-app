// src/app/api/admin/billboards/delete/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idDariBody } from "@/lib/id-dari-body";
import { bacaBodyJson } from "@/lib/body-json";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
      const hasilBody = await bacaBodyJson(req, 'admin/billboards/delete');
      if (!hasilBody.ok) return hasilBody.jawaban;
      const { id: idMentah } = hasilBody.body;

      // `findFirst` di bawah menerima FILTER pada `billboardId`, bukan hanya
      // nilai. `{"id":{"not":""}}` karena itu cocok dengan pesanan aktif milik
      // billboard MANA PUN: billboard yang sebenarnya bebas ikut terbaca
      // "sedang disewa", dan jawabannya sekaligus memberitahu orang luar apakah
      // ada pesanan aktif di sistem ini sama sekali.
      const id = idDariBody(idMentah);
      if (id === null) {
          return NextResponse.json({ message: "ID billboard tidak valid." }, { status: 400 });
      }

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
          where: { id }
      });

      return NextResponse.json({ message: "Billboard Berhasil Dihapus" });

  } catch (error) {
      // Galat mentah tidak dikirim ke client: pesan Prisma memuat nama kolom
      // dan isi kueri.
      console.error('[billboards/delete] Gagal menghapus billboard:', error);
      return NextResponse.json({ message: "Gagal menghapus data" }, { status: 500 });
  }
}