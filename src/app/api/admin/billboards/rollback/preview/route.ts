// src/app/api/admin/billboards/rollback/preview/route.ts
//
// Apa yang akan berubah bila satu revisi billboard dipulihkan.
//
// KENAPA ADA ROUTE SENDIRI, BUKAN DIHITUNG DI FORM
// ------------------------------------------------
// Tombol "Pulihkan" di panel riwayat menimpa sampai 17 kolom billboard
// sekaligus. Sebelum route ini ada, satu-satunya keterangan yang dimiliki admin
// adalah tanggal revisi, nama penyuntingnya, dan harganya — tiga hal yang pada
// sepuluh baris riwayat sering identik. Kolom mana yang sesungguhnya berubah
// tidak terlihat sebelum data lamanya sudah tertimpa.
//
// Diffnya TIDAK BISA dihitung di halaman form, dan alasannya bukan kerapian:
//
//   1. `FormBillboard` bukan baris billboard. `specs` di sana sudah dipecah
//      menjadi enam kolom teks, `includes`/`excludes` sudah digabung menjadi
//      `adminOptions`, dan `videoUrl` TIDAK ADA sama sekali — jadi perubahan
//      `videoUrl` akan hilang dari pratinjau tanpa jejak apa pun.
//   2. State form berubah saat admin mengetik. Diff yang dihitung darinya
//      membandingkan snapshot dengan suntingan yang belum disimpan, bukan
//      dengan data yang benar-benar akan ditimpa.
//
// Pratinjau yang menyimpang dari penulisnya memperlihatkan admin perubahan yang
// bukan perubahan yang terjadi — lebih berbahaya daripada tidak ada pratinjau.
// Karena itu sisi "sesudah" di sini adalah objek yang HARFIAH dituliskan
// `billboard.updateMany`: keduanya memanggil `bacaSnapshotBillboard()` yang sama.
//
// METODENYA GET
// -------------
// Route ini tidak menulis apa pun. `POST` untuk pembacaan membuat gerbang CSRF
// dan pencatatan audit apa pun nanti tidak bisa membedakan pembacaan dari
// penulisan pada jalur yang namanya sama-sama `rollback`.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { idDariBody } from '@/lib/id-dari-body';
import { peranBoleh, PERAN_PENGELOLA } from '@/lib/gerbang-peran';
import { bacaSnapshotBillboard } from '@/lib/snapshot-billboard';
import { diffRollbackBillboard } from '@/lib/diff-billboard';
import { rupiah, uangUntukClient } from '@/lib/money';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  // Gerbangnya `PERAN_PENGELOLA`, sama dengan route rollback-nya sendiri —
  // BUKAN `PERAN_PEMBACA_PANEL` yang lebih luas. Pratinjau ini hanya berguna
  // bagi orang yang boleh menekan tombolnya, dan memperlihatkan seluruh
  // koordinat serta slug revisi lama kepada peran yang tidak boleh menulis
  // billboard berarti memperluas pembacaan tanpa ada yang memutuskannya.
  if (!session || !peranBoleh(PERAN_PENGELOLA, session.user.role)) {
    return NextResponse.json({ message: 'Akses Ditolak' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const historyId = idDariBody(searchParams.get('historyId'));
  if (historyId === null) {
    return NextResponse.json({ message: 'ID riwayat tidak valid.' }, { status: 400 });
  }

  try {
    const history = await prisma.billboardHistory.findUnique({
      where: { id: historyId },
      select: {
        billboardId: true,
        title: true,
        price: true,
        status: true,
        snapshot: true,
        archivedAt: true,
      },
    });

    if (!history) {
      return NextResponse.json({ message: 'History not found' }, { status: 404 });
    }

    // Kolomnya dipilih eksplisit, bukan baris penuh: `createdById`/`updatedById`
    // tidak diperlukan pembanding dan tidak perlu menyeberang ke browser.
    const sekarang = await prisma.billboard.findUnique({
      where: { id: history.billboardId },
      select: {
        title: true,
        price: true,
        status: true,
        address: true,
        sku: true,
        type: true,
        mainImage: true,
        lat: true,
        lng: true,
        slug: true,
        specs: true,
        includes: true,
        excludes: true,
        gallery: true,
        smartsucoUrl: true,
        videoUrl: true,
        publishStatus: true,
      },
    });

    if (!sekarang) {
      return NextResponse.json(
        { message: 'Billboard-nya sudah tidak ada, tidak ada yang bisa dipratinjau.' },
        { status: 404 }
      );
    }

    const hasilSnapshot = bacaSnapshotBillboard(history.snapshot, historyId);
    if (!hasilSnapshot.ok) {
      if (hasilSnapshot.log) {
        console.error(`[billboards/rollback/preview] ${hasilSnapshot.log}`);
      }
      // Pesannya sama dengan yang akan dijawab route rollback atas snapshot
      // yang sama. Pratinjau yang gagal karena snapshot rusak adalah PERINGATAN
      // DINI: admin membacanya sebelum menekan tombolnya, bukan sesudah.
      return NextResponse.json(
        { message: hasilSnapshot.pesan },
        { status: hasilSnapshot.status }
      );
    }

    const baris = diffRollbackBillboard(
      {
        ...sekarang,
        // `Prisma.Decimal` adalah objek dan tidak bisa menyeberang ke Client
        // Component. Pembanding pun tidak boleh melihatnya sebagai objek —
        // `String(decimal)` bekerja, tapi `uangUntukClient` adalah jalur yang
        // sudah diputuskan untuk nominal yang meninggalkan server.
        price: uangUntukClient(sekarang.price),
      },
      {
        title: history.title,
        price: uangUntukClient(history.price),
        status: history.status,
      },
      hasilSnapshot.kolom,
      rupiah
    );

    return NextResponse.json({
      baris,
      // Dikirim supaya dialog bisa menegaskan revisi MANA yang dipratinjau,
      // dan supaya baris pratinjau yang datang terlambat — admin menutup
      // dialognya lalu membuka baris lain — bisa dibuang oleh pemanggilnya
      // alih-alih ditampilkan sebagai pratinjau revisi yang salah.
      historyId,
      archivedAt: history.archivedAt.toISOString(),
    });
  } catch (galat) {
    console.error('[billboards/rollback/preview] Gagal menyusun pratinjau:', galat);
    return NextResponse.json({ message: 'Gagal menyusun pratinjau.' }, { status: 500 });
  }
}
