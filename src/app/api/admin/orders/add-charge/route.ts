// src/app/api/admin/orders/add-charge/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { keDecimal, lebihBesar } from "@/lib/money";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { orderId, description, amount } = body;

    if (!orderId || !description || !amount) {
      return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });
    }

    // `parseFloat` mengubah nominal menjadi angka pecahan basis 2 sebelum
    // disimpan ke kolom `Decimal(15, 2)` — persis kebalikan dari alasan kolom
    // itu dibuat Decimal. Nilai seperti 1.005 dibulatkan ke arah yang tidak
    // bisa diduga. `keDecimal` menjaga angkanya apa adanya sampai ke database.
    const nominal = keDecimal(amount);
    if (!lebihBesar(nominal, 0)) {
        return NextResponse.json({ message: "Jumlah biaya tidak valid" }, { status: 400 });
    }

    // Dua penulisan ini harus berhasil atau gagal bersama (task 3.17).
    //
    // Kalau biaya tercatat tapi `booking.update` gagal — misalnya `orderId`
    // tidak ada — tagihan itu menjadi yatim: menempel pada booking yang tidak
    // ada, tidak muncul di layar mana pun, tapi tetap terhitung di query
    // agregat. Admin melihat "Gagal menambah biaya" lalu mencoba lagi, dan
    // baris yatim kedua ikut tertinggal.
    await prisma.$transaction(async (tx) => {
      await tx.additionalCharge.create({
        data: {
          bookingId: orderId,
          description: description,
          amount: nominal,
        },
      });

      // Perbarui juga `updatedAt` di booking utama untuk trigger revalidasi
      await tx.booking.update({
          where: { id: orderId },
          data: { updatedAt: new Date() }
      });
    });

    return NextResponse.json({ message: "Biaya tambahan berhasil dicatat!" });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Gagal menambah biaya" }, { status: 500 });
  }
}
