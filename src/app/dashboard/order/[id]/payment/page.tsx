// src/app/dashboard/order/[id]/payment/page.tsx
//
// Gerbang server sebelum kunci Components boleh dikirim lewat endpoint browser.
//
// Pemeriksaan di endpoint tetap wajib karena halaman ini bisa dilewati dengan
// memanggil URL API langsung. Sebaliknya, pemeriksaan di sini membuat admin dan
// pemilik yang bukan pemesan tidak pernah menerima HTML halaman pembayaran.

import { BookingStatus, PaymentStatus } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
import { notFound, redirect } from 'next/navigation';
import { AlertCircle, ArrowLeft, CalendarClock, CreditCard } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { authOptions } from '@/lib/auth';
import { uangUntukClient } from '@/lib/money';
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

  const tagihan = pesanan.payments[0] ?? null;
  const sekarang = new Date();
  const tidakLayak =
    pesanan.status !== BookingStatus.PENDING_PAYMENT ||
    !tagihan ||
    pesanan.expiresAt === null ||
    pesanan.expiresAt.getTime() <= sekarang.getTime();

  if (tidakLayak) {
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
            <p className="text-sm text-gray-600 leading-relaxed">
              Pesanan ini tidak memiliki tagihan aktif atau tenggat pembayarannya
              sudah lewat. Buka Dashboard untuk melihat status terbaru.
            </p>
          </div>
        </main>
      </div>
    );
  }

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
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Selesaikan tagihan pesanan
              </h1>
              <p className="text-sm text-gray-500">
                {pesanan.billboard?.title ?? `Pesanan #${pesanan.id.slice(-8).toUpperCase()}`}
              </p>
            </div>

            {pesanan.expiresAt && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm md:text-right">
                <CalendarClock size={17} className="shrink-0" />
                <span>
                  Selesaikan sebelum<br />
                  <strong>{waktuIndonesia(pesanan.expiresAt)}</strong>
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
