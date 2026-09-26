// src/app/dashboard/order/[id]/payment/page.tsx
//
// Gerbang server sebelum kunci Components boleh dikirim lewat endpoint browser.
//
// Pemeriksaan di endpoint tetap wajib karena halaman ini bisa dilewati dengan
// memanggil URL API langsung. Sebaliknya, pemeriksaan di sini membuat admin dan
// pemilik yang bukan pemesan tidak pernah menerima HTML halaman pembayaran.

import { PaymentStatus, PaymentTujuan } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
import { notFound, redirect } from 'next/navigation';
import { AlertCircle, ArrowLeft, CalendarClock, CreditCard } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { authOptions } from '@/lib/auth';
import { uangUntukClient } from '@/lib/money';
import { labelPesanan } from '@/lib/nomor-pesanan';
import {
  bayarLanjutan,
  periksaKelayakanSesi,
  tenggatPelunasan,
  tenggatPelunasanLewat,
} from '@/lib/pembayaran';
import { prisma } from '@/lib/prisma';
import PaymentClient from './PaymentClient';

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: 'Pembayaran Otomatis',
  // Halaman ini berisi tagihan satu pembeli dan memuat alat bayar. Tidak ada
  // alasan ia diindeks, dan URL-nya memuat id pesanan.
  robots: { index: false, follow: false },
};

function waktuIndonesia(tanggal: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(tanggal);
}

/**
 * Tanpa jam. Tenggat pelunasan jatuh pada 23:59:59.999, dan menuliskannya
 * apa adanya ("3 Oktober 2026, 23.59") membuat pembeli mengira ada hitungan
 * menit yang harus dikejar — padahal yang berlaku adalah batas harinya.
 */
function tanggalIndonesia(tanggal: Date): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(tanggal);
}

