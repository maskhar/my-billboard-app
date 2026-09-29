// src/app/api/admin/billboards/quick-update/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  BillboardStatus,
  PublishStatus,
  daftarNilai,
  sahBillboardStatus,
  sahPublishStatus,
} from "@/lib/enum-guard";
import { idDariBody } from "@/lib/id-dari-body";
import { bacaBodyJson } from "@/lib/body-json";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
      const hasilBody = await bacaBodyJson(req, 'admin/billboards/quick-update');
      if (!hasilBody.ok) return hasilBody.jawaban;
      const body = hasilBody.body;
      const { id: idMentah, status, publishStatus } = body;

      // Kedua enum di bawah sudah dijaga; `id` dulu hanya diperiksa
      // keberadaannya. Objek selalu truthy, jadi `{"not":""}` lolos ke `where`
      // dan berbalik menjadi 500 "Gagal mengupdate status".
      const id = idDariBody(idMentah);
      if (id === null) {
          return NextResponse.json({ message: "ID billboard tidak valid." }, { status: 400 });
      }

      // Nilai status dulu diteruskan apa adanya dari body request ke
      // database. Salah ketik satu huruf akan tersimpan diam-diam dan
      // billboard hilang dari katalog tanpa siapa pun tahu sebabnya.
      const dataToUpdate: {
        status?: BillboardStatus;
        publishStatus?: PublishStatus;
      } = {};

      if (status !== undefined) {
        if (!sahBillboardStatus(status)) {
          return NextResponse.json(
            { message: `Status billboard tidak dikenal. Nilai yang sah: ${daftarNilai(BillboardStatus)}` },
            { status: 400 }
          );
        }
        dataToUpdate.status = status;
      }

      if (publishStatus !== undefined) {
        if (!sahPublishStatus(publishStatus)) {
          return NextResponse.json(
            { message: `Status publikasi tidak dikenal. Nilai yang sah: ${daftarNilai(PublishStatus)}` },
            { status: 400 }
          );
        }
        dataToUpdate.publishStatus = publishStatus;
      }

      if (Object.keys(dataToUpdate).length === 0) {
          return NextResponse.json({ message: "Tidak ada data untuk diupdate" }, { status: 400 });
      }

      await prisma.billboard.update({
          where: { id },
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
