// src/app/api/admin/orders/upload-internal-design/route.ts
//
// Jalur desain "dikerjakan internal": tim sendiri yang membuat desainnya, jadi
// hasilnya langsung `APPROVED` tanpa melewati review.
//
// Karena langsung disetujui, URL yang masuk di sini adalah URL yang ditampilkan
// ke pembeli sebagai desain final. `designUrl` dulu ditulis apa adanya — hanya
// diperiksa "tidak kosong". Peran yang boleh memanggil termasuk `OPERATOR`, jadi
// akun operator bisa menanam `javascript:` yang kemudian dijalankan ADMIN saat
// membuka pesanan. Pemeriksaannya sekarang lewat `src/lib/url-bukti.ts`, satu
// modul yang sama dengan `booking/submit-design` dan `admin/update-order`.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { urlBuktiSah } from "@/lib/url-bukti";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !['ADMIN', 'SUPER_ADMIN', 'OPERATOR'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "Body bukan JSON yang sah." }, { status: 400 });
    }

    const { orderId, designUrl } = (body ?? {}) as Record<string, unknown>;

    // `orderId` dulu hanya diperiksa truthy, lalu diteruskan ke Prisma. Nilai
    // selain teks gagal di lapisan paling dalam sebagai "Gagal mengunggah
    // desain" — pesan yang tidak menyebut penyebabnya.
    if (typeof orderId !== 'string' || orderId.trim() === "") {
      return NextResponse.json({ message: "ID pesanan tidak valid." }, { status: 400 });
    }

    const berkas = urlBuktiSah(designUrl);
    if (!berkas) {
      return NextResponse.json(
        {
          message:
            "URL desain tidak valid. Unggah berkasnya lewat tombol unggah, atau " +
            "tempelkan tautan http/https.",
        },
        { status: 400 }
      );
    }

    // `updateMany` dipakai supaya pesanan yang tidak ada dijawab 404, bukan
    // melempar P2025 yang jatuh ke 500 "Gagal mengunggah desain".
    const { count } = await prisma.booking.updateMany({
      where: { id: orderId },
      data: {
        designFileUrl: berkas,
        designStatus: 'APPROVED', // Otomatis approve karena dari internal
        designApprovedAt: new Date(), // Catat waktunya
      },
    });

    if (count === 0) {
      return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ message: "Desain internal berhasil diunggah dan disetujui!" });

  } catch {
    // Galat Prisma membawa query beserta nilai kolomnya; hanya kategorinya yang
    // dicatat.
    console.error('[upload-internal-design] gagal menyimpan desain internal.');
    return NextResponse.json({ message: "Gagal mengunggah desain" }, { status: 500 });
  }
}