export default async function PaymentPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  // Pembayaran hanya untuk pembeli. Tidak gunakan pengecualian admin seperti
  // halaman tracking; admin tidak boleh bisa membuka formulir kartu milik order
  // pelanggan atau menerima kunci Components lewat endpoint sesudah halaman ini.
  if (session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN') {
    notFound();
  }

  const { id } = await params;
  const pesanan = await prisma.booking.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      // Acuan tenggat pelunasan H-3. Bukan `installedAt` — lihat
      // `tenggatPelunasan` di `src/lib/pembayaran.ts`.
      startDate: true,
      billboard: {
        select: { title: true },
      },
      payments: {
        where: { status: PaymentStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          tujuan: true,
          jumlah: true,
        },
      },
    },
  });

  // Seragam dengan API: tidak membedakan pesanan tidak ada dari pesanan milik
  // orang lain. Ini mencegah ID pesanan menjadi oracle untuk pengguna asing.
  if (!pesanan) notFound();

  // Urutan `createdAt: 'asc'` di atas sama dengan `tagihanBerikutnya` di
  // `src/lib/sesi-pembayaran.ts`, jadi tagihan yang ditampilkan di sini adalah
  // tagihan yang benar-benar akan dibuatkan sesi oleh endpoint.
  const tagihan = pesanan.payments[0] ?? null;
  const sekarang = new Date();

  // Aturannya dibaca dari `src/lib/pembayaran.ts`, bukan ditulis ulang di sini.
  // Syarat lama (`status !== PENDING_PAYMENT` dan `expiresAt` wajib hidup)
  // menutup halaman ini bagi SETIAP pelunasan yang sah: pesanan yang sudah
  // dibayar DP tidak lagi `PENDING_PAYMENT`, dan `expiresAt`-nya — tenggat 24
  // jam waktu pesanan masih baru — sudah lewat.
  const kelayakan = tagihan
    ? periksaKelayakanSesi({
        statusPesanan: pesanan.status,
        tujuanTagihan: tagihan.tujuan,
        tenggatPesanan: pesanan.expiresAt,
        sekarang,
      })
    : null;

  if (!tagihan || !kelayakan?.boleh) {
    return (
      <div className="bg-gray-50 min-h-screen pb-20 font-sans">
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 pt-24">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-utero mb-6 font-bold text-sm transition"
          >
            <ArrowLeft size={16} /> Kembali ke Dashboard
          </Link>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-xl">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-5">
              <AlertCircle className="text-amber-600" size={23} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Pembayaran belum dapat dibuka
            </h1>
            {/* Alasannya diambil dari `periksaKelayakanSesi` supaya halaman ini
                dan endpoint sesi menyebut sebab yang sama; tanpa tagihan sama
                sekali tidak ada alasan untuk dibaca. */}
            <p className="text-sm text-gray-600 leading-relaxed">
              {kelayakan?.boleh === false
                ? kelayakan.pesan
                : 'Pesanan ini tidak memiliki tagihan yang menunggu pembayaran.'}{' '}
              Buka Dashboard untuk melihat status terbaru.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Satu pesanan bisa punya beberapa tagihan sepanjang hidupnya, jadi judulnya
  // menyebut tagihan mana yang sedang dibuka. "Selesaikan tagihan pesanan"
  // benar untuk semuanya dan karena itu tidak memberi tahu apa pun.
  const judulTagihan =
    tagihan.tujuan === PaymentTujuan.PELUNASAN
      ? 'Lunasi sisa pembayaran'
      : tagihan.tujuan === PaymentTujuan.TAMBAHAN
        ? 'Bayar biaya tambahan'
        : 'Selesaikan tagihan pesanan';

  const badgeTenggat = bayarLanjutan(tagihan.tujuan)
    ? tenggatPelunasanLewat(pesanan.startDate, sekarang)
      ? {
          label: 'Terlambat sejak',
          waktu: tanggalIndonesia(tenggatPelunasan(pesanan.startDate)),
          nada: 'merah' as const,
        }
      : {
          label: 'Lunasi paling lambat',
          waktu: tanggalIndonesia(tenggatPelunasan(pesanan.startDate)),
          nada: 'kuning' as const,
        }
    : pesanan.expiresAt
      ? {
          label: 'Selesaikan sebelum',
          waktu: waktuIndonesia(pesanan.expiresAt),
          nada: 'merah' as const,
        }
      : null;

  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 pt-24">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-utero mb-6 font-bold text-sm transition"
        >
          <ArrowLeft size={16} /> Kembali ke Dashboard
        </Link>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 border-b border-gray-100 pb-6 mb-8">
            <div>
              <div className="flex items-center gap-2 text-utero mb-2">
                <CreditCard size={18} />
                <span className="text-sm font-bold">Pembayaran Otomatis</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{judulTagihan}</h1>
              <p className="text-sm text-gray-500">
                {pesanan.billboard?.title ?? `Pesanan ${labelPesanan(pesanan.id)}`}
              </p>
            </div>

            {/* Tenggat yang ditampilkan mengikuti tujuan tagihan, karena yang
                berlaku pada keduanya memang tenggat yang berbeda:

                - `DP`/`FULL` dibatasi `Booking.expiresAt` — 24 jam, dan
                  melewatinya berarti slot tanggal dilepas ke pembeli lain.
                - `PELUNASAN`/`TAMBAHAN` dibatasi H-3 sebelum tayang, dan
                  melewatinya TIDAK memblokir pembayaran (keputusan fase ini):
                  uangnya tetap dibutuhkan untuk mencetak dan memasang, jadi
                  menolaknya hanya membuat pesanan mandek tanpa jalan keluar.
                  Yang berubah hanya nada peringatannya. */}
            {badgeTenggat && (
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm md:text-right ${
                  badgeTenggat.nada === 'merah'
                    ? 'border-red-100 bg-red-50 text-red-700'
                    : 'border-amber-100 bg-amber-50 text-amber-800'
                }`}
              >
                <CalendarClock size={17} className="shrink-0" />
                <span>
                  {badgeTenggat.label}
                  <br />
                  <strong>{badgeTenggat.waktu}</strong>
                </span>
              </div>
            )}
          </div>

          <PaymentClient
            bookingId={pesanan.id}
            tagihan={{
              tujuan: tagihan.tujuan,
              jumlah: uangUntukClient(tagihan.jumlah),
            }}
          />
        </div>
      </main>
    </div>
  );
}
