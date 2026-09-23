// src/app/api/admin/orders/update-design-status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DesignStatus, daftarNilai, sahDesignStatus } from "@/lib/enum-guard";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { orderId, status, reason } = body;

    if (!orderId || !status) {
      return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });
    }
    
    // Kolom `designStatus` bertipe enum. Tanpa pemeriksaan ini, nilai asing
    // ditolak database dan muncul ke admin sebagai "Gagal mengupdate status
    // desain" tanpa menyebut apa yang salah.
    if (!sahDesignStatus(status)) {
        return NextResponse.json(
            { message: `Status desain tidak dikenal. Pilihan: ${daftarNilai(DesignStatus)}` },
            { status: 400 }
        );
    }

    if (status === 'REJECTED' && !reason) {
        return NextResponse.json({ message: "Alasan penolakan harus diisi" }, { status: 400 });
    }

    const dataToUpdate: any = {
      designStatus: status,
      designRejectionReason: status === 'REJECTED' ? reason : null,
    };

    // Jika disetujui, catat waktunya
    if (status === 'APPROVED') {
      dataToUpdate.designApprovedAt = new Date();
    }

    await prisma.booking.update({
      where: { id: orderId },
      data: dataToUpdate,
    });

    return NextResponse.json({ message: `Desain berhasil di-${status.toLowerCase()}!` });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Gagal mengupdate status desain" }, { status: 500 });
  }
}
