// src/app/api/admin/orders/update-design-status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
// `import type`, bukan import nilai: yang dipakai hanya tipenya, jadi baris ini
// hilang sepenuhnya saat kompilasi dan tidak menarik runtime Prisma ke bundle.
import type { Prisma } from "@prisma/client";
import { DesignStatus, daftarNilai, sahDesignStatus } from "@/lib/enum-guard";
import { idDariBody } from "@/lib/id-dari-body";
import { bacaBodyJson } from "@/lib/body-json";
import { peranBoleh, PERAN_PENGELOLA } from "@/lib/gerbang-peran";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || !peranBoleh(PERAN_PENGELOLA, session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
    const hasilBody = await bacaBodyJson(req, 'admin/orders/update-design-status');
    if (!hasilBody.ok) return hasilBody.jawaban;
    const body = hasilBody.body;
    const { orderId: orderIdMentah, status, reason: alasanMentah } = body;

    // Tipenya, bukan keberadaannya: objek selalu truthy sehingga `!orderId`
    // meloloskan `{"not":""}` utuh ke `where`, dan Prisma menjawabnya dengan
    // galat validasi yang sampai ke admin sebagai 500 "Gagal mengupdate status
    // desain" — bisa dipicu siapa pun yang punya sesi staf.
    const orderId = idDariBody(orderIdMentah);
    if (orderId === null) {
      return NextResponse.json({ message: "ID pesanan tidak valid" }, { status: 400 });
    }

    // `reason` ditulis ke kolom teks `designRejectionReason`. Nilai non-teks
    // ditolak database — dan alasan penolakan desain adalah yang dibaca
    // pembeli, jadi bentuknya dipastikan di sini, bukan di lapisan penyimpanan.
    const reason = typeof alasanMentah === 'string' ? alasanMentah.trim() : '';

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

    // `Prisma.BookingUpdateInput`, bukan `any`: dengan `any` setiap nama kolom
    // di bawah lolos tanpa diperiksa, dan kolom yang salah tulis diteruskan ke
    // `booking.update` sebagai galat validasi runtime — 500 "Gagal mengupdate
    // status desain" yang baru ketahuan saat admin menekan tombolnya, bukan saat
    // build.
    const dataToUpdate: Prisma.BookingUpdateInput = {
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
