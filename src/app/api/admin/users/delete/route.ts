// src/app/api/admin/users/delete/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  // Komentar di bawah ini dulu berbunyi "Hanya Super Admin atau Admin",
  // tetapi syaratnya `role !== 'ADMIN'` — yang justru MENOLAK SUPER_ADMIN.
  // Pemegang peran tertinggi tidak bisa menghapus siapa pun, dan pesan yang
  // ia terima hanya "Akses Ditolak".
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
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

      // Dua penghapusan di bawah dulu berdiri sendiri-sendiri. Bila yang
      // pertama berhasil dan yang kedua gagal — dan kegagalan itu WAJAR
      // terjadi, karena `User` masih dirujuk oleh `BillboardHistory`,
      // `Billboard.createdById`, dan `Billboard.updatedById` yang tidak
      // memakai cascade — maka seluruh riwayat transaksi pengguna itu sudah
      // lenyap sementara akunnya tetap ada. Bukti pembayaran, nominal, dan
      // tanggal pemasangan hilang permanen, dan admin hanya melihat pesan
      // "Gagal menghapus user" seolah tidak terjadi apa-apa.
      //
      // Di dalam `$transaction`, kegagalan di langkah mana pun mengembalikan
      // semuanya seperti semula.
      await prisma.$transaction(async (tx) => {
          await tx.booking.deleteMany({ where: { userId: id } });
          await tx.user.delete({ where: { id: id } });
      });

      return NextResponse.json({ message: "User Berhasil Dihapus" });

  } catch (error) {
      // Sebab paling umum: pengguna ini masih tercatat sebagai pembuat atau
      // pengubah billboard, atau punya baris di riwayat perubahan. Pesan
      // "Gagal menghapus user" tidak pernah menjelaskan itu kepada admin,
      // yang lalu mencoba berulang kali dengan hasil sama.
      console.error('[users/delete] Gagal menghapus user:', error);
      return NextResponse.json(
          { message: "Gagal menghapus user. Kemungkinan ia masih tercatat sebagai pembuat/pengubah billboard atau punya riwayat perubahan." },
          { status: 500 }
      );
  }
}