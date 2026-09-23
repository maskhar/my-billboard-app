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
    //
    // Kepemilikan ditegakkan di tingkat query: sebelumnya order diambil
    // berdasarkan id saja, sehingga user mana pun bisa menimpa desain milik
    // orang lain. updateMany dipakai karena update() hanya menerima field unik.
    const { count } = await prisma.booking.updateMany({
        where: { id: orderId, userId: session.user.id },
        data: {
            designFileUrl: designUrl,
            status: "DESIGN_RECEIVED",

            // `designStatus` dulu tidak diisi di sini — dibiarkan NULL. Satu-
            // satunya penulis kolom ini adalah admin (APPROVED/REJECTED), jadi
            // nilai PENDING_REVIEW tidak pernah benar-benar ada di database.
            // Tampilan "menunggu review" di dashboard pelanggan dan di panel
            // admin hanya selamat karena keduanya memakai penyangga
            // `|| 'PENDING_REVIEW'` untuk nilai kosong — artinya "belum kirim
            // desain" dan "sudah kirim, menunggu admin" terlihat sama persis.
            // Sekarang keadaannya tercatat sebagai fakta.
            designStatus: "PENDING_REVIEW",

            // Desain yang dikirim ulang setelah ditolak harus menghapus alasan
            // penolakan lama, kalau tidak pesan itu menempel selamanya.
            designRejectionReason: null,
            // Simpan catatan tambahan di history atau field lain jika perlu
        }
    });

    if (count === 0) {
        return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ message: "Desain Berhasil Dikirim" });

  } catch (error) {
      return NextResponse.json({ message: "Gagal" }, { status: 500 });
  }
}