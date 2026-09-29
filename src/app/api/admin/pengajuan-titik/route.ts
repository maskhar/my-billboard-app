// src/app/api/admin/pengajuan-titik/route.ts
//
// Penulis status pengajuan titik — pasangan dari `/api/sewakan-tempat` yang
// menerimanya.
//
// KENAPA ROUTE INI HARUS ADA BERSAMA TABELNYA
// -------------------------------------------
// Tabel `PengajuanTitik` tanpa pembaca dan tanpa penulis internal hanyalah
// tempat data mengendap: pemilik lahan mengirim pengajuan, baris tersimpan, dan
// tidak seorang pun pernah melihatnya. Itu cacat yang sama dengan kolom yang
// tidak punya penulis — alasan `fotoUrl` ditolak dari schema ini — hanya
// terbalik arahnya. Karena itu halaman `/admin/pengajuan` dan route ini lahir
// di commit yang sama dengan tabelnya.
//
// APA YANG BOLEH DIUBAH DARI SINI
// -------------------------------
// HANYA `status` dan `catatanAdmin`. Data yang dikirim pemilik lahan
// (`namaPemilik`, `nomorWa`, `alamat`, `kota`, `ukuran`, `catatan`) tidak bisa
// disunting lewat route ini, dan itu keputusan: baris ini adalah CATATAN apa
// yang orang itu kirimkan. Admin yang memperbaiki alamatnya "supaya rapi" ikut
// menghapus bukti apa yang sebenarnya diterima, dan ketika pengaju kemudian
// menyangkal, tidak ada lagi yang bisa dibandingkan. Koreksi ditulis di
// `catatanAdmin`, bukan menimpa kiriman aslinya.
//
// `ditanganiById` juga tidak diterima dari body: nilainya diambil dari sesi yang
// memanggil. Bila ia boleh dikirim, satu admin bisa mencatat keputusannya atas
// nama admin lain.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { daftarNilai, nilaiEnumSah } from '@/lib/enum-guard';
import { StatusPengajuanTitik } from '@prisma/client';
import { bacaBodyJson } from "@/lib/body-json";

// Batas panjangnya sama dengan `catatan` di formulir publik. Kolomnya `TEXT`,
// jadi tanpa batas di sini satu permintaan bisa menyimpan megabyte teks yang
// ikut terbaca setiap kali daftar admin dibuka.
const BATAS_CATATAN_ADMIN = 2000;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  // Gerbangnya `ADMIN`/`SUPER_ADMIN`, sama dengan `update-order`.
  //
  // `OPERATOR` dan `CS` sengaja DILUAR: keduanya lolos `middleware.ts` ke
  // `/api/admin/*` (ADMIN_ROLES di sana memuat empat role), jadi tanpa gerbang
  // kedua di sini mereka bisa menutup pengajuan sebagai `DITOLAK`. Menolak
  // penawaran lahan adalah keputusan komersial, bukan penanganan percakapan.
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const hasilBody = await bacaBodyJson(req, 'admin/pengajuan-titik');
    if (!hasilBody.ok) return hasilBody.jawaban;
    const body = hasilBody.body;

    // Allowlist eksplisit, bukan `...body`. Tanpa ini `nomorWa` atau
    // `createdAt` yang diselipkan penyerang ikut sampai ke Prisma.
    const { id, status, catatanAdmin } = body ?? {};

    if (typeof id !== 'string' || id.trim() === '') {
      return NextResponse.json({ message: 'ID pengajuan tidak valid.' }, { status: 400 });
    }

    // Diperiksa di pintu masuk, bukan dibiarkan ditolak enum Postgres di
    // lapisan terdalam: penolakan di sana muncul ke admin sebagai "Gagal
    // menyimpan" tanpa menyebut nilai apa yang sah.
    if (!nilaiEnumSah(StatusPengajuanTitik, status)) {
      return NextResponse.json(
        { message: `Status tidak dikenal. Pilihan: ${daftarNilai(StatusPengajuanTitik)}` },
        { status: 400 }
      );
    }

    // `undefined` berarti "jangan sentuh kolomnya", teks kosong berarti
    // "kosongkan". Keduanya harus berbeda: admin yang hanya memindahkan status
    // tidak boleh kehilangan catatan yang sudah ia tulis sebelumnya.
    let catatan: string | null | undefined;
    if (catatanAdmin === undefined || catatanAdmin === null) {
      catatan = undefined;
    } else if (typeof catatanAdmin === 'string') {
      const rapi = catatanAdmin.trim().slice(0, BATAS_CATATAN_ADMIN);
      catatan = rapi === '' ? null : rapi;
    } else {
      return NextResponse.json(
        { message: 'Catatan admin harus berupa teks.' },
        { status: 400 }
      );
    }

    // `DITOLAK` menuntut alasan, dan alasannya boleh berasal dari catatan yang
    // sudah tersimpan sebelumnya — karena itu diperiksa setelah barisnya
    // dibaca, bukan di sini.
    const pengajuan = await prisma.pengajuanTitik.findUnique({
      where: { id },
      select: { id: true, catatanAdmin: true },
    });

    if (!pengajuan) {
      return NextResponse.json({ message: 'Pengajuan tidak ditemukan.' }, { status: 404 });
    }

    const catatanSetelahIni = catatan === undefined ? pengajuan.catatanAdmin : catatan;

    // Pengajuan yang ditolak tanpa sebab tidak bisa ditinjau ulang oleh siapa
    // pun, termasuk admin yang menolaknya sendiri tiga bulan kemudian. Ini
    // gerbang yang sama semangatnya dengan `update-order` yang menolak
    // `CANCELLED` tanpa `cancelReason`.
    if (status === StatusPengajuanTitik.DITOLAK && !catatanSetelahIni) {
      return NextResponse.json(
        { message: 'Tulis alasan penolakan di catatan admin sebelum menolak pengajuan.' },
        { status: 422 }
      );
    }

    await prisma.pengajuanTitik.update({
      where: { id },
      data: {
        status,
        // `catatan` bisa `undefined`, dan Prisma memperlakukan `undefined`
        // sebagai "kolom ini tidak ikut di-SET" — persis yang dimaksud.
        catatanAdmin: catatan,
        // Diambil dari sesi, bukan dari body. Siapa yang terakhir menyentuh
        // baris ini adalah fakta, bukan pilihan pemanggil.
        ditanganiById: session.user.id,
      },
      select: { id: true },
    });

    return NextResponse.json({ message: 'Status pengajuan diperbarui.' });
  } catch (error) {
    // Pesan Prisma bisa memuat nama kolom dan isi query; tidak diteruskan.
    console.error('Gagal memperbarui pengajuan titik:', error);
    return NextResponse.json(
      { message: 'Terjadi kesalahan pada server. Coba lagi beberapa saat lagi.' },
      { status: 500 }
    );
  }
}
